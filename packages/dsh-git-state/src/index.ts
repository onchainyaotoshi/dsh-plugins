/**
 * dsh-git-state — host half.
 * Satu route HTTP exact di ctx.webServer:
 *   GET /plugins/dsh-git-state/api/state → status git tiap workspace terdaftar.
 *
 * Hanya perintah READ-ONLY (rev-parse, status --porcelain, stash list,
 * worktree list, gh pr list) — selalu `git -C <path workspace terdaftar>`.
 * Path TIDAK PERNAH datang dari client; client hanya mengirim id workspace.
 * Route ini tidak ikut pagar /api (method PRIVILEGED), jadi containment
 * workspaceRegistry adalah satu-satunya pagar antara browser dan proses host
 * (warisan wajib dari dsh-file-explorer).
 *
 * Caching: memo per path workspace (TTL 5 dtk) supaya poll client (30 dtk)
 * tidak membanjiri git.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ShellExecRequest } from '@deepseek-ai/dsh-shell'

export const name = 'git-state-host'
export const inject = ['webServer', 'shell', 'workspaceRegistry', 'fs']

const API_PREFIX = '/plugins/dsh-git-state/api'
const CMD_TIMEOUT_MS = 6000
const STDOUT_MAX_BYTES = 256 * 1024
const MAX_FILES = 200
const MAX_STASHES = 30
const MAX_WORKTREES = 20
const MAX_PRS = 20
const MEMO_TTL_MS = 5000

/* ---------- wire types (cocok dengan browser half) ---------- */
interface ChangeFile { code: string; path: string }
interface Changes {
  staged: number; unstaged: number; untracked: number; conflicted: number
  total: number; files: ChangeFile[]
}
interface StashEntry { ref: string; message: string }
interface WorktreeInfo { path: string; branch: string | null; dirty: boolean; current: boolean }
interface PrInfo { number: number; title: string; head: string; url: string }
interface GitState {
  branch: string; detached: boolean; headSha: string
  upstream: string | null; ahead: number; behind: number
  changes: Changes; stashes: StashEntry[]; worktrees: WorktreeInfo[]; prs: PrInfo[] | null
}
interface WorkspaceState { id: string; title: string; path: string; repo: GitState | null; error?: string }

/* ---------- util HTTP ---------- */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.end(JSON.stringify(body))
}

function sendError(res: ServerResponse, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  sendJson(res, 500, { error: 'internal-error', detail: msg })
}

/* ---------- util shell ---------- */
function quoteShell(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

interface RunOutcome { ok: boolean; text: string; err: string }

async function runCmd(ctx: Context, workdir: string, command: string): Promise<RunOutcome> {
  const req: ShellExecRequest = {
    command,
    workdir,
    timeoutMs: CMD_TIMEOUT_MS,
    stdoutMaxBytes: STDOUT_MAX_BYTES,
  }
  const spec = ctx.shell.resolve(req)
  const result = await ctx.shell.run(spec)
  return {
    ok: result.exitCode === 0 && !result.timedOut && !result.aborted,
    text: result.stdout.text,
    err: result.stderr.text,
  }
}

function gitCmd(workdir: string, args: string): string {
  return 'git -C ' + quoteShell(workdir) + ' ' + args
}

/* ---------- parser ---------- */
function zeroChanges(): Changes {
  return { staged: 0, unstaged: 0, untracked: 0, conflicted: 0, total: 0, files: [] }
}

/** Porcelain v1: `XY PATH` — X kolom index, Y kolom worktree. */
function parseStatus(text: string): Changes {
  const out = zeroChanges()
  for (const line of text.split('\n')) {
    if (line.length < 4) continue
    const x = line[0]
    const y = line[1]
    const rawPath = line.slice(3)
    // Rename: `XY old -> new` — tampilkan tujuan saja.
    const path = rawPath.includes(' -> ') ? rawPath.split(' -> ')[1] : rawPath
    if (x === '?' && y === '?') out.untracked++
    else if ('AUD'.includes(x) && 'AUD'.includes(y) && !(x === ' ' || y === ' ')) out.conflicted++
    else {
      if (x !== ' ' && x !== '?') out.staged++
      if (y !== ' ' && y !== '?') out.unstaged++
    }
    if (out.files.length < MAX_FILES) out.files.push({ code: x + y, path })
  }
  out.total = out.staged + out.unstaged + out.untracked + out.conflicted
  return out
}

function parseStashes(text: string): StashEntry[] {
  const out: StashEntry[] = []
  for (const line of text.split('\n')) {
    if (!line.startsWith('stash@{')) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    out.push({ ref: line.slice(0, colon), message: line.slice(colon + 1).trim() })
    if (out.length >= MAX_STASHES) break
  }
  return out
}

/**
 * Porcelain `git worktree list`: blok dipisah baris kosong; blok pertama =
 * checkout utama (current). `branch refs/heads/x` atau `detached`.
 */
function parseWorktrees(text: string, mainBranch: string, mainDirty: boolean): WorktreeInfo[] {
  const blocks: string[][] = []
  let cur: string[] = []
  for (const line of text.split('\n')) {
    if (line === '') { if (cur.length) blocks.push(cur); cur = [] } else cur.push(line)
  }
  if (cur.length) blocks.push(cur)

  const out: WorktreeInfo[] = []
  for (let i = 0; i < blocks.length && out.length < MAX_WORKTREES; i++) {
    const b = blocks[i]
    const wtLine = b.find((l) => l.startsWith('worktree '))
    if (!wtLine) continue
    const branchLine = b.find((l) => l.startsWith('branch '))
    const detached = b.includes('detached')
    const isMain = i === 0
    let branch: string | null
    if (branchLine) branch = branchLine.slice('branch '.length).replace(/^refs\/heads\//, '')
    else if (detached) branch = null
    else branch = isMain ? mainBranch : null
    out.push({ path: wtLine.slice('worktree '.length), branch, dirty: isMain ? mainDirty : false, current: isMain })
  }
  return out
}

/* ---------- kolektor per workspace ---------- */
async function collectWorkspace(ctx: Context, id: string, title: string, path: string): Promise<WorkspaceState> {
  const base = { id, title, path }
  try {
    const probe = await runCmd(ctx, path, gitCmd(path, 'rev-parse --is-inside-work-tree'))
    if (!probe.ok) {
      const notRepo = /not a git repository/i.test(probe.err)
      return { ...base, repo: null, ...(notRepo ? {} : { error: probe.err.trim() || 'git probe gagal' }) }
    }

    const br = await runCmd(ctx, path, gitCmd(path, 'rev-parse --abbrev-ref HEAD'))
    const detached = br.ok && br.text.trim() === 'HEAD'
    const branch = detached || !br.ok ? '' : br.text.trim()
    const shaRes = await runCmd(ctx, path, gitCmd(path, 'rev-parse --short HEAD'))
    const headSha = shaRes.ok ? shaRes.text.trim() : ''

    let upstream: string | null = null
    let ahead = 0
    let behind = 0
    const up = await runCmd(ctx, path, gitCmd(path, "rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'"))
    if (up.ok && up.text.trim() !== '') {
      upstream = up.text.trim()
      const cnt = await runCmd(ctx, path, gitCmd(path, 'rev-list --left-right --count ' + quoteShell(upstream) + '...HEAD'))
      if (cnt.ok) {
        // kiri = komit hanya di upstream (behind), kanan = hanya di HEAD (ahead)
        const [l, r] = cnt.text.trim().split(/\s+/).map(Number)
        behind = Number.isFinite(l) ? l : 0
        ahead = Number.isFinite(r) ? r : 0
      }
    }

    const st = await runCmd(ctx, path, gitCmd(path, 'status --porcelain=v1'))
    const changes = st.ok ? parseStatus(st.text) : zeroChanges()

    const stl = await runCmd(ctx, path, gitCmd(path, 'stash list'))
    const stashes = parseStashes(stl.ok ? stl.text : '')

    const wt = await runCmd(ctx, path, gitCmd(path, 'worktree list --porcelain'))
    const worktrees = wt.ok ? parseWorktrees(wt.text, branch, changes.total > 0) : []

    // Dirty per worktree non-utama (paralel, dibatasi cap).
    await Promise.all(
      worktrees
        .filter((w) => !w.current)
        .map(async (w) => {
          const d = await runCmd(ctx, w.path, gitCmd(w.path, 'status --porcelain=v1'))
          w.dirty = d.ok && d.text.trim() !== ''
        }),
    )

    // PR open via gh (best-effort; absen/tanpa auth → null, chip disembunyikan).
    let prs: PrInfo[] | null = null
    const pr = await runCmd(ctx, path, 'gh pr list --state open --json number,title,headRefName,url --limit 100')
    if (pr.ok) {
      try {
        const arr = JSON.parse(pr.text) as Array<{ number: number; title: string; headRefName: string; url: string }>
        prs = arr.slice(0, MAX_PRS).map((p) => ({ number: p.number, title: p.title, head: p.headRefName, url: p.url }))
      } catch { prs = null }
    }

    return {
      ...base,
      repo: {
        branch, detached, headSha, upstream, ahead, behind,
        changes, stashes, worktrees, prs,
      },
    }
  } catch (err) {
    return { ...base, repo: null, error: err instanceof Error ? err.message : String(err) }
  }
}

/* ---------- memo (TTL) ---------- */
const memo = new Map<string, { at: number; value: WorkspaceState }>()

async function stateFor(ctx: Context, id: string, title: string, path: string): Promise<WorkspaceState> {
  const hit = memo.get(path)
  if (hit && Date.now() - hit.at < MEMO_TTL_MS) return hit.value
  const value = await collectWorkspace(ctx, id, title, path)
  memo.set(path, { at: Date.now(), value })
  return value
}

/* ---------- registrasi ---------- */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/state',
    handler: async (_req: IncomingMessage, res: ServerResponse) => {
      try {
        const workspaces = ctx.workspaceRegistry.list()
        const states = await Promise.all(workspaces.map((w) => stateFor(ctx, String(w.id), w.title, w.path)))
        sendJson(res, 200, { workspaces: states })
      } catch (err) {
        sendError(res, err)
      }
    },
  }))
}

/**
 * dsh-git-state - host half.
 * Satu route HTTP exact di ctx.webServer:
 *   GET /plugins/dsh-git-state/api/state[?session=<id>] → status git tiap
 *   workspace terdaftar + deteksi worktree yang sedang dikerjakan.
 *
 * Hanya perintah READ-ONLY (rev-parse, status --porcelain, stash list,
 * worktree list, gh pr list) - selalu `git -C <path workspace terdaftar>`.
 * Path TIDAK PERNAH datang dari client; client hanya mengirim id workspace
 * (dan id sesi untuk deteksi aktivitas). Route ini tidak ikut pagar /api
 * (method PRIVILEGED), jadi containment workspaceRegistry adalah satu-satunya
 * pagar antara browser dan proses host (warisan wajib dsh-file-explorer).
 *
 * Deteksi "worktree aktif" (pelajaran 18 Aug 2026 - `git worktree list`
 * TIDAK menandai checkout yang sedang dipakai; blok pertama SELALU checkout
 * utama):
 *   1. riwayat workdir panggilan bash sesi (event tool/code-dispatch-start →
 *      data.arguments.workdir) - sinyal paling akurat untuk "di mana user
 *      kerja", dihitung per sesi (multi-tab aman);
 *   2. scan direktori /proc (readlink cwd tiap proses) - proses hidup
 *      (dev server dll) di dalam worktree.
 *
 * Caching: memo TTL 5 dtk (per-workspace repo state, scan /proc, riwayat
 * workdir per sesi) supaya poll client (30 dtk) tidak membanjiri git.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ShellExecRequest } from '@deepseek-ai/dsh-shell'
import { readdirSync, readlinkSync } from 'node:fs'

export const name = 'git-state-host'
export const inject = ['webServer', 'shell', 'workspaceRegistry', 'fs', 'sessions']

const API_PREFIX = '/plugins/dsh-git-state/api'
const CMD_TIMEOUT_MS = 6000
const STDOUT_MAX_BYTES = 256 * 1024
const MAX_FILES = 200
const MAX_STASHES = 30
const MAX_WORKTREES = 20
const MAX_PRS = 20
const MAX_WORKDIR_HITS = 20
const MAX_OTHER_SESSIONS = 8
const MEMO_TTL_MS = 5000

/* ---------- wire types (cocok dengan browser half) ---------- */
interface ChangeFile { code: string; path: string }
interface Changes {
  staged: number; unstaged: number; untracked: number; conflicted: number
  total: number; files: ChangeFile[]
}
interface StashEntry { ref: string; message: string }
interface WorktreeInfo {
  path: string; branch: string | null; headSha7: string; main: boolean
  changes: Changes; upstream: string | null; ahead: number; behind: number
  inUse: boolean
}
interface PrInfo { number: number; title: string; head: string; url: string }
interface GitState {
  branch: string; detached: boolean; headSha: string
  upstream: string | null; ahead: number; behind: number
  changes: Changes; stashes: StashEntry[]; worktrees: WorktreeInfo[]; prs: PrInfo[] | null
}
interface WorkspaceState {
  id: string; title: string; path: string
  repo: GitState | null; error?: string
  /** workdir bash sesi peminta (paling baru dulu) - client yang mencocokkan ke worktree. */
  sessionWorktrees?: string[]
  /** path worktree → id sesi lain yang riwayat bash-nya menunjuk ke sana. */
  otherSessionWorktrees?: Record<string, string[]>
}

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

/** Porcelain v1: `XY PATH` - X kolom index, Y kolom worktree. */
function parseStatus(text: string): Changes {
  const out = zeroChanges()
  for (const line of text.split('\n')) {
    if (line.length < 4) continue
    const x = line[0]
    const y = line[1]
    const rawPath = line.slice(3)
    // Rename: `XY old -> new` - tampilkan tujuan saja.
    const path = rawPath.includes(' -> ') ? rawPath.split(' -> ')[1] : rawPath
    if (x === '?' && y === '?') out.untracked++
    else if ('AUD'.includes(x) && 'AUD'.includes(y)) out.conflicted++
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
 * checkout UTAMA (selalu, dari mana pun dijalankan - git tidak menandai
 * checkout yang sedang dipakai). `branch refs/heads/x` atau `detached`.
 */
function parseWorktrees(text: string, mainBranch: string): WorktreeInfo[] {
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
    const headLine = b.find((l) => l.startsWith('HEAD '))
    const branchLine = b.find((l) => l.startsWith('branch '))
    const detached = b.includes('detached')
    const isMain = i === 0
    let branch: string | null
    if (branchLine) branch = branchLine.slice('branch '.length).replace(/^refs\/heads\//, '')
    else if (detached) branch = null
    else branch = isMain ? mainBranch : null
    out.push({
      path: wtLine.slice('worktree '.length),
      branch,
      headSha7: headLine ? headLine.slice('HEAD '.length, 'HEAD '.length + 7) : '',
      main: isMain,
      changes: zeroChanges(),
      upstream: null,
      ahead: 0,
      behind: 0,
      inUse: false,
    })
  }
  return out
}

/* ---------- scan /proc (proses hidup di dalam worktree) ---------- */
let procMemo: { at: number; cwds: string[] } | null = null

function procCwds(): string[] {
  if (procMemo && Date.now() - procMemo.at < MEMO_TTL_MS) return procMemo.cwds
  const cwds: string[] = []
  try {
    for (const name of readdirSync('/proc')) {
      if (!/^\d+$/.test(name)) continue
      try { cwds.push(readlinkSync('/proc/' + name + '/cwd')) } catch { /* proses lenyap */ }
    }
  } catch { /* /proc tak tersedia */ }
  procMemo = { at: Date.now(), cwds }
  return cwds
}

function insideDir(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir + '/')
}

/* ---------- riwayat workdir sesi (log bash) ---------- */
interface SessionQueryLike { readSession?(id: string): Promise<unknown> }
const workdirMemo = new Map<string, { at: number; workdirs: string[] }>()

/** Workdir panggilan bash satu sesi, paling baru dulu (leaf field saja). */
async function sessionWorkdirs(ctx: Context, sessionId: string): Promise<string[]> {
  if (sessionId === '') return []
  const hit = workdirMemo.get(sessionId)
  if (hit && Date.now() - hit.at < MEMO_TTL_MS) return hit.workdirs
  let workdirs: string[] = []
  try {
    const sq = ctx.get('sessionQuery') as SessionQueryLike | undefined
    const snap = (await sq?.readSession?.(sessionId)) as { events?: unknown[] } | undefined
    const events = snap?.events
    if (Array.isArray(events)) {
      for (let i = events.length - 1; i >= 0 && workdirs.length < MAX_WORKDIR_HITS; i--) {
        const e = events[i] as { type?: string; data?: { arguments?: { workdir?: string } } } | null
        if (e?.type !== 'tool/code-dispatch-start') continue
        const wd = e.data?.arguments?.workdir
        if (typeof wd === 'string' && wd !== '' && !workdirs.includes(wd)) workdirs.push(wd)
      }
    }
  } catch { /* degradasi halus: tanpa riwayat sesi */ }
  workdirMemo.set(sessionId, { at: Date.now(), workdirs })
  return workdirs
}

/* ---------- kolektor per workspace ---------- */
async function collectRepo(ctx: Context, id: string, title: string, path: string): Promise<WorkspaceState> {
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
    const worktrees = wt.ok ? parseWorktrees(wt.text, branch) : []
    const mainWt = worktrees.find((w) => w.main)
    if (mainWt) {
      mainWt.changes = changes
      mainWt.upstream = upstream
      mainWt.ahead = ahead
      mainWt.behind = behind
    }

    // Per worktree linked: status lengkap + upstream/ahead/behind (paralel, cap).
    await Promise.all(
      worktrees
        .filter((w) => !w.main)
        .map(async (w) => {
          const s = await runCmd(ctx, w.path, gitCmd(w.path, 'status --porcelain=v1'))
          w.changes = s.ok ? parseStatus(s.text) : zeroChanges()
          const wu = await runCmd(ctx, w.path, gitCmd(w.path, "rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'"))
          if (wu.ok && wu.text.trim() !== '') {
            w.upstream = wu.text.trim()
            const wc = await runCmd(ctx, w.path, gitCmd(w.path, 'rev-list --left-right --count ' + quoteShell(w.upstream) + '...HEAD'))
            if (wc.ok) {
              const [l, r] = wc.text.trim().split(/\s+/).map(Number)
              w.behind = Number.isFinite(l) ? l : 0
              w.ahead = Number.isFinite(r) ? r : 0
            }
          }
        }),
    )

    // Proses hidup (dev server, editor, dll) di dalam worktree.
    const cwds = procCwds()
    for (const w of worktrees) {
      w.inUse = cwds.some((c) => insideDir(c, w.path))
    }

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

async function repoStateFor(ctx: Context, id: string, title: string, path: string): Promise<WorkspaceState> {
  const hit = memo.get(path)
  if (hit && Date.now() - hit.at < MEMO_TTL_MS) return hit.value
  const value = await collectRepo(ctx, id, title, path)
  memo.set(path, { at: Date.now(), value })
  return value
}

/* ---------- registrasi ---------- */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/state',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const sessionId = url.searchParams.get('session') ?? ''

        // Riwayat bash sesi peminta (per tab) + sesi lain yang hidup.
        const ownWorkdirs = await sessionWorkdirs(ctx, sessionId)
        const otherBySession = new Map<string, string[]>()
        let scanned = 0
        for (const s of ctx.sessions.list()) {
          if (scanned >= MAX_OTHER_SESSIONS) break
          const sid = String(s.id)
          if (sid === sessionId) continue
          scanned++
          const wds = await sessionWorkdirs(ctx, sid)
          if (wds.length > 0) otherBySession.set(sid, wds)
        }

        const workspaces = ctx.workspaceRegistry.list()
        const states = await Promise.all(workspaces.map((w) => repoStateFor(ctx, String(w.id), w.title, w.path)))

        // Jangan memutasi objek memo (race antar request) - hasil akhir dibangun ulang.
        const finalStates = states.map((st) => {
          if (!st.repo) return st
          const other: Record<string, string[]> = {}
          for (const w of st.repo.worktrees) {
            const users: string[] = []
            for (const [sid, wds] of otherBySession) {
              if (wds.some((d) => insideDir(d, w.path))) users.push(sid)
            }
            if (users.length > 0) other[w.path] = users
          }
          return { ...st, sessionWorktrees: ownWorkdirs, otherSessionWorktrees: other }
        })

        sendJson(res, 200, { workspaces: finalStates })
      } catch (err) {
        sendError(res, err)
      }
    },
  }))
}

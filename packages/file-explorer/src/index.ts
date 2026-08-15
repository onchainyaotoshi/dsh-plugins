/**
 * dsh-file-explorer — host half.
 * Register 3 route HTTP exact di ctx.webServer:
 *   GET /plugins/dsh-file-explorer/api/workspaces  → daftar workspace terdaftar
 *   GET /plugins/dsh-file-explorer/api/list        → listing satu direktori
 *   GET /plugins/dsh-file-explorer/api/read        → isi satu file teks
 *
 * SECURITY BOUNDARY (jangan dilemahkan): semua akses file wajib berada di
 * dalam root workspace terdaftar (ctx.workspaceRegistry) dan lolos
 * ctx.fs.contains(root, target) — di luar itu 403. Route ini tidak ikut
 * pagar /api (method PRIVILEGED), jadi containment ini satu-satunya pagar
 * antara browser dan filesystem host.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'

export const name = 'file-explorer-host'
export const inject = ['webServer', 'fs', 'workspaceRegistry']

/** Batas ukuran file yang boleh dibaca panel (byte). */
const MAX_READ_BYTES = 512 * 1024

const API_PREFIX = '/plugins/dsh-file-explorer/api'

interface HttpError { status: number; error: string; detail?: string }

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function sendError(res: ServerResponse, err: unknown): void {
  const e = err as Partial<HttpError>
  sendJson(res, typeof e?.status === 'number' ? e.status : 500, {
    error: typeof e?.error === 'string' ? e.error : 'internal-error',
    detail: typeof e?.detail === 'string' ? e.detail : undefined,
  })
}

export function apply(ctx: Context): void {
  /**
   * Resolve root workspace + target file dengan containment check.
   * Semua path dari klien harus absolut; klien TIDAK pernah menggabung
   * segmen path sendiri — host menghitung path tiap entry di /list.
   */
  async function resolveInside(workspace: string, filePath: string) {
    const ws = ctx.workspaceRegistry.get(WorkspaceId(workspace))
    if (!ws) {
      throw { status: 404, error: 'workspace-not-found', detail: workspace } as HttpError
    }
    const abs = filePath || ws.path
    const root = await ctx.fs.resolve(ws.path, {})
    const target = await ctx.fs.resolve(abs, {})
    if (!ctx.fs.contains(root, target)) {
      throw { status: 403, error: 'outside-workspace', detail: abs } as HttpError
    }
    return { abs, target }
  }

  // --- workspaces ---
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/workspaces',
    handler: (_req: IncomingMessage, res: ServerResponse) => {
      sendJson(res, 200, ctx.workspaceRegistry.list().map((w) => ({
        id: String(w.id),
        title: w.title,
        path: w.path,
      })))
    },
  }))

  // --- list ---
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/list',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const workspace = url.searchParams.get('workspace')
        const path = url.searchParams.get('path')
        if (!workspace) throw { status: 400, error: 'missing-workspace' } as HttpError
        const { abs, target } = await resolveInside(workspace, path ?? '')
        const entries = await ctx.fs.listDir(target)
        sendJson(res, 200, {
          path: abs,
          entries: entries.map((e) => ({
            name: e.name,
            type: e.type,
            size: e.size,
            path: join(abs, e.name),
          })),
        })
      } catch (err) {
        sendError(res, err)
      }
    },
  }))

  // --- read ---
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: API_PREFIX + '/read',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const workspace = url.searchParams.get('workspace')
        const path = url.searchParams.get('path')
        if (!workspace) throw { status: 400, error: 'missing-workspace' } as HttpError
        if (!path) throw { status: 400, error: 'missing-path' } as HttpError
        const { target } = await resolveInside(workspace, path)
        const info = await ctx.fs.stat(target)
        if (!info) throw { status: 404, error: 'not-found', detail: path } as HttpError
        if (info.type !== 'file') throw { status: 400, error: 'not-a-file', detail: path } as HttpError
        if (info.size !== undefined && info.size > MAX_READ_BYTES) {
          throw { status: 413, error: 'file-too-large', detail: String(info.size) } as HttpError
        }
        const text = await ctx.fs.readText(target)
        sendJson(res, 200, { path, text })
      } catch (err) {
        sendError(res, err)
      }
    },
  }))
}

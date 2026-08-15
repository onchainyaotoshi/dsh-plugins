/**
 * dsh-file-explorer — browser half.
 * Dua entry slot:
 *   sidebar.footer.action → tombol toggle di kaki sidebar
 *   shell.overlay          → drawer kanan: workspace selector + tree + viewer
 *
 * Data lewat route HTTP host half (same-origin fetch), BUKAN RPC /api —
 * jadi plugin ini mandiri dari allowlist apiproxy. Keamanan di sisi host
 * (containment workspace).
 *
 * TODO(verify): bentuk persis ComposedProps slot (PropsRuntime dll) dicek
 * ulang saat runtime 0.1.0-rc.6 — sementara props komponen diketik longgar.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'file-explorer'
export const inject = ['slots']

const API = '/plugins/dsh-file-explorer/api'

/* ---------- tiny store: state buka/tutup panel (dipakai dua entry slot) ---------- */
// Auto-terbuka saat load supaya panel langsung terlihat; tombol 📁 di sidebar
// footer untuk toggle. Kalau mau default tertutup, ubah jadi false.
let panelOpen = true
const storeListeners = new Set<() => void>()
function togglePanel(): void {
  panelOpen = !panelOpen
  for (const listener of storeListeners) listener()
}
function subscribePanel(listener: () => void): () => void {
  storeListeners.add(listener)
  return () => { storeListeners.delete(listener) }
}
function usePanelOpen(): boolean {
  return useSyncExternalStore(subscribePanel, () => panelOpen)
}

/* ---------- wire types (cocok dengan host half) ---------- */
interface WorkspaceInfo { id: string; title: string; path: string }
interface FsEntry { name: string; type: 'file' | 'directory' | 'other'; size?: number; path: string }
interface ListResponse { path: string; entries: FsEntry[] }
interface ReadResponse { path: string; text: string }
interface ApiError { error?: string; detail?: string }

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const body = (await res.json().catch(() => null)) as (T & ApiError) | null
  if (!res.ok) {
    const msg = body?.error ? body.error + (body.detail ? ' (' + body.detail + ')' : '') : 'HTTP ' + res.status
    throw new Error(msg)
  }
  return body as T
}

function parentOf(path: string): string {
  if (path === '/') return '/'
  const idx = path.lastIndexOf('/')
  return idx <= 0 ? '/' : path.slice(0, idx)
}

/* ---------- panel ---------- */
const PANEL_STYLE: React.CSSProperties = {
  position: 'fixed', top: 0, right: 0, bottom: 0, width: 380,
  display: 'flex', flexDirection: 'column',
  background: 'var(--color-bg, #17181c)', color: 'var(--color-text, #e6e6e6)',
  borderLeft: '1px solid rgba(128,128,128,0.25)',
  boxShadow: '-8px 0 24px rgba(0,0,0,0.35)',
  pointerEvents: 'auto', zIndex: 1000, fontFamily: 'var(--font-mono, monospace)', fontSize: 13,
}

function FileExplorerPanel(_props: Record<string, unknown>): React.ReactElement | null {
  const open = usePanelOpen()
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
  const [workspaceId, setWorkspaceId] = useState<string>('')
  const [cwd, setCwd] = useState('')
  const [entries, setEntries] = useState<FsEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<{ path: string; text: string } | null>(null)

  useEffect(() => {
    getJson<WorkspaceInfo[]>(API + '/workspaces')
      .then((ws) => {
        setWorkspaces(ws)
        if (ws.length > 0) { setWorkspaceId(ws[0].id); setCwd(ws[0].path) }
      })
      .catch((err: Error) => setError(err.message))
  }, [])

  const load = useCallback(async (ws: string, path: string) => {
    try {
      setError(null)
      const data = await getJson<ListResponse>("" + API + '/list?workspace=' + encodeURIComponent(ws) + '&path=' + encodeURIComponent(path))
      setEntries(data.entries)
      setCwd(data.path)
    } catch (err) {
      setEntries([])
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    if (workspaceId && cwd) void load(workspaceId, cwd)
  }, [workspaceId, load])

  const openFile = useCallback(async (path: string) => {
    try {
      setError(null)
      const data = await getJson<ReadResponse>("" + API + '/read?workspace=' + encodeURIComponent(workspaceId) + '&path=' + encodeURIComponent(path))
      setViewing({ path, text: data.text })
    } catch (err) {
      setError((err as Error).message)
    }
  }, [workspaceId])

  if (!open) return null

  const dirs = (entries ?? []).filter((e) => e.type === 'directory')
  const files = (entries ?? []).filter((e) => e.type !== 'directory')

  return (
    <div style={PANEL_STYLE}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(128,128,128,0.2)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong style={{ fontSize: 13 }}>Files</strong>
        <select
          value={workspaceId}
          onChange={(e) => { const ws = workspaces.find((w) => w.id === e.target.value); if (ws) { setWorkspaceId(ws.id); setCwd(ws.path); setViewing(null) } }}
          style={{ flex: 1, background: 'rgba(255,255,255,0.06)', color: 'inherit', border: '1px solid rgba(128,128,128,0.3)', borderRadius: 4, padding: '3px 6px', minWidth: 0 }}
        >
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
        </select>
        <button onClick={togglePanel} title='Close' style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16 }}>×</button>
      </div>
      <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(128,128,128,0.15)', display: 'flex', gap: 6, alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        <button onClick={() => { setViewing(null); void load(workspaceId, parentOf(cwd)) }} title='Up' style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>↑</button>
        <span title={cwd} style={{ opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis' }}>{cwd}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {error && <div style={{ padding: '6px 12px', color: '#ff7b72' }}>{error}</div>}
        {entries === null && !error && <div style={{ padding: '6px 12px', opacity: 0.6 }}>Loading…</div>}
        {dirs.map((e) => (
          <div key={e.path} onClick={() => { setViewing(null); void load(workspaceId, e.path) }}
            style={{ padding: '3px 12px', cursor: 'pointer', display: 'flex', gap: 6 }}>
            <span style={{ opacity: 0.6 }}>📁</span><span>{e.name}</span>
          </div>
        ))}
        {files.map((e) => (
          <div key={e.path} onClick={() => void openFile(e.path)}
            style={{ padding: '3px 12px', cursor: 'pointer', display: 'flex', gap: 6 }}>
            <span style={{ opacity: 0.6 }}>📄</span><span>{e.name}</span>
            {typeof e.size === 'number' && <span style={{ marginLeft: 'auto', opacity: 0.45, fontSize: 11 }}>{e.size}</span>}
          </div>
        ))}
        {entries !== null && entries.length === 0 && !error && <div style={{ padding: '6px 12px', opacity: 0.6 }}>(empty)</div>}
      </div>
      {viewing && (
        <div style={{ height: '45%', borderTop: '1px solid rgba(128,128,128,0.2)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '4px 12px', opacity: 0.7, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{viewing.path}</div>
          <pre style={{ flex: 1, margin: 0, overflow: 'auto', padding: '8px 12px', whiteSpace: 'pre', tabSize: 2 }}>{viewing.text}</pre>
        </div>
      )}
    </div>
  )
}

/* ---------- tombol di kaki sidebar ---------- */
function FilesFooterAction(props: { wide?: boolean }): React.ReactElement {
  return (
    <button
      onClick={togglePanel}
      title='File explorer'
      style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', fontSize: 13 }}
    >
      <span>📁</span>
      {props.wide ? <span>Files</span> : null}
    </button>
  )
}

/* ---------- registrasi ---------- */
export function apply(ctx: Context): void {
  // WAJIB lewat slots.inject: register langsung di apply bisa race dengan
  // deklarasi slot oleh ui-layout/ui-sidebar (error: slot is not declared).
  // Pattern resmi = ctx.slots.inject(slotName, () => ctx.slots.register(...))
  // — callback dijalankan begitu slot-nya terdeklarasi.
  const slots = ctx as unknown as {
    slots: {
      inject(slotName: string, callback: () => void): void
      register(spec: unknown, component: unknown): void
    }
  }
  // Slot ber-kind 'list' WAJIB options.id (identitas entry di ledger list).
  slots.slots.inject('shell.overlay', () => slots.slots.register(
    { name: 'shell.overlay', id: 'file-explorer-panel', inject: () => ({}) },
    FileExplorerPanel,
  ))
  slots.slots.inject('sidebar.footer.action', () => slots.slots.register(
    { name: 'sidebar.footer.action', id: 'file-explorer-toggle', inject: () => ({}) },
    FilesFooterAction,
  ))
}

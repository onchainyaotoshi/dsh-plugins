/**
 * dsh-copy-link-sesi — browser half.
 *
 * Deep-link: kalau URL halaman memuat `?session=<sessionId>` (link hasil menu
 * "Salin link" di baris sesi), buka sesi itu begitu terdaftar di daftar sesi,
 * lalu bersihkan parameter dari URL (one-shot — reload tidak melompat balik
 * ke sesi lama). Sesi yang tidak dikenal (link basi) diabaikan setelah batas
 * waktu. Tanpa slot, tanpa React — murni service `sessions` (dsh-client-
 * runtime) + DOM API.
 */
import type { Context } from '@deepseek-ai/cordis'

export const name = 'copy-link-sesi'
export const inject = ['sessions']

const PARAM = 'session'
const GIVE_UP_MS = 15_000

interface SessionsFace {
  open(id: string): void
  list: {
    subscribe(cb: () => void): () => void
    getSnapshot(): { ids?: readonly string[]; current?: string }
  }
}

export function apply(ctx: Context): void {
  const sessions = (ctx as unknown as { sessions?: SessionsFace }).sessions
  if (!sessions) return
  const target = new URLSearchParams(window.location.search).get(PARAM)
  if (!target) return

  let done = false
  let timer: number | undefined
  let unsub: (() => void) | undefined

  const finish = (): void => {
    if (done) return
    done = true
    if (timer !== undefined) window.clearTimeout(timer)
    unsub?.()
    const url = new URL(window.location.href)
    if (url.searchParams.get(PARAM) !== null) {
      url.searchParams.delete(PARAM)
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    }
  }

  const tryOpen = (): void => {
    const snap = sessions.list.getSnapshot()
    const ids = snap.ids ?? []
    if (snap.current === target || ids.includes(target)) {
      if (snap.current !== target) sessions.open(target)
      finish()
    }
  }

  unsub = sessions.list.subscribe(tryOpen)
  timer = window.setTimeout(finish, GIVE_UP_MS)
  tryOpen() // list sudah siap (baseline cepat) → langsung tanpa nunggu event
}

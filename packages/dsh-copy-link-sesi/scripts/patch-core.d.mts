// Deklarasi tipe untuk patch-core.mjs (plain JS) — dipakai TypeScript host half.
export const MARKER: string
export const OLD_ITEMS: string
export const NEW_ITEMS: string
export const OLD_SELECT: string
export const NEW_SELECT: string
export const STATUS: {
  INSTALLED: 'installed'
  APPLIED: 'applied'
  ANCHOR_MISSING: 'anchor-missing'
}
export interface PatchResult {
  status: 'installed' | 'applied' | 'anchor-missing'
  source: string
}
export function patchSource(source: string): PatchResult

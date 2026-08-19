/**
 * patch-core.mjs — sumber tunggal logika patch menu "Salin link" pada bundle
 * browser `@deepseek-ai/dsh-client-ui-workspace` milik instalasi global dsh.
 *
 * Dipakai oleh:
 * - scripts/apply-patch.mjs  → CLI manual (--check / pasang / target eksplisit)
 * - src/index.ts (host half) → auto-repair saat boot dsh: kalau patch hilang
 *   (biasanya karena dsh di-upgrade dan bundle diganti), host half memasang
 *   ulang sendiri; kalau anchor tidak cocok, warn loud.
 *
 * JANGAN duplikasi konstanta/logika ini di tempat lain — file ini satu-satunya
 * sumber kebenaran. Anchor-nya pakai indentasi TAB persis seperti bundle.
 */
export const MARKER = 'dsh-copy-link-sesi:menu'

// Anchor 1: ujung array sessionMenuItems (item archive + tutup array).
// Indentasi TAB persis seperti bundle (jangan diubah).
export const OLD_ITEMS = [
  '\t\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconArchiveOutline20, { size: 16 })',
  '\t\t\t\t}',
  '\t\t\t];',
].join('\n')

export const NEW_ITEMS = [
  '\t\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconArchiveOutline20, { size: 16 })',
  '\t\t\t\t},',
  '\t\t\t\t{',
  '\t\t\t\t\tid: "copy-link",',
  '\t\t\t\t\tlabel: "Salin link",',
  '\t\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLinkOutline16, {})',
  `\t\t\t\t} /* ${MARKER} */`,
  '\t\t\t];',
].join('\n')

// Anchor 2: handler onSelect menu sesi.
export const OLD_SELECT = '\t\t\t\t\t\t\t\tif (id === "archive") onArchive(node.id);'

export const NEW_SELECT = [
  OLD_SELECT,
  '',
  '\t\t\t\t\t\t\t\tif (id === "copy-link") {',
  '\t\t\t\t\t\t\t\t\tnavigator.clipboard?.writeText(location.origin + location.pathname + "?session=" + node.id)?.catch(() => {});',
  '\t\t\t\t\t\t\t\t}',
].join('\n')

export const STATUS = {
  INSTALLED: 'installed', // marker sudah ada — tidak ada yang perlu dilakukan
  APPLIED: 'applied', // anchor utuh, patch bisa dipasang (hasil ada di source hasil)
  ANCHOR_MISSING: 'anchor-missing', // marker hilang DAN anchor tidak cocok — versi bundle berubah
}

/**
 * Proses satu source bundle. Murni (tanpa IO): caller yang menulis file.
 * @param {string} source isi bundle
 * @returns {{ status: string, source: string }}
 */
export function patchSource(source) {
  if (source.includes(MARKER)) return { status: STATUS.INSTALLED, source }
  if (!source.includes(OLD_ITEMS) || !source.includes(OLD_SELECT)) {
    return { status: STATUS.ANCHOR_MISSING, source }
  }
  return {
    status: STATUS.APPLIED,
    source: source.replace(OLD_ITEMS, NEW_ITEMS).replace(OLD_SELECT, NEW_SELECT),
  }
}

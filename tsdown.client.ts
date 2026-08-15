/**
 * Preset build bersama untuk bundle client (browser half) plugin DSH.
 * Adaptasi dari packages/client/tsdown.client.ts di repo upstream
 * (deepseek-ai/deepseek-harness, branch master) — versi minimal untuk
 * monorepo mandiri tanpa sourcemap-rebase ke repo upstream.
 *
 * Outputnya closure-factory: bundle memanggil
 * window.__ModuleLoader__.load({ id, factory }) dan me-resolve eksternal
 * lewat parameter require (module table loader — tanpa global, tanpa import map).
 * Semua @deepseek-ai/* WAJIB external: purity gate bundle menolak inline
 * modul yang punya identitas runtime bersama.
 */
import { defineConfig } from 'tsdown'

/** Eksternal yang disediakan shell via require (platform seed + runtime). */
export const CLIENT_EXTERNALS: (string | RegExp)[] = [
  /^@deepseek-ai\//,
  /^react(\/|$)/,
  /^react-dom(\/|$)/,
]

/**
 * Config tsdown untuk satu bundle client plugin.
 * @param id - id plugin == nama paket, di-stamp ke __ModuleLoader__.load.
 */
export function clientBundle(id: string) {
  return defineConfig({
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    deps: { neverBundle: CLIENT_EXTERNALS },
    outExtension: () => ({ js: '.js' }),
    dts: false,
    clean: false,
    sourcemap: false,
    banner: { js: 'window.__ModuleLoader__.load({ id: ' + JSON.stringify(id) + ', factory: (require) => {' },
    footer: { js: '} });' },
  })
}

import { defineConfig } from 'tsdown'
import { CLIENT_EXTERNALS } from '../../tsdown.client.ts'

// Host half (Node): marker plugin + pemeriksa urutan komposisi.
// Tanpa host half, row tidak akan pernah masuk client roster
// (client-modules hanya memuat row yang host fiber-nya hidup).
const host = defineConfig({
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  deps: { neverBundle: [/^@deepseek-ai\//] },
  outExtension: () => ({ js: '.js' }),
  dts: true,
  clean: false,
})

// Browser half: bundle CJS closure-factory. Entry pakai index.ts (tanpa React),
// jadi config client ditulis inline mengikuti preset bersama tsdown.client.ts
// (banner/footer shim CJS WAJIB — lihat pelajaran di CLAUDE.md root repo).
const client = defineConfig({
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  deps: { neverBundle: CLIENT_EXTERNALS },
  outExtension: () => ({ js: '.js' }),
  dts: false,
  clean: false,
  sourcemap: false,
  banner: {
    js: 'window.__ModuleLoader__.load({ id: "dsh-tunnel-loopback", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
  },
  footer: { js: 'return module.exports; } });' },
})

export default [host, client]

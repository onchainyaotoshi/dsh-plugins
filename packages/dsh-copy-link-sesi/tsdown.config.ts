import { defineConfig } from 'tsdown'
import { clientBundle } from '../../tsdown.client.ts'

// Host half (Node): verifikasi patch menu "Salin link" (tanpa service/route baru).
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

// Browser half: bundle CJS terbungkus __ModuleLoader__ (preset bersama).
export default [host, clientBundle('dsh-copy-link-sesi')]

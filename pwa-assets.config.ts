import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// logo.svg is already a full-bleed charcoal square with the mark inside the
// maskable safe zone, so no extra padding anywhere.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#0E0D0B' } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#0E0D0B' } },
  },
  images: ['public/logo.svg'],
})

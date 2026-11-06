import { createClient } from '@supabase/supabase-js'

declare global {
  interface Window {
    // Laufzeit-Konfiguration: setzt server/index.mjs (Self-Hosting) in index.html ein.
    __ENV__?: Partial<Record<'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY', string>>
  }
}

// Laufzeitwerte haben Vorrang; sonst die beim Build eingebetteten (Vercel, `npm run dev`).
const runtime = window.__ENV__ ?? {}
const url = runtime.VITE_SUPABASE_URL || (import.meta.env.VITE_SUPABASE_URL as string | undefined)
const key = runtime.VITE_SUPABASE_ANON_KEY || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)

if (!url || !key) {
  throw new Error('VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY müssen gesetzt sein (siehe .env.example).')
}

export const supabase = createClient(url, key)

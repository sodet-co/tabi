// Único lugar que lee las variables de entorno (ver .env.example).
// 'local'    → todo se guarda en el navegador (sirve sin internet, para diseñar).
// 'supabase' → se guarda en Postgres, en la nube.
// El restaurante no se configura aquí: sale de la URL (/[slug] y /admin/[slug]).
export const CONFIG = {
  FUENTE: process.env.NEXT_PUBLIC_TABI_FUENTE === 'supabase' ? 'supabase' : 'local',

  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  SUPABASE_ANON: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
} as const;

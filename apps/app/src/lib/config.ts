// Único lugar que lee las variables de entorno (ver .env.example).
// 'local'    → todo se guarda en el navegador (sirve sin internet, para diseñar).
// 'supabase' → se guarda en Postgres, en la nube.
// El restaurante no se configura aquí: sale de la URL (/[slug] y /admin/[slug]).
export const CONFIG = {
  // Con Supabase configurado se usa la nube; sin él (un clon recién bajado), el navegador.
  FUENTE: process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'supabase' : 'local',

  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  SUPABASE_ANON: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
} as const;

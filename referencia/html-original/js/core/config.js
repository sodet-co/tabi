// Único archivo que tocas para cambiar de fuente de datos.
// 'local'    → todo se guarda en el navegador (sirve sin internet, para diseñar).
// 'supabase' → se guarda en Postgres, en la nube.
export const CONFIG = {
  FUENTE: 'local',

  SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON: 'TU-LLAVE-ANON',

  // Mientras Tabi atienda un restaurante por despliegue, este slug dice cuál.
  RESTAURANTE_SLUG: 'la-cocina-de-ana'
};

-- La carta de cada restaurante vive en app.tabi.co/<slug>. Las rutas fijas de la app
-- (admin, login…) ganan sobre el slug, así que un restaurante con ese slug quedaría
-- tapado. También se apartan nombres que la app va a necesitar pronto (registro, api…).
alter table public.restaurantes
  add constraint restaurantes_slug_no_reservado check (slug not in (
    'admin', 'api', 'app', 'auth', 'ayuda', 'bienvenida', 'carta', 'configuracion',
    'contacto', 'cuenta', 'login', 'logout', 'panel', 'precios', 'privacidad',
    'registro', 'salir', 'soporte', 'static', 'tabi', 'terminos', 'www'
  ));

-- La demo vive en la app en /demo (carta) y /admin/demo (panel), con datos de ejemplo
-- guardados en el navegador. Ningún restaurante de verdad puede tomar ese slug.
alter table public.restaurantes drop constraint restaurantes_slug_reservado;
alter table public.restaurantes add constraint restaurantes_slug_reservado check (slug not in (
  'admin', 'api', 'app', 'auth', 'ayuda', 'bienvenida', 'carta', 'cocina', 'configuracion',
  'contacto', 'cuenta', 'demo', 'equipo', 'login', 'logout', 'm', 'mesa', 'mesero', 'panel', 'precios',
  'privacidad', 'registro', 'salir', 'soporte', 'static', 'tabi', 'terminos', 'turno', 'www'
));

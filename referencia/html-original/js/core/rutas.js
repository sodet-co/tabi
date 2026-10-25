// Cada HTML declara <html data-base="."> o <html data-base=".."> para que los
// módulos puedan construir rutas sin importar en qué carpeta esté la página.
const BASE = document.documentElement.dataset.base || '.';

export const ruta = (relativa) => `${BASE}/${relativa.replace(/^\/+/, '')}`;

export const parametro = (nombre, porDefecto = '') =>
  new URLSearchParams(location.search).get(nombre) ?? porDefecto;

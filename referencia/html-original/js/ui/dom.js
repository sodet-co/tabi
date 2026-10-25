export const $ = (selector, raiz = document) => raiz.querySelector(selector);
export const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

// Escapa texto que viene del admin antes de meterlo en innerHTML.
export const esc = (valor) =>
  String(valor ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function pintar(contenedor, html) {
  if (contenedor) contenedor.innerHTML = html;
  return contenedor;
}

// Delegación: un solo listener por lista en vez de uno por tarjeta.
export function alClic(contenedor, selector, manejador) {
  contenedor.addEventListener('click', (evento) => {
    const objetivo = evento.target.closest(selector);
    if (objetivo && contenedor.contains(objetivo)) manejador(objetivo, evento);
  });
}

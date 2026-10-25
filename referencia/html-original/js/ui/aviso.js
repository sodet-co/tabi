let nodo;
let temporizador;

export function aviso(mensaje) {
  if (!nodo) {
    nodo = document.createElement('div');
    nodo.className = 'aviso';
    nodo.setAttribute('role', 'status');
    document.body.appendChild(nodo);
  }
  nodo.textContent = mensaje;
  nodo.classList.add('visible');
  clearTimeout(temporizador);
  temporizador = setTimeout(() => nodo.classList.remove('visible'), 1800);
}

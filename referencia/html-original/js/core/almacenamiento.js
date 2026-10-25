// Capa única sobre localStorage. Si el navegador lo bloquea (modo privado,
// iframe sin permisos) cae a memoria para que la app no se rompa.
const memoria = new Map();

let hayLocal = (() => {
  try {
    const prueba = '__tabi__';
    localStorage.setItem(prueba, '1');
    localStorage.removeItem(prueba);
    return true;
  } catch {
    return false;
  }
})();

export const almacen = {
  leer(clave, porDefecto = null) {
    try {
      const crudo = hayLocal ? localStorage.getItem(clave) : memoria.get(clave);
      return crudo == null ? porDefecto : JSON.parse(crudo);
    } catch {
      return porDefecto;
    }
  },
  escribir(clave, valor) {
    const crudo = JSON.stringify(valor);
    if (hayLocal) {
      try { localStorage.setItem(clave, crudo); } catch { hayLocal = false; memoria.set(clave, crudo); }
    } else {
      memoria.set(clave, crudo);
    }
    return valor;
  },
  borrar(clave) {
    if (hayLocal) localStorage.removeItem(clave); else memoria.delete(clave);
  }
};

export const CLAVES = {
  carta: 'tabi.carta',
  restaurante: 'tabi.restaurante',
  carrito: 'tabi.carrito',
  pedidos: 'tabi.pedidos'
};

// Capa única sobre localStorage. Si el navegador lo bloquea (modo privado,
// iframe sin permisos) cae a memoria para que la app no se rompa.
// En el servidor no hay localStorage: todo se comporta como memoria vacía.
const memoria = new Map<string, string>();

let hayLocal: boolean | null = null;

function usarLocal() {
  if (hayLocal === null) {
    try {
      const prueba = '__tabi__';
      localStorage.setItem(prueba, '1');
      localStorage.removeItem(prueba);
      hayLocal = true;
    } catch {
      hayLocal = false;
    }
  }
  return hayLocal;
}

export const almacen = {
  leer<T>(clave: string, porDefecto: T): T {
    try {
      const crudo = usarLocal() ? localStorage.getItem(clave) : memoria.get(clave);
      return crudo == null ? porDefecto : (JSON.parse(crudo) as T);
    } catch {
      return porDefecto;
    }
  },
  escribir<T>(clave: string, valor: T): T {
    const crudo = JSON.stringify(valor);
    if (usarLocal()) {
      try { localStorage.setItem(clave, crudo); } catch { hayLocal = false; memoria.set(clave, crudo); }
    } else {
      memoria.set(clave, crudo);
    }
    return valor;
  },
  borrar(clave: string) {
    if (usarLocal()) localStorage.removeItem(clave); else memoria.delete(clave);
  }
};

export const CLAVES = {
  carta: 'tabi.carta',
  restaurante: 'tabi.restaurante',
  carrito: 'tabi.carrito',
  pedidos: 'tabi.pedidos',
  sesion: 'tabi.sesion'
} as const;

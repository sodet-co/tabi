// Sesión de demostración: valida contra una lista local y guarda una marca en el navegador.
// Cuando exista backend, `iniciar()` pasa a ser una llamada al API y la marca la pone
// una cookie firmada por el servidor, no el cliente.
import { almacen } from './almacenamiento.js';
import { ruta } from './rutas.js';

const CLAVE = 'tabi.sesion';

const USUARIOS = [
  { correo: 'admin@tabi.co', clave: 'tabi123', nombre: 'Ana Restrepo', rol: 'Administrador' }
];

export const sesion = {
  async iniciar(correo, clave) {
    const usuario = USUARIOS.find(
      (u) => u.correo.toLowerCase() === String(correo).trim().toLowerCase() && u.clave === clave
    );
    if (!usuario) return null;
    const datos = { correo: usuario.correo, nombre: usuario.nombre, rol: usuario.rol, desde: Date.now() };
    almacen.escribir(CLAVE, datos);
    return datos;
  },

  usuario: () => almacen.leer(CLAVE),
  activa: async () => Boolean(almacen.leer(CLAVE)),
  cerrar: async () => almacen.borrar(CLAVE)
};

// Se llama al inicio de cada pantalla del panel.
export async function exigirSesion() {
  if (await sesion.activa()) return true;
  location.replace(ruta('login.html'));
  return false;
}

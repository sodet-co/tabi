// Sesión de demostración: entra sin credenciales con un usuario fijo y guarda una marca
// en el navegador. Sirve para navegar el flujo, no para proteger nada. El login real
// (correo + contraseña) es el de Supabase, en ./supabase.ts.
import { almacen, CLAVES } from '../almacenamiento';
import type { FuenteSesion, Usuario } from '../tipos';

const USUARIO_DEMO: Usuario = { correo: 'demo@tabi.co', nombre: 'Ana Restrepo', rol: 'Administrador' };

export const sesionLocal: FuenteSesion = {
  async iniciar() {
    almacen.escribir(CLAVES.sesion, { ...USUARIO_DEMO, desde: Date.now() });
    return USUARIO_DEMO;
  },

  usuario: () => almacen.leer<Usuario | null>(CLAVES.sesion, null),
  activa: async () => Boolean(almacen.leer(CLAVES.sesion, null)),
  cerrar: async () => almacen.borrar(CLAVES.sesion)
};

// Sesión contra Supabase Auth (correo + contraseña).
// La sesión la firma y la valida Supabase; el navegador solo guarda el token.
import { supabase } from '../datos/supabase.js';
import { ruta } from './rutas.js';

let usuarioActual = null;

const aUsuario = (usuario) => ({
  correo: usuario.email,
  nombre: usuario.user_metadata?.nombre || usuario.email,
  rol: usuario.user_metadata?.rol || 'Administrador'
});

export const sesion = {
  async iniciar(correo, clave) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(correo).trim(),
      password: clave
    });
    if (error) return null;
    usuarioActual = aUsuario(data.user);
    return usuarioActual;
  },

  async activa() {
    const { data } = await supabase.auth.getSession();
    if (data.session) usuarioActual = aUsuario(data.session.user);
    return Boolean(data.session);
  },

  // Sincrónico a propósito: lo usa el nav después de que exigirSesion() ya corrió.
  usuario: () => usuarioActual,

  async cerrar() {
    await supabase.auth.signOut();
    usuarioActual = null;
  }
};

export async function exigirSesion() {
  if (await sesion.activa()) return true;
  location.replace(ruta('login.html'));
  return false;
}

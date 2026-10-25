// Sesión contra Supabase Auth (correo + contraseña).
// La sesión la firma y la valida Supabase; el navegador solo guarda el token.
import type { User } from '@supabase/supabase-js';
import { supabase } from '../datos/cliente-supabase';
import type { FuenteSesion, Usuario } from '../tipos';

let usuarioActual: Usuario | null = null;

const aUsuario = (usuario: User): Usuario => ({
  correo: usuario.email ?? '',
  nombre: usuario.user_metadata?.nombre || usuario.email || '',
  rol: usuario.user_metadata?.rol || 'Administrador'
});

export const sesionSupabase: FuenteSesion = {
  async iniciar(correo, clave) {
    const { data, error } = await supabase().auth.signInWithPassword({
      email: String(correo).trim(),
      password: clave
    });
    if (error) return null;
    usuarioActual = aUsuario(data.user);
    return usuarioActual;
  },

  async activa() {
    const { data } = await supabase().auth.getSession();
    if (data.session) usuarioActual = aUsuario(data.session.user);
    return Boolean(data.session);
  },

  // Sincrónico a propósito: se lee después de que activa() ya corrió.
  usuario: () => usuarioActual,

  async cerrar() {
    await supabase().auth.signOut();
    usuarioActual = null;
  }
};

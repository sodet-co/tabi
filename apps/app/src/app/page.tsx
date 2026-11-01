import { redirect } from 'next/navigation';

// La raíz del producto no tiene contenido propio: el login decide a dónde va cada quien
// (un celular del equipo a iniciar turno, el administrador a su panel).
export default function Inicio() {
  redirect('/login');
}

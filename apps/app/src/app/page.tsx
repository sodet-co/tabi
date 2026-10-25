import { redirect } from 'next/navigation';

// La raíz del producto no tiene contenido propio: el panel decide si pide login.
export default function Inicio() {
  redirect('/admin');
}

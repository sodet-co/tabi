import type { ReactNode } from 'react';

const Envoltura = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const IconoMenu = () => <Envoltura><path d="M4 4h16v16H4z" /><path d="M8 8h8M8 12h5" /></Envoltura>;
export const IconoWhatsapp = () => (
  <Envoltura>
    <path d="M3 21l1.6-4.3A8.3 8.3 0 1 1 8 20.2L3 21z" />
    <path d="M9 9.5c.4 2.3 3.2 5.1 5.5 5.5l1-1.4 2 .8v1.8c-3.6.6-8.3-4.1-7.7-7.7h1.8l.8 2-1.4 1z" />
  </Envoltura>
);
export const IconoUbicacion = () => <Envoltura><path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></Envoltura>;
export const IconoVolver = () => <Envoltura><path d="M19 12H5M11 18l-6-6 6-6" /></Envoltura>;
export const IconoCarrito = () => (
  <Envoltura>
    <path d="M4 5h2l2.2 10.4a2 2 0 0 0 2 1.6h6.6a2 2 0 0 0 2-1.6L21 8H7" />
    <circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" />
  </Envoltura>
);
export const IconoHamburguesa = () => <Envoltura><path d="M4 7h16M4 12h16M4 17h16" /></Envoltura>;

// Único lugar que lee las variables de entorno (ver .env.example).
export const CONFIG = {
  // Dirección del producto (panel y carta). La landing solo enlaza hacia allá.
  APP_URL: (process.env.NEXT_PUBLIC_TABI_APP_URL || 'http://localhost:3001').replace(/\/+$/, ''),

  // Número comercial al que llega el formulario de contacto de la landing.
  WHATSAPP_VENTAS: process.env.NEXT_PUBLIC_TABI_WHATSAPP_VENTAS || '573001112233'
} as const;

// Enlace absoluto a una ruta del producto, p. ej. enApp('/login').
export const enApp = (ruta: string) => `${CONFIG.APP_URL}${ruta}`;

// Carta de ejemplo a la que llevan los botones de "Ver demo".
export const CARTA_DEMO = '/la-cocina-de-ana';

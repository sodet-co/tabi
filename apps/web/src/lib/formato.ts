export const soloTelefono = (texto: string | null | undefined) => String(texto || '').replace(/\D/g, '');

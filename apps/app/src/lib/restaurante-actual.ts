'use client';

// El restaurante activo sale del segmento [slug] de la URL, tanto en la carta
// (/la-cocina-de-ana) como en el panel (/admin/la-cocina-de-ana).
// Con cacheComponents el slug se conoce al llegar la visita: quien use estos hooks
// debe quedar dentro de un <Suspense> (los layouts de [slug] ya lo ponen).
import { useParams } from 'next/navigation';
import { datosDe } from './datos';

export const useSlug = () => useParams<{ slug: string }>().slug;

export const useFuente = () => datosDe(useSlug());

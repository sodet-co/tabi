# @tabi/app — producto

| Ruta | Qué es |
| --- | --- |
| `/login` | Acceso al panel |
| `/admin` | Elige restaurante (entra directo si el usuario administra uno solo) |
| `/admin/[slug]`, `/admin/[slug]/menu`, `/admin/[slug]/reportes`, `/admin/[slug]/configuracion` | Panel de un restaurante |
| `/[slug]`, `/[slug]/menu`, `/[slug]/menu/[seccion]`, `/[slug]/carrito` | Carta que abre el QR |

Varios restaurantes: el restaurante activo sale del `[slug]` de la URL (`src/lib/restaurante-actual.ts`)
y quién administra cuál está en la tabla `miembros`. Los slugs que chocan con rutas de la app
(`admin`, `login`…) están reservados en la base.

Con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` la app usa Supabase (esquema en
`/supabase`); sin ellas guarda todo en el navegador, solo con La Cocina de Ana, para diseñar sin internet. Toda la lectura y escritura
pasa por `src/lib/datos`.

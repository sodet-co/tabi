# @tabi/app — producto

| Ruta | Qué es |
| --- | --- |
| `/login` | Acceso al panel |
| `/admin`, `/admin/menu`, `/admin/reportes`, `/admin/configuracion` | Panel del restaurante |
| `/carta`, `/carta/menu`, `/carta/menu/[seccion]`, `/carta/carrito` | Carta que abre el QR |

La fuente de datos se elige con `NEXT_PUBLIC_TABI_FUENTE`: `local` (navegador, para la demo)
o `supabase` (esquema en `/supabase`). Toda la lectura y escritura pasa por `src/lib/datos`.

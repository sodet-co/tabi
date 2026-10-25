# Tabi

Carta digital para restaurantes: el cliente escanea el QR de la mesa, pide por WhatsApp
y el restaurante ve las ventas en un panel.

## Estructura (monorepo con npm workspaces)

```
apps/web/        Landing comercial (tabi.co) — puerto 3000
apps/app/        Producto: panel del restaurante + carta del cliente — puerto 3001
packages/ui/     Marca compartida (@tabi/ui): colores, estilos base, logo, íconos
supabase/        Base de datos: migraciones y datos de ejemplo
referencia/      Versión HTML original y logos fuente (solo consulta, no se despliega)
```

## Desarrollo

```
npm install                      # una vez, desde la raíz
cp apps/web/.env.example apps/web/.env.local
cp apps/app/.env.example apps/app/.env.local
npm run dev                      # levanta las dos: web en :3000 y app en :3001
npm run build                    # compila las dos apps
npm run lint
```

En modo demo (`NEXT_PUBLIC_TABI_FUENTE=local`) al panel se entra con el botón "Ingresar", sin credenciales.

## Base de datos

`supabase/migrations/20261022000000_esquema_inicial.sql` define el esquema multi-restaurante,
las políticas RLS y la función `crear_pedido` (recalcula el total con los precios de la base).
`supabase/seed.sql` carga "La Cocina de Ana" con su carta.

Con la CLI de Supabase: `supabase link` y luego `supabase db push`. Antes de aplicarlo a un
proyecto que ya tenga tablas, compáralo con lo que hay: la migración asume una base vacía.

## Marca

Los colores salen del logo (degradado `#E8232B` → `#EE4432` → `#F7813F`) y viven en
`packages/ui/estilos/tokens.css`. Tipografías: Poppins (títulos) e Inter (texto).

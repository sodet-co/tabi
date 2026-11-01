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

`supabase/migrations/20261031000000_esquema.sql` define todo el esquema. La mesa es la entidad
central: ambientes → mesas (con su código para QR/NFC) → ocupaciones (cada apertura de la mesa,
con su consecutivo por mesa y un código de 4 dígitos) → cuentas (particiones a, b, c…) → ítems.
Los pedidos de domicilio entran por la función `crear_pedido`, que recalcula precios en la base.
`supabase/migrations/20261031120000_equipo_y_turnos.sql` agrega el equipo (mesero, cocina, admin) con PIN
cifrado, los celulares vinculados y los turnos. Cada celular entra con una sesión anónima de
Supabase: hay que tener activado **Authentication → Sign In / Providers → Allow anonymous
sign-ins** en el proyecto. El celular se vincula una vez en `/equipo` con el código que genera el
panel en Equipo, y cada persona inicia turno con su PIN.
Cada mesa tiene un QR (y opcionalmente un NFC) que lleva a `/m/<código>`: el comensal ve la carta y,
con el código de 4 dígitos que le da el mesero, su cuenta y los botones para llamar al mesero o
pedir la cuenta. Los QR se imprimen desde el panel, en Mesas.
Quien inicia turno con rol cocina en `/equipo` ve la pantalla de cocina: una tarjeta por comanda
(cada vez que un mesero marcha), y cada plato pasa de por preparar a preparando y a listo. El mesero
ve lo listo en su sala y lo marca entregado. Las secciones marcadas en el Menú como "no pasa por
cocina" (las bebidas, en el seed) no le aparecen a la cocina.
`supabase/seed.sql` carga "La Cocina de Ana" con su carta y 16 mesas (salón y terraza). También crea un equipo de ejemplo:
Pedro (1111), Lucía (2222) y Cocina (3333).

Con la CLI de Supabase: `supabase link` y luego `supabase db push`. El esquema asume una base vacía.

## Marca

Los colores salen del logo (degradado `#E8232B` → `#EE4432` → `#F7813F`) y viven en
`packages/ui/estilos/tokens.css`. Tipografías: Poppins (títulos) e Inter (texto).

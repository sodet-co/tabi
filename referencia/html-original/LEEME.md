# Tabi — carta digital (HTML5 + CSS + JavaScript)

Tres zonas separadas, cada vista en su propio archivo HTML y lo compartido en módulos JS:

1. **Landing pública** (`index.html`) — qué es Tabi, funciones, cómo funciona y contacto.
2. **Acceso** (`login.html`) — entrada al panel. Demo: `admin@tabi.co` / `tabi123`.
3. **Panel** (`admin/`) — dashboard, menú, reportes y configuración. Protegido por sesión.
4. **Carta del cliente** (`carta/`) — lo que abre el QR de la mesa.

## Cómo levantarlo

Los módulos ES no funcionan con doble clic (`file://`), hace falta un servidor:

```
cd $HOME\Desktop\tabi
npx --yes serve .
```

- Landing: `http://localhost:3000/`
- Login: `http://localhost:3000/login.html`
- Panel: `http://localhost:3000/admin/` (redirige al login si no hay sesión)
- Carta: `http://localhost:3000/carta/`

## Estructura

```
index.html              Landing comercial
login.html              Acceso al panel
admin/                  index (dashboard), menu, reportes, configuracion
carta/                  index (inicio), menu (secciones), seccion, carrito

css/tokens.css          Colores, tipografías y medidas de la marca
css/base.css            Reset y tipografía
css/componentes.css     Botones, tarjetas, campos, contador, avisos
css/landing.css         Landing
css/auth.css            Login
css/cliente.css         Carta
css/admin.css           Panel

js/core/                Sin interfaz: almacenamiento, sesión, carrito, formato, rutas
js/datos/carta.js       Única puerta de entrada a los datos (funciones async)
js/datos/semilla.js     Restaurante, secciones, platos y pedidos de ejemplo
js/ui/                  Piezas visuales compartidas (cabecera, barra de carrito, iconos, avisos)
js/landing.js           Landing (menú móvil y formulario de contacto)
js/login.js             Acceso
js/cliente/             Un archivo por pantalla de la carta
js/admin/               Un archivo por pantalla del panel + gráficos SVG + guardia de sesión
```

## Cómo se conectan las vistas

- `data-base` en la etiqueta `<html>` dice a qué profundidad está la página (`.` o `..`). Todos
  los enlaces se arman con `ruta('carta/menu.html')`, siempre desde la raíz del proyecto.
- La sección viaja en la URL: `carta/seccion.html?s=brunch`.
- El carrito vive en `js/core/carrito.js`, se guarda en el navegador y cualquier vista se
  suscribe con `carrito.suscribir(fn)`.
- Cada pantalla del panel importa primero `js/admin/guardia.js`: si no hay sesión, redirige
  al login antes de pintar nada.
- Los datos salen siempre de `js/datos/carta.js`. Ya devuelven promesas, así que al conectar
  backend solo cambia el cuerpo de esas funciones.

## Qué cambiar antes de mostrarlo

- `js/landing.js` → `WHATSAPP_VENTAS`, el número comercial al que llega el formulario.
- `index.html` → datos de contacto (WhatsApp, correo, ciudad) y textos de la landing.
- `js/datos/semilla.js` → restaurante, secciones y platos de ejemplo.
- `assets/img/logo.svg` → tu archivo de logo definitivo.

## Lo que falta

- Autenticación real: hoy el usuario y la contraseña están en `js/core/sesion.js`, del lado
  del cliente. Sirve para navegar el flujo, no para proteger nada.
- Backend, multi-restaurante y subida de fotos.
- QR por mesa y token por mesa para que el pedido no sea anónimo.
- Estados de pedido editables desde el panel.
- Planes y precios en la landing (lo dejé fuera a propósito).

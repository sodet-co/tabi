// Mientras no haya fotos cargadas, genera una imagen de relleno con la inicial del plato.
// El color sale del nombre, así cada producto se ve distinto sin usar archivos.
const paleta = [
  ['#EFEBFC', '#5B3FD4'],
  ['#EAEDF6', '#1C2A55'],
  ['#FDF1E3', '#C98A1F'],
  ['#E7F5EF', '#1B9E6E'],
  ['#FBEBEB', '#CE4040']
];

function indice(texto) {
  let suma = 0;
  for (const caracter of String(texto)) suma += caracter.codePointAt(0);
  return suma % paleta.length;
}

export function fotoProducto(producto) {
  if (producto?.imagen) return producto.imagen;
  const [fondo, tinta] = paleta[indice(producto?.nombre || 'Tabi')];
  const inicial = (producto?.nombre || 'T').trim().charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150">
    <rect width="200" height="150" fill="${fondo}"/>
    <text x="100" y="98" text-anchor="middle" font-family="Outfit,sans-serif"
          font-size="72" font-weight="600" fill="${tinta}">${inicial}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

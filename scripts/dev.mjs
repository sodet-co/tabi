// Levanta la landing y el producto a la vez con un solo comando (`npm run dev`).
// Cada línea sale con el nombre de la app delante; Ctrl + C detiene las dos.
import { spawn } from 'node:child_process';

const APPS = [
  { nombre: 'web', espacio: '@tabi/web', url: 'http://localhost:3000' },
  { nombre: 'app', espacio: '@tabi/app', url: 'http://localhost:3001' }
];

const procesos = APPS.map(({ nombre, espacio, url }) => {
  console.log(`[${nombre}] ${url}`);
  // shell: true para que Windows encuentre npm.cmd.
  const hijo = spawn(`npm run dev -w ${espacio}`, { shell: true });
  const prefijar = (datos) => String(datos).split(/\r?\n/).filter(Boolean)
    .forEach((linea) => console.log(`[${nombre}] ${linea}`));
  hijo.stdout.on('data', prefijar);
  hijo.stderr.on('data', prefijar);
  hijo.on('exit', (codigo) => {
    console.log(`[${nombre}] terminó (código ${codigo})`);
    procesos.forEach((otro) => otro.kill());
    process.exit(codigo ?? 0);
  });
  return hijo;
});

process.on('SIGINT', () => procesos.forEach((hijo) => hijo.kill()));

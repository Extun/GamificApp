// Dónde está la API. Un único sitio, resuelto una sola vez.
//
// Esta línea vivía copiada literalmente en 18 archivos, y todas horneaban
// `http://localhost:3001` dentro del build. Eso hacía imposible usar la
// instalación offline desde otro dispositivo de la misma red: el `dist` que se
// construye en el equipo servidor lleva escrita la dirección con la que se
// construyó, así que el navegador de una tablet pedía la API a SU PROPIO
// localhost. La página cargaba bien y fallaba justo al iniciar sesión, que es
// el peor modo de fallo posible: parece que se rompió la base de datos.
//
// Orden de resolución:
//
//   1. Si `VITE_API_URL` está definida en el build, MANDA. Es lo que usa
//      producción (Vercel → Render) y quien quiera apuntar a otro servidor.
//   2. Si no, se deduce del origen desde el que se abrió la página: mismo
//      protocolo y mismo host, puerto 3001. Así el MISMO `dist` funciona en
//      `localhost`, en `192.168.1.50` y en cualquier IP que el router reparta
//      mañana, sin reconstruir nada.
//
// La regla 2 es la que permite que el equipo servidor cambie de IP sin romper
// la aplicación para el resto del aula. Ver `instalador/opciones.ps1`, que se
// encarga de la otra mitad del problema: mantener `CORS_ORIGIN` al día.
//
// El 3001 no es un número suelto: es el `PORT` por defecto de `server/.env` y
// el que fija el instalador (`instalador/comun.ps1` → `$script:PuertoBackend`).

const PUERTO_API_LOCAL = 3001;

function resolverApiUrl() {
    // Igual que hace el servidor con los orígenes permitidos (server.js), se
    // normaliza la barra final: `http://x/` y `http://x` deben ser lo mismo.
    const configurada = import.meta.env.VITE_API_URL;
    if (configurada) return configurada.replace(/\/$/, '');

    // Sin `window` (una prueba en Node, por ejemplo) no hay origen del que
    // deducir nada: se cae al valor de desarrollo de toda la vida.
    if (typeof window === 'undefined' || !window.location || !window.location.hostname) {
        return `http://localhost:${PUERTO_API_LOCAL}`;
    }

    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${PUERTO_API_LOCAL}`;
}

export const API_URL = resolverApiUrl();

// Página pública de descarga (gamificapp.com/descargar).
//
// Para qué existe: el docente o el revisor de la tesis tiene que poder usar
// GamificApp SIN internet y sin instalar nada en su equipo. El paquete ya
// existía (`instalador\empaquetar.ps1`) pero no había forma de conseguirlo:
// esta pantalla es esa forma.
//
// El archivo NO vive en Vercel: es un asset de la Release de GitHub, que
// admite adjuntos grandes y da una URL estable y versionada. `latest/download`
// resuelve siempre a la última publicada, así que publicar una versión nueva
// no obliga a tocar esta página.
//
// Identidad visual: reutiliza `login.css` (marca, burbujas de fondo y tarjeta).
// No introduce paleta ni formas nuevas.
import { Link } from 'react-router-dom';
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import BuildRoundedIcon from '@mui/icons-material/BuildRounded';
import './admin/login.css';
import './descargar.css';

const URL_DESCARGA = 'https://github.com/Extun/GamificApp/releases/latest/download/GamificApp.zip';

// Los tres puntos de entrada del paquete, en el orden en que se usan. Los
// nombres son EXACTAMENTE los de los archivos que viajan dentro del ZIP.
const PASOS = [
    {
        Icon: BuildRoundedIcon,
        archivo: 'Instalar GamificApp.cmd',
        titulo: 'Instalar',
        cuando: 'Una sola vez, la primera',
        texto: 'Comprueba el equipo, prepara la base de datos, crea las claves de acceso y deja la aplicación abierta en el navegador. Solo hace una pregunta: si quieres cargar datos de demostración —un docente, cuatro estudiantes y una actividad de cada juego— para probarla enseguida. Al terminar, las credenciales quedan en el archivo CREDENCIALES.txt, junto a los tres accesos.'
    },
    {
        Icon: PlayArrowRoundedIcon,
        archivo: 'Iniciar GamificApp.cmd',
        titulo: 'Iniciar',
        cuando: 'Cada día que quieras usarla',
        texto: 'Levanta la aplicación y abre el navegador. Si ya estaba en marcha, no duplica nada.'
    },
    {
        Icon: StopRoundedIcon,
        archivo: 'Detener GamificApp.cmd',
        titulo: 'Detener',
        cuando: 'Al terminar de trabajar',
        texto: 'Cierra ordenadamente la aplicación y la base de datos. Solo cierra lo que abrió GamificApp: no toca ningún otro programa del equipo.'
    }
];

export function DescargarApp() {
    return (
        <div className="login-page descargar-page">
            <div className="login-fondo" aria-hidden="true">
                <span className="login-burbuja login-burbuja-1" />
                <span className="login-burbuja login-burbuja-2" />
                <span className="login-burbuja login-burbuja-3" />
            </div>

            <main className="login-centro descargar-centro">
                <div className="login-brand">
                    <span className="login-brand-icon"><SchoolRoundedIcon /></span>
                    <span className="login-brand-nombre">GamificApp</span>
                </div>

                <div className="login-card descargar-card">
                    <header className="login-bienvenida">
                        <h1>GamificApp para usar sin internet</h1>
                        <p className="login-card-sub">
                            La misma aplicación que ves aquí, funcionando en tu propia computadora.
                            Sin cuentas, sin conexión y sin instalar nada en el sistema.
                        </p>
                    </header>

                    <a className="descargar-boton" href={URL_DESCARGA}>
                        <DownloadRoundedIcon />
                        <span className="descargar-boton-texto">
                            <strong>Descargar para Windows</strong>
                            <span>Archivo .zip · unos 247 MB</span>
                        </span>
                    </a>

                    <p className="descargar-nota">
                        La descarga puede tardar según tu conexión. Después de eso, GamificApp
                        funciona completamente sin internet.
                    </p>

                    <section className="descargar-seccion">
                        <h2>Cómo se usa</h2>
                        <p className="descargar-intro">
                            Descomprime el archivo en la carpeta que prefieras y verás estos tres
                            accesos. Se usan con doble clic, en este orden.
                        </p>
                        <ol className="descargar-pasos">
                            {PASOS.map(({ Icon, archivo, titulo, cuando, texto }, i) => (
                                <li key={archivo} className="descargar-paso">
                                    <span className="descargar-paso-num" aria-hidden="true">{i + 1}</span>
                                    <div className="descargar-paso-cuerpo">
                                        <h3>
                                            <Icon className="descargar-paso-icono" aria-hidden="true" />
                                            {titulo}
                                            <span className="descargar-paso-cuando">{cuando}</span>
                                        </h3>
                                        <code className="descargar-archivo">{archivo}</code>
                                        <p>{texto}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </section>

                    <section className="descargar-seccion">
                        <h2>Qué necesitas</h2>
                        <ul className="descargar-lista">
                            <li><strong>Windows 10 u 11</strong> de 64 bits.</li>
                            <li><strong>Unos 2 GB libres</strong> en disco (el paquete ocupa unos 750 MB una vez descomprimido).</li>
                            <li><strong>Nada más.</strong> El paquete trae su propio Node.js y su propia base de datos MySQL, que funcionan como programas normales: no se instalan servicios, no se toca el registro de Windows y <strong>no hacen falta permisos de administrador</strong>.</li>
                        </ul>
                    </section>

                    <section className="descargar-seccion">
                        <h2>Tus datos</h2>
                        <p className="descargar-intro">
                            Todo lo que se haga en la aplicación —cursos, estudiantes, actividades y
                            progreso— se guarda <strong>solo en tu computadora</strong>, en una carpeta
                            propia fuera del programa. Por eso el trabajo sobrevive a mover la carpeta
                            de GamificApp o a volver a instalarla, y por eso nada se envía a internet.
                        </p>
                        <p className="descargar-intro">
                            Para respaldarlo, detén GamificApp y copia la carpeta
                            {' '}<code className="descargar-archivo">%LOCALAPPDATA%\GamificApp</code>.
                            Dentro del paquete encontrarás <code className="descargar-archivo">LEEME.txt</code>
                            {' '}con estas mismas indicaciones.
                        </p>
                    </section>

                    <div className="login-links descargar-volver">
                        <Link className="login-link" to="/">← Volver a la versión en línea</Link>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default DescargarApp;

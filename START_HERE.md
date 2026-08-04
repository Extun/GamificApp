# START_HERE — Lectura obligatoria antes de modificar código

> Última actualización: 2026-07-29

Este archivo indica exactamente qué debe leer un desarrollador nuevo antes de tocar GamificApp, y cómo arrancar el proyecto en local. Leer **solo** lo que la tarea requiere.

## Lectura mínima (siempre, en este orden)

1. **`CONTRIBUTING.md`** (raíz) — reglas permanentes de trabajo.
2. **`docs/architecture/PROJECT_CONTEXT.md`** — qué es GamificApp, stack, arquitectura y principios, en una lectura.
3. **`docs/architecture/CURRENT_STATE.md`** — estado real del MVP, qué está implementado, prioridades inmediatas.

Con esos 3 documentos ya se puede trabajar. No leer nada más salvo que la tarea lo pida:

## Lectura según la tarea

| Si la tarea toca… | Leer además |
|---|---|
| Roadmap / decidir qué sigue | `docs/architecture/MASTER_PLAN.md` |
| Experiencia del estudiante (rediseño en curso) | `docs/audit/Auditoria-UX-Estudiante-v1.md` y `docs/specifications/SPEC-001-Student-Shell-Plan.md` |
| Visión de producto / principios UX de fondo | `docs/architecture/VISION.md` |
| Borrado / papelera de cualquier entidad | `docs/architecture/POLITICA-ELIMINACION.md` |
| Modelo de datos | `docs/architecture/MODELO-ENTIDAD-RELACION.md` |
| Añadir un tipo de juego nuevo | `docs/COMO-AGREGAR-UN-JUEGO.md` |

## Dónde está la verdad técnica

- **Rutas API**: `server/routes/` (auth, admin, docente, materias, materiales, retos, progreso, ranking, ia).
- **Esquema BD**: `database/gamificapp.sql` (dev) y `database/produccion_defaultdb.sql` (producción Aiven); los `.sql` de `database/migraciones/` son **referencia/versionado documental**, mientras que las migraciones que realmente se aplican en cada arranque son **funciones idempotentes de `server/initDb.js`** (ver `docs/architecture/MASTER_PLAN.md` §6). Escribir solo el `.sql` no aplica nada.
- **Servicios frontend**: `src/services/` (uno por dominio).
- **Componentes compartidos**: `src/components/dashboard/DashboardWidgets.jsx`, `src/components/archivos/`, etc.
- **Rutas del frontend y despliegue**: `src/App.jsx` define las 4 rutas (`/`, `/registro`, `/descargar`, `/dashboard`) y **`vercel.json` es lo que hace que el hosting las sirva**. Sin ese archivo, cualquier URL distinta de `/` devuelve el 404 de Vercel al recargar o al entrar directo. Los tres paneles se cargan con `React.lazy`.

Si un documento contradice al código, **el código es la fuente de verdad** — y hay que corregir el documento.

## Cómo correr el proyecto en local

**Requisitos reales** (verificados contra el código, no estimados):

| Requisito | Versión | Por qué |
|---|---|---|
| Node.js | **20.19+ (rama 20) o 22.12+ (rama 22 o superior)** | Lo impone Vite 8: `node_modules/vite/package.json` declara `engines.node = "^20.19.0 \|\| >=22.12.0"`. **Node 18 y 21 NO sirven**, ni las 22.0–22.11 |
| npm | el que trae Node | |
| MySQL | **8+** | El esquema usa índices funcionales (`uq_materia_nombre_activa`) que exigen MySQL 8. **En Windows con `Instalar GamificApp.cmd` no hace falta instalarlo**: la distribución trae MySQL 8.0.44 en `runtime/mysql` |

### Opción A (recomendada en Windows): instalación guiada

Cuatro archivos en la raíz del repositorio, pensados para doble clic:

| Archivo | Qué hace |
|---|---|
| `Instalar GamificApp.cmd` | Comprueba Node/npm/MySQL y los puertos, instala dependencias (`npm ci`), crea la base y carga el esquema, genera `server/.env` con credenciales aleatorias, construye el frontend, arranca todo y abre el navegador |
| `Iniciar GamificApp.cmd` | Arranque diario. Si ya está en marcha, no duplica procesos |
| `Detener GamificApp.cmd` | Cierra **solo** los procesos de GamificApp (por PID registrado, nunca `taskkill /IM node.exe`) |
| `Configurar GamificApp.cmd` | Enciende y apaga las dos opciones del equipo: acceso desde otros dispositivos de la red y arranque automático. No instala nada ni toca la base de datos |

Detalles importantes:

- **No instala nada en el sistema.** Si falta Node.js (o el instalado no cumple el requisito de Vite), descarga una copia portable **verificada por SHA-256** contra el `SHASUMS256.txt` oficial de nodejs.org y la deja en `runtime/node/` — sin `setx`, sin registro de Windows, sin servicios y sin permisos de administrador. La prioridad es siempre `runtime/node/node.exe` → Node del equipo si es compatible → descarga.
- **La base de datos también viene incluida** (Fase Local 2.2). Si existe `runtime/mysql`, el instalador arranca ese MySQL 8 como un **proceso de usuario** —sin servicio de Windows, sin Docker, sin MSI y sin permisos de administrador— con `bind-address=127.0.0.1`, `mysqlx=0` y `utf8mb4_spanish_ci`. **Puerto 3308**, con reserva **3309-3315** si está ocupado; **3306 y 3307 no se tocan nunca** (son los de un MySQL instalado y el del contenedor Docker de desarrollo), y un puerto ocupado por otro programa se salta sin cerrarlo. Si `runtime/mysql` **no** viene, se usa un MySQL 8 ya instalado en el equipo, como en la Fase Local 1.
- **Dónde viven los datos: `%LOCALAPPDATA%\GamificApp\`**, nunca dentro del proyecto.

  ```text
  %LOCALAPPDATA%\GamificApp\
    instancia.json          puerto, base y usuario — sin contraseñas ni JWT_SECRET
    mysql\datos\            el datadir: aquí está el trabajo de la escuela
    mysql\my.ini            lo regenera el instalador; no editar a mano
    mysql\error.log         diagnóstico de MySQL
    secretos\root.txt       credencial administrativa, con permisos restringidos
  ```

  `runtime/mysql` son **binarios reemplazables**; `%LOCALAPPDATA%\GamificApp\mysql\datos` es **permanente**. Por eso los datos sobreviven a `Detener`, a reinstalar y a **mover o reemplazar la carpeta de GamificApp**: si se pierde `server/.env`, el instalador reconstruye la conexión desde `instancia.json` + la credencial de root, **sin inicializar nada y sin borrar datos**. Ver la tabla de copias de seguridad más abajo.
- **El runtime de Visual C++ viaja con MySQL.** `mysqld.exe`, `mysql.exe`, `mysqladmin.exe` y `mysqldump.exe` importan de forma estática `vcruntime140.dll`, `vcruntime140_1.dll` y `msvcp140.dll` (leído de su tabla de importaciones PE, no supuesto). **Esas tres DLL no vienen con Windows**: las instala el *Microsoft Visual C++ Redistributable*, y sin ellas el proceso no arranca **y no queda rastro en ningún log de MySQL**, porque falla el cargador de Windows. Por eso se distribuyen **junto a los ejecutables**, dentro de `runtime\mysql\bin`: Windows busca primero en el directorio del `.exe`, así que se usan esas copias. **No se toca System32, ni el PATH, ni el registro, y no hacen falta permisos de administrador.** Las prepara `instalador\runtime.ps1` al empaquetar, verificando firma Authenticode de Microsoft y arquitectura x64; el instalador solo **comprueba** que llegaron (`Test-VcRuntimeMySql`) y aborta con un mensaje claro si faltan. *Contrapartida: una copia app-local no la actualiza Windows Update — si Microsoft publica un parche del runtime, hay que reemplazar esos archivos y volver a empaquetar.* Node no tiene este problema: `node.exe` y los binarios nativos de `node_modules` enlazan su CRT estáticamente.
- `Detener GamificApp.cmd` cierra la base de datos **en último lugar** y de forma ordenada (`mysqladmin shutdown`); nunca cierra un MySQL que no haya arrancado él.
- **Es seguro repetirlo**: en la segunda ejecución conserva `server/.env` tal cual (no regenera `JWT_SECRET` ni `ADMIN_PASSWORD`) y no toca los datos.
- Las credenciales generadas quedan en `CREDENCIALES.txt` (ignorado por Git). El `JWT_SECRET` no se muestra nunca.
- Los **datos de demostración son opcionales**: pregunta explícitamente y el valor por defecto es *No*. Solo se permiten sobre la base local `gamificapp_dev`, usando `server/scripts/seedDev.js` con sus barreras intactas.
- Registro de lo ocurrido en `logs/` (`instalador.log`, `iniciar.log`, `detener.log`, `configurar.log`, `backend.log`, `frontend.log`). Ningún log contiene credenciales.
- El frontend se sirve con `vite preview --strictPort` en el 5173: **no puede saltar al 5174**, porque el backend solo acepta el 5173 en `CORS_ORIGIN`.

### Las dos opciones del equipo (`instalador/opciones.ps1`)

El instalador las pregunta **una sola vez**, en la primera instalación, y el valor por defecto de las dos es **No** — misma norma que los datos de demostración: nada opcional ocurre por inercia. Después se cambian en `Configurar GamificApp.cmd`, sin reinstalar. La preferencia de red vive en `%LOCALAPPDATA%\GamificApp\preferencias.json` (junto a `instancia.json`, así que sobrevive a reinstalar y a mover la carpeta); del arranque automático **la fuente de verdad es la propia tarea de Windows**, no un archivo, para que borrarla desde el Programador de tareas no deje a GamificApp mintiendo.

**1 · Acceso desde otros dispositivos de la red.** Este equipo hace de servidor y el resto entra por navegador, sin instalar nada. Implica tres cosas a la vez, y las tres hacen falta:

| Pieza | Qué hace | Dónde |
|---|---|---|
| `vite preview --host 0.0.0.0` | Sin `--host`, Vite **solo escucha en localhost** y ningún otro dispositivo conecta, ni con el firewall abierto | `Iniciar-Frontend` en `instalador/comun.ps1` |
| `CORS_ORIGIN` con la IP de hoy | Se revisa **en cada arranque**: si el DHCP repartió otra dirección se reescribe y **se reinicia el backend**, que lee esa variable una sola vez | `Sincronizar-CorsOrigin` |
| Regla de firewall | Puertos 3001 y 5173, perfiles **Private y Domain, nunca Public**. Es lo único que pide permisos de administrador; si no los hay se imprime el comando exacto | `Asegurar-ReglaFirewall` |

**La IP del servidor no se fija ni se hornea.** `src/services/apiBase.js` deduce la dirección de la API del origen desde el que se abrió la página, así que el **mismo `dist` funciona con cualquier IP** y el router puede repartir la que quiera. Por eso una reserva DHCP es cómoda pero **no es requisito**. La dirección del día se imprime al final de `Iniciar GamificApp.cmd`, la muestra `Configurar GamificApp.cmd` y queda anotada en `CREDENCIALES.txt`.

*Un `CORS_ORIGIN` escrito a mano no se pisa*: `Test-CorsGestionable` solo reconoce como suyos `http://localhost:5173` y una `IPv4:5173`; cualquier otra cosa se respeta y se avisa.

*Cuidado con el `.env` de la raíz*: es el único sitio que puede volver a romper esto, porque `VITE_API_URL` queda **horneada en `dist/`** al construir. Al activar la red local, `Revisar-EnvFrontend` comenta esa línea **solo si apunta a localhost**; si apunta a un servidor real (un despliegue en Render, por ejemplo) no la toca y avisa. En el paquete que se distribuye ese archivo **ni siquiera viaja**, así que esto solo afecta a quien instala desde una copia del repositorio.

*Límite que se dice en pantalla, no se esconde:* el tráfico va en **HTTP sin cifrar**. Vale para la red de un aula; no para una red pública.

**2 · Arranque automático.** Tarea programada **al iniciar sesión de este usuario**, con 30 s de retraso para que la red esté lista. Dos razones que no son de estilo para no usar una tarea «al iniciar el sistema»: registrarla no pediría permisos de administrador pero **correría como SYSTEM**, y entonces `%LOCALAPPDATA%` sería otra carpeta — MySQL arrancaría contra un datadir vacío y parecería que se perdió el trabajo de la escuela. La tarea invoca `iniciar.ps1 -SinNavegador`, **nunca el `.cmd`**: ese termina en `pause` y una tarea esperando una tecla se cuelga para siempre.

Ojo: «al iniciar sesión» **no** es «al encender». Para que baste con pulsar el botón hay que activar además el inicio de sesión automático de Windows, que deja el equipo desbloqueado — es decisión del usuario y GamificApp no lo toca.

### Copias de seguridad, reinstalar y mover GamificApp

| Quiero… | Qué hacer |
|---|---|
| **Respaldar el trabajo de la escuela** | Ejecuta `Detener GamificApp.cmd` y copia entera la carpeta `%LOCALAPPDATA%\GamificApp`. Ahí está el datadir, la credencial administrativa (`secretos\root.txt`) y `instancia.json`. Con GamificApp en marcha la copia puede salir inconsistente |
| **Restaurar un respaldo** | Con GamificApp detenida, sustituye `%LOCALAPPDATA%\GamificApp` por la copia y ejecuta `Instalar GamificApp.cmd`: detecta los datos y **no inicializa nada** |
| **Reinstalar sin perder información** | Vuelve a ejecutar `Instalar GamificApp.cmd`. Conserva `server/.env` intacto si existe, y si no existe lo **reconstruye** a partir de `instancia.json` + `secretos\root.txt` |
| **Mover o reemplazar la carpeta de GamificApp** | Cópiala o sustitúyela y ejecuta `Instalar GamificApp.cmd` en la nueva ubicación. Los datos no viven ahí dentro, así que sobreviven |
| **Empezar de cero a propósito** | Con GamificApp detenida, **mueve** (no borres, por si acaso) `%LOCALAPPDATA%\GamificApp` a otro sitio y reinstala. El instalador **nunca** borra un datadir existente por su cuenta |

### Preparar el paquete de entrega (Fase Local 2.3)

> **Dónde lo consigue el revisor:** el ZIP se publica como **asset de una Release de GitHub** del repositorio (`Extun/GamificApp`) y la página pública **`https://gamificapp.com/descargar`** lo enlaza con `releases/latest/download/GamificApp.zip`. Esa URL apunta siempre a la última Release, así que **publicar una versión nueva no obliga a tocar el frontend**: basta con adjuntar el ZIP con ese mismo nombre. El archivo no viaja en el despliegue de Vercel.

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File instalador\empaquetar.ps1
```

Genera `release\GamificApp\` (ignorado por Git). Opciones: `-Salida <ruta>` —recomendable si el repositorio está en una carpeta sincronizada con OneDrive—, `-Zip`, `-SaltarBuild` y `-SinDependencias`.

Con `-Zip` se obtiene además un `.zip` de **~244 MB** (desde 750,8 MB sin comprimir) en unos 6-7 minutos. Lo comprime el `tar.exe` de Windows (bsdtar, incluido desde Windows 10 1803) porque `System.IO.Compression` es impracticable con 61.000 entradas; si no estuviera, se usa .NET con compresión rápida.

**Qué viaja en el paquete** (~750 MB, ~61.000 archivos):

| Componente | Tamaño | Por qué está |
|---|---|---|
| `runtime\mysql` | ~399 MB | MySQL 8.0.44 portable, podado, con el runtime de Visual C++ app-local |
| `node_modules` + `server\node_modules` | ~252 MB | Para que **la instalación no necesite internet** |
| `runtime\node` | ~95 MB | Node v22.23.1 portable |
| `dist`, `src`, `public`, `server`, `database`, `instalador` | ~5 MB | La aplicación y sus scripts |
| Los 4 `.cmd`, `LEEME.txt`, `INVENTARIO.txt`, `PAQUETE.json` | — | Punto de entrada y documentación para quien lo recibe |

**Qué se genera al instalar, en el equipo de destino**: `server/.env` (credenciales aleatorias e irrepetibles), `CREDENCIALES.txt`, `logs/`, `.run/` y `dist/` reconstruido.

**Qué vive en `%LOCALAPPDATA%\GamificApp`**: el datadir, `my.ini`, `error.log`, `mysqld.pid`, `secretos\root.txt` e `instancia.json`. **Nunca dentro del paquete.**

**Qué no se distribuye jamás**: `server/.env`, `CREDENCIALES.txt`, `.run/`, `logs/`, `server/backups/`, `runtime/descargas/`, `.git/`, `docs/`, `CONTRIBUTING.md`, `README.md`, `START_HERE.md`, `docker-compose.dev.yml`, `server/.env.development.example` y el propio `empaquetar.ps1`.

**La poda de `runtime\mysql` (925 → 399 MB) solo quita lo demostrado prescindible**, y se aplica sobre la copia: el árbol del repositorio queda íntegro, así que es reversible y reproducible.

| Se quita | Cuánto | Por qué se puede |
|---|---|---|
| `*.pdb` | 446,7 MB (35) | Símbolos de depuración: el cargador de Windows nunca los abre |
| `*.lib` | 55,1 MB (7) | Bibliotecas para **compilar** en C contra MySQL |
| `*-debug.dll` y `lib\plugin\debug\` | ~90 MB (63) | Importan `msvcp140d.dll` / `ucrtbased.dll`, el CRT de **depuración** de Visual Studio, que Microsoft no redistribuye: no pueden cargar en ninguna máquina sin Visual Studio |
| `include\` | 0,4 MB (17) | Cabeceras `.h`/`.c` del API de C |

Se conserva todo lo demás — los 28 ejecutables cliente, `lib\mecab`, `lib\plugin`, `lib\private` (ICU) y `share\` entero (charsets, collations y mensajes de error) — porque su necesidad no está demostrada como nula. **Fiabilidad por delante del tamaño.**

Antes de dar el paquete por bueno, el empaquetador lo **audita y aborta** si encuentra un archivo prohibido (`.env`, `CREDENCIALES.txt`, `root.txt`, `instancia.json`, `my.ini`, `*.pid`, `*.log`), una carpeta prohibida, o los **valores** secretos de la máquina de desarrollo. Busca valores, no nombres de variable: `JWT_SECRET=` en `.env.example` es legítimo.

**Limitación abierta, y no se declara resuelta:** el paquete **no se ha probado en un Windows realmente recién instalado**. El despliegue app-local del Visual C++ quita la causa conocida del fallo y está verificado que Windows carga esas copias, pero eso no sustituye a la prueba en una máquina limpia. Tampoco se ha probado tras un reinicio del sistema operativo.

### Opción B: arranque manual (desarrollo)

#### 1. Backend (`server/`)

```bash
cd server
npm install
cp .env.example .env
```

Completar `server/.env` (nunca se sube al repo, está en `.gitignore`):

| Variable | Para qué |
|---|---|
| `PORT` | Puerto del backend (por defecto `3001`) |
| `CORS_ORIGIN` | Origen permitido del frontend (`http://localhost:5173` en local) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Conexión a MySQL |
| `JWT_SECRET` | Obligatoria: cadena larga y aleatoria para firmar tokens |
| `JWT_EXPIRES_IN` | Duración del token (ej. `8h`) |
| `ADMIN_PASSWORD` | Contraseña de la cuenta admin semilla (`initDb.js` la crea/actualiza al arrancar) |
| `GEMINI_API_KEY` | API key de Google Gemini (solo servidor; el frontend nunca la ve) |
| `RESET_HABILITADO` | Deja en `false` salvo que necesites el botón "Restablecer aplicación" (SPEC-008, borra casi toda la BD) |

**Inicializar la base de datos (dos pasos, en este orden).** `initDb.js` **NO puede** inicializar una base vacía por sí solo: ejecuta `migrarColumnasMaterias` (un `ALTER TABLE materias`) **antes** de crear las tablas (`initDb.js:36-37`), así que sobre una base recién creada falla con `Table 'materias' doesn't exist`. En producción funciona porque el esquema se cargó primero a mano.

```bash
# 1. Crear la base vacía (el .sql de producción no hace CREATE DATABASE)
mysql -u root -p -e "CREATE DATABASE gamificapp_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_spanish_ci;"

# 2. Cargar el esquema base: 11 tablas + materias e institución semilla
mysql -u root -p gamificapp_dev < database/produccion_defaultdb.sql

# 3. Arrancar: initDb.js añade las 7 tablas restantes (auditoría, misiones,
#    mision_estudiante, docente_curso, banco_preguntas, configuracion_ia,
#    tipos_juego) y sincroniza la cuenta admin. Total: 18 tablas.
npm run dev     # server/package.json → node --watch server.js
```

Ojo al arrancar: `server.js` empieza a escuchar **antes** de terminar `inicializarEsquema()`, así que ver `/api/health` respondiendo no significa que las migraciones hayan acabado. La señal fiable es `✅ Esquema verificado/creado en la base de datos.` en la consola del backend.

#### 2. Frontend (raíz del repo)

```bash
npm install
npm run dev     # vite, sirve en http://localhost:5173
```

El frontend usa `VITE_API_URL` (ver `.env.example` en la raíz) para saber dónde está el backend. El `.env` de la raíz es **opcional en local**: sin él, `src/services/apiBase.js` **deduce la dirección del origen desde el que se abrió la página** (mismo host, puerto 3001), así que en `localhost` sale `http://localhost:3001` exactamente igual que antes.

Ese módulo es el **único sitio** donde se resuelve la dirección de la API — antes esa línea estaba copiada en 18 archivos. Regla de precedencia: `VITE_API_URL` definida **manda siempre** (es lo que usa producción, Vercel → Render); solo cuando no lo está entra la deducción. Y ojo: lo que diga ese archivo queda **horneado dentro de `dist/`** al construir, no se lee en tiempo de ejecución. Por eso un `VITE_API_URL=http://localhost:3001` fijo impide que la instalación offline sirva a otros dispositivos de la red, y el instalador lo comenta al activar esa opción (ver *Las dos opciones del equipo*, más arriba).

### Comandos útiles

| Comando | Dónde | Qué hace |
|---|---|---|
| `npm run dev` | raíz / `server/` | arranca frontend / backend en modo desarrollo |
| `npm run build` | raíz | build de producción del frontend (correr siempre antes de dar por terminada una tarea) |
| `npm run lint` | raíz | ESLint del frontend |
| `npm run preview` | raíz | sirve el build de producción localmente |

### Nota sobre MySQL local

Si tu entorno **no tiene MySQL local**, los cambios de backend/BD se verifican con `npm run build` + revisión de código, y la verificación end-to-end contra datos reales (permisos, migraciones, IA) se confirma después del deploy a producción (Vercel + Render + Aiven). Si sí tienes MySQL, puedes verificar localmente antes de esperar al deploy.

Hay **tres** formas documentadas de tener MySQL local:

| Forma | Puerto | Cuándo se usa |
|---|---|---|
| **MySQL portable de GamificApp** | **3308** (reserva 3309-3315) | Lo que usa `Instalar GamificApp.cmd` cuando existe `runtime/mysql`. Datos en `%LOCALAPPDATA%\GamificApp\`. Es el camino del revisor: no exige instalar nada |
| **Contenedor Docker** | 3307 | Entorno de desarrollo/QA de `docker-compose.dev.yml`, base `gamificapp_dev` (ver `docs/DEV-ENTORNO-LOCAL.md`) |
| **MySQL 8 instalado en Windows** | 3306 | Respaldo: solo si no viene `runtime/mysql`. El instalador lo detecta y pide credenciales |

**Las tres pueden convivir a la vez**: el instalador portable nunca toca los puertos 3306 ni 3307, y la conexión que use manda siempre desde `server/.env`.

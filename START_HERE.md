# START_HERE — Lectura obligatoria antes de modificar código

> Última actualización: 2026-07-14

Este archivo indica exactamente qué debe leer una IA (o desarrollador) nueva antes de tocar GamificApp, y cómo arrancar el proyecto en local. Leer **solo** lo que la tarea requiere; el objetivo es trabajar con el mínimo contexto posible.

## Lectura mínima (siempre, en este orden)

1. **`CLAUDE.md`** (raíz) — reglas permanentes de trabajo. Se carga automáticamente en Claude Code.
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
| Detalle histórico de endpoints, BD o navegación vieja | `docs/archive/fundamentos/Inventario-Funcional-v1.md` (referencia profunda; puede estar desactualizada — el código manda) |

## Dónde está la verdad técnica

- **Rutas API**: `server/routes/` (auth, admin, docente, materias, materiales, retos, progreso, ranking, ia).
- **Esquema BD**: `database/gamificapp.sql` (dev) y `database/produccion_defaultdb.sql` (producción Aiven); los `.sql` de `database/migraciones/` son **referencia/versionado documental**, mientras que las migraciones que realmente se aplican en cada arranque son **funciones idempotentes de `server/initDb.js`** (ver `docs/architecture/MASTER_PLAN.md` §6). Escribir solo el `.sql` no aplica nada.
- **Servicios frontend**: `src/services/` (uno por dominio).
- **Componentes compartidos**: `src/components/dashboard/DashboardWidgets.jsx`, `src/components/archivos/`, etc.

Si un documento contradice al código, **el código es la fuente de verdad** — y hay que corregir el documento.

## Cómo correr el proyecto en local

**Requisitos reales** (verificados contra el código, no estimados):

| Requisito | Versión | Por qué |
|---|---|---|
| Node.js | **20.19+ (rama 20) o 22.12+ (rama 22 o superior)** | Lo impone Vite 8: `node_modules/vite/package.json` declara `engines.node = "^20.19.0 \|\| >=22.12.0"`. **Node 18 y 21 NO sirven**, ni las 22.0–22.11 |
| npm | el que trae Node | |
| MySQL | **8+** | El esquema usa índices funcionales (`uq_materia_nombre_activa`) que exigen MySQL 8 |

### Opción A (recomendada en Windows): instalación guiada

Tres archivos en la raíz del repositorio, pensados para doble clic:

| Archivo | Qué hace |
|---|---|
| `Instalar GamificApp.cmd` | Comprueba Node/npm/MySQL y los puertos, instala dependencias (`npm ci`), crea la base y carga el esquema, genera `server/.env` con credenciales aleatorias, construye el frontend, arranca todo y abre el navegador |
| `Iniciar GamificApp.cmd` | Arranque diario. Si ya está en marcha, no duplica procesos |
| `Detener GamificApp.cmd` | Cierra **solo** los procesos de GamificApp (por PID registrado, nunca `taskkill /IM node.exe`) |

Detalles importantes:

- **No instala nada en el sistema.** Si falta Node.js (o el instalado no cumple el requisito de Vite), descarga una copia portable **verificada por SHA-256** contra el `SHASUMS256.txt` oficial de nodejs.org y la deja en `runtime/node/` — sin `setx`, sin registro de Windows, sin servicios y sin permisos de administrador. La prioridad es siempre `runtime/node/node.exe` → Node del equipo si es compatible → descarga. **MySQL 8 sí sigue siendo requisito previo**: si falta, se detiene y explica qué descargar.
- **Es seguro repetirlo**: en la segunda ejecución conserva `server/.env` tal cual (no regenera `JWT_SECRET` ni `ADMIN_PASSWORD`) y no toca los datos.
- Las credenciales generadas quedan en `CREDENCIALES.txt` (ignorado por Git). El `JWT_SECRET` no se muestra nunca.
- Los **datos de demostración son opcionales**: pregunta explícitamente y el valor por defecto es *No*. Solo se permiten sobre la base local `gamificapp_dev`, usando `server/scripts/seedDev.js` con sus barreras intactas.
- Registro de lo ocurrido en `logs/` (`instalador.log`, `iniciar.log`, `detener.log`, `backend.log`, `frontend.log`). Ningún log contiene credenciales.
- El frontend se sirve con `vite preview --strictPort` en el 5173: **no puede saltar al 5174**, porque el backend solo acepta `CORS_ORIGIN=http://localhost:5173`.

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

El frontend usa `VITE_API_URL` (ver `.env.example` en la raíz) para saber dónde está el backend. El `.env` de la raíz es **opcional en local**: sin él, todos los servicios de `src/services/` caen al valor por defecto `http://localhost:3001`.

### Comandos útiles

| Comando | Dónde | Qué hace |
|---|---|---|
| `npm run dev` | raíz / `server/` | arranca frontend / backend en modo desarrollo |
| `npm run build` | raíz | build de producción del frontend (correr siempre antes de dar por terminada una tarea) |
| `npm run lint` | raíz | ESLint del frontend |
| `npm run preview` | raíz | sirve el build de producción localmente |

### Nota sobre MySQL local

En este proyecto normalmente **no hay MySQL local disponible** durante el desarrollo asistido por IA: los cambios de backend/BD se verifican con `npm run build` + revisión de código, y la verificación end-to-end contra datos reales (permisos, migraciones, IA) se confirma después del deploy a producción (Vercel + Render + Aiven). Si tu entorno sí tiene MySQL, puedes verificar localmente antes de esperar al deploy.

Hay dos formas documentadas de tener MySQL local: **MySQL 8 instalado en Windows** (lo que espera `Instalar GamificApp.cmd`) o el **contenedor Docker** de `docker-compose.dev.yml` (puerto 3307, base `gamificapp_dev`; ver `docs/DEV-ENTORNO-LOCAL.md`). El instalador funciona con cualquiera de las dos: detecta el puerto y pregunta.

## docs/archive/

Todo lo que está en `docs/archive/` es histórico o plantillas nunca redactadas. **No leerlo para el trabajo diario**; solo consultarlo si se necesita el "por qué" de una decisión pasada.

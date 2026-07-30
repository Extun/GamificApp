# REPOSITORY_CONTEXT

Fecha de auditoria: 2026-07-30.

Este documento resume GamificApp para que otra IA o mantenedor entienda el repositorio sin depender del historial del chat. No sustituye a `CLAUDE.md`, `START_HERE.md` ni a `docs/architecture/CURRENT_STATE.md`; sirve como mapa inicial.

> **ACTUALIZACION 2026-07-30 (commit `b5f1dc3`, bloque P1 de la fase Release Candidate).** Cambios de este mapa:
>
> - **`src/assets/` ya no existe**: sus tres archivos (`react.svg`, `vite.svg`, `hero.png`) eran restos de la plantilla de Vite sin ninguna referencia y se borraron, junto con `public/icons.svg`.
> - **Carpeta nueva `public/fonts/`**: Inter y Poppins **autoalojadas** (4 `.woff2`, 76 kB, subset latin; Inter es variable y un solo fichero cubre 400-700), declaradas con `@font-face` en `src/index.css`. Antes venian del CDN de Google, lo que dejaba la app instalada en Windows sin su tipografia cuando no habia internet. **La app ya no hace ninguna peticion externa para renderizar.**
> - **Componente nuevo `src/pages/estudiante/ModalCambiarPin.jsx`**: cambio de PIN del estudiante sobre `ModalPanel`, en sustitucion de dos `window.prompt`. **El proyecto queda a cero `window.prompt`.** Usa el mismo `authService.cambiarPin` y el mismo endpoint: no cambia autenticacion.
> - **Tres servicios ganaron una opcion opt-in** que no altera su comportamiento por defecto: `authService.authFetch` acepta `conservarSesionEn401` (solo la usa `cambiarPin`, porque en ese endpoint un 401 describe el PIN enviado y no la sesion); `retosService.obtenerRetosPublicados` y `materialesService.obtenerMaterial` aceptan `propagarError` (por defecto siguen devolviendo `[]` ante un fallo, como esperan los consumidores historicos).
> - **Nota sobre lint, para no repetir un diagnostico erroneo:** la linea base es **29 problemas (26 errores + 3 warnings)** medida con **`npx eslint src server`**. `npm run lint` ejecuta `eslint .` y, si existe la carpeta `release/`, entra en la copia del codigo que dejo el empaquetador y **duplica el recuento a 58**; `.gitignore` no se aplica al flat config de ESLint. Anotado como item 62 del MASTER_PLAN.

> **ACTUALIZACION 2026-07-30 (commit `37e924c`, bloque P2 de la fase Release Candidate — CIERRA LA FASE).** Se implementaron **4 de los 8 items** tras reevaluar el backlog a dos dias de la entrega: **P2-1, P2-4 y P2-7 pasaron a Post v1.0** y **P2-6 quedo sin implementar**. Cinco archivos, todos de presentacion. Cambios de este mapa:
>
> - **El Home del docente (`src/pages/admin/dashboard.jsx`) tiene tres estados de carga explicitos** (`cargando` / `listo` / `error`) para materias, estudiantes y retos, con esqueletos, subtitulo que no afirma nada sin dato y un boton de reintento que recarga sin recargar la pagina. Es el mismo patron que P1 aplico al panel del estudiante. **El `propagarError` que nacio en P1 es lo que hace alcanzable el estado de error**: por defecto `obtenerRetosPublicados` se traga el fallo y devuelve `[]`.
> - **Clase nueva `.home-doc-materia-esqueleto`** en `src/pages/docente/docentePanel.css`, con animacion propia (`doc-esqueleto-brillo`). **No reutiliza el esqueleto del panel del estudiante a proposito**: los dos paneles no comparten hoja de estilos y depender de un `@keyframes` declarado en `dashboardEstudiante.css` seria un acoplamiento invisible. Su `min-height` reproduce el alto real medido de la tarjeta (134px, y 170px por debajo de 720px, donde el detalle pasa a dos lineas).
> - **`.contenido` gana `scroll-padding-block-end` acotado con `:has(.editor-publicar-barra)`** en `src/pages/admin/dashboard.css`, por WCAG 2.2 SC 2.4.11: la barra de publicar del editor es `position: sticky; bottom: 0` y tapaba el control que recibia el foco. Medido con recorrido de foco secuencial: **4 controles tapados pasan a 0 a 1280px y 3 pasan a 0 a 375px**.
> - **Dato del mapa que conviene no volver a suponer:** en `SidebarLayout`, **`.sidebar-footer` es HERMANO de `.sidebar-nav`, no hijo**. Sus cajas se tocan sin solaparse (0px medidos), asi que el footer *no* puede tapar el contenido del menu por mucho que sea `sticky`. La auditoria de la fase daba por hecho lo contrario.
> - **Dos atributos de accesibilidad, sin logica:** `aria-expanded` (+ `aria-controls` solo cuando la region esta montada) en el disclosure "¿Olvidaste tu PIN?" de `src/pages/admin/login.jsx`, y `role="img"` + `aria-label` en el chip de racha de `src/pages/estudiante/DashboardEstudiante.jsx`. **El chip de racha NO cambio de tamano** (47,78px a 1280 y a 320): la restriccion era no tocar el layout del panel del estudiante.

## Proposito

GamificApp es una plataforma web de gamificacion educativa para ninos de 6 a 9 anos, creada como proyecto de tesis para la Unidad Educativa Fiscal Clemencia Coronel de Pincay, en Guayaquil, Ecuador. Tiene tres roles:

- Administrador: gestiona docentes, estudiantes, materias, cursos, institucion, permisos, auditoria, papelera, configuracion de IA y estados de juegos.
- Docente: crea actividades educativas, puede usar IA, gestiona aula, banco de preguntas, biblioteca, misiones, ranking y progreso.
- Estudiante: entra con nombre + PIN o codigo de emergencia, juega actividades, gana XP, niveles, racha y misiones.

La filosofia de producto documentada es "siempre se termina ganando": el error guia y permite reintentar; solo los aciertos al primer intento dan XP.

## Stack

- Frontend: React 19, Vite, React Router, MUI, CSS plano con tokens.
- Backend: Node.js, Express, JWT, bcryptjs, mysql2.
- Base de datos: MySQL 8. El esquema base vive en `database/produccion_defaultdb.sql`; las migraciones reales del arranque son funciones idempotentes en `server/initDb.js`.
- IA: proveedores server-side mediante `server/lib/ia/`; implementa Gemini y OpenAI. Las API keys nunca deben llegar al navegador.
- Archivos: `pdfjs-dist` para PDF, `mammoth` para DOCX, `xlsx` para importacion/exportacion Excel.
- Despliegue: documentado como Vercel frontend, Render backend y Aiven MySQL. No hay `vercel.json`, `render.yaml` ni workflows versionados.
- Distribucion local Windows: scripts `.cmd` y `instalador/` preparan Node/MySQL portables, dependencias, base local y paquete en `release/`.

## Arquitectura

El frontend es una SPA con tres rutas reales en `src/App.jsx`:

- `/`: login para roles y acceso de estudiante.
- `/registro`: activacion/registro de estudiante.
- `/dashboard`: ruta protegida; decide el panel segun el rol del JWT.

Dentro de cada dashboard la navegacion es mayormente estado local, no subrutas. Los tres paneles principales son:

- `src/pages/admin/AdminDashboard.jsx`
- `src/pages/admin/dashboard.jsx` para docente
- `src/pages/estudiante/DashboardEstudiante.jsx`

El backend monta rutas publicas y luego un muro JWT global en `server/server.js`:

- Publicas: `/api/health`, `/api/auth`, `/api/institucion`.
- Protegidas: todo lo montado despues de `app.use('/api', autenticar)`.

Rutas principales: `/api/admin`, `/api/docente`, `/api/materias`, `/api/retos`, `/api/progreso`, `/api/ranking`, `/api/misiones`, `/api/ia`, `/api/banco`, `/api/estudiantes`.

## Estructura

```text
src/                    Frontend React.
  pages/admin/           Panel admin, login y modulos administrativos.
  pages/docente/         Vistas docentes.
  pages/estudiante/      Vistas estudiante.
  components/            Componentes compartidos, juegos, quiz, mision, dashboard.
  services/              Clientes HTTP por dominio.
  hooks/                 Hooks reutilizables.

server/                 Backend Express.
  routes/                Endpoints REST.
  lib/                   Logica de dominio, IA, juegos, misiones, importacion.
  middleware/            Autenticacion y permisos.
  scripts/               Scripts operativos directos.
  initDb.js              Inicializacion/migraciones idempotentes.
  db.js                  Pool MySQL.

database/               SQL base y migraciones documentales.
docs/                   Documentacion viva, specs, auditorias y archivo historico.
instalador/             Instalacion local Windows y empaquetado.
public/                 Assets publicos de Vite (favicon + fonts/ autoalojadas).
scripts/                Verificaciones de mantenimiento.
tools/                  Generadores auxiliares de documentos.
```

Presentes pero no mantenibles como fuente: `node_modules/`, `server/node_modules/`, `dist/`, `runtime/`, `release/`, `logs/`, `.run/`, `.claude/`, `.env`, `server/.env` y `CREDENCIALES.txt`.

## Flujo Principal

1. El usuario entra por `Login`.
2. El backend autentica en `/api/auth`.
3. El JWT guarda identidad/rol, pero el middleware `autenticar` revalida contra BD para cuentas revocadas, eliminadas o desactivadas.
4. `DashboardPorRol` renderiza admin, docente o estudiante.
5. El frontend consulta servicios de `src/services/`; `localStorage` es cache, no fuente de verdad.
6. Actividades y juegos se guardan como retos polimorficos en `retos.configuracion_json`.
7. Al completar actividades, `/api/progreso` controla XP de forma transaccional e idempotente.

## Modulos Clave

- Juegos: registros espejo en `server/lib/juegos/registro.js` y `src/components/juegos/registro/index.js`. Tipos actuales: quiz, mision, clasificador, memorama, linea del tiempo, completar espacios, verdadero/falso.
- IA: `server/lib/ia/` resuelve proveedor/modelo y `server/lib/actividadesIA.js` genera/normaliza actividades.
- Banco de preguntas: backend `server/routes/bancoPreguntas.js`, frontend `src/pages/docente/BancoPreguntas.jsx`.
- Misiones: `server/lib/misiones.js`, `server/lib/misionesSeed.js`, rutas `misiones` y `adminMisiones`.
- Administracion: `src/pages/admin/modulos/` y `server/routes/admin*.js`.
- Importacion estudiantes: `src/components/ImportarEstudiantes.jsx`, `server/routes/estudiantesImport.js`, `server/lib/importacionEstudiantes.js`.
- Instalador: `instalador/*.ps1`, `Instalar/Iniciar/Detener GamificApp.cmd`.

## Archivos Criticos

- `CLAUDE.md`: reglas permanentes del proyecto.
- `START_HERE.md`: arranque local, instalador y lectura minima.
- `README.md`: guia publica breve.
- `docs/architecture/CURRENT_STATE.md`: estado real y bitacora operativa.
- `docs/architecture/MASTER_PLAN.md`: roadmap y deuda.
- `docs/architecture/PROJECT_CONTEXT.md`: contexto de producto/arquitectura.
- `server/server.js`: montaje de API, CORS, seguridad basica, muro JWT.
- `server/middleware/auth.js`: autenticacion, permisos y revocacion.
- `server/initDb.js`: migraciones reales del arranque.
- `server/routes/progreso.js`: XP idempotente.
- `server/lib/juegos/registro.js`: contrato backend de juegos.
- `src/components/juegos/registro/index.js`: contrato frontend de juegos.

## Dependencias

Frontend directo: React, React DOM, React Router, MUI, Emotion, mammoth, pdfjs-dist, xlsx. Dev: Vite, ESLint, Babel, React Compiler y tipos.

Backend directo: Express, cors, dotenv, mysql2, bcryptjs, jsonwebtoken, `@google/genai`, `openai`.

No mover dependencias entre manifests sin decision explicita: raiz = frontend/build; `server/` = backend.

## Comandos

```bash
npm run dev       # frontend desde la raiz
npm run build     # build frontend
npm run lint      # ESLint frontend
npm run preview   # sirve dist

cd server
npm run dev       # backend con node --watch
npm start         # backend normal
```

En Windows, los flujos oficiales de usuario final son `Instalar GamificApp.cmd`, `Iniciar GamificApp.cmd` y `Detener GamificApp.cmd`.

## Build y Despliegue

El frontend produce `dist/`; `dist/` esta ignorado y debe regenerarse. El paquete local se genera con:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File instalador\empaquetar.ps1
```

El paquete sale en `release/GamificApp/` y opcionalmente `release/GamificApp.zip`; ambos son artefactos reproducibles, no fuente.

## Convenciones

- Comentarios y UI en espanol.
- CSS plano con tokens; no introducir librerias de estilos nuevas.
- Datos visibles deben venir de BD o calculo real; sin datos, usar estados vacios.
- Nuevos juegos deben agregarse en ambos registros y validarse con `scripts/verificar-registros-juegos.mjs`.
- Migraciones nuevas requieren SQL documental y funcion idempotente en `server/initDb.js`, salvo decision documentada.
- Cambios grandes necesitan SPEC aprobada en `docs/specifications/`.

## Puntos Delicados

- No romper `configuracion_json` de retos ya publicados.
- No tocar XP ni `/api/progreso` sin SPEC.
- No tocar autenticacion/JWT/PIN/codigo de emergencia sin SPEC.
- No tocar permisos, ranking o misiones sin SPEC.
- No tratar `localStorage` como verdad.
- No exponer secretos al frontend.
- No asumir que los `.sql` de `database/migraciones/` se aplican solos.
- No confundir `runtime/mysql` con datos: los datos reales locales viven fuera del repo, en `%LOCALAPPDATA%\GamificApp`.

## Que NO Modificar

Sin autorizacion explicita y SPEC aprobada, no modificar: login, autenticacion, revocacion, permisos, XP, misiones, ranking, esquema de progreso, registros de juegos publicados, scripts de instalacion probados, CORS de produccion, ni inicializacion de BD.


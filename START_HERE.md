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

Requisitos: Node.js 18+, npm, y acceso a un servidor MySQL 8+ (local o remoto — no es necesario tener MySQL instalado en la misma máquina si apuntas a uno remoto).

### 1. Backend (`server/`)

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

Crear la base de datos vacía en MySQL (`CREATE DATABASE gamificapp;` o el nombre que pongas en `DB_NAME`) y luego arrancar:

```bash
npm run dev     # server/package.json → node --watch server.js
```

`initDb.js` crea/actualiza tablas y aplica migraciones automáticamente al arrancar — no hace falta correr los `.sql` de `database/` a mano.

### 2. Frontend (raíz del repo)

```bash
npm install
npm run dev     # vite, sirve en http://localhost:5173
```

El frontend usa `VITE_API_URL` (ver `.env.example` en la raíz) para saber dónde está el backend; en local por defecto `http://localhost:3001`.

### 3. Comandos útiles

| Comando | Dónde | Qué hace |
|---|---|---|
| `npm run dev` | raíz / `server/` | arranca frontend / backend en modo desarrollo |
| `npm run build` | raíz | build de producción del frontend (correr siempre antes de dar por terminada una tarea) |
| `npm run lint` | raíz | ESLint del frontend |
| `npm run preview` | raíz | sirve el build de producción localmente |

### Nota sobre MySQL local

En este proyecto normalmente **no hay MySQL local disponible** durante el desarrollo asistido por IA: los cambios de backend/BD se verifican con `npm run build` + revisión de código, y la verificación end-to-end contra datos reales (permisos, migraciones, IA) se confirma después del deploy a producción (Vercel + Render + Aiven). Si tu entorno sí tiene MySQL, puedes verificar localmente antes de esperar al deploy.

## docs/archive/

Todo lo que está en `docs/archive/` es histórico o plantillas nunca redactadas. **No leerlo para el trabajo diario**; solo consultarlo si se necesita el "por qué" de una decisión pasada.

# REPOSITORY_CLEANUP

Fecha de auditoria: 2026-07-30.

> **ESTADO DE EJECUCION (anadido 2026-07-30, tras el commit `b5f1dc3`).** Este documento es el inventario original y se conserva como tal. Lo que se decidio y ejecuto:
>
> **Ejecutado — 4 archivos, los unicos borrados:** `src/assets/react.svg`, `src/assets/vite.svg`, `src/assets/hero.png` y `public/icons.svg`. Cero referencias verificadas antes de borrar. `src/assets/` queda vacia.
>
> **NO ejecutado, por decision de Fabrizio: las 10 categorias de la seccion «Eliminar» que no estan versionadas.** Se comprobo con `git ls-files` que `.env`, `server/.env`, `CREDENCIALES.txt`, `logs/`, `.run/`, `.claude/`, `node_modules/`, `server/node_modules/`, `dist/`, `release/` y `runtime/` **ya estan fuera del repositorio** porque `.gitignore` las cubre. La limpieza archivistica que propone este documento **ya estaba hecha**; borrarlas del disco no mejoraria el repositorio y destruiria el entorno de trabajo justo antes de validar el instalador (`server/.env` apunta al MySQL portable 3308, `runtime/` son 1,25 GB de Node y MySQL portables, `release/` es el paquete a probar).
>
> **NO ejecutado, conservado a proposito:** `src/pages/admin/asistenteIA.jsx` y `respuestaIA.jsx` (el endpoint `/api/ia/asistente` sigue intacto); `tools/build_auditoria_docx.py` y los DOCX de auditoria (evidencia de tesis).
>
> **Tres correcciones a este documento, verificadas:**
> 1. **`.asistente-*` de `adminDashboard.css` NO es CSS huerfano.** Lo usan 6 modulos del panel admin (`ModuloMaterias`, `ModuloMisiones`, `ModuloCursos`, `ModuloInstitucion`, `ModuloAdministradores` y el asistente de docentes de `AdminDashboard.jsx`). Borrar `asistenteIA.jsx` no habria dejado CSS sin uso, y borrar ese CSS habria roto medio panel.
> 2. **`server/lib/totalEsperado.js` se mantiene.** Es un shim sin importadores, cierto, pero su nombre figura en la lista de formulas congeladas de SPEC-018 §3 y `totalEsperado` es un control de seguridad de `POST /api/progreso`: beneficio nulo frente a riesgo de tocar area congelada.
> 3. **`server/lib/iaCliente.js` queda para post-1.0.** Tiene 0 importadores, pero borrarlo obliga a corregir `CLAUDE.md §3`, que lo documentaba como el camino de la IA cuando el real es `server/lib/ia/` (ese texto **si** se corrigio el 2026-07-30).
>
> **Cambio del arbol posterior a este inventario:** existe `public/fonts/` con **4 archivos `.woff2` (76 kB)** — Inter y Poppins autoalojadas, que antes venian del CDN de Google. Son parte de la fuente y **no** son candidatos de limpieza: sin ellas la app instalada en Windows pierde su tipografia al no haber internet.

Rol aplicado: Repository Maintainer / Software Archivist. No se elimino nada, no se refactorizo codigo, no se cambiaron dependencias y no se modifico documentacion existente.

## Resumen Ejecutivo

El repositorio mantenible versionado contiene aproximadamente 274 archivos rastreados por Git. El workspace fisico contiene 126.208 archivos, 4.716 carpetas y 2.545,56 MB, porque ademas estan presentes dependencias instaladas, build, runtime portable, logs y paquete de release.

La limpieza principal recomendada no es de codigo, sino de separacion archivistica: mantener fuente y documentacion viva; archivar auditorias y documentos historicos; excluir del repo publico secretos, logs, runtimes, `node_modules`, `dist` y `release`.

Hay candidatos claros a eliminar o archivar del arbol publicable, pero no se elimino ninguno:

- `.env`, `server/.env`, `CREDENCIALES.txt`
- `logs/`, `.run/`, `.claude/`
- `node_modules/`, `server/node_modules/`
- `dist/`
- `runtime/`
- `release/`
- `release/GamificApp.zip`
- `runtime/descargas/mysql-8.0.44-winx64.zip`
- `Auditoria-Panel-Docente-SPEC-004.docx`
- `src/assets/react.svg`, `src/assets/vite.svg`, `src/assets/hero.png`
- `src/pages/admin/asistenteIA.jsx` y `src/pages/admin/respuestaIA.jsx` como flujo UI no alcanzable

## FASE 1 - Inventario Completo

### Conteo Fisico Por Nivel Superior

| Carpeta/archivo | Archivos | MB | Estado |
|---|---:|---:|---|
| `release/` | 61.365 | 1.011,28 | no se usa como fuente; artefacto generado |
| `node_modules/` | 54.544 | 218,99 | se usa localmente; no debe versionarse |
| `server/` | 4.402 | 47,27 | se usa; incluye `server/node_modules` ignorado |
| `.git/` | 3.288 | 8,62 | se usa por Git; no publicar como artifact |
| `runtime/` | 2.338 | 1.253,54 | se usa en distribucion local; no debe versionarse |
| `src/` | 115 | 1,10 | se usa |
| `docs/` | 52 | 0,87 | se usa parcialmente |
| `logs/` | 30 | 0,08 | temporal/local; no usar como fuente |
| `database/` | 28 | 0,05 | se usa |
| `instalador/` | 10 | 0,18 | se usa |
| `dist/` | 7 | 3,33 | build generado |
| `.run/` | 5 | 0,00 | temporal/local |
| `.claude/` | 2 | 0,00 | personal/local |
| `public/` | 2 | 0,01 | se usa parcialmente |
| archivos raiz | 18 | 0,21 | mixto |

### Arbol Mantenible Versionado

```text
raiz (18 archivos)
  database/ (2)
    migraciones/ (26)
  docs/ (2)
    architecture/ (6)
      decisions/ (1 .gitkeep)
    archive/ (10)
      devos-process/ (3)
      fundamentos/ (3)
    audit/ (7, incluye 1 no versionado)
    specifications/ (20)
  instalador/ (10)
  public/ (2)
  scripts/ (1)
  server/ (57 versionados + node_modules local ignorado)
    lib/ (10)
      ia/ (8)
      juegos/ (4)
        tipos/ (7)
    middleware/ (1)
    routes/ (18)
    scripts/ (2)
  src/ (115)
    assets/ (3)
    components/ (4)
      archivos/ (1)
      clasificador/ (4)
      dashboard/ (7)
      juegos/ (24)
        registro/ (9)
      mision/ (2)
      quiz/ (4)
    hooks/ (3)
    pages/
      admin/ (10)
        modulos/ (12)
      docente/ (7)
      estudiante/ (5)
    services/ (16)
  tools/ (1)
```

### Archivos Principales

| Elemento | Clasificacion |
|---|---|
| `package.json`, `package-lock.json` | se usa |
| `server/package.json`, `server/package-lock.json` | se usa |
| `index.html`, `vite.config.js`, `eslint.config.js` | se usa |
| `src/main.jsx`, `src/App.jsx`, `src/index.css` | se usa |
| `server/server.js`, `server/db.js`, `server/initDb.js` | se usa |
| `database/produccion_defaultdb.sql`, `database/gamificapp.sql` | se usa |
| `instalador/*.ps1`, `*.cmd` de raiz | se usa |
| `README.md`, `START_HERE.md`, `CLAUDE.md` | se usa |

### Temporales, Generados y Locales

| Elemento | Estado | Decision sugerida |
|---|---|---|
| `.env`, `server/.env` | se usa localmente; secreto/config real | eliminar del repo publicable, mantener ignorado |
| `CREDENCIALES.txt` | se usa localmente; sensible | eliminar del repo publicable, mantener ignorado |
| `.run/` | temporal del instalador | eliminar/ignorar |
| `logs/` | temporal de ejecuciones | eliminar/ignorar |
| `.claude/` | personal/local | eliminar/ignorar |
| `dist/` | build generado | eliminar/ignorar |
| `release/` | paquete generado | archivar fuera del repo o eliminar del workspace |
| `runtime/` | runtime portable pesado | archivar fuera del repo fuente; incluir solo en distribucion |
| `node_modules/`, `server/node_modules/` | dependencias instaladas | eliminar del repo publicable; regenerar con lock |

### Duplicados

No se detectaron duplicados exactos entre archivos rastreados por Git.

Si se compara `release/GamificApp/` contra los archivos versionados, hay 219 copias exactas de archivos rastreados. Esto no es duplicacion de fuente; es el paquete de distribucion generado. Debe permanecer fuera del repositorio fuente.

### Archivos Vacios

Vacios mantenibles:

- `docs/architecture/decisions/.gitkeep`
- `docs/audit/.gitkeep`
- `docs/specifications/.gitkeep`
- `src/App.css`

Vacios locales/generados detectados:

- varios `logs/*-errores.log`
- archivos vacios internos de `node_modules`, `runtime` y `release`

`src/App.css` esta importado por `src/App.jsx`, pero no contiene reglas. Estado: probablemente se usa como residuo de plantilla o placeholder; no eliminar sin confirmar politica de estilos.

### Archivos Muy Grandes

| Archivo | MB | Estado |
|---|---:|---|
| `runtime/mysql/bin/mysqld.pdb` | 352,64 | no se usa en ejecucion normal; simbolos debug |
| `release/GamificApp.zip` | 246,51 | artefacto generado |
| `runtime/descargas/mysql-8.0.44-winx64.zip` | 233,20 | descarga/cache local |
| `runtime/node/node.exe` | 82,96 | se usa para instalacion portable local |
| `release/GamificApp/runtime/node/node.exe` | 82,96 | copia del paquete |
| `runtime/mysql/bin/mysqld.exe` | 51,86 | se usa por MySQL portable |
| `release/GamificApp/runtime/mysql/bin/mysqld.exe` | 51,86 | copia del paquete |

### Huerfanos y Uso No Alcanzable

| Elemento | Estado |
|---|---|
| `src/pages/admin/asistenteIA.jsx` | no se usa; no alcanzable desde `src/main.jsx` |
| `src/pages/admin/respuestaIA.jsx` | no se usa; solo lo referencia el asistente no alcanzable |
| `server/lib/iaCliente.js` | probablemente no se usa; archivo de compatibilidad historica |
| `server/lib/totalEsperado.js` | probablemente no se usa; archivo de compatibilidad historica |
| `server/scripts/seedDev.js` | se usa como script directo desde instalador/documentacion |
| `server/scripts/crearUsuario.js` | se usa como script directo desde instalador |
| `tools/build_auditoria_docx.py` | probablemente no se usa en runtime; genera auditoria DOCX |
| `scripts/verificar-registros-juegos.mjs` | recomendado; verificacion de consistencia de juegos |

### Assets e Imagenes Sin Uso

| Asset | Estado |
|---|---|
| `public/favicon.svg` | se usa en `index.html` |
| `public/icons.svg` | no se pudo determinar; no aparece referenciado en codigo fuente |
| `src/assets/react.svg` | no se usa |
| `src/assets/vite.svg` | no se usa |
| `src/assets/hero.png` | no se usa |

## FASE 2 - Documentacion

### Obligatorios

| Documento | Motivo |
|---|---|
| `README.md` | entrada publica del proyecto |
| `START_HERE.md` | arranque local y lectura minima |
| `CLAUDE.md` | reglas permanentes del proyecto |
| `docs/architecture/PROJECT_CONTEXT.md` | contexto de producto/arquitectura |
| `docs/architecture/CURRENT_STATE.md` | estado real y bitacora viva |
| `docs/architecture/MASTER_PLAN.md` | roadmap y deuda |
| `docs/architecture/POLITICA-ELIMINACION.md` | reglas de borrado/papelera |
| `docs/architecture/MODELO-ENTIDAD-RELACION.md` | referencia de datos |
| `docs/COMO-AGREGAR-UN-JUEGO.md` | mantenimiento de extensibilidad |
| `docs/DEV-ENTORNO-LOCAL.md` | entorno local Docker/MySQL |

### Recomendados

| Documento | Motivo |
|---|---|
| `docs/architecture/VISION.md` | orienta UX/producto |
| `docs/specifications/SPEC-001` a `SPEC-019` | historial de decisiones y alcance de cambios grandes |
| `docs/audit/Auditoria-UX-Estudiante-v1.md` | util para redisenos del estudiante |
| `docs/audit/Auditoria-Sincronizacion-Global-v1.md` | evidencia puntual |
| `docs/audit/Auditoria-Documental-2026-07-14.md` | auditoria documental previa |
| `scripts/verificar-registros-juegos.mjs` | script documentado por codigo, no documento, pero recomendable para mantenimiento |

### Obsoletos o Historicos

| Documento | Motivo |
|---|---|
| `docs/archive/*` | la propia documentacion indica que es historico o plantilla abandonada |
| `docs/archive/fundamentos/*` | referencia profunda, puede estar desactualizada; el codigo manda |
| `docs/archive/devos-process/*` | proceso documental cerrado/simplificado |

### Duplicados o Solapados

| Documento | Motivo |
|---|---|
| `CLAUDE.md`, `START_HERE.md`, `docs/architecture/PROJECT_CONTEXT.md` | comparten contexto de arquitectura/stack; no son duplicados exactos, pero se solapan |
| `README.md` y `START_HERE.md` | ambos explican arranque; `README` es corto, `START_HERE` operativo |
| `Auditoria-Panel-Docente-SPEC-004.docx` y auditorias en `docs/audit/` | familia de auditorias; conservar solo si aporta evidencia unica |
| `docs/audit/Auditoria-Profesional-Completa-GamificApp.docx` y `tools/build_auditoria_docx.py` | el DOCX parece salida generada por el script |

### Personales o No Publicables

| Documento/archivo | Motivo |
|---|---|
| `CREDENCIALES.txt` | credenciales locales |
| `.env`, `server/.env` | configuracion/secreto local |
| `.claude/*` | configuracion personal de herramienta |
| `logs/*` | trazas de sesion local |
| `.run/*` | estado local del instalador |

## FASE 3 - Limpieza Del Repositorio

No eliminar automaticamente. Lista de candidatos:

- Secretos/config local: `.env`, `server/.env`, `CREDENCIALES.txt`.
- Temporales: `logs/`, `.run/`, `.claude/`.
- Dependencias instaladas: `node_modules/`, `server/node_modules/`.
- Builds: `dist/`.
- Distribucion: `release/`, `release/GamificApp.zip`.
- Runtimes: `runtime/`, especialmente `runtime/descargas/mysql-8.0.44-winx64.zip` y `.pdb`.
- Backups: `.run/env-anterior-docker.bak`.
- DOCX de auditoria en raiz: `Auditoria-Panel-Docente-SPEC-004.docx`.
- DOCX generados en `docs/audit/` si ya existe fuente markdown o no son necesarios para entrega.
- Assets de plantilla sin referencia: `src/assets/react.svg`, `src/assets/vite.svg`, `src/assets/hero.png`.
- UI IA antigua no alcanzable: `src/pages/admin/asistenteIA.jsx`, `src/pages/admin/respuestaIA.jsx`.
- Compatibilidad legacy no importada: `server/lib/iaCliente.js`, `server/lib/totalEsperado.js` solo si se decide romper compatibilidad historica.

## FASE 4 - Dependencias

### Frontend

| Paquete | Declarado | Lock | Uso |
|---|---:|---:|---|
| `react` | `^19.2.6` | `19.2.7` | se usa |
| `react-dom` | `^19.2.6` | `19.2.7` | se usa |
| `react-router-dom` | `^7.18.0` | `7.18.0` | se usa |
| `@mui/material` | `^9.1.1` | `9.1.1` | se usa |
| `@mui/icons-material` | `^9.1.1` | `9.1.1` | se usa |
| `@emotion/react`, `@emotion/styled` | `^11.14.x` | `11.14.x` | probablemente se usa como peer de MUI |
| `mammoth` | `^1.12.0` | `1.12.0` | se usa en `officeService` |
| `pdfjs-dist` | `^4.10.38` | `4.10.38` | se usa en `pdfService` |
| `xlsx` | `^0.18.5` | `0.18.5` | se usa con import dinamico |

Dev dependencies: Vite, ESLint, Babel, React Compiler y tipos estan alineados con build/lint. No se detectaron duplicados directos en `package.json`.

### Backend

| Paquete | Declarado | Lock | Uso |
|---|---:|---:|---|
| `express` | `^5.1.0` | `5.2.1` | se usa |
| `cors` | `^2.8.5` | `2.8.6` | se usa |
| `dotenv` | `^17.2.0` | `17.4.2` | se usa |
| `mysql2` | `^3.14.0` | `3.22.5` | se usa |
| `bcryptjs` | `^3.0.3` | `3.0.3` | se usa |
| `jsonwebtoken` | `^9.0.3` | `9.0.3` | se usa |
| `@google/genai` | `^2.10.0` | `2.10.0` | se usa |
| `openai` | `^6.48.0` | `6.48.0` | se usa |

### Obsolescencia Observada

Consulta externa al registro npm el 2026-07-30:

- `react` ultimo publicado observado: `19.2.8`; lock actual: `19.2.7`.
- `vite` ultimo publicado observado: `8.1.5`; lock actual: `8.0.16`.
- `@mui/material` ultimo publicado observado: `9.2.0`; lock actual: `9.1.1`.
- `@google/genai` ultimo publicado observado: `2.13.0`; lock actual: `2.10.0`.
- `openai` ultimo publicado observado: `6.49.0`; lock actual: `6.48.0`.
- `express` ultimo publicado observado: `5.2.1`; lock actual: `5.2.1`.

No actualizar versiones en cierre del proyecto salvo que exista razon de seguridad o entrega. El lock esta operativo y debe prevalecer.

## FASE 5 - Estado Del Codigo

### Modulos

- Auth y cuentas: `server/routes/auth.js`, `server/middleware/auth.js`.
- Admin: `server/routes/admin.js`, `adminIA.js`, `adminJuegos.js`, `adminMisiones.js`, `adminReset.js`.
- Docente: `server/routes/docente.js`, paginas de docente y componentes de actividades.
- Estudiante: `DashboardEstudiante`, `RegistroEstudiante`, `PanelMisiones`.
- Juegos: registros frontend/backend, reproductores y editores.
- IA: rutas `ia`, administracion `adminIA`, proveedores `server/lib/ia`.
- Progreso/ranking/XP: rutas `progreso`, `ranking`.
- Materias/materiales/cursos: rutas y servicios dedicados.
- Misiones: rutas, motor y seeds.
- Instalador local: scripts PowerShell/MJS.

### Componentes Principales

- `SidebarLayout`, `DashboardWidgets`, `ConfirmDialog`, `Toast`.
- Juegos: `QuizInteractivo`, `MisionNarrativa`, `JuegoDragAndDrop`, `CompletarEspacios`, `Memorama`, `LineaTiempo`, `VerdaderoFalso`.
- Editores: `EditorQuiz`, `EditorClasificador`, `GeneradorMision`, `GeneradorActividadIA`.
- Docente: `BibliotecaActividades`, `BancoPreguntas`, `LibroCalificaciones`, `FichaEstudiante`.
- Admin: modulos en `src/pages/admin/modulos/`.

### Paginas

- Admin: login, dashboard principal, generadores legacy y modulos.
- Docente: perfil, misiones, biblioteca, banco, ficha, ranking.
- Estudiante: dashboard, misiones, registro.

### Servicios

`src/services/` contiene clientes por dominio: admin, auth, banco, docente, estudiantes, gamification, IA, institucion, juegos, materiales, materias, misiones, office, pdf y retos.

### Hooks

- `useAutoRefresh.js`
- `useConfirmacion.jsx`
- `useGuardiaActividad.jsx`

### Context

No se detecto carpeta `context/` ni proveedores React globales dedicados. El estado global se maneja principalmente con servicios, cache local y estado en dashboards.

### Rutas/API

Las rutas reales estan montadas en `server/server.js`. La API es REST y se agrupa por dominio. `/api/auth` y `/api/institucion` son publicas; lo demas queda protegido por JWT salvo rutas internas que aplican permisos adicionales.

### Modelos

No hay modelos ORM. El modelo de datos se expresa en SQL (`database/*.sql`), migraciones idempotentes en `server/initDb.js` y consultas directas con `mysql2`.

## Limpieza Propuesta

### Mantener

- `src/`, excepto assets/componentes marcados como no usados hasta confirmar.
- `server/`, excepto `server/node_modules/` y posibles compatibilidades legacy si se aprueba.
- `database/`.
- `instalador/` y `.cmd` de raiz.
- `README.md`, `START_HERE.md`, `CLAUDE.md`.
- `docs/architecture/` vivo.
- `docs/specifications/`.
- `docs/COMO-AGREGAR-UN-JUEGO.md`, `docs/DEV-ENTORNO-LOCAL.md`.
- `package*.json`, `server/package*.json`.
- `.gitignore`, `.gitattributes`, `docker-compose.dev.yml`.

Justificacion: forman la fuente, contratos, despliegue local y conocimiento necesario para mantener el proyecto.

### Mover

- `docs/audit/*.docx` y `Auditoria-Panel-Docente-SPEC-004.docx` a un archivo externo de evidencias si no deben vivir en el repo fuente.
- `tools/build_auditoria_docx.py` junto a sus salidas DOCX, si se conserva el flujo de auditorias.
- `release/GamificApp.zip` a una carpeta de entregables fuera del repo.
- `runtime/` a almacenamiento de artefactos o mecanismo de descarga verificada, no al repo fuente.

Justificacion: son evidencias, salidas o binarios utiles, pero ensucian el arbol de mantenimiento.

### Archivar

- `docs/archive/` ya esta correctamente clasificado como historico.
- Auditorias antiguas de `docs/audit/` que no sean necesarias para la entrega final.
- `docs/specifications/` cerradas pueden quedarse versionadas como historial tecnico; no mover salvo que se cree una politica documental formal.

Justificacion: mantienen trazabilidad, pero no son lectura diaria.

### Eliminar

No ejecutar sin aprobacion. Candidatos:

- `.env`, `server/.env`, `CREDENCIALES.txt`
- `logs/`
- `.run/`
- `.claude/`
- `node_modules/`, `server/node_modules/`
- `dist/`
- `release/`
- `runtime/descargas/`
- `.run/env-anterior-docker.bak`
- `src/assets/react.svg`, `src/assets/vite.svg`, `src/assets/hero.png`
- `src/pages/admin/asistenteIA.jsx`, `src/pages/admin/respuestaIA.jsx`, si se confirma que el endpoint libre `/api/ia/asistente` no tendra UI
- `server/lib/iaCliente.js`, `server/lib/totalEsperado.js`, solo si se acepta retirar compatibilidad historica

Justificacion: son secretos locales, generados, dependencias regenerables, artefactos pesados o codigo no alcanzable. La eliminacion debe hacerse en una rama dedicada con verificacion posterior.


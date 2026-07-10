# SPEC-006 — Centro de Trabajo Docente (Materias + IA)

> Estado: **APROBADA** (el enunciado de Fabrizio del 2026-07-09 es el requerimiento; esta spec lo aterriza al código existente).
> Fecha: 2026-07-09
> Nota de numeración: el requerimiento pedía "SPEC-003", pero esa numeración ya está ocupada
> (SPEC-003 = Panel Admin Fase 2). Esta fase se documenta como **SPEC-006**.

## Objetivo

Convertir el apartado **Materias** del panel Docente en el centro de trabajo real del
docente: crear, reutilizar, adaptar, analizar, administrar y publicar actividades con IA,
sin romper producción ni los paneles de Administrador y Estudiante.

Principios que rigen toda la spec (heredados de CLAUDE.md):
- **Nada hardcodeado**: materias, cursos, colores, iconos, institución y nivel vienen de la BD.
- **Permisos siempre en servidor** (`puedeGestionarMateria`, docente solo sus materias/estudiantes).
- **Auditoría** en toda acción importante (`registrarAuditoria`).
- **Papelera** (soft-delete) según `POLITICA-ELIMINACION.md`; ahora también para retos.
- **Sin datos ficticios**: toda estadística se deriva de `progreso_estudiante`/`retos`.
- **No romper `configuracion_json`** de retos ya publicados (los validadores solo se aplican al escribir).
- **Reutilizar** componentes (`TablaPro`, `ModalPanel`, `EmptyState`, `SectionCard`, `LogroToast`) y el pipeline de retos existente (POST `/api/retos` → `configuracion_json` → reproductor → `POST /api/progreso` transaccional).

---

## 1. Base de datos — migración `008-centro-docente.sql` (+ reversa, idempotente en `initDb.js`)

Todo aditivo; ninguna columna existente cambia.

```sql
ALTER TABLE retos
    ADD COLUMN origen        VARCHAR(10)  NOT NULL DEFAULT 'manual',  -- 'manual' | 'ia'
    ADD COLUMN favorito      BOOLEAN      NOT NULL DEFAULT FALSE,     -- Biblioteca IA
    ADD COLUMN dificultad    VARCHAR(10)  NULL,                       -- 'facil' | 'media' | 'dificil'
    ADD COLUMN curso_id      INT UNSIGNED NULL,                       -- curso destino (opcional)
    ADD COLUMN eliminado_en  TIMESTAMP    NULL,                       -- Papelera de actividades
    ADD COLUMN eliminado_por INT UNSIGNED NULL,
    ADD CONSTRAINT fk_retos_curso FOREIGN KEY (curso_id)
        REFERENCES cursos (id) ON DELETE SET NULL;

ALTER TABLE progreso_estudiante
    ADD COLUMN observacion VARCHAR(400) NULL,      -- Libro de Calificaciones
    ADD COLUMN revisado    BOOLEAN NOT NULL DEFAULT FALSE;
```

- `origen = 'ia'` se marca cuando la configuración nace de un endpoint de IA (generar,
  sorpresa, adaptar). Es lo que clasifica la **Biblioteca IA**.
- **Papelera de retos**: `DELETE /api/retos/:id` pasa a marcar `eliminado_en` (nunca borra
  físico; el progreso/XP del estudiante no se toca). Todos los listados (`GET /api/retos`,
  `/gestion`, progreso, resumen docente) filtran `eliminado_en IS NULL`. Restaurar y purgar
  viven en la Biblioteca del docente (pestaña Papelera); la purga definitiva solo si no hay
  progreso asociado (misma filosofía que el resto de entidades).
- Los scripts `gamificapp.sql` y `produccion_defaultdb.sql` incorporan la forma final.

## 2. Arquitectura de IA reutilizable (Fase 2 — base de todo)

Problema actual: prompts y parsing duplicados por juego en `server/routes/ia.js`.

Diseño nuevo (todo en servidor; la API key no se mueve):

- **`server/lib/iaCliente.js`** — se extrae de `ia.js` el cliente Gemini, el descubrimiento
  de modelos flash y `generarConReintentos`. Expone `generarJSON({ prompt, schema })`.
- **`server/lib/actividadesIA.js`** — **registro por tipo de actividad**. Cada entrada define:
  `{ schema, construirPrompt(ctx), normalizar(data, ctx) }` para los tipos
  `quiz`, `mision`, `clasificador`, `memorama`, `linea-tiempo`, `completar`.
  Añadir un juego futuro = añadir una entrada; cero prompts duplicados.
- **Contexto institucional** (`construirContexto`): consulta en BD la materia (`nombre`,
  `nivel` del catálogo inteligente), el curso (`nombre`, `paralelo`, `nivel`) y la
  institución (`nombre`), y agrega `tema`, `dificultad`, `cantidad`, `tematica`.
  El prompt de CADA tipo recibe ese contexto: la IA siempre conoce materia, curso,
  dificultad, institución, tema y tipo.
- **`server/lib/validadoresRetos.js`** — los validadores de `configuracion_json` salen de
  `retos.js` a esta lib compartida y se agregan los de los 3 juegos nuevos. Los usan
  `retos.js` (al publicar) y los endpoints de IA (al normalizar): una sola fuente de verdad.

### Endpoints (montados tras `autenticar`, con `soloDocente` + materia asignada)

| Ruta | Descripción |
|---|---|
| `POST /api/ia/generar` | Genérico: `{ tipo, materia_id, tema, cantidad?, dificultad?, curso_id?, tematica? }` → `{ titulo, descripcion, configuracion }` validada. Sirve a los 6 tipos. |
| `POST /api/ia/sorpresa` | Fase 3: `{ materia_id, curso_id? }`. La IA decide tipo, dificultad, cantidad, tema y objetivo; se genera el contenido completo y se **guarda como BORRADOR** (`origen='ia'`). Devuelve el reto creado. Auditoría: `sorpresa-ia`. |
| `POST /api/ia/adaptar` | Fase 5: `{ reto_id, cambios: { materia_id?, curso_id?, dificultad?, tematica? } }`. Reutiliza la configuración existente como insumo del prompt ("mantén el formato, transforma el contenido"), valida con el mismo validador del tipo y guarda una **copia nueva en borrador** (el original no se toca). Auditoría: `adapto-reto`. |

Compatibilidad: `POST /api/ia/quiz` y `POST /api/ia/mision` se conservan con su contrato
actual delegando en el registro (los editores existentes no se tocan en esta fase).

## 3. Fase 1 — Tres juegos nuevos 100% genéricos

Mismo pipeline que Quiz/Clasificador/Misión: slug de tipo + `configuracion_json` + validador
+ reproductor. Ningún juego conoce materias específicas: el contenido lo pone la IA/docente.

| Juego | slug | `configuracion_json` |
|---|---|---|
| **Memorama** | `memorama` | `{ instruccion, parejas: [{ a, b }, …] }` (4–10 parejas). `a` y `b` son las dos caras que se emparejan (término↔definición, operación↔resultado, palabra↔traducción…). |
| **Línea del tiempo** | `linea-tiempo` | `{ instruccion, titulo_secuencia, eventos: [{ texto, etiqueta? }, …] }` (3–8 eventos **en orden correcto**; el reproductor los baraja). Sirve para fechas, procesos, pasos de un algoritmo, etc. |
| **Completar espacios** | `completar` | `{ instruccion, frases: [{ texto (con `___`), opciones: [3–4], correcta }, …] }` (2–8 frases). |

- Validadores en `validadoresRetos.js` (mínimos de cantidad, textos no vacíos, `correcta`
  incluida en `opciones`, exactamente un `___` por frase).
- **Creación (docente)**: el docente solo escribe el tema (+ cantidad y dificultad); la IA
  genera todo (parejas, eventos, frases, distractores) vía `POST /api/ia/generar`. Un
  componente único `GeneradorActividadIA` (frontend) sirve a los 3 juegos: formulario →
  vista previa editable → «Guardar borrador» o «Publicar» (mismo `publicarReto`, con candado
  anti doble publicación). El Clasificador gana también «✨ Generar con IA» rellenando su
  editor actual (misma ruta genérica, tipo `clasificador`).
- **Juego (estudiante)**: 3 reproductores nuevos en `src/components/juegos/`
  (`Memorama.jsx`, `LineaTiempo.jsx`, `CompletarEspacios.jsx`), integrados EXACTAMENTE igual
  que los existentes: reciben `{ reto, estudianteId }`, cuentan aciertos y llaman a
  `gamificationService.completarReto` (XP transaccional intacto). La pestaña **Juegos** del
  estudiante deja de pedir solo `tipo=clasificador`: lista todos los retos publicados cuyo
  tipo no sea quiz/mision y despacha el reproductor por `tipo` (registro
  `JUEGOS_UI` en frontend, análogo al de validadores). XP = `PUNTOS_POR_ACIERTO × ítems`.

## 4. Fase 4 — Biblioteca IA (evolución de la Biblioteca, sin duplicar componentes)

`BibliotecaActividades` (SPEC-004) ya lista/busca/filtra/duplica/archiva. Se amplía:

- `GET /api/retos/gestion` devuelve además `origen, favorito, dificultad, curso_id, curso`.
- Filtros nuevos: **origen** (✨ IA / manual), **favoritas**, **curso**, **dificultad** —
  además de los existentes (materia, tipo, estado, fecha, búsqueda, orden).
- «Más utilizadas»: orden por `veces_jugado` (ya existe).
- Acciones nuevas por fila: ⭐ favorito (`PATCH /api/retos/:id { favorito }`), 👁 vista
  previa (modal con la configuración renderizada en modo lectura), ✨ **Adaptar con IA**
  (modal de Fase 5), 📊 estadísticas (Fase 8), 🗑 eliminar → Papelera, y pestaña
  **Papelera** con restaurar/purgar.
- Duplicar/editar/publicar/archivar ya existen y no cambian.

## 5. Fase 6 — Pestaña «Actividades» de la materia como centro de administración

La pestaña Actividades de la vista de materia deja de ser una lista plana: **reutiliza
`BibliotecaActividades` con prop `materiaId`** (pre-filtrada y sin selector de materia).
Así borradores/publicadas/archivadas/papelera, buscador, filtros, orden, duplicar, vista
previa, editar, publicar/despublicar, archivar, eliminar y estadísticas están disponibles
dentro de la materia con **cero componentes duplicados**, todo sobre `TablaPro`.
«Programadas» queda fuera de alcance v1 (no existe fecha de publicación programada en BD;
se anota en MASTER_PLAN como mejora con migración propia).

## 6. Fase 7 — Libro de Calificaciones real

`LibroCalificaciones` se reescribe sobre `TablaPro` (una consulta por estudiante como hoy,
filtrado por materia):

- Fila = estudiante × actividad: estado, %, XP, fecha, chip «Revisado», observación.
- **Detalle** (`ModalPanel`): datos del intento + acciones:
  - Editar **observación** y marcar **revisado** → `PATCH /api/progreso/:estudianteId/:retoId`
    (endpoint nuevo, docente solo sobre SUS estudiantes — misma regla que resetear PIN).
  - **Ajustar XP manualmente** → reutiliza `POST /api/progreso` (docente ya autorizado;
    la transacción `FOR UPDATE` e idempotencia NO se tocan; solo abona mejoras, el
    cálculo automático sigue intacto).
- Todo ajuste manual registra auditoría (`ajusto-progreso` con detalle del cambio).
- «Recalcular» = volver a consultar la API (el cálculo siempre vivió en servidor).

## 7. Fase 8 — Estadísticas por actividad

`GET /api/retos/:id/estadisticas` (docente con materia asignada): derivado 100% de la BD —
intentos (`COUNT progreso`), completados, promedio de `porcentaje`, XP total entregada,
mejor/peor resultado, primer/último intento, estado y `veces_jugado`. Se muestra en un
modal 📊 desde la Biblioteca/pestaña Actividades con `StatCard`s.

**Fuera de alcance v1** (prohibido el dato ficticio): «pregunta más fallada/acertada» y
«tiempo promedio» — la BD no registra respuestas por pregunta ni duración de intento.
Requiere una columna `detalle_json` en `progreso_estudiante` + cambios en todos los
reproductores → se anota en MASTER_PLAN como spec propia.

## 8. Fase 9 — UX/UI y sincronización

- El rediseño visual completo del apartado Materias se ejecuta **al final**, cuando todas
  las funcionalidades estén verificadas (regla del enunciado). En esta spec las vistas
  nuevas usan la identidad existente (tokens, tarjetas pastel, pestañas píldora,
  responsive ≥375px, `prefers-reduced-motion`).
- Sincronización: fuente única ya auditada (`materias` + `docente_materia`,
  `Auditoria-Sincronizacion-Global-v1.md`). Los juegos nuevos usan el MISMO pipeline
  publicar→listar, así que Admin→Docente→Estudiante no cambia; se verifica que ninguna
  vista de estudiante muestre borradores ni retos en papelera (el servidor filtra).

## 9. Plan de implementación (cada paso compila)

| Paso | Contenido |
|---|---|
| 1 | Migración 008 (+reversa) + initDb + scripts de esquema |
| 2 | `iaCliente.js`, `actividadesIA.js`, `validadoresRetos.js`; `ia.js` reescrito (generar/sorpresa/adaptar + compat) |
| 3 | `retos.js`: metadatos nuevos, borrador en POST, favorito en PATCH, DELETE soft + restaurar/purgar, filtros de papelera, estadísticas |
| 4 | Reproductores de los 3 juegos + despacho por tipo en el estudiante |
| 5 | `GeneradorActividadIA` + IA en Clasificador + ✨ Actividad sorpresa en la pestaña Crear |
| 6 | Biblioteca ampliada + pestaña Actividades de materia reutilizándola |
| 7 | Libro de Calificaciones + `PATCH /api/progreso` de observación/revisado |
| 8 | Build + lint + auditoría de hardcodeos + actualización de CURRENT_STATE/MASTER_PLAN |

## 10. Fuera de alcance explícito

- Actividades **programadas** (fecha de publicación futura) — requiere migración propia.
- Estadísticas por pregunta y tiempo promedio (sin dato en BD).
- Modificar los generadores actuales de Quiz/Misión (siguen funcionando tal cual).
- Sub-rutas de React Router; WebSockets; cambios al panel Admin.
- Rediseño visual profundo de Materias (sprint posterior, Fase 9 del enunciado).

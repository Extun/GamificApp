# SPEC-010 — Banco de Preguntas (Repositorio de Preguntas)

> Estado: ✅ **APROBADA — lista para implementación** (Fabrizio, 2026-07-15).
> Versión: 1.0 (final) · Consolida el rediseño arquitectónico previo.
> Autor: Arquitectura · Sprint 1 · Prioridad: Alta.
>
> **Nombre visible para docentes:** *Repositorio de Preguntas*.
> **Tabla física y nombre técnico:** `banco_preguntas` (sin cambios de esquema por el renombre).

---

## 0. Enfoque aprobado

El Banco de Preguntas es una **capa aditiva y opcional**: una biblioteca de
contenido reutilizable, **nunca** un reemplazo del sistema actual. No cambia cómo
funcionan hoy las actividades, la IA, los juegos, el XP, el ranking ni las misiones.

Decisiones de arquitectura aprobadas:

| Regla del proyecto | Cómo la cumple esta SPEC |
|---|---|
| Reutilizar la BD existente | Solo tablas nuevas; `materia_id` con la **misma FK que `retos`** |
| Compatibilidad con actividades históricas | Las actividades no cambian de contrato; ver modelo **híbrido** (§4) |
| Compatibilidad con `configuracion_json` | El contenido reutilizado conserva la forma actual por tipo (§5) |
| Compatibilidad con IA | `/api/ia/generar` intacto; el banco **añade** un modo que reusa sus schemas/prompts (§8) |
| Compatibilidad con los 6 juegos | `contenido_json` = espejo del ítem que cada juego ya usa; validadores/reproductores no se tocan |
| Nomenclatura español | Tablas, campos y rutas en español |
| Sin migración obligatoria | `010-banco-preguntas.sql` aditiva e idempotente; sin aplicarla la app funciona igual |
| Adicional, no reemplazo | Opt-in en editor e IA; los flujos actuales siguen intactos |

---

## 1. Objetivo

Ofrecer a docentes y administradores un **Repositorio de Preguntas** donde guardar,
buscar, reutilizar y curar preguntas (creadas a mano o generadas por IA), para
insertarlas en actividades nuevas sin volver a redactarlas — con **trazabilidad**
de qué pregunta del repositorio se usó en cada actividad, sin romper las
actividades históricas.

---

## 2. Alcance

### Incluye
✅ Tablas aditivas en español (`banco_preguntas`, `banco_pregunta_opciones`).
✅ CRUD de preguntas (crear, editar, archivar, duplicar).
✅ Búsqueda y filtros (materia, tema, tipo, dificultad, estado, texto).
✅ Insertar preguntas del repositorio al crear/editar una actividad (opt-in),
   con modelo **híbrido: id de la pregunta + snapshot** (§4).
✅ Guardar en el repositorio preguntas generadas por IA con estado `pendiente`.
✅ Extraer al repositorio preguntas de una actividad ya existente.
✅ Contadores de uso en la propia fila (`veces_utilizada`, `ultima_utilizacion`).
✅ Preparación (solo documental) para las Extensiones futuras (§12).

### No incluye
❌ Reemplazar el almacenamiento actual de preguntas en `configuracion_json`.
❌ Tabla `temas` / catálogo jerárquico (el tema sigue siendo texto libre).
❌ Referencias vivas actividad→banco (la actividad guarda snapshot propio; §4).
❌ **Tabla de historial de uso** (no se crea en esta versión; ver §12).
❌ Migración obligatoria.
❌ Cambios en Login, JWT, Dashboard, XP, Ranking, Misiones, permisos o arquitectura
   de juegos.

---

## 3. Modelo de datos — migración **aditiva y opcional** `010-banco-preguntas.sql`

Idempotente en `initDb.js`, con reversa. **Ninguna tabla existente cambia.** Sin
aplicar la migración, la app funciona exactamente igual que hoy.

### 3.1 `banco_preguntas`

Una fila = una pregunta reutilizable. El **contenido** se guarda como JSON con la
**misma forma que un ítem del juego correspondiente** (ver §5), para que insertarlo
en un `configuracion_json` sea directo y sin transformaciones.

```
banco_preguntas
  id               INT UNSIGNED PK AUTO_INCREMENT
  materia_id       TINYINT UNSIGNED NOT NULL   -- FK a materias (igual que retos)
  tema             VARCHAR(120) NULL           -- string libre, mismo concepto que hoy
  tipo             VARCHAR(30)  NOT NULL        -- slug del juego: quiz | clasificador | memorama | linea-tiempo | completar | mision
  dificultad       VARCHAR(10)  NULL            -- facil | media | dificil (mismos valores que la IA)
  enunciado        VARCHAR(255) NULL            -- texto buscable / resumen legible
  contenido_json   JSON NOT NULL               -- el ítem con la forma exacta que espera el juego (§5)
  explicacion      TEXT NULL                    -- justificación/retroalimentación (opcional)
  etiquetas        VARCHAR(255) NULL            -- tags separados por coma (filtros)
  origen           VARCHAR(10)  NOT NULL DEFAULT 'manual'  -- manual | ia
  estado           ENUM('pendiente','aprobada','archivada') NOT NULL DEFAULT 'aprobada'
  veces_utilizada  INT UNSIGNED NOT NULL DEFAULT 0     -- se incrementa al insertar en una actividad
  ultima_utilizacion DATETIME NULL                     -- fecha del último uso
  tiempo_estimado  SMALLINT UNSIGNED NULL       -- preparación (Extensiones futuras)
  creado_por       INT UNSIGNED NULL            -- FK a usuarios (docente/admin)
  creado_en        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  actualizado_en   TIMESTAMP NULL
  PRIMARY KEY (id)
  FK fk_banco_materia (materia_id) -> materias(id)
  INDEX idx_banco_materia_tipo (materia_id, tipo)
  INDEX idx_banco_estado (estado)
```

Notas:
- `estado`, `dificultad`, `origen`, `tipo` usan **exactamente los mismos valores**
  que ya circulan en `retos`/`actividadesIA.js` (cero vocabulario nuevo).
- IA nace `pendiente`; manual nace `aprobada`; `archivada` = no ofrecible.
- `veces_utilizada` / `ultima_utilizacion` son **contadores denormalizados** que
  sustituyen, en esta versión, a una tabla de historial. Se actualizan al insertar
  la pregunta en una actividad. No hay tabla de eventos de uso (§12).

### 3.2 `banco_pregunta_opciones` (opcional, solo tipos con opciones)

Normalización de alternativas para búsqueda/edición fina en tipos de opción
múltiple. Es **redundante con `contenido_json`** (la fuente que se copia al
snapshot); existe solo para búsquedas/reportes futuros y puede omitirse en la
Fase 1 sin perder funcionalidad.

```
banco_pregunta_opciones
  id           INT UNSIGNED PK AUTO_INCREMENT
  pregunta_id  INT UNSIGNED NOT NULL   -- FK banco_preguntas(id) ON DELETE CASCADE
  orden        TINYINT UNSIGNED NOT NULL
  texto        VARCHAR(255) NOT NULL
  es_correcta  BOOLEAN NOT NULL DEFAULT FALSE
  INDEX idx_opciones_pregunta (pregunta_id)
```

---

## 4. Modelo híbrido: relación repositorio ↔ actividad

**Las actividades NO cambian de contrato.** Siguen guardando sus preguntas dentro de
`retos.configuracion_json`, con su forma y validadores actuales. Lo que se añade es,
por cada pregunta insertada desde el repositorio, un par **(id + snapshot)**:

- **`banco_id`** — id de la pregunta del repositorio de la que proviene el ítem
  (cuando exista; las preguntas escritas a mano en el editor no lo tienen).
- **`snapshot`** — copia del contenido de la pregunta **en el momento de insertarla**
  (es el ítem con la forma del juego; §5). El snapshot **es** lo que reproduce el
  juego; el `banco_id` es solo trazabilidad.

Persistencia (aditiva, dentro de `configuracion_json`, sin romper §12):
- Los ítems del arreglo del juego (`preguntas[]`, `frases[]`, `parejas[]`,
  `eventos[]`, `categorias[]`, `desafios[]`) siguen teniendo **exactamente su forma
  actual** → los reproductores y validadores no notan diferencia.
- La trazabilidad se guarda como metadato aditivo junto a cada ítem (p. ej. un campo
  `_banco_id` en el propio ítem, o un mapa `banco_ids` a nivel de
  `configuracion_json`). Es **opcional e ignorado por los juegos**; su ausencia no
  afecta nada. Las actividades históricas —que no lo tienen— siguen funcionando.

Garantías del modelo híbrido:
- **Trazabilidad:** se sabe qué pregunta del repositorio alimentó cada ítem →
  permite `veces_utilizada`/`ultima_utilizacion` y futura analítica (§12).
- **Inmunidad histórica:** como el snapshot vive dentro de la actividad, editar,
  archivar o borrar la pregunta en el repositorio **jamás** altera una actividad ya
  creada. El `banco_id` puede quedar "colgado" sin consecuencias: el snapshot manda.

Camino inverso (poblar el repositorio desde lo que ya existe):
- Acción "Guardar en repositorio" sobre una actividad existente: extrae sus ítems de
  `configuracion_json` y crea filas en `banco_preguntas` (estado `aprobada`,
  `origen='manual'`). No modifica la actividad.

---

## 5. Forma de `contenido_json` / snapshot por tipo (espejo del juego)

Cada pregunta del repositorio guarda **un ítem** con la forma que ese juego ya usa
dentro de su `configuracion_json` (definidas en `server/lib/actividadesIA.js`). El
snapshot insertado en la actividad tiene esa misma forma → "insertar" es concatenar
ítems, sin transformar:

- **quiz** → elemento de `preguntas[]`: `{ pregunta, alternativas:{A,B,C,D}, correcta, justificacion }`
- **completar** → elemento de `frases[]`: `{ texto, opciones[], correcta }`
- **memorama** → elemento de `parejas[]`: `{ a, b }`
- **linea-tiempo** → elemento de `eventos[]`: `{ texto, etiqueta? }`
- **clasificador** → elemento de `categorias[]`: `{ nombre, elementos[] }`
- **mision** → elemento de `desafios[]`: `{ narrativa, pregunta, alternativas, correcta, pista, exito }`

El repositorio **no inventa un formato nuevo**: reusa el contrato existente por tipo.
Un juego nuevo (futuro) solo declara la forma de su ítem, igual que hoy declara su
entrada en `ACTIVIDADES_IA` y su validador.

> Fase 1 puede limitarse a los 4 tipos atómicos (quiz, completar, memorama,
> linea-tiempo) y habilitar los compuestos (mision, clasificador) en Fase 2.

---

## 6. API (rutas nuevas; ninguna existente cambia)

Router nuevo `server/routes/bancoPreguntas.js`, prefijo `/api/banco`. Todas validan
permisos **en servidor** (docente gestiona lo suyo según permisos; admin gestiona
todo). Reutiliza el middleware de auth/permisos existente; **no** se crean permisos
nuevos en Fase 1 (se cuelga de los permisos de contenido docente ya definidos).

```
GET    /api/banco                 -> listar/buscar (query: materia, tema, tipo, dificultad, estado, q, page)
GET    /api/banco/:id             -> detalle
POST   /api/banco                 -> crear pregunta manual (estado aprobada)
PUT    /api/banco/:id             -> editar
POST   /api/banco/:id/duplicar    -> duplicar
PATCH  /api/banco/:id/estado      -> aprobar / archivar
DELETE /api/banco/:id             -> archivar si tiene uso; borrado físico solo si veces_utilizada = 0 (§9)
POST   /api/banco/importar        -> alta masiva (extraídas de actividad o pegadas)
POST   /api/banco/generar-ia      -> genera preguntas con IA y las guarda como 'pendiente' (§8)
```

Al insertar preguntas en una actividad, el endpoint de creación/edición de retos
(sin cambiar su contrato público) incrementa `veces_utilizada` y actualiza
`ultima_utilizacion` de las preguntas usadas que traigan `banco_id`.

---

## 7. Frontend (módulo nuevo, sin tocar los flujos actuales)

Nueva página **"Repositorio de Preguntas"** para Administrador y Docente (según
permisos). Reutiliza componentes existentes (§4 de `CLAUDE.md`): `DashboardWidgets`
(`SectionCard`, `StatCard`, `EmptyState`, `QuickActionCard`), `TablaPro`/`ModalPanel`,
`ArchivoChip`. CSS con tokens de tema, responsive obligatorio.

Funciones: crear, editar, archivar, duplicar, buscar, filtrar, importar, generar con
IA y **revisar/aprobar** preguntas pendientes de IA.

Integración con el editor de actividades: se **añade** un botón "Elegir del
repositorio" en el flujo actual de creación/edición. Sin ese botón, el editor
funciona exactamente como hoy (crear a mano o con IA). El repositorio es opt-in.

---

## 8. Integración con IA (aditiva, no reemplaza el flujo actual)

**El flujo actual se conserva:** `/api/ia/generar` sigue creando actividades
completas normalizadas a `configuracion_json` (no se toca el contrato de
`actividadesIA.js`). El repositorio **añade** un segundo modo:

```
POST /api/banco/generar-ia
  IA (mismos prompts/schemas de ACTIVIDADES_IA)
   -> genera ítems del tipo pedido
   -> se guardan como banco_preguntas (estado 'pendiente', origen 'ia')
   -> docente revisa y aprueba
   -> quedan disponibles para insertar en actividades
```

Reutiliza `server/lib/iaCliente.js` y los `schema`/`construirPrompt` de
`ACTIVIDADES_IA` sin modificarlos: en vez de ensamblar una actividad, descompone los
ítems generados y los persiste en el repositorio. Cero prompts nuevos, cero
duplicación.

---

## 9. Reglas de negocio

1. Una pregunta pertenece a **una materia** y a **un tema** (texto libre); nunca a
   una actividad.
2. Puede reutilizarse infinitamente: al usarla se guarda **id + snapshot** en la
   actividad (modelo híbrido, §4) y se actualizan sus contadores.
3. Preguntas de IA nacen en estado **`pendiente`**; solo un docente/admin con
   permiso las **aprueba**.
4. Preguntas **archivadas** no aparecen en el selector de nuevas actividades.
5. Borrado: si `veces_utilizada > 0` la pregunta **se archiva** (no se borra física).
   Solo se permite borrado físico si nunca se usó. Como la actividad guarda su propio
   snapshot, archivar/borrar en el repositorio **jamás** afecta actividades creadas.
6. El repositorio **no** es requisito para crear actividades: los flujos manual e IA
   actuales siguen funcionando sin tocarlo.

---

## 10. Compatibilidad y no-regresión (checklist)

- ✅ **BD existente reutilizada:** solo tablas nuevas; `materias`, `retos`,
  `usuarios` intactas.
- ✅ **Actividades existentes:** ni una fila cambia; siguen reproduciéndose igual.
- ✅ **`configuracion_json`:** formato inalterado; snapshots con la forma actual por
  tipo (§5); trazabilidad como metadato aditivo ignorado por los juegos. §12
  (CLAUDE.md) respetada.
- ✅ **IA:** contrato de `actividadesIA.js` y `/api/ia/generar` intactos.
- ✅ **Juegos:** reproductores y `validadoresRetos.js` sin cambios.
- ✅ **Nomenclatura español** en tablas, campos y rutas.
- ✅ **Sin migración obligatoria:** `010-banco-preguntas.sql` aditiva e idempotente.
- ✅ **Adicional, no reemplazo:** opt-in en editor e IA.
- ✅ **Congelado:** Login, JWT, Dashboard, XP, Ranking, Misiones, permisos y
  arquitectura de juegos no se modifican.

---

## 11. Fases sugeridas (cada una compila y es verificable)

- **Fase 1 — Biblioteca básica:** migración aditiva + `banco_preguntas` + CRUD +
  búsqueda/filtros + página "Repositorio de Preguntas". Tipos atómicos (quiz,
  completar, memorama, linea-tiempo). Sin IA, sin selector en editor.
- **Fase 2 — Reutilización e IA:** botón "Elegir del repositorio" en el editor
  (id + snapshot en `configuracion_json`, con actualización de contadores),
  "Guardar en repositorio" desde actividad existente, `POST /api/banco/generar-ia`
  con revisión/aprobación de pendientes, tipos compuestos (mision, clasificador).

---

## 12. Extensiones futuras (documentadas, **no** se implementan en esta versión)

Esta v1.0 deja el esquema preparado para crecer sin refactors, pero **ninguna** de
las siguientes se construye ahora. Cada una requerirá su propia SPEC aprobada:

- **Estadísticas por pregunta** — tasa de acierto, tiempo de respuesta, dificultad
  observada. Requerirá una tabla de historial (`banco_pregunta_uso`) que en esta
  versión **no se crea**; hoy solo existen los contadores `veces_utilizada` /
  `ultima_utilizacion`.
- **Dificultad automática** — ajustar `dificultad` según el desempeño real.
- **IA de mejora** — sugerir reformulaciones o mejores distractores de una pregunta
  existente.
- **Multimedia** — imágenes/audio en preguntas (usaría el patrón base64 en MySQL ya
  presente en materiales).
- **Analítica** — reportes agregados por materia/tema/curso.
- **Versionado** — historial de ediciones de una pregunta y elección de versión.

---

## 13. Casos de prueba

| # | Acción | Resultado esperado |
|---|---|---|
| 1 | Crear pregunta manual | `estado='aprobada'`, `origen='manual'`, `veces_utilizada=0` |
| 2 | Generar preguntas con IA | `estado='pendiente'`, `origen='ia'` |
| 3 | Aprobar pregunta pendiente | Pasa a `aprobada`; queda ofrecible |
| 4 | Insertar pregunta del repositorio en actividad nueva | La actividad guarda **id + snapshot**; el juego la reproduce igual; sube `veces_utilizada` y `ultima_utilizacion` |
| 5 | Editar la pregunta en el repositorio tras usarla | La actividad previa **no cambia** (usa su snapshot) |
| 6 | Archivar pregunta usada | No aparece en el selector; actividades previas siguen funcionando |
| 7 | Borrar pregunta con `veces_utilizada>0` | Se archiva (no borrado físico); con 0 usos → borrado físico permitido |
| 8 | No aplicar la migración 010 | La app funciona exactamente como antes del repositorio |
| 9 | Extraer preguntas de una actividad existente | Nuevas filas en el repositorio; la actividad no cambia |

---

## 14. Criterios de aceptación

✔ CRUD completo, búsqueda y filtros.
✔ Importación / extracción desde actividades.
✔ IA integrada como modo aditivo (pendiente → aprobación).
✔ Actividades reutilizan preguntas con modelo **híbrido (id + snapshot)**;
  `configuracion_json` intacto y actividades históricas inmunes.
✔ Contadores `veces_utilizada` / `ultima_utilizacion` actualizados al usar.
✔ Compatible con los 6 juegos actuales y con futuros (mismo contrato por tipo).
✔ Ninguna migración obligatoria; app estable con o sin repositorio.
✔ Login, JWT, Dashboard, XP, Ranking, Misiones, permisos y juegos sin cambios.

---

## 15. No modificar

Prohibido tocar en este sprint: Login, JWT, Dashboard, XP, Ranking, Misiones,
sistema de permisos y arquitectura de juegos. Cualquier roce con estas áreas
requiere su propia SPEC aprobada (§10 `CLAUDE.md`).

---

# 16. Diseño Técnico (Sprint 1.1)

> Este apartado detalla el **cómo** para arrancar la implementación. No incluye
> código. Todo lo aquí descrito respeta las secciones 0–15.

## 16.1 Modelo de datos — detalle de implementación

### 16.1.1 Migración `010-banco-preguntas.sql` (aditiva, idempotente, reversible)

Se aplica igual que las anteriores: SQL idempotente (`CREATE TABLE IF NOT EXISTS`,
`ADD COLUMN` guardados por comprobación previa) registrado en `server/initDb.js`,
con su bloque de reversa documentado. Orden de creación para respetar FKs:

1. `banco_preguntas` — FK a `materias(id)` (ya existe) y, opcionalmente, a
   `usuarios(id)` en `creado_por`. Igual que `retos`, la FK a `usuarios` se agrega
   **después** de garantizar que la tabla existe (patrón `initDb.js` ya usado en
   `fk_retos_docente`).
2. `banco_pregunta_opciones` — FK a `banco_preguntas(id) ON DELETE CASCADE`.

Sin aplicar la migración, ningún endpoint del banco existe todavía, pero el resto de
la app arranca y funciona igual (§10, caso de prueba #8).

### 16.1.2 Columnas — tipos, defaults y reglas

| Columna | Tipo | Default | Regla |
|---|---|---|---|
| `id` | INT UNSIGNED PK AI | — | — |
| `materia_id` | TINYINT UNSIGNED | — | NOT NULL, FK `materias(id)` |
| `tema` | VARCHAR(120) | NULL | Texto libre; se usa igual que en `actividadesIA.js` |
| `tipo` | VARCHAR(30) | — | Slug del juego; validado contra la lista de tipos soportados |
| `dificultad` | VARCHAR(10) | NULL | `facil` \| `media` \| `dificil` |
| `enunciado` | VARCHAR(255) | NULL | Resumen legible/buscable derivado de `contenido_json` |
| `contenido_json` | JSON | — | NOT NULL; forma del ítem del juego (§5) |
| `explicacion` | TEXT | NULL | Retroalimentación opcional |
| `etiquetas` | VARCHAR(255) | NULL | Tags separados por coma |
| `origen` | VARCHAR(10) | `'manual'` | `manual` \| `ia` |
| `estado` | ENUM | `'aprobada'` | `pendiente` \| `aprobada` \| `archivada` |
| `veces_utilizada` | INT UNSIGNED | 0 | Se incrementa al insertar en actividad |
| `ultima_utilizacion` | DATETIME | NULL | Fecha del último uso |
| `tiempo_estimado` | SMALLINT UNSIGNED | NULL | Reservada (Extensiones futuras) |
| `creado_por` | INT UNSIGNED | NULL | FK `usuarios(id)` |
| `creado_en` | TIMESTAMP | CURRENT_TIMESTAMP | — |
| `actualizado_en` | TIMESTAMP | NULL | Se setea en cada `PUT` |

Índices: `idx_banco_materia_tipo (materia_id, tipo)`, `idx_banco_estado (estado)`.

### 16.1.3 Derivación de `enunciado`

Para hacer buscable cualquier tipo, al crear/editar se calcula un `enunciado`
resumen desde `contenido_json` según el tipo (server-side, en el servicio):

| tipo | `enunciado` = |
|---|---|
| quiz | campo `pregunta` |
| completar | campo `texto` (frase con `___`) |
| memorama | `"{a} ↔ {b}"` |
| linea-tiempo | campo `texto` del evento |
| clasificador | `"{nombre}: {n} elementos"` |
| mision | campo `pregunta` del desafío |

### 16.1.4 Snapshot en la actividad (modelo híbrido)

No hay tabla nueva para esto: la trazabilidad viaja **dentro** de
`retos.configuracion_json`, como metadato aditivo por ítem. Convención:

- Cada ítem del arreglo del juego conserva su forma actual **y** puede llevar una
  clave extra `_banco_id` (número). Los reproductores y validadores existentes
  ignoran claves que no conocen → sin regresión (§12 CLAUDE.md, §10 de esta SPEC).
- El ítem **es** el snapshot: si la pregunta del banco cambia luego, la actividad
  conserva la copia. `_banco_id` solo sirve para contar uso y para analítica futura.
- Ítems escritos a mano en el editor simplemente **no** llevan `_banco_id`.

## 16.2 API — contrato detallado

Router `server/routes/bancoPreguntas.js`, montado en `/api/banco`. Auth y permisos
con el middleware existente; sin permisos nuevos en Fase 1 (se apoya en el permiso
de gestión de contenido docente). Respuestas JSON con la envoltura estándar del
proyecto.

### `GET /api/banco`
Listar/buscar con filtros. **Query params:** `materia`, `tema`, `tipo`,
`dificultad`, `estado`, `q` (texto en `enunciado`/`etiquetas`), `page`, `porPagina`.
Docente ve las suyas + las compartidas según permiso; admin ve todas. Ordena por
`actualizado_en` desc. **Devuelve:** `{ items:[...], total, page }`.

### `GET /api/banco/:id`
Detalle de una pregunta (incluye `contenido_json` completo). 404 si no existe o no
visible para el rol.

### `POST /api/banco`
Crear pregunta manual. **Body:** `{ materia_id, tema, tipo, dificultad, contenido_json, explicacion?, etiquetas? }`.
Server valida `contenido_json` con el **validador existente por tipo**
(`validadoresRetos.js`, aplicado a un arreglo de un solo ítem). Nace
`estado='aprobada'`, `origen='manual'`, `veces_utilizada=0`. **201** con la fila.

### `PUT /api/banco/:id`
Editar. Revalida `contenido_json`, recalcula `enunciado`, setea `actualizado_en`.
No cambia `veces_utilizada` ni afecta actividades ya creadas (usan snapshot).

### `POST /api/banco/:id/duplicar`
Crea copia con `estado='aprobada'`, `veces_utilizada=0`, `ultima_utilizacion=NULL`.

### `PATCH /api/banco/:id/estado`
**Body:** `{ estado }`. Transiciones válidas: `pendiente→aprobada`,
`(pendiente|aprobada)→archivada`, `archivada→aprobada` (reactivar). Aprobar exige
permiso docente/admin.

### `DELETE /api/banco/:id`
Si `veces_utilizada > 0` → responde archivando (no borra físico) e informa el motivo.
Si `veces_utilizada = 0` → borrado físico (cascade a `banco_pregunta_opciones`).

### `POST /api/banco/importar`
Alta masiva. **Body:** `{ materia_id, tema?, tipo, items:[contenido_json...] }` o
`{ desde_reto_id }` para extraer los ítems de una actividad existente. Cada ítem se
valida por tipo; nace `aprobada`/`manual`. Devuelve resumen `{ creadas, rechazadas }`.

### `POST /api/banco/generar-ia` *(Fase 2)*
**Body:** `{ materia_id, curso_id?, tema, tipo, dificultad, cantidad }`. Reutiliza
`iaCliente.js` + `ACTIVIDADES_IA[tipo]` (mismo `schema`/`construirPrompt`), descompone
la respuesta en ítems y los guarda `estado='pendiente'`, `origen='ia'`. Devuelve las
preguntas creadas para revisión.

### Actualización de contadores (no es endpoint propio)
Al **crear/editar un reto** que incluya ítems con `_banco_id` (flujo existente de
`server/routes/retos.js`, sin cambiar su contrato público), el servicio incrementa
`veces_utilizada` y fija `ultima_utilizacion = NOW()` de esas preguntas, en la misma
operación. Idempotencia razonable: si se re-guarda el mismo reto no se recontabiliza
(se comparan los `_banco_id` ya presentes antes del cambio).

## 16.3 Servicios y capas (reutilización)

- **Frontend:** `src/services/bancoService.js` (nuevo, uno por dominio, patrón de los
  demás en `src/services/`). Consume `/api/banco`.
- **Backend:** `server/routes/bancoPreguntas.js` + helpers en `server/lib/` si hace
  falta; **reutiliza** `VALIDADORES_CONFIG` de `validadoresRetos.js` para validar el
  `contenido_json` por tipo, y `ACTIVIDADES_IA` para la generación (Fase 2). Nada de
  esos módulos se modifica; solo se consumen.

## 16.4 Flujo del docente

**A. Crear pregunta manual**
1. Docente entra a *Repositorio de Preguntas* → "Nueva pregunta".
2. Elige **materia**, escribe **tema**, elige **tipo** de juego y **dificultad**.
3. El formulario muestra los campos propios del tipo (espejo del editor del juego).
4. Guarda → `POST /api/banco` → aparece en la lista como **Aprobada**.

**B. Reutilizar en una actividad**
1. En el editor de actividades (flujo actual), pulsa "Elegir del repositorio".
2. Se abre un selector filtrable (materia/tema/tipo/dificultad/texto) que muestra solo
   preguntas **aprobadas** del tipo compatible con la actividad.
3. Marca varias → se insertan como ítems (con `_banco_id`) en la actividad.
4. Puede seguir añadiendo preguntas a mano o con IA como hoy.
5. Al guardar la actividad: se persiste el snapshot y suben los contadores de uso.

**C. Generar con IA y curar** *(Fase 2)*
1. "Generar con IA" en el repositorio → materia/tema/tipo/dificultad/cantidad.
2. Las preguntas llegan como **Pendientes**.
3. El docente revisa una por una: editar, **Aprobar** o **Archivar**.
4. Las aprobadas quedan disponibles para el flujo B.

**D. Extraer de una actividad existente**
1. Desde una actividad, "Guardar en repositorio".
2. Sus ítems se crean como preguntas **Aprobadas**; la actividad no cambia.

**E. Mantenimiento**
- Buscar/filtrar, **duplicar**, **editar**, **archivar**. Borrar solo si nunca se
  usó; si tiene uso, la acción archiva y lo explica.

## 16.5 Wireframe textual

**Pantalla: Repositorio de Preguntas (lista)**
```
┌───────────────────────────────────────────────────────────────────┐
│ Repositorio de Preguntas                       [ + Nueva pregunta ] │
│                                              [ ✨ Generar con IA ]   │  ← Fase 2
├───────────────────────────────────────────────────────────────────┤
│ Filtros:  [Materia ▾] [Tema…] [Tipo ▾] [Dificultad ▾] [Estado ▾]   │
│           [🔍 Buscar…                                 ]              │
├───────────────────────────────────────────────────────────────────┤
│ Tarjetas de resumen (StatCard):                                     │
│   [ Total: N ]  [ Pendientes: N ]  [ Aprobadas: N ]  [ Archivadas ] │
├───────────────────────────────────────────────────────────────────┤
│ TablaPro:                                                           │
│  Enunciado            │ Materia │ Tema   │ Tipo    │ Dif │ Estado   │ Usos │ ⋯ │
│  ¿Cuánto es 2+2?      │ Mate    │ Sumas  │ Quiz    │ Fác │ Aprobada │  3   │ ⋯ │
│  Ordena el ciclo…     │ CCNN    │ Agua   │ Línea   │ Med │ Pendiente│  0   │ ⋯ │
│  …                                                                  │
│  (EmptyState si no hay: "Aún no hay preguntas. Crea la primera.")   │
└───────────────────────────────────────────────────────────────────┘
Menú ⋯ por fila: Editar · Duplicar · Aprobar/Archivar · Eliminar
```

**Modal: Nueva / Editar pregunta**
```
┌── Nueva pregunta ───────────────────────────────────────────┐
│ Materia [ ▾ ]   Tema [ __________ ]   Dificultad [ ▾ ]       │
│ Tipo de juego [ Quiz ▾ ]                                     │
├─────────────────────────────────────────────────────────────┤
│ (campos según tipo — ejemplo Quiz)                          │
│ Pregunta:      [ _______________________________________ ]  │
│ Alternativa A: [ ________ ]   ( ) correcta                   │
│ Alternativa B: [ ________ ]   ( ) correcta                   │
│ Alternativa C: [ ________ ]   ( ) correcta                   │
│ Alternativa D: [ ________ ]   (•) correcta                   │
│ Justificación: [ ______________________________________ ]   │
│ Etiquetas:     [ suma, básico ]                             │
├─────────────────────────────────────────────────────────────┤
│                                   [ Cancelar ]  [ Guardar ]  │
└─────────────────────────────────────────────────────────────┘
```

**Selector dentro del editor de actividades (flujo B)**
```
┌── Elegir del repositorio ───────────────────────────────────┐
│ Tipo fijado por la actividad: Quiz   Materia: Matemáticas    │
│ [Tema…] [Dificultad ▾] [🔍 Buscar…]                          │
├─────────────────────────────────────────────────────────────┤
│ [✓] ¿Cuánto es 2+2?                       Fácil   Usos: 3    │
│ [ ] ¿Cuánto es 5+3?                       Media   Usos: 0    │
│ [✓] La mitad de 10 es…                    Fácil   Usos: 1    │
├─────────────────────────────────────────────────────────────┤
│ 2 seleccionadas         [ Cancelar ]  [ Insertar en actividad ] │
└─────────────────────────────────────────────────────────────┘
```
Responsive: en móvil la TablaPro colapsa a tarjetas apiladas; filtros en acordeón.

## 16.6 Alcance de Sprint 1.1 (primera entrega verificable)

Solo **Fase 1** (§11): migración aditiva + `banco_preguntas` (+ opciones si aporta) +
`GET/POST/PUT/DELETE/duplicar/estado/importar` + `bancoService.js` + página
*Repositorio de Preguntas* con lista, filtros, alta/edición manual y archivar, para
los tipos atómicos (quiz, completar, memorama, linea-tiempo). **Sin** IA y **sin**
selector en el editor (eso es Fase 2 / Sprint 1.2). Cada paso debe compilar
(`npm run build`) y la app debe seguir funcionando con o sin la migración aplicada.

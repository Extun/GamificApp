# SPEC-007 — Sistema de Misiones y Progresión (Fase 5.5)

> Estado: **APROBADA** (Fabrizio, 2026-07-10).
> Fecha: 2026-07-10
> Decisiones de alcance aprobadas por Fabrizio (2026-07-10):
> 1. **Rachas** → columnas en `estudiantes` (`racha_actual`, `racha_maxima`, `ultima_fecha_actividad`),
>    actualizadas en la misma transacción de `POST /api/progreso`. Migrar a `actividad_diaria`
>    queda para post-tesis si se requieren calendarios/analítica.
> 2. **Precisión** → una actividad es "perfecta" cuando el estudiante obtiene `porcentaje = 100`
>    en `progreso_estudiante`. **No** se instrumenta tracking pregunta-por-pregunta.
> 3. **Fases incrementales, una sola arquitectura.** Fase 1 (tesis): BD + motor + APIs + 45–50
>    misiones semilla + panel del estudiante, todo funcional. Fase 2: indicadores docente + admin.
> 4. Arquitectura pensada para **cientos** de misiones desde BD, no solo 50.

## Objetivo

Reemplazar el sistema de logros actual (5 logros hardcodeados en `localStorage`, sin BD, sin
compartir entre dispositivos) por un **sistema de misiones escalable, server-backed y 100%
guiado por datos reales**, que mantenga al estudiante con objetivos nuevos durante semanas o
meses, con progreso calculado automáticamente (sin botones de "reclamar").

Principios (heredados de CLAUDE.md):
- **Nada hardcodeado en el frontend**: todas las misiones, recompensas y umbrales viven en BD.
- **Prohibido el dato ficticio**: cada objetivo se calcula desde `progreso_estudiante` / `retos`
  / `estudiantes`. Sin datos → estado "en progreso 0%", nunca números inventados.
- **Permisos siempre en servidor**: el estudiante solo ve/actualiza su progreso; el docente solo
  observa (lectura); el admin gestiona el catálogo.
- **XP transaccional intacto**: el motor de misiones corre **dentro** de la transacción existente
  de `POST /api/progreso` (`FOR UPDATE`), sin romper su idempotencia.
- **Reutilizar**: `DashboardWidgets` (SectionCard, StatCard, EmptyState), `LogroToast` para
  notificar misión completada, `TablaPro`/`ModalPanel` en admin.
- **Responsive obligatorio** y textos comprensibles por un niño de 6 años.

---

## 1. Modelo de datos — migración `009-sistema-misiones.sql` (+ reversa, idempotente en `initDb.js`)

Todo aditivo; ninguna columna/tabla existente cambia de forma incompatible.

### 1.1 Racha de actividad (columnas en `estudiantes`)

```sql
ALTER TABLE estudiantes
    ADD COLUMN racha_actual           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN racha_maxima           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN ultima_fecha_actividad DATE NULL;
```

Regla de actualización (dentro de la transacción de `POST /api/progreso`, con la fila del
estudiante ya bloqueada `FOR UPDATE`), usando la **fecha local de la institución** (Guayaquil,
UTC-5) para evitar cortes de racha a medianoche UTC:

- `hoy = ultima` → no cambia (misma jornada).
- `hoy = ultima + 1 día` → `racha_actual += 1`.
- salto mayor o `ultima IS NULL` → `racha_actual = 1`.
- `racha_maxima = GREATEST(racha_maxima, racha_actual)`; `ultima_fecha_actividad = hoy`.

> Post-tesis (documentado): si se necesitan calendarios/analítica histórica, migrar a una tabla
> `actividad_diaria (estudiante_id, fecha)` sin cambiar el contrato del motor.

### 1.2 Catálogo de misiones (`misiones`) — fuente única de verdad

```sql
CREATE TABLE IF NOT EXISTS misiones (
    id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
    clave              VARCHAR(60)  NOT NULL UNIQUE,        -- slug estable, ej. 'aprendizaje-actividades-3'
    categoria          VARCHAR(20)  NOT NULL,               -- aprendizaje|competencia|constancia|colaboracion|precision|exploracion|especiales|ia
    tier               VARCHAR(10)  NOT NULL,               -- bronce|plata|oro|platino|diamante
    titulo             VARCHAR(120) NOT NULL,
    descripcion        VARCHAR(255) NOT NULL,               -- texto para niños
    icono              VARCHAR(16)  NULL,                   -- emoji opcional (si NULL usa el de la categoría)
    tipo_objetivo      VARCHAR(40)  NOT NULL,               -- clave del evaluador (ver §2.2)
    objetivo_meta      INT UNSIGNED NOT NULL DEFAULT 1,     -- número a alcanzar (5, 25, 100, 500...)
    objetivo_filtro    JSON         NULL,                   -- filtros extra: {"tipo":"quiz"} | {"categoria":"aprendizaje"}
    requiere_mision_id INT UNSIGNED NULL,                   -- desbloqueo: misión previa de la cadena
    recompensa_xp      INT UNSIGNED NOT NULL DEFAULT 0,
    recompensa_insignia VARCHAR(60) NULL,                   -- clave de insignia otorgada
    recompensa_banner  VARCHAR(60)  NULL,                   -- clave de banner (cuando corresponda)
    horizonte          VARCHAR(10)  NOT NULL DEFAULT 'corto', -- corto|mediano|largo (para "tiempo estimado")
    orden              INT UNSIGNED NOT NULL DEFAULT 0,      -- orden de presentación dentro de la categoría
    activa             BOOLEAN      NOT NULL DEFAULT TRUE,   -- admin activa/desactiva
    creado_en          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_misiones_categoria (categoria, orden),
    CONSTRAINT fk_mision_requiere FOREIGN KEY (requiere_mision_id)
        REFERENCES misiones (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE = InnoDB;
```

Notas de diseño (escalabilidad):
- Agregar misiones = **insertar filas**, nunca tocar código. Agregar un nuevo *tipo* de objetivo
  = una entrada en el registro de evaluadores (§2.2) + su fila; sin migración.
- La **cadena de progresión** (Bronce→…→Diamante) se modela con `requiere_mision_id`: una misión
  está *bloqueada* mientras su requisito no esté completado.
- `objetivo_filtro` permite parametrizar el mismo evaluador (ej. `actividades_completadas` con
  `{"tipo":"quiz"}` o sin filtro para "cualquier actividad").

### 1.3 Progreso del estudiante (`mision_estudiante`)

```sql
CREATE TABLE IF NOT EXISTS mision_estudiante (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    estudiante_id   INT UNSIGNED NOT NULL,
    mision_id       INT UNSIGNED NOT NULL,
    progreso_actual INT UNSIGNED NOT NULL DEFAULT 0,        -- valor real cacheado (para % y para no recalcular en frío)
    completada      BOOLEAN      NOT NULL DEFAULT FALSE,
    completada_en   DATETIME     NULL,
    actualizado_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_est_mision (estudiante_id, mision_id),
    CONSTRAINT fk_me_estudiante FOREIGN KEY (estudiante_id)
        REFERENCES estudiantes (id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_me_mision FOREIGN KEY (mision_id)
        REFERENCES misiones (id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE = InnoDB;
```

- `progreso_actual` es **caché derivada** (la verdad son las tablas de actividad); se recalcula en
  cada evaluación. Permite pintar barras sin recomputar todo en cada request y guardar el instante
  de completado (`completada_en`) para historial.
- Las insignias/banners **no** necesitan tabla propia en Fase 1: una insignia obtenida = una misión
  con `completada = TRUE` y `recompensa_insignia` no nula. La "vitrina" se deriva de este JOIN.

### 1.4 Scripts base

`database/gamificapp.sql` y `database/produccion_defaultdb.sql` incorporan la forma final +
el **seed de misiones** (§4). `initDb.js` aplica la migración 009 y el seed de forma idempotente
(`INSERT ... ON DUPLICATE KEY UPDATE` por `clave`, para poder ajustar textos/recompensas sin
duplicar filas).

---

## 2. Motor de misiones — `server/lib/misiones.js`

Módulo único y reutilizable. Cero lógica de misiones fuera de aquí.

### 2.1 Función central

```
evaluarMisiones(conn, estudianteId) -> [{ id, clave, titulo, categoria, tier, recompensa_* }]
```

- Recibe una conexión (para correr **dentro** de la transacción de `POST /api/progreso`) o abre
  una propia (para evaluación en lectura).
- Calcula, en **una sola pasada de consultas agregadas**, todas las métricas del estudiante:
  actividades completadas (total y por tipo/materia), XP total, nivel, actividades perfectas
  (porcentaje=100), actividades IA completadas, tipos de juego distintos jugados, materias
  distintas, misiones narrativas completadas, racha actual/máxima, posición de ranking, e
  insignias ya obtenidas por categoría.
- Para cada misión **activa y desbloqueada** (requisito cumplido o sin requisito), calcula
  `progreso_actual` con el evaluador de su `tipo_objetivo`, hace *upsert* en `mision_estudiante`,
  y si alcanza la meta la marca `completada` (una sola vez → registra `completada_en`).
- Devuelve **solo las misiones recién completadas** en esta evaluación, para el `LogroToast`.
- **Idempotente**: reevaluar no vuelve a otorgar ni a notificar lo ya completado.

### 2.2 Registro de evaluadores (extensible sin migrar)

Un mapa `tipo_objetivo -> (metricas, filtro) => valorActual`. Tipos de Fase 1:

| `tipo_objetivo` | Fuente de datos real | Ejemplo de meta |
|---|---|---|
| `actividades_completadas` | count `progreso_estudiante.completado` (filtro `tipo`/`materia` opcional) | 5 / 25 / 100 |
| `xp_total` | `estudiantes.xp_total` | 500 / 2000 |
| `nivel_alcanzado` | derivado de `xp_total` (`XP_POR_NIVEL`) | 5 / 10 |
| `racha_dias` | `estudiantes.racha_actual` / `racha_maxima` | 3 / 7 / 30 |
| `actividades_perfectas` | count `porcentaje = 100` | 1 / 10 / 50 |
| `tipos_jugados` | count DISTINCT `retos.tipo` completados | 3 / 6 |
| `materias_distintas` | count DISTINCT `retos.materia_id` completados | 3 / 5 |
| `mision_narrativa` | count completados con `retos.tipo = 'mision'` | 1 / 5 |
| `actividades_ia` | count completados con `retos.origen = 'ia'` | 1 / 10 |
| `primer_lugar` | posición 1 en ranking por `xp_total` | 1 |
| `insignias_categoria` | count misiones completadas con insignia en `objetivo_filtro.categoria` | "todas las de X" |

Agregar un tipo nuevo mañana (ej. "material leído") = una entrada en este mapa. Un evaluador
desconocido se ignora de forma segura (la misión queda en 0%, nunca rompe el request).

### 2.3 Puntos de evaluación

1. **Al escribir** (`POST /api/progreso`, dentro de la transacción): tras actualizar XP y racha,
   se llama `evaluarMisiones(conn, id)`. Las misiones recién completadas viajan en la respuesta
   (`nuevas_misiones`) para el toast inmediato. `guardarProgreso`/`completarReto` en
   `gamificationService.js` las propagan a la UI (reutilizando el patrón de `nuevosLogros`).
2. **Al leer** (`GET /api/misiones`): evaluación perezosa fuera de transacción. Cubre misiones que
   dependen de terceros (ranking "primer lugar", que cambia cuando otros ganan XP) y garantiza que
   el panel siempre muestre el estado correcto aunque el disparo por escritura no aplique.

---

## 3. APIs

### 3.1 Estudiante
- `GET /api/misiones` → evalúa y devuelve el catálogo activo con, por misión: categoría, tier,
  título, descripción, icono, `objetivo_meta`, `progreso_actual`, `porcentaje`, `horizonte`
  (tiempo estimado), recompensas y **estado**: `bloqueada` | `disponible` | `completada`. Agrupado
  por categoría y ordenado por `orden`. Incluye `siguiente_recompensa` (la próxima misión
  disponible de cada cadena). Solo el propio estudiante (permiso por `req.user.estudiante_id`).

### 3.2 Docente (Fase 2)
- `GET /api/docente/misiones` → estadísticas **agregadas y de solo lectura** de los estudiantes que
  él invitó: % de avance por categoría, misiones más completadas, estudiantes por tier. Nunca
  modifica misiones. Filtro por curso.

### 3.3 Administrador (Fase 2)
- `GET /api/admin/misiones` (permiso a definir; reutiliza el patrón `conPermiso`).
- `POST /api/admin/misiones` — crear misión (si la arquitectura ya lo permite: sí, es solo un INSERT
  validado contra el registro de `tipo_objetivo`).
- `PUT /api/admin/misiones/:id` — editar recompensas/umbral/textos.
- `PATCH /api/admin/misiones/:id/activa` — activar/desactivar (no borra progreso).
- Toda escritura pasa por `registrarAuditoria`.

---

## 4. Contenido inicial: 45–50 misiones semilla (en BD, no en frontend)

8 categorías con identidad visual propia (emoji + color de acento por categoría, definidos como
tokens de tema, no hardcode de datos). Cada categoría es una **cadena por tiers** con umbrales
crecientes y horizontes escalonados, de modo que **no se puedan completar todas en un día**:

| Categoría | Emoji | Cadena (tier → meta, horizonte) |
|---|---|---|
| 📚 Aprendizaje | 📚 | 5 (corto) → 25 → 100 → 250 → 500 actividades (largo) |
| 🏆 Competencia | 🏆 | subir a nivel 3 → 5 → 10 → top 3 ranking → 1er lugar |
| 🔥 Constancia | 🔥 | racha 3 → 7 → 14 → 30 → 60 días |
| 🤝 Colaboración | 🤝 | participar en 2 → 4 → 6 materias distintas / semanas activas |
| 🎯 Precisión | 🎯 | 1 → 10 → 25 → 50 → 100 actividades perfectas (100%) |
| 🚀 Exploración | 🚀 | jugar 3 → 6 tipos de juego; completar 1 misión narrativa → 5 |
| ⭐ Especiales | ⭐ | hitos de XP: 500 → 2.000 → 5.000 → 10.000; y "todas las medallas de una categoría" |
| 🤖 IA | 🤖 | usar 1 → 5 → 15 → 30 actividades creadas con IA |

Horizontes cubiertos: 5 min / 1 día / 3 días / 1 semana / 2 semanas / 1 mes / 2 meses / 3 meses /
6 meses (mapeados vía `horizonte` + magnitud de la meta). **Cada misión otorga siempre más que XP**:
XP + insignia, y banner en los tiers altos (Platino/Diamante) y en Especiales. El desbloqueo de la
siguiente misión es en sí una recompensa. Los textos son para niños de 6 años.

> El número exacto (45–50) y los umbrales finales se afinan al redactar el seed; el diseño no
> depende de esa lista, solo la puebla.

---

## 5. Frontend

### 5.1 Panel del estudiante (Fase 1) — nuevo servicio `src/services/misionesService.js`
Sustituye la lógica de logros de `gamificationService.js` por lectura del backend (el catálogo
`CATALOGO_LOGROS` hardcodeado se deprecia; las insignias pasan a derivarse de misiones).

Vista "Misiones" (moderna, tipo sistema de logros):
- Cabecera con resumen: nivel, XP, racha actual, misiones completadas.
- **Filtros por categoría** (chips con su emoji/color).
- Tarjetas de misión mostrando: categoría, dificultad (tier), **barra de progreso**, %
  de avance, **siguiente recompensa**, tiempo estimado (horizonte) y **estado** (bloqueada 🔒 /
  disponible / completada ✓). Las bloqueadas se ven atenuadas con "Completa X para desbloquear".
- Al completar una misión (respuesta de `POST /api/progreso`), `LogroToast` la anuncia.
- Reutiliza `SectionCard`/`EmptyState`; CSS con tokens existentes; verificado en 375/768/1024px.

### 5.2 Docente y Admin (Fase 2)
- Docente: tarjetas de estadística agregada (solo lectura) en su panel.
- Admin: módulo `ModuloMisiones` (TablaPro + ModalPanel) para activar/desactivar, editar
  recompensas y crear misiones. Sin misiones hardcodeadas: todo viene y va al backend.

---

## 6. Compatibilidad y migración de los logros actuales

- Los 5 logros actuales (`primer-quiz`, `maestro-materia`, `racha-7`, `estrella-aula`,
  `explorador`) se **reexpresan como misiones semilla** equivalentes en el nuevo catálogo.
- `localStorage` sigue siendo solo caché; la verdad de misiones/insignias pasa a la BD (se resuelve
  el problema de dispositivos compartidos). No se migran datos viejos de `localStorage` (eran por
  navegador, no confiables); el progreso real se **recalcula desde `progreso_estudiante`** en la
  primera evaluación, así que un estudiante con historial recupera sus misiones automáticamente.
- No se rompe `configuracion_json` ni el contrato de `POST /api/progreso` (solo se le añade
  `nuevas_misiones` a la respuesta y la actualización de racha a la transacción).

---

## 7. Plan de implementación (fases que compilan)

**Fase 1 (prioridad tesis):**
1. Migración 009 (+ reversa) idempotente en `initDb.js`; actualizar `gamificapp.sql` y
   `produccion_defaultdb.sql`.
2. Motor `server/lib/misiones.js` + registro de evaluadores.
3. Enganche en `POST /api/progreso` (racha + evaluación en transacción) y `GET /api/misiones`.
4. Seed de 45–50 misiones (SQL) aplicado por `initDb.js`.
5. `misionesService.js` + vista Misiones del estudiante + toast. `npm run build` limpio.

**Fase 2 (implementada 2026-07-10):**
6. `GET /api/docente/misiones` (estadísticas agregadas de solo lectura) + apartado "Misiones" en el panel docente (`MisionesDocente.jsx`).
7. Router `adminMisiones.js` (`GET/POST/PUT` + `PATCH /:id/activa`, permiso `materias`, validación contra el registro de `tipo_objetivo`, auditoría) + `ModuloMisiones` en el panel admin.

## 8. Verificación
- `npm run build` sin errores en cada fase.
- Sin MySQL local, la verificación end-to-end (evaluación, racha, desbloqueo, toast) queda para el
  deploy con la migración 009 (mismo patrón que SPEC-004/005/006). Se verifica en navegador con
  datos simulados y en 375px sin scroll horizontal.
- Actualizar `CURRENT_STATE.md` al cerrar cada fase.

## 9. Riesgos / decisiones abiertas
- **Costo de evaluación en cada `POST /api/progreso`**: mitigado con consultas agregadas y con la
  caché `progreso_actual`; el volumen (una escuela) es bajo. Si creciera, evaluar solo las misiones
  cuyo `tipo_objetivo` pueda haber cambiado por la acción.
- **"Primer lugar del ranking"** depende de terceros: solo se resuelve bien en evaluación por
  lectura; documentado.
- **Zona horaria de la racha**: se fija a la hora local institucional (UTC-5) para no cortar rachas
  a medianoche UTC.
</content>
</invoke>

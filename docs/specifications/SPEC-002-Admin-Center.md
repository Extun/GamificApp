# SPEC-002 — Centro de Administración Institucional

> Estado: **APROBADA** (Fabrizio, 2026-07-09) — Fase 1 implementada en código; pendiente paso 7 (backup + migración Aiven + deploy)
> Fecha: 2026-07-09
> Alcance acordado: Fase 1 completa antes de la sustentación; Fase 2 solo si el tiempo lo permite.
> Decisiones ya tomadas: polling ligero (no WebSockets), migración conservadora de materias (IDs se conservan), relaciones siempre por `materia_id`/`curso_id` (nunca por nombre).

---

## 0. Análisis de impacto por punto (qué toca BD / endpoints / migraciones)

| # | Punto | ¿BD? | ¿Endpoints nuevos? | ¿Migración producción? | Riesgo |
|---|-------|------|--------------------|------------------------|--------|
| 1 | Materias dinámicas | `ALTER TABLE materias` (+3 columnas) + 1 UPDATE + 1 INSERT | CRUD admin de materias (4) + ampliar `GET /api/materias` | Sí — **reversible y pequeña** | Bajo: la BD ya relaciona todo por `materia_id`; el hardcodeo es solo frontend |
| 2 | Cursos | Tabla nueva `cursos` + columna `curso_id` en `estudiantes` e `invitaciones_estudiante` (backfill) | CRUD admin de cursos (4) + listado para docentes (1) | Sí — la más delicada (texto libre → catálogo) | Medio: hay que preservar los VARCHAR actuales como respaldo |
| 3 | Institución (nombre/logo/favicon/colores/académico) | Tabla nueva `institucion` (1 sola fila) | `GET /api/institucion` (público) + `PUT /api/admin/institucion` | Sí — solo CREATE TABLE + INSERT semilla (sin tocar datos existentes) | Bajo |
| 4 | Tablas profesionales (paginación/búsqueda) | No | No (paginación en cliente) | No | Nulo |
| 5 | Edición de materias de docentes | — | — | — | **Ya implementado** (2026-07-09) |
| 6 | Rediseño visual del panel | No | No | No | Nulo (base ya hecha 2026-07-09) |
| 7 | Refresco automático (polling) | No | No (reutiliza los GET existentes) | No | Bajo |
| F2 | Auditoría | Tabla nueva `auditoria` + middleware de registro | 1-2 lectura | CREATE TABLE solamente | Bajo (aislado) |
| F2 | Roles de admin | Columna `es_principal` en `usuarios` (o valor extra en `rol`) | Promover/degradar (2) | ALTER pequeño | Medio (toca auth) |
| F2 | Papelera | Columna `eliminado_en` (soft-delete) en 4-5 tablas | Restaurar/purgar (2) | ALTER + reescribir DELETEs existentes | Medio-alto (toca todos los listados) |
| F2 | Buscador global | No | 1 endpoint agregador | No | Bajo |
| F2 | Dashboard con gráficos | No | 1 endpoint de agregados (o cálculo en cliente) | No | Bajo |

**Conclusión del análisis:** Fase 1 requiere exactamente **3 migraciones SQL** (materias, cursos, institución), todas aditivas (no borran ni renombran columnas existentes), cada una con script de reversa. Ningún endpoint existente cambia su contrato; solo se amplían respuestas (campos extra) y se agregan rutas nuevas.

---

## 1. Migración de BD (archivo `database/migraciones/002-admin-center.sql` + `002-admin-center-reversa.sql`)

### 1.1 Materias (conservadora)

```sql
ALTER TABLE materias
    ADD COLUMN color  VARCHAR(7)  NOT NULL DEFAULT '#e0f2fe',  -- hex del pastel
    ADD COLUMN icono  VARCHAR(8)  NOT NULL DEFAULT '📚',        -- emoji
    ADD COLUMN activa BOOLEAN     NOT NULL DEFAULT TRUE;

-- Los IDs 1-5 se conservan: nada existente se rompe.
UPDATE materias SET nombre = 'Lengua y Literatura' WHERE id = 2;
UPDATE materias SET color = '#e0f2fe', icono = '🔢' WHERE id = 1;
UPDATE materias SET color = '#fce7f3', icono = '📖' WHERE id = 2;
UPDATE materias SET color = '#dcfce7', icono = '🌱' WHERE id = 3;
UPDATE materias SET color = '#fef3c7', icono = '🌎' WHERE id = 4;
UPDATE materias SET color = '#ede9fe', icono = '⚽' WHERE id = 5;
INSERT INTO materias (id, nombre, color, icono) VALUES (6, 'Inglés', '#ffe4e6', '🗣️');
```

- `id` deja de ser TINYINT fijo conceptualmente pero **no se altera el tipo** (TINYINT admite 255 materias: suficiente).
- Desactivar una materia (`activa = FALSE`) la oculta de docentes/estudiantes pero conserva retos y material asociados (nunca DELETE con FK RESTRICT ya vigente).
- Eliminar solo se permite si la materia no tiene retos ni materiales ni docentes (el backend lo valida; si tiene, la UI ofrece desactivar).

### 1.2 Cursos

```sql
CREATE TABLE cursos (
    id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombre   VARCHAR(20)  NOT NULL,   -- "2do"
    paralelo VARCHAR(5)   NOT NULL,   -- "A"
    nivel    VARCHAR(30)  NULL,       -- "Básica elemental"
    activo   BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_curso (nombre, paralelo)
);

ALTER TABLE estudiantes             ADD COLUMN curso_id INT UNSIGNED NULL,
    ADD CONSTRAINT fk_est_curso FOREIGN KEY (curso_id) REFERENCES cursos (id) ON DELETE SET NULL;
ALTER TABLE invitaciones_estudiante ADD COLUMN curso_id INT UNSIGNED NULL,
    ADD CONSTRAINT fk_inv_curso FOREIGN KEY (curso_id) REFERENCES cursos (id) ON DELETE SET NULL;

-- Backfill: cada valor distinto de texto libre se convierte en un curso.
INSERT INTO cursos (nombre, paralelo)
    SELECT DISTINCT TRIM(SUBSTRING_INDEX(curso, ' ', 1)), TRIM(SUBSTRING_INDEX(curso, ' ', -1))
    FROM estudiantes WHERE curso <> ''
    ON DUPLICATE KEY UPDATE nombre = cursos.nombre;
UPDATE estudiantes e JOIN cursos c
    ON TRIM(e.curso) = CONCAT(c.nombre, ' ', c.paralelo) SET e.curso_id = c.id;
UPDATE invitaciones_estudiante i JOIN cursos c
    ON TRIM(i.curso) = CONCAT(c.nombre, ' ', c.paralelo) SET i.curso_id = c.id;
```

- **La columna VARCHAR `curso` NO se elimina** en esta fase: queda como respaldo/visualización y se sigue escribiendo (denormalizada) al registrar estudiantes, de modo que todo el código no migrado sigue funcionando. Su eliminación queda para post-tesis.
- Los cursos cuyo texto libre no calce con el patrón "nombre paralelo" quedan con `curso_id NULL` y se listan en el panel para corrección manual (EmptyState/aviso explica cómo).
- El docente ya no tipea el curso al generar invitaciones: elige de `GET /api/cursos` (solo activos).

### 1.3 Institución

```sql
CREATE TABLE institucion (
    id               TINYINT UNSIGNED NOT NULL DEFAULT 1,
    nombre           VARCHAR(160) NOT NULL,
    ciudad           VARCHAR(80)  NULL,
    provincia        VARCHAR(80)  NULL,
    pais             VARCHAR(80)  NULL,
    logo_data        MEDIUMTEXT   NULL,   -- data URL (base64), ya redimensionado
    favicon_data     TEXT         NULL,   -- data URL pequeño (≤32 KB)
    color_principal  VARCHAR(7)   NULL,   -- hex; NULL = tema por defecto
    color_secundario VARCHAR(7)   NULL,
    anio_lectivo     VARCHAR(20)  NULL,   -- "2026-2027"
    xp_escala_max    INT UNSIGNED NOT NULL DEFAULT 1000,
    config_json      JSON         NULL,   -- futuras configuraciones sin ALTER
    actualizado_en   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT chk_singleton CHECK (id = 1)
);
INSERT INTO institucion (id, nombre, ciudad, provincia, pais)
VALUES (1, 'Unidad Educativa Fiscal Clemencia Coronel de Pincay', 'Guayaquil', 'Guayas', 'Ecuador');
```

- Una sola fila (`id = 1` forzado). `config_json` deja preparado el terreno para modo oscuro/temas futuros **sin implementarlos**.
- Logo: el **frontend** valida formato (png/jpg/webp/svg), redimensiona en `<canvas>` a máx. 512 px y comprime antes de enviar (mismo patrón base64-en-MySQL que `materiales`). El backend revalida tipo MIME del data URL y tamaño (≤300 KB logo, ≤32 KB favicon). Favicon se genera automáticamente desde el logo (canvas 64×64) con opción de subir uno propio.

### Protocolo de migración

1. Probar el script completo (ida y reversa) en MySQL local/copia.
2. Backup de Aiven (dump) antes de aplicar.
3. Aplicar `002-admin-center.sql` en producción en horario sin clases.
4. Ambos scripts quedan versionados en `database/migraciones/` y documentados.
5. El backend nuevo es tolerante: si las columnas nuevas no existen aún (deploy a medias), los endpoints viejos siguen operando.

---

## 2. Endpoints nuevos (todos validan permisos en servidor)

| Método y ruta | Rol | Descripción |
|---|---|---|
| `GET /api/materias` | público auth | Se amplía: `id, nombre, color, icono, activa` (estudiante/docente reciben solo activas) |
| `POST /api/admin/materias` | admin | Crear materia |
| `PUT /api/admin/materias/:id` | admin | Editar nombre/color/icono/activa |
| `DELETE /api/admin/materias/:id` | admin | Solo si no tiene retos/materiales/docentes (409 si no) |
| `GET /api/cursos` | docente/admin | Cursos activos (para el selector del docente) |
| `GET /api/admin/cursos` | admin | Todos, con conteo de estudiantes y docentes |
| `POST /api/admin/cursos` | admin | Crear curso |
| `PUT /api/admin/cursos/:id` | admin | Editar/activar/desactivar |
| `DELETE /api/admin/cursos/:id` | admin | Solo si no tiene estudiantes (409 si no) |
| `GET /api/institucion` | **público sin auth** | Nombre, logo, favicon, colores (lo necesita el Login) |
| `PUT /api/admin/institucion` | admin | Actualiza la fila única |

Cambios a endpoints existentes (aditivos, sin romper contrato):
- `POST /api/docente/invitaciones` acepta `curso_id` (mantiene `curso` texto por compatibilidad durante la transición).
- Registro de estudiante (`auth.js`) copia `curso_id` y `curso` desde la invitación.

---

## 3. Frontend

### 3.1 Materias dinámicas (elimina el hardcodeo)

- Nuevo `src/services/materiasService.js`: `listar()` con caché en memoria + localStorage (regla: la API siempre pisa la caché).
- `src/constants/materias.js` **se elimina** al final de la fase; mientras tanto queda como fallback si la API no responde (mismo shape).
- Los mapas `MATERIA_UI` (emoji/tono duplicados en `DashboardEstudiante`, `dashboard.jsx` y `AdminDashboard`) se reemplazan por `color`/`icono` que vienen de la BD. Los tonos pastel dejan de ser clases fijas `-1..-5` y pasan a `style` con el color de la materia.
- Módulo admin **Materias**: lista con tarjetas (icono, nombre, color, estado, conteo de retos/materiales), crear/editar en modal (nombre, selector de emoji simple, selector de color pastel predefinido + libre), activar/desactivar con switch, eliminar solo cuando está vacía.

### 3.2 Cursos

- Módulo admin **Cursos**: tabla profesional con nombre, paralelo, nivel, estado, nº estudiantes, nº docentes (docentes = distintos emisores de invitaciones del curso), crear/editar en modal.
- Panel docente: el campo de texto libre "curso" al generar invitaciones se reemplaza por un `<select>` de cursos activos.

### 3.3 Institución

- Módulo admin **Institución** con tres tarjetas: *Información* (nombre, ciudad, provincia, país), *Imagen institucional* (dropzone de logo con preview, favicon autogenerado), *Apariencia y académico* (color principal/secundario con preview en vivo, año lectivo, escala XP).
- Nuevo `src/services/institucionService.js` + contexto ligero `InstitucionProvider` que al cargar la app: inyecta `--color-primary`/`--color-accent` (y derivados soft/dark calculados) en `:root`, actualiza `<title>`/favicon, y expone nombre+logo. **Así queda preparada la arquitectura para temas futuros sin implementarlos.**
- Logo en Login (cabecera), y en la cabecera del sidebar de los 3 paneles (tamaño contenido, `max-height` fijo).

### 3.4 Componentes compartidos nuevos (en `src/components/dashboard/`)

- `TablaPro`: cabecera, filas, paginación (10/25/50/100, «‹›», "Página X de Y", se oculta con ≤1 página), búsqueda instantánea opcional (filtra en cliente), estados vacío/cargando (skeleton), scroll horizontal propio en móvil. Reemplaza las tablas de Estudiantes e Invitaciones y sirve para Cursos/Materias.
- `ModalPanel`: extrae el patrón `preview-backdrop/panel/head/foot` ya usado (edición de materias) para reutilizarlo en todos los modales nuevos.
- `useAutoRefresh(cargar, ms)`: hook de polling (por defecto 20 s) que se activa al montar la vista, se detiene al desmontarla y **se pausa mientras hay un formulario/modal activo** (flag del componente). Toda la sincronización pasa por este hook: sustituirlo por WebSockets después no toca los componentes.

### 3.5 Rendimiento y accesibilidad

- Paginación en cliente: con 500 estudiantes / miles de invitaciones el payload sigue siendo pequeño (~decenas de KB); si crece, `TablaPro` ya aísla el punto donde cambiar a paginación en servidor.
- Logos: redimensionado en canvas antes de subir (nunca base64 gigante).
- Focus visible, `aria-label` en acciones de icono, navegación por teclado en modales (Escape cierra, focus trap simple), `prefers-reduced-motion` respetado (ya es regla de la casa).

---

## 4. Plan de implementación (cada paso compila y se verifica)

| Paso | Contenido | Verificación |
|---|---|---|
| 1 | Migración SQL (ida/reversa) + endpoints de materias + módulo admin Materias | Local + build + navegador |
| 2 | Frontend consume materias desde API (adiós constante); colores/emoji dinámicos en los 3 paneles | Los 3 roles en navegador, móvil incluido |
| 3 | Tabla `cursos` + backfill + endpoints + módulo admin Cursos + selector en docente | Invitación nueva end-to-end |
| 4 | Tabla `institucion` + endpoints + módulo Institución + logo/colores aplicados globalmente | Login + 3 paneles |
| 5 | `TablaPro` (paginación + búsqueda) aplicada a Estudiantes, Invitaciones, Cursos, Materias, Docentes | Datasets grandes simulados |
| 6 | `useAutoRefresh` en las vistas del admin | Dos pestañas simultáneas |
| 7 | Migración en Aiven (tras backup) + deploy | Producción con datos reales |

Fase 2 (auditoría, roles, papelera, buscador global, dashboard con gráficos) se especificará como adenda a este documento cuando la Fase 1 esté en producción.

---

## 5. Fuera de alcance explícito

- WebSockets (decidido: polling).
- Modo oscuro y temas personalizados (solo queda preparada la inyección de variables).
- Eliminación de las columnas VARCHAR `curso` (post-tesis).
- Multi-institución real (la tabla es singleton).

# SPEC-003 — Panel de Administración Fase 2 (permisos, auditoría, papelera, sidebar)

> Estado: **APROBADA** (Fabrizio, 2026-07-09 — pedido directo del sprint final del panel de administración)
> Fecha: 2026-07-09
> Requiere: SPEC-002 Fase 1 y migración 003 aplicadas.
> Alcance: cerrar definitivamente el panel de Administración manteniendo la identidad visual existente (Material 3 + pastel + tarjetas + TablaPro + sidebar fijo). Sin cambiar lógica ya funcional.

---

## 0. Análisis de impacto

| # | Punto | ¿BD? | ¿Endpoints nuevos? | ¿Migración producción? | Riesgo |
|---|-------|------|--------------------|------------------------|--------|
| 1 | Permisos por administrador | Columna `permisos` JSON en `usuarios` | No (se amplían login y PUT de administradores) | ALTER pequeño y aditivo | Medio (toca auth; con fallback conservador) |
| 2 | Auditoría | Tabla nueva `auditoria` | 2 de lectura | CREATE TABLE solamente | Bajo (aislado; registro fire-and-forget) |
| 3 | Papelera (soft-delete) | Columnas `eliminado_en`/`eliminado_por` en `usuarios`, `materias`, `cursos` | 3 (listar/restaurar/purgar) | ALTER aditivo + reescribir DELETEs del admin | Medio-alto (los listados filtran eliminados) |
| 4 | Sidebar agrupado | No | No | No | Nulo |
| 5 | Actividad reciente real en Inicio | No | Reutiliza el endpoint de auditoría | No | Nulo |

Todo es aditivo: ninguna columna existente se elimina ni renombra, ningún contrato de endpoint cambia (solo se amplían respuestas y se agregan rutas). Migración única `database/migraciones/004-admin-fase2.sql` + reversa, aplicada de forma idempotente por `initDb.js` al arrancar (mismo patrón que 002/003).

---

## 1. Sistema de permisos entre administradores

### Claves de permiso (simples y estables)

| Grupo | Claves |
|---|---|
| Gestión Académica | `docentes`, `estudiantes`, `materias`, `cursos` |
| Gestión Institucional | `institucion`, `invitaciones` |
| Seguridad | `administradores`, `auditoria`, `papelera` |

- **Administrador Principal**: SIEMPRE todos los permisos (no editable).
- **Administrador**: solo las claves guardadas en `usuarios.permisos` (JSON, array de strings).
- `permisos = NULL` ⇒ **conjunto operativo por defecto** (`docentes, estudiantes, materias, cursos, invitaciones`): así los admins existentes conservan exactamente lo que hoy pueden hacer, sin backfill.

### Backend

- Middleware `conPermiso(clave)` en `server/middleware/auth.js`: verifica contra la **BD** (no contra el token, igual que `soloAdminPrincipal`) — Principal activo pasa siempre; si no, la clave debe estar en `permisos`. Tolerante a columna ausente (deploy a medias): cae al comportamiento previo (operativo sí, `institucion`/`administradores` solo Principal).
- Cada ruta de `/api/admin/*` declara su clave. `soloAdminPrincipal` queda solo para lo estructural: **modificar `es_principal`, `permisos` o eliminar/degradar Principales**. Un admin con permiso `administradores` puede crear admins operativos y resetear contraseñas/estado, pero no tocar Principales ni repartir permisos.
- El login incluye `permisos` resueltos en `usuario` (la UI solo oculta; el servidor revalida siempre).

### Frontend

- `authService.tienePermiso(clave)`; el sidebar y los accesos del Inicio se filtran por permiso.
- `ModuloAdministradores`: en el modal de edición, tarjetas de permisos agrupadas por categoría (checkboxes); deshabilitadas cuando la cuenta es Principal ("tiene todos los permisos"). Solo el Principal ve/edita permisos.

## 2. Módulo Auditoría

### Tabla

```sql
CREATE TABLE auditoria (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    usuario_id   INT UNSIGNED NULL,          -- sin FK: el evento sobrevive al usuario
    rol          VARCHAR(15)  NOT NULL,      -- 'admin' | 'docente' | 'estudiante'
    nombre       VARCHAR(160) NOT NULL,      -- denormalizado (quién)
    accion       VARCHAR(60)  NOT NULL,      -- slug corto: 'creo-quiz', 'inicio-sesion'…
    descripcion  VARCHAR(255) NOT NULL,      -- texto humano en español
    materia      VARCHAR(60)  NULL,          -- denormalizado (si aplica)
    detalle_json JSON         NULL,          -- todo lo demás realmente registrado
    creado_en    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_auditoria_fecha (creado_en),
    INDEX idx_auditoria_rol (rol)
);
```

- Helper `registrarAuditoria(datos)` en `server/lib/auditoria.js`: **fire-and-forget** (un fallo de auditoría jamás rompe la acción original; tolera tabla ausente pre-migración).
- Se instrumentan las escrituras reales: docente (publicar/editar reto por tipo, subir/eliminar material, generar invitaciones, resetear PIN), estudiante (inicio de sesión, registro, acceso de emergencia, cambio de PIN, progreso/XP de retos) y admin (todas las escrituras del panel, incluidas restauraciones y purgas de papelera).
- **Sin datos ficticios**: el modal "Más detalles" muestra solo `detalle_json` real; los campos ausentes se presentan como "No registrado".

### Endpoints

| Ruta | Permiso | Descripción |
|---|---|---|
| `GET /api/admin/auditoria?rol=&limite=` | `auditoria` | Últimos eventos (máx. 1000), filtro opcional por rol |
| `GET /api/admin/auditoria/reciente` | cualquier admin | Últimos 5 eventos, alimenta "Actividad reciente" del Inicio |

### Frontend

`ModuloAuditoria`: dos tarjetas (`Actividad Docente` y `Actividad Estudiantes`), cada una con TablaPro (avatar, nombre, acción, materia, fecha, botón "Más detalles") y EmptyState. Modal de detalles con `ModalPanel`.

## 3. Papelera (soft-delete)

- Columnas `eliminado_en DATETIME NULL` y `eliminado_por VARCHAR(50) NULL` (username de quien eliminó) en `usuarios`, `materias` y `cursos`. Estudiantes/docentes/administradores se marcan en su fila de `usuarios` (la ficha `estudiantes` se conserva intacta).
- Los DELETE del panel admin pasan a marcar `eliminado_en` (la restauración devuelve el estado exacto: relaciones, XP, materias asignadas, retos y materiales nunca se tocan).
- Al soft-eliminar **desaparecen las restricciones previas de "solo si está vacío"**: esas validaciones de integridad se aplican ahora en la **eliminación definitiva** desde la Papelera (mensajes amigables 409, nunca borrado silencioso). Los invariantes de administradores (último Principal, no a uno mismo) aplican también al soft-delete.
- Todos los listados y el login filtran `eliminado_en IS NULL` (login lo hace en JS sobre `SELECT *`, tolerante pre-migración). Ranking, `mis-estudiantes`, materias y cursos de docentes/estudiantes filtran también.
- Restaurar materia/curso puede chocar con un homónimo creado después (UNIQUE): 409 con mensaje amigable ("renombra o elimina el duplicado"), nunca se pierde información.

### Endpoints

| Ruta | Permiso | Descripción |
|---|---|---|
| `GET /api/admin/papelera` | `papelera` | Todos los elementos eliminados con tipo, fecha y quién |
| `POST /api/admin/papelera/:tipo/:id/restaurar` | `papelera` | Quita la marca (tipo: docente/estudiante/administrador/materia/curso) |
| `DELETE /api/admin/papelera/:tipo/:id` | `papelera` | Eliminación definitiva con las validaciones de integridad previas |

### Frontend

`ModuloPapelera`: pestañas píldora (Todos / Docentes / Estudiantes / Cursos / Materias / Administradores), TablaPro (nombre, tipo, fecha de eliminación, quién eliminó, Restaurar, Eliminar definitivamente con confirmación), EmptyState por pestaña.

## 4. Sidebar agrupado

`SidebarLayout` acepta `grupo` opcional por ítem: pinta rótulo de grupo + separador. Sin `grupo` se comporta igual que hoy (Docente y Estudiante no cambian). Orden del admin: Inicio · **Gestión Académica** (Docentes, Estudiantes, Materias, Cursos) · **Gestión Institucional** (Invitaciones, Institución) · **Seguridad** (Administradores, Auditoría, Papelera) · footer (usuario + Cerrar sesión, siempre visible).

## 5. Actividad reciente del Inicio

El widget del Inicio consume `GET /api/admin/auditoria/reciente` (últimos 5 eventos reales). Sin eventos ⇒ EmptyState. Se elimina la lista calculada a partir de altas (era un duplicado de lógica).

## 6. Plan de implementación (cada paso compila)

| Paso | Contenido | Verificación |
|---|---|---|
| 1 | Migración 004 (+ reversa) + initDb idempotente + esquemas finales | Arranque local limpio |
| 2 | Backend: `conPermiso`, `auditoria.js` (lib + lecturas), soft-delete + papelera, instrumentación | Pruebas API con roles |
| 3 | Frontend: permisos en sesión/UI, sidebar agrupado, ModuloAuditoria, ModuloPapelera, Inicio | Navegador (todas las resoluciones) |
| 4 | Docs (CURRENT_STATE, MASTER_PLAN) + build + lint | Evidencia real |
| 5 | Backup Aiven + migración + deploy (igual que 002/003, PENDIENTE de Fabrizio) | Producción |

## 7. Fuera de alcance explícito

- Permisos a nivel de acción (solo-lectura vs edición): un permiso da el módulo completo.
- Papelera para retos/materiales/invitaciones (siguen el flujo actual del docente).
- Retención/limpieza automática de auditoría (post-tesis).
- WebSockets (sigue polling `useAutoRefresh`).

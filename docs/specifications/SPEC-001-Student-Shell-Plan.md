# SPEC-001 — Student Shell · Plan técnico de implementación

# Objetivo

Plan de implementación (sin código) del nuevo "cascarón" del estudiante: rutas reales, eliminación del sidebar administrativo, nuevo Inicio (saludo + barra de nivel + "Seguir jugando" + mundos) y acciones de cuenta detrás del avatar. Deriva de `docs/audit/Auditoria-UX-Estudiante-v1.md` (decisiones 2 y 7).

# Estado

🟡 Propuesto — pendiente de aprobación como RFC.

# Última actualización

2026-07-06

---

## Alcance

**Dentro:** shell del estudiante (layout, navegación, rutas anidadas, Inicio nuevo, menú de avatar, retiro de `window.prompt`).
**Fuera (specs posteriores):** fusión de pestañas de materia (Spec 2), motor único de retos (Spec 3), login infantil (Spec 4), vitrina de premios (Spec 5). La vista de materia y los reproductores actuales se conservan funcionando tal cual, solo re-alojados bajo las rutas nuevas.

## 1. Componentes actuales a REUTILIZAR

| Componente | Uso en el shell nuevo |
|---|---|
| `QuickActionCard` (`DashboardWidgets.jsx`) | Base lógica de "Seguir jugando" (sus 3 estados: última actividad / primer reto / vacío). Se re-estiliza con una variante hero, no se duplica. |
| `EmptyState` | Estado sin retos publicados en el Inicio. |
| `gamificationService` completo | `getResumen()`, `getProgresoNivel()` (¡por fin se pinta el porcentaje!), `obtenerProgreso()`, `getEstudianteId()`. Sin cambios. |
| `retosService.obtenerRetosPublicados` / `materialesService` | Sin cambios. |
| `authService` | Sin cambios de API (`getUsuario`, `logout`, `cambiarPin`). |
| Reproductores `QuizInteractivo`, `JuegoDragAndDrop`, `MisionNarrativa` y `FileChip`/`FilePreviewModal` | Intactos; se montan dentro de las rutas nuevas. |
| Vista de detalle de materia (JSX actual de `DashboardEstudiante`) | Se extrae tal cual a una página propia; su rediseño es Spec 2. |
| Tokens de tema (`--color-*`, `--radius-*`, `--shadow-*`) | Obligatorio (CODING_STANDARDS). |
| `CATALOGO_LOGROS` + `LogroCard` | La página Logros se mueve bajo la ruta nueva sin rediseño (Spec 5). |

## 2. Componentes que DEJAN de usarse (para el estudiante)

- **El sidebar completo** (`<aside className="sidebar">`, MUI `List/ListItem*`) — solo en el rol estudiante; el docente/admin no se tocan.
- **`admin/dashboard.css` como base del estudiante** — la dependencia cruzada se corta; el shell nuevo tiene su propio CSS. (El archivo NO se borra: docente y admin siguen usándolo.)
- `DashboardHeader` con chips de texto "Nivel N · XP" — sustituido por el header con barra de nivel.
- `StatCard` en el Inicio del estudiante (sigue viva para docente/admin).
- Sección "Actividad reciente" y sección "Mi comunidad/ranking" del Inicio (el ranking queda huérfano hasta Spec 5; se retira de la home según auditoría §3/§9).
- `window.prompt`/`window.alert` de `handleCambiarPin`.
- El monolito `DashboardEstudiante.jsx` como contenedor de todo: queda vaciado y finalmente eliminado al terminar la migración.

## 3. Componentes NUEVOS

Todos bajo `src/pages/estudiante/` y `src/components/estudiante/`:

1. **`EstudianteShell`** (layout de ruta con `<Outlet/>`): barra superior mínima (logo pequeño + avatar) — sin sidebar, contenido a ancho completo, táctil.
2. **`AvatarMenu`**: avatar-botón → menú con "Cambiar mi PIN" y "Salir". Único lugar con acciones de cuenta.
3. **`ModalCambiarPin`**: reemplazo de los `window.prompt` (dos campos, validación 6 caracteres, mensajes amables). Reutiliza estilos de formulario existentes.
4. **`BarraNivel`**: barra de progreso de nivel (consume `getProgresoNivel()`); protagonista del Inicio y reutilizable en "Mis premios" (Spec 5).
5. **`InicioEstudiante`** (página): saludo + `BarraNivel` + botón hero "¡Seguir jugando!" + grid de mundos/materias (visual provisional; identidad por materia llega en Spec 2).
6. **`MateriaEstudiante`** (página): extracción 1:1 del bloque de detalle de materia actual (pestañas incluidas, sin rediseño).
7. **`LogrosEstudiante`** (página): extracción 1:1 de la vista de logros actual.
8. CSS propios: `estudianteShell.css` + estilos por página (sin heredar de admin).

## 4. Archivos a MODIFICAR

- **`src/App.jsx`** — cambio central: rutas anidadas para el estudiante bajo `/dashboard` (p. ej. `/dashboard` → Inicio, `/dashboard/materias/:materiaId`, `/dashboard/logros`), manteniendo `DashboardPorRol` como bifurcador: docente/admin siguen igual; estudiante monta `EstudianteShell` con sub-rutas. `ProtectedRoute` se reutiliza sin cambios.
- **`src/pages/estudiante/DashboardEstudiante.jsx`** — se desmonta progresivamente hasta desaparecer.
- **`src/pages/estudiante/dashboardEstudiante.css`** — las clases que sobreviven (lista de quizzes, `vacio-msg`, etc.) migran al CSS de `MateriaEstudiante`; el resto se elimina.
- **`src/constants/materias.js`** — solo si se añade metadato visual mínimo (color por materia) para el grid del Inicio; opcional en esta spec.
- **Docs DevOS al cerrar**: `PROJECT_CONTEXT.md` (tabla RFC, estado), `MASTER_PLAN.md`, `NAVIGATION.md`, changelog del RFC.

**Sin cambios:** backend completo, servicios, BD, componentes de docente/admin, reproductores de juego.

## 5. Riesgos técnicos

1. **Deep-links y recarga (el mayor).** Al pasar de `useState` a rutas, `/dashboard/materias/3` debe sobrevivir a un F5: Vercel ya tiene rewrite de SPA (verificar `vercel.json`/config) y las páginas deben cargar sus datos desde la URL, no desde estado heredado. Mitigación: cada página busca sus datos por `useParams` + servicios (los efectos actuales ya están escritos por materia, se trasladan casi 1:1).
2. **Estado que hoy vive en el monolito.** `materiaSeleccionada`, `subVista`, `quizActivo`, etc. están en un solo `useState` gigante; al partir en páginas hay que decidir qué pasa a URL (materia) y qué queda local (subVista, reto activo). Riesgo de regresiones al "volver".
3. **Regresión visual cruzada por CSS.** `dashboard.css` de admin define clases genéricas (`.card`, `.materias-grid`, `.back-btn`…) que el estudiante reutiliza. Al cortar el import, la vista de materia extraída (que se conserva sin rediseño) perdería estilos. Mitigación: copiar las clases necesarias al CSS del estudiante en el mismo commit de la extracción y verificar en navegador.
4. **Doble fuente del XP.** El Inicio nuevo pinta `getProgresoNivel()` (caché local) y la sincronización llega asíncrona de `obtenerProgreso()`; el patrón `setSync` actual es frágil. Riesgo de mostrar barra desactualizada un instante. Aceptable en esta spec; documentar.
5. **`DashboardPorRol` en `/dashboard` con sub-rutas**: docente y admin NO deben ganar sub-rutas accidentalmente ni romperse con `path="/dashboard/*"`. Probar los tres roles tras tocar `App.jsx`.
6. **Botón atrás vs. juego a medias**: con rutas reales, "atrás" durante un quiz abandona el reto sin aviso. Comportamiento aceptado (el XP solo se otorga al completar y es idempotente), pero debe quedar anotado.
7. **Regla DevOS**: este trabajo requiere RFC aprobado antes del primer commit.

## 6. División en commits

Cada commit deja la app funcional y verificable en navegador (`npm run build` + los 3 roles):

1. **`refactor: rutas anidadas del estudiante bajo /dashboard`** — `App.jsx` + `EstudianteShell` mínimo (aún con sidebar viejo dentro, si hace falta) + páginas cascarón que envuelven el JSX existente. Sin cambio visual perceptible; el botón atrás ya funciona.
2. **`refactor: extraer MateriaEstudiante y LogrosEstudiante del monolito`** — mover JSX + migrar las clases CSS necesarias fuera de `admin/dashboard.css`. Sin cambio visual.
3. **`feat: shell del estudiante sin sidebar con menú de avatar`** — barra superior, `AvatarMenu`, "Salir"; muere el sidebar y el nombre institucional.
4. **`feat: modal de cambio de PIN`** — reemplaza `window.prompt/alert`.
5. **`feat: nuevo Inicio del estudiante con barra de nivel y Seguir jugando`** — `InicioEstudiante` + `BarraNivel` + hero; retira StatCards, ranking y actividad reciente de la home.
6. **`chore: eliminar DashboardEstudiante.jsx y CSS muerto`** — limpieza final.
7. **`docs: changelog SPEC-001 y actualización de PROJECT_CONTEXT/MASTER_PLAN/NAVIGATION`.**

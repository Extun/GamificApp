# SPEC-026 — El curso es una frontera de contenido

> Estado: **APROBADA por Fabrizio** (2026-08-12), en el mismo mensaje en que
> reportó el problema: «*tengo un docente y estudiante por curso. Se supone que
> entre ellos no deberían de visualizarse las actividades entre sí porque ambos
> pertenecen a distintos cursos […] Trata de que funcione en todos los escenarios
> posibles de pruebas prácticas y evitar la mayor cantidad de inconvenientes en
> producción*». Las dos decisiones abiertas (§2) se resolvieron con él antes de
> escribir código.
> Toca **`POST /api/progreso`** → **§9 de CONTRIBUTING.md** (solo añade un
> control de acceso; **no** toca la transaccionalidad ni el cálculo del XP) y
> cambia el contrato de tres endpoints + una migración → regla §6.6, por eso
> existe este documento.

## 1. Problema

`retos.curso_id` existe desde la migración 008 (SPEC-006) pero **nunca delimitó
el acceso**: era un metadato de organización del docente. Consecuencia real, con
la instalación de prueba de Fabrizio (docente A → 2 A, docente B → 3 A, un
estudiante en cada curso):

**Todo estudiante ve TODAS las actividades publicadas de la institución.** El
niño de 2 A entra a Matemáticas y juega las actividades que el docente de 3 A
preparó para su clase. Lo mismo con el material de estudio.

No es un descubrimiento nuevo: el código ya lo llevaba anotado. En
`server/routes/progreso.js` estaba escrito *«Ojo: hoy `curso_id` NO delimita el
acceso en GET, así que tampoco se usa aquí»*, y **SPEC-015 §Modelo de confianza
punto 3** lo dejó como *«decisión de producto pendiente que debe cambiar ambos
endpoints a la vez»*. Esta spec es esa decisión.

Alcance del daño hoy: es una fuga de **visibilidad**, no de datos personales. Un
estudiante no puede ver a otros estudiantes ni sus notas; sí puede jugar (y
ganar XP en) actividades de un curso que no es el suyo, lo que además ensucia el
Libro de Calificaciones del docente ajeno con intentos de niños que no son suyos.

## 2. Decisiones (acordadas con Fabrizio)

### 2.1 «Todos los cursos» pasa a significar «todos MIS cursos»

El campo Curso del editor es opcional y por defecto vale `NULL`. Se elige la
lectura **de autoría** en vez de la literal:

| `retos.curso_id` | Quién lo ve |
|---|---|
| Un curso concreto | Solo los estudiantes de **ese** curso |
| `NULL` (por defecto) | Los estudiantes de **los cursos asignados al docente autor** (`docente_curso`) |
| `NULL` y el autor **no tiene cursos** | Todos (contenido institucional) — ver §2.3 |

Por qué esta lectura y no la literal: el selector de curso del editor **solo
lista los cursos del propio docente** (`GET /api/cursos`, migración 010), así que
«Todos los cursos» ya significaba «todos los que puedo elegir», que son los
suyos. Es además la única lectura que **arregla el caso reportado sin retocar ni
una actividad ya publicada**: la alternativa (curso obligatorio) exigiría que
cada docente volviera a etiquetar a mano todo su contenido y dejaría la fuga
abierta mientras tanto.

### 2.2 El material de estudio entra en la misma frontera

`materiales` no tenía ni autor ni curso. Se le añaden `docente_id` y `curso_id`
(migración 015) y se le aplica **exactamente la misma regla**. `docente_id` se
graba al subir; `curso_id` queda reservado para un selector futuro y hoy siempre
es `NULL` — no se inventa UI que nadie pidió (§6.1), pero el modelo queda
simétrico con `retos` y el fragmento SQL de acceso sirve para las dos tablas sin
duplicarse.

### 2.3 Fail-open deliberado: el filtro solo QUITA, nunca vacía un panel

Tres casos se resuelven **manteniendo el comportamiento actual** a propósito,
porque «evitar inconvenientes en producción» pesa más que la pureza del modelo:

1. **Autor sin cursos asignados** (el admin, un autor legacy con `docente_id`
   NULL, o un docente al que todavía no le asignaron curso). Su contenido sin
   curso sigue siendo **institucional, visible para todos**. Alternativa
   descartada: que no llegue a nadie — SPEC-009 §5 avisó de que tras aquel deploy
   *«los docentes ya existentes quedarán sin cursos»*, así que la regla estricta
   habría hecho desaparecer contenido real el día del despliegue.
2. **Estudiante sin `curso_id`** (fichas anteriores al catálogo de cursos). No se
   le puede acotar, así que **no se le filtra nada**: ve todo, como hoy. Se
   arregla asignándole curso desde el panel del admin, no rompiéndole la app.
3. **Historial ya jugado.** `GET /api/progreso/:id` **no** se filtra: si un niño
   ya jugó una actividad de otro curso, su nota y su XP siguen ahí. Borrarlos del
   panel dejaría el XP total sin explicación (los números tienen que cuadrar).

Consecuencia asumida y documentada: quitarle a un docente su último curso
**ensancha** el alcance de su contenido en lugar de reducirlo (vuelve a
institucional). Es fail-open y nunca oculta nada que hoy se vea.

### 2.4 `curso_id` deja de ser un metadato libre

Como ahora decide acceso, ya no puede aceptarse sin comprobar: `POST /api/retos`
y `PATCH /api/retos/:id` **validan que el curso esté asignado al docente**
(403 si no). Antes se guardaba cualquier entero, lo que con esta spec habría
permitido a un docente **inyectar contenido en el curso de otro**. El admin puede
apuntar a cualquier curso vivo (mismo trato que en el resto de su panel).

### 2.5 Qué NO se toca (a propósito)

- **El XP y su transaccionalidad.** `POST /api/progreso` solo gana un `if` de
  acceso **antes** de abrir el cálculo; el `FOR UPDATE`, el upsert idempotente y
  la fórmula del XP quedan carácter por carácter como estaban.
- **El panel del docente.** La Biblioteca sigue mostrando las actividades por
  **materia asignada** (SPEC-004): dos docentes que comparten materia se siguen
  viendo el contenido. Eso es diseño vigente, no el bug reportado.
- **Ranking, misiones, auditoría, papelera.** Ninguna consulta cambia.
- **`GET /api/retos/gestion`, `GET /api/retos/:id` y las estadísticas**: son
  vistas de docente/admin, no de estudiante.

## 3. La regla, en un solo sitio

`server/lib/alcanceCurso.js` — un fragmento SQL reutilizable, al estilo de
`sqlAulaDocente()` (SPEC-014 F6), para que la frontera no pueda decir dos cosas
distintas en dos endpoints:

```
contenido alcanza al estudiante  ⟺
      contenido.curso_id = <curso del estudiante>
   OR (contenido.curso_id IS NULL AND (
             el autor da clase en el curso del estudiante
          OR el autor no tiene ningún curso asignado ))
```

Consume dos parámetros posicionales: `[cursoId, cursoId]`. Si el estudiante no
tiene curso (`cursoDelEstudiante()` devuelve `null`), **el fragmento no se
aplica** (§2.3 punto 2).

## 4. Cambios

### BD — migración `015-frontera-curso.sql` (+ reversa, idempotente en `initDb.js`)

`materiales` gana `docente_id` y `curso_id` (ambos `NULL`, FK `ON DELETE SET
NULL`). **Aditiva**: las filas existentes quedan con los dos en `NULL`, es decir,
institucionales — nadie pierde acceso a material que hoy ve.

### Backend

| Endpoint | Cambio |
|---|---|
| `GET /api/retos` | + frontera de curso **solo para rol estudiante** |
| `POST /api/progreso` | + la MISMA frontera (403 «Esa actividad no está disponible para ti») |
| `GET /api/materias/:id/material` | + la MISMA frontera solo para rol estudiante |
| `POST /api/materias/:id/material` | graba `docente_id` (y acepta `curso_id` validado) |
| `POST /api/retos`, `PATCH /api/retos/:id` | validan que `curso_id` esté asignado al docente (403) |

### Frontend

`CamposActividad.jsx`: la opción por defecto pasa de «Todos los cursos» a
**«Todos mis cursos»** —el texto tiene que decir lo que el sistema hace ahora— y,
si el docente no tiene cursos asignados, el campo lo dice en vez de fingir que
elige algo.

## 5. Escenarios cubiertos

| Escenario | Resultado esperado |
|---|---|
| Docente 3 A publica sin curso · estudiante de 2 A | **No la ve** (el caso reportado) |
| Docente 3 A publica sin curso · estudiante de 3 A | La ve |
| Docente con 2 A **y** 3 A publica sin curso | La ven ambos cursos |
| Actividad con curso 3 A explícito · estudiante 2 A | No la ve |
| Actividad creada por el **admin** | La ven todos (institucional) |
| Actividad legacy con `docente_id` NULL | La ven todos |
| Docente sin cursos asignados | Su contenido sigue siendo institucional (§2.3) |
| Estudiante sin `curso_id` | Ve todo, como hoy |
| Estudiante fuerza `POST /api/progreso` con un `reto_id` ajeno | **403**, no suma XP |
| Estudiante fuerza `GET /api/retos?materia_id=N` | Filtrado igual (la UI oculta, el servidor protege) |
| Docente intenta publicar en el curso de otro (`curso_id` ajeno) | **403** |
| Material subido por el docente de 3 A · estudiante de 2 A | No lo ve |
| Material ya existente (sin autor) | Lo ven todos |
| Docente y admin | Sin cambios: ven todo su ámbito de siempre |
| Ya jugó una actividad ajena antes del fix | Conserva nota y XP; deja de aparecer para volver a jugarla |

## 6. Verificación

Ver §6 del reporte de cierre; el alcance real (local vs. producción) se declara
explícitamente según la regla §6.16.

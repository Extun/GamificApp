# SPEC-027 — El aula del docente también es una frontera

> Estado: **APROBADA por Fabrizio** (2026-08-13), en el mismo mensaje en que
> reportó el problema: «*tanto los docentes como estudiantes pueden visualizarse
> actividades entre distintos cursos […] asegúrate que no se compartan en cada
> materia*». Las tres decisiones abiertas se resolvieron con él antes de escribir
> código (§2).
> Toca **Ranking** → **§9 de CONTRIBUTING.md** (solo le añade el filtro de aula
> que ya usa el resto del panel; el orden por `xp_total` con `RANK()` no cambia)
> y modifica el contrato de siete endpoints → regla §6.6, por eso existe este
> documento.

## 1. Problema

[SPEC-026](SPEC-026-Frontera-De-Curso.md) cerró la mitad del problema: el
**estudiante** ya solo ve las actividades y el material que alcanzan a su curso.
Verificado contra MySQL real antes de escribir esta spec (dos docentes, dos
cursos, misma materia, transacción con `ROLLBACK`):

| Quién | Qué lista |
|---|---|
| Estudiante de 3ro A | la actividad de su docente, la dirigida a 3ro A, la del admin, la legacy |
| Estudiante de 4to B | la actividad de su docente, la dirigida a 4to B, la del admin, la legacy |
| Estudiante de 4to B forzando `POST /api/progreso` con un `reto_id` de 3ro A | **403** |

La otra mitad seguía abierta: **el panel del DOCENTE nunca tuvo frontera**. Su
único criterio de acceso es la materia asignada (`docente_materia`), así que dos
docentes de cursos distintos que comparten materia se ven —y se **gestionan**—
el contenido. Medido en el mismo escenario: docente A (3ro A) y docente B (4to B)
listan **las seis** actividades de prueba, las suyas y las del otro.

Seis fugas concretas, en orden de gravedad:

| # | Dónde | Qué pasa hoy |
|---|---|---|
| 1 | `GET /api/retos/gestion` y `retoGestionable()` | A **ve, edita, archiva, duplica, envía a la papelera y purga** las actividades de B |
| 2 | `GET /api/materias/:id/material` | el material marcado «Privado · solo tú puedes verlo» lo ve cualquier docente de esa materia |
| 3 | `GET /api/progreso/:estudiante_id` | solo bloquea al rol estudiante: un docente lee las notas de **cualquier** estudiante de la institución por id |
| 4 | `GET /api/ranking/completo` | lista a **todos** los estudiantes de la institución, sin filtro de aula |
| 5 | `GET /api/docente/resumen` | los contadores de actividades y material suman el contenido de los colegas |
| 6 | `GET /api/banco` y `preguntaGestionable()` | el Banco de Preguntas se comparte por materia, igual que la Biblioteca |

Los puntos 2, 3 y 4 son bugs a secas: contradicen lo que la propia UI promete
(«solo tú puedes verlo», «Mis Estudiantes»). El punto 1 es un **cambio de
criterio**: SPEC-026 §2.5 dejó por escrito que la Biblioteca seguía siendo por
materia y que eso era «diseño vigente, no el bug reportado». Esta spec revierte
esa decisión concreta, con la aprobación explícita de Fabrizio.

## 2. Decisiones (acordadas con Fabrizio)

### 2.1 El contenido del docente es SUYO (autoría, no materia)

La Biblioteca de Actividades y el Banco de Preguntas pasan a mostrar **solo lo
que ese docente creó**. Se descartaron «lo que alcanza a sus cursos» (más
complejo de explicar y sigue mezclando) y «dejarlo compartido» (es justo lo
reportado).

La materia **sigue mandando**: la autoría acota *dentro* de las materias
asignadas, no las sustituye. Nadie ve materias que no tiene.

### 2.2 Lo institucional sigue siendo de todos (mismo fail-open que SPEC-026)

Idéntico criterio que `sqlAlcanceCurso`, por las mismas razones: **el filtro solo
puede QUITAR contenido ajeno, nunca vaciar un panel que hoy tiene cosas**.

| `docente_id` del contenido | Quién lo gestiona |
|---|---|
| El docente en sesión | Él (y el admin) |
| `NULL` (filas legacy, anteriores a la migración 005/015) | **Todos** los docentes de esa materia |
| Un usuario con rol `admin` | **Todos** los docentes de esa materia |
| Otro docente | Solo su autor (y el admin) |

Consecuencias asumidas:

- El **material privado legacy** (`docente_id` NULL, `is_private` TRUE) sigue
  siendo visible para todos los docentes de la materia. No se puede adivinar de
  quién era, y ocultarlo le quitaría a alguien un archivo que hoy usa. El
  material **nuevo** sí es privado de verdad.
- El **admin no pierde nada**: sigue viendo y gestionando todo, como siempre.

### 2.3 La unicidad del título pasa a ser por autor

`POST /api/retos` es un upsert por `(materia_id, titulo)` y **no hay índice UNIQUE
en la BD** que lo respalde (verificado: `retos` solo tiene índices no únicos).
Con la frontera activa eso se vuelve peligroso: si B publica «Sumas» y A ya tenía
una «Sumas» en esa materia, B **sobrescribiría la actividad de A sin verla**.

El upsert, la comprobación de título de `PATCH` y el sufijo «(copia)» de
`POST /:id/duplicar` pasan a mirar **solo el contenido que quien pide puede
gestionar**. Dos docentes distintos pueden tener el mismo título en la misma
materia; es preferible a bloquear a alguien contra una fila que no puede ver ni
renombrar. Lo mismo con el anti-duplicado del Banco de Preguntas: «esa pregunta
ya está en tu banco» tiene que hablar de **tu** banco.

### 2.4 El estudiante no ve materias vacías

Con la frontera de SPEC-026, un estudiante veía las 6 materias de la institución
aunque su docente solo publicara en 2: cuatro «mundos» vacíos seguidos, para
niños de 6 a 9 años. `GET /api/materias` pasa a listarle, **solo al rol
estudiante**, las materias donde hay algo para él:

```
materia visible  ⟺   tiene ≥1 actividad publicada de un tipo jugable que le alcanza
                  OR tiene ≥1 material público que le alcanza
                  OR ya tiene progreso registrado en ella
```

La tercera condición es la que impide que una materia **desaparezca con su
historial** si el docente archiva su contenido: lo ya jugado nunca se esconde
(mismo principio que SPEC-026 §2.3 punto 3). Docente y admin no cambian.

### 2.5 Qué NO se toca

- **El XP y su transaccionalidad.** Esta spec no entra en `POST /api/progreso`.
- **El motor de misiones y su catálogo**: son institucionales por diseño.
- **`GET /api/ranking`** (Top global): la consulta no cambia. Hoy además no la
  consume ninguna pantalla.
- **La papelera, la auditoría y los permisos del admin.**
- **El esquema.** Cero migraciones: `retos.docente_id`, `materiales.docente_id`
  (migración 015) y `banco_preguntas.creado_por` ya existen.

## 3. La regla, en un solo sitio

Junto a `sqlAlcanceCurso`, en `server/lib/alcanceCurso.js`:

```
contenido gestionable por el docente  ⟺
      contenido.<autor> = <docente en sesión>
   OR contenido.<autor> IS NULL                  (legacy institucional)
   OR el autor es un usuario con rol 'admin'     (institucional)
```

Consume **un** parámetro posicional: `[docenteId]`. Sirve para las tres tablas
(`retos.docente_id`, `materiales.docente_id`, `banco_preguntas.creado_por`)
porque recibe el nombre de la columna. El admin nunca lo usa: ve todo.

## 4. Cambios

### BD

**Ninguno.** No hay migración: las tres columnas de autoría ya existen.

### Backend

| Endpoint | Cambio |
|---|---|
| `GET /api/retos/gestion` | + frontera de autoría (incluida la pestaña Papelera) |
| `GET /api/retos` | + frontera de autoría **solo para rol docente** (alimenta el resumen de la materia; tenía que decir lo mismo que la Biblioteca) |
| `POST /api/ia/adaptar` | + frontera de autoría sobre la actividad de origen: adaptarla es leer su contenido íntegro |
| `POST /api/ia/sorpresa`, `POST /api/ia/adaptar` | + **valida `curso_id`** al guardar el borrador (hueco de SPEC-026 §2.4: esta vía nunca lo comprobó, y un `PATCH` de estado no revalida un curso que no cambia) |
| `GET/PATCH/DELETE /api/retos/:id`, `/duplicar`, `/restaurar`, `/definitivo`, `/estadisticas` | + frontera de autoría en `retoGestionable()` → **403** |
| `POST /api/retos`, `PATCH /api/retos/:id`, `POST /:id/duplicar` | la unicidad de título se busca solo entre el contenido propio |
| `GET /api/materias/:id/material` | docente: solo su material + el institucional; `is_private` ajeno deja de listarse |
| `DELETE /api/materias/:id/material/:id` | + frontera de autoría → **403** |
| `GET /api/banco`, `GET/PUT/DELETE /api/banco/:id`, anti-duplicado de `POST` | + frontera de autoría (`creado_por`) |
| `GET /api/docente/resumen` | los contadores de actividades/material cuentan solo lo propio |
| `GET /api/progreso/:estudiante_id` | + el docente solo consulta a estudiantes de **su** aula (`sqlAulaDocente`) → **403** |
| `GET /api/ranking/completo` | + filtro de aula para el docente (el admin sigue viendo la institución) |
| `GET /api/materias` | rol estudiante: se ocultan las materias sin nada para él (§2.4) |

### Frontend

Ninguno necesario: todas las pantallas leen de estos endpoints y ya tienen sus
estados vacíos. El texto «Privado · solo tú puedes verlo» del panel de material
pasa a ser cierto por primera vez.

## 5. Escenarios cubiertos

| Escenario | Resultado esperado |
|---|---|
| Docente A y docente B, cursos distintos, misma materia | Cada uno ve **solo sus** actividades |
| A intenta editar/archivar/borrar una actividad de B por id | **403** |
| A intenta ver las estadísticas de una actividad de B | **403** |
| Actividad legacy (`docente_id` NULL) o creada por el admin | La siguen viendo y gestionando **todos** |
| B publica «Sumas» y A ya tenía una «Sumas» | Se crea la de B; la de A no se toca |
| Material privado de A | Solo lo ve A (y el admin) |
| Material privado legacy sin autor | Lo siguen viendo todos (§2.2) |
| A intenta adaptar con IA una actividad de B | **403** |
| Docente genera un borrador con IA apuntando al curso de otro | **403** |
| Docente pide `GET /api/progreso/:id` de un estudiante ajeno | **403** |
| Docente abre el Ranking | Solo sus estudiantes; el admin, todos |
| Estudiante con materias sin contenido para su curso | No las ve |
| Estudiante con progreso en una materia que quedó sin contenido | La sigue viendo, con su historial |
| Estudiante sin `curso_id` | Ve todas las materias **con contenido** (fail-open de SPEC-026 intacto) |
| Admin | Sin cambios: ve y gestiona todo |

## 6. Verificación

Escenario completo contra MySQL real (el mismo script de dos docentes/dos cursos
que produjo las tablas de §1), antes y después. El alcance real (local vs.
producción) se declara explícitamente según la regla §6.16.

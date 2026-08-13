# SPEC-025 — El Top de una materia es de esa materia

> Estado: **APROBADA por Fabrizio** (2026-08-12), en el mismo mensaje en que
> reportó el problema: «*no debería de mostrarse el top #3 de estudiantes de esa
> materia en específico en lugar de los Top de la institución? Implementa eso y
> que funcione con las materias que se tiene/las materias que se implementen o
> asignen en un futuro*».
> Toca **Ranking** → **§9 de CONTRIBUTING.md** y añade una API
> (`GET /api/ranking/materia/:materia_id`) → regla §6.6, por eso existe este
> documento. **No** modifica `GET /api/ranking` ni `GET /api/ranking/completo`,
> ni la transaccionalidad del XP (`POST /api/progreso`), que no se han tocado.

## 1. Problema

Fabrizio crea un curso y una materia nueva («Robótica»), entra en ella y la
pestaña **Resumen** le muestra la tarjeta **«Top de la institución»** con tres
nombres —13688, 900 y **0 pts**— de estudiantes que **no están en su curso** ni
han tocado esa materia, que además **no tiene ni una actividad publicada**.

El dato era **correcto y estaba bien rotulado** —eso ya se arregló en SPEC-021
P2-4, cuando el título decía «Top estudiantes» y se cambió por «Top de la
institución»—, pero seguía siendo **el dato equivocado para ese sitio**:

1. **No es de la materia.** Salía de `GET /api/ranking`, que ordena por
   `estudiantes.xp_total`: el XP de **todas** las materias más el de las
   Misiones (SPEC-007), que no pertenece a ninguna.
2. **No es de sus estudiantes.** Sin filtro de curso, un docente veía nombres de
   cursos que no maneja. Dentro de su propia materia, y al lado de «Actividades
   disponibles en Robótica», eso se lee como «los mejores de aquí».
3. **Un «0 pts» en un top.** El tercer puesto era alguien con 0 XP: ruido que
   además hacía imposible el estado vacío honesto.

La tarjeta ocupaba un tercio del Resumen de la materia sin poder responder a la
única pregunta que el docente le hace: **¿cómo va mi clase en esto?**

## 2. Decisión

La tarjeta pasa a ser **el Top 3 de ESA materia entre LOS ESTUDIANTES DEL
DOCENTE**. Dos filtros, y los dos son el punto:

- **Por materia:** el XP se suma desde `progreso_estudiante` uniendo a
  `retos.materia_id`, no desde `estudiantes.xp_total`. Es XP **ganado aquí**.
  Consecuencia buscada: el XP de Misiones no infla el top de ninguna materia.
- **Por aula:** se reutiliza `sqlAulaDocente()` (`server/lib/estudiantes.js`),
  el **criterio único** de SPEC-014 F6 que ya usan «Mis Estudiantes», el Libro
  de Calificaciones y el reseteo de PIN: cursos asignados por el admin
  (`docente_curso`) **o** invitación legacy usada. Así el top no puede
  contradecir a la lista de estudiantes del propio panel. El **admin** no tiene
  ese límite (mismo trato que en el resto de su panel).

**Funciona con cualquier materia, presente o futura, sin tocar código:** la
consulta recibe el `materia_id` que ya resuelve `idPorNombre()` del catálogo
dinámico (SPEC-002) y el acceso lo decide `docente_materia`. Una materia creada
por el admin mañana y asignada a un docente aparece con su propio top el mismo
día, sin migraciones ni listas fijas.

### 2.1 Qué NO se toca (a propósito)

- `GET /api/ranking` y `GET /api/ranking/completo` quedan **exactamente** como
  estaban: misma consulta, mismo orden, mismo `RANK()`. La sección «Ranking» del
  panel (`RankingCompleto`) sigue siendo el ranking global de la institución, que
  es lo correcto **ahí**, donde el rótulo y los filtros por curso lo explican.
- El XP y su transaccionalidad. La ruta nueva es de **solo lectura**: no escribe
  una fila. Verificado: `estudiantes.xp_total` no cambió en ninguna de las 27
  comprobaciones.
- `obtenerRanking()` sigue exportado en `gamificationService`: el endpoint global
  existe y es legítimo; retirarlo sería otro cambio de área protegida.

## 3. API nueva

```
GET /api/ranking/materia/:materia_id?limite=3     (docente o admin)
```

- **403** si el docente no tiene esa materia asignada (`puedeGestionarMateria`,
  la misma autoridad que para publicar contenido en ella) — y también si la
  materia no existe, para no revelar el catálogo ajeno.
- **400** si `materia_id` no es un entero positivo. `limite` se recorta a [1, 50].
- **401** sin token (muro general de `/api`).
- **200** con `[{ id, nombre, curso, xp_materia, posicion }]`, ordenado por
  `xp_materia` y, en empate, por apellidos y nombres. `posicion` es `RANK()`, así
  que dos empatados comparten posición. Lista **vacía** cuando nadie ha ganado XP
  en esa materia — que es el caso de una materia recién creada.
- **Excluye**: cuentas en la Papelera (SPEC-003), retos en la Papelera y a quien
  tenga progreso pero **0 XP** (`HAVING SUM(...) > 0`): un «0 pts» no es un top.
- `CAST(SUM(...) AS SIGNED)` porque `SUM()` de un entero es DECIMAL y mysql2 lo
  entregaría como **cadena**.
- **Sin migración de BD.** No hace falta: la consulta usa `progreso_estudiante`,
  `retos.materia_id` y `docente_curso`, que ya existen.

## 4. La tarjeta, y sus cinco estados

Título: **«Top de la materia»**. Cada fila muestra posición, nombre, **curso** y
XP, y bajo la lista una nota que dice de qué es el número: *«XP ganado en
{materia} por tus estudiantes.»* — la lección de P2-4 es que un número sin
etiqueta correcta miente aunque el número sea cierto.

Los estados se dicen **por separado**, siguiendo la causa raíz C1 del cierre de
v1.0 (una lista vacía significaba a la vez «todavía no sé» y «no hay nada», y la
UI siempre elegía lo segundo):

| Estado | Mensaje |
|---|---|
| Cargando | «Calculando el top de {materia}…» |
| Con datos | la lista + la nota |
| Vacío | «Todavía nadie ha ganado XP en {materia}. En cuanto tus estudiantes jueguen una actividad de esta materia, aquí aparecerán los tres primeros.» |
| Sin estudiantes | «Todavía no tienes estudiantes en tus cursos: el top aparecerá cuando los registres y jueguen una actividad de {materia}.» |
| Error | «No pudimos cargar el top de esta materia. Vuelve a entrar en unos segundos.» |

`obtenerRankingMateria()` **propaga** el error (a diferencia de
`obtenerRanking()`, que devuelve `[]`): devolver una lista vacía al fallar la red
convertiría un fallo en el dato falso «nadie ha ganado XP».

El resultado se guarda **por materia** (`rankingPorMateria`), no en un estado
único: así la ausencia de entrada significa «cargando» sin necesidad de un
`setState` en el cuerpo del efecto (lint `react-hooks/set-state-in-effect`), y
volver a una materia ya consultada no vuelve a mostrar «Calculando…».

## 5. Archivos

| Archivo | Cambio |
|---|---|
| `server/routes/ranking.js` | + ruta `/materia/:materia_id` (las dos existentes, intactas) |
| `src/services/gamificationService.js` | + `obtenerRankingMateria()` |
| `src/pages/admin/dashboard.jsx` | `WidgetsRendimiento` recibe `topMateria`; carga por materia |
| `src/pages/admin/dashboard.css` | + `.widget-rank-datos`, `.widget-rank-curso`, `.widget-rank-nota` |

## 6. Verificación

`npm run build` limpio · **lint 29 = línea base exacta**.

### 6.1 API contra el backend real y MySQL real — 27/27

Script `verificar-top-materia.mjs` ejecutado contra el backend de verdad (portable,
puerto 3001) y la BD local `gamificapp_dev`, con **logins reales** de docente,
admin y estudiante. Cero mocks. Datos semilla: docente.demo con **3ro A** y las
materias Matemáticas y Lengua; cuatro estudiantes, uno de ellos en **4to B**.

1. **El top sale de la materia, no del XP total.** Matemáticas → Uno **500**
   (200+300) y Dos **100**; Lengua → solo Uno con **300** (200+100). Uno tiene
   `xp_total = 7437` en la BD: **el XP de Misiones no se cuela**. Cada fila trae
   su curso y `xp_materia` viaja como número, no como cadena.
2. **Aula.** Se le dio a la estudiante de 4to B **9999 XP** en Matemáticas: el
   docente **no la ve** y su top no cambia ni de orden ni de cifras; el **admin
   sí la ve**, encabezando.
3. **0 XP.** Progreso registrado con 0 XP → **no** aparece como «0 pts».
4. **Empate.** Dos estudiantes a 500 → **ambos posición 1**, desempatando por
   apellido.
5. **Papelera.** Reto eliminado → el top baja de 500 a **200**; cuenta eliminada
   → **no compite**.
6. **Permisos.** Materia ajena → **403**; materia inexistente → **403**;
   `materia_id` 0 o no numérico → **400**; **estudiante → 403**; sin token →
   **401**; el admin sí puede mirar una materia que no es de nadie → 200.
7. **Límite.** Con tres estudiantes con XP: `limite=3` → 500/400/100 en ese
   orden; `limite=1` → solo el primero.
8. **El caso reportado.** Materia «Robótica» creada y asignada: **200 y lista
   vacía** (antes salía el top global). Tras un intento real de un estudiante en
   una actividad suya, el top se puebla solo (**300**) y **no contamina** el de
   Matemáticas.
9. **Docente sin cursos asignados** (instalación recién estrenada): **200 y lista
   vacía**, ni error ni datos ajenos; al devolverle el curso, el top vuelve.

La BD se dejó **como estaba**: comparación de `mysqldump` antes/después idéntica
en `progreso_estudiante`, `estudiantes`, `retos`, `docente_curso` y
`docente_materia` (salvo contadores `AUTO_INCREMENT` y el hash de `admin`, que el
propio servidor resincroniza al arrancar con `ADMIN_PASSWORD`).

### 6.2 En el navegador, sobre el `dist` reconstruido

Con la materia «Robótica» sembrada para reproducir el caso exacto del reporte:

- **Matemáticas** → «Top de la materia · 1 Estudiante Prueba Uno · 3ro · 500 pts
  / 2 Estudiante Prueba Dos · 3ro · 100 pts» + «XP ganado en Matemáticas por tus
  estudiantes».
- **Lengua y Literatura** → un solo estudiante con **300 pts**: cada materia
  tiene su propio top, y se ve.
- **Robótica** (recién creada, sin actividades) → «**Todavía nadie ha ganado XP
  en Robótica**…». Es el sitio donde antes salía el top de la institución.
- **Transición real capturada con `MutationObserver`**: «Calculando el top de
  Robótica…» → mensaje vacío honesto 10 ms después.
- **Error**: con la API **detenida**, entrar en Lengua da «Calculando…» → «**No
  pudimos cargar el top de esta materia**», nunca «nadie ha ganado XP»; la sesión
  **sigue abierta** en `/dashboard` (SPEC-024: un fallo de red no cierra sesión).
  Al reanudar la API, volver a entrar muestra los datos reales.
- **Sin estudiantes**: quitándole el curso al docente, la tarjeta dice «Todavía
  no tienes estudiantes en tus cursos…».
- **Maquetación**: las tres tarjetas del Resumen siguen midiendo lo mismo
  (229 px de alto); a **375 px** no hay desbordamiento horizontal y el curso y la
  nota caben. Consola sin errores (salvo los dos `ERR_CONNECTION_REFUSED`
  provocados a propósito al apagar la API).

### 6.3 Alcance real (regla §6.16)

Todo lo anterior es **local**, contra MySQL real. **Nada probado en producción**:
el despliegue (Vercel + Render) y su comprobación con los datos de Aiven —donde
está el caso original de Fabrizio con Robótica— quedan pendientes. No hay
migración que aplicar, así que el deploy es solo código.

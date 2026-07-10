# Auditoría de Sincronización Global — v1

> Fecha: 2026-07-09 · Alcance: buscar datos hardcodeados/duplicados que
> repliquen información que ya vive en la BD, y verificar la propagación
> Administrador → Docente → Estudiante.

## Veredicto general

La app **ya es mayormente dinámica**. La fuente única de verdad existe y se
respeta en casi todo: materias, cursos, institución (nombre/logo/favicon/
colores) y permisos se leen desde la API vía servicios, no desde constantes.
La auditoría encontró **un único hardcodeo real de datos** (el generador de
Misión IA asumía "Matemáticas"), ya corregido. El resto de "listas" que
existen en el frontend son **paletas de UI o enums de sistema**, no datos de
institución, y no deben moverse a la BD.

## 1. Qué estaba hardcodeado (hallazgo real)

**Generador de Misión IA — `server/routes/ia.js`.** Asumía la materia
Matemáticas:
- `const materia = req.body?.materia || 'Matemáticas'` (default fijo).
- El prompt decía "docente experto en Matemáticas", "el problema matemático",
  "matemáticamente exacta".
- El `MISION_SCHEMA` describía "El desafío matemático concreto".

Era el único punto donde la IA asumía una materia fija. (El generador de
**Quiz** ya era agnóstico: exige `materia` y la interpola tal cual.)

## 2. Qué fue eliminado / corregido

- `server/routes/ia.js`: la Misión ahora **exige `materia`** (400 si falta) y
  el prompt + schema son **agnósticos de la materia**: se adaptan a la que
  envíe el docente (Matemáticas, Ciencias, Lengua o cualquier materia nueva
  del catálogo). Sin default a "Matemáticas".
- La UI (`GeneradorMision.jsx`) ya era agnóstica (campo "Tema de la lección",
  ejemplos de varias materias) y siempre envía la materia real seleccionada.

## 3. Qué ya se obtiene desde la API (verificado en código)

| Dato | Fuente única | Consumidores |
|------|--------------|--------------|
| Materias (nombre, color, icono, activa) | `GET /api/materias` → `materiasService` | Admin, Docente (Home, materias, biblioteca, generadores Quiz/Clasificador/Misión), Estudiante ("mundos") |
| Cursos | `GET /api/cursos` / `GET /api/admin/cursos` → `adminService`/`docenteService` | Admin (módulo Cursos), Docente (invitaciones) |
| Institución (nombre, logo, favicon, colores) | `GET /api/institucion` → `institucionService` | Login, sidebars de los 3 paneles, `:root` (colores), `<title>`, favicon — todo se re-aplica al guardar |
| Permisos de admin | JWT + revalidación `conPermiso` en cada endpoint → `authService.tienePermiso` | Sidebar admin, stats, accesos (UI oculta; el servidor protege) |
| Retos / progreso / ranking | `retos`/`progreso`/`ranking` | Docente y Estudiante, sin listas locales |

Ningún panel mantiene una lista duplicada de materias, cursos ni institución.
`src/constants/materias.js` fue eliminado en SPEC-002; no reapareció.

## 4. "Listas" que NO son hardcodeo (y por qué deben quedarse)

Estas son **paletas de UI** o **enums de sistema**, no datos configurables por
la institución. Moverlas a la BD sería sobre-ingeniería:

- `COLORES_SUGERIDOS` / `ICONOS_SUGERIDOS` (`ModuloMaterias.jsx`): swatches que
  el admin **elige**; lo elegido se guarda en `materias.color/icono` y se lee
  dinámicamente. Son opciones del selector, no la verdad.
- `COLORES_CATEGORIA` (`EditorClasificador.jsx`): rotación visual de categorías
  dentro de un juego; presentacional.
- `TEMATICAS` (`GeneradorMision.jsx`): ambientaciones de aventura (piratas,
  espacio…); son opciones creativas del generador, no estructura institucional.
- Roles `'admin' | 'docente' | 'estudiante'`: **enum fijo del esquema**
  (`usuarios.rol ENUM`). La app debe ramificar por rol; no es dato que una
  institución cambie. Igual el ENUM `estado` de retos.
- Fallbacks de nombre institucional (`… || 'Unidad Educativa Fiscal Clemencia
  Coronel de Pincay'`): red de seguridad para el primer pintado sin caché ni
  red. No es la fuente; la API siempre pisa.

## 5. El caso "Inglés / Robótica no aparecen en Docente" — NO es hardcodeo

Es comportamiento **por diseño**, no un dato fijo:

- El Docente ve solo las materias que el Admin le **asignó**
  (`docente_materia`), vía `GET /api/docente/mis-materias`. Un profesor de
  Educación Física no debe recibir "Robótica" automáticamente.
- Al crear una materia en Admin, esta entra al catálogo (`materias`) y ya está
  disponible para asignar, para el Estudiante (si tiene retos) y para los
  selectores. Pero **no se auto-asigna** a ningún docente.
- El flujo para que aparezca en un docente existe hoy: Admin → Docentes →
  **"Editar materias"** → marcar la nueva → guardar. El panel del docente la
  toma en su próxima carga de `mis-materias` (sin tocar código).

Es decir: la propagación es dinámica; lo que falta es el **paso de asignación**
(intencional). Ver recomendación en §7.

## 6. Propagación Admin → Docente → Estudiante (estado real)

| Acción del Admin | ¿Se propaga sin tocar código? | Notas |
|---|---|---|
| Nueva / editar / eliminar materia | ✅ | Catálogo dinámico; a Docente **tras asignarla** (§5) |
| Nuevo / editar / desactivar curso | ✅ | Docente lo ve en el selector de invitaciones |
| Nombre / logo / favicon / colores institución | ✅ | `institucionService` re-aplica en Login y los 3 sidebars |
| Agregar admin / permisos / rol | ✅ | `conPermiso` revalida por endpoint; UI oculta |
| Reset PIN, papelera, auditoría | ✅ | Ya en SPEC-003 |

Salvedad transversal: los paneles ya abiertos refrescan al **recargar o
navegar** a la sección (el admin tiene polling de 20 s; docente/estudiante
recargan al entrar a cada sección). No hay push en tiempo real (websockets),
lo cual es correcto para el alcance de la tesis.

## 7. Qué todavía no es 100% dinámico (limitaciones arquitectónicas)

1. **Asignación materia→docente es manual** (por diseño). Si se quiere
   "materia nueva visible para todos los docentes al instante", habría que
   decidir una política (¿todas las materias a todos? ¿opción "materia global"
   en el catálogo?). Es un **cambio de modelo de datos/permisos**, no un
   parche; requiere spec aprobada (regla 6 de CLAUDE.md).
2. **Sin tiempo real.** La propagación ocurre al recargar/navegar, no por push.
   Aceptable para la tesis; websockets serían post-tesis.
3. **Roles y estados son enums de esquema**, no configurables desde el panel.
   Volverlos dinámicos (roles personalizados por institución) es un rediseño
   grande, fuera de alcance MVP.
4. **Temáticas de misión y paletas de sugerencia** viven en el front. Podrían
   hacerse configurables, pero hoy no aportan valor a la tesis.

## 8. Recomendaciones antes de nuevas funcionalidades

1. **Cerrar el gap percibido de §5** con una decisión de producto (no de
   código): o bien documentar claramente que "materia nueva ⇒ asignarla al
   docente", o bien introducir (con spec) una casilla **"materia global"** en
   el catálogo que exponga la materia a todos los docentes sin asignación
   individual. Recomiendo empezar por documentar; el resto post-decisión.
2. **Deploy pendiente**: aplicar a Aiven las migraciones 002–005 (siguen sin
   correr en producción). Varias garantías dinámicas (permisos 403, papelera,
   auditoría, autoría de retos) solo se verifican end-to-end tras el deploy.
3. **No convertir paletas/enums en tablas** salvo que una institución real lo
   pida: sería complejidad sin retorno para la tesis.

## 9. Cambios de esta auditoría

- `server/routes/ia.js`: Misión IA agnóstica de materia (materia obligatoria,
  prompt y schema sin "Matemáticas"). Único cambio de código.
- Documentación: este informe.

# SPEC-012 — Editores de juegos consistentes (barra unificada, Misión editable, vista previa)

**Estado:** APROBADA por Fabrizio (2026-07-16) — Fases 1, 2 y 3 implementadas en código; verificación e2e pendiente del deploy (sin MySQL local)
**Fecha:** 2026-07-16
**Nota de implementación (Fase 3):** el botón explícito "Guardar borrador" quedó en Misión y en los juegos genéricos; Quiz y Clasificador guardan el borrador AUTOMÁTICAMENTE en BD con cada edición (SPEC-011), así que el botón sería ruido ahí. La barra unificada cubre las 4 acciones de contenido: + Manual / + Del banco / + Con IA / Vista previa. Además, los juegos genéricos ganaron "+ ítem manual" (pareja/evento/frase vacía editable), que no existía.
**Alcance:** Frontend (editores del docente + reproductores en modo prueba). Sin migración de BD, sin cambios de API. Áreas protegidas §10 NO se tocan (la "Misión Narrativa" es un reto tipo `mision`, no el motor de misiones/logros).

## 1. Problema

Cada editor de juego ofrece un set distinto de acciones, sin lógica clara; el docente percibe los editores como incompletos e inconsistentes. Estado actual:

| Editor | + Manual | Del banco | + Con IA | Editar lo generado | Guardar borrador | Dificultad/Curso |
|---|---|---|---|---|---|---|
| Quiz | ✅ | ✅ | ✅ | ✅ | implícito | ❌ |
| Memorama/Línea/Completar | ❌ | ✅ | ❌ (regenera todo) | ✅ | ✅ | ✅ |
| Clasificador | ✅ | ❌ (por diseño) | ❌ | ✅ | ❌ | ❌ |
| Misión narrativa | ❌ | ❌ | ❌ | ❌ **solo lectura** | ❌ | ❌ |

La Misión narrativa es la más débil: no se puede editar nada de lo que generó la IA.

## 2. Objetivo (lo aprobado por Fabrizio)

Tres mejoras, por fases independientes que compilan y dejan la app estable:

### Fase 1 — Misión narrativa editable (aislada, sin tocar otros editores)
- Convertir la vista de solo lectura en editable: título, introducción, final; por desafío: narrativa, pregunta, 3 alternativas + marcar correcta; añadir/eliminar desafío (respetando el rango del validador del servidor, `server/lib/validadoresRetos.js`).
- Añadir selector de **dificultad** y **curso** (como los juegos genéricos), pasados a `publicarReto`.
- Botón **Guardar borrador** explícito además de Publicar. La sincronización del borrador en BD (SPEC-011) ya existe; se reutiliza.
- Riesgo: bajo. Cambios contenidos en `GeneradorMision.jsx`; no afecta a los otros editores ni a los reproductores.

### Fase 2 — Vista previa como estudiante (componente compartido nuevo, aditivo)
- Nuevo `PreviewJuegoModal` (en `src/components/juegos/`) que monta el reproductor real del tipo dado dentro de un `ModalPanel`, alimentado con la `configuracion` del borrador EN MEMORIA (no requiere estar publicado).
- **Modo prueba, sin efectos secundarios:** se pasa `estudianteId={null}` y una bandera nueva `soloPrueba` a los reproductores (`QuizInteractivo`, `MisionNarrativa`, `JuegoDragAndDrop`, `juegosComunes` → Memorama/Línea/Completar). `soloPrueba` corta el efecto de recompensa (ni `completarReto`, ni `sumarXP`, ni `POST /api/progreso`). Sin la bandera todo sigue igual (compatibilidad total).
- Botón **Vista previa** en cada editor. Riesgo: medio-bajo; la bandera es puramente aditiva y por defecto `false`.

### Fase 3 — Barra de acciones unificada (refactor de los editores, mayor blast radius → al final)
- Componente compartido `BarraAccionesEditor` con el set estándar:
  `[+ Manual] [+ Del banco] [+ Con IA] · [Vista previa] [Guardar borrador] [Publicar]`.
- Cada acción se **muestra siempre**; si no aplica a ese tipo se **deshabilita con tooltip** que explica por qué (ej. Clasificador + banco: "El clasificador no usa el banco de preguntas"), en vez de omitirse. Así el docente ve un lenguaje consistente.
- Se adopta editor por editor, sin cambiar la lógica interna de cada uno (solo se reorganiza la botonera). Se hace al final, cuando Fases 1–2 ya fijaron los patrones.
- Riesgo: medio (toca 4 editores que funcionan). Mitigación: un editor a la vez, `npm run build` entre cada uno; no se altera ninguna llamada a servicios.

## 3. Fuera de alcance (anotado para después)
- Regenerar IA por ítem individual (requiere endpoints IA que devuelvan 1 ítem del tipo; backlog).
- Reordenar por drag en editores distintos a Línea del tiempo.
- Rediseño del selector de 6 tarjetas a chips compactos (mejora cosmética; backlog).

## 4. Criterios de aceptación
- Misión narrativa: se puede editar todo lo generado, añadir/quitar desafíos, fijar dificultad/curso y guardar borrador; publicar valida igual que hoy.
- Vista previa: se puede jugar el borrador sin publicarlo y sin que sume XP ni escriba progreso (verificable en red: ningún `POST /api/progreso`).
- Los 6 editores muestran la misma botonera; lo no aplicable está deshabilitado y explicado.
- `npm run build` limpio tras cada fase; ningún reproductor cambia de comportamiento cuando `soloPrueba` no se pasa.

## 5. Orden
Fase 1 → verificar → Fase 2 → verificar → Fase 3 (editor por editor). Cada fase es un incremento estable e independiente; se puede detener entre fases sin dejar la app a medias.

# SPEC-013 — Editor de actividades universal (acciones, no módulos)

**Estado:** APROBADA por Fabrizio (2026-07-17) — diseño congelado; implementación por fases, ninguna iniciada
**Fecha:** 2026-07-17
**Alcance:** Frontend (editores del docente). Sin migración de BD, sin endpoints nuevos, sin cambios en reproductores salvo la lectura condicional de 2 flags aditivos en `configuracion_json` del quiz (Fase 1). Áreas protegidas §10 NO se tocan.
**Congelamiento:** el flujo y el lenguaje aquí descritos NO se replantean salvo problema importante durante el desarrollo. Cualquier duda de diseño se resuelve consultando esta spec, no rediscutiendo.

## 1. Problema

Tras SPEC-012 los 6 editores comparten botonera, pero el docente sigue percibiendo **tres módulos distintos** (Manual, IA, Banco) en vez de una sola tarea ("estoy creando mi actividad"). Los botones que no aplican se muestran deshabilitados con tooltip (parche visual), el guardado tiene dos paradigmas (autoguardado en Quiz/Clasificador, botón explícito en Misión/genéricos), el lenguaje es técnico ("Banco", "IA", "manual", "aleatorizar") y no existe forma de armar una actividad tomando N preguntas al azar de las ya guardadas.

## 2. Principio rector (congelado)

El docente piensa en **acciones sobre una única lista de contenido**, nunca en módulos ni herramientas. Todo vocabulario técnico queda enterrado en el código. La palabra "Banco" desaparece de la UI: para el docente son "preguntas que ya tienes". Mezclar orígenes (escrito + generado + reutilizado) en la misma lista es normal y la UI lo dice explícitamente.

## 3. El patrón universal

Un único botón **"➕ Agregar preguntas"** (o "parejas"/"eventos"/"frases"/"categorías"/"desafíos" según el tipo) abre un menú desplegable anclado (no modal de pantalla completa):

```
¿Cómo deseas agregarlas?

📝  Escribir preguntas
     Redacta tú mismo cada pregunta y sus opciones.
🤖  Generarlas automáticamente
     Dale un tema y la IA las redacta por ti.
📚  Reutilizar preguntas
     Elige entre las preguntas que ya has usado antes.
🎲  Seleccionar automáticamente
     El sistema arma un set variado por ti.
```

Cada entrada lleva título + subtítulo de una línea. **Lo que no aplica a un tipo NO aparece** (reemplaza el patrón "deshabilitado con tooltip" de SPEC-012 §Fase 3).

### Matriz de acciones por tipo (congelada)

| Tipo | 📝 Escribir | 🤖 Generar | 📚 Reutilizar | 🎲 Automático | Mezclar orden/respuestas |
|---|---|---|---|---|---|
| Quiz | ✅ | ✅ | ✅ | ✅ nuevo | ✅ (2 toggles) |
| Memorama | ✅ | ✅ | ✅ | ✅ nuevo | ya fijo en reproductor |
| Línea del tiempo | ✅ | ✅ | ✅ | ✅ nuevo | ya fijo en reproductor |
| Completar espacios | ✅ | ✅ | ✅ | ✅ nuevo | ya fijo en reproductor |
| Clasificador | ✅ | ✅ | ❌ | ❌ | ya fijo en reproductor |
| Misión Narrativa | ✅ | ✅ | ❌ | ❌ | ❌ (historia secuencial, no aplica) |

**Decisión congelada sobre Clasificador/Misión y el banco:** analizado y descartado para la tesis. Clasificador podría sumar "Reutilizar" con la unidad "grupo de categorías completo" (post-tesis, MASTER_PLAN §3.18). Misión queda fuera de alcance de forma permanente-consciente: reutilizar desafíos sueltos rompe la narrativa; adaptarla con IA al insertar es costo desproporcionado (MASTER_PLAN §3.19).

## 4. Flujo pantalla por pantalla (congelado)

1. **Tarjeta de tipo (selector de 6):** copy del Quiz pasa a "Preguntas de opción múltiple. Escríbelas, pídeselas a la IA, o usa las que ya tienes."
2. **Información básica:** título ("Ponle un nombre a tu Quiz", placeholder con ejemplo) + materia como chip de contexto. No pedir dificultad/curso antes de que hagan falta.
3. **Sección "Preguntas"** con subtítulo: "Agrega las preguntas de tu Quiz. Puedes combinar varias formas de hacerlo."
4. **Estado vacío:** `EmptyState` con un único botón grande protagonista "➕ Agregar preguntas". El menú de opciones aparece tras el clic, no antes.
5. **📝 Escribir:** sin modal — inserta tarjeta vacía al final de la lista con foco en el enunciado. Placeholders: "Escribe tu pregunta aquí", "Opción A…", ayuda "Marca cuál es la respuesta correcta".
6. **🤖 Generar (modal chico):** "¿Sobre qué tema?" + cantidad. Botón "Generar preguntas" (sin repetir "IA"). Cargando: "Creando tus preguntas...". Al terminar, cierra solo; las nuevas aparecen con resaltado que se desvanece (~2 s).
7. **📚 Reutilizar (modal grande, = SelectorBanco):** título "Reutilizar preguntas"; todo precargado, el buscador SOLO filtra; checkboxes + "Seleccionar todas"; botón dinámico "Agregar N preguntas seleccionadas". Vacío: "Todavía no tienes preguntas guardadas de otros Quiz. Cuando escribas o generes preguntas, aparecerán aquí para que las reutilices después."
8. **🎲 Automático (modal chico, NUEVO):** cantidad + tema (opcional) + dificultad (opcional, incluye "Cualquiera"). Línea explicativa antes del botón: "El sistema elegirá N preguntas de las que ya tienes guardadas, evitando repetir las que uses en este Quiz." Botón "Elegir preguntas". Si hay menos de N disponibles: "Solo encontré X preguntas de ese tema, las agregué todas."
9. **Lista (acordeón):** contador vivo "Preguntas (8)"; badge discreto de origen por ítem (✨ generada / ↺ reutilizada / ✓ editada) — etiqueta informativa, nunca botón ni navegación. Botón "➕ Agregar más preguntas" al final de la lista (mismo menú).
10. **⚙ Configuración (acordeón colapsado):** "☑ Mezclar el orden de las preguntas en cada intento / ☑ Mezclar el orden de las opciones en cada intento" + explicación: "Así cada estudiante ve un Quiz distinto, aunque sea el mismo para todos." La palabra "aleatorizar" no se usa.
11. **Barra fija inferior:** "👁 Ver como lo verá el estudiante" + "Publicar Quiz" (siempre nombrando el objeto) + indicador pasivo "☁ Guardado automáticamente".

## 5. Glosario de lenguaje (congelado)

| Interno/técnico | UI para el docente |
|---|---|
| Banco de preguntas | Reutilizar preguntas / "preguntas que ya tienes" |
| Generar con IA | Generarlas automáticamente |
| Añadir manual | Escribir preguntas |
| Selección aleatoria | Seleccionar automáticamente |
| Guardar borrador | (eliminado — autoguardado + indicador pasivo) |
| Vista previa | Ver como lo verá el estudiante |
| Publicar | Publicar Quiz / Publicar Misión / … |
| Aleatorizar | Mezclar el orden de… |
| `_banco_id`, origen `ia` | Badges ✨/↺/✓, nunca texto técnico |

## 6. Cambios de datos (únicos de toda la spec)

Tres campos **aditivos** en `configuracion_json` del quiz:
- `mezclar_preguntas` y `mezclar_respuestas` (boolean, **default `true`** cuando faltan). `QuizInteractivo.jsx` los lee condicionalmente (los quizzes publicados sin flags conservan el comportamiento actual — regla §6.12 intacta).
- `preguntas_por_intento` (número, **default `0` = todas**; ampliación aprobada 2026-07-17): el quiz guarda un pool de N preguntas y cada intento del estudiante muestra una **muestra aleatoria** de ese tamaño (mini banco por quiz — origen: recomendación externa de que al repetir un quiz no salgan siempre las mismas preguntas). Regla de XP obligatoria: `xp_recompensa` se calcula sobre las preguntas **mostradas por intento**, no sobre el pool (el servidor capa el abono con ese valor). La muestra conserva el orden relativo del pool (por si `mezclar_preguntas` está apagado) y se re-sortea en cada montaje del reproductor. El Banco de Preguntas global NO se conecta al tiempo de juego: sigue siendo herramienta de autoría que ayuda a llenar el pool.

Ningún otro cambio de modelo.

## 7. Roadmap de implementación (aprobado 2026-07-17)

Cada fase: objetivo único, mínimos archivos, `npm run build` limpio, prueba en navegador (incl. móvil) cuando es visible, `CURRENT_STATE.md` actualizado, visto bueno antes de la siguiente. Lo que necesita IA/BD real se verifica en producción tras deploy (§6.16 CLAUDE.md).

- **Fase 0 — esta spec** + anotaciones en MASTER_PLAN. ✅ al aprobarse.
- **Fase 1 — Toggles "Mezclar" del Quiz:** flags aditivos + lectura condicional + 2 checkboxes en "⚙ Configuración". Archivos: `QuizInteractivo.jsx`, `GeneradorQuiz.jsx`.
- **Fase 2 — Botón único + menú por acciones:** `BarraAccionesEditor` pasa de botones sueltos a 1 botón + menú condicional por tipo (matriz §3, datos en `registroJuegos.jsx`). Lo no aplicable desaparece. Sin cambio de lógica.
- **Fase 3 — Pasada de lenguaje y jerarquía:** glosario §5 + estado vacío + botón dinámico del selector + formulario IA colapsado tras generar + resaltado de recién agregados. Solo strings/JSX de presentación en los 4 editores + `SelectorBanco`.
- **Fase 4 — 🎲 en Quiz:** componente nuevo `SelectorAleatorioBanco` (modal §4.8). Reutiliza el servicio del banco; muestreo en cliente excluyendo `_banco_id` ya presentes; snapshots idénticos a la inserción manual.
- **Fase 5 — 🎲 en Memorama/Línea/Completar:** parametrización por tipo respetando `MAX_ITEMS` (10/8/8).
- **Fase 6 — Autoguardado unificado:** eliminar "Guardar borrador" de Misión/genéricos; `useHistorialRetos` como único mecanismo en los 6; indicador "☁ Guardado automáticamente". Verificar recarga sin pérdida + caché offline. Va tarde a propósito: único cambio de comportamiento de guardado.
- **Fase 7 — `ModalGenerarIA` unificado:** consolidar los 4 formularios de generación en un modal parametrizado (campos según tipo, incl. temática solo en Misión). Generación real se valida en producción.
- **Fase 8 — Shell `EditorActividad` (post-tesis, NO comprometida):** extraer tarjetas `ItemContenido[tipo]` y montar contenedor único vía registro (nunca `if (tipo === …)` en cascada). Las fases 1-7 entregan el 100% de la experiencia; esta es arquitectura interna invisible para el docente.

Orden: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7. Se puede detener entre fases sin dejar la app a medias.

## 8. Criterios de aceptación globales

- El docente completa cualquier actividad sin ver nunca las palabras "Banco", "IA" (fuera de descripciones secundarias), "manual" ni "aleatorizar".
- Una misma lista puede contener ítems escritos, generados y reutilizados, indistinguibles salvo por el badge.
- Clasificador y Misión muestran menú de 2 entradas sin botones muertos.
- Quizzes publicados antes de la Fase 1 siguen barajando igual que hoy.
- Ningún reproductor cambia de comportamiento fuera de los flags del §6.
- `npm run build` limpio tras cada fase.

## 9. Fuera de alcance (decisiones conscientes)

- Banco para Clasificador ("grupo de categorías") y Misión — MASTER_PLAN §3.18-19.
- Wizard multi-pantalla — descartado explícitamente: todo vive en una única pantalla.
- Endpoint de muestreo aleatorio en servidor — el muestreo en cliente basta para bancos de tamaño docente; optimizar solo si crece.
- Regenerar IA por ítem individual (sigue en backlog de SPEC-012 §3).

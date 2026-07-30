# SPEC-020 — POLISH SPRINT v1.0.1

**Estado:** 🟡 **EN CURSO.** Dos vías. **Vía 1 (sistema de diseño):** etapas 0 y 1 hechas; **2-6 SUSPENDIDAS** por decisión de Fabrizio el 2026-07-30. **Vía 2 (experiencia de juego):** etapas A y B hechas; C, D y E pendientes de aprobación una por una.
**Fecha:** 2026-07-30
**Origen:** v1.0 publicada y repositorio limpio. Etapa posterior a la entrega, dedicada exclusivamente a **calidad visual, experiencia de uso, animaciones y calidad técnica del frontend**.
**Alcance:** **Solo presentación.** Ninguna funcionalidad nueva, ninguna lógica de negocio, ninguna arquitectura, ningún modelo de datos, ninguna API, ninguna navegación, ningún cambio de marca ni de colores principales. Las capturas usadas en la tesis deben seguir siendo válidas.
**Insumos:** auditoría de código medida el 2026-07-30 (§2) + el backlog ya triado de `MASTER_PLAN.md` (ítems 39-50, 62).

---

## 1. Objetivo

Que la aplicación **se sienta claramente más profesional sin parecer otra aplicación**.

El criterio de éxito no es «se ve distinta»: es que un evaluador que conoce la v1.0 no sepa señalar qué cambió, pero perciba la interfaz como más terminada. Toda mejora respeta la identidad visual existente.

**Qué NO es este sprint:** un rediseño, una migración a otro sistema de estilos, ni una segunda pasada de SPEC-018. SPEC-018 cerró el 2026-07-29 con 8 fases y **no se reabre**.

## 2. Auditoría de partida (medida el 2026-07-30)

Línea base: `npm run build` limpio en 4,4 s; **lint 29 problemas (26 errores + 3 warnings)**.

| # | Hallazgo | Medida |
|---|---|---|
| **N1** | Sin feedback de pulsación | **109** reglas `:hover` frente a **4** `:active` en toda la app |
| **N2** | Hover sin protección táctil | **0** usos de `@media (hover: hover)`; `touch-action` en 1 solo archivo; sin `-webkit-tap-highlight-color` |
| **N3** | Movimiento sin sistema | **11** duraciones distintas; **216 de 245** transiciones con la curva por defecto `ease` |
| **N4** | Sin escala tipográfica | **53** tamaños de fuente distintos (0,66rem → 3,4rem); 7 tamaños solo entre 0,78 y 0,95rem |
| **N5** | Foco visible parcial | `:focus-visible` en **8 de 23** CSS (19 reglas) frente a 34 `:focus` |
| **N6** | Objetivos táctiles | un solo `min-height: 44px` en toda la app; hay controles de 24/34/40px |
| **N7** | Acabado del navegador | sin `::selection` ni scrollbars tematizadas |

**Por qué N1 y N2 encabezan la lista:** el público objetivo son niños de 6-9 años en **tablets compartidas de la escuela**, donde `:hover` no existe. Hoy el niño toca un control y no ve nada hasta que responde la acción.

**Confirmado como fuera de alcance, no como hallazgo:** el bundle único de 1,61 MB (455 kB gzip). El code splitting está **explícitamente excluido** del cierre de la tesis (`MASTER_PLAN.md`, «Deuda técnica explícitamente fuera del cierre»). No se toca.

## 3. Áreas CONGELADAS

Se hereda íntegro el §3 de SPEC-018 —lógica de los 7 juegos, XP, calificaciones, progreso, permisos, registro SPEC-017, SPEC-013, proveedores de IA SPEC-016, migraciones y BD— y se le añaden las restricciones propias de este sprint:

- **Cero cambios en `server/`.** Este sprint es exclusivamente frontend.
- **Navegación intacta:** ni rutas, ni estructura del sidebar, ni orden de los ítems.
- **Colores principales intactos:** `--color-primary*` y `--color-accent*` no se tocan.
- **Marca intacta:** logotipo, nombre, tipografías y voz.
- **Nada que invalide las capturas de la tesis:** ningún cambio de layout, de jerarquía ni de textos visibles.

**Regla dura:** si un pulido visual pareciera exigir tocar backend, lógica o navegación, **se detiene y se consulta**.

## 4. Etapas

Cada etapa es un **commit independiente** y **ninguna empieza sin aprobación explícita de Fabrizio**.

| Etapa | Contenido | Cambio visual esperado | Estado |
|---|---|---|---|
| **0** | `eslint.config.js` ignora `release/` y `runtime/` (ítem 62 del MASTER_PLAN) | Ninguno | ✅ Hecha |
| **1** | Escala de movimiento (`--duration-*`, `--ease-standard`, `--press-scale`) + base de interacción táctil + estado de pulsación en los controles compartidos | Perceptible al pulsar; nulo en reposo | ✅ Hecha |
| **2** | Escala tipográfica (`--text-*`) + migración de un archivo piloto | Ninguno (a verificar píxel a píxel) | ⬜ Pendiente |
| **3** | CSS muerto: ítems 42, 43, 50 + los dos hallazgos nuevos de §5 | Ninguno | ⬜ Pendiente |
| **4** | `:focus-visible` completo (N5) + objetivos táctiles ≥44px (N6) | Solo al navegar con teclado | ⬜ Pendiente |
| **5** | `@media (hover: hover)` por grupos de archivos (N2) | Solo en dispositivos táctiles | ⬜ Pendiente |
| **6** | Acabado: `::selection`, scrollbars (N7) + ítems 39, 40, 48, 49 | Bajo | ⬜ Pendiente |

**Orden y justificación:** 0 primero porque hace fiable la verificación de todo lo demás. 1 antes que 5 porque el estado de pulsación debe existir *antes* de acotar el hover a los dispositivos que lo tienen. 3 antes que 4-6 para no pulir código que va a desaparecer.

> **Vía 1 SUSPENDIDA el 2026-07-30 por decisión de Fabrizio.** «La infraestructura visual ya quedó suficientemente sólida»: las etapas **2 a 6 quedan en pausa, no canceladas**, y el sprint se concentra en la **Vía 2** (§4-bis). Se retoman cuando Fabrizio lo indique.

## 4-bis. Vía 2 — Experiencia de juego

**Origen:** auditoría específica de los 7 reproductores del 2026-07-30 (§4-ter). **Encargo textual:** «que jugar se sienta mucho más divertido», pensando siempre desde un niño de educación básica, priorizando **satisfacción** sobre animación — cada interacción debe dejar la sensación de que ocurrió algo. **Pequeños detalles bien ejecutados antes que grandes efectos**, manteniendo la app ligera, elegante y coherente. Cero cambios de mecánica.

| Etapa | Contenido | Estado |
|---|---|---|
| **A** | Memorama: celebración al emparejar y negación suave al fallar | ✅ Hecha |
| **B** | Verdadero/Falso y Completar espacios: la confirmación se siente | ✅ Hecha |
| **B-bis** | Diferenciar el tempo de V/F (ágil) y Completar (construcción) — ver §4-quater | ✅ Hecha |
| **C** | Transición entre ítems, **con el tempo propio de cada juego** (§4-quater) | ⬜ Pendiente |
| **D** | Línea del tiempo: movimiento real al reordenar | ✅ Hecha |
| **E** | Quiz: sensación de avance (barra de progreso + ir a la siguiente) | ✅ Hecha |

**Orden recomendado: A → B → D → C → E.** A y B son el mayor salto con el menor riesgo y tocan un reproductor cada uno. D revive keyframes ya escritos (ítem 42). C y E van al final por transversales: C toca tres reproductores y E comparte las clases `.opcion-*` con la Misión Narrativa.

**Descartado a propósito, no por olvido:** sonido (no hay sistema de audio y en un aula compartida es contraproducente), librerías de animación, canvas, y confeti durante la partida — agotaría el efecto que hoy premia la nota 100. Todo lo implementado es CSS + estado local de presentación.

## 4-quater. Criterio rector de la Vía 2 — personalidad por juego

**Añadido por Fabrizio el 2026-07-30, después de cerrar A y B. Gobierna C, D y E, y obliga a revisar A y B.**

Cada juego debe tener **personalidad propia: no exagerada, pero reconocible**. La regla de trabajo se invierte respecto a como se venía haciendo:

> **Primero se decide la emoción que el juego debe transmitir. La animación se elige después, como consecuencia.** Es preferible una animación pequeña que comunique bien la emoción que una vistosa que no la comunique.

| Juego | Emoción que debe transmitir | Consecuencia de diseño |
|---|---|---|
| **Clasificador** | *(la referencia — ya la tiene)* | No se toca. Es el patrón del que salen los demás. |
| **Memorama** | **satisfacción al descubrir** | El premio va en el instante del hallazgo, no en el recuento. |
| **Línea del tiempo** | **movimiento y orden** | Las cosas encuentran su sitio: recorrido real, nunca teletransporte. |
| **Quiz** | **progreso constante** | Siempre se avanza, nunca se está atascado. |
| **Verdadero/Falso** | **agilidad** | Tempo rápido: decidir, confirmar, siguiente. Nada que frene. |
| **Completar espacios** | **construcción** | Algo se arma pieza a pieza: tempo deliberado, no veloz. |

**Restricción que no cambia:** la personalidad se expresa dentro del **mismo lenguaje visual** (curvas, duraciones y tokens ya establecidos). Personalidad es **tempo e intención**, no una paleta ni un set de efectos por juego — eso rompería la coherencia que el sprint viene construyendo.

**Criterio añadido el 2026-07-30 — *delight*.** Además de UX, cada mejora debe dejar al estudiante con la sensación de **«estoy avanzando»**. No se busca sorprender con efectos: se busca que cada interacción resulte **agradable, clara y satisfactoria**. En la práctica esto ordena las prioridades cuando dos soluciones son igual de correctas: gana la que hace más visible el avance.

### Revisión de A y B a la luz de este criterio

- **Memorama (A): alineado.** El saltito premia el instante del hallazgo, que es exactamente «satisfacción al descubrir».
- **Verdadero/Falso y Completar (B): parcialmente desalineados.** Ambos recibieron **el mismo tratamiento y el mismo tempo** porque comparten el bloque `.completar-feedback`. Pero deben sentirse **distintos**: V/F pide agilidad y Completar pide construcción. **Corrección pendiente (B-bis):** diferenciar el tempo acotando por la clase raíz de cada reproductor —`.juego-vf` y `.juego-completar`, que ya existen— sin duplicar animaciones ni tocar el otro juego.

### Corrección al plan de la Etapa D

El plan original proponía **revivir los `@keyframes linea-sacudida`** que hoy son CSS muerto (ítem 42 del MASTER_PLAN). **Bajo este criterio se descarta:** una sacudida comunica error o rechazo, y la emoción de la Línea del tiempo es *orden*, no error. El CSS muerto se **elimina** en la etapa de limpieza en vez de revivirse.

## 4-ter. Auditoría de la experiencia de juego (2026-07-30)

**Método:** lectura de los 7 reproductores y la capa compartida, **más juego real instrumentado** con un escucha de `animationstart` sobre toda la página, para no opinar de memoria.

**Diagnóstico:** *el final está muy cuidado; el durante está mudo.* El overlay de cierre tiene contador 0→nota, confeti a 100, trofeo, estrellas y retroalimentación por rango — toda la celebración concentrada en una pantalla que el niño ve **una vez**, tras 10 interacciones que no le dieron nada.

| Juego | Al acertar | Al fallar | Cambio de ítem | Animaciones |
|---|---|---|---|---|
| Clasificador | canasta celebra + ficha aterriza | ficha rebota | — | **4** |
| Misión Narrativa | texto de éxito | pista amable | instantáneo | 1 |
| Memorama | nada (color fijo) | nada | volteo 0,4 s | **0** *(medido)* |
| Quiz | ámbar «Tu respuesta» | ídem | scroll manual | **0** |
| Verdadero/Falso | «¡Respuesta guardada!» | ídem | instantáneo | **0** |
| Completar espacios | «¡Respuesta guardada!» | ídem | instantáneo | **0** |
| Línea del tiempo | — (evalúa al enviar) | — | los eventos teletransportan | **0** |

**Hallazgos:** (H1) el Memorama no celebra su única recompensa; (H2) «¡Respuesta guardada!» suena a formulario; (H3) los ítems se sustituyen sin transición; (H4) la Línea del tiempo teletransporta y tiene `linea-sacudida` como CSS muerto; (H5) el Quiz es el único de los 7 **sin barra de progreso**; (H6) el acierto no se acumula durante la partida; (H7) la asimetría con el Clasificador demuestra que el lenguaje existe pero se aplicó una sola vez; (H8) `LogroToast` solo aparece al final.

**Restricción que condiciona todo el diseño:** la **corrección diferida está congelada** (§3 heredado de SPEC-018). En Quiz, V/F y Completar **no se puede revelar el acierto durante el intento**. Consecuencia: el feedback ahí es de **reconocimiento, no de corrección** — y por eso **no** se propone racha ni marcador en vivo en esos tres juegos, que filtrarían la respuesta. Sí sería legítimo en Clasificador, Memorama y Misión, donde la corrección ya es inmediata por diseño.

## 5. Hallazgos abiertos durante el sprint

Se registran aquí y se resuelven en la etapa que corresponda; ninguno se implementa fuera de su etapa.

1. **`.contenido-materia*` es CSS muerto** (7 selectores, ~50 líneas de `dashboardWidgets.css`): **cero consumidores** en todo `src/` fuera del propio CSS. Detectado en la Etapa 1 al intentar verificarlo en el navegador. → Etapa 3.
2. **`QuickActionCard` no lo importa nadie.** El componente se define y exporta en `DashboardWidgets.jsx:287` y **ningún archivo lo importa**, así que `.quick-action-card/-icon/-meta/-btn` y `.quick-actions-grid` tampoco se renderizan nunca. **Contradice `CONTRIBUTING.md` §6.4**, que lo lista entre los componentes reutilizables a preferir. → Etapa 3, junto con la corrección de la regla. *(Nota: el ítem P2-6 del bloque RC, aprobado «solo si sobra tiempo» y no implementado, contemplaba usarlo para la bienvenida de primer uso del docente. Decidir antes de borrar.)*

## 6. Regla de implementación (obligatoria por etapa)

Se hereda el §6 de SPEC-018, con la línea base actualizada:

1. **Build** (`npm run build`) sin errores.
2. **Lint sin problemas nuevos** contra la línea base de **29 (26 errores + 3 warnings)**. Tras la Etapa 0, `npm run lint` y `npx eslint src server` dan el mismo número y ambos sirven.
3. **Validación funcional** en el entorno local (MySQL portable 3308 + backend 3001).
4. **Navegación real en el navegador**, con evidencia medida — no impresiones.
5. **Responsive** cuando corresponda (320 / 375 / 768 / 1280).
6. **Consola sin errores nuevos.**
7. **Reporte de regresiones.**

## 7. Punto de parada

Implementar y verificar; **entregar el reporte y esperar aprobación antes de pasar a la etapa siguiente**. El entregable de cada etapa incluye: archivos modificados, antes/después, pruebas realizadas, problemas encontrados, regresiones, cambios de comportamiento (deberían ser cero) y resultado de build/lint.

---

## Registro de cambios

- **2026-07-30** — **Giro del sprint a la Vía 2.** Fabrizio da por suficiente la infraestructura visual y suspende las etapas 2-6. Se añade la **auditoría de la experiencia de juego** (§4-ter, con juego real instrumentado) y la **Vía 2** (§4-bis). **Etapas A y B implementadas y verificadas** el mismo día; evidencia en `CURRENT_STATE.md`.
- **2026-07-30** — Redacción inicial con la auditoría de partida medida. **Etapas 0 y 1 implementadas y verificadas** en el mismo día; detalle y evidencia en `CURRENT_STATE.md`. Etapas 2-6 sin empezar.

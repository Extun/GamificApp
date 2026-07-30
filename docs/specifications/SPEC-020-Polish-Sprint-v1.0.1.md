# SPEC-020 — POLISH SPRINT v1.0.1

**Estado:** 🟡 **EN CURSO.** Etapa 0 y Etapa 1 implementadas y verificadas (2026-07-30). Etapas 2-6 pendientes de aprobación una por una.
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

- **2026-07-30** — Redacción inicial con la auditoría de partida medida. **Etapas 0 y 1 implementadas y verificadas** en el mismo día; detalle y evidencia en `CURRENT_STATE.md`. Etapas 2-6 sin empezar.

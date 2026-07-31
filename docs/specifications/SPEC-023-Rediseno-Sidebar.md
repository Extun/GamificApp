# SPEC-023 — Rediseño del sidebar (Admin · Docente · Estudiante)

**Estado:** aprobada (decisiones de diseño confirmadas por Fabrizio el 2026-07-31)
**Alcance:** solo presentación. No cambia rutas, permisos, endpoints, ni el conjunto
de secciones de ningún panel.
**Áreas protegidas (§9 de CONTRIBUTING):** ninguna tocada. El filtro `puede(permiso)`
de `AdminDashboard.jsx` se deja intacto; el sidebar sigue recibiendo la lista ya
filtrada y no decide nada sobre visibilidad por permisos.

---

## 1. Motivo

El sidebar es el único componente que ven los tres roles, y hoy pesa más que el
contenido que acompaña. Medido en el entorno local (MySQL portable 3308, datos de
`seedDev.js`, viewport 942×778):

| Panel | Cabecera | Pie | Navegación real | Chrome : navegación |
|---|---|---|---|---|
| Estudiante (3 secciones) | 97px | 192px | 126px | **2,3 : 1** |
| Docente (7 secciones) | 97px | 141px | 294px | 0,8 : 1 |
| Admin (13 secciones) | 97px | 141px | ~546px | 0,4 : 1 |

Es decir: en el panel del niño hay más del doble de píxeles de adorno que de menú.

### Hallazgos concretos

1. **El nombre institucional es el titular del sidebar.** «Unidad Educativa Fiscal
   Clemencia Coronel de Pincay» se pinta a 0,92rem en negrita y ocupa 3 líneas
   (60px) en escritorio y 2 líneas permanentes en la barra superior móvil. Es un
   dato fijo, no accionable, y es lo primero y más pesado que se lee.

2. **Los ítems del menú no están alineados — bug real, no percepción.** Medido con
   `getBoundingClientRect()` en el panel Docente, cada `.nav-item` arranca en una
   `x` distinta: 80, 71, 67, 48, 72, 70, 72. Cada fila se encoge al ancho de su
   texto y se centra.
   **Causa:** `dashboard.css` declara `.nav-item-wrap { align-items: stretch }`,
   pero MUI aplica `.MuiListItem-root { align-items: center }` con mayor
   especificidad y gana. El estilo llevaba desde SPEC-003 sin efecto.
   **Consecuencias:** no hay un borde izquierdo común que la vista pueda recorrer,
   los rótulos de grupo también flotan centrados, y **el área pulsable es solo el
   ancho del texto** (tocar a la derecha de «Ranking» no hace nada).

3. **Cinco niveles de borde en una columna de 264px:** borde del aside, borde y
   fondo alternativo de la cabecera, borde y fondo alternativo del pie, borde de
   la ficha de usuario y borde de cada botón de acción.

4. **Rótulos de grupo en mayúsculas con `letter-spacing: 0.1em`** en todos los
   paneles: 3 bloques extra de texto para 7 destinos en Docente, 5 para 13 en Admin.

5. **`.logout-btn` está definido tres veces** (`dashboard.css`,
   `adminDashboard.css`, `dashboardEstudiante.css`) con reglas casi idénticas que
   compiten entre sí. `.aside-bottom` de `dashboardEstudiante.css` es CSS muerto.

---

## 2. Decisiones aprobadas

| Tema | Decisión |
|---|---|
| **Cabecera** | Logo + nombre institucional en **una sola línea**, truncada con «…», 0,75rem, peso normal, color apagado, con `title` para el nombre completo. Sin fondo ni borde propios. |
| **Grupos** | Regla automática por densidad dentro del propio componente: con **menos de 8 secciones** el cambio de grupo se dibuja como un **separador fino sin texto**; con 8 o más se conserva el rótulo, pero más pequeño y apagado. Ningún panel cambia su código. |
| **Pie** | Sin cajas: avatar + nombre/rol, y las acciones como filas planas con icono + texto. El texto se mantiene visible también en Estudiante (niños de 6-9 años). |

Resultado esperado por densidad: Estudiante y Docente (3 y 7 secciones) → separadores;
Admin (13) → rótulos. Si un día Docente supera las 7 secciones, recupera los rótulos solo.

---

## 3. Qué NO cambia

- Los `items` que declara cada panel (mismo `id`, `label`, `Icon`, `grupo`).
- El filtrado por permisos de Admin.
- El menú móvil de SPEC-018 Fase 5: hamburguesa, Escape, clic fuera, cierre al
  navegar, bloqueo del scroll de fondo, foco al abrir.
- El colapso de escritorio de SPEC-018 Fase 8: raíl de restauración y traspaso de
  foco entre `.sidebar-colapsar` y `.sidebar-mostrar`.
- `aria-current="page"` en el ítem activo.
- El scroll: la página solo scrollea dentro de `.contenido`; la navegación tiene
  scroll propio si no cabe; el pie siempre visible.

---

## 4. Diseño

### 4.1 Cabecera (≈52px)

```
┌──────────────────────────────┐
│ [logo]  Unidad Educativa…  ☰ │
└──────────────────────────────┘
```

- Fila flex: logo (máx. 28px de alto) · nombre (1 línea, `text-overflow: ellipsis`,
  `title` completo) · botón de ocultar.
- El botón de ocultar deja de ser `position: absolute` y entra en el flujo, así que
  el `padding-right: 34px` de reserva desaparece.
- Sin `background: var(--color-surface-alt)` ni `border-bottom`.

### 4.2 Navegación

- **Corrección del bug de alineación:** `.nav-item-wrap` pasa a
  `align-items: stretch` con especificidad suficiente para ganar a
  `.MuiListItem-root`, y `.nav-item` pasa a `width: 100%`. Todas las filas comparten
  borde izquierdo y el área pulsable ocupa el ancho completo.
- Altura de fila 40px, icono 20px, etiqueta 0,875rem.
- Activo: relleno `--color-primary-soft`, texto `--color-primary-dark`, barra de
  acento de 3px a la izquierda y peso 600. Se conserva porque ya funcionaba.
- Hover: `--color-surface-alt`.

### 4.3 Grupos

- `< 8` ítems → `<span class="sidebar-separador">`: una regla de 1px con margen
  vertical, `aria-hidden`.
- `>= 8` ítems → `<span class="sidebar-grupo">`: 0,68rem, `letter-spacing: 0.06em`,
  sentence case respetando el texto que envía el panel, alineado con los ítems.
- Ambos siguen siendo `aria-hidden="true"`, como hasta ahora: son adornos visuales
  y meterlos en el árbol de accesibilidad ensuciaría el nombre del ítem siguiente.

### 4.4 Pie (≈118px con dos acciones)

```
──────────────────────────────
 (A)  Ana Sofía de los Áng…
      Estudiante

  🔒   Cambiar mi PIN
  ⇥    Cerrar sesión
```

- Solo una separación superior (hairline). Sin fondo alternativo.
- Ficha de usuario sin borde ni caja; avatar 34px.
- Acciones: filas planas de ancho completo, icono + texto, alineadas a la izquierda
  con los ítems del menú. Hover en rojo suave se conserva para «Cerrar sesión».
- La definición del botón vive **solo** en `dashboard.css`, dentro de
  `.sidebar-footer`. Se eliminan los duplicados de `adminDashboard.css` y
  `dashboardEstudiante.css` y el `.aside-bottom` muerto.

---

## 5. Responsive

| Ancho | Comportamiento |
|---|---|
| ≥ 1100px | Sidebar 264px. |
| 761–1099px | Ancho fluido con `clamp(220px, 22vw, 264px)`: a 768px se recuperan ~44px para el contenido sin necesidad de colapsar a mano. |
| ≤ 760px | Barra superior compacta + panel desplegable (SPEC-018 Fase 5, sin cambios de comportamiento). |
| ≤ 380px | La cabecera móvil reduce el logo y el nombre para que la hamburguesa nunca se desplace fuera. |
| Móvil apaisado (alto ≤ 480px) | El panel desplegable pasa a `max-height: calc(100dvh - <alto real de la barra>)` con scroll propio, en vez del `72vh` y el `62px` fijo de hoy. |

Objetivos de accesibilidad táctil: toda fila del menú y del pie ≥ 40px de alto y
**ancho completo** del sidebar (hoy el ancho es solo el del texto).

---

## 6. Verificación exigida

1. Los tres paneles en escritorio, con datos reales del seed local.
2. Panel Admin con el conjunto completo de 13 secciones y 5 grupos (caso de máxima
   densidad y único que conserva rótulos).
3. Móvil 375×812: barra superior y menú desplegable abiertos en los tres roles.
4. 320px de ancho y móvil apaisado (740×360).
5. Tablet 768px, con el sidebar visible y colapsado.
6. Nombre de estudiante largo («Ana Sofía de los Ángeles Montenegro Villavicencio»)
   sin desbordar el pie.
7. Medición de `getBoundingClientRect()` confirmando que **todos** los `.nav-item`
   comparten la misma `x` y el mismo ancho.
8. Teclado: Tab por el menú, Escape cierra el menú móvil, el foco pasa correctamente
   entre `.sidebar-colapsar` y `.sidebar-mostrar` al ocultar/mostrar.
9. `npm run build` y `npm run lint` sin regresiones (lint baseline conocido: 28).

---

## 7. Resultado de la verificación (2026-07-31)

Entorno: MySQL portable 3308 + backend 3001 + Vite dev en 5173, datos de
`seedDev.js`. Medidas con `getBoundingClientRect()` sobre el DOM real.

### Alineación (el bug del §1.2)

| Panel | Antes (`x` de cada ítem) | Ahora |
|---|---|---|
| Docente (7) | 80, 71, 67, 48, 72, 70, 72 | **todos `x=10`, `w=205`** |
| Admin (13) | — | **todos `x=10`, `w=195`** |
| Estudiante (3) | 80, 60, 60 | **todos `x=10`, `w=205`** |

Los botones del pie caen en el mismo `x=10` / `w=205` que el menú, así que el
sidebar entero comparte un único borde izquierdo. Filas de 40px de alto y ancho
completo: ya se puede pulsar a la derecha del texto.

### Peso del sidebar

| Panel | Cabecera | Pie | Total chrome |
|---|---|---|---|
| Estudiante | 97px → **54px** | 192px → **151px** | 289px → **205px** (−29%) |
| Docente | 97px → **54px** | 141px → **109px** | 238px → **163px** (−32%) |
| Admin | 97px → **54px** | 141px → **109px** | 238px → **163px** (−32%) |

Ancho a 768px: 264px → **220px** (44px devueltos al contenido, sin colapsar).

### Densidad de grupos

- Admin con las 13 secciones: 4 rótulos (`Gestión académica`,
  `Gestión institucional`, `Seguridad`, `Sistema`), alineados con el texto de
  los ítems (`x=20`). La navegación scrollea sola (690px de contenido en 615px)
  y el pie sigue visible.
- Admin con permisos parciales (4 secciones), Docente (7) y Estudiante (3):
  0 rótulos, separadores mudos. La regla por densidad funciona sin tocar los
  paneles.

### Responsive

| Escenario | Resultado |
|---|---|
| 942×778 escritorio | Los 3 paneles correctos. |
| 768×1024 tablet | Sidebar 220px, contenido 548px. Colapsado: raíl 55px, contenido 713px, sidebar `visibility:hidden` (fuera del tabulador). |
| 375×812 móvil | Barra superior de 1 línea; menú desplegable con filas de ancho completo. |
| 320×640 | Sin scroll horizontal; hamburguesa dentro (`right=310 ≤ 320`); filas de 300px. |
| 740×360 apaisado | Menú limitado a 298px = `100dvh − 62px` **reales**; scrollea como un todo y llega hasta «Cerrar sesión». |

**Corrección durante la verificación:** una primera versión daba a la
navegación su propio scroll en apaisado. Se veían 3 de 7 secciones dentro de un
scroll anidado sin pista alguna de que hubiera más. Regla retirada: el panel
scrollea entero, que es lo que ya hacía bien.

### Comportamiento conservado

- Escape cierra el menú móvil, devuelve el foco a `.sidebar-hamburguesa` y
  restaura el `overflow` del `body`.
- Ocultar el sidebar pasa el foco a `.sidebar-mostrar`; restaurarlo, a
  `.sidebar-colapsar`.
- `aria-current="page"` y los 7 ítems tabulables (`tabIndex=0`).
- Con un quiz a medias, pulsar una sección del sidebar sigue lanzando la
  guardia «¿Quieres salir del juego?» (el `proteger()` del panel del niño).
- Nombres largos truncados con el texto completo en `title`: institución
  («Unidad Educativa Fiscal Clemencia Coronel de Pincay») y estudiante («Ana
  Sofía de los Ángeles Montenegro Villavicencio»).

### Automático

- `npm run build`: correcto (3,63 s).
- `npm run lint`: **29 incidencias, las mismas que antes del cambio**.
  Comprobado archivo a archivo: los 4 `.jsx` tocados dan 5 incidencias tanto
  con los cambios como en `HEAD` (`git stash`), todas preexistentes
  (`set-state-in-effect`). `SidebarLayout.jsx` no aporta ninguna.

### Nota de método

Para ver el Admin a máxima densidad (13 secciones) se amplió la lista de
permisos **en la caché de `localStorage` del navegador**, no en la base de
datos: es una prueba puramente visual del sidebar. El servidor siguió
rechazando lo no autorizado («No tienes permiso para esta sección»), y el
cierre de sesión borró esa caché.

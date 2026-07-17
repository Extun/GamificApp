# Auditoría UX — Experiencia del Estudiante (v1)

# Objetivo

Auditoría profunda de la experiencia del estudiante (niños de 2.º a 4.º EGB, 6–9 años), basada exclusivamente en el código existente. Insumo para las especificaciones de la Épica 1 (rediseño de la experiencia del estudiante).

# Estado

🟢 Completo — pendiente de convertirse en RFC de rediseño.

> **Nota (2026-07-14, auditoría documental):** las críticas de este documento al sistema de logros de `localStorage` (3/5 sin lógica de desbloqueo, no compartidos entre dispositivos) **ya fueron resueltas** por SPEC-007 (Sistema de Misiones, server-backed, 46 misiones semilla). Las demás recomendaciones (shell del estudiante sin sidebar, motor único de retos, login infantil, vitrina de premios) siguen vigentes y son el insumo de SPEC-001, aún no implementada — ver `docs/architecture/CURRENT_STATE.md` §3.

# Última actualización

2026-07-06

# Responsable

Fabrizio Zurita (Extun) · Auditoría: Senior UX (educación básica elemental)

---

# Diagnóstico general

**El estudiante usa una versión recoloreada del panel del docente.** No es una metáfora: `DashboardEstudiante.jsx` importa `../admin/dashboard.css` como hoja de estilos base, reutiliza los mismos widgets administrativos (`StatCard`, `SectionCard`, listas con fechas y porcentajes) y la misma estructura sidebar + contenido. El niño ve un *back-office* con emojis.

Los tres patrones que definen una plataforma administrativa y que aparecen en TODA la experiencia del estudiante:

1. **Texto como interfaz.** Todo se comunica leyendo: instrucciones, metadatos ("8 preguntas · 100 XP"), estados vacíos de dos frases, ayudas de PIN de un párrafo. Un niño de 2.º EGB (7 años) está *aprendiendo a leer*; cada frase es una barrera, no una ayuda.
2. **Taxonomía de adulto.** La información está organizada por *tipo de contenido* (Material / Quizzes / Juegos / Misiones) y por *asignatura curricular*, que es el modelo mental del docente. El modelo mental del niño es "¿qué juego toca ahora?" y "¿qué gané?".
3. **Datos en vez de emociones.** XP acumulado, nivel actual, porcentajes de avance, fechas ("3 jul"), posición #N del ranking. Son métricas de analista. El niño necesita ver *cosas* (estrellas, cofres, un camino que avanza), no *números*.

La mejor pantalla de toda la app es **MisionNarrativa.jsx**: pantalla completa por fase, una sola decisión a la vez, avance visible con puntos, error sin castigo, celebración final. **Ese componente ya contiene el lenguaje de diseño correcto; el rediseño consiste en extender esa filosofía a toda la experiencia**, no en inventar una nueva.

---

# Auditoría pantalla por pantalla

## 1. Login (`src/pages/admin/login.jsx`)

**1. ¿Qué intenta hacer el estudiante?** Entrar a jugar, en segundos, probablemente en un aula con 25 niños y un docente que no puede ayudar a cada uno.

**2. Carga cognitiva innecesaria.**
- Escribir su **nombre completo exacto** ("Ana María Pérez"). Para un niño de 7 años esto significa teclear 15–25 caracteres con tildes y espacios, sin tolerancia a errores. Es la barrera más grave de toda la app.
- El PIN de 6 caracteres oculto con `type="password"` (••••••): el niño no puede verificar lo que escribió. El enmascaramiento es una convención de seguridad adulta; aquí solo produce errores silenciosos.
- El selector "Soy: Estudiante / Docente": obliga al niño a autoclasificarse en una taxonomía de roles antes de empezar.
- La columna izquierda (`login-aside`) es **marketing institucional**: "Plataforma de gamificación educativa para la Unidad Educativa Benemérita…". Cero valor para el niño; puro ruido.
- La ayuda de PIN (`login-ayuda-pin`) es un párrafo con un ejemplo numérico ("si naciste el 15 de marzo de 2017, tu PIN es 150317") que exige leer, calcular y transcribir.
- El flujo de emergencia introduce un tercer formulario con un código alfanumérico de 8 caracteres del "carné".

**3. Sobra.** El aside de marketing; el copy "Ingresa tus credenciales para continuar"; el modo emergencia como pantalla propia visible en el flujo del niño.

**4. Falta.**
- Un camino de identificación **sin teclado**: elegir mi curso → tocar mi cara/avatar/nombre en una cuadrícula → ingresar PIN con un teclado numérico grande en pantalla.
- Feedback de error amable e ilustrado ("¡Uy! Ese PIN no es. Inténtalo otra vez 🙈") en lugar de `err.message` del servidor.
- PIN visible mientras se escribe (o revelable por defecto).

**5. Acción principal.** Un solo botón gigante: **"¡Jugar!"** (o "Entrar"). Todo lo demás es secundario o invisible.

**6. Reorganización propuesta (radical).** Separar físicamente el login de estudiante del de adultos: `/` es la puerta del niño (selector visual de curso → estudiante → PIN numérico); un enlace pequeño "Soy docente" lleva al formulario adulto. El servidor ya expone lo necesario para listar estudiantes por aula (ranking/roster del docente); si se decide no listar nombres públicamente, la alternativa es un código de aula de 4 caracteres que el docente escribe una vez en la pizarra.

**7. Eliminar.** El tipeo de nombre completo; el aside institucional; los `window.alert` del flujo de emergencia.

**8. Mantener.** El principio PIN corto (bien pensado que sea la fecha de nacimiento); el rol firmado por el servidor; el rate limiting; el modo emergencia como mecanismo (pero operado por el docente, no como pantalla del niño).

---

## 2. Registro (`src/pages/estudiante/RegistroEstudiante.jsx`)

**1. ¿Qué intenta hacer?** Nada — un niño de 7 años no se registra solo. Este flujo (código de invitación, fecha con `input type="date"`, "anota tu código de emergencia en tu carné") es en la práctica una tarea del docente o del representante.

**2–3. Carga / sobra.** Todo el flujo asume un usuario alfabetizado y organizado: transcribir un código de 6 caracteres, escoger fecha en un date-picker, y la pantalla final pide "anota estos datos en tu cuaderno" — tres credenciales que memorizar/copiar. Es la ceremonia de alta de un sistema corporativo.

**4. Falta.** Nada para el niño: falta *quitárselo* de encima.

**5–7. Propuesta radical: esta pantalla desaparece del recorrido del estudiante.** El docente crea las cuentas en lote desde su panel (ya tiene invitaciones y gestión de estudiantes) e imprime carnés con nombre + PIN. El primer contacto del niño con la app es el login, nunca un formulario de registro. Si se mantiene `/registro`, es una herramienta asistida para adultos y se saca del flujo infantil.

**8. Mantener.** El modelo de datos (invitación, PIN inicial = fecha de nacimiento, código de emergencia): es sólido; solo cambia *quién* opera la UI.

---

## 3. Dashboard / Inicio (`DashboardEstudiante.jsx`, `pagina === ""`)

**1. ¿Qué intenta hacer?** Responder UNA pregunta: "¿qué hago ahora?" — y de paso sentir que va bien.

**2. Carga cognitiva innecesaria.**
- **Cuatro secciones apiladas** (Continuar aprendiendo / Mi progreso / Mi comunidad / Actividad reciente) que exigen scroll y lectura. Es el layout de un dashboard de gestión (de hecho es el mismo RFC-004 que el del docente).
- `StatCard` con "XP acumulado", "Nivel actual", "Logros obtenidos": tres números abstractos sin representación visual de avance. "1350 XP" no significa nada para un niño; una barra que se llena o un cofre que se abre, sí.
- "Actividad reciente" con porcentajes y fechas ("Quiz de sumas · Matemáticas · 80% · 3 jul") es un **log de auditoría**. Ningún niño quiere leer su propio historial tabulado.
- El subtítulo "Sigue aprendiendo y suma puntos para subir en el ranking" enmarca todo en competencia y lectura.

**3. Sobra.** La sección "Actividad reciente" completa (el dato ya vive en "Continuar"); los chips `Nivel 3 · 2450 XP` como texto; el tag "N actividades".

**4. Falta.**
- **Una barra de progreso de nivel visual y protagonista** (el servicio ya calcula `getProgresoNivel().porcentaje` ¡y nadie lo pinta!).
- Celebración al entrar ("¡ganaste 3 estrellas ayer!").
- Un personaje/avatar o mascota que dé identidad y continuidad emocional.

**5. Acción principal.** Un solo botón enorme e ilustrado: **"¡Seguir jugando!"** (el `QuickActionCard` de "Continuar aprendiendo" ya tiene la lógica correcta con fallback al primer reto; es la única pieza que apunta en la dirección correcta — hoy compite con otras 3 secciones).

**6. Reorganización.** El Inicio se reduce a: saludo con avatar + barra de nivel visual + botón gigante "Seguir jugando" + acceso a los mundos (materias). El ranking y los logros se mudan a una sección propia "Mis premios" (ver §9).

**7. Eliminar.** Actividad reciente; las StatCards numéricas; el subtítulo competitivo.

**8. Mantener.** La lógica de "Continuar aprendiendo" con sus tres estados (última actividad / primer reto / vacío) — es exactamente el patrón correcto, solo necesita ser EL protagonista.

---

## 4. Navegación (sidebar + estado interno)

**1. ¿Qué intenta hacer?** Moverse entre "jugar" y "ver mis premios". Nada más.

**2. Carga cognitiva innecesaria.**
- Un **sidebar administrativo de escritorio** encabezado por "Unidad Educativa Benemérita Sociedad Filantrópica del Guayas" — 8 palabras institucionales presidiendo la pantalla del niño en todo momento.
- "Cambiar mi PIN" como botón permanente al mismo nivel visual que "Cerrar sesión", implementado con **`window.prompt()` nativo** (dos prompts + alert): lo más anti-niño que existe en la app.
- La navegación es `useState` sin rutas: el botón "atrás" del navegador/tablet expulsa al niño al login. Para tablets (el dispositivo probable en aula) esto es crítico.

**3. Sobra.** El nombre completo de la institución; "Cambiar mi PIN" como acción de primer nivel; la etiqueta "Estudiante" bajo el nombre (el niño ya sabe quién es).

**4. Falta.** Navegación táctil de primer nivel: 2–3 botones grandes con icono dominante (Jugar / Mis premios), abajo en tablet o como pantalla-hub. Soporte del botón atrás (sub-rutas, ya identificado como deuda en el Blueprint v2 — para el estudiante deja de ser deuda técnica y pasa a ser bloqueante).

**5. Acción principal.** "Jugar" siempre visible y a un toque.

**6–7. Reorganización / eliminar.** **Eliminar el sidebar para el rol estudiante.** Tres destinos no justifican un panel lateral persistente. "Cambiar PIN" y "Cerrar sesión" se esconden detrás del avatar (y cambiar PIN se rehace como flujo propio con teclado numérico, o se delega al docente).

**8. Mantener.** La separación Inicio / jugar / logros como estructura conceptual (renombrada y reducida).

---

## 5. Materias (grid + detalle con 4 pestañas)

**1. ¿Qué intenta hacer?** Encontrar algo divertido que hacer, idealmente lo que el docente mandó hoy.

**2. Carga cognitiva innecesaria.**
- Las 5 materias son **tarjetas idénticas**: mismo icono `MenuBookIcon` (un libro — símbolo de deber, no de juego), sin color propio, sin ilustración, sin ninguna señal de "aquí hay algo nuevo para ti" ni de progreso. El niño debe leer el texto para distinguirlas y entrar a ciegas para saber si hay contenido.
- El detalle abre con **4 pestañas de texto**: Material de estudio / Quizzes disponibles / Juegos / Misiones. Esto es la taxonomía interna de la tabla `retos` (`tipo`) expuesta al niño. Un niño no distingue —ni debe— entre "quiz", "clasificador" y "misión": todos son "jugar". Además provoca la peor consecuencia: pestañas vacías por todas partes ("Aún no hay juegos publicados…"), porque el contenido real se fragmenta en 4 cajones.
- La pestaña por defecto es **"Material de estudio"** — la app aterriza al niño en la parte menos lúdica (archivos PDF/DOCX) en vez de en los juegos.
- Los ítems de lista son texto con metadatos de adulto: "8 preguntas · 100 XP", "Clasificador · 3 categorías".

**3. Sobra.** La pestaña "Material de estudio" como aterrizaje; los contadores "N recursos"; la distinción visible quiz/juego/misión.

**4. Falta.**
- Identidad visual por materia (color + ilustración + personaje): Matemáticas ≠ Lenguaje a golpe de vista.
- Señales de estado en la tarjeta de materia: "¡hay algo nuevo!", estrellas ganadas, candado si no hay nada.
- **Orden y progresión**: hoy las listas son planas y sin secuencia; no hay noción de "el siguiente".

**5. Acción principal.** Tocar una materia → ver directamente sus actividades jugables como un **camino/mapa ordenado** (patrón Duolingo/Khan Kids): nodos con estrellas ganadas, el siguiente nodo resaltado, los futuros visibles pero apagados.

**6. Reorganización (radical): fusionar las 4 pestañas en una sola vista.** Cada materia es un "mundo" con UNA lista/camino unificado de retos (la BD ya lo permite: todos viven en `retos` con `tipo` polimórfico — la separación en pestañas fue una decisión de UI, no de datos). El tipo de mecánica se comunica con el icono de la tarjeta, no con navegación. El "Material de estudio" se convierte en un cofre/biblioteca secundaria dentro del mundo, o mejor: se vincula a los retos (leer X desbloquea/ayuda con el reto Y).

**7. Eliminar.** Las 4 pestañas; los mensajes vacíos duplicados por pestaña; el `card-tag` con conteos.

**8. Mantener.** El grid de materias como hub (rediseñado como "mundos"); la carga por materia desde la API; el filtro server-side de material privado.

---

## 6. Quiz (`QuizInteractivo.jsx`)

**1. ¿Qué intenta hacer?** Responder preguntas, saber al instante si acertó, y ganar algo.

**2. Carga cognitiva innecesaria.**
- **Todas las preguntas se renderizan a la vez en una página con scroll.** Un quiz de 8 preguntas es un muro de ~30 bloques de texto. Es el formato "examen en papel"; abruma, invita a saltar entre preguntas y diluye el foco. (Contraste directo: la Misión muestra un desafío por pantalla — el patrón correcto ya existe en el mismo repo.)
- El marcador final aparece **arriba** del muro de preguntas (donde ya no estás mirando) y habla en porcentajes: "75% de aciertos".
- La justificación pedagógica llega como párrafo de texto tras cada respuesta.
- Los logros se anuncian con un toast que **se autodestruye en 5 segundos** — la recompensa más importante de la sesión tratada como notificación de sistema ("Progreso guardado · +300 XP registrados en tu cuenta" — redacción de recibo bancario).

**3. Sobra.** El render simultáneo de todas las preguntas; el toast "Progreso guardado" (el guardado debe ser invisible; si falla, se reintenta en silencio).

**4. Falta.**
- Flujo **una pregunta por pantalla** con avance visible (puntos o barra, como la Misión).
- Sonido/animación de acierto y error (hay cero audio en toda la app; a esta edad el refuerzo sonoro es la mitad del feedback).
- Pantalla final de celebración a pantalla completa con estrellas (el Clasificador ya la tiene: `juego-dnd-final`; el Quiz no).
- Posibilidad de reintentar el quiz desde la pantalla final.

**5. Acción principal.** Elegir UNA alternativa grande y táctil. Después: "Siguiente".

**6. Reorganización (radical): unificar el reproductor del Quiz con el motor de la Misión.** Ambos son "pregunta de opción múltiple con feedback"; la Misión ya lo hace con fases, un desafío por pantalla y final celebrado. El Quiz debería ser una misión sin narrativa, no un componente paralelo con otro paradigma. Un solo "reproductor de retos" con variantes reduce código y unifica la experiencia.

**7. Eliminar.** El modo "muro de preguntas" para estudiantes (puede sobrevivir como vista previa del docente, que es su otro consumidor actual); los toasts técnicos.

**8. Mantener.** Feedback inmediato con color y explicación (contenido, no formato); el bloqueo de respuesta tras elegir; `completarReto()` como flujo único de recompensa; la idempotencia de XP.

---

## 7. Juegos / Clasificador (`JuegoDragAndDrop.jsx`)

**1. ¿Qué intenta hacer?** Jugar arrastrando cosas. Es la pantalla más cercana al objetivo del producto.

**2. Carga cognitiva.** Baja — la mejor de la app junto con la Misión. Problemas menores:
- La instrucción es una frase compuesta ("Arrastra cada tarjeta a su canasta (o tócala y luego toca la canasta)") — debería ser una demo animada de 2 segundos, no texto con paréntesis.
- "Suelta aquí" en las canastas vacías: más texto donde bastaría un contorno punteado pulsante.
- Silencio total: aciertos y errores sin sonido.

**3. Sobra.** Casi nada.

**4. Falta.** Audio; refuerzo háptico/visual mayor en el acierto; en tablets antiguas el HTML5 drag-and-drop es frágil (el fallback táctil de tocar-tocar ya existe y está bien pensado — debería ser el modo primario en pantalla táctil).

**5. Acción principal.** Ya es correcta: arrastrar/tocar.

**6–7. Reorganización / eliminar.** Nada estructural. Este componente, junto con la Misión, define el estándar.

**8. Mantener.** TODO el diseño de mecánica: acierto al primer intento puntúa, el error rebota pero no bloquea, siempre se termina ganando, estrellas 1–3, pantalla final con "Jugar otra vez". La filosofía "siempre se termina ganando" debe elevarse a principio de diseño de toda la app.

---

## 8. Misiones (`MisionNarrativa.jsx`)

**1. ¿Qué intenta hacer?** Vivir una historia y resolver desafíos.

**2. Carga cognitiva.** La estructura es excelente (intro → capítulos → final, una decisión por pantalla, puntos de progreso). El riesgo está en el **contenido**: `narrativa`, `pregunta`, `exito` y `final` son párrafos generados por IA sin límite de longitud — para un lector de 7 años, 4 líneas ya son demasiadas. Esto se gobierna en el prompt del generador del docente (restricción de palabras por campo), no en el reproductor.

**3. Sobra.** El texto "Capítulo N de M" (los puntos ya lo dicen); el marcador final con "+X XP · 100 XP por desafío perfecto" (aritmética de recompensas expuesta al niño).

**4. Falta.** Ilustración por capítulo (aunque sea un emoji/escena grande por desafío); audio opcional de narración (text-to-speech del navegador es viable y transformador para lectores débiles); sonidos.

**5. Acción principal.** Correcta: una alternativa A/B/C grande.

**6. Reorganización.** Ninguna interna. Externa: convertirse en el **motor único de retos** (ver §6) y dejar de vivir escondida en la cuarta pestaña de una materia.

**7. Eliminar.** Nada.

**8. Mantener.** Todo: fases, pista tras el error con reintento ilimitado, aciertos-al-primer-intento como puntaje, celebración final.

---

## 9. Progreso, Logros y Ranking (`pagina === "logros"` + secciones del Inicio)

**1. ¿Qué intenta hacer?** Sentir orgullo: "mira lo que gané".

**2. Carga cognitiva innecesaria.**
- El progreso está **fragmentado en tres lugares** (StatCards del inicio, sección Comunidad, página Logros) y en todos se expresa como números.
- **3 de los 5 logros del catálogo no tienen lógica de desbloqueo** (`racha-7`, `estrella-aula`, `explorador` — confirmado en PROJECT_CONTEXT §4). El niño ve para siempre candados que no puede abrir por más que lo intente: es la anti-gamificación, enseña que el esfuerzo no funciona.
- El ranking Top 3 + "Tu posición: #14": para 6–9 años, un ranking absoluto por XP acumulado premia siempre a los mismos 3 y le dice al resto, cada vez que entra, que está perdiendo. La literatura de gamificación infantil es consistente: a esta edad, competencia contra uno mismo y metas de aula colaborativas superan al leaderboard individual.
- 1000 XP por nivel con ~100 XP por acierto: subir de nivel exige ~10 actividades perfectas. Para un niño el horizonte de recompensa debe medirse en minutos, no en semanas.

**3. Sobra.** El ranking individual en el Inicio (al menos en su forma actual); las StatCards numéricas; el badge de texto "Obtenido".

**4. Falta.**
- **La barra de nivel visual** (dato ya calculado, nunca pintado).
- Logros con momento de celebración a pantalla completa cuando se ganan (no un toast de 5 s) y una vitrina bonita donde revisitarlos.
- Logros alcanzables a corto plazo y por esfuerzo (no solo por perfección): "jugaste 3 días", "terminaste tu primera misión", "10 retos completados".
- Alternativa al ranking: meta grupal del aula ("entre todos juntamos 5000 estrellas") o ranking semanal reiniciable, si el docente lo activa.

**5. Acción principal.** Contemplar/tocar los premios (cada logro debería poder tocarse y celebrar de nuevo).

**6. Reorganización.** Fusionar "Mi progreso" + "Mis Logros" + ranking en UNA sección: **"Mis premios"** — avatar, barra de nivel, vitrina de insignias, y la meta de aula. El Inicio solo conserva la barra de nivel.

**7. Eliminar.** Los 3 logros sin lógica (hasta que exista su lógica: mostrar candados imposibles es peor que mostrar menos logros); "Actividad reciente"; el ranking absoluto en su forma actual (decisión de producto: reformular o quitar).

**8. Mantener.** El catálogo extensible de logros; XP transaccional server-side; la idea de niveles (con curva recalibrada).

---

## 10. IA

**Hallazgo de código: el estudiante no tiene ninguna función de IA.** El Asistente IA (`asistenteIA.jsx`) vive solo en el panel del docente; para el estudiante la IA solo existe indirectamente (contenido generado). En el recorrido auditado no hay nada que evaluar — y **está bien que así sea**: un chat libre con IA para niños de 7 años es un riesgo (respuestas no curadas, lectura densa) sin beneficio claro. Recomendación: mantener la IA como herramienta de autoría del docente. Si algún día se acerca al niño, que sea invisible y acotada (pistas contextuales dentro de un reto, narración TTS), jamás un chat abierto. No es prioridad de la Épica 1.

---

# Síntesis: el rediseño en 7 decisiones

| # | Decisión | Tipo |
|---|----------|------|
| 1 | **Login sin teclado de texto**: curso → yo → PIN numérico en pantalla. `/registro` sale del recorrido del niño (lo opera el docente). | Radical |
| 2 | **Muere el sidebar y muere el dashboard**: el Inicio del estudiante es saludo + barra de nivel + botón gigante "Seguir jugando" + mundos. Cuenta/PIN/sesión se ocultan tras el avatar. | Radical |
| 3 | **Las materias se vuelven "mundos"** con identidad visual propia y las 4 pestañas se fusionan en un solo camino ordenado de retos (con estrellas por nodo). El material de estudio se integra al camino, no compite con él. | Radical |
| 4 | **Un solo motor de retos** basado en el patrón de MisionNarrativa (fases, una decisión por pantalla, celebración final): el Quiz-muro desaparece para estudiantes. | Radical |
| 5 | **El progreso se unifica en "Mis premios"** (nivel visual + vitrina de logros); se retiran los logros sin lógica y "Actividad reciente"; el ranking absoluto se reformula (meta de aula / semanal) o se elimina. | Radical |
| 6 | **Capa de juicio sensorial**: sonidos de acierto/error/celebración, animaciones de recompensa a pantalla completa en vez de toasts, cero `window.prompt`/`alert`, texto mínimo con límites duros por campo (incluido el prompt del generador IA del docente). | Transversal |
| 7 | **Rutas reales para el estudiante** (el botón atrás nunca expulsa al login) y diseño tablet-first táctil. Convierte el RFC-006 pendiente en prerequisito de esta épica. | Técnico-UX |

## Qué se conserva como cimiento

- La filosofía de mecánica ya escrita en el Clasificador y la Misión: *siempre se termina ganando*, error = pista + reintento, puntúa el primer intento, estrellas 1–3.
- `completarReto()` como flujo único de recompensa y el XP transaccional del servidor.
- El modelo de datos completo (retos polimórficos, progreso, invitaciones): **esta auditoría no requiere cambios de base de datos**, salvo quizá metadatos de orden/secuencia de retos por materia.
- La lógica de "Continuar aprendiendo" con sus tres estados.

## Orden sugerido para las especificaciones

1. **Spec 1 — Shell del estudiante**: rutas, muerte del sidebar, nuevo Inicio (impacto máximo, riesgo bajo).
2. **Spec 2 — Mundos y camino de retos**: fusión de pestañas, identidad por materia, secuencia.
3. **Spec 3 — Motor único de retos**: quiz por fases, celebraciones, sonido.
4. **Spec 4 — Login infantil** (requiere decisión sobre listado de estudiantes vs. código de aula).
5. **Spec 5 — Premios**: vitrina, curva de XP, destino del ranking, logros nuevos alcanzables.

# SPEC-024 — Continuidad de sesión

> Estado: **APROBADA por Fabrizio** (2026-08-03), diseño incluido, **antes del
> primer commit**. Redactada a partir de un fallo observado en producción, no
> de una hipótesis. Verificación pendiente: §7 se rellena al terminar.
> Toca `src/services/authService.js`, `src/App.jsx` y añade
> `POST /api/auth/renovar` → **§9 de CONTRIBUTING.md (login / autenticación
> JWT)** y regla §6.6 (API nueva), por eso existe este documento: sin
> aprobación no hay primer commit.

## 1. Problema

Reportado por Fabrizio el 2026-08-03, con dos síntomas separados por unos días:

1. Hace un par de días, volver con el **botón Atrás** perdía el login y el
   navegador daba **404**.
2. Hoy, al abrir la aplicación, entró **al panel del rol de la última sesión,
   pero sin datos**: las tarjetas vacías y el mensaje «No pudimos cargar esto».

**El síntoma 1 ya está corregido y desplegado**, y no forma parte de esta spec:
lo causaba la falta de `vercel.json` (el hosting no sabía servir `/dashboard`
en una navegación real), añadido en el commit `bd8a523`, que es ancestro de
`origin/main`. La guardia del botón Atrás vive en `src/hooks/useCapasAtras.js`.

**El síntoma 2 es un fallo vivo**, y es de lo que trata este documento.

### 1.1 Causa raíz: la sesión no tiene fecha de caducidad en el cliente

Cuatro eslabones, todos verificables leyendo el código:

1. El servidor firma el JWT con **8 h** de caducidad —
   `server/middleware/auth.js:28`, `expiresIn: process.env.JWT_EXPIRES_IN || '8h'`.
2. El cliente guarda `auth_token` en `localStorage` **para siempre**, y
   `isAuthenticated()` solo comprueba que el token **exista** —
   `src/services/authService.js:183`, `Boolean(getToken())`. Nunca mira `exp`.
3. `ProtectedRoute` se fía de esa función — `src/App.jsx:40` — así que
   **deja entrar al panel con un token muerto**.
4. Ya dentro, cada petición responde 401. `authFetch` hace `logout()` —
   `src/services/authService.js:202` — pero **no navega ni avisa a nadie**.
   React no se entera de que `localStorage` cambió: el panel sigue montado.

El resultado es exactamente lo observado: el panel del último rol, vacío. Y con
un agravante silencioso: el botón **Reintentar** de los estados de error ya no
puede funcionar **nunca**, porque el 401 borró el token y las siguientes
peticiones salen sin `Authorization` («Token requerido»). La única salida es
recargar la página, y nada en pantalla lo sugiere.

### 1.2 Qué SÍ está bien hoy (para no exagerar el problema)

- **Los juegos ya son honestos** cuando el servidor no confirma: muestran «No
  pudimos confirmar tu XP en este momento» y **nunca** un «+N XP» estimado como
  si estuviera acreditado — `src/components/juegos/ResultadoActividad.jsx:62`,
  y el estado `sinConfirmar` en `QuizInteractivo.jsx` y `juegosComunes.jsx`.
  El XP no se falsea. Lo que falta es decir que la causa fue la sesión, no la
  conexión.
- **El servidor ya distingue bien los códigos**: `autenticar` responde 401 solo
  cuando la sesión no vale (token inválido, cuenta desactivada o en papelera) y
  **503** cuando no puede verificar (BD caída) precisamente para no cerrarle la
  sesión a nadie por una caída de MySQL — `server/middleware/auth.js:101-108`.
  Esa distinción hay que conservarla intacta.
- **SPEC-019 depende de este camino**: revocar el acceso surte efecto porque el
  cliente reacciona al 401. Hoy reacciona a medias (borra, pero no avisa).
  Nótese que SPEC-019 §1 daba por bueno el frontend («no hace falta tocarlo»);
  era cierto para la revocación, pero no para lo que ve la persona.

### 1.3 El segundo problema: 8 h fijas no cubren una jornada escolar

Aunque el punto 1.1 se arregle, un docente que entra a las 7:00 se queda sin
sesión a las 15:00 **en mitad de una clase**, aunque lleve todo el día usando la
aplicación. Y un niño puede perder el intento que estaba jugando. Que el corte
esté bien explicado lo hace tolerable, no correcto.

## 2. Objetivo

1. Una sesión caducada **nunca** deja un panel fantasma, ni al arrancar ni con
   la pestaña abierta.
2. Cuando la sesión termina, **se explica y se vuelve al acceso**, sin sacar a
   un niño de golpe de la actividad que está jugando.
3. Mientras la aplicación **se está usando de verdad**, la sesión no se muere.
   Si se abandona, muere como debe.

## 3. Fuera de alcance

- No se tocan los juegos: su estado `sinConfirmar` ya es correcto.
- No se cambia el almacenamiento: `localStorage` sigue siendo caché y nunca
  fuente de verdad (regla §6.11).
- No se toca el diseño UX congelado de SPEC-013 ni las clases `.opcion-*`.
- No se sube `JWT_EXPIRES_IN` en producción: la renovación de §5 lo hace
  innecesario, y una duración base más larga solo mueve el corte de sitio.
- No se introduce *refresh token* con rotación ni cookies `HttpOnly`. Sería la
  solución de libro, pero es un rediseño del modelo de sesión completo, con
  CSRF y CORS por delante, y la regla §6.1 (MVP first) manda.

## 4. Diseño — Parte A: la caducidad deja de ser invisible

Todo el trabajo de esta parte es de **frontend**.

### 4.1 `src/services/authService.js` — saber cuándo caduca

- `cargaDelToken(token)`: decodifica el payload del JWT con `atob` (sin añadir
  librerías, regla §6.4). Devuelve `null` ante cualquier forma inesperada. Solo
  se lee `exp`; la firma **no** se valida en el cliente y no debe pretenderse
  que se hace: la autoridad sigue siendo el servidor.
- `msParaCaducar()` y `sesionCaducada()` derivados de `exp`.
- `isAuthenticated()` pasa a exigir token **y** que no haya caducado. Si el
  token no trae `exp` legible, se comporta como hoy (*fail-open*): una forma de
  token inesperada no puede dejar fuera a toda la escuela.
- `purgarSesionCaducada()`: borra la sesión muerta. Se llama **una vez en
  `src/main.jsx`, antes de montar React** — arrancar con la sesión caducada cae
  limpio en el Login, y el borrado no ocurre dentro de un render.
- Se separa `escribirSesion(data)` (token + usuario) de `guardarSesion(data)`
  (= limpiar la caché del usuario anterior + `escribirSesion`). Es **necesario
  para §5**: renovar no puede borrar `edu_xpTotal` ni `edu_historialRetos` como
  hace el login, o el docente perdería sus borradores al renovar.
- `authFetch`: en 401 sigue haciendo `logout()` y además publica el aviso de
  sesión caída **una sola vez** (bandera de módulo, reseteada en
  `guardarSesion`). Un panel dispara varias peticiones en paralelo: sin esa
  bandera saldrían N avisos y N navegaciones. `conservarSesionEn401` se respeta
  igual que hoy (cambiar PIN).

### 4.2 `src/services/sesionBus.js` (nuevo)

Calcado de `src/components/dashboard/toastBus.js`, que ya resuelve este mismo
problema para los toasts: un servicio necesita avisar a React sin importar
React. Expone `suscribir(fn)` / `avisarSesionCaida()`, y el par
`marcarActividadEnCurso(bool)` con su notificación.

### 4.3 `src/components/GuardiaDeSesion.jsx` (nuevo)

Se monta **una vez**, dentro del Router en `App.jsx`, al lado de `<ToastHost/>`.

Al recibir el aviso de sesión caída:

- `toast.aviso('Tu sesión terminó por seguridad. Vuelve a entrar.')`, reutilizando
  el `toastBus` existente;
- `navigate('/', { replace: true })` — **salvo** que haya una actividad en
  curso. En ese caso el aviso se muestra igual pero la navegación **espera** a
  que el niño cierre la actividad. Sacar a un niño de 6-9 años de su juego sin
  avisar es peor que el propio fallo.

Y vigila **sin esperar a que algo falle**: `visibilitychange`, `focus`, un
temporizador armado con `msParaCaducar()`, y el evento `storage` (si otra
pestaña cierra sesión, esta reacciona — tablets compartidas, dos pestañas del
mismo panel).

### 4.4 `src/hooks/useGuardiaActividad.jsx`

Una línea: `marcar()` publica también el estado al bus. Ese hook ya es la
fuente de verdad de «hay un intento con progreso real sin terminar», así que el
guardia se entera **sin tocar los tres paneles**.

## 5. Diseño — Parte B: renovación deslizante

### 5.1 `POST /api/auth/renovar` (servidor)

Con el middleware `autenticar`. Relee la fila de `usuarios` por `req.user.id` y
responde con el helper existente `respuestaSesion(res, usuario)`
(`server/routes/auth.js:93`): token nuevo **y** `usuario` fresco.

Efecto lateral bueno: un cambio de permisos de SPEC-003 deja de esperar a un
login nuevo para reflejarse en la UI (el servidor ya revalidaba en cada
endpoint; era solo la UI la que iba con retraso).

**No abre ningún agujero**: `autenticar` ya rechaza con 401 las cuentas
desactivadas o en la Papelera **antes** de llegar al handler (SPEC-019), así que
renovar **no revive a nadie revocado**. Y un token ya caducado no pasa
`jwt.verify`: renovar exige una sesión todavía viva.

### 5.2 Cliente

- `renovarSesion()` en `authService`: llama al endpoint y guarda el resultado
  con `escribirSesion` (sin limpiar la caché del usuario).
- `GuardiaDeSesion` programa la renovación cuando falta poco para `exp`
  (10 min), y **solo si hay uso real**: documento visible **y** interacción
  (`pointerdown` / `keydown`) desde la última renovación. Sin uso no se renueva:
  una pestaña olvidada toda la noche en una tablet compartida caduca como debe.
- Si la renovación falla → mismo camino que una sesión caducada.

Esta condición de «uso real» es lo que impide que la renovación se convierta en
una sesión eterna, que es el riesgo evidente de cualquier esquema deslizante en
un dispositivo compartido.

## 6. Verificación

Entorno local con Docker MySQL (MODO A) y `JWT_EXPIRES_IN` corto (2-3 min) para
no esperar 8 h. En navegador, sobre los tres paneles:

| # | Escenario | Esperado |
|---|---|---|
| 1 | Arrancar con token caducado (admin / docente / estudiante) | Login limpio, sin panel vacío |
| 2 | Pestaña en segundo plano hasta caducar, y volver | Aviso + login sin tocar nada |
| 3 | Caduca en mitad de un quiz o juego | Avisa, no lo saca del juego; al cerrar la actividad, login |
| 4 | Uso continuo con token de 3 min | Renueva sola, cero interrupciones |
| 5 | Pestaña abierta sin tocar nada | **No** renueva: caduca y avisa |
| 6 | Cuenta desactivada con la sesión abierta (SPEC-019) | 401 → mismo camino de sesión caída |
| 7 | BD caída → 503 de `autenticar` | **No** cierra sesión (solo el 401 lo hace) |
| 8 | Dos pestañas, una cierra sesión | La otra reacciona |
| 9 | Dispositivo compartido: niño A sale, entra niño B | Sin restos de XP ni borradores del anterior |
| 10 | Atrás en cada nivel + recarga profunda, 3 paneles | Regresión de `useCapasAtras` y del 404 |
| 11 | Backend frío (Render dormido) | Timeout/red **no** se lee como sesión caída |

Cierre: `npm run build` sin errores, `npm run lint` sin superar la baseline de
29, y comprobación en móvil/tablet del toast del guardia (regla §6.5).

## 7. Resultados

### 7.1 Verificado en navegador SIN backend (2026-08-03)

Cinco escenarios de la matriz dependen solo del `exp` del token, así que se
comprobaron con el frontend real (Vite, panel real) y **tokens sintéticos**: la
firma no se valida en el cliente, así que un token con el `exp` que se quiera es
un doble legítimo para esta parte. Con el backend apagado a propósito, que
además sirve de control para el escenario 11.

- **#1 Arrancar con token caducado.** Token de docente caducado hace dos días
  → la aplicación abre en el **Login**, y `auth_token`/`auth_usuario` quedan
  **borrados** de `localStorage`. Repetido con un token de admin y entrando por
  **enlace directo a `/dashboard`**: mismo resultado, sin panel fantasma.
- **#2 Caduca con la pestaña abierta.** Token de estudiante plantado a las
  20:39:29 con caducidad a los 20 s. El panel montó en `/dashboard` y, **a las
  20:39:49 — el segundo exacto de la caducidad**, apareció el aviso «Tu sesión
  terminó por seguridad. Vuelve a entrar.» y la ruta pasó a `/`. Sin tocar nada
  y sin ninguna petición de por medio.
- **#5 Renovar solo con uso real.** Token dentro del margen (9 min). Con la
  visibilidad sustituida por un doble de prueba (`visibilityState: 'visible'`,
  porque el panel del navegador no se estaba mostrando y la pestaña estaba
  `hidden`) y **sin interacción previa**: **cero** peticiones a
  `/api/auth/renovar`. Tras un `pointerdown` real: **`POST /api/auth/renovar`**
  intentado. La puerta abre y cierra por la condición correcta.
- **#8 Dos pestañas.** Dos pestañas en `/dashboard`; al borrarse la sesión en
  una, la otra reaccionó **en el mismo segundo** con su mensaje propio
  («Se cerró la sesión en otra pestaña») y volvió a `/`.
- **#11 Red caída ≠ sesión caída (parcial).** Todo lo anterior corrió con el
  backend apagado: minutos de `ERR_CONNECTION_REFUSED` en todas las llamadas
  del panel **y** una renovación fallida por red, con la sesión **intacta** y
  sin ningún aviso. Falta la mitad con servidor vivo (Render frío / 503).

### 7.1.1 Un fallo del propio guardia, encontrado al verificarlo

La primera versión de `revisar()` salía sin reprogramar cuando no había token.
Como la aplicación **arranca en el Login**, el guardia se apagaba en el primer
ciclo y **no volvía a encenderse al iniciar sesión**: ni renovación ni aviso de
caducidad en el caso más normal de todos. Solo se salvaba si el usuario cambiaba
de pestaña (el `focus` volvía a dispararlo).

Corregido separando `programar()`, que se ejecuta **siempre** —sin sesión, un
latido barato cada dos minutos—. *Verificado con el temporizador puro, sin
ayudas:* con el guardia arrancado en el Login **sin token**, se plantó a las
20:47:54 una sesión que caducaba a las 20:50:24 y **no se tocó nada más**; el
aviso salió a las **20:50:24** y el token quedó borrado. Con el fallo presente,
ahí no habría pasado nada nunca.

Comprobaciones de cierre: `npm run build` sin errores y `npm run lint` en
**29 problemas**, exactamente la baseline previa (los archivos nuevos no añaden
ninguno).

**No se re-verificó el toast en móvil**: el `<ToastHost/>` es el componente de
SPEC-018 sin modificar; aquí solo se publica en él.

### 7.2 Verificado contra MySQL real (2026-08-03)

Docker MODO A (`docker-compose.dev.yml`, MySQL 8 en 3307), backend real y
`seedDev.js`. `server/.env` se apuntó temporalmente a esa BD con
`JWT_EXPIRES_IN` corto y se **restauró byte a byte** al terminar. Todos los
inicios de sesión son reales, por `authService`, con las credenciales dev.

- **#4 Renovación de extremo a extremo.** Login real de docente (token de
  180 s). Con la pestaña visible y una interacción, `POST /api/auth/renovar`
  devolvió **200** y la caducidad del token pasó de 22:42:11 a **22:42:32**:
  el token se re-firmó de verdad y el panel siguió montado, sin parpadeo.
- **#6 Cuenta desactivada con la sesión abierta (SPEC-019).** `UPDATE usuarios
  SET activo=0` en la BD; la siguiente acción normal del panel
  (`docenteService.resumen()`) recibió **401 «Tu cuenta ya no tiene acceso»** →
  aviso, vuelta a `/` y token borrado. La revocación ahora **se ve**, no solo
  funciona por dentro.
- **#7 BD caída → 503, la sesión NO muere.** Con el contenedor de MySQL
  detenido, `/api/docente/resumen` devolvió **503** («No se puede verificar tu
  acceso en este momento»): **sesión intacta, sigue en `/dashboard`, cero
  avisos**. La distinción 401/503 del middleware se conserva.
- **#3 Caduca en mitad de una actividad.** Token real de 100 s. El niño abrió
  «Suma y resta básica» y respondió 1 de 2. A las **22:44:06 — el segundo
  exacto de la caducidad** salió el aviso y **la ruta no cambió**: siguió en su
  quiz con el avance **1/2** intacto. Al pulsar «← Otros quizzes» apareció la
  confirmación de siempre («¿Quieres salir del juego?») y, al confirmar,
  **entonces sí** volvió al acceso.
- **#9 Dispositivo compartido.** Niño A entra, se le ensucia la caché
  (`edu_xpTotal=9999`, borradores), cierra sesión y entra el niño B: B recibe su
  propio `edu_estudianteId` (2) y **no hereda ni el XP ni los borradores**.
- **#10 Atrás por niveles y recarga profunda, en los tres paneles.** Estudiante:
  3 niveles abiertos → 3 centinelas; Atrás cerró **quiz → materia → Inicio**,
  siempre dentro de `/dashboard`, **sin ver nunca el login** y con la sesión
  intacta. Admin: Atrás cerró la sección «Estudiantes» y devolvió al Centro de
  administración, igual de estable. Recarga directa en `/dashboard`: el panel
  volvió con **datos reales** y sesión viva.
- **#11 (mitad restante).** Cubierta por el 503 de #7 y por los minutos de
  `ERR_CONNECTION_REFUSED` de §7.1: ningún fallo de red o de servidor cierra la
  sesión. **El 404 de Vercel no se puede reproducir en local** —es
  configuración de hosting (`vercel.json`), ya desplegada— y no se re-verificó
  aquí.

### 7.3 Alcance real de la verificación

Todo lo anterior se ejecutó **en local, contra MySQL real**. **Nada se ha
probado en producción** (regla §6.16): el despliegue a Vercel/Render y su
comprobación quedan pendientes.

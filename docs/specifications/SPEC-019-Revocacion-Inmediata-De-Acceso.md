# SPEC-019 — Revocación inmediata de acceso

> Estado: **APROBADA por Fabrizio e IMPLEMENTADA** (2026-07-29). Fase 1 en
> código y **9 escenarios verificados en local contra MySQL real**; resultados
> en §8. Producción sin validar hasta el deploy (regla §6.16).
> Toca `server/middleware/auth.js` → **§9 de CONTRIBUTING.md (autenticación)**, por
> eso existe este documento: sin aprobación no había primer commit.
> Origen: observación del experto, ítem **59** del backlog de `MASTER_PLAN.md`.

## 1. Problema

Cuando un administrador **desactiva** a un docente o a un estudiante, o lo
**envía a la Papelera**, la persona **sigue entrando y usando la aplicación
hasta que caduque su token: hasta 8 horas** (`JWT_EXPIRES_IN`, por defecto
`8h`).

La causa está localizada y es una sola función. En
`server/middleware/auth.js:31`, `autenticar` verifica **solo la firma** del
token:

```js
req.user = jwt.verify(token, JWT_SECRET);
```

El token es un papel firmado que dice quién eras **cuando iniciaste sesión**.
Nadie vuelve a preguntarle a la base de datos si esa persona sigue teniendo
acceso hoy.

### Qué SÍ está bien hoy (para no exagerar el problema)

- **El login sí comprueba las dos cosas**: `server/routes/auth.js` rechaza a
  quien esté en la Papelera (`eliminado_en`) y a quien tenga `activo = 0`.
  Una vez desactivada, la cuenta **no puede volver a entrar**. El agujero es
  únicamente la sesión que ya estaba abierta.
- **Los caminos de administración ya revalidan contra la BD**: `conPermiso`
  (`:87`) y `soloAdminPrincipal` (`:131`) consultan `usuarios` en cada
  petición y comprueban `activo` y `eliminado_en`. **Un administrador
  desactivado pierde el acceso al instante.** El hueco afecta a **docentes y
  estudiantes**, no a administradores.
- El frontend ya está preparado: `authFetch` (`src/services/authService.js:190`)
  hace `logout()` ante cualquier **401**. No hace falta tocarlo.

### Por qué importa en la defensa

Es la pregunta natural de un tribunal: *«el director da de baja a un docente,
¿qué pasa?»*. La respuesta honesta hoy es «deja de poder entrar, pero si tenía
la sesión abierta sigue trabajando hasta 8 horas». Con esta spec la respuesta
pasa a ser **«pierde el acceso en su siguiente clic»**, que es lo que cualquiera
espera de un sistema escolar.

## 2. Alcance

**Dentro:** que un docente o estudiante desactivado o enviado a la Papelera
deje de poder usar la API con el token que ya tenía.

**Fuera, a propósito** (y así se dirá en la tesis):

- Cerrar sesión a la fuerza *en la pantalla* del usuario (no hay WebSocket ni
  push; el cierre ocurre en su siguiente petición, que en esta app es cuestión
  de segundos porque todas las vistas leen de la API).
- Lista de revocación de tokens, `jti`, refresh tokens o rotación de secreto.
  Sobra para el tamaño del problema.
- Cambiar `JWT_EXPIRES_IN`, el formato del token o el flujo de login.

## 3. Diseño propuesto

Una sola idea: **`autenticar` deja de creerle solo al papel y pregunta a la
base de datos**, exactamente como ya hacen `conPermiso` y `soloAdminPrincipal`.
No se inventa un mecanismo nuevo: se extiende a todos el que el proyecto ya usa
para los administradores.

```
autenticar
  1. verifica la firma del token            (igual que hoy)
  2. SELECT rol, activo, eliminado_en FROM usuarios WHERE id = ?
  3. si no existe la fila, o eliminado_en IS NOT NULL, o activo = 0
        → 401 { error: 'Tu cuenta ya no tiene acceso. Vuelve a iniciar sesión.' }
  4. si el rol de la BD ya no es el del token → manda el de la BD
```

Decisiones concretas:

- **401, no 403.** Es la respuesta que `authFetch` ya traduce a `logout()`, así
  que el usuario acaba en la pantalla de login sin escribir una línea de
  frontend.
- **La BD manda sobre el token también en el `rol`.** Si a alguien lo degradan,
  su token viejo no le conserva el rol viejo.
- **Coste: una consulta por petición, por clave primaria.** Es el mismo coste
  que ya paga hoy cada petición de administración. La corrección del ítem 57
  (sondeo del panel Admin acotado a la sección visible) acaba de reducir mucho
  el número de peticiones, así que el momento es bueno.
- **Sin migración.** `activo` y `eliminado_en` ya existen y ya se leen.
- **Fail-closed salvo UNA excepción reconocida.** Si la consulta falla por
  columna inexistente (`ER_BAD_FIELD_ERROR`), se deja pasar con el
  comportamiento anterior —igual que hacen hoy `conPermiso` y
  `soloAdminPrincipal`— pero **nunca en silencio**: se registra un aviso
  (limitado a uno por minuto para no inundar el log). **Cualquier otro fallo
  —MySQL caído, timeout, conexión perdida, error SQL inesperado— NO deja
  continuar la petición: responde 503.**

  **Esa excepción está justificada con evidencia, no por analogía.** Se
  comprobó que (1) `usuarios.activo` y `usuarios.eliminado_en` **no están en
  el esquema base**: los añaden las migraciones **003** y **004**; y (2)
  `inicializarEsquema()` se ejecuta **dentro del callback de `app.listen`**
  (`server/server.js:126`) y, **si falla, el servidor sigue vivo a propósito**
  para poder diagnosticarlo. Es decir, la ventana de "esquema sin migrar
  atendiendo tráfico" **existe de verdad**; sin la excepción, un fallo de
  migración dejaría a TODA la escuela fuera con 401.

- **Por qué 503 y no 500 ni 401.** 500 se confundiría con un error de lógica;
  **401 sería peor: le cerraría la sesión a todo el mundo por una caída de la
  base de datos.** 503 dice exactamente lo que pasa —"ahora mismo no puedo
  verificarte"— y `authFetch` no lo trata como cierre de sesión.

### Alternativa considerada y descartada

**Micro-caché en memoria (TTL 15–30 s)** para no consultar en cada petición.
Descartada para el MVP: reintroduce una ventana de acceso, añade estado que
mantener y **el ahorro no hace falta** a escala de una escuela. Queda anotada
por si post-tesis el volumen lo pidiera.

## 4. Cambios

### Backend — un archivo

- `server/middleware/auth.js`: `autenticar` pasa de síncrono a `async` y añade
  la consulta descrita. **No cambia su firma de uso** (`app.use(autenticar)` y
  los routers siguen igual): Express admite middlewares asíncronos.

### Frontend

- **Ninguno.** `authFetch` ya hace `logout()` ante un 401.

### Documentación

- `CURRENT_STATE.md` y `MASTER_PLAN.md`: cerrar el ítem 59.

## 5. Escenarios a verificar (checklist de cierre)

| # | Escenario | Resultado esperado |
|---|---|---|
| 1 | Docente con sesión abierta → el admin lo **desactiva** → el docente hace cualquier acción | **401** y vuelta al login |
| 2 | Docente con sesión abierta → el admin lo manda a la **Papelera** → cualquier acción | **401** y vuelta al login |
| 3 | Estudiante con sesión abierta → **desactivado** → intenta enviar una partida (`POST /api/progreso`) | **401**, sin escribir XP |
| 4 | Estudiante **restaurado** desde la Papelera → vuelve a entrar | Entra con normalidad |
| 5 | Docente y estudiante **activos** → recorrido completo de sus paneles | Sin ningún 401; todo igual que antes |
| 6 | Administrador Principal | Sin cambios (ya revalidaba) |
| 7 | Token caducado o con firma inválida | **401**, igual que hoy |
| 8 | XP: partida completa de un estudiante activo | `POST /api/progreso` sigue siendo transaccional e idempotente (§10 intacto) |
| 9 | Peticiones por pantalla antes/después | Se mide y se reporta el número real |

Verificación en el entorno local con MySQL real (portable, 3308). **Producción
sigue sin validar** hasta el deploy, como el resto del proyecto (regla §6.16).

## 6. Riesgos

1. **Una consulta más por petición.** Es por clave primaria y con la conexión
   del pool ya abierta. Se medirá el antes/después y se reportará el número, no
   una impresión.
2. **Si la BD cae, ahora también cae la autenticación.** Hoy un token válido
   pasaría el muro y fallaría más adentro (donde igualmente se consulta la BD);
   con el cambio falla antes y con un mensaje más claro. No hay pérdida real de
   funcionalidad.
3. **Toca §10.** Por eso el alcance es deliberadamente diminuto: **una función,
   un archivo, cero cambios en login, JWT, PIN, código de emergencia, XP,
   misiones, ranking y permisos.**

## 7. Fases

| Fase | Alcance | Estado |
|---|---|---|
| 1 | `autenticar` revalida contra la BD | 🟢 **Hecha** (2026-07-29) |
| 2 | Verificación de los 9 escenarios de §5 en local con MySQL real | 🟢 **Hecha** — resultados en §8 |
| 3 | Cierre documental (`CURRENT_STATE.md`, `MASTER_PLAN.md` ítem 59) | 🟢 **Hecha** |

## 8. Resultados de la verificación (2026-07-29, local con MySQL real 3308)

Todo por la **API real**, sin SQL directo. Arnés en el scratchpad de la sesión.

| # | Escenario | Resultado medido |
|---|---|---|
| 1 | Cuenta **desactivada** (`activo = 0`) con sesión abierta | 200 → desactivar → **401** «Tu cuenta ya no tiene acceso» → reactivar → **200** |
| 2 | Docente a la **Papelera** con sesión abierta | `DELETE` 200 → su token da **401**; reintento de login **401** |
| 2b | Docente **restaurado** | El **mismo** token vuelve a dar **200** |
| 3 | Estudiante en Papelera → `POST /api/progreso` | **401**, y el XP **no se movió**: 6300 → 6300 |
| 4 | Estudiante restaurado → login por PIN | **200** |
| 5 | Recorridos normales | **19 rutas por API: 0 × 401.** En navegador, **Docente 45/45 en 200** (7 secciones) y **Estudiante 13/13 en 200** |
| 6 | Administrador Principal | Sin cambios: `/admin/estudiantes`, `/admin/docentes`, `/admin/auditoria` en **200** |
| 7 | Sin token / token roto / firma alterada | **401**, **401**, **401** |
| 8 | XP transaccional e idempotente | Reenvío ×2 del mismo intento: **201/201**, `xp_total` 6300 y 6300, `xp_abonado` **0/0** |
| 9 | Coste por petición | Ver abajo |

**Escenario 1, dicho con precisión:** hoy **ninguna ruta pone `activo = 0` a un
docente o a un estudiante** — la única que existe es la de administradores
(`PUT /api/admin/administradores/:id`). La rama se probó por **esa** ruta real,
con la cuenta `admin.limitado`; para docente y estudiante la vía que sí existe
es la Papelera, cubierta por los escenarios 2 y 3.

### Fail-closed, probado apagando MySQL de verdad

Con la base de datos **detenida** y un token **perfectamente válido**, las 4
rutas autenticadas probadas devolvieron **503** con cuerpo de error y **cero
datos**, mientras `/api/health` (que no pasa por el muro) seguía en **200** —
prueba de que el servidor estaba vivo y la negativa vino del muro. El log
registró `[SPEC-019] No se pudo verificar el acceso: ECONNREFUSED` en las 4.
Al volver a levantar MySQL, **el mismo token** recuperó el **200**: la caída
**no le cerró la sesión a nadie**.

La rama tolerada (`ER_BAD_FIELD_ERROR`) **no se provocó** —habría exigido
tirar columnas de la BD de desarrollo—: queda verificada por lectura de código
y es la misma condición exacta que ya usan `conPermiso` y `soloAdminPrincipal`.

### Coste (§9)

Medido con 200 peticiones por pasada, tras calentamiento, revirtiendo
temporalmente `auth.js` para tener un baseline real:

| Ruta | Sin SPEC-019 | Con SPEC-019 (3 pasadas) |
|---|---|---|
| `/api/materias` (la autenticada más liviana) | p50 **1,479 ms** | p50 **1,832 / 1,939 / 1,645 ms** |
| `/api/progreso/1` (con trabajo real) | p50 **2,028 ms** | p50 **1,832 / 2,299 / 2,001 ms** |

**Lectura honesta:** en la ruta más liviana el sobrecoste es de **unos +0,35 ms
de mediana**; en rutas que ya hacen trabajo real **queda dentro del ruido de
medición** (hubo pasadas más rápidas que el baseline).

**Advertencia que NO hay que callarse:** esto es MySQL **local por loopback**.
En producción la BD es **Aiven, remota**, así que el coste real no será 0,35 ms
sino **un round-trip de red más por petición autenticada**. Atenúa el golpe que
la consulta sea por clave primaria, sobre una conexión ya abierta del pool, y
que la corrección del ítem 57 acabe de recortar el número de peticiones del
panel Admin. **Hay que volver a medirlo tras el deploy.**

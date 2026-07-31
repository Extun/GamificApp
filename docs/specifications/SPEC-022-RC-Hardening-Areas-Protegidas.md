# SPEC-022 — RC Hardening: los cuatro puntos de `CONTRIBUTING` §9

**Estado:** 🟡 **PROPUESTA — pendiente de aprobación de Fabrizio. Nada implementado.**
**Fecha:** 2026-07-31
**Origen:** SPEC-021 §8 identifica cuatro hallazgos que tocan áreas protegidas. Esta spec los cubre **los cuatro a la vez**, para aprobarse una sola vez en lugar de abrir cuatro documentos.
**Naturaleza:** endurecimiento previo al Release Candidate. **No** añade funcionalidad, **no** cambia el flujo pedagógico, **no** toca la identidad visual.

## 0. Por qué una sola spec

`CONTRIBUTING` §9 exige spec aprobada antes del primer commit para login/autenticación, XP, misiones, ranking y permisos. Los cuatro hallazgos afectados —**P0-1, P1-2, P1-6, P2-13**— comparten una única causa de fondo:

> **El sistema trata por igual al usuario legítimo y al atacante, y al dato confirmado y al no confirmado.**

El limitador no distingue un aula de una fuerza bruta. El cliente no distingue XP acreditado de XP supuesto. La sesión no distingue a un niño del siguiente en la misma tablet. Corregirlos por separado repetiría el error de SPEC-021 §1: aplicar la corrección pantalla por pantalla en vez de por patrón.

**Garantías que esta spec NO toca, en ninguno de los cuatro puntos:**

- El esquema y la firma de los JWT.
- El hash de PIN y contraseñas (bcrypt).
- El bloqueo por cuenta (`intentos_fallidos` → `bloqueado_hasta`, 5 fallos / 15 min) ni el limitador por nombre.
- La transaccionalidad e idempotencia de `POST /api/progreso` (`FOR UPDATE`) — `CONTRIBUTING` §6.15.
- El motor de misiones (`server/lib/misiones.js`), el catálogo ni el ranking.
- El modelo de datos. **Cero migraciones.**

---

## 1. P0-1 · El límite por IP deja fuera a un aula completa

### 1.1 Problema

Todo `/api/auth` está limitado a **30 peticiones cada 5 minutos por IP**. Una escuela sale a internet por **una sola IP pública (NAT)** y `app.set('trust proxy', 1)` hace que `req.ip` sea esa IP compartida. El estudiante nº 31 de la jornada recibe `429`. Con alta por Excel el bloqueo llega hacia el décimo niño.

### 1.2 Causa raíz

El limitador cuenta **peticiones**, no **fallos**, y se montó sobre el router entero:

```js
app.use('/api/auth', limitarAuth, authRouter);   // server.js:92
```

Como corre **antes** del manejador, no puede saber cómo terminó la petición: un login correcto consume exactamente el mismo cupo que un intento de adivinar un PIN. La defensa que de verdad frena la fuerza bruta —**por cuenta**, 5 fallos → 15 min (`auth.js:24, 77-91`), más un limitador por nombre que no envenena cuentas reales (`auth.js:50`)— ya existe y es independiente de esto.

### 1.3 Qué patrón lo produce

Defensa perimetral diseñada contra un atacante individual, aplicada sobre un identificador (la IP) que en el entorno real de despliegue **identifica a un aula entera, no a una persona**.

### 1.4 Inventario de rutas afectadas

| Ruta | ¿Lleva credencial? | Tratamiento propuesto |
|---|---|---|
| `POST /login` | Sí | Cuenta **solo si falla** |
| `POST /registro-estudiante` | Sí (código de invitación) | Cuenta **solo si falla** |
| `POST /emergencia` | Sí (código de emergencia) | Cuenta **solo si falla** |
| `POST /activar` | Sí (código de activación) | Cuenta **solo si falla** |
| `GET /cursos-pendientes` | **No** — catálogo público | **Excluida** |
| `GET /curso/:cursoId/estudiantes-pendientes` | **No** — catálogo público | **Excluida** |
| `PUT /cambiar-pin` | Ya pasa por `autenticar` (JWT válido) | **Excluida** |

### 1.5 Cambio propuesto

1. El pre-chequeo (rechazar con 429 si ya se superó el techo) se mantiene al frente.
2. El **incremento** pasa a `res.on('finish')` y solo ocurre si `res.statusCode` es **401**. Un login correcto no consume cupo.
3. Las tres rutas de la tabla quedan fuera del limitador.
4. Techo nuevo: **400 fallos / 5 min por IP** (justificación dimensionada en §1.5-bis).
5. El mensaje del 429 pasa a decir la verdad de lo ocurrido, sin culpar al niño.

#### 1.5-bis · Por qué **solo 401** y no `401 o 403` — corrección del borrador

El borrador de esta spec contaba `401 **o** 403`. **El análisis de impacto lo descartó: habría reproducido el mismo fallo con otro disfraz.** En `/api/auth` los 403 no describen una credencial equivocada, sino un **estado de cuenta alcanzado con la credencial correcta**:

| Origen | Situación real |
|---|---|
| `auth.js:191` | Cuenta desactivada por un administrador |
| `auth.js:200` | **Estudiante importado por Excel que aún no ha activado y entra por el login normal** |
| `auth.js:372` | Lo mismo, por la vía del código de emergencia |
| `auth.js:521` | Rol equivocado en `cambiar-pin` (ruta ya excluida) |

El segundo caso es **exactamente el primer día de clase**: un niño con su PIN por defecto correcto que se equivoca de puerta. Contar esos 403 significaría gastar cupo con el error más previsible de la jornada de estreno. **Se cuenta solo 401**, que es cuando la credencial de verdad no coincide.

**Contribuyente conocido y acotado:** `auth.js:497` devuelve 401 cuando el doble clic en «Activar» pierde la carrera (la primera petición ya consumió el código). Es como máximo **1 por niño** y a este techo es irrelevante. Se corrige de raíz en P1-2 parte A, con el aviso al salir.

#### 1.5-ter · Dimensionado del techo: 400 fallos / 5 min

**Techo legítimo (lo que debe caber).** El caso extremo no es un aula sino el colegio entero tras el mismo NAT: **600 estudiantes** llegando en la misma ventana de 5 minutos con una tasa de error de **2 de cada 3** al teclear el PIN → **400 fallos**. Cualquier jornada real queda muy por debajo. Un login correcto vale **0**, así que el uso normal no consume nada.

**Suelo de ataque (lo que no debe caber).**

- **Ataque dirigido a una cuenta:** irrelevante para este techo. El bloqueo por cuenta corta a los **5 intentos / 15 min**, sea cual sea el valor de aquí. Esa es y sigue siendo la defensa principal.
- **Ataque de rociado** (un intento en muchas cuentas): 400/5 min lo limita a **4.800 intentos/hora**, frente a los ~12.000/hora que permitiría solo el bloqueo por cuenta sobre 600 alumnos. Es decir, este techo **sí aporta** justo donde el bloqueo por cuenta no llega, que es la razón de conservarlo.
- **Código de emergencia** (el único secreto sin bloqueo por cuenta en su ruta, porque el SQL exige nombre + código a la vez): 8 caracteres sobre un alfabeto de 31 símbolos generados con `crypto.randomBytes` ≈ **8,5 × 10¹¹** combinaciones. A 400 cada 5 minutos, agotar la mitad llevaría del orden de **16 millones de años**. El techo no es la pieza que lo protege, y subirlo no lo debilita.

**Conclusión:** 400 deja pasar un colegio completo con holgura y sigue estorbando al único ataque para el que esta capa sirve.

**Archivos:** `server/server.js:47-71` (limitador), `server/server.js:92` (montaje). **Un solo archivo de producción.**

### 1.6 Riesgos

| Riesgo | Mitigación |
|---|---|
| Se debilita la defensa contra fuerza bruta | Falso: la defensa efectiva es por cuenta (5/15 min) y sigue intacta. Esta capa pasa de bloquear aulas a bloquear fallos |
| `res.on('finish')` no dispara en alguna ruta | Express lo emite siempre que la respuesta se cierra; se cubre con la prueba negativa de §1.7 |
| Los `GET` excluidos quedan sin ninguna protección | Son de solo lectura y no exponen nada que el propio flujo de alta no publique. Si preocupara, admiten un techo propio y generoso en una iteración posterior |

**Riesgo global: Medio** (es autenticación). **Esfuerzo: S.**

### 1.7 Estrategia de pruebas — puerta de salida

- **Positiva:** 30 `POST /login` **válidos** + 10 `POST /activar` desde una sola IP en menos de 5 minutos → **ningún 429**.
- **Negativa:** 51 `POST /login` con PIN incorrecto desde una IP → el 51.º responde 429.
- **No regresión:** 5 fallos sobre **una misma cuenta** siguen produciendo el bloqueo de 15 minutos.
- **No regresión:** `GET /cursos-pendientes` 100 veces seguidas → siempre 200.

### 1.8 Reversión

`git revert` del commit. Un archivo, sin migración, sin cambio en el cliente y sin estado persistido: el limitador vive en memoria del proceso.

---

## 2. P1-2 · El PIN y el código de emergencia se muestran una sola vez

### 2.1 Problema

Al activar la cuenta se muestran el PIN inicial y el código de emergencia **una única vez**, sin copiar y sin recuperación. El código de activación ya se consumió (`codigo_acceso_hash = NULL`), así que refrescar la pantalla devuelve al formulario, que ahora **rechaza al niño con «Ese código no es correcto»** — su cuenta está activa, pero el camino por el que entró ya no existe.

### 2.2 Causa raíz

La pantalla se diseñó como paso lineal de éxito. No contempla recarga ni cierre, y el error que produce esa situación **describe la causa equivocada**: sugiere que el niño se equivocó, cuando en realidad ya entró.

### 2.3 Cambio aprobado — **solo la parte A**

1. Botón **«Copiar mis datos»** en la pantalla de credenciales.
2. Aviso al salir (`beforeunload`) mientras esa pantalla esté visible.

**El servidor no se toca.** `POST /activar` conserva su mensaje genérico único.

**Parte B DESCARTADA por decisión de Fabrizio (2026-07-31).** Se propuso que `/activar` distinguiera «código incorrecto» de «cuenta ya activa», con el argumento de que `GET /curso/:id/estudiantes-pendientes` ya publica el complemento y por tanto no habría superficie nueva. **Fabrizio prefiere minimizar la información que expone el sistema**, aunque hoy sea derivable por otra vía: un mensaje que confirma un estado de cuenta es una afirmación del servidor, no una inferencia del atacante, y el día que ese `GET` se restrinja el mensaje seguiría filtrando. **No se implementa y no se vuelve a proponer.**

Consecuencia asumida: el niño que refresca la pantalla de credenciales y reintenta seguirá viendo *«Ese código no es correcto»*. El aviso al salir de la parte A existe precisamente para que ese callejón se recorra mucho menos.

**Fuera de alcance:** reimprimir el carné y regenerar el código de emergencia desde el panel del docente. Es funcionalidad nueva; se anota en `MASTER_PLAN.md`.

**Archivos:** `src/pages/estudiante/RegistroEstudiante.jsx:117-147`. **Solo cliente.**

### 2.4 Riesgos

**Bajo.** Ningún cambio en el servidor, ninguno en qué credenciales se aceptan y ninguno en los mensajes de error.

### 2.5 Pruebas

- Activar una cuenta y pulsar F5 en la pantalla de credenciales → aparece el aviso de salida.
- «Copiar mis datos» deja PIN y código en el portapapeles.
- Un código inválido sigue diciendo exactamente lo mismo que hoy.

### 2.6 Reversión

`git revert`. Solo cliente.

---

## 3. P1-6 · Dos pestañas = identidad cruzada y XP perdido en silencio

### 3.1 Problema

Token e identidad viven en `localStorage`, compartido por todas las pestañas. Si el niño B entra en una pestaña nueva, `guardarSesion()` sobrescribe ambos. La pestaña de A sigue mostrando su nombre y su XP, pero **sus peticiones viajan con el token de B**. El servidor protege correctamente (`req.user.estudiante_id !== estudianteId` → 403): **no hay contaminación entre cuentas**. Lo que se pierde es el intento de A, **entero y sin error visible**, porque `guardarProgreso` se traga el fallo y el overlay muestra el chip neutro «No pudimos confirmar tu XP». Y como es 403 y no 401, `authFetch` **no cierra la sesión** (`authService.js:202`): la pestaña zombi puede seguir así indefinidamente.

### 3.2 Causa raíz

No existe sincronización entre pestañas ni verificación de que la identidad **renderizada** siga siendo la del token vigente. El `localStorage` se usa como si fuera propiedad de la pestaña, cuando es propiedad del navegador.

### 3.3 Cambio propuesto

1. **Escuchar el evento `storage`.** Si `auth_token` o `edu_estudianteId` cambian bajo los pies de una pestaña, esa pestaña muestra *«Otra persona inició sesión en este dispositivo»* y vuelve al login. Es el mismo mecanismo que ya usan los bancos y el correo web.
2. **Dejar de disfrazar el 403 de progreso.** Un 403 en `POST /api/progreso` deja de ser el chip neutro y pasa a decir que el intento no se guardó porque la sesión cambió.

**Archivos:** `src/services/authService.js:44-57, 192-204`, `src/services/gamificationService.js:81-109`, `src/pages/estudiante/DashboardEstudiante.jsx`.

**Solo cliente. El servidor no se toca.**

### 3.4 Riesgos

| Riesgo | Mitigación |
|---|---|
| Expulsar a un usuario legítimo por un cambio benigno de `localStorage` | El disparo se limita a las dos claves de identidad, y solo cuando **cambian de valor**, no cuando se reescriben iguales |
| El evento `storage` no llega a la pestaña activa | Es su comportamiento estándar: notifica a las **demás** pestañas, que es justo el caso a cubrir |

**Riesgo global: Medio** (es sesión). **Esfuerzo: S.**

### 3.5 Pruebas

- Sesión de A en pestaña 1 → sesión de B en pestaña 2 → volver a la 1: aparece el aviso y vuelve al login, **sin** haber mostrado datos de B.
- Una sola pestaña, uso normal: el aviso **nunca** aparece (regresión principal a vigilar).
- Terminar un juego con la sesión cambiada: el niño ve que su intento no se guardó, en vez del chip neutro.

### 3.6 Reversión

`git revert`. Solo cliente; sin estado persistido nuevo.

---

## 4. P2-13 · El XP local sube aunque el servidor no confirme nada

### 4.1 Problema

`completarReto()` llama a `sumarXP(puntos)` **antes** de saber si el `POST` funcionó (`gamificationService.js:149`). Con la red caída, el overlay dice correctamente «No pudimos confirmar tu XP», pero **la barra del Home ya subió** con XP que no existe en la base de datos.

### 4.2 Causa raíz — y un hallazgo que cambia la valoración

Actualización optimista sin reversión. Pero al leer el camino completo aparece algo que la ficha de SPEC-021 no registró:

- **Si el `POST` tiene éxito**, `guardarProgreso` **sobrescribe** la caché con la verdad del servidor: `escribir(KEY_XP, data.xp_total)` (`gamificationService.js:103`). El `sumarXP` previo queda anulado.
- **Si el `POST` falla**, el `sumarXP` es lo único que queda en pie — y es exactamente el XP fantasma.

Es decir: **la escritura optimista es redundante cuando todo va bien y solo tiene efecto cuando va mal.** No es una compensación entre inmediatez y exactitud: no aporta inmediatez en ningún caso real.

Se verificó además que el overlay **no depende** de ella: `xpIntento` se alimenta únicamente de la respuesta del servidor y ya contempla el estado `sinConfirmar` (`juegosComunes.jsx:76-90`). La celebración de fin de partida no cambia ni un píxel.

### 4.3 Cambio propuesto

Eliminar la llamada a `sumarXP(puntos)` de `completarReto`. La caché local de XP pasa a escribirse **solo** desde una respuesta del servidor, que es lo que ya hacen `guardarProgreso` y `obtenerProgreso`.

Esto además alinea el código con `CONTRIBUTING` §6.11: *«`localStorage` es caché, nunca fuente de verdad»*.

**Archivos:** `src/services/gamificationService.js:144-166`. **Una función. Solo cliente.**

### 4.4 Riesgos

| Riesgo | Mitigación |
|---|---|
| La barra del Home tarda más en subir | No: el Home relee del servidor vía `onCompletado()` al terminar la actividad, que es lo que ya la actualiza hoy |
| Algún consumidor esperaba el efecto de `sumarXP` | Auditado: `xpIntento` y `puntosGanados` no dependen de él. Se verifica con los 7 reproductores |
| Es área protegida (§9) | El cambio **no toca el servidor**: la transaccionalidad e idempotencia de `POST /api/progreso` quedan intactas |

**Riesgo global: Bajo-Medio.** **Esfuerzo: S.**

### 4.5 Pruebas

- Terminar un juego **con** backend: la barra del Home sube al valor correcto (idéntico a hoy).
- Terminar un juego **sin** backend: el overlay dice «No pudimos confirmar tu XP» **y la barra del Home no sube**. Al recuperar la red y recargar, el XP sigue siendo el real.
- Los 7 reproductores muestran el mismo «+N XP» que antes cuando el servidor responde.

### 4.6 Reversión

`git revert`. Restaurar una línea.

---

## 5. Orden de implementación

Cada punto es un **commit independiente**, en este orden:

1. **P0-1** — es el único que impide usar el producto. Va primero y solo. *(Bloque B1)*
2. **P1-2** — mismo escenario de fallo (primer día de clase). *(Bloque B1/B4)*
3. **P2-13** — el más pequeño y el mejor aislado. *(Bloque B7)*
4. **P1-6** — el que más superficie de sesión toca. *(Bloque B7)*

Ninguno empieza sin que el anterior haya pasado su puerta de salida.

## 6. Criterio de cierre

Un punto se considera terminado cuando, **además** de sus pruebas propias:

- `npm run build` limpio;
- `npx eslint src server` sin regresiones sobre la línea base de **29 problemas** (26 errores + 3 warnings);
- las pruebas de no regresión de su sección pasan;
- `docs/architecture/CURRENT_STATE.md` queda actualizado.

## 7. Lo que esta spec deja explícitamente fuera

- Sub-rutas reales de navegación (**SPEC-001**): la mitigación de P0-2 va en el bloque B2 y **no** entra aquí porque no toca ningún área de §9.
- Reimpresión del carné del estudiante y regeneración del código de emergencia por el docente.
- Filtrar el ranking por materia (**P2-4**): sería backend nuevo. Solo se corrige el rótulo, en B4.
- Cualquier cambio en el motor de misiones o en el cálculo de XP del servidor.

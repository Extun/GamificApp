# CHECKLIST DE RELEASE CANDIDATE

Guion de validación manual del sprint de Release Candidate (`SPEC-021` / `SPEC-022`). **Permanente:** se ejecuta al cerrar cada checkpoint de bloque y, entero, antes de declarar el RC.

Tiene **dos entornos de ejecución**, y las secciones §0–§3 describen el primero:

1. **Local** (MySQL portable 3308 + backend 3001 + frontend 5173): el guion del día a día, el que se corre al terminar cada bloque.
2. **Desplegado** (§4): además, al cerrar un checkpoint se repite sobre el código realmente publicado. Un fallo que solo existe detrás del proxy de Render o del build de Vercel no aparece en local por definición.

Lo que sigue prohibido es validar contra una instancia con **datos inventados**: en ambos entornos se juega con el esquema y los datos reales.

## 0. Preparación

El backend corre como `node server.js` **sin `--watch`**: no recarga cambios de `server/` por sí solo.

1. `Detener GamificApp.cmd` — apaga backend y, en último lugar y de forma ordenada, MySQL.
2. **Reconstruir el frontend si se tocó `src/`**: `npm run build`. `Iniciar` **no** compila; solo comprueba que `dist/index.html` exista, así que sin este paso se valida el frontend anterior.
3. Comprobar que nadie más ocupa el 5173: `Detener` solo mata procesos que arrancó él, y `Iniciar` aborta si el puerto está tomado.
4. `Iniciar GamificApp.cmd`.

Credenciales demo: `server/scripts/seedDev.js` (estudiantes) y `CREDENCIALES.txt` (admin). **Nunca se copian a un documento ni a un informe.**

## 1. Pruebas

Cada prueba indica el bloque que valida. **Una sola prueba fallida detiene el avance al bloque siguiente.**

| # | Prueba | Qué hacer | Debe ocurrir | Falla si |
|---|---|---|---|---|
| 1 | **Login correcto** (B1) | Estudiante → nombre + PIN válidos | Entra al panel con su XP real | Aparece 429, o rechaza credenciales válidas |
| 2 | **Login incorrecto** (B1) | Mismo nombre, PIN erróneo, **una vez** | «Nombre o PIN incorrectos», visible | Responde 429, o el mensaje no se ve |
| 3 | **Campos vacíos** (B1 · P3-12) | Vaciar los campos y enviar | Aviso **inmediato**, sin viaje al servidor | Tarda, o no dice nada |
| 4 | **Activación** (B1) | Ver §2 | Activa y muestra PIN y código de emergencia | 429 en cualquier punto, o listas vacías |
| 5 | **Navegación normal** (B2) | Mis mundos → materia → Juegos → abrir una actividad | Todo abre con normalidad | Pantalla vacía o error |
| 6 | **Botón Atrás con intento** (B2) | Hacer progreso real y pulsar **Atrás** | Diálogo «¿Quieres salir del juego?»; sigue en el panel | Sale al login, o pierde el intento sin preguntar |
| 7 | **Seguir jugando** (B2) | «¡Seguir jugando!» y **Atrás otra vez** | Vuelve a preguntar; el progreso sigue intacto | El segundo Atrás expulsa |
| 8 | **Cerrar una actividad** (B2) | «Salir sin terminar» | Cierra la actividad; sigue en la materia | Sale de la aplicación |
| 9 | **Volver a entrar** (B2) | Reabrir la actividad y completarla | Overlay de resultado y XP acreditado | No llega el overlay, o el XP no sube |
| 10 | **Atrás sin actividad** (B2) | Desde el Inicio, pulsar **Atrás** | Sigue en el panel; **nunca** el formulario de acceso | Aparece el login teniendo sesión viva |
| 11 | **Logout** | Cerrar sesión | Vuelve al login y **ahí se queda** | Rebota al panel |
| 12 | **Docente** (B2 · P3-4) | Abrir una materia desde el Inicio y desde la sección Materias | **Ambos** caminos abren **📊 Resumen** | Uno abre «Crear actividad» |
| 13 | **Sesión prolongada** | Ver §3 | Ver §3 | Ver §3 |

## 2. Prueba 4 — Activación

Los datos semilla no incluyen estudiantes pendientes, así que hay que crear uno.

1. Como **docente** → *Estudiantes* → **«Añadir estudiante»**. Anotar el **código de activación**.
2. Cerrar sesión.
3. *«¿Primera vez? Regístrate con tu código»* → **«Estoy en la lista de mi clase»** → curso → nombre nuevo → código.

**Hallazgos ya conocidos que aparecerán aquí y NO cuentan como fallo** (tienen bloque asignado): el PIN y el código de emergencia se muestran una sola vez sin botón de copiar (**P1-2**, bloque B4) y el `<select>` de cursos queda vacío sin explicación cuando no hay pendientes (**P1-1-bis**, bloque B3).

## 3. Prueba 13 — Sesión prolongada

Comprueba que la aplicación sobrevive a lo que de verdad hace un niño: dejarla abierta y volver.

### Qué debería pasar, y por qué

| Hecho verificado en el código | Consecuencia para esta prueba |
|---|---|
| `JWT_EXPIRES_IN=8h` (`middleware/auth.js:28`) | A los 30 minutos **no existe expiración legítima**. Cualquier pérdida de sesión es un bug |
| El panel del estudiante **no hace polling** (`useAutoRefresh` solo lo usa el panel de administrador, y además se pausa con la pestaña oculta) | La pestaña en espera hace **cero** peticiones. Nada mantiene la sesión caliente: la primera petición al volver es la que revela el problema |
| `wait_timeout` de MySQL por defecto (8 h) y el pool recicla conexiones ociosas | No debe haber errores de conexión al reanudar |
| El centinela de historial de `useSalidaAtras` vive en memoria de la pestaña | Tras la espera, **Atrás debe seguir preguntando** |

### Antes de esperar: activar la sonda

Los errores silenciosos no se ven por definición. Pegar esto en la consola del navegador (F12) **antes** de dejar la pestaña. No modifica la aplicación: solo observa.

```js
window.__rc = { desde: new Date().toLocaleTimeString(), fallos: [], errores: [] };
(() => {
  const real = window.fetch;
  window.fetch = async (...a) => {
    const url = typeof a[0] === 'string' ? a[0] : (a[0]?.url || '');
    const t = new Date().toLocaleTimeString();
    try {
      const r = await real(...a);
      if (!r.ok) window.__rc.fallos.push({ t, url, estado: r.status });
      return r;
    } catch (e) {
      window.__rc.fallos.push({ t, url, estado: 'sin respuesta: ' + e.message });
      throw e;
    }
  };
  addEventListener('error', (e) =>
    window.__rc.errores.push({ t: new Date().toLocaleTimeString(), msg: e.message }));
  addEventListener('unhandledrejection', (e) =>
    window.__rc.errores.push({ t: new Date().toLocaleTimeString(), msg: 'promesa sin capturar: ' + (e.reason?.message || e.reason) }));
})();
'sonda activa';
```

### Guion

1. Iniciar sesión como estudiante.
2. Activar la sonda.
3. Abrir una actividad y **dejar progreso a medias** (que no esté terminada).
4. **Esperar entre 20 y 30 minutos.** Vale dejar la pestaña en segundo plano; **no** recargar, **no** cerrar el navegador.
5. Volver y **continuar jugando desde donde estaba**.
6. **Terminar la actividad** y comprobar que el XP se acredita.
7. Navegar normalmente: volver a los mundos, entrar a *Mis premios*, abrir otra materia.
8. Pulsar **Atrás** con una actividad abierta y progreso, para confirmar que la guardia sigue viva.

### Veredicto

Leer en la consola:

```js
JSON.stringify({ sondaDesde: window.__rc.desde, peticionesFallidas: window.__rc.fallos, erroresJs: window.__rc.errores, sesionViva: !!localStorage.getItem('auth_token') }, null, 2)
```

**Pasa si todo esto se cumple:**

- `sesionViva: true` y **nunca** apareció el formulario de acceso.
- `peticionesFallidas: []` — en particular ningún **401** (sesión caída) ni **429** (limitador).
- `erroresJs: []`.
- El progreso a medias **seguía ahí** al volver: la actividad no se reinició sola.
- Al terminar, el XP subió **una sola vez** y el Inicio muestra el mismo valor que el overlay.
- *Mis premios* muestra las insignias reales, no «Aún no hay misiones».
- Atrás sigue mostrando el diálogo de confirmación.

**Falla si:** vuelve al login; una petición responde 401 o 429; el XP no se acredita o se acredita dos veces; el Inicio y el overlay dicen cosas distintas; o aparece cualquier error en consola.

**No cuenta como fallo:** que el contador animado de la nota muestre `0` durante un instante justo al volver de una pestaña en segundo plano. Es un artefacto conocido de `requestAnimationFrame`, que el navegador congela mientras la pestaña no es visible; se recupera solo en cuanto vuelve a estar en primer plano. La nota real es la del overlay y la de la base de datos.

### Límite conocido de esta prueba

30 minutos **no** alcanzan a probar la expiración del token. `JWT_EXPIRES_IN=8h` coincide casi exactamente con una jornada escolar, no hay renovación automática ni aviso previo: cuando expira, el primer 401 cierra la sesión sin explicación. **Está fuera del alcance de este checklist y sin bloque asignado**; queda anotado como decisión pendiente para el cierre del RC.

## 4. Checkpoint sobre el entorno desplegado

Se ejecuta **al cerrar un checkpoint de bloque**, no en cada iteración. Comprueba lo que el entorno local no puede comprobar: el build de producción de Vite, el proxy de Render delante de Express y la latencia real.

### 4.1 Topología

**Producción no se toca en ningún paso**: ni sus variables, ni su `CORS_ORIGIN`, ni su rama.

```
Vercel preview (rama del sprint)  ──►  Render staging  ──►  Aiven defaultdb
  VITE_API_URL scope Preview           CORS_ORIGIN = URL del preview   (COMPARTIDA con producción)
```

La BD es la de producción **a propósito**: una base aparte habría que cargarla desde `database/produccion_defaultdb.sql` más las migraciones, y si el esquema resultante no coincidiera con el real, la evidencia valdría menos que la del entorno local. Se acepta a cambio ensuciar con un estudiante de prueba y algo de XP, que se limpian en §4.5. **Deja de ser válido en cuanto producción tenga datos de un colegio real.**

El servicio de staging es **desechable**: existe solo mientras dure el RC y se elimina tras el merge a `main` (§4.5). Por eso nada del repositorio lo menciona: ni `render.yaml`, ni URLs escritas en el código.

### 4.2 Variables del servicio de staging

| Variable | Valor | Por qué |
|---|---|---|
| `DB_*` | idénticas a producción | La BD es la misma |
| `JWT_SECRET` | **cadena nueva, distinta** | Un token emitido en staging no debe valer en producción |
| `CORS_ORIGIN` | URL del preview, sin barra final | Único origen autorizado |
| `ADMIN_PASSWORD` | **sin definir** | Ver el aviso de abajo |
| `RESET_HABILITADO` | `false` | Es el endpoint que vacía la BD |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` | **sin definir** | El checkpoint no prueba IA; así no se gasta cuota |

> ⚠️ **`ADMIN_PASSWORD` se deja vacía y no es un descuido.** `asegurarAdmin` (`initDb.js:674`) hace `INSERT … ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`. Con la base compartida, un valor distinto en staging **sobrescribiría la contraseña del admin de producción**. Sin la variable, la función solo crea un admin cuando no existe ninguno: cero escrituras.

El resto del arranque sí es seguro: mientras la rama no toque `server/initDb.js`, `inicializarEsquema` es el mismo que producción ya ejecuta en cada despliegue, y es idempotente por diseño (`CREATE TABLE IF NOT EXISTS`, `ALTER` condicionales, `INSERT IGNORE`). **Compruébalo antes de cada checkpoint** con `git diff main..<rama> -- server/`.

### 4.3 Preparación

1. **Salud del backend**: `GET <staging>/api/health` → `200`. La primera petición puede tardar ~1 min: el plan gratuito duerme el servicio a los 15 minutos.
2. **A dónde habla el preview de verdad.** Este es el paso que más fácil se salta y el que más caro sale: `VITE_API_URL` se hornea en el build, y si falta en el scope *Preview* el bundle queda apuntando a `http://localhost:3001` (`src/services/*.js`). La página **no se rompe a la vista** —la identidad institucional cae a sus valores por defecto—, así que hay que medirlo. Con el preview abierto, en la consola:

   ```js
   [...new Set(performance.getEntriesByType('resource').map(r => new URL(r.name).origin))]
   ```

   Debe aparecer el origen del **staging**. Si aparece `http://localhost:3001` o no aparece ninguno, la variable está mal: corrígela y **redespliega** —cambiarla sin reconstruir no hace nada—.
3. **CORS**: iniciar sesión. Un error de CORS en consola significa que `CORS_ORIGIN` del staging no coincide exactamente con la URL del preview (sobra una barra final, o es la URL con hash del despliegue en vez de la de la rama).

### 4.4 Qué se ejecuta

| Parte | Cómo |
|---|---|
| Pruebas 1–13 de §1 | El mismo guion, sobre el preview. §0 no aplica: no hay nada que arrancar a mano |
| P0-1, el limitador | `checkpoint-b1-desplegado.mjs`. Genera los 401 con **nombres inexistentes y distintos entre sí**, así que no toca `intentos_fallidos` de ninguna cuenta real: con un nombre que no existe, `candidatas` queda vacío y `auth.js:181` responde 401 sin escribir nada |
| `trust proxy` | Ver abajo |

**Dos cosas que solo pasan desplegado y no cuentan como fallo:** la primera petición tras 15 minutos de inactividad tarda cerca de un minuto (arranque en frío del plan gratuito), y **el limitador vive en memoria**, así que un reinicio del servicio pone el contador a cero. Si el servicio duerme en mitad de la medición del techo, la medición no vale y hay que repetirla.

**`trust proxy` — la comprobación que justifica todo este montaje.** `server.js:32` declara `app.set('trust proxy', 1)`, es decir, un solo salto de proxy. Nunca se ha probado detrás del proxy real de Render. Si hubiera más saltos, `req.ip` resolvería a una IP del proxy y **todos los usuarios del mundo compartirían un único cubo de fallos**: P0-1 quedaría arreglado en local y roto en producción. Se comprueba con el cupo de la IP ya agotado por el script, entrando **desde una segunda red** (el móvil con datos móviles, no la wifi) y escribiendo un PIN incorrecto una vez:

- «Nombre o PIN incorrectos» → ✅ `req.ip` es por cliente.
- «Demasiados intentos fallidos desde esta red» → ❌ el limitador es global; hallazgo nuevo y bloqueante.

### 4.5 Limpieza y desmontaje

Al terminar el checkpoint:

1. Borrar el estudiante de prueba creado en §2 y anotar en el registro qué se borró.
2. Las cuentas demo usadas quedan con XP de más: se anota, no se corrige a mano.
3. Si alguna cuenta quedó bloqueada por los 5 fallos, se desbloquea sola a los 15 minutos.

Tras el **merge a `main`**, eliminar el servicio de staging de Render. No es infraestructura permanente.

## 5. Registro de ejecuciones

| Fecha | Entorno | Bloques validados | Resultado | Notas |
|---|---|---|---|---|
| | | | | |

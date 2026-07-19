# Cómo agregar un nuevo tipo de juego

Guía técnica para incorporar una mecánica de juego nueva a GamificApp (SPEC-017).

**Quién hace qué:**

- **Desarrollador:** implementa el juego siguiendo este contrato.
- **Administrador:** una vez implementado, lo activa o desactiva desde *Gestión de juegos*, sin tocar código.

El administrador **no programa** mecánicas desde el navegador: eso sería ejecución de código arbitrario en una plataforma usada por menores. Lo que sí obtiene es control total sobre la disponibilidad de los juegos ya implementados.

El ejemplo de esta guía es **Verdadero o Falso**, el séptimo juego, implementado íntegramente con este procedimiento.

---

## Resumen: 4 archivos nuevos + 2 líneas por índice

| Paso | Archivo |
|---|---|
| 1 | `server/lib/juegos/tipos/<tipo>.js` — nuevo |
| 2 | `src/components/juegos/<Reproductor>.jsx` (+ su `.css`) — nuevos |
| 3 | `src/components/juegos/registro/<tipo>.jsx` — nuevo |
| 4 | Registrar en `server/lib/juegos/registro.js` — **1 import + 1 entrada** |
| 5 | Registrar en `src/components/juegos/registro/index.js` — **1 import + 1 entrada** |
| 6 | `node scripts/verificar-registros-juegos.mjs` |

Nada más. Ningún módulo central se modifica.

---

## 1. Definición backend del tipo

`server/lib/juegos/tipos/verdadero-falso.js`

```js
import { Tipo } from '../../ia/esquema.js';
import { bloqueContexto, REGLAS_COMUNES } from '../prompts.js';

export const verdaderoFalso = {
    tipo: 'verdadero-falso',          // slug estable; se guarda en retos.tipo
    etiqueta: 'Verdadero o Falso',
    emoji: '✅',
    descripcion: 'Decide si cada afirmación es verdadera o falsa.',
    capacidades: { ia: true, banco: true, reutilizar: true, automatico: true },
    verboAuditoria: 'Resolvió el verdadero o falso',

    validarConfig: (config) => /* mensaje de error o null */,
    totalEsperado: (config) => config.afirmaciones.length,

    banco: { claveItems, validarItem, resumenItem },   // opcional
    ia: { schema, rango, construirPrompt, normalizar } // opcional
};
export default verdaderoFalso;
```

### 2. Validación, evaluación, IA y capacidades

**`validarConfig(config)`** — comprueba la forma de `configuracion_json`. Devuelve un mensaje **legible para el docente** o `null`. Lo usan la publicación de retos y la validación de lo que genera la IA.

**`totalEsperado(config)`** ⚠️ **Es un control de seguridad, no un dato informativo.** `POST /api/progreso` lo usa para rechazar intentos falsificados. Debe devolver el número de ítems evaluables que un intento legítimo puede reportar, o `null` si no es derivable. **Debe coincidir exactamente con el `total` que envía tu reproductor.**

**`capacidades`** — alimentan la matriz de acciones del editor (SPEC-013 §3) y los chips de *Gestión de juegos*. Si declaras `ia: true` debes implementar el bloque `ia`; si declaras `banco: true`, el bloque `banco`. La guardia lo verifica.

**`banco`** (opcional) — permite reutilizar ítems sueltos entre actividades. Solo tiene sentido si tu juego se compone de ítems atómicos independientes.

**`ia`** (opcional):
- `schema` — usa `Tipo.*` de `lib/ia/esquema.js`, **nunca** el SDK de un proveedor. **Declara `required` completo en cada objeto**: el modo *strict* de OpenAI lo exige (SPEC-016 §4.3).
- `rango: [min, max]` — límites de cantidad de ítems.
- `construirPrompt(ctx)` — usa `bloqueContexto(ctx)` y `REGLAS_COMUNES` para heredar el contexto institucional real (materia, curso, nivel, dificultad).
- `normalizar(data, ctx)` → `{ titulo, descripcion, configuracion, items }`.

> Los adaptadores de IA (Gemini, OpenAI) **son agnósticos al tipo**. Agregar un juego nunca requiere tocarlos.

## 3. Reproductor

`src/components/juegos/VerdaderoFalso.jsx`. Recibe `{ reto, estudianteId, onSalir, onCompletado, soloPrueba, onEstadoIntento }` y reutiliza `juegosComunes.jsx`:

```js
const { puntosGanados, toast, setToast, xpIntento } = useRecompensa({
    completado, estudianteId, reto, tipo: 'verdadero-falso',
    aciertos, total, semilla, onCompletado, soloPrueba
});
useReporteIntento(onEstadoIntento, !soloPrueba && !completado && hayProgreso);
```

Eso te da gratis: calificación /100, mejor nota, XP proporcional e incremental, overlay de resultado, mensajes motivacionales, *Jugar otra vez*, revisión y guardia de salida. **No escribas una fórmula de calificación propia.**

Criterio pedagógico obligatorio (igual que el Quiz): durante el intento la respuesta elegida se marca **en neutro, nunca en verde**; la corrección, la respuesta correcta y la explicación se revelan al terminar.

## 4. Registro frontend

`src/components/juegos/registro/verdaderoFalso.jsx` declara metadatos, `Player`, `resumen`, `jugable`, `VistaLectura`, `tarjetaCrear` y el bloque `edicion`:

```js
edicion: {
    claveItems: 'afirmaciones',
    nombreItem: { singular: 'afirmación', plural: 'afirmaciones' },
    maxItems: 8, cantidades: [3, 4, 5, 6, 8],
    ayudaIA: '…',
    itemVacio: () => ({ texto: '', esVerdadera: true, explicacion: '' }),
    firmaItem, textoParaIA, articuloPlural: 'las',
    itemCompleto, resumenItem,
    FormularioItem: ({ item, indice, onCambiar }) => (/* campos del ítem */)
}
```

Declarando `edicion` **usas el editor genérico** (`GeneradorActividadIA`) sin escribir un editor propio. Solo si tu juego necesita un editor a medida añades una entrada en `registro/editores.js`.

## 5. Registrar el tipo

```js
// server/lib/juegos/registro.js
import verdaderoFalso from './tipos/verdadero-falso.js';
const TIPOS = [quiz, mision, clasificador, memorama, lineaTiempo, completar, verdaderoFalso];
```

```js
// src/components/juegos/registro/index.js
import verdaderoFalso from './verdaderoFalso';
const TIPOS = [quiz, mision, clasificador, memorama, lineaTiempo, completar, verdaderoFalso];
```

## 6. Verificar consistencia

```bash
node scripts/verificar-registros-juegos.mjs   # los dos registros declaran los mismos tipos
npm run build && npm run lint
```

**Dos guardias te protegen:**

1. **Al arrancar el servidor**, si tu tipo no declara `validarConfig`, `totalEsperado` o `verboAuditoria`, **el proceso no arranca** y dice qué falta. Es deliberado: es preferible un error ruidoso en el despliegue a que un niño pierda su XP al terminar una actividad.
2. **Al publicar**, si `totalEsperado` no puede derivarse de la configuración, la actividad no se publica.

## 7. Aparece automáticamente en Gestión de juegos

Sin trabajo adicional, el nuevo tipo:

- se lista en **Gestión de juegos** con su nombre, descripción, emoji y nº de actividades;
- muestra sus chips de integración (Reproductor · Editor · IA · Banco/Reutilización · Evaluación) derivados del registro;
- admite los tres estados: `activo`, `solo jugar`, `deshabilitado`;
- respeta las guardias de backend en **todas** las vías de creación: crear, duplicar, publicar borrador, generar/sorpresa/adaptar con IA;
- aparece en el selector "Crear actividad" del docente, en la Biblioteca, en la vista previa y en el Libro de Calificaciones.

---

## Evidencia de extensibilidad

Medición **real** de la incorporación de **Verdadero o Falso** como séptimo juego (2026-07-19). No es una estimación: son los archivos efectivamente tocados.

| Métrica | Resultado |
|---|---|
| Nuevo juego validado | **Verdadero o Falso** (`verdadero-falso`) |
| Archivos **nuevos propios** del juego | **4** — `server/lib/juegos/tipos/verdadero-falso.js`, `src/components/juegos/registro/verdaderoFalso.jsx`, `src/components/juegos/VerdaderoFalso.jsx`, `src/components/juegos/verdaderoFalso.css` |
| Archivos existentes modificados **exclusivamente para registrarlo** | **2** — `server/lib/juegos/registro.js` y `src/components/juegos/registro/index.js` |
| Líneas de registro | **4** (2 imports + 2 entradas de array) |
| Modificaciones de **infraestructura genérica** durante la incorporación | **0** — el contrato existente cubrió todas las necesidades del juego nuevo |
| **Módulos centrales con lógica específica** del tipo | **0** |
| **Modificaciones internas en los seis juegos existentes** | **0** |
| Nuevos `if`, `switch` o comparaciones por tipo | **0** |

**Comprobación objetiva:** una búsqueda de `verdadero-falso` / `esVerdadera` en todo `src/`, `server/` y `database/` devuelve **únicamente** los archivos propios del juego y los dos índices de registro. Ni `totalEsperado`, ni los validadores, ni el editor genérico, ni la vista previa, ni la Biblioteca, ni las rutas de retos, progreso, IA o banco, ni el panel de administración contienen una sola referencia a este tipo.

**Regresión:** los seis juegos anteriores conservan exactamente su denominador de evaluación, sus validadores, sus verbos de auditoría y sus rangos de IA (verificado automáticamente, incluidos los casos especiales del Memorama —base normalizada 100— y de la Línea del tiempo —métrica de Kendall—).

**Conclusión:** agregar un juego nuevo consiste en implementarlo y registrarlo. No exige modificar la lógica de los juegos existentes ni introducir condiciones específicas en módulos centrales.

// Registro central de tipos de juego — FRONTEND (SPEC-017, Fase 2).
//
// AÑADIR UN JUEGO NUEVO = crear su archivo aquí y añadirlo a la lista de
// abajo. Ver docs/COMO-AGREGAR-UN-JUEGO.md.
//
// Espejo del registro del servidor (server/lib/juegos/registro.js): comparten
// los identificadores `tipo`, y una prueba automática comprueba que no
// divergen (SPEC-017 §4.3-ter).
//
// Fuente única para: etiqueta/emoji/descripción, reproductor, resumen con
// datos reales, condición de "jugable" y vista de lectura de la Biblioteca.
import quiz from './quiz';
import mision from './mision';
import clasificador from './clasificador';
import memorama from './memorama';
import lineaTiempo from './lineaTiempo';
import completar from './completar';
import verdaderoFalso from './verdaderoFalso';

const TIPOS = [quiz, mision, clasificador, memorama, lineaTiempo, completar, verdaderoFalso];

export const JUEGOS = Object.fromEntries(TIPOS.map((d) => [d.tipo, d]));

export const TIPOS_VALIDOS = TIPOS.map((d) => d.tipo);

// Tipos ofrecidos en el selector "Crear actividad" del docente, en su orden.
// Un juego nuevo aparece aquí solo con declarar su `tarjetaCrear`.
export const TIPOS_CREABLES = TIPOS
    .filter((d) => d.tarjetaCrear)
    .sort((a, b) => (a.tarjetaCrear.orden ?? 99) - (b.tarjetaCrear.orden ?? 99));

export const obtenerJuego = (tipo) => JUEGOS[tipo] ?? null;

// Metadatos de todos los tipos (antes: TIPOS_ACTIVIDAD).
export const TIPOS_ACTIVIDAD = Object.fromEntries(
    TIPOS.map((d) => [d.tipo, { etiqueta: d.etiqueta, emoji: d.emoji, descripcion: d.descripcion }])
);

export const etiquetaTipo = (tipo) => JUEGOS[tipo]?.etiqueta || tipo;
export const emojiTipo = (tipo) => JUEGOS[tipo]?.emoji || '🎯';

// Juegos que se listan y despachan en la pestaña "Juegos" del estudiante
// (quiz y misión tienen sus propias pestañas/reproductores).
export const JUEGOS_UI = Object.fromEntries(
    TIPOS.filter((d) => d.enPestanaJuegos).map((d) => [d.tipo, d])
);

// ¿La configuración trae contenido jugable? Cada tipo responde por sí mismo,
// en vez del `switch` anterior. Un tipo desconocido devuelve false.
export const tieneContenido = (reto) =>
    Boolean(JUEGOS[reto?.tipo]?.jugable?.(reto?.configuracion));

// Compatibilidad EXACTA con el `switch` original: solo los tipos de la pestaña
// "Juegos" podían ser true (quiz y misión caían en `default: false`). Se
// conserva ese contrato para no alterar el filtrado del panel del estudiante;
// para la pregunta general usa `tieneContenido`.
export const juegoJugable = (reto) =>
    Boolean(JUEGOS_UI[reto?.tipo]) && tieneContenido(reto);

export default JUEGOS;

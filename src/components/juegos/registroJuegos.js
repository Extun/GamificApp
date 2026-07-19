// Compatibilidad (SPEC-017, Fase 2).
//
// El registro de tipos de juego del frontend vive ahora en `registro/`, con un
// archivo por juego (metadatos + reproductor + resumen + vista de lectura).
// Este archivo se conserva para no romper imports existentes.
//
// Código nuevo: importar desde './registro'.
export {
    JUEGOS, JUEGOS_UI, TIPOS_ACTIVIDAD, TIPOS_VALIDOS,
    etiquetaTipo, emojiTipo, obtenerJuego, juegoJugable, tieneContenido,
    default
} from './registro';

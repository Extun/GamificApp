// Compatibilidad (SPEC-017, Fase 1).
//
// Los validadores de `configuracion_json` por tipo viven ahora en el registro
// central de juegos (lib/juegos/tipos/*.js), junto al resto del contrato de
// cada juego. Este archivo se conserva para no romper imports existentes.
//
// Código nuevo: importar desde './juegos/registro.js'.
export { VALIDADORES_CONFIG, VALIDADORES_CONFIG as default } from './juegos/registro.js';

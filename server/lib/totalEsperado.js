// Compatibilidad (SPEC-017, Fase 1).
//
// `totalEsperado` vive ahora en el registro central de juegos, derivado del
// contrato de cada tipo (lib/juegos/tipos/*.js). La lógica y los denominadores
// son EXACTAMENTE los mismos que antes de la migración; solo cambió dónde
// están declarados.
//
// Sigue siendo el cierre de seguridad del payload de progreso (SPEC-015):
// routes/progreso.js lo usa para rechazar intentos falsificados.
//
// Código nuevo: importar desde './juegos/registro.js'.
export { totalEsperado, totalEsperado as default } from './juegos/registro.js';
export { BASE_MEMORAMA } from './juegos/tipos/memorama.js';

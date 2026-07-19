// Compatibilidad (SPEC-016, Fase 2).
//
// La implementación real vive ahora en lib/ia/ y es AGNÓSTICA al proveedor:
// Gemini y OpenAI son intercambiables sin tocar los generadores educativos.
// Este archivo se conserva solo para no romper imports existentes.
//
// Código nuevo: importar desde './ia/index.js'.
//
// `generarConReintentos` queda expuesto por compatibilidad histórica, pero es
// ESPECÍFICO de Gemini (devuelve la respuesta cruda del SDK de Google). Ya no
// lo consume ninguna ruta: /api/ia/asistente usa `generarTexto`, que sí
// funciona con cualquier proveedor.
export { generarJSON, generarTexto, default } from './ia/index.js';
export { generarConReintentos } from './ia/proveedorGemini.js';

// Tipos de esquema propios de GamificApp (SPEC-016, Fase 1).
//
// Sustituyen a `Type` de `@google/genai` para que el registro de actividades
// (lib/actividadesIA.js) y las rutas de IA describan sus esquemas SIN depender
// del SDK de ningún proveedor.
//
// Los valores son EXACTAMENTE los que usa Gemini (mayúsculas: 'STRING',
// 'OBJECT', …), no los de JSON Schema (minúsculas). Eso es deliberado: hace
// que el cambio sea literalmente sin efecto para el proveedor actual. La
// traducción a JSON Schema estándar es responsabilidad de cada adaptador que
// la necesite (ver proveedorOpenAI.js).
export const Tipo = Object.freeze({
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    INTEGER: 'INTEGER',
    BOOLEAN: 'BOOLEAN',
    ARRAY: 'ARRAY',
    OBJECT: 'OBJECT'
});

export default Tipo;

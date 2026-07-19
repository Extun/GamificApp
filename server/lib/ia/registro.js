// Registro de proveedores de IA (SPEC-016, Fase 2).
//
// Añadir un proveedor nuevo (Anthropic u otro) = crear su adaptador con el
// contrato de abajo y registrarlo aquí. Ningún generador educativo cambia.
//
// Contrato del adaptador:
//   id, etiqueta, variableEntorno, modelosSugeridos[]
//   disponible()                         → boolean (¿hay API key en el entorno?)
//   generarJSON({ prompt, schema, modelo }) → objeto ya parseado
//   generarTexto({ prompt, modelo })        → string
//   clasificarError(err)  → 'temporal' | 'credencial' | 'cuota' | 'formato' | 'permanente'
//
// `clasificarError` existe desde ya aunque SPEC-016 NO implemente fallback
// automático entre proveedores: es el punto de extensión que permitirá
// añadirlo después sin tocar los adaptadores (MASTER_PLAN §3 ítem 24).
import proveedorGemini from './proveedorGemini.js';
import proveedorOpenAI from './proveedorOpenAI.js';

export const PROVEEDORES = {
    [proveedorGemini.id]: proveedorGemini,
    [proveedorOpenAI.id]: proveedorOpenAI
};

export const PROVEEDOR_POR_DEFECTO = proveedorGemini.id;

export const obtenerProveedor = (id) => PROVEEDORES[id] ?? null;

// Vista segura para el panel de administración: NUNCA expone la API key, solo
// si está configurada o no (SPEC-016 §5.1).
export const proveedoresPublicos = () =>
    Object.values(PROVEEDORES).map((p) => ({
        id: p.id,
        etiqueta: p.etiqueta,
        variableEntorno: p.variableEntorno,
        modelosSugeridos: p.modelosSugeridos,
        configurado: p.disponible()
    }));

export default PROVEEDORES;

// Tipo de juego: Verdadero o Falso — registro FRONTEND (SPEC-017, Fase 7).
//
// Prueba de extensibilidad: TODO lo que el frontend necesita saber de este
// juego está aquí. No hay ningún `if (tipo === 'verdadero-falso')` en ningún
// módulo central: reproductor, resumen, vista de lectura, tarjeta de creación
// y formulario de edición se declaran en este archivo.
//
// Usa el EDITOR GENÉRICO (GeneradorActividadIA): al declarar su bloque
// `edicion` no hace falta un editor a medida ni tocar `registro/editores.js`.
import { VerdaderoFalso } from '../VerdaderoFalso';

export const verdaderoFalso = {
    tipo: 'verdadero-falso',
    etiqueta: 'Verdadero o Falso',
    emoji: '✅',
    descripcion: 'Decide si cada afirmación es verdadera o falsa.',
    capacidades: { ia: true, banco: true, reutilizar: true, automatico: true },

    tarjetaCrear: {
        titulo: 'Verdadero o Falso',
        descripcion: 'Afirmaciones para juzgar como verdaderas o falsas, con IA',
        orden: 7
    },

    edicion: {
        claveItems: 'afirmaciones',
        nombreItem: { singular: 'afirmación', plural: 'afirmaciones' },
        clasificaPorDificultad: true,
        tituloReutilizar: 'Añadir afirmaciones del banco',
        maxItems: 8,
        cantidades: [3, 4, 5, 6, 8],
        ayudaIA: 'Escribe el tema y la IA crea afirmaciones verdaderas y falsas, con su explicación.',
        itemVacio: () => ({ texto: '', esVerdadera: true, explicacion: '' }),
        firmaItem: (item) => (item?.texto || '').trim().toLowerCase(),
        textoParaIA: (item) => (item?.texto || '').trim(),
        articuloPlural: 'las',

        // `esVerdadera` es booleano: siempre tiene valor, así que basta el texto.
        itemCompleto: (item) => Boolean(item.texto?.trim()),
        resumenItem: (item, i) => (item.texto?.trim()
            ? `${item.esVerdadera ? '✔' : '✘'} ${item.texto.trim()}`
            : `Afirmación ${i + 1} (sin escribir)`),

        FormularioItem: ({ item, indice, onCambiar }) => (
            <>
                <label className="editor-campo">
                    <span>Afirmación</span>
                    <input
                        type="text"
                        className="editor-alt-input"
                        value={item.texto}
                        placeholder="Ej. El Sol es una estrella"
                        onChange={(e) => onCambiar({ texto: e.target.value })}
                    />
                </label>
                <div className="editor-alternativas">
                    <span className="editor-campo-label">
                        ¿Esta afirmación es verdadera o falsa?
                    </span>
                    {[true, false].map((valor) => (
                        <div
                            key={String(valor)}
                            className={`editor-alt-row ${item.esVerdadera === valor ? 'is-correcta' : ''}`}
                        >
                            <label className="editor-alt-radio" title="Marcar como respuesta correcta">
                                <input
                                    type="radio"
                                    name={`esVerdadera-${indice}`}
                                    checked={item.esVerdadera === valor}
                                    onChange={() => onCambiar({ esVerdadera: valor })}
                                    aria-label={`Marcar la afirmación ${indice + 1} como ${valor ? 'verdadera' : 'falsa'}`}
                                />
                                <span className="editor-alt-letra">{valor ? '✔' : '✘'}</span>
                            </label>
                            <span className="editor-alt-input" style={{ display: 'flex', alignItems: 'center' }}>
                                {valor ? 'Verdadera' : 'Falsa'}
                            </span>
                        </div>
                    ))}
                </div>
                <label className="editor-campo">
                    <span>Explicación (se muestra al revisar)</span>
                    <input
                        type="text"
                        className="editor-alt-input"
                        value={item.explicacion || ''}
                        placeholder="Ej. El Sol produce su propia luz, por eso es una estrella"
                        onChange={(e) => onCambiar({ explicacion: e.target.value })}
                    />
                </label>
            </>
        )
    },

    Player: VerdaderoFalso,
    enPestanaJuegos: true,

    resumen: (config) => `${config?.afirmaciones?.length || 0} afirmaciones`,
    jugable: (config) => Boolean(config?.afirmaciones?.length),

    VistaLectura: ({ config }) => (
        <ol className="bib-preview-lista">
            {(config.afirmaciones || []).map((a, i) => (
                <li key={i}>
                    {a.texto}{' '}
                    <span className={a.esVerdadera ? 'is-correcta' : ''}>
                        <strong>{a.esVerdadera ? 'Verdadera' : 'Falsa'}</strong>
                    </span>
                    {a.explicacion && (
                        <>
                            <br />
                            <span className="contenido-sub">{a.explicacion}</span>
                        </>
                    )}
                </li>
            ))}
        </ol>
    )
};

export default verdaderoFalso;

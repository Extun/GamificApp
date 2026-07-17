// Barra de acciones UNIFICADA de los editores de juegos (SPEC-012, Fase 3).
// Los 6 editores muestran el mismo lenguaje: [+ Manual] [+ Del banco]
// [+ Con IA] [Vista previa]. Lo que no aplica a un tipo NO desaparece: se
// deshabilita con un tooltip que explica por qué, para que el docente
// encuentre siempre las mismas opciones en el mismo lugar.
// Cada acción: { id, label, Icon, onClick?, disabled?, title?, opciones? }.
// `opciones` ([{ label, onClick }]) convierte el botón en un menú desplegable
// (p. ej. "¿Cuántas preguntas añadir con IA?").
import { useEffect, useRef, useState } from 'react';
import './barraAccionesEditor.css';

export function BarraAccionesEditor({ acciones = [] }) {
    const [menuAbierto, setMenuAbierto] = useState(null); // id de la acción con menú abierto
    const barraRef = useRef(null);

    // Cierra el menú desplegable al hacer clic fuera de la barra.
    useEffect(() => {
        if (!menuAbierto) return;
        const fuera = (e) => {
            if (barraRef.current && !barraRef.current.contains(e.target)) setMenuAbierto(null);
        };
        document.addEventListener('mousedown', fuera);
        return () => document.removeEventListener('mousedown', fuera);
    }, [menuAbierto]);

    return (
        <div className="barra-acciones-editor" ref={barraRef}>
            {acciones.map(({ id, label, Icon, onClick, disabled, title, opciones }) => (
                <div key={id} className="barra-accion-wrap">
                    <button
                        type="button"
                        className="barra-accion-btn"
                        disabled={disabled}
                        title={title || label}
                        onClick={() => {
                            if (opciones) setMenuAbierto((prev) => (prev === id ? null : id));
                            else onClick?.();
                        }}
                    >
                        {Icon && <Icon sx={{ fontSize: '1.1rem' }} />} {label}
                    </button>
                    {opciones && menuAbierto === id && !disabled && (
                        <div className="barra-accion-menu" role="menu">
                            {opciones.map((op, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    className="barra-accion-opcion"
                                    onClick={() => { setMenuAbierto(null); op.onClick(); }}
                                >
                                    {op.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

export default BarraAccionesEditor;

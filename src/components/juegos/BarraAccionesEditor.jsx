// Barra de acciones UNIFICADA de los editores de juegos (SPEC-012 Fase 3 +
// SPEC-013 Fase 2). El docente piensa en ACCIONES, no en módulos: un único
// botón "➕ Agregar…" abre un menú con las formas de agregar contenido que
// aplican a ese tipo de juego (lo que no aplica NO aparece), y el resto de
// acciones (p. ej. Vista previa) siguen como botones sueltos.
//
// `agregar`: { label, pregunta?, disabled?, opciones: [{ id, emoji, titulo,
//   detalle?, onClick?, disabled?, sub? }] }.
//   - `sub` ({ pregunta, opciones: [{ label, onClick }] }) convierte la entrada
//     en un segundo paso dentro del mismo menú (p. ej. "¿Cuántas preguntas?").
// `acciones`: [{ id, label, Icon, onClick?, disabled?, title?, opciones? }]
//   (API de SPEC-012, sin cambios — `opciones` la vuelve menú desplegable).
import { useEffect, useRef, useState } from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import './barraAccionesEditor.css';

export function BarraAccionesEditor({ agregar, acciones = [] }) {
    const [menuAbierto, setMenuAbierto] = useState(null); // 'agregar' o id de acción con menú
    const [subAbierto, setSubAbierto] = useState(null);   // id de la opción cuyo segundo paso se muestra
    const barraRef = useRef(null);

    const cerrarTodo = () => { setMenuAbierto(null); setSubAbierto(null); };

    // Cierra los menús al hacer clic fuera de la barra.
    useEffect(() => {
        if (!menuAbierto) return;
        const fuera = (e) => {
            if (barraRef.current && !barraRef.current.contains(e.target)) cerrarTodo();
        };
        document.addEventListener('mousedown', fuera);
        return () => document.removeEventListener('mousedown', fuera);
    }, [menuAbierto]);

    const opcionSub = agregar?.opciones?.find((op) => op.id === subAbierto)?.sub;

    return (
        <div className="barra-acciones-editor" ref={barraRef}>
            {agregar && (
                <div className="barra-accion-wrap">
                    <button
                        type="button"
                        className="barra-accion-btn barra-agregar-btn"
                        disabled={agregar.disabled}
                        onClick={() => {
                            setSubAbierto(null);
                            setMenuAbierto((prev) => (prev === 'agregar' ? null : 'agregar'));
                        }}
                    >
                        <AddRoundedIcon sx={{ fontSize: '1.15rem' }} /> {agregar.label}
                    </button>

                    {menuAbierto === 'agregar' && !agregar.disabled && (
                        <div className="barra-agregar-menu" role="menu">
                            {!opcionSub && (
                                <>
                                    {agregar.pregunta && <p className="barra-agregar-pregunta">{agregar.pregunta}</p>}
                                    {agregar.opciones.map((op) => (
                                        <button
                                            key={op.id}
                                            type="button"
                                            className="barra-agregar-opcion"
                                            disabled={op.disabled}
                                            onClick={() => {
                                                if (op.sub) { setSubAbierto(op.id); return; }
                                                cerrarTodo();
                                                op.onClick?.();
                                            }}
                                        >
                                            <span className="barra-agregar-emoji" aria-hidden="true">{op.emoji}</span>
                                            <span className="barra-agregar-textos">
                                                <strong>{op.titulo}</strong>
                                                {op.detalle && <small>{op.detalle}</small>}
                                            </span>
                                        </button>
                                    ))}
                                </>
                            )}

                            {opcionSub && (
                                <>
                                    <button
                                        type="button"
                                        className="barra-agregar-volver"
                                        onClick={() => setSubAbierto(null)}
                                    >
                                        <ArrowBackRoundedIcon sx={{ fontSize: '1rem' }} /> Volver
                                    </button>
                                    {opcionSub.pregunta && <p className="barra-agregar-pregunta">{opcionSub.pregunta}</p>}
                                    {opcionSub.opciones.map((op, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            className="barra-accion-opcion"
                                            onClick={() => { cerrarTodo(); op.onClick(); }}
                                        >
                                            {op.label}
                                        </button>
                                    ))}
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

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

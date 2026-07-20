// Notificaciones transitorias (SPEC-018 Fase 4). El host se monta UNA vez en
// App.jsx y pinta, apilados sobre --z-toast, los avisos publicados con
// `toast.exito('…')` etc. (ver toastBus.js). Sustituyen a window.alert; NO
// reemplazan errores de formulario, avisos inline persistentes ni el
// feedback educativo de los juegos.
import { useEffect, useState } from 'react';
import { suscribir } from './toastBus';
import './dashboardWidgets.css';

// Errores y avisos duran más: pueden requerir leer con calma.
const DURACION_POR_TIPO = { exito: 4500, info: 5000, aviso: 8000, error: 8000 };
const ICONO_POR_TIPO = { exito: '✅', error: '❌', aviso: '⚠️', info: 'ℹ️' };

function ToastItem({ datos, onCerrar }) {
    // Cierre automático; el temporizador muere con el toast.
    useEffect(() => {
        const ms = datos.duracion ?? DURACION_POR_TIPO[datos.tipo] ?? 5000;
        const temporizador = setTimeout(onCerrar, ms);
        return () => clearTimeout(temporizador);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div
            className={`toast toast-${datos.tipo}`}
            // Los errores interrumpen (assertive); el resto espera turno (polite).
            role={datos.tipo === 'error' ? 'alert' : 'status'}
        >
            <span className="toast-icono" aria-hidden="true">{ICONO_POR_TIPO[datos.tipo]}</span>
            <p className="toast-texto">{datos.mensaje}</p>
            <button type="button" className="toast-cerrar" aria-label="Cerrar aviso" onClick={onCerrar}>✕</button>
        </div>
    );
}

export function ToastHost() {
    const [toasts, setToasts] = useState([]);

    useEffect(() => suscribir((nuevo) => setToasts((lista) => [
        // Anti-duplicado: si el mismo mensaje del mismo tipo sigue visible
        // (acción disparada dos veces), se reemplaza y su tiempo se reinicia.
        ...lista.filter((t) => !(t.tipo === nuevo.tipo && t.mensaje === nuevo.mensaje)),
        nuevo
    ])), []);

    if (toasts.length === 0) return null;
    return (
        <div className="toast-host">
            {toasts.map((t) => (
                <ToastItem
                    key={t.id}
                    datos={t}
                    onCerrar={() => setToasts((lista) => lista.filter((x) => x.id !== t.id))}
                />
            ))}
        </div>
    );
}

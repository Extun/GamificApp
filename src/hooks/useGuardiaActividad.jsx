// Guardia reutilizable contra abandonar una actividad en curso (piloto: Quiz;
// pensado para los 6 juegos). Contrato mínimo:
//   const { marcar, proteger, dialogo } = useGuardiaActividad();
//   · `marcar(bool)`  — el reproductor informa si hay un intento con progreso
//     real sin terminar (lo pasa el contenedor como `onEstadoIntento`).
//   · `proteger(fn)`  — envuelve cualquier navegación que desmontaría el
//     reproductor: si hay intento en curso muestra la confirmación amigable;
//     si no, ejecuta `fn` directo.
//   · `dialogo`       — elemento a renderizar (null si no hay confirmación).
// Además activa `beforeunload` SOLO mientras hay un intento iniciado y sin
// terminar (mensaje nativo del navegador, sin personalizar).
// No hay autoguardado: confirmar la salida descarta el progreso local.
import { useCallback, useEffect, useRef, useState } from 'react';
import '../components/juegos/resultadoActividad.css';

function DialogoSalida({ onSeguir, onSalir }) {
    const dialogoRef = useRef(null);

    // Mismo patrón de foco que el overlay de resultado: foco al abrir,
    // restauración al cerrar, Escape = quedarse (la opción segura).
    useEffect(() => {
        const previo = document.activeElement;
        dialogoRef.current?.focus();
        return () => {
            if (previo instanceof HTMLElement && previo.isConnected && !previo.disabled) {
                previo.focus();
            }
        };
    }, []);
    useEffect(() => {
        const onTecla = (e) => {
            if (e.key === 'Escape') onSeguir();
        };
        window.addEventListener('keydown', onTecla);
        return () => window.removeEventListener('keydown', onTecla);
    }, [onSeguir]);

    return (
        <div
            className="resultado-overlay"
            onClick={(e) => { if (e.target === e.currentTarget) onSeguir(); }}
        >
            <div
                ref={dialogoRef}
                className="resultado-dialogo"
                role="dialog"
                aria-modal="true"
                aria-label="¿Quieres salir del juego?"
                tabIndex={-1}
            >
                <span className="salida-emoji" aria-hidden="true">🤔</span>
                <p className="resultado-titulo">¿Quieres salir del juego?</p>
                <p className="salida-texto">
                    Todavía no terminas. Si sales ahora, lo que llevas en este intento no se guardará.
                </p>
                <div className="resultado-acciones">
                    <button type="button" className="resultado-btn" onClick={onSeguir}>
                        ¡Seguir jugando!
                    </button>
                    <button type="button" className="resultado-btn resultado-btn-ghost" onClick={onSalir}>
                        Salir sin terminar
                    </button>
                </div>
            </div>
        </div>
    );
}

// Lado "reproductor" del contrato: informa al contenedor si hay un intento
// con progreso real sin terminar, y lo apaga al desmontar. `onEstadoIntento`
// puede ser undefined (vista previa, juego embebido): entonces no hace nada.
export function useReporteIntento(onEstadoIntento, enProgreso) {
    const ref = useRef(onEstadoIntento);
    ref.current = onEstadoIntento;
    useEffect(() => {
        ref.current?.(enProgreso);
    }, [enProgreso]);
    useEffect(() => () => ref.current?.(false), []);
}

export function useGuardiaActividad() {
    const [enCurso, setEnCurso] = useState(false);
    // Ref espejo: `proteger` mantiene identidad estable y aun así lee el
    // estado vigente al momento del clic.
    const enCursoRef = useRef(false);
    // Navegación retenida a la espera de confirmación (null = sin diálogo).
    const [pendiente, setPendiente] = useState(null);

    const marcar = useCallback((valor) => {
        enCursoRef.current = valor;
        setEnCurso(valor);
    }, []);

    const proteger = useCallback((accion) => (...args) => {
        if (enCursoRef.current) setPendiente(() => () => accion(...args));
        else accion(...args);
    }, []);

    // Cierre/recarga de pestaña: solo con un intento realmente iniciado.
    useEffect(() => {
        if (!enCurso) return undefined;
        const alertar = (e) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', alertar);
        return () => window.removeEventListener('beforeunload', alertar);
    }, [enCurso]);

    const dialogo = pendiente ? (
        <DialogoSalida
            onSeguir={() => setPendiente(null)}
            onSalir={() => {
                // Salida confirmada: se descarta el intento y se navega.
                marcar(false);
                setPendiente(null);
                pendiente();
            }}
        />
    ) : null;

    return { enCurso, marcar, proteger, dialogo };
}

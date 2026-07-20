// Confirmación reutilizable (SPEC-018 Fase 4): sustituye a window.confirm
// conservando su semántica exacta — al confirmar, el diálogo se cierra y
// DESPUÉS corre la misma acción que antes iba dentro del `if (confirm)`.
// Se apoya en el ModalPanel accesible de Fase 3 (foco, trap, Escape = cancelar,
// restauración de foco, scroll-lock, ARIA). El azúcar para consumidores vive
// en `src/hooks/useConfirmacion.jsx`.
import { useRef } from 'react';
import { ModalPanel } from './DashboardWidgets';

const AVATAR_VARIANTE = {
    danger: '🗑️',
    warning: '⚠️',
    neutral: '❓'
};

const CLASE_CONFIRMAR = {
    danger: 'confirm-accion-danger',
    warning: 'confirm-accion-warning',
    neutral: 'preview-action-primary'
};

export function ConfirmDialog({
    titulo,
    mensaje,
    detalle,
    confirmarTexto = 'Confirmar',
    cancelarTexto = 'Cancelar',
    variante = 'neutral',
    procesando = false,
    onConfirmar,
    onCancelar
}) {
    // Anti doble-confirmación: el primer clic (o Enter) gana aunque React
    // todavía no haya desmontado el diálogo.
    const confirmado = useRef(false);
    const confirmar = () => {
        if (confirmado.current || procesando) return;
        confirmado.current = true;
        onConfirmar();
    };
    // Mientras la acción procesa, el diálogo no se puede cerrar por ninguna
    // vía (Escape, backdrop y ✕ pasan por este mismo onCerrar).
    const cancelar = () => {
        if (procesando || confirmado.current) return;
        onCancelar();
    };

    return (
        <ModalPanel
            className="confirm-dialog"
            titulo={titulo}
            subtitulo={mensaje}
            avatar={(
                <span className={`confirm-avatar confirm-avatar-${variante}`} aria-hidden="true">
                    {AVATAR_VARIANTE[variante] || AVATAR_VARIANTE.neutral}
                </span>
            )}
            onCerrar={cancelar}
            pie={(
                <>
                    <button type="button" className="preview-action" onClick={cancelar} disabled={procesando}>
                        {cancelarTexto}
                    </button>
                    <button
                        type="button"
                        className={`preview-action ${CLASE_CONFIRMAR[variante] || CLASE_CONFIRMAR.neutral}`}
                        onClick={confirmar}
                        disabled={procesando}
                    >
                        {procesando ? 'Un momento…' : confirmarTexto}
                    </button>
                </>
            )}
        >
            {detalle && <p className="confirm-detalle">{detalle}</p>}
        </ModalPanel>
    );
}


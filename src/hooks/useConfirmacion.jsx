// Azúcar para pedir confirmaciones (SPEC-018 Fase 4): mismo patrón que
// useGuardiaActividad — una función que abre y un elemento `dialogo` que el
// componente renderiza donde quiera.
//   const { pedirConfirmacion, dialogoConfirmacion } = useConfirmacion();
//   pedirConfirmacion({ titulo, mensaje, detalle, variante, confirmarTexto, cancelarTexto, accion });
// Semántica idéntica a window.confirm: al confirmar, el diálogo se cierra y
// DESPUÉS corre la misma acción que antes iba dentro del `if (confirm)`.
import { useState } from 'react';
import { ConfirmDialog } from '../components/dashboard/ConfirmDialog';

export function useConfirmacion() {
    const [pedido, setPedido] = useState(null);

    const pedirConfirmacion = (opciones) => setPedido(opciones);

    const dialogoConfirmacion = pedido ? (
        <ConfirmDialog
            titulo={pedido.titulo}
            mensaje={pedido.mensaje}
            detalle={pedido.detalle}
            confirmarTexto={pedido.confirmarTexto}
            cancelarTexto={pedido.cancelarTexto}
            variante={pedido.variante}
            onCancelar={() => setPedido(null)}
            onConfirmar={() => {
                // Igual que window.confirm: primero se cierra, luego corre la acción.
                setPedido(null);
                pedido.accion();
            }}
        />
    ) : null;

    return { pedirConfirmacion, dialogoConfirmacion };
}

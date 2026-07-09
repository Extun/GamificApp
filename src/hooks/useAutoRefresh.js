// Polling ligero (SPEC-002): re-ejecuta `cargar` cada `ms` mientras la vista
// está montada y la pestaña visible. `pausado` lo detiene (p. ej. con un
// modal abierto) para no pisar lo que el usuario está editando. Toda la
// sincronización pasa por aquí: migrar a WebSockets después no toca las vistas.
import { useEffect, useRef } from 'react';

export function useAutoRefresh(cargar, ms = 20000, pausado = false) {
    const cargarRef = useRef(cargar);
    useEffect(() => {
        cargarRef.current = cargar;
    }, [cargar]);

    useEffect(() => {
        if (pausado) return undefined;
        const id = setInterval(() => {
            if (!document.hidden) cargarRef.current();
        }, ms);
        return () => clearInterval(id);
    }, [ms, pausado]);
}

export default useAutoRefresh;

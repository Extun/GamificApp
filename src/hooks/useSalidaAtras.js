// Guardia del botón Atrás del navegador para una actividad abierta
// (SPEC-021 P0-2, versión mitigada; la solución completa —sub-rutas reales—
// es SPEC-001 y no entra en este sprint).
//
// El problema: toda la navegación interna del panel vive en `useState` sobre
// una sola ruta (`/dashboard`), así que Atrás no sube un nivel: sale de la
// aplicación, desmonta el reproductor y pierde el intento en silencio.
// `useGuardiaActividad` ya protege la navegación interna y el cierre de
// pestaña (`beforeunload`), pero NO intercepta `popstate`.
//
// La técnica: mientras hay una actividad abierta se mantiene una entrada
// "centinela" en el historial. Atrás consume esa entrada en vez de salir de
// `/dashboard`; al recibir `popstate` se repone el centinela y la salida se
// enruta por LA MISMA guardia que ya protege los botones internos, así que el
// niño ve exactamente la misma confirmación que ya conoce.
//
// `popstate` no se puede cancelar (el navegador ya ha navegado cuando llega),
// y por eso hace falta el centinela: es lo que da margen para preguntar.
//
// Contrato:
//   useSalidaAtras(hayActividadAbierta, alIntentarSalir)
//     · hayActividadAbierta — booleano; pone y quita el centinela.
//     · alIntentarSalir     — qué hacer cuando el usuario pulsa Atrás. Se
//       espera la acción de cierre YA envuelta en `proteger`.
import { useEffect, useRef } from 'react';

const CENTINELA = { gamificappNivel: 'actividad' };

export function useSalidaAtras(hayActividadAbierta, alIntentarSalir) {
    // Espejos en ref: el listener se registra UNA vez y aun así lee siempre
    // el valor vigente, sin resuscribirse en cada render (`alIntentarSalir`
    // llega envuelto en `proteger`, así que cambia de identidad cada vez).
    // La copia va en un efecto, no en el cuerpo: escribir una ref durante el
    // render es justo lo que prohíbe `react-hooks/refs`.
    const abiertaRef = useRef(hayActividadAbierta);
    const salirRef = useRef(alIntentarSalir);
    useEffect(() => {
        abiertaRef.current = hayActividadAbierta;
        salirRef.current = alIntentarSalir;
    });

    // ¿Hay un centinela NUESTRO en el historial?
    const centinelaRef = useRef(false);
    // El próximo `popstate` lo provocamos nosotros al retirar el centinela:
    // hay que dejarlo pasar sin volver a preguntar.
    const propioRef = useRef(false);

    useEffect(() => {
        if (hayActividadAbierta && !centinelaRef.current) {
            centinelaRef.current = true;
            window.history.pushState(CENTINELA, '');
        } else if (!hayActividadAbierta && centinelaRef.current) {
            // La actividad se cerró por la vía normal (botón interno, fin del
            // juego, confirmación de salida): el centinela ya no hace falta y
            // se retira para no dejar basura en el historial.
            centinelaRef.current = false;
            propioRef.current = true;
            window.history.back();
        }
    }, [hayActividadAbierta]);

    useEffect(() => {
        const alVolver = () => {
            if (propioRef.current) {
                propioRef.current = false;
                return;
            }
            if (!abiertaRef.current) return;
            // El centinela se acaba de consumir. Se repone de inmediato para
            // seguir dentro de /dashboard mientras se pregunta; si el usuario
            // confirma la salida, el efecto de arriba lo retirará.
            window.history.pushState(CENTINELA, '');
            salirRef.current?.();
        };
        window.addEventListener('popstate', alVolver);
        return () => window.removeEventListener('popstate', alVolver);
    }, []);

    // A propósito no se retira el centinela al desmontar: cerrar sesión
    // navega a "/" en el mismo instante, y un `history.back()` compitiendo
    // con esa navegación deja el historial en un estado impredecible. Una
    // entrada de más es inofensiva; una carrera contra la navegación no.
}

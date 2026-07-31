// Guardia del botón Atrás del navegador para la navegación interna de los
// paneles (SPEC-021 P0-2, generalizado a los tres roles).
//
// EL PROBLEMA. La aplicación tiene tres rutas planas (`/`, `/registro`,
// `/dashboard`) y toda la navegación de dentro del panel vive en `useState`.
// Para el navegador, abrir una materia, entrar en una actividad o cambiar de
// sección no ocurre: el historial sigue teniendo una sola entrada. Así que
// Atrás no sube un nivel, SALE de `/dashboard`. Y salir tiene dos caras malas:
//   · con sesión abierta, `/` redirige de vuelta a `/dashboard`, pero por el
//     camino desmonta el panel entero y lo devuelve al Inicio: el docente
//     pierde el formulario que estaba llenando y el niño su actividad;
//   · si el navegador resuelve esa navegación contra el servidor (recarga,
//     restaurar pestaña, enlace directo), hace falta además que el hosting
//     sepa servir la ruta — de ahí `vercel.json`. Sin él, 404.
//
// LA TÉCNICA. Por cada nivel de profundidad abierto se mantiene una entrada
// "centinela" en el historial. Atrás consume un centinela en vez de salir de
// `/dashboard`; al recibir `popstate` se repone de inmediato (para conservar
// el margen) y se cierra el nivel más interno. Cerrar un nivel reduce la
// profundidad, y el efecto retira el centinela sobrante.
//
// `popstate` no se puede cancelar —cuando llega, el navegador ya navegó—, y
// por eso hace falta el centinela: es lo que da margen para reaccionar.
//
// CONTRATO
//   useCapasAtras([
//     { activo: pagina !== '',              cerrar: () => setPagina('') },
//     { activo: Boolean(materiaAbierta),    cerrar: volver },
//     { activo: Boolean(actividadAbierta),  cerrar: proteger(cerrarActividad) },
//   ]);
//
//   · El array va SIEMPRE del nivel más externo al más interno; los inactivos
//     se ignoran, así que no hace falta que sean estrictamente anidados.
//   · `cerrar` puede no cerrar nada (p. ej. envuelto en `proteger`, que abre
//     una confirmación): entonces la profundidad no baja, el centinela se
//     queda puesto y el usuario permanece donde estaba. Es justo lo que se
//     quiere mientras decide.
import { useEffect, useRef } from 'react';

const CENTINELA = { gamificappNivel: true };

export function useCapasAtras(niveles) {
    // Espejo en ref: el listener se registra UNA vez y aun así lee siempre la
    // lista vigente, sin resuscribirse en cada render (los `cerrar` cambian de
    // identidad en cada render cuando vienen envueltos en `proteger`).
    // La copia va en un efecto, no en el cuerpo: escribir una ref durante el
    // render es justo lo que prohíbe `react-hooks/refs`.
    const nivelesRef = useRef(niveles);
    useEffect(() => {
        nivelesRef.current = niveles;
    });

    const profundidad = niveles.reduce((n, nivel) => n + (nivel?.activo ? 1 : 0), 0);

    // Cuántos centinelas NUESTROS hay ahora mismo en el historial.
    const centinelasRef = useRef(0);
    // Cuántos `popstate` de los que vienen los provocamos nosotros al retirar
    // centinelas. Es un contador y no un booleano porque dos retiradas
    // seguidas (cerrar dos niveles casi a la vez) encadenan dos eventos.
    const propiosRef = useRef(0);

    useEffect(() => {
        const puestos = centinelasRef.current;
        if (profundidad > puestos) {
            for (let i = puestos; i < profundidad; i += 1) {
                window.history.pushState(CENTINELA, '');
            }
            centinelasRef.current = profundidad;
        } else if (profundidad < puestos) {
            // El nivel se cerró por la vía normal (botón interno, fin del
            // juego, confirmación de salida): los centinelas que sobran se
            // retiran para no dejar basura en el historial.
            const sobran = puestos - profundidad;
            centinelasRef.current = profundidad;
            propiosRef.current += 1;
            window.history.go(-sobran);
        }
    }, [profundidad]);

    useEffect(() => {
        const alVolver = () => {
            if (propiosRef.current > 0) {
                propiosRef.current -= 1;
                return;
            }
            if (centinelasRef.current === 0) return;
            // Se acaba de consumir un centinela. Se repone en el acto para
            // seguir dentro de /dashboard mientras se cierra el nivel; si de
            // verdad se cierra, el efecto de arriba lo retirará.
            window.history.pushState(CENTINELA, '');
            const activos = nivelesRef.current.filter((nivel) => nivel?.activo);
            activos[activos.length - 1]?.cerrar?.();
        };
        window.addEventListener('popstate', alVolver);
        return () => window.removeEventListener('popstate', alVolver);
    }, []);

    // A propósito no se retiran los centinelas al desmontar: cerrar sesión
    // navega a "/" en el mismo instante, y un `history.go()` compitiendo con
    // esa navegación deja el historial en un estado impredecible. Alguna
    // entrada de más es inofensiva; una carrera contra la navegación no.
}

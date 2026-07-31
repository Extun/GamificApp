// Foco tras responder en los reproductores de juegos (SPEC-021 P1-5).
//
// EL PROBLEMA. Los siete juegos deshabilitan el control recién pulsado
// (`disabled={respondida}`, `disabled={superado}`, `disabled={emparejadas…}`,
// las flechas de la Línea del tiempo en los extremos). Cuando un elemento
// ENFOCADO pasa a `disabled`, el navegador lo desenfoca y el foco cae a
// `<body>`: el siguiente Tab reempieza desde el principio del documento, así
// que para llegar al botón «Siguiente» —que está a dos pasos visuales— hay que
// recorrer el panel entero, en cada ítem de cada juego.
//
// LA SOLUCIÓN. Este hook devuelve una ref para el bloque de confirmación.
// Cuando aparece, y SOLO si el foco se perdió de verdad (está en `<body>`), lo
// lleva ahí: el lector de pantalla anuncia la confirmación y «Siguiente» queda
// a un Tab. Se enfoca el contenedor y no el botón, para que un Enter repetido
// no salte de pregunta sin querer.
//
// `preventScroll`: la posición la deciden los juegos (el Quiz ya hace su
// propio desplazamiento); el foco no debe competir con eso.
//
// Cero cambios de mecánica y cero cambios visuales: `:focus-visible` solo
// dibuja el anillo cuando se navega con teclado.
import { useEffect, useRef } from 'react';

export function useFocoConfirmacion(activo) {
    const ref = useRef(null);
    useEffect(() => {
        if (!activo) return;
        const el = ref.current;
        if (!el) return;
        if (document.activeElement === document.body || document.activeElement === null) {
            el.focus({ preventScroll: true });
        }
    }, [activo]);
    return ref;
}

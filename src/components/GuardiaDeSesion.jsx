// Guardia de sesión (SPEC-024). Se monta UNA vez, dentro del Router, al lado
// del <ToastHost/>.
//
// EL PROBLEMA QUE RESUELVE. El token dura un rato (8 h por defecto) y el
// cliente lo guardaba para siempre. Cuando caducaba, `authFetch` borraba la
// sesión en silencio: React no se enteraba, el panel seguía montado y la
// persona se quedaba mirando un panel vacío que ya no podía cargar nada, con
// un botón «Reintentar» que no podía funcionar. Nadie le decía qué pasó.
//
// QUÉ HACE. Dos cosas, en este orden de importancia:
//
//   1. EXPLICA Y DEVUELVE AL ACCESO. Cuando la sesión cae —por 401, por
//      caducidad detectada aquí, o porque otra pestaña cerró sesión— avisa con
//      un toast y navega a «/». Con UNA excepción: si hay una actividad en
//      curso, el aviso se muestra igual pero la navegación ESPERA a que el
//      niño la cierre. Sacar a un niño de 6-9 años de su juego de golpe es
//      peor que el fallo que estamos arreglando.
//
//   2. RENUEVA MIENTRAS SE USA. Poco antes de caducar, y solo si la aplicación
//      se está usando de verdad (pestaña visible + interacción desde la última
//      renovación), pide un token nuevo. Así una jornada escolar entera no se
//      corta a mitad de clase. Sin uso NO se renueva: una tablet compartida
//      olvidada abierta toda la noche caduca como debe.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../services/authService';
import { suscribirSesion, suscribirActividad, hayActividadEnCurso } from '../services/sesionBus';
import { toast } from './dashboard/toastBus';

// Cuánto antes de caducar se intenta renovar. Diez minutos dan margen de sobra
// para una red escolar lenta y para un reintento si el primero falla.
const MARGEN_RENOVACION_MS = 10 * 60 * 1000;
// Los temporizadores de `setTimeout` no son fiables con esperas larguísimas
// (y una pestaña dormida los retrasa igualmente): se despierta al menos cada
// dos minutos y se decide con la hora real, no con la del temporizador.
const REVISION_MAXIMA_MS = 2 * 60 * 1000;

const MENSAJE_POR_MOTIVO = {
    expirada: 'Tu sesión terminó por seguridad. Vuelve a entrar.',
    // Dispositivo compartido: pasó de verdad en el aula. Decir «por seguridad»
    // aquí confundiría — no se cayó nada, la cerraron en la otra pestaña.
    'otra-pestana': 'Se cerró la sesión en otra pestaña. Vuelve a entrar.'
};

export function GuardiaDeSesion() {
    const navigate = useNavigate();
    // Sesión caída con una actividad en curso: el aviso ya salió, la vuelta al
    // login queda pendiente hasta que el niño cierre la actividad.
    const [vueltaPendiente, setVueltaPendiente] = useState(false);
    // ¿Hubo interacción real desde la última renovación? Sin esto, la sesión
    // se renovaría sola para siempre en una pestaña olvidada.
    const usoRealRef = useRef(false);

    // ---- 1. La sesión cayó: explicar y volver al acceso ----
    useEffect(() => {
        return suscribirSesion((motivo) => {
            toast.aviso(MENSAJE_POR_MOTIVO[motivo] || MENSAJE_POR_MOTIVO.expirada);
            if (hayActividadEnCurso()) setVueltaPendiente(true);
            else navigate('/', { replace: true });
        });
    }, [navigate]);

    // La actividad terminó y había una vuelta pendiente: ahora sí.
    useEffect(() => {
        if (!vueltaPendiente) return undefined;
        // Pudo cerrarse entre el aviso y este efecto: se comprueba primero.
        if (!hayActividadEnCurso()) {
            navigate('/', { replace: true });
            return undefined;
        }
        return suscribirActividad((enCurso) => {
            if (!enCurso) navigate('/', { replace: true });
        });
    }, [vueltaPendiente, navigate]);

    // ---- 2. Vigilancia y renovación ----
    useEffect(() => {
        let temporizador = null;
        let renovando = false;
        let vivo = true;

        const anotarUso = () => { usoRealRef.current = true; };

        // Cuánto le queda a la sesión, o null si no hay ninguna que vigilar.
        const restanteDeSesion = () =>
            (authService.getToken() ? authService.msParaCaducar() : null);

        // Se reprograma SIEMPRE, incluso sin sesión: la aplicación arranca en
        // el Login y es ahí donde se inicia sesión. Si el guardia se apagara
        // por no haber token, no volvería a encenderse tras entrar y no habría
        // ni renovación ni aviso de caducidad — justo el caso normal.
        const programar = () => {
            const queda = restanteDeSesion();
            // Sin sesión: latido barato. Con sesión: despertar al entrar en el
            // margen de renovación y, ya dentro, JUSTO al caducar (o cada
            // REVISION_MAXIMA_MS, para reintentar la renovación si falló).
            const proxima = queda === null
                ? REVISION_MAXIMA_MS
                : (queda > MARGEN_RENOVACION_MS ? queda - MARGEN_RENOVACION_MS : queda);
            clearTimeout(temporizador);
            temporizador = setTimeout(revisar, Math.min(Math.max(proxima, 1000), REVISION_MAXIMA_MS));
        };

        // Decide qué toca AHORA y se vuelve a programar. Una sola función para
        // que el temporizador, el foco y el cambio de pestaña compartan
        // exactamente el mismo criterio.
        const revisar = async () => {
            if (!vivo) return;
            const restante = restanteDeSesion();

            if (restante !== null && restante <= 0) {
                // Caducó sin que ninguna petición lo descubriera: es el caso
                // de la pestaña que estuvo horas en segundo plano.
                authService.declararSesionCaida('expirada');
            } else if (restante !== null && restante <= MARGEN_RENOVACION_MS && !renovando) {
                // Renovar solo con uso real: pestaña visible Y alguna
                // interacción desde la última renovación.
                if (document.visibilityState === 'visible' && usoRealRef.current) {
                    renovando = true;
                    const ok = await authService.renovarSesion();
                    renovando = false;
                    if (ok) usoRealRef.current = false;
                }
            }

            if (!vivo) return;
            programar();
        };

        // Otra pestaña cerró sesión (o entró otra persona): esta se entera.
        // En dispositivos compartidos de la escuela pasa de verdad.
        const alCambiarAlmacen = (e) => {
            if (e.key !== 'auth_token') return;
            if (!e.newValue && !authService.getToken()) {
                authService.declararSesionCaida('otra-pestana');
            }
        };

        window.addEventListener('pointerdown', anotarUso, { passive: true });
        window.addEventListener('keydown', anotarUso);
        window.addEventListener('focus', revisar);
        document.addEventListener('visibilitychange', revisar);
        window.addEventListener('storage', alCambiarAlmacen);
        revisar();

        return () => {
            vivo = false;
            clearTimeout(temporizador);
            window.removeEventListener('pointerdown', anotarUso);
            window.removeEventListener('keydown', anotarUso);
            window.removeEventListener('focus', revisar);
            document.removeEventListener('visibilitychange', revisar);
            window.removeEventListener('storage', alCambiarAlmacen);
        };
    }, []);

    return null;
}

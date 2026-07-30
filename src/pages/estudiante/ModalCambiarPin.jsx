import { useState } from 'react';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { ModalPanel } from '../../components/dashboard/DashboardWidgets';
import { toast } from '../../components/dashboard/toastBus';
import authService from '../../services/authService';

// Cambio de PIN del estudiante (RC 1.0).
//
// Sustituye a DOS `window.prompt` encadenados, que eran el único diálogo nativo
// que quedaba en el camino del niño después de que SPEC-018 Fase 4 migrara los
// otros 18. Los prompts no tenían etiqueta persistente, ni validación previa,
// ni campo de confirmación: si el niño teclaba mal el PIN nuevo, lo cambiaba a
// algo que no sabía.
//
// AUTENTICACIÓN SIN TOCAR: llama al MISMO `authService.cambiarPin(actual,
// nuevo)`, al mismo endpoint `PUT /api/auth/cambiar-pin` y con los mismos dos
// parámetros. Lo único que cambia es la piel; el servidor sigue siendo el que
// valida y el que manda.
//
// Se apoya en `ModalPanel`, que ya trae foco inicial, focus-trap, Escape,
// restauración de foco y scroll-lock (SPEC-018 Fase 3).

// Mismo filtro que el login: 6 caracteres alfanuméricos, sin acentos ni signos.
const limpiar = (valor) => valor.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6);
const LARGO_PIN = 6;

export function ModalCambiarPin({ onCerrar }) {
    const [actual, setActual] = useState('');
    const [nuevo, setNuevo] = useState('');
    const [repetir, setRepetir] = useState('');
    const [ver, setVer] = useState(false);
    const [error, setError] = useState('');
    const [guardando, setGuardando] = useState(false);

    const completos = [actual, nuevo, repetir].every((p) => p.length === LARGO_PIN);
    const coinciden = nuevo === repetir;
    // El aviso de "no coinciden" aparece mientras escribe la repetición, no al
    // enviar: así el niño lo corrige antes de equivocarse del todo.
    const avisoRepetir = repetir.length === LARGO_PIN && !coinciden;

    const guardar = async (e) => {
        e.preventDefault();
        if (guardando) return;
        if (!completos) {
            setError('Tu PIN son 6 letras o números. Completa los tres.');
            return;
        }
        if (!coinciden) {
            setError('Los dos PIN nuevos no son iguales. Escríbelos otra vez.');
            return;
        }
        setError('');
        setGuardando(true);
        try {
            const data = await authService.cambiarPin(actual, nuevo);
            toast.exito(data.mensaje || '¡Listo! Tu PIN nuevo ya funciona.');
            onCerrar();
        } catch (err) {
            setError(err.message || 'No pudimos cambiar tu PIN. Vuelve a intentarlo.');
            setGuardando(false);
        }
    };

    // El ojo revela los tres campos a la vez: para un niño de 6-9 años un solo
    // control es más fácil que tres, y comprobar lo que teclea es justo lo que
    // los prompts nativos no le dejaban hacer.
    const tipo = ver ? 'text' : 'password';

    // Sin placeholder de puntos: con TRES campos, un "••••••" de relleno hace
    // que los vacíos parezcan ya escritos (comprobado en el navegador). El
    // contador "0 de 6" sí informa, y avanza mientras el niño teclea.
    const campo = (etiqueta, valor, alCambiar, pista) => (
        <label className="quiz-field pin-campo">
            <span>{etiqueta}</span>
            <input
                type={tipo}
                inputMode="text"
                autoComplete="off"
                value={valor}
                aria-describedby={pista ? `${pista.id}` : undefined}
                onChange={(e) => { alCambiar(limpiar(e.target.value)); setError(''); }}
            />
            {pista
                ? <small id={pista.id} className="pin-aviso">{pista.texto}</small>
                : <small className="pin-contador">{valor.length} de {LARGO_PIN}</small>}
        </label>
    );

    return (
        <ModalPanel
            className="pin-modal"
            titulo="Cambiar mi PIN"
            subtitulo="Tu PIN son 6 letras o números. No se lo cuentes a nadie."
            avatar={<span className="pin-avatar" aria-hidden="true">🔒</span>}
            onCerrar={guardando ? undefined : onCerrar}
            pie={(
                <>
                    <button
                        type="button"
                        className="preview-action"
                        onClick={onCerrar}
                        disabled={guardando}
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        form="form-cambiar-pin"
                        className="preview-action preview-action-primary"
                        disabled={guardando || !completos || !coinciden}
                    >
                        {guardando ? 'Un momento…' : 'Guardar mi PIN nuevo'}
                    </button>
                </>
            )}
        >
            <form id="form-cambiar-pin" onSubmit={guardar}>
                {/* Los errores de formulario van dentro del modal, no en un
                    toast: el niño tiene que verlos junto al campo que corregir
                    (el propio Toast.jsx documenta que no reemplaza esto). */}
                {error && <p className="pin-error" role="alert">{error}</p>}

                {campo('Tu PIN de ahora', actual, setActual)}
                {campo('Tu PIN nuevo', nuevo, setNuevo)}
                {campo(
                    'Escribe otra vez tu PIN nuevo',
                    repetir,
                    setRepetir,
                    avisoRepetir ? { id: 'pin-no-coincide', texto: 'Los dos PIN nuevos no son iguales.' } : null
                )}

                <button type="button" className="pin-ojo" onClick={() => setVer((v) => !v)}>
                    {ver ? <VisibilityOff /> : <Visibility />}
                    {ver ? 'Ocultar mis PIN' : 'Ver lo que escribo'}
                </button>
            </form>
        </ModalPanel>
    );
}

import { useState } from 'react';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import PublishRoundedIcon from '@mui/icons-material/PublishRounded';
import { publicarReto } from '../../services/retosService';
import { authFetch } from '../../services/authService';
import MATERIAS from '../../constants/materias';
import '../../components/mision/misionNarrativa.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Temáticas de aventura predefinidas: el docente elige una y la IA ambienta
// toda la historia en ese mundo.
const TEMATICAS = [
    { id: 'espacio', label: '🚀 Viaje espacial' },
    { id: 'piratas', label: '🏴‍☠️ Piratas y tesoros' },
    { id: 'cocina', label: '🍰 Cocina mágica' },
    { id: 'selva', label: '🦜 Expedición en la selva' },
    { id: 'castillo', label: '🏰 Castillo encantado' },
    { id: 'oceano', label: '🐠 Fondo del océano' }
];

// Panel del docente para crear Misiones Narrativas con IA: elige el tema
// matemático y la ambientación, revisa la historia generada y la publica
// como reto tipo 'mision' (tabla `retos`, misma vía que quiz/clasificador).
export function GeneradorMision({ materia = 'la materia' }) {
    const [tema, setTema] = useState('');
    const [tematica, setTematica] = useState(TEMATICAS[0].id);
    const [mision, setMision] = useState(null);       // borrador generado
    const [publicada, setPublicada] = useState(false);
    const [cargando, setCargando] = useState(false);
    const [publicando, setPublicando] = useState(false);
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState('');

    const handleGenerar = async (e) => {
        e.preventDefault();
        if (!tema.trim() || cargando) return;
        setCargando(true);
        setError('');
        setAviso('');
        setMision(null);
        setPublicada(false);
        try {
            const res = await authFetch(`${API_URL}/api/ia/mision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    materia,
                    tema: tema.trim(),
                    tematica: TEMATICAS.find((t) => t.id === tematica)?.label.replace(/^\S+\s/, '') || tematica
                })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
            setMision(data.mision);
        } catch (err) {
            console.error('Error al generar la misión:', err);
            setError(`No se pudo generar la misión. ${err.message || 'Verifica tu conexión.'}`);
        } finally {
            setCargando(false);
        }
    };

    // Publica en la BD (tabla `retos`, tipo 'mision'): visible al instante
    // para los estudiantes en la pestaña Misiones de la materia.
    const handlePublicar = async () => {
        const materiaId = MATERIAS.find((m) => m.nombre === materia)?.id;
        if (!materiaId) {
            setError('No se reconoce la materia actual; no se puede publicar.');
            return;
        }
        setPublicando(true);
        setError('');
        try {
            await publicarReto({
                materiaId,
                titulo: mision.titulo,
                tipo: 'mision',
                configuracion: mision,
                xpRecompensa: mision.desafios.length * 100,
                descripcion: `Aventura de ${tema.trim()}`
            });
            setPublicada(true);
            setAviso('¡Misión publicada! Ya es visible para los estudiantes.');
            setTimeout(() => setAviso(''), 4000);
        } catch (err) {
            setError(`No se pudo publicar la misión: ${err.message}`);
        } finally {
            setPublicando(false);
        }
    };

    return (
        <section className="card materia-subvista">
            <div className="card-head">
                <h3>Misiones Narrativas con IA</h3>
                <span className="card-tag">{materia}</span>
            </div>

            <form className="quiz-form" onSubmit={handleGenerar}>
                <label className="quiz-field">
                    <span>Tema matemático</span>
                    <input
                        type="text"
                        value={tema}
                        onChange={(e) => setTema(e.target.value)}
                        placeholder="Ej. Sumas con llevadas hasta 100"
                    />
                </label>

                <label className="quiz-field">
                    <span>Temática de la aventura</span>
                    <select value={tematica} onChange={(e) => setTematica(e.target.value)}>
                        {TEMATICAS.map((t) => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                    </select>
                </label>

                <button type="submit" className="quiz-generar-btn" disabled={cargando || !tema.trim()}>
                    {cargando
                        ? <span className="quiz-spinner" aria-hidden="true" />
                        : <AutoAwesomeRoundedIcon sx={{ fontSize: '1.1rem' }} />}
                    {cargando ? 'Creando aventura…' : 'Generar Misión con IA'}
                </button>
            </form>

            {error && <p className="quiz-error">{error}</p>}
            {aviso && <p className="quiz-aviso">{aviso}</p>}

            {mision && (
                <div className="mision-preview">
                    <div className="mision-preview-head">
                        <RocketLaunchRoundedIcon className="mision-preview-icono" />
                        <div>
                            <h4>{mision.titulo}</h4>
                            <span className="quiz-historial-meta">
                                {mision.desafios.length} desafíos · {mision.desafios.length * 100} XP
                            </span>
                        </div>
                    </div>

                    <p className="mision-preview-parrafo">{mision.introduccion}</p>

                    <ol className="mision-preview-lista">
                        {mision.desafios.map((d, i) => (
                            <li key={i} className="mision-preview-desafio">
                                <p className="mision-preview-narrativa">{d.narrativa}</p>
                                <p className="mision-preview-pregunta">{d.pregunta}</p>
                                <ul className="mision-preview-alts">
                                    {['A', 'B', 'C'].map((letra) => (
                                        <li key={letra} className={letra === d.correcta ? 'is-correcta' : ''}>
                                            <strong>{letra}.</strong> {d.alternativas[letra]}
                                            {letra === d.correcta && <CheckCircleRoundedIcon sx={{ fontSize: '0.95rem' }} />}
                                        </li>
                                    ))}
                                </ul>
                            </li>
                        ))}
                    </ol>

                    <p className="mision-preview-parrafo">{mision.final}</p>

                    <button
                        type="button"
                        className="quiz-generar-btn"
                        onClick={handlePublicar}
                        disabled={publicando || publicada}
                    >
                        {publicada
                            ? <><CheckCircleRoundedIcon sx={{ fontSize: '1.1rem' }} /> Publicada</>
                            : <><PublishRoundedIcon sx={{ fontSize: '1.1rem' }} /> {publicando ? 'Publicando…' : 'Publicar misión para estudiantes'}</>}
                    </button>
                </div>
            )}
        </section>
    );
}

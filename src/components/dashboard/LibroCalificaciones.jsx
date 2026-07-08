// Libro de Calificaciones (RF05) — tabla de solo lectura con el progreso
// REAL de los estudiantes del docente en la materia abierta. Combina dos
// endpoints que ya existen: GET /api/docente/mis-estudiantes y
// GET /api/progreso/:id. Sin datos no muestra nada inventado: EmptyState.
import { useEffect, useState } from 'react';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { authFetch } from '../../services/authService';
import { misEstudiantes } from '../../services/docenteService';
import { EmptyState, formatearFecha } from './DashboardWidgets';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function LibroCalificaciones({ materia }) {
    const [filas, setFilas] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let activo = true;
        (async () => {
            setCargando(true);
            setError('');
            try {
                const estudiantes = await misEstudiantes();
                // Se consulta el progreso de cada estudiante con authFetch
                // directo (no gamificationService.obtenerProgreso) para no
                // pisar la caché local de XP del navegador del docente.
                const porEstudiante = await Promise.all(
                    (estudiantes || []).map(async (est) => {
                        const res = await authFetch(`${API_URL}/api/progreso/${est.estudiante_id}`);
                        if (!res.ok) return [];
                        const data = await res.json();
                        return (data?.progreso || [])
                            .filter((p) => p.materia === materia)
                            .map((p) => ({ ...p, estudiante: est.nombre_completo }));
                    })
                );
                if (activo) setFilas(porEstudiante.flat());
            } catch (err) {
                console.warn('No se pudo cargar el libro de calificaciones:', err.message);
                if (activo) setError('No se pudo cargar la información. Revisa tu conexión e inténtalo de nuevo.');
            } finally {
                if (activo) setCargando(false);
            }
        })();
        return () => { activo = false; };
    }, [materia]);

    if (cargando) return <p className="libro-estado">Cargando calificaciones…</p>;
    if (error) return <p className="libro-estado" role="alert">{error}</p>;

    if (!filas.length) {
        return (
            <EmptyState
                Icon={MenuBookIcon}
                titulo="Aún no hay actividades completadas"
                mensaje={`Cuando tus estudiantes completen retos de ${materia}, sus resultados aparecerán aquí.`}
            />
        );
    }

    return (
        <div className="tabla-scroll">
            <table className="admin-tabla">
                <thead>
                    <tr>
                        <th>Estudiante</th>
                        <th>Actividad</th>
                        <th>Estado</th>
                        <th>XP obtenida</th>
                        <th>Fecha</th>
                    </tr>
                </thead>
                <tbody>
                    {filas.map((f) => (
                        <tr key={`${f.reto_id}-${f.estudiante}`}>
                            <td>{f.estudiante}</td>
                            <td>{f.reto}</td>
                            <td>{f.completado ? 'Completado' : `En progreso (${f.porcentaje}%)`}</td>
                            <td>{f.xp_obtenido} XP</td>
                            <td>{formatearFecha(f.actualizado_en)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default LibroCalificaciones;

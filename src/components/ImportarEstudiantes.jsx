import { useRef, useState } from 'react';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { ModalPanel } from './dashboard/DashboardWidgets';
import estudiantesService from '../services/estudiantesService';
import './importarEstudiantes.css';

// SPEC-014 — Asistente de carga masiva de estudiantes por Excel.
// Tres pasos: (1) elegir curso + plantilla + subir archivo, (2) vista previa
// del análisis del SERVIDOR (aquí no se crea nada), (3) confirmación con
// resumen y descarga de credenciales (única vez que los códigos se ven).
// Lo usan el panel del admin y el del docente; `cursos` llega ya filtrado
// según lo que cada rol puede tocar.
export function ImportarEstudiantes({ cursos, onCerrar, onImportado }) {
    const [paso, setPaso] = useState('archivo');          // archivo | analisis | hecho
    const [cursoId, setCursoId] = useState(cursos.length === 1 ? String(cursos[0].id) : '');
    const [nombreArchivo, setNombreArchivo] = useState('');
    const [filas, setFilas] = useState([]);
    const [informe, setInforme] = useState(null);         // respuesta de /analizar
    const [resultado, setResultado] = useState(null);     // respuesta de /confirmar
    const [error, setError] = useState('');
    const [cargando, setCargando] = useState(false);
    const inputRef = useRef(null);

    const etiquetaCurso = cursos.find((c) => String(c.id) === cursoId)?.etiqueta || '';

    // ---- Paso 1: plantilla y lectura del archivo (SheetJS, en el navegador) ----

    // Import dinámico: xlsx pesa; solo se carga si alguien abre este asistente.
    const cargarXLSX = () => import('xlsx');

    const descargarPlantilla = async () => {
        const XLSX = await cargarXLSX();
        const hoja = XLSX.utils.aoa_to_sheet([
            ['nombres', 'apellidos', 'fecha_nacimiento'],
            ['Ana María', 'Pérez López', '2017-03-15']
        ]);
        hoja['!cols'] = [{ wch: 24 }, { wch: 24 }, { wch: 18 }];
        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, hoja, 'Estudiantes');
        XLSX.writeFile(libro, `plantilla-estudiantes${etiquetaCurso ? `-${etiquetaCurso.replace(/\s+/g, '-')}` : ''}.xlsx`);
    };

    // Encuentra la columna de cada dato aunque la cabecera tenga mayúsculas,
    // tildes o variantes ("Fecha de nacimiento").
    const mapearCabeceras = (cabeceras) => {
        const norm = cabeceras.map((c) =>
            String(c || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, ''));
        const buscar = (...claves) => norm.findIndex((c) => claves.some((k) => c.includes(k)));
        return {
            nombres: buscar('nombre'),
            apellidos: buscar('apellido'),
            fecha: buscar('fecha', 'nacimiento')
        };
    };

    const leerArchivo = async (archivo) => {
        setError('');
        setInforme(null);
        try {
            const XLSX = await cargarXLSX();
            const datos = await archivo.arrayBuffer();
            const libro = XLSX.read(datos);
            const hoja = libro.Sheets[libro.SheetNames[0]];
            if (!hoja) throw new Error('El archivo no tiene ninguna hoja.');
            // raw: true → las fechas llegan como número de serie de Excel, que
            // el servidor entiende (evita formatos regionales ambiguos).
            const matriz = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: '' });
            if (!matriz.length) throw new Error('El archivo está vacío.');

            const col = mapearCabeceras(matriz[0]);
            if (col.nombres < 0 || col.apellidos < 0 || col.fecha < 0) {
                throw new Error('No se reconocen las columnas. Usa la plantilla: nombres, apellidos, fecha_nacimiento.');
            }
            const filasLeidas = matriz.slice(1)
                .map((f, i) => ({
                    fila: i + 2, // nº real en el Excel (la fila 1 es la cabecera)
                    nombres: String(f[col.nombres] ?? '').trim(),
                    apellidos: String(f[col.apellidos] ?? '').trim(),
                    fecha_nacimiento: f[col.fecha] ?? ''
                }))
                // Filas totalmente vacías (típicas al final de la hoja) se ignoran.
                .filter((f) => f.nombres || f.apellidos || String(f.fecha_nacimiento).trim());
            if (!filasLeidas.length) throw new Error('El archivo no tiene filas de estudiantes.');
            setFilas(filasLeidas);
            setNombreArchivo(archivo.name);
        } catch (err) {
            setFilas([]);
            setNombreArchivo('');
            setError(err.message || 'No se pudo leer el archivo.');
        }
    };

    // ---- Paso 2: análisis en el servidor (no crea nada) ----
    const analizar = async () => {
        setError('');
        setCargando(true);
        try {
            const data = await estudiantesService.analizarImportacion(Number(cursoId), filas);
            setInforme(data);
            setPaso('analisis');
        } catch (err) {
            setError(err.message);
        } finally {
            setCargando(false);
        }
    };

    // ---- Paso 3: confirmación (transaccional en el servidor) ----
    const confirmar = async () => {
        setError('');
        setCargando(true);
        try {
            const data = await estudiantesService.confirmarImportacion(Number(cursoId), filas);
            setResultado(data);
            setPaso('hecho');
            onImportado?.();
        } catch (err) {
            setError(err.message);
        } finally {
            setCargando(false);
        }
    };

    const descargarCredenciales = async () => {
        const XLSX = await cargarXLSX();
        const hoja = XLSX.utils.aoa_to_sheet([
            ['Estudiante', 'Curso', 'Código de activación', 'PIN inicial', 'Código de emergencia'],
            ...resultado.creados.map((c) => [c.nombre, c.curso, c.codigo_activacion, c.pin_inicial, c.codigo_emergencia])
        ]);
        hoja['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 20 }];
        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, hoja, 'Credenciales');
        XLSX.writeFile(libro, `credenciales-${etiquetaCurso.replace(/\s+/g, '-')}.xlsx`);
    };

    const ESTADO = {
        valido: { clase: 'imp-ok', texto: 'Válido' },
        omitido: { clase: 'imp-omitido', texto: 'Ya registrado' },
        error: { clase: 'imp-error', texto: 'Error' }
    };

    return (
        <ModalPanel
            titulo="Importar estudiantes desde Excel"
            subtitulo={etiquetaCurso ? `Curso: ${etiquetaCurso}` : 'Elige un curso para empezar'}
            avatar={<span className="imp-avatar" aria-hidden="true"><UploadFileRoundedIcon /></span>}
            onCerrar={onCerrar}
            className="imp-modal"
            pie={
                paso === 'archivo' ? (
                    <>
                        <button type="button" className="imp-btn-sec" onClick={onCerrar}>Cancelar</button>
                        <button
                            type="button"
                            className="imp-btn-pri"
                            disabled={!cursoId || !filas.length || cargando}
                            onClick={analizar}
                        >
                            {cargando ? 'Analizando…' : `Analizar ${filas.length || ''} fila${filas.length === 1 ? '' : 's'}`}
                        </button>
                    </>
                ) : paso === 'analisis' ? (
                    <>
                        <button type="button" className="imp-btn-sec" onClick={() => { setPaso('archivo'); setInforme(null); }}>
                            Volver
                        </button>
                        <button
                            type="button"
                            className="imp-btn-pri"
                            disabled={!informe?.validos || cargando}
                            onClick={confirmar}
                        >
                            {cargando ? 'Importando…' : `Importar ${informe?.validos || 0} estudiante${informe?.validos === 1 ? '' : 's'}`}
                        </button>
                    </>
                ) : (
                    <>
                        <button type="button" className="imp-btn-sec" onClick={onCerrar}>Cerrar</button>
                        <button type="button" className="imp-btn-pri" onClick={descargarCredenciales}>
                            <DownloadRoundedIcon sx={{ fontSize: '1.1rem' }} /> Descargar credenciales
                        </button>
                    </>
                )
            }
        >
            {error && (
                <div className="imp-aviso imp-aviso-error" role="alert">
                    <ErrorOutlineRoundedIcon /> <span>{error}</span>
                </div>
            )}

            {paso === 'archivo' && (
                <div className="imp-paso">
                    <label className="imp-campo">
                        <span>1. Curso al que se importarán los estudiantes</span>
                        <select value={cursoId} onChange={(e) => setCursoId(e.target.value)}>
                            <option value="">Elige el curso…</option>
                            {cursos.map((c) => (
                                <option key={c.id} value={c.id}>{c.etiqueta}</option>
                            ))}
                        </select>
                    </label>

                    <div className="imp-campo">
                        <span>2. Llena la plantilla (una fila por estudiante)</span>
                        <button type="button" className="imp-btn-sec imp-btn-plantilla" onClick={descargarPlantilla}>
                            <DownloadRoundedIcon sx={{ fontSize: '1.1rem' }} /> Descargar plantilla .xlsx
                        </button>
                    </div>

                    <div className="imp-campo">
                        <span>3. Sube el archivo completado</span>
                        <button
                            type="button"
                            className={`imp-dropzone ${nombreArchivo ? 'is-cargado' : ''}`}
                            onClick={() => inputRef.current?.click()}
                        >
                            <UploadFileRoundedIcon />
                            {nombreArchivo
                                ? <span><strong>{nombreArchivo}</strong> · {filas.length} fila{filas.length === 1 ? '' : 's'} leída{filas.length === 1 ? '' : 's'}</span>
                                : <span>Toca para elegir el archivo .xlsx</span>}
                        </button>
                        <input
                            ref={inputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            hidden
                            onChange={(e) => { if (e.target.files?.[0]) leerArchivo(e.target.files[0]); e.target.value = ''; }}
                        />
                    </div>

                    <p className="imp-nota">
                        <InfoOutlinedIcon sx={{ fontSize: '1rem' }} /> Aquí no se crea nadie todavía:
                        primero verás una vista previa con los problemas encontrados.
                    </p>
                </div>
            )}

            {paso === 'analisis' && informe && (
                <div className="imp-paso">
                    <div className="imp-resumen" role="status">
                        <span className="imp-cifra">Encontrados: <strong>{informe.total}</strong></span>
                        <span className="imp-cifra imp-ok">Válidos: <strong>{informe.validos}</strong></span>
                        <span className="imp-cifra imp-omitido">Ya registrados: <strong>{informe.omitidos}</strong></span>
                        <span className="imp-cifra imp-error">Con errores: <strong>{informe.errores}</strong></span>
                    </div>

                    <div className="imp-tabla-scroll">
                        <table className="admin-tabla">
                            <thead>
                                <tr><th>Fila</th><th>Estudiante</th><th>Estado</th><th>Problema</th></tr>
                            </thead>
                            <tbody>
                                {informe.resultados.map((r) => (
                                    <tr key={r.fila} className={r.estado !== 'valido' ? `fila-${r.estado}` : undefined}>
                                        <td>{r.fila}</td>
                                        <td>{r.nombres} {r.apellidos}</td>
                                        <td><span className={`imp-badge ${ESTADO[r.estado].clase}`}>{ESTADO[r.estado].texto}</span></td>
                                        <td className="imp-motivo">{r.motivo || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {informe.errores > 0 && (
                        <p className="imp-nota">
                            <InfoOutlinedIcon sx={{ fontSize: '1rem' }} /> Las filas con error NO se
                            importarán. Puedes corregir el Excel y volver a subirlo, o importar
                            solo las válidas.
                        </p>
                    )}
                </div>
            )}

            {paso === 'hecho' && resultado && (
                <div className="imp-paso">
                    <div className="imp-exito" role="status">
                        <TaskAltRoundedIcon />
                        <div>
                            <h4>{resultado.creados.length} estudiante{resultado.creados.length === 1 ? '' : 's'} importado{resultado.creados.length === 1 ? '' : 's'} a {resultado.curso}</h4>
                            <p>{resultado.aviso}</p>
                        </div>
                    </div>

                    <div className="imp-tabla-scroll">
                        <table className="admin-tabla">
                            <thead>
                                <tr><th>Estudiante</th><th>Código de activación</th><th>PIN inicial</th></tr>
                            </thead>
                            <tbody>
                                {resultado.creados.map((c) => (
                                    <tr key={c.usuario_id}>
                                        <td>{c.nombre}</td>
                                        <td><code>{c.codigo_activacion}</code></td>
                                        <td><code>{c.pin_inicial}</code></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className="imp-nota imp-nota-importante">
                        <ErrorOutlineRoundedIcon sx={{ fontSize: '1rem' }} /> Estos códigos no se
                        pueden volver a ver. Descarga el archivo de credenciales antes de cerrar.
                    </p>
                </div>
            )}
        </ModalPanel>
    );
}

export default ImportarEstudiantes;

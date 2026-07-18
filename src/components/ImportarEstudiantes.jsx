import { useMemo, useRef, useState } from 'react';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { ModalPanel } from './dashboard/DashboardWidgets';
import estudiantesService from '../services/estudiantesService';
import './importarEstudiantes.css';

// SPEC-014 — Asistente de carga masiva de estudiantes por Excel.
// Pasos: (1) elegir curso + subir archivo (plantilla oficial u otro formato
// institucional) + MAPEO de columnas, (2) vista previa del análisis del
// SERVIDOR (aquí no se crea nada), (3) confirmación con resumen y descarga
// de credenciales (única vez que los códigos se ven).
//
// El mapeo es 100% en el cliente: el archivo puede traer las columnas en
// cualquier orden y con cualquier nombre; aquí se detectan, el usuario las
// corrige si hace falta, y al backend siempre llegan filas ya normalizadas
// ({ fila, nombres, apellidos, fecha_nacimiento }) — la API no cambia.

// ---- Destinos de mapeo ----
const DESTINOS = [
    { id: 'nombres', etiqueta: 'Nombres' },
    { id: 'apellidos', etiqueta: 'Apellidos' },
    { id: 'fecha', etiqueta: 'Fecha de nacimiento' },
    { id: 'completo-na', etiqueta: 'Nombre completo (Nombres Apellidos)' },
    { id: 'completo-an', etiqueta: 'Nombre completo (Apellidos Nombres)' },
    { id: 'ignorar', etiqueta: 'Ignorar' }
];

const normalizarCabecera = (texto) =>
    String(texto || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

// Detección automática del destino de UNA cabecera. El orden importa:
// "apellidos y nombres" contiene «apellido», así que el nombre completo se
// evalúa primero.
const detectarDestino = (cabecera) => {
    const c = normalizarCabecera(cabecera);
    if (!c) return 'ignorar';
    const tieneNombre = c.includes('nombre');
    const tieneApellido = c.includes('apellido');
    if ((tieneNombre && tieneApellido) || c.includes('completo')) {
        // "Apellidos y nombres" → el apellido va primero en cada celda.
        return c.indexOf('apellido') !== -1 && (!tieneNombre || c.indexOf('apellido') < c.indexOf('nombre'))
            ? 'completo-an' : 'completo-na';
    }
    if (/estudiante|alumn/.test(c) && !/n[uú]mero|codigo|id/.test(c)) return 'completo-na';
    if (tieneApellido) return 'apellidos';
    if (tieneNombre) return 'nombres';
    if (/nacim|f\.?\s*nac|fecha|cumple/.test(c)) return 'fecha';
    return 'ignorar';
};

// Mapeo inicial de todas las cabeceras: primer match gana; si dos columnas
// caen en el mismo destino, la segunda queda en Ignorar (el usuario decide).
const mapeoAutomatico = (cabeceras) => {
    const usados = new Set();
    return cabeceras.map((cab) => {
        let destino = detectarDestino(cab);
        // Un solo "nombre completo" o una sola fecha, etc. Ignorar se repite.
        const claveUnica = destino.startsWith('completo') ? 'completo' : destino;
        if (destino !== 'ignorar' && usados.has(claveUnica)) destino = 'ignorar';
        else usados.add(claveUnica);
        return destino;
    });
};

// "Ana María Pérez López" → { nombres, apellidos } con la misma heurística
// del registro por invitación (mitad y mitad). `apellidosPrimero` invierte
// el resultado para listas tipo "Pérez López Ana María".
const partirNombreCompleto = (celda, apellidosPrimero) => {
    // Con coma explícita el formato es inequívoco: "Apellidos, Nombres"
    // (convención de las listas escolares); el orden elegido no aplica.
    const conComa = String(celda || '').split(',');
    if (conComa.length === 2 && conComa[0].trim() && conComa[1].trim()) {
        return {
            nombres: conComa[1].trim().replace(/\s+/g, ' '),
            apellidos: conComa[0].trim().replace(/\s+/g, ' ')
        };
    }
    const partes = String(celda || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
    const mitad = Math.ceil(partes.length / 2);
    const a = partes.slice(0, mitad).join(' ');
    const b = partes.slice(mitad).join(' ');
    return apellidosPrimero ? { nombres: b, apellidos: a } : { nombres: a, apellidos: b };
};

// ¿El mapeo permite importar? Necesita fecha + (nombres y apellidos, o un
// nombre completo). Devuelve null si está bien o el texto del problema.
const validarMapeo = (mapeo) => {
    const cuenta = (id) => mapeo.filter((d) => d === id).length;
    const completos = cuenta('completo-na') + cuenta('completo-an');
    if (cuenta('fecha') > 1) return 'Solo una columna puede ser la fecha de nacimiento.';
    if (cuenta('fecha') === 0) return 'Falta indicar cuál columna es la fecha de nacimiento.';
    if (cuenta('nombres') > 1 || cuenta('apellidos') > 1) return 'Hay columnas repetidas: revisa que Nombres y Apellidos se usen una sola vez.';
    if (completos > 1) return 'Solo una columna puede ser el nombre completo.';
    if (completos === 1) {
        if (cuenta('nombres') || cuenta('apellidos')) {
            return 'Si usas "Nombre completo", las columnas de nombres/apellidos deben quedar en Ignorar.';
        }
        return null;
    }
    if (cuenta('nombres') !== 1 || cuenta('apellidos') !== 1) {
        return 'Falta indicar las columnas de nombres y apellidos (o una de nombre completo).';
    }
    return null;
};

export function ImportarEstudiantes({ cursos, onCerrar, onImportado }) {
    const [paso, setPaso] = useState('archivo');          // archivo | analisis | hecho
    const [cursoId, setCursoId] = useState(cursos.length === 1 ? String(cursos[0].id) : '');
    const [nombreArchivo, setNombreArchivo] = useState('');
    // Contenido crudo del Excel: cabeceras + cuerpo, tal como vienen.
    const [cabeceras, setCabeceras] = useState([]);
    const [cuerpo, setCuerpo] = useState([]);
    // mapeo[i] = destino de la columna i ('nombres' | ... | 'ignorar').
    const [mapeo, setMapeo] = useState([]);
    const [informe, setInforme] = useState(null);         // respuesta de /analizar
    const [resultado, setResultado] = useState(null);     // respuesta de /confirmar
    const [error, setError] = useState('');
    const [cargando, setCargando] = useState(false);
    const inputRef = useRef(null);

    const etiquetaCurso = cursos.find((c) => String(c.id) === cursoId)?.etiqueta || '';
    const problemaMapeo = cabeceras.length ? validarMapeo(mapeo) : null;
    const usaNombreCompleto = mapeo.some((d) => d.startsWith('completo'));

    // Filas normalizadas según el mapeo vigente: es LO ÚNICO que viaja al
    // backend (el formato que la API ya espera; la API no cambió).
    const filas = useMemo(() => {
        if (!cuerpo.length || problemaMapeo) return [];
        const col = (id) => mapeo.findIndex((d) => d === id);
        const iNombres = col('nombres');
        const iApellidos = col('apellidos');
        const iFecha = col('fecha');
        const iCompleto = mapeo.findIndex((d) => d.startsWith('completo'));
        const apellidosPrimero = mapeo[iCompleto] === 'completo-an';

        return cuerpo
            .map((f, i) => {
                let nombres, apellidos;
                if (iCompleto >= 0) {
                    ({ nombres, apellidos } = partirNombreCompleto(f[iCompleto], apellidosPrimero));
                } else {
                    nombres = String(f[iNombres] ?? '').trim();
                    apellidos = String(f[iApellidos] ?? '').trim();
                }
                return { fila: i + 2, nombres, apellidos, fecha_nacimiento: f[iFecha] ?? '' };
            })
            // Filas totalmente vacías (típicas al final de la hoja) se ignoran.
            .filter((f) => f.nombres || f.apellidos || String(f.fecha_nacimiento).trim());
    }, [cuerpo, mapeo, problemaMapeo]);

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
            if (matriz.length < 2) throw new Error('El archivo no tiene filas de estudiantes.');
            const cabs = matriz[0].map((c) => String(c ?? '').trim());
            if (!cabs.some(Boolean)) throw new Error('La primera fila debe tener los títulos de las columnas.');
            setCabeceras(cabs);
            setCuerpo(matriz.slice(1));
            setMapeo(mapeoAutomatico(cabs));
            setNombreArchivo(archivo.name);
        } catch (err) {
            setCabeceras([]);
            setCuerpo([]);
            setMapeo([]);
            setNombreArchivo('');
            setError(err.message || 'No se pudo leer el archivo.');
        }
    };

    const cambiarDestino = (indice, destino) =>
        setMapeo((prev) => prev.map((d, i) => (i === indice ? destino : d)));

    // Muestra de cómo quedan las primeras filas con el mapeo actual: el
    // usuario VE la separación de nombres/apellidos antes de analizar
    // (imprescindible con "Nombre completo": nada se parte en silencio).
    const muestra = filas.slice(0, 3);

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
                            disabled={!cursoId || !filas.length || Boolean(problemaMapeo) || cargando}
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
                        <span>2. Sube tu lista de estudiantes (.xlsx)</span>
                        <button
                            type="button"
                            className={`imp-dropzone ${nombreArchivo ? 'is-cargado' : ''}`}
                            onClick={() => inputRef.current?.click()}
                        >
                            <UploadFileRoundedIcon />
                            {nombreArchivo
                                ? <span><strong>{nombreArchivo}</strong> · {filas.length || cuerpo.length} fila{(filas.length || cuerpo.length) === 1 ? '' : 's'}</span>
                                : <span>Toca para elegir el archivo .xlsx</span>}
                        </button>
                        <input
                            ref={inputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            hidden
                            onChange={(e) => { if (e.target.files?.[0]) leerArchivo(e.target.files[0]); e.target.value = ''; }}
                        />
                        <p className="imp-nota" style={{ marginTop: 4 }}>
                            Sirve cualquier lista con columnas de nombres y fecha de nacimiento.
                            ¿Prefieres empezar de cero?{' '}
                            <button type="button" className="imp-enlace" onClick={descargarPlantilla}>
                                Descarga la plantilla oficial
                            </button>
                        </p>
                    </div>

                    {cabeceras.length > 0 && (
                        <div className="imp-campo">
                            <span>3. Revisa cómo se interpretará cada columna</span>
                            <div className="imp-mapeo">
                                {cabeceras.map((cab, i) => (
                                    <label key={i} className={`imp-mapeo-fila ${mapeo[i] === 'ignorar' ? 'is-ignorada' : ''}`}>
                                        <span className="imp-mapeo-cabecera" title={cab || `Columna ${i + 1}`}>
                                            {cab || <em>Columna {i + 1} (sin título)</em>}
                                        </span>
                                        <span className="imp-mapeo-flecha" aria-hidden="true">→</span>
                                        <select
                                            value={mapeo[i]}
                                            aria-label={`Destino de la columna ${cab || i + 1}`}
                                            onChange={(e) => cambiarDestino(i, e.target.value)}
                                        >
                                            {DESTINOS.map((d) => (
                                                <option key={d.id} value={d.id}>{d.etiqueta}</option>
                                            ))}
                                        </select>
                                    </label>
                                ))}
                            </div>
                            {problemaMapeo && (
                                <p className="imp-nota imp-nota-importante" role="alert">
                                    <ErrorOutlineRoundedIcon sx={{ fontSize: '1rem' }} /> {problemaMapeo}
                                </p>
                            )}
                        </div>
                    )}

                    {muestra.length > 0 && (
                        <div className="imp-campo">
                            <span>Así se leerán las primeras filas{usaNombreCompleto ? ' (revisa la separación de nombres y apellidos)' : ''}:</span>
                            <div className="imp-tabla-scroll imp-muestra">
                                <table className="admin-tabla">
                                    <thead>
                                        <tr><th>Nombres</th><th>Apellidos</th><th>Fecha de nacimiento</th></tr>
                                    </thead>
                                    <tbody>
                                        {muestra.map((f) => (
                                            <tr key={f.fila}>
                                                <td>{f.nombres || <em>—</em>}</td>
                                                <td>{f.apellidos || <em>—</em>}</td>
                                                <td>{String(f.fecha_nacimiento) || <em>—</em>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {usaNombreCompleto && (
                                <p className="imp-nota">
                                    <InfoOutlinedIcon sx={{ fontSize: '1rem' }} /> El nombre completo se
                                    separa automáticamente por la mitad (o por la coma si la hay). En la
                                    vista previa podrás revisar TODAS las filas antes de importar.
                                </p>
                            )}
                        </div>
                    )}

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
                                <tr><th>Fila</th><th>Nombres</th><th>Apellidos</th><th>Estado</th><th>Problema</th></tr>
                            </thead>
                            <tbody>
                                {informe.resultados.map((r) => (
                                    <tr key={r.fila} className={r.estado !== 'valido' ? `fila-${r.estado}` : undefined}>
                                        <td>{r.fila}</td>
                                        <td>{r.nombres}</td>
                                        <td>{r.apellidos}</td>
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

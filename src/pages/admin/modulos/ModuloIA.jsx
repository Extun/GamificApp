// Módulo Inteligencia Artificial del panel admin (SPEC-016, Fase 4).
//
// El administrador elige QUÉ proveedor y QUÉ modelo usa GamificApp para
// generar actividades. NUNCA gestiona secretos: las API keys viven solo en
// variables de entorno del servidor y el backend jamás las devuelve. De cada
// proveedor solo se sabe si está configurado o no.
import { useEffect, useState } from 'react';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningRoundedIcon from '@mui/icons-material/WarningRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import { SectionCard, EmptyState } from '../../../components/dashboard/DashboardWidgets';
import {
    obtenerConfiguracionIA, listarModelosIA, guardarConfiguracionIA, probarConexionIA
} from '../../../services/iaConfigService';
import './moduloIA.css';

const MODELO_AUTO = '';

export default function ModuloIA() {
    const [datos, setDatos] = useState(null);
    const [proveedor, setProveedor] = useState('');
    const [modelo, setModelo] = useState(MODELO_AUTO);
    const [modelos, setModelos] = useState({ lista: [], aviso: null, cargando: true });
    const [guardando, setGuardando] = useState(false);
    const [prueba, setPrueba] = useState(null);
    const [probando, setProbando] = useState(false);
    const [mensaje, setMensaje] = useState(null);
    const [error, setError] = useState(null);

    // Configuración actual + estado de cada proveedor.
    useEffect(() => {
        let vivo = true;
        obtenerConfiguracionIA()
            .then((d) => {
                if (!vivo) return;
                setDatos(d);
                setProveedor(d.proveedor);
                setModelo(d.modelo || MODELO_AUTO);
            })
            .catch((e) => vivo && setError(e.message));
        return () => { vivo = false; };
    }, []);

    // Catálogo de modelos del proveedor seleccionado. Se pide al backend, que
    // lo consulta al proveedor real: no hay lista fija que envejezca.
    // El "cargando" se fija al elegir proveedor (ver `elegirProveedor` y la
    // carga inicial), no dentro del efecto: así no se encadena un render extra.
    useEffect(() => {
        if (!proveedor) return undefined;
        let vivo = true;
        listarModelosIA(proveedor)
            .then((r) => vivo && setModelos({ lista: r.modelos || [], aviso: r.aviso || null, cargando: false }))
            .catch((e) => vivo && setModelos({ lista: [], aviso: e.message, cargando: false }));
        return () => { vivo = false; };
    }, [proveedor]);

    const info = (id) => datos?.proveedores?.find((p) => p.id === id);
    const seleccionado = info(proveedor);
    const configurado = Boolean(seleccionado?.configurado);

    const elegirProveedor = (id) => {
        if (id === proveedor) return;
        setProveedor(id);
        setModelo(MODELO_AUTO);   // el modelo de un proveedor no vale para otro
        setModelos({ lista: [], aviso: null, cargando: true });
        setPrueba(null);
        setMensaje(null);
    };

    // Guardar comprueba la combinación contra el proveedor ANTES de aplicarla:
    // si falla, el servidor la rechaza y la configuración anterior sigue activa.
    const guardar = async () => {
        setGuardando(true); setError(null); setMensaje(null); setPrueba(null);
        try {
            const d = await guardarConfiguracionIA({ proveedor, modelo });
            setDatos(d);
            setModelo(d.modelo || MODELO_AUTO);
            setMensaje(`Listo. GamificApp generará actividades con ${info(d.proveedor)?.etiqueta || d.proveedor}.`);
        } catch (e) {
            setError(`${e.message} La configuración anterior sigue activa.`);
        } finally { setGuardando(false); }
    };

    const probar = async () => {
        setProbando(true); setPrueba(null); setError(null);
        try { setPrueba(await probarConexionIA()); }
        catch (e) { setError(e.message); }
        finally { setProbando(false); }
    };

    if (error && !datos) return <EmptyState titulo="No se pudo cargar la configuración de IA" descripcion={error} />;
    if (!datos) return <EmptyState titulo="Cargando…" descripcion="Consultando la configuración de IA del servidor." />;

    const sinCambios = proveedor === datos.proveedor && (modelo || null) === (datos.modelo || null);

    return (
        <div className="dash-secciones">
            <SectionCard titulo="Proveedor de inteligencia artificial"
                subtitulo="GamificApp puede generar actividades con distintos proveedores. Elige cuál usar; el resto de la aplicación no cambia.">
                <div className="ia-proveedores">
                    {datos.proveedores.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            className={`ia-tarjeta ${proveedor === p.id ? 'is-activa' : ''} ${p.configurado ? '' : 'is-no-configurado'}`}
                            onClick={() => elegirProveedor(p.id)}
                            aria-pressed={proveedor === p.id}
                        >
                            <span className="ia-tarjeta-nombre">{p.etiqueta}</span>
                            {p.configurado ? (
                                <span className="ia-estado is-ok">
                                    <CheckCircleRoundedIcon fontSize="small" /> Clave configurada
                                </span>
                            ) : (
                                <span className="ia-estado is-falta">
                                    <WarningRoundedIcon fontSize="small" /> Falta {p.variableEntorno} en el servidor
                                </span>
                            )}
                            {datos.proveedor === p.id && <span className="ia-badge-activo">En uso</span>}
                        </button>
                    ))}
                </div>

                <p className="ia-nota-seguridad">
                    <LockRoundedIcon fontSize="small" />
                    Las claves de acceso se configuran en el servidor por seguridad. Nunca se guardan en la base
                    de datos ni se muestran aquí.
                </p>
            </SectionCard>

            <SectionCard titulo="Modelo" subtitulo="Déjalo en automático salvo que necesites uno concreto.">
                <label className="ia-campo">
                    <span>Modelo de {seleccionado?.etiqueta || proveedor}</span>
                    <select value={modelo} onChange={(e) => setModelo(e.target.value)} disabled={!configurado || modelos.cargando}>
                        <option value={MODELO_AUTO}>Automático (recomendado)</option>
                        {modelos.lista.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                </label>
                {modelos.cargando && <p className="ia-ayuda">Consultando los modelos disponibles…</p>}
                {modelos.aviso && <p className="ia-ayuda is-aviso">{modelos.aviso}</p>}
                {!modelos.cargando && !modelos.aviso && configurado && (
                    <p className="ia-ayuda">
                        La lista se consulta al proveedor en cada visita: los modelos nuevos aparecen solos.
                        Al guardar se comprueba que la combinación funcione; si no, no se aplica.
                    </p>
                )}

                <div className="ia-acciones">
                    <button type="button" className="preview-action preview-action-primary" onClick={guardar}
                        disabled={!configurado || guardando || sinCambios}>
                        {guardando ? 'Comprobando y guardando…' : 'Guardar configuración'}
                    </button>
                    <button type="button" className="preview-action" onClick={probar} disabled={probando}>
                        <BoltRoundedIcon fontSize="small" /> {probando ? 'Probando…' : 'Probar conexión'}
                    </button>
                </div>

                {mensaje && <p className="ia-resultado is-ok">{mensaje}</p>}
                {error && <p className="ia-resultado is-error">{error}</p>}

                {prueba && (
                    <div className={`ia-resultado-prueba ${prueba.ok ? 'is-ok' : 'is-error'}`} role="status">
                        {prueba.ok ? (
                            <>
                                <CheckCircleRoundedIcon fontSize="small" />
                                <span>
                                    Conexión correcta con <strong>{prueba.proveedor}</strong> ·
                                    modelo <strong>{prueba.modelo}</strong> · {prueba.latenciaMs} ms.
                                    La generación de contenido funciona.
                                </span>
                            </>
                        ) : (
                            <>
                                <WarningRoundedIcon fontSize="small" />
                                <span>{prueba.error}</span>
                            </>
                        )}
                    </div>
                )}
            </SectionCard>
        </div>
    );
}

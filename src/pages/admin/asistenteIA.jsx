import { useState } from 'react'
import { RespuestaIA } from './respuestaIA';
import { authFetch } from '../../services/authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function AsistenteIA() {
    const [message, setMessage] = useState("");
    const [responseIA, setResponseIA] = useState("");
    const [cargando, setCargando] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!message.trim() || cargando) return;
        setCargando(true);
        try {
            const res = await authFetch(`${API_URL}/api/ia/asistente`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mensaje: message })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
            setResponseIA(data.texto);
        } catch (error) {
            console.error("Error:", error);
            setResponseIA(error.message || "Error al obtener la respuesta.");
        } finally {
            setCargando(false);
        }
    }

    return (
        <div>
            <h1>Prompt</h1>
            <form onSubmit={handleSubmit}>
                <label>Escribe tu mensaje:</label>
                <textarea value={message} onChange={(e) => { setMessage(e.target.value) }}></textarea>
                <button type="submit" disabled={cargando}>{cargando ? 'Pensando…' : 'Enviar'}</button>
            </form>
            <RespuestaIA respuesta={responseIA} />
        </div>
    )
}

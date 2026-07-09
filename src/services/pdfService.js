// Procesamiento real de PDF en el navegador con pdfjs-dist.
// Extrae el número de páginas y genera una miniatura (dataURL) de la primera
// página, sin depender de ningún backend. El worker se resuelve vía Vite.
import * as pdfjsLib from 'pdfjs-dist';
// Vite empaqueta el worker como módulo con el sufijo `?worker`. Usar `workerPort`
// con una instancia real evita el fallback a "fake worker" (que en Vite deja el
// render colgado al no poder cargar el .mjs por la ruta `?url`).
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

/**
 * Procesa un PDF y devuelve sus metadatos reales.
 * @param {File} file Archivo PDF cargado por el usuario.
 * @returns {Promise<{ pageCount: number, thumbnail: string|null }>}
 */
export async function procesarPdf(file) {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pageCount = pdf.numPages;

    let thumbnail = null;
    try {
        const page = await pdf.getPage(1);
        // Renderizamos a un ancho de visualización objetivo, pero con un factor de
        // supersampling para ganar nitidez (el bitmap se genera a mayor resolución
        // y el CSS lo reduce → bordes y texto crujientes sin coste excesivo).
        const baseViewport = page.getViewport({ scale: 1 });
        const targetWidth = 600;          // ancho aproximado de presentación en el modal
        const SUPERSAMPLE = 3;            // factor de calidad (render a 3× → nitidez alta)
        const scale = (targetWidth / baseViewport.width) * SUPERSAMPLE;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const context = canvas.getContext('2d');

        await page.render({ canvasContext: context, viewport }).promise;
        // PNG conserva el texto nítido sin artefactos de compresión JPEG.
        thumbnail = canvas.toDataURL('image/png');
    } catch {
        // Si falla el render de la miniatura, conservamos al menos el conteo
        // de páginas (thumbnail queda en null).
    }

    await pdf.destroy();
    return { pageCount, thumbnail };
}

// Decodifica un dataURL base64 a Uint8Array para alimentar a pdf.js.
const dataUrlToBytes = (dataUrl) => {
    const b64 = dataUrl.split(',')[1] || '';
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
};

/**
 * Carga un documento PDF desde su dataURL persistido. Se hace UNA sola vez por
 * archivo; el proxy resultante permite renderizar páginas individuales bajo demanda.
 * @param {string} dataUrl
 * @returns {Promise<import('pdfjs-dist').PDFDocumentProxy>}
 */
export function cargarDocumentoPdf(dataUrl) {
    return pdfjsLib.getDocument({ data: dataUrlToBytes(dataUrl) }).promise;
}

/**
 * Renderiza una página concreta a un dataURL (PNG) con escala alta para nitidez.
 * Solo se invoca para la página que el usuario está viendo (render bajo demanda).
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdf
 * @param {number} numero  Número de página (1-based).
 * @param {number} scale   Escala de render (≥ 2 para texto nítido).
 * @returns {Promise<string>} dataURL PNG de la página.
 */
export async function renderPaginaPdf(pdf, numero, scale = 2.5) {
    const page = await pdf.getPage(numero);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context, viewport }).promise;
    page.cleanup();
    return canvas.toDataURL('image/png');
}

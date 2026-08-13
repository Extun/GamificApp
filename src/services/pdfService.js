// Procesamiento real de PDF en el navegador con pdfjs-dist.
// Extrae el número de páginas y genera una miniatura (dataURL) de la primera
// página, sin depender de ningún backend. El worker se resuelve vía Vite.
//
// CARGA PEREZOSA (rendimiento). Antes, la librería y el worker se importaban
// arriba y `new PdfWorker()` se ejecutaba al cargar el módulo. Como
// `ArchivoChip` importa este servicio, y el panel del estudiante importa
// `ArchivoChip`, TODO niño se descargaba `pdf.worker.min` —1,27 MB, el archivo
// más pesado de la aplicación— nada más entrar, sin abrir un solo PDF. Medido
// en el navegador: era el 49 % de todo el JavaScript de esa pantalla.
//
// Ahora la librería y el worker se piden la primera vez que de verdad se va a
// leer un PDF, y una sola vez (la promesa queda memorizada). Las tres
// funciones exportadas ya eran asíncronas, así que ningún consumidor cambia.
let pdfjsPromesa = null;

const cargarPdfjs = () => {
    if (!pdfjsPromesa) {
        const intento = (async () => {
            // Vite empaqueta el worker como módulo con el sufijo `?worker`. Usar
            // `workerPort` con una instancia real evita el fallback a "fake
            // worker" (que en Vite deja el render colgado al no poder cargar el
            // .mjs por la ruta `?url`).
            const [pdfjsLib, { default: PdfWorker }] = await Promise.all([
                import('pdfjs-dist'),
                import('pdfjs-dist/build/pdf.worker.min.mjs?worker')
            ]);
            pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();
            return pdfjsLib;
        })();
        // La promesa se memoriza para no repetir la carga, pero memorizar un
        // FALLO es otra cosa: si el chunk del worker no baja una vez (red que
        // parpadea, despliegue a medias), esa promesa rota se quedaba puesta y
        // TODOS los PDF de la sesión fallaban en silencio hasta recargar la
        // página. Se olvida el intento fallido para que el siguiente reintente.
        intento.catch(() => { if (pdfjsPromesa === intento) pdfjsPromesa = null; });
        pdfjsPromesa = intento;
    }
    return pdfjsPromesa;
};

// Vigilante de tiempo para las esperas de pdf.js. Nada aquí debe poder quedarse
// colgado para siempre: sin esto, cualquier fallo del worker se traduce en un
// esqueleto de carga eterno y sin explicación, que es justo lo que se quiere
// evitar.
//
// El reloj NO corre mientras la pestaña está oculta, y esa excepción es
// imprescindible: pdf.js encadena los trozos del render con
// `requestAnimationFrame`, que el navegador congela cuando la pestaña no
// compone frames (en segundo plano, minimizada o tapada por otra ventana).
// Medido sobre la misma página: 115 ms a la vista y sin terminar estando
// oculta, reanudándose sola al volver a mirarla. Es una pausa legítima, no un
// fallo; contar ese tiempo sería un falso positivo garantizado.
//
// Deliberadamente NO se retrasa el arranque del render hasta que la pestaña
// sea visible: se probó y `document.hidden` no siempre refleja que la página
// se esté pintando, así que condicionar el dibujado a esa señal añadía una
// forma nueva de no dibujar nunca. Dejar que pdf.js se pare solo y se reanude
// solo es el comportamiento ya conocido y comprobado.
const conLimite = (promesa, ms, mensaje) => {
    let temporizador;
    const vigilancia = new Promise((_, rechazar) => {
        const armar = () => {
            temporizador = setTimeout(() => {
                if (typeof document !== 'undefined' && document.hidden) { armar(); return; }
                rechazar(new Error(mensaje));
            }, ms);
        };
        armar();
    });
    return Promise.race([promesa, vigilancia]).finally(() => clearTimeout(temporizador));
};

const LIMITE_CARGA_MS = 15000;
const LIMITE_RENDER_MS = 20000;

// Dibuja una página en un canvas con límite de tiempo. Si el límite salta,
// cancela la tarea de pdf.js: dejarla viva seguiría consumiendo el worker para
// un resultado que ya nadie va a mirar.
async function dibujarPagina(page, contexto, viewport) {
    const tarea = page.render({ canvasContext: contexto, viewport });
    try {
        await conLimite(tarea.promise, LIMITE_RENDER_MS,
            `El dibujado de la página superó ${LIMITE_RENDER_MS / 1000} s y se canceló.`);
    } catch (err) {
        tarea.cancel();
        throw err;
    }
}

/**
 * Procesa un PDF y devuelve sus metadatos reales.
 *
 * La miniatura es opcional a propósito: si no se puede generar, el archivo se
 * sube igual (perder el documento por no poder dibujarlo sería mucho peor).
 * Pero el motivo del fallo SE DEVUELVE en vez de tragárselo, para que quien
 * llama pueda decírselo al docente en lugar de dejarle un archivo mudo.
 *
 * @param {File} file Archivo PDF cargado por el usuario.
 * @returns {Promise<{ pageCount: number, thumbnail: string|null, motivoSinMiniatura: string|null }>}
 */
export async function procesarPdf(file) {
    const pdfjsLib = await cargarPdfjs();
    const buffer = await file.arrayBuffer();
    let pdf;
    try {
        pdf = await conLimite(
            pdfjsLib.getDocument({ data: buffer }).promise,
            LIMITE_CARGA_MS,
            `La lectura del PDF superó ${LIMITE_CARGA_MS / 1000} s.`
        );
    } catch (err) {
        throw traducirErrorPdf(err);
    }
    const pageCount = pdf.numPages;

    let thumbnail = null;
    let motivoSinMiniatura = null;
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
        if (!context) throw new Error('El navegador no concedió un lienzo 2D para dibujarlo.');

        await dibujarPagina(page, context, viewport);
        // PNG conserva el texto nítido sin artefactos de compresión JPEG.
        thumbnail = canvas.toDataURL('image/png');
    } catch (err) {
        // Si falla el render de la miniatura, conservamos al menos el conteo
        // de páginas (thumbnail queda en null) y el motivo, para poder decirlo.
        motivoSinMiniatura = err?.message || 'error desconocido al dibujar la primera página';
    }

    await pdf.destroy();
    return { pageCount, thumbnail, motivoSinMiniatura };
}

// Decodifica un dataURL base64 a Uint8Array para alimentar a pdf.js.
// `atob` lanza `InvalidCharacterError` —un mensaje que no significa nada para
// un docente— si lo guardado no es base64 válido. Se traduce a algo accionable.
const dataUrlToBytes = (dataUrl) => {
    const b64 = dataUrl.split(',')[1] || '';
    if (!b64) throw new Error('El archivo guardado no contiene datos.');
    let bin;
    try {
        bin = atob(b64);
    } catch {
        throw new Error('El contenido guardado del archivo está dañado o incompleto.');
    }
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
// pdf.js habla en inglés y con nombres de excepción propios. Ese texto acaba
// delante de un docente, así que se traduce lo que de verdad puede pasar aquí.
const MENSAJES_PDFJS = {
    InvalidPDFException: 'El archivo no es un PDF válido o está dañado.',
    MissingPDFException: 'No se encontró el contenido del PDF.',
    PasswordException: 'El PDF está protegido con contraseña.',
    UnexpectedResponseException: 'No se pudo recuperar el contenido del PDF.'
};

const traducirErrorPdf = (err) => {
    const traducido = MENSAJES_PDFJS[err?.name];
    return traducido ? new Error(traducido) : err;
};

export async function cargarDocumentoPdf(dataUrl) {
    const pdfjsLib = await cargarPdfjs();
    try {
        return await conLimite(
            pdfjsLib.getDocument({ data: dataUrlToBytes(dataUrl) }).promise,
            LIMITE_CARGA_MS,
            `La apertura del PDF superó ${LIMITE_CARGA_MS / 1000} s.`
        );
    } catch (err) {
        throw traducirErrorPdf(err);
    }
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
    if (!context) throw new Error('El navegador no concedió un lienzo 2D para dibujar la página.');
    try {
        await dibujarPagina(page, context, viewport);
    } finally {
        page.cleanup();
    }
    return canvas.toDataURL('image/png');
}

// ============================================================
// Seed de DESARROLLO/QA — SOLO entorno local (gamificapp_dev).
//
// Puebla datos claramente ficticios para poder iniciar sesión y probar los
// tres paneles (Admin / Docente / Estudiante) y los juegos, contra el MySQL
// local del contenedor docker-compose.dev.yml. Idempotente: se puede correr
// varias veces sin duplicar.
//
// Uso:   DEV_SEED=true  node server/scripts/seedDev.js
//   (o con server/.env teniendo DEV_SEED=true y la DB local)
//
// ⚠️ TRIPLE BARRERA DE SEGURIDAD — se niega a ejecutarse si:
//   1) NODE_ENV === 'production'
//   2) DEV_SEED !== 'true'
//   3) DB_HOST no es local (localhost / 127.0.0.1 / ::1)
// Así nunca puede sembrar Aiven ni correr en Render por accidente.
// ============================================================
import 'dotenv/config';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { normalizarNombre } from '../routes/auth.js';

// ---- Barreras ----
const fatal = (msg) => { console.error(`⛔ seedDev abortado: ${msg}`); process.exit(1); };
if (process.env.NODE_ENV === 'production') fatal('NODE_ENV=production. Este seed es solo para desarrollo local.');
if (process.env.DEV_SEED !== 'true') fatal('Falta DEV_SEED=true. Activación explícita obligatoria.');
const HOST = process.env.DB_HOST || 'localhost';
if (!/^(localhost|127\.0\.0\.1|::1)$/.test(HOST)) fatal(`DB_HOST="${HOST}" no es local. El seed jamás siembra un host remoto (Aiven).`);

const PIN_ESTUDIANTE = '111111';
const PASS_DOCENTE = 'docente-dev-local';
const PASS_ADMIN_LIMITADO = 'admin-dev-local';

const conn = await mysql.createConnection({
    host: HOST,
    port: Number(process.env.DB_PORT) || 3307,
    user: process.env.DB_USER || 'gamificapp_dev',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gamificapp_dev'
});

// Confirmación extra: la base debe llamarse *_dev.
if (!/dev/i.test(process.env.DB_NAME || '')) fatal(`DB_NAME="${process.env.DB_NAME}" no parece de desarrollo (se espera algo con "dev").`);

const hash = (t) => bcrypt.hashSync(t, 10);

// upsert genérico por clave natural: devuelve el id existente o el nuevo.
async function upsert(tabla, whereSql, whereArgs, insertCols, insertVals) {
    const [[fila]] = await conn.query(`SELECT id FROM ${tabla} WHERE ${whereSql} LIMIT 1`, whereArgs);
    if (fila) return fila.id;
    const marcas = insertCols.map(() => '?').join(', ');
    const [r] = await conn.query(`INSERT INTO ${tabla} (${insertCols.join(', ')}) VALUES (${marcas})`, insertVals);
    return r.insertId;
}

console.log('🌱 Sembrando datos de desarrollo en', process.env.DB_NAME);

// ---- 1. Administrador restringido (permisos parciales) ----
const adminLimitadoId = await upsert(
    'usuarios', "username = 'admin.limitado'", [],
    ['username', 'nombre_completo', 'password_hash', 'rol', 'es_principal', 'activo', 'permisos'],
    ['admin.limitado', 'Admin Restringido (demo)', hash(PASS_ADMIN_LIMITADO), 'admin', 0, 1, JSON.stringify(['materias', 'estudiantes'])]
);
console.log('  ✔ admin.limitado (id', adminLimitadoId + ')');

// ---- 2. Docente demo ----
const docenteId = await upsert(
    'usuarios', "username = 'docente.demo'", [],
    ['username', 'nombre_completo', 'password_hash', 'rol', 'activo'],
    ['docente.demo', 'Docente Demostración', hash(PASS_DOCENTE), 'docente', 1]
);
console.log('  ✔ docente.demo (id', docenteId + ')');

// Asignar al docente materias 1 y 2.
for (const materiaId of [1, 2]) {
    await upsert('docente_materia', 'docente_id = ? AND materia_id = ?', [docenteId, materiaId],
        ['docente_id', 'materia_id'], [docenteId, materiaId]);
}

// ---- 3. Cursos ----
const cursoAId = await upsert('cursos', "nombre = '3ro' AND paralelo = 'A'", [],
    ['nombre', 'paralelo', 'nivel', 'activo'], ['3ro', 'A', 'Elemental', 1]);
const cursoBId = await upsert('cursos', "nombre = '4to' AND paralelo = 'B'", [],
    ['nombre', 'paralelo', 'nivel', 'activo'], ['4to', 'B', 'Elemental', 1]);
await upsert('docente_curso', 'docente_id = ? AND curso_id = ?', [docenteId, cursoAId],
    ['docente_id', 'curso_id'], [docenteId, cursoAId]);
console.log('  ✔ cursos: 3ro A (id', cursoAId + '), 4to B (id', cursoBId + ')');

// ---- 4. Estudiantes (XP variado + uno logueable) ----
// [nombreVisible, cursoId, curso, fechaNac, xp]
const ESTUDIANTES = [
    ['Estudiante Prueba Uno', cursoAId, '3ro', '2017-05-11', 1250],   // XP alto — logueable
    ['Estudiante Prueba Dos', cursoAId, '3ro', '2017-08-22', 350],    // XP medio
    ['Estudiante Prueba Tres', cursoAId, '3ro', '2017-01-03', 0],     // sin progreso
    ['Ana Sofía de los Ángeles Montenegro Villavicencio', cursoBId, '4to', '2016-12-30', 780], // nombre largo
];
const idsEstudiante = [];
for (const [nombre, cursoId, curso, fechaNac, xp] of ESTUDIANTES) {
    const partes = nombre.split(' ');
    const mitad = Math.ceil(partes.length / 2);
    const nombres = partes.slice(0, mitad).join(' ');
    const apellidos = partes.slice(mitad).join(' ') || '-';
    const norm = normalizarNombre(nombre);
    const fichaId = await upsert('estudiantes', 'curso_id = ? AND nombres = ? AND apellidos = ?',
        [cursoId, nombres, apellidos],
        ['nombres', 'apellidos', 'curso', 'curso_id', 'fecha_nacimiento', 'xp_total'],
        [nombres, apellidos, curso, cursoId, fechaNac, xp]);
    await conn.query('UPDATE estudiantes SET xp_total = ? WHERE id = ?', [xp, fichaId]);
    const cuentaId = await upsert('usuarios', 'estudiante_id = ?', [fichaId],
        ['username', 'nombre_completo', 'nombre_norm', 'password_hash', 'pin_hash', 'codigo_emergencia', 'rol', 'estudiante_id', 'activo'],
        [norm, nombre, norm, '', hash(PIN_ESTUDIANTE), 'DEV' + fichaId, 'estudiante', fichaId, 1]);
    idsEstudiante.push({ fichaId, cuentaId, nombre, xp });
}
console.log('  ✔', idsEstudiante.length, 'estudiantes (PIN de todos:', PIN_ESTUDIANTE + ')');

// ---- 5. Actividades (retos): los 7 tipos con configuracion_json válida ----
// Convención de XP (igual que los editores reales): xp_recompensa = nº ítems × 100.
const XP = 100;

// 1) Quiz — { preguntas: [{ pregunta, alternativas:{A,B,C,D}, correcta, justificacion }] }
const quizConfig = {
    preguntas: [
        { pregunta: '¿Cuánto es 2 + 3?', alternativas: { A: '4', B: '5', C: '6', D: '7' }, correcta: 'B', justificacion: 'Dos más tres son cinco.' },
        { pregunta: '¿Cuánto es 10 - 4?', alternativas: { A: '5', B: '7', C: '6', D: '8' }, correcta: 'C', justificacion: 'Diez menos cuatro son seis.' },
    ],
};
// 2) Misión Narrativa — { titulo, introduccion, final, desafios:[{narrativa,pregunta,alternativas:{A,B,C},correcta,pista,exito}] } (mín. 3)
const misionConfig = {
    titulo: 'La expedición de las palabras',
    introduccion: 'Ayuda a Lía a cruzar el bosque respondiendo bien en cada parada.',
    final: '¡Lo lograste! Lía llegó a casa con su tesoro de palabras.',
    desafios: [
        { narrativa: 'Lía encuentra un río.', pregunta: '¿Qué palabra es un sustantivo?', alternativas: { A: 'correr', B: 'río', C: 'rápido' }, correcta: 'B', pista: 'Es una cosa o lugar.', exito: '¡Bien! "río" es un sustantivo.' },
        { narrativa: 'Aparece un puente.', pregunta: '¿Cuál es un verbo?', alternativas: { A: 'saltar', B: 'puente', C: 'verde' }, correcta: 'A', pista: 'Es una acción.', exito: '¡Exacto! "saltar" es un verbo.' },
        { narrativa: 'Al final del bosque hay una casa.', pregunta: '¿Cuál es un adjetivo?', alternativas: { A: 'casa', B: 'comer', C: 'grande' }, correcta: 'C', pista: 'Describe cómo es algo.', exito: '¡Muy bien! "grande" es un adjetivo.' },
    ],
};
// 3) Clasificador — { titulo, categorias:[{nombre, elementos:[str]}] } (mín. 2 categorías)
const clasificadorConfig = {
    titulo: 'Seres vivos y objetos',
    categorias: [
        { nombre: 'Seres vivos', elementos: ['Perro', 'Árbol'] },
        { nombre: 'Objetos', elementos: ['Silla', 'Pelota'] },
    ],
};
// 4) Memorama — { titulo, instruccion, parejas:[{a,b}] } (3-10)
const memoramaConfig = {
    titulo: 'Memorama de animales',
    instruccion: 'Encuentra cada animal con su cría.',
    parejas: [
        { a: 'Perro', b: 'Cachorro' },
        { a: 'Gato', b: 'Gatito' },
        { a: 'Vaca', b: 'Ternero' },
    ],
};
// 5) Línea del Tiempo — { titulo, instruccion, eventos:[{texto}] } EN ORDEN correcto (3-8)
const lineaConfig = {
    titulo: 'El día de Ana',
    instruccion: 'Ordena lo que hace Ana durante el día.',
    eventos: [
        { texto: 'Se despierta en la mañana' },
        { texto: 'Va a la escuela' },
        { texto: 'Almuerza al mediodía' },
        { texto: 'Duerme en la noche' },
    ],
};
// 6) Completar Espacios — { titulo, instruccion, frases:[{texto con ___, opciones, correcta}] } (2-8)
const completarConfig = {
    titulo: 'Completa la frase',
    instruccion: 'Elige la palabra que falta.',
    frases: [
        { texto: 'El cielo es de color ___.', opciones: ['azul', 'cuadrado', 'rápido'], correcta: 'azul' },
        { texto: 'La vaca nos da ___.', opciones: ['leche', 'zapatos', 'lápices'], correcta: 'leche' },
    ],
};
// 7) Verdadero o Falso — { titulo, instruccion, afirmaciones:[{texto,esVerdadera,explicacion}] } (3-8)
const vfConfig = {
    titulo: 'Verdadero o falso: la naturaleza',
    instruccion: 'Marca si cada afirmación es verdadera o falsa.',
    afirmaciones: [
        { texto: 'El Sol es una estrella.', esVerdadera: true, explicacion: 'Es la estrella de nuestro sistema.' },
        { texto: 'Los peces vuelan.', esVerdadera: false, explicacion: 'Los peces viven en el agua.' },
        { texto: 'El agua moja.', esVerdadera: true, explicacion: 'El agua siempre moja.' },
    ],
};

const itemsDe = { quiz: 2, mision: 3, clasificador: 4, memorama: 3, 'linea-tiempo': 4, completar: 2, 'verdadero-falso': 3 };
// [titulo, materiaId, tipo, config, estado, cursoId]
const RETOS = [
    ['Suma y resta básica', 1, 'quiz', quizConfig, 'publicado', cursoAId],
    ['La expedición de las palabras', 2, 'mision', misionConfig, 'publicado', cursoAId],
    ['Seres vivos y objetos', 3, 'clasificador', clasificadorConfig, 'publicado', cursoAId],
    ['Memorama de animales', 1, 'memorama', memoramaConfig, 'publicado', cursoAId],
    ['El día de Ana', 4, 'linea-tiempo', lineaConfig, 'publicado', cursoAId],
    ['Completa la frase', 2, 'completar', completarConfig, 'publicado', cursoAId],
    ['Verdadero o falso: la naturaleza', 3, 'verdadero-falso', vfConfig, 'publicado', cursoAId],
    // Estados extra para el panel del docente/admin.
    ['Quiz en construcción', 1, 'quiz', quizConfig, 'borrador', cursoAId],
    ['Quiz archivado del año pasado', 1, 'quiz', quizConfig, 'archivado', cursoAId],
];
const idsReto = {};
for (const [titulo, materiaId, tipo, config, estado, cursoId] of RETOS) {
    const xp = (itemsDe[tipo] || 1) * XP;
    const id = await upsert('retos', 'materia_id = ? AND titulo = ?', [materiaId, titulo],
        ['materia_id', 'titulo', 'tipo', 'descripcion', 'configuracion_json', 'xp_recompensa', 'estado', 'docente_id', 'origen', 'dificultad', 'curso_id'],
        [materiaId, titulo, tipo, 'Actividad de demostración (dev).', JSON.stringify(config), xp, estado, docenteId, 'manual', 'facil', cursoId]);
    idsReto[titulo] = id;
}
console.log('  ✔', RETOS.length, 'actividades (7 tipos publicados + borrador + archivado)');

// ---- 6. Progreso / calificaciones (para XP y Libro) ----
// Estudiante Uno resolvió el quiz publicado con nota alta; Dos con nota media.
const quizId = idsReto['Suma y resta básica'];
const progresos = [
    [idsEstudiante[0].fichaId, quizId, 100, 100, 200], // 2/2
    [idsEstudiante[1].fichaId, quizId, 50, 50, 100],   // 1/2
];
for (const [estId, retoId, porcentaje, calificacion, xp] of progresos) {
    const existe = (await conn.query('SELECT id FROM progreso_estudiante WHERE estudiante_id = ? AND reto_id = ?', [estId, retoId]))[0][0];
    if (!existe) {
        await conn.query(
            `INSERT INTO progreso_estudiante (estudiante_id, reto_id, porcentaje, calificacion, xp_obtenido, completado, revisado)
             VALUES (?, ?, ?, ?, ?, 1, 0)`,
            [estId, retoId, porcentaje, calificacion, xp]);
    }
}
console.log('  ✔ progreso/calificaciones sembradas');

// ---- 7. Estados de tipos de juego (SPEC-017) ----
// Los 7 tipos en 'activo' para que el estudiante los vea y juegue todos.
// (Los estados solo_jugar/deshabilitado se prueban a mano en Gestión de Juegos.)
const TIPOS = ['quiz', 'mision', 'clasificador', 'memorama', 'linea-tiempo', 'completar', 'verdadero-falso'];
for (const tipo of TIPOS) {
    const existe = (await conn.query('SELECT tipo FROM tipos_juego WHERE tipo = ?', [tipo]))[0][0];
    if (existe) await conn.query("UPDATE tipos_juego SET estado = 'activo' WHERE tipo = ?", [tipo]);
    else await conn.query("INSERT INTO tipos_juego (tipo, estado) VALUES (?, 'activo')", [tipo]);
}
console.log('  ✔ tipos_juego: los 7 tipos en activo');

console.log('\n✅ Seed de desarrollo completo.\n');
console.log('   Credenciales locales (ficticias):');
console.log('   • Admin Principal:   admin / (ADMIN_PASSWORD de tu .env)');
console.log('   • Admin restringido: admin.limitado /', PASS_ADMIN_LIMITADO);
console.log('   • Docente:           docente.demo /', PASS_DOCENTE);
console.log('   • Estudiante:        "Estudiante Prueba Uno" / PIN', PIN_ESTUDIANTE);
await conn.end();
process.exit(0);

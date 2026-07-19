// Inicialización automática del esquema: al arrancar, el servidor crea las
// tablas y los datos semilla si aún no existen. Ejecuta el mismo script que
// se usaría a mano (database/produccion_defaultdb.sql), que es idempotente
// (CREATE TABLE IF NOT EXISTS + upserts): correrlo en cada arranque no daña
// datos existentes ni los duplica.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import MISIONES from './lib/misionesSeed.js';

const aquí = dirname(fileURLToPath(import.meta.url));
const RUTA_ESQUEMA = join(aquí, '..', 'database', 'produccion_defaultdb.sql');

export const inicializarEsquema = async () => {
    const sql = await readFile(RUTA_ESQUEMA, 'utf8');

    // Conexión de un solo uso con multipleStatements: el pool normal de la app
    // NO lo habilita (defensa contra inyección), así que el script completo se
    // ejecuta aquí, aislado, y esta conexión se cierra al terminar. El resto de
    // opciones replica el pool de db.js, que ya conecta a la BD de producción.
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'gamificapp',
        multipleStatements: true
    });

    try {
        // Las columnas nuevas de `materias` deben existir ANTES del script:
        // sus seeds (INSERT IGNORE ... color, icono) las referencian.
        await migrarColumnasMaterias(conn);
        await conn.query(sql);
        // Estas dependen de la tabla `cursos` que el script acaba de crear.
        await migrarColumnasCursoId(conn);
        await migrarDatosSpec002(conn);
        await migrarColumnasAdmins(conn);
        await migrarFase2Admin(conn);
        await migrarPanelDocente(conn);
        await migrarCatalogoInteligente(conn);
        await migrarUnicidadPapelera(conn);
        await migrarCentroDocente(conn);
        await migrarSistemaMisiones(conn);
        await migrarDocenteCurso(conn);
        await migrarBancoPreguntas(conn);
        await migrarBackfillBanco(conn);
        await migrarCargaMasiva(conn);
        await migrarCalificacionAcademica(conn);
        await migrarConfiguracionIA(conn);
        console.log('✅ Esquema verificado/creado en la base de datos.');
        await asegurarAdmin(conn);
        await asegurarAdminPrincipal(conn);
    } finally {
        await conn.end();
    }
};

// ¿La columna ya existe en esta base? (MySQL 8 no soporta ADD COLUMN IF NOT
// EXISTS, así que las migraciones se guardan con information_schema.)
const faltaColumna = async (conn, tabla, columna) => {
    const [[fila]] = await conn.query(
        `SELECT COUNT(*) AS n FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [tabla, columna]
    );
    return fila.n === 0;
};

// SPEC-002 §1.1 — materias dinámicas: color, icono y estado activa.
const migrarColumnasMaterias = async (conn) => {
    if (await faltaColumna(conn, 'materias', 'color')) {
        await conn.query(`ALTER TABLE materias
            ADD COLUMN color  VARCHAR(7) NOT NULL DEFAULT '#e0f2fe',
            ADD COLUMN icono  VARCHAR(8) NOT NULL DEFAULT '📚',
            ADD COLUMN activa BOOLEAN    NOT NULL DEFAULT TRUE`);
        console.log('✅ Migración: columnas color/icono/activa agregadas a materias.');
    }
};

// SPEC-002 §1.2 — relación al catálogo de cursos (el VARCHAR se conserva).
const migrarColumnasCursoId = async (conn) => {
    if (await faltaColumna(conn, 'estudiantes', 'curso_id')) {
        await conn.query(`ALTER TABLE estudiantes
            ADD COLUMN curso_id INT UNSIGNED NULL,
            ADD CONSTRAINT fk_est_curso FOREIGN KEY (curso_id)
                REFERENCES cursos (id) ON UPDATE CASCADE ON DELETE SET NULL`);
        console.log('✅ Migración: curso_id agregado a estudiantes.');
    }
    if (await faltaColumna(conn, 'invitaciones_estudiante', 'curso_id')) {
        await conn.query(`ALTER TABLE invitaciones_estudiante
            ADD COLUMN curso_id INT UNSIGNED NULL,
            ADD CONSTRAINT fk_inv_curso FOREIGN KEY (curso_id)
                REFERENCES cursos (id) ON UPDATE CASCADE ON DELETE SET NULL`);
        console.log('✅ Migración: curso_id agregado a invitaciones_estudiante.');
    }
};

// Ajustes de datos, todos idempotentes (condiciones que solo aplican una vez).
const migrarDatosSpec002 = async (conn) => {
    // Rename conservador: mismo ID 2, ninguna relación se toca.
    await conn.query(
        "UPDATE materias SET nombre = 'Lengua y Literatura' WHERE id = 2 AND nombre = 'Lenguaje'"
    );
    // Identidad visual inicial solo donde sigue el valor por defecto.
    const identidad = [
        [1, '#e0f2fe', '🔢'], [2, '#fce7f3', '📖'], [3, '#dcfce7', '🌱'],
        [4, '#fef3c7', '🌎'], [5, '#ede9fe', '⚽'], [6, '#ffe4e6', '🗣️']
    ];
    for (const [id, color, icono] of identidad) {
        await conn.query(
            "UPDATE materias SET color = ?, icono = ? WHERE id = ? AND icono = '📚'",
            [color, icono, id]
        );
    }
    // Backfill de cursos desde el texto libre existente ("2do A" => 2do / A).
    // Solo textos con el patrón "nombre paralelo"; el resto queda con
    // curso_id NULL y se corrige desde el panel.
    await conn.query(`INSERT IGNORE INTO cursos (nombre, paralelo)
        SELECT DISTINCT TRIM(SUBSTRING_INDEX(curso, ' ', 1)), TRIM(SUBSTRING_INDEX(curso, ' ', -1))
        FROM estudiantes
        WHERE curso LIKE '% %' AND TRIM(curso) <> ''`);
    await conn.query(`INSERT IGNORE INTO cursos (nombre, paralelo)
        SELECT DISTINCT TRIM(SUBSTRING_INDEX(curso, ' ', 1)), TRIM(SUBSTRING_INDEX(curso, ' ', -1))
        FROM invitaciones_estudiante
        WHERE curso LIKE '% %' AND TRIM(curso) <> ''`);
    await conn.query(`UPDATE estudiantes e JOIN cursos c
        ON TRIM(e.curso) = CONCAT(c.nombre, ' ', c.paralelo)
        SET e.curso_id = c.id WHERE e.curso_id IS NULL`);
    await conn.query(`UPDATE invitaciones_estudiante i JOIN cursos c
        ON TRIM(i.curso) = CONCAT(c.nombre, ' ', c.paralelo)
        SET i.curso_id = c.id WHERE i.curso_id IS NULL`);
};

// Módulo Administradores — roles de admin: es_principal distingue al
// Administrador Principal (institución + administradores) del Administrador
// operativo (docentes, estudiantes, cursos, materias, invitaciones).
// `activo` permite desactivar cuentas de acceso sin borrarlas.
const migrarColumnasAdmins = async (conn) => {
    if (await faltaColumna(conn, 'usuarios', 'es_principal')) {
        await conn.query(`ALTER TABLE usuarios
            ADD COLUMN es_principal BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN activo       BOOLEAN NOT NULL DEFAULT TRUE`);
        console.log('✅ Migración: columnas es_principal/activo agregadas a usuarios.');
    }
};

// SPEC-003 (migración 004) — Fase 2 del panel admin: permisos por
// administrador (JSON), papelera (soft-delete con eliminado_en/eliminado_por)
// y tabla de auditoría de acciones.
const migrarFase2Admin = async (conn) => {
    if (await faltaColumna(conn, 'usuarios', 'permisos')) {
        await conn.query('ALTER TABLE usuarios ADD COLUMN permisos JSON NULL');
        console.log('✅ Migración: columna permisos agregada a usuarios.');
    }
    for (const tabla of ['usuarios', 'materias', 'cursos']) {
        if (await faltaColumna(conn, tabla, 'eliminado_en')) {
            await conn.query(`ALTER TABLE ${tabla}
                ADD COLUMN eliminado_en  DATETIME    NULL,
                ADD COLUMN eliminado_por VARCHAR(50) NULL`);
            console.log(`✅ Migración: papelera (eliminado_en/eliminado_por) en ${tabla}.`);
        }
    }
    await conn.query(`CREATE TABLE IF NOT EXISTS auditoria (
        id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        usuario_id   INT UNSIGNED NULL,
        rol          VARCHAR(15)  NOT NULL,
        nombre       VARCHAR(160) NOT NULL,
        accion       VARCHAR(60)  NOT NULL,
        descripcion  VARCHAR(255) NOT NULL,
        materia      VARCHAR(60)  NULL,
        detalle_json JSON         NULL,
        creado_en    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_auditoria_fecha (creado_en),
        INDEX idx_auditoria_rol (rol)
    ) ENGINE = InnoDB`);
};

// SPEC-004 (migración 005) — Panel Docente: autoría de retos, foto de perfil
// del docente y tabla de retroalimentaciones (observaciones privadas).
const migrarPanelDocente = async (conn) => {
    if (await faltaColumna(conn, 'retos', 'docente_id')) {
        await conn.query('ALTER TABLE retos ADD COLUMN docente_id INT UNSIGNED NULL');
        console.log('✅ Migración: docente_id agregado a retos.');
    }
    // La FK se agrega aparte: en una BD recién creada el script del esquema ya
    // trae la columna (sin FK, porque `usuarios` se crea después de `retos`).
    const [[fk]] = await conn.query(
        `SELECT COUNT(*) AS n FROM information_schema.table_constraints
         WHERE table_schema = DATABASE() AND table_name = 'retos'
           AND constraint_name = 'fk_retos_docente'`
    );
    if (!fk.n) {
        await conn.query(`ALTER TABLE retos
            ADD CONSTRAINT fk_retos_docente FOREIGN KEY (docente_id)
                REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE SET NULL`);
        console.log('✅ Migración: FK fk_retos_docente agregada a retos.');
    }
    if (await faltaColumna(conn, 'usuarios', 'foto_data')) {
        await conn.query('ALTER TABLE usuarios ADD COLUMN foto_data MEDIUMTEXT NULL');
        console.log('✅ Migración: foto_data agregada a usuarios.');
    }
    await conn.query(`CREATE TABLE IF NOT EXISTS retroalimentaciones (
        id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
        docente_id    INT UNSIGNED NOT NULL,
        estudiante_id INT UNSIGNED NOT NULL,
        mensaje       VARCHAR(400) NOT NULL,
        creado_en     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_retro_docente FOREIGN KEY (docente_id)
            REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_retro_estudiante FOREIGN KEY (estudiante_id)
            REFERENCES estudiantes (id) ON UPDATE CASCADE ON DELETE CASCADE,
        INDEX idx_retro_estudiante (estudiante_id)
    ) ENGINE = InnoDB`);
};

const migrarCatalogoInteligente = async (conn) => {
    if (await faltaColumna(conn, 'materias', 'orden')) {
        await conn.query(`ALTER TABLE materias
            ADD COLUMN orden        INT UNSIGNED NOT NULL DEFAULT 0,
            ADD COLUMN descripcion  VARCHAR(200) NULL,
            ADD COLUMN banner_data  MEDIUMTEXT   NULL,
            ADD COLUMN competencias TEXT         NULL,
            ADD COLUMN nivel        VARCHAR(60)  NULL,
            ADD COLUMN protegida    BOOLEAN      NOT NULL DEFAULT FALSE`);
        console.log('✅ Migración: catálogo inteligente (orden/identidad/protegida) en materias.');
    }
    await conn.query('UPDATE materias SET orden = id WHERE orden = 0');
};

// ¿El índice ya existe en esta tabla?
const faltaIndice = async (conn, tabla, indice) => {
    const [[fila]] = await conn.query(
        `SELECT COUNT(*) AS n FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
        [tabla, indice]
    );
    return fila.n === 0;
};

// Migración 007 — Unicidad compatible con la Papelera (SPEC-003).
// El UNIQUE físico de materias.nombre y cursos(nombre, paralelo) chocaba con
// filas en la papelera: eliminar "Inglés" y volver a crearla respondía
// "ya existe". Se reemplaza por índices únicos FUNCIONALES que solo aplican a
// filas vivas (eliminado_en IS NULL): las filas eliminadas dejan de reservar
// el nombre, y dos materias/cursos ACTIVOS homónimos siguen prohibidos.
const migrarUnicidadPapelera = async (conn) => {
    if (await faltaIndice(conn, 'materias', 'uq_materia_nombre_activa')) {
        if (!await faltaIndice(conn, 'materias', 'nombre')) {
            await conn.query('ALTER TABLE materias DROP INDEX nombre');
        }
        await conn.query(`ALTER TABLE materias
            ADD UNIQUE KEY uq_materia_nombre_activa ((IF(eliminado_en IS NULL, nombre, NULL)))`);
        console.log('✅ Migración: unicidad de materias ahora ignora la papelera.');
    }
    if (await faltaIndice(conn, 'cursos', 'uq_curso_activo')) {
        if (!await faltaIndice(conn, 'cursos', 'uq_curso')) {
            await conn.query('ALTER TABLE cursos DROP INDEX uq_curso');
        }
        await conn.query(`ALTER TABLE cursos
            ADD UNIQUE KEY uq_curso_activo (
                (IF(eliminado_en IS NULL, nombre, NULL)),
                (IF(eliminado_en IS NULL, paralelo, NULL)))`);
        console.log('✅ Migración: unicidad de cursos ahora ignora la papelera.');
    }
};

// Migración 008 (SPEC-006) — Centro de Trabajo Docente: metadatos de las
// actividades (origen IA, favorito, dificultad, curso destino), Papelera de
// retos y Libro de Calificaciones (observación/revisado por intento).
const migrarCentroDocente = async (conn) => {
    if (await faltaColumna(conn, 'retos', 'origen')) {
        await conn.query(`ALTER TABLE retos
            ADD COLUMN origen        VARCHAR(10)  NOT NULL DEFAULT 'manual',
            ADD COLUMN favorito      BOOLEAN      NOT NULL DEFAULT FALSE,
            ADD COLUMN dificultad    VARCHAR(10)  NULL,
            ADD COLUMN curso_id      INT UNSIGNED NULL,
            ADD COLUMN eliminado_en  DATETIME     NULL,
            ADD COLUMN eliminado_por VARCHAR(50)  NULL`);
        console.log('✅ Migración: metadatos del centro docente agregados a retos.');
    }
    // FK aparte (mismo patrón que fk_retos_docente): en una BD recién creada
    // `retos` se crea antes que `cursos`, así que la columna llega sin FK.
    const [[fk]] = await conn.query(
        `SELECT COUNT(*) AS n FROM information_schema.table_constraints
         WHERE table_schema = DATABASE() AND table_name = 'retos'
           AND constraint_name = 'fk_retos_curso'`
    );
    if (!fk.n) {
        await conn.query(`ALTER TABLE retos
            ADD CONSTRAINT fk_retos_curso FOREIGN KEY (curso_id)
                REFERENCES cursos (id) ON UPDATE CASCADE ON DELETE SET NULL`);
        console.log('✅ Migración: FK fk_retos_curso agregada a retos.');
    }
    if (await faltaColumna(conn, 'progreso_estudiante', 'observacion')) {
        await conn.query(`ALTER TABLE progreso_estudiante
            ADD COLUMN observacion VARCHAR(400) NULL,
            ADD COLUMN revisado    BOOLEAN      NOT NULL DEFAULT FALSE`);
        console.log('✅ Migración: observación/revisado agregados a progreso_estudiante.');
    }
};

// Migración 009 (SPEC-007) — Sistema de Misiones y Progresión.
// 1) Racha de actividad en `estudiantes`. 2) Catálogo `misiones` (fuente única
// de verdad) y progreso `mision_estudiante`. 3) Seed idempotente de las
// misiones iniciales (server/lib/misionesSeed.js), incluida la resolución de la
// cadena de desbloqueo (requiere_mision_id) por `clave`.
const migrarSistemaMisiones = async (conn) => {
    if (await faltaColumna(conn, 'estudiantes', 'racha_actual')) {
        await conn.query(`ALTER TABLE estudiantes
            ADD COLUMN racha_actual           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
            ADD COLUMN racha_maxima           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
            ADD COLUMN ultima_fecha_actividad DATE NULL`);
        console.log('✅ Migración: racha de actividad agregada a estudiantes.');
    }

    await conn.query(`CREATE TABLE IF NOT EXISTS misiones (
        id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
        clave               VARCHAR(60)  NOT NULL UNIQUE,
        categoria           VARCHAR(20)  NOT NULL,
        tier                VARCHAR(10)  NOT NULL,
        titulo              VARCHAR(120) NOT NULL,
        descripcion         VARCHAR(255) NOT NULL,
        icono               VARCHAR(16)  NULL,
        tipo_objetivo       VARCHAR(40)  NOT NULL,
        objetivo_meta       INT UNSIGNED NOT NULL DEFAULT 1,
        objetivo_filtro     JSON         NULL,
        requiere_mision_id  INT UNSIGNED NULL,
        recompensa_xp       INT UNSIGNED NOT NULL DEFAULT 0,
        recompensa_insignia VARCHAR(60)  NULL,
        recompensa_banner   VARCHAR(60)  NULL,
        horizonte           VARCHAR(10)  NOT NULL DEFAULT 'corto',
        orden               INT UNSIGNED NOT NULL DEFAULT 0,
        activa              BOOLEAN      NOT NULL DEFAULT TRUE,
        creado_en           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_misiones_categoria (categoria, orden),
        CONSTRAINT fk_mision_requiere FOREIGN KEY (requiere_mision_id)
            REFERENCES misiones (id) ON UPDATE CASCADE ON DELETE SET NULL
    ) ENGINE = InnoDB`);

    await conn.query(`CREATE TABLE IF NOT EXISTS mision_estudiante (
        id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
        estudiante_id   INT UNSIGNED NOT NULL,
        mision_id       INT UNSIGNED NOT NULL,
        progreso_actual INT UNSIGNED NOT NULL DEFAULT 0,
        completada      BOOLEAN      NOT NULL DEFAULT FALSE,
        completada_en   DATETIME     NULL,
        actualizado_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_est_mision (estudiante_id, mision_id),
        CONSTRAINT fk_me_estudiante FOREIGN KEY (estudiante_id)
            REFERENCES estudiantes (id) ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_me_mision FOREIGN KEY (mision_id)
            REFERENCES misiones (id) ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE = InnoDB`);

    // Seed idempotente. NO se toca `requiere_mision_id` aquí (se resuelve luego
    // por clave): así el orden de inserción no importa y editar textos/umbrales
    // desde el seed se refleja sin duplicar filas.
    for (const mis of MISIONES) {
        await conn.query(
            `INSERT INTO misiones
                (clave, categoria, tier, titulo, descripcion, icono, tipo_objetivo,
                 objetivo_meta, objetivo_filtro, recompensa_xp, recompensa_insignia,
                 recompensa_banner, horizonte, orden)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                categoria = VALUES(categoria), tier = VALUES(tier),
                titulo = VALUES(titulo), descripcion = VALUES(descripcion),
                icono = VALUES(icono), tipo_objetivo = VALUES(tipo_objetivo),
                objetivo_meta = VALUES(objetivo_meta), objetivo_filtro = VALUES(objetivo_filtro),
                recompensa_xp = VALUES(recompensa_xp), recompensa_insignia = VALUES(recompensa_insignia),
                recompensa_banner = VALUES(recompensa_banner), horizonte = VALUES(horizonte),
                orden = VALUES(orden)`,
            [
                mis.clave, mis.categoria, mis.tier, mis.titulo, mis.descripcion, mis.icono,
                mis.tipo_objetivo, mis.objetivo_meta,
                mis.objetivo_filtro ? JSON.stringify(mis.objetivo_filtro) : null,
                mis.recompensa_xp, mis.recompensa_insignia, mis.recompensa_banner,
                mis.horizonte, mis.orden
            ]
        );
    }
    // Resolver la cadena de desbloqueo por clave (una vez existen todas las filas).
    for (const mis of MISIONES) {
        if (!mis.requiere) continue;
        await conn.query(
            `UPDATE misiones hijo
             JOIN misiones padre ON padre.clave = ?
             SET hijo.requiere_mision_id = padre.id
             WHERE hijo.clave = ?`,
            [mis.requiere, mis.clave]
        );
    }
    console.log(`✅ Migración: sistema de misiones (${MISIONES.length} misiones semilla).`);
};

// Migración 010 — asignación de cursos a docentes (muchos-a-muchos, igual que
// docente_materia). El admin decide qué curso(s) maneja cada docente; el
// docente solo puede invitar estudiantes a sus cursos. "Empezar en limpio":
// no se precarga ninguna asignación.
const migrarDocenteCurso = async (conn) => {
    await conn.query(`CREATE TABLE IF NOT EXISTS docente_curso (
        id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
        docente_id INT UNSIGNED NOT NULL,
        curso_id   INT UNSIGNED NOT NULL,
        creado_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_docente_curso (docente_id, curso_id),
        CONSTRAINT fk_dc_docente FOREIGN KEY (docente_id) REFERENCES usuarios (id)
            ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_dc_curso FOREIGN KEY (curso_id) REFERENCES cursos (id)
            ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE = InnoDB`);
};

// Migración 011 (SPEC-010) — Repositorio de Preguntas: banco reutilizable de
// preguntas por materia/tema/tipo. Aditiva: ninguna tabla existente cambia y
// las actividades siguen guardando su configuracion_json como siempre.
const migrarBancoPreguntas = async (conn) => {
    await conn.query(`CREATE TABLE IF NOT EXISTS banco_preguntas (
        id                 INT UNSIGNED     NOT NULL AUTO_INCREMENT,
        materia_id         TINYINT UNSIGNED NOT NULL,
        tema               VARCHAR(120)     NULL,
        tipo               VARCHAR(30)      NOT NULL,
        dificultad         VARCHAR(10)      NULL,
        enunciado          VARCHAR(255)     NULL,
        contenido_json     JSON             NOT NULL,
        explicacion        TEXT             NULL,
        etiquetas          VARCHAR(255)     NULL,
        origen             VARCHAR(10)      NOT NULL DEFAULT 'manual',
        estado             ENUM('pendiente','aprobada','archivada') NOT NULL DEFAULT 'aprobada',
        veces_utilizada    INT UNSIGNED     NOT NULL DEFAULT 0,
        ultima_utilizacion DATETIME         NULL,
        tiempo_estimado    SMALLINT UNSIGNED NULL,
        creado_por         INT UNSIGNED     NULL,
        creado_en          TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        actualizado_en     TIMESTAMP        NULL,
        PRIMARY KEY (id),
        CONSTRAINT fk_banco_materia FOREIGN KEY (materia_id)
            REFERENCES materias (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_banco_creador FOREIGN KEY (creado_por)
            REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE SET NULL,
        INDEX idx_banco_materia_tipo (materia_id, tipo),
        INDEX idx_banco_estado (estado)
    ) ENGINE = InnoDB`);
};

// Backfill único (SPEC-010) — antes de que el guardado automático existiera,
// los ítems (preguntas, parejas, eventos, frases) solo vivían dentro de
// `retos.configuracion_json`. Se copian al banco para que también aparezcan
// como reutilizables. Se ejecuta UNA sola vez: se guarda con origen='backfill'
// y esa marca es el candado (si ya hay filas con ese origen, no se repite).
const migrarBackfillBanco = async (conn) => {
    const [[yaHecho]] = await conn.query(
        "SELECT COUNT(*) AS n FROM banco_preguntas WHERE origen = 'backfill'"
    );
    if (yaHecho.n > 0) return;

    // Por tipo con ítems atómicos: clave del arreglo en la configuración,
    // validación mínima del ítem y enunciado buscable (misma lógica que los
    // validadores de routes/bancoPreguntas.js).
    const EXTRACTORES = {
        quiz: {
            clave: 'preguntas',
            valido: (p) => {
                const correcta = String(p?.correcta || '').trim().toUpperCase().charAt(0);
                return typeof p?.pregunta === 'string' && p.pregunta.trim() &&
                    p?.alternativas?.A && p?.alternativas?.B && p?.alternativas?.[correcta];
            },
            enunciado: (p) => p.pregunta
        },
        memorama: {
            clave: 'parejas',
            valido: (p) => typeof p?.a === 'string' && p.a.trim() && typeof p?.b === 'string' && p.b.trim(),
            enunciado: (p) => `${p.a} ↔ ${p.b}`
        },
        'linea-tiempo': {
            clave: 'eventos',
            valido: (p) => typeof p?.texto === 'string' && p.texto.trim(),
            enunciado: (p) => (p.etiqueta ? `${p.etiqueta}: ${p.texto}` : p.texto)
        },
        completar: {
            clave: 'frases',
            valido: (p) => typeof p?.texto === 'string' && p.texto.includes('___') &&
                Array.isArray(p?.opciones) && p.opciones.length >= 2 &&
                typeof p?.correcta === 'string' && p.opciones.includes(p.correcta),
            enunciado: (p) => p.texto
        }
    };

    const [retosConItems] = await conn.query(
        `SELECT id, materia_id, tipo, dificultad, configuracion_json, docente_id
         FROM retos WHERE tipo IN (?) AND eliminado_en IS NULL`,
        [Object.keys(EXTRACTORES)]
    );
    if (!retosConItems.length) return;

    // Ítems que ya están en el banco (guardados antes de este backfill),
    // para no duplicar el mismo contenido.
    const [existentes] = await conn.query(
        'SELECT materia_id, tipo, LOWER(TRIM(enunciado)) AS enunciado FROM banco_preguntas'
    );
    const yaEnBanco = new Set(existentes.map((e) => `${e.materia_id}:${e.tipo}:${e.enunciado}`));

    const filas = [];
    for (const reto of retosConItems) {
        const extractor = EXTRACTORES[reto.tipo];
        let config;
        try {
            config = typeof reto.configuracion_json === 'string'
                ? JSON.parse(reto.configuracion_json) : reto.configuracion_json;
        } catch { continue; }
        const items = Array.isArray(config?.[extractor.clave]) ? config[extractor.clave] : [];
        for (const item of items) {
            if (!extractor.valido(item)) continue;
            const enunciado = String(extractor.enunciado(item) || '').trim().slice(0, 255);
            if (!enunciado) continue;
            const claveDedupe = `${reto.materia_id}:${reto.tipo}:${enunciado.toLowerCase()}`;
            if (yaEnBanco.has(claveDedupe)) continue;
            yaEnBanco.add(claveDedupe); // el mismo ítem puede repetirse en varias actividades
            filas.push([
                reto.materia_id, null, reto.tipo, reto.dificultad || null, enunciado,
                JSON.stringify(item), null, null, 'backfill', 'aprobada', reto.docente_id
            ]);
        }
    }
    if (!filas.length) return;

    await conn.query(
        `INSERT INTO banco_preguntas
            (materia_id, tema, tipo, dificultad, enunciado, contenido_json,
             explicacion, etiquetas, origen, estado, creado_por)
         VALUES ?`,
        [filas]
    );
    console.log(`✅ Migración: ${filas.length} ítems de actividades existentes copiados al banco (backfill).`);
};

// Migración 012 (SPEC-014) — Carga masiva de estudiantes + activación por
// código individual. 1) Código de activación (solo hash bcrypt + pista de 3
// caracteres + fecha de uso). 2) nombre_norm para localizar homónimos en el
// login ("nombre localiza, PIN decide"); username sigue UNIQUE con sufijo
// interno invisible. 3) registrado_por: quién importó la ficha. 4) Unicidad
// (curso_id, nombres, apellidos): homónimos exactos prohibidos en el MISMO
// curso, permitidos entre cursos distintos.
const migrarCargaMasiva = async (conn) => {
    if (await faltaColumna(conn, 'usuarios', 'codigo_acceso_hash')) {
        await conn.query(`ALTER TABLE usuarios
            ADD COLUMN codigo_acceso_hash     VARCHAR(100) NULL,
            ADD COLUMN codigo_acceso_pista    VARCHAR(3)   NULL,
            ADD COLUMN codigo_acceso_usado_en DATETIME     NULL`);
        console.log('✅ Migración: código de activación agregado a usuarios.');
    }
    if (await faltaColumna(conn, 'usuarios', 'nombre_norm')) {
        await conn.query(`ALTER TABLE usuarios
            ADD COLUMN nombre_norm VARCHAR(120) NULL,
            ADD INDEX idx_usuarios_nombre_norm (nombre_norm)`);
        console.log('✅ Migración: nombre_norm agregado a usuarios.');
    }
    // Backfill idempotente: en las cuentas de estudiante existentes el
    // username ES el nombre normalizado (así las crea /registro-estudiante).
    await conn.query(
        "UPDATE usuarios SET nombre_norm = username WHERE rol = 'estudiante' AND nombre_norm IS NULL"
    );
    if (await faltaColumna(conn, 'estudiantes', 'registrado_por')) {
        await conn.query('ALTER TABLE estudiantes ADD COLUMN registrado_por INT UNSIGNED NULL');
        console.log('✅ Migración: registrado_por agregado a estudiantes.');
    }
    if (await faltaIndice(conn, 'estudiantes', 'uq_est_curso_nombre')) {
        try {
            await conn.query(
                'CREATE UNIQUE INDEX uq_est_curso_nombre ON estudiantes (curso_id, nombres, apellidos)'
            );
            console.log('✅ Migración: unicidad (curso, nombres, apellidos) en estudiantes.');
        } catch (err) {
            // Datos existentes con duplicados exactos en el mismo curso: no
            // tumbar el arranque; se avisa para resolverlo a mano y el índice
            // se creará en el siguiente arranque tras limpiar.
            if (err.code !== 'ER_DUP_ENTRY') throw err;
            console.warn('⚠️  Migración 012: hay estudiantes duplicados (mismo curso, nombres y apellidos).');
            console.warn('   El índice uq_est_curso_nombre NO se creó; depura los duplicados y reinicia.');
        }
    }
};

// SPEC-015 — calificación académica persistida: mejor nota /100 del estudiante
// en el reto, calculada por el servidor desde aciertos/total del intento.
// NULL = registrado por un flujo que aún no envía aciertos/total.
const migrarCalificacionAcademica = async (conn) => {
    if (await faltaColumna(conn, 'progreso_estudiante', 'calificacion')) {
        await conn.query(`ALTER TABLE progreso_estudiante
            ADD COLUMN calificacion TINYINT UNSIGNED NULL`);
        // Backfill único: hasta hoy toda recompensa era jugables × 100, así
        // que `porcentaje` coincide con la nota académica de esas filas.
        await conn.query(
            'UPDATE progreso_estudiante SET calificacion = porcentaje WHERE calificacion IS NULL'
        );
        console.log('✅ Migración: calificacion agregada a progreso_estudiante (backfill desde porcentaje).');
    }
};

// SPEC-016 (migración 013) — configuración administrativa del proveedor de IA.
//
// ⚠️ SEGURIDAD: esta tabla NUNCA guarda API keys. Los secretos viven solo en
// variables de entorno del backend. Aquí únicamente se persiste QUÉ proveedor
// y QUÉ modelo usar.
//
// NO se siembra ninguna fila a propósito: sin fila, `lib/ia/config.js`
// resuelve 'gemini' con modelo automático, que es exactamente el
// comportamiento anterior a SPEC-016. Así, desplegar esta migración sobre una
// base existente no cambia nada de forma silenciosa.
const migrarConfiguracionIA = async (conn) => {
    await conn.query(`CREATE TABLE IF NOT EXISTS configuracion_ia (
        id                 TINYINT UNSIGNED NOT NULL,
        proveedor          VARCHAR(30)      NOT NULL DEFAULT 'gemini',
        modelo             VARCHAR(60)      NULL,
        proveedor_respaldo VARCHAR(30)      NULL,
        actualizado_en     TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        actualizado_por    INT UNSIGNED     NULL,
        PRIMARY KEY (id)
    ) ENGINE = InnoDB`);
};

// Invariante del sistema: SIEMPRE existe al menos un Administrador Principal
// activo. Si no hay ninguno (primera migración o datos corruptos), se
// promueve al admin activo más antiguo.
const asegurarAdminPrincipal = async (conn) => {
    const [[hay]] = await conn.query(
        "SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin' AND es_principal = TRUE AND activo = TRUE AND eliminado_en IS NULL"
    );
    if (!hay.n) {
        await conn.query(
            `UPDATE usuarios SET es_principal = TRUE, activo = TRUE
             WHERE rol = 'admin' AND eliminado_en IS NULL ORDER BY id LIMIT 1`
        );
        console.log('✅ Migración: el admin más antiguo fue promovido a Administrador Principal.');
    }
};

// Garantiza que exista la cuenta admin SIN claves públicas en el repositorio:
// la contraseña viene de la variable de entorno ADMIN_PASSWORD.
//   · Con ADMIN_PASSWORD definida: crea el admin o actualiza su contraseña
//     (cambiarla en Render + redesplegar = rotar la clave).
//   · Sin la variable y sin admin en la BD: crea uno con clave temporal
//     'admin123' y lo avisa a gritos en los logs (mejor que dejarte fuera).
const asegurarAdmin = async (conn) => {
    const passwordEnv = process.env.ADMIN_PASSWORD;

    if (passwordEnv) {
        await conn.query(
            `INSERT INTO usuarios (username, password_hash, rol)
             VALUES ('admin', ?, 'admin')
             ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), rol = 'admin'`,
            [bcrypt.hashSync(String(passwordEnv), 10)]
        );
        console.log('✅ Cuenta admin sincronizada con ADMIN_PASSWORD.');
        return;
    }

    const [[admin]] = await conn.query(
        "SELECT id FROM usuarios WHERE rol = 'admin' LIMIT 1"
    );
    if (!admin) {
        await conn.query(
            `INSERT INTO usuarios (username, password_hash, rol)
             VALUES ('admin', ?, 'admin')`,
            [bcrypt.hashSync('admin123', 10)]
        );
        console.warn('⚠️  ADMIN_PASSWORD no está definida: se creó admin/admin123 TEMPORAL.');
        console.warn('   Define ADMIN_PASSWORD en las variables de entorno y redespliega.');
    }
};

export default inicializarEsquema;

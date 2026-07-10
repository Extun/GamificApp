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

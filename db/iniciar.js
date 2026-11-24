const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const SCHEMA = path.join(__dirname, "schema.sql");
const DATOS = path.join(__dirname, "datos.sql");

async function crearBaseSiNoExiste() {
    const nombre = process.env.DB_NAME;
    const admin = new Pool({
        host: process.env.DB_HOST, port: process.env.DB_PORT,
        user: process.env.DB_USER, password: process.env.DB_PASSWORD,
        database: "postgres"
    });
    try {
        const r = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [nombre]);
        if (!r.rowCount) {
            await admin.query(`CREATE DATABASE "${nombre.replace(/"/g, '""')}"`);
            console.log(`Base de datos "${nombre}" creada.`);
        }
    } catch (e) {
        console.warn("No se pudo comprobar/crear la base de datos:", e.message);
    } finally { await admin.end(); }
}

async function datosMinimos(pool) {
    await pool.query(`
        INSERT INTO usuarios (nombre, correo, clave_hash, cargo) VALUES
         ('Administrador',   'admin123@gmail.com', crypt('admin123',    gen_salt('bf')), 'administrador'),
         ('Jefe de almacén', 'almacen@gmail.com',  crypt('almacen123',  gen_salt('bf')), 'jefe de almacén'),
         ('Operario',        'operario@gmail.com', crypt('operario123', gen_salt('bf')), 'operario')
        ON CONFLICT (correo) DO NOTHING;
        INSERT INTO categorias (nombre) VALUES ('Lácteos'),('Abarrotes'),('Bebidas'),('Limpieza'),('Carnes')
        ON CONFLICT (nombre) DO NOTHING;`);
}

async function prepararBase(pool) {
    await crearBaseSiNoExiste();
    try { await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto"); }
    catch (e) { console.warn("No se pudo activar pgcrypto (necesario para el login):", e.message); }

    await pool.query(fs.readFileSync(SCHEMA, "utf8"));

    const { rows } = await pool.query("SELECT (SELECT count(*) FROM usuarios)::int AS usuarios");
    if (rows[0].usuarios === 0) {
        if (fs.existsSync(DATOS)) {
            await pool.query(fs.readFileSync(DATOS, "utf8"));
            console.log("Base vacía: datos cargados desde db/datos.sql");
        } else {
            await datosMinimos(pool);
            console.log("Base vacía: se crearon los usuarios y categorías iniciales.");
        }
    }
}

module.exports = { prepararBase };

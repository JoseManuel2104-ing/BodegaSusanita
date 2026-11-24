require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool, types } = require("pg");

// fechas como texto tal cual (evita problemas de zona horaria)
[1082, 1114, 1184].forEach(t => types.setTypeParser(t, v => v));

const TABLAS = ["usuarios", "categorias", "proveedores", "productos", "perdidas", "movimientos"];
const SALIDA = path.join(__dirname, "datos.sql");

const q = s => '"' + String(s).replace(/"/g, '""') + '"';
const lit = v => v === null || v === undefined ? "NULL"
    : typeof v === "number" || typeof v === "boolean" ? String(v)
    : "'" + String(v).replace(/'/g, "''") + "'";

function sqlDeTabla(tabla, columnas, filas) {
    if (!filas.length) return "";
    const cols = columnas.map(q).join(", ");
    let out = "";
    for (let i = 0; i < filas.length; i += 200) {
        const lote = filas.slice(i, i + 200).map(f => "(" + columnas.map(c => lit(f[c])).join(", ") + ")").join(",\n  ");
        out += `INSERT INTO ${q(tabla)} (${cols}) OVERRIDING SYSTEM VALUE VALUES\n  ${lote}\nON CONFLICT DO NOTHING;\n`;
    }
    out += `SELECT setval(pg_get_serial_sequence('${tabla}', 'id'), (SELECT MAX(id) FROM ${q(tabla)}));\n`;
    return out + "\n";
}

async function main() {
    const pool = new Pool({
        host: process.env.DB_HOST, port: process.env.DB_PORT, database: process.env.DB_NAME,
        user: process.env.DB_USER, password: process.env.DB_PASSWORD
    });
    let sql = `-- Respaldo de datos generado el ${new Date().toISOString()}\n-- Se carga solo cuando la base de datos está vacía.\n\n`;
    const resumen = [];
    for (const t of TABLAS) {
        try {
            const r = await pool.query(`SELECT * FROM ${q(t)} ORDER BY id`);
            sql += sqlDeTabla(t, r.fields.map(f => f.name), r.rows);
            resumen.push(`${t}: ${r.rowCount}`);
        } catch (e) { resumen.push(`${t}: (no existe, se omite)`); }
    }
    fs.writeFileSync(SALIDA, sql, "utf8");
    console.log("Respaldo guardado en db/datos.sql\n  " + resumen.join("\n  "));
    await pool.end();
}

if (require.main === module) main().catch(e => { console.error("No se pudo hacer el respaldo:", e.message); process.exit(1); });
module.exports = { sqlDeTabla, lit };

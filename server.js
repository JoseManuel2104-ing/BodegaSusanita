const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();
 
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));  
 
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: String(process.env.DB_PASSWORD)
});
 

// Agrega la columna RUC a proveedores si todavía no existe (no borra ni cambia datos)
pool.query("ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS ruc VARCHAR(11)")
    .then(() => pool.query("CREATE UNIQUE INDEX IF NOT EXISTS proveedores_ruc_uq ON proveedores (ruc)"))
    .catch(e => console.error("No se pudo preparar la columna RUC:", e.message));

// Stock mínimo en productos + tabla de movimientos de stock (no borra ni cambia datos existentes)
(async () => {
    try {
        await pool.query("ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_minimo NUMERIC NOT NULL DEFAULT 0");
        await pool.query(`CREATE TABLE IF NOT EXISTS movimientos (
            id SERIAL PRIMARY KEY,
            producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
            producto_nombre VARCHAR(200) NOT NULL,
            tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada','salida','ajuste')),
            cantidad NUMERIC NOT NULL,
            stock_anterior NUMERIC NOT NULL,
            stock_nuevo NUMERIC NOT NULL,
            motivo VARCHAR(200),
            usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
            creado_en TIMESTAMP NOT NULL DEFAULT now()
        )`);
        await pool.query("CREATE INDEX IF NOT EXISTS movimientos_producto_idx ON movimientos (producto_id, creado_en DESC)");
    } catch (e) { console.error("No se pudo preparar movimientos/stock mínimo:", e.message); }
})();

const SELECT_PRODUCTOS = `
    SELECT p.id, p.nombre, c.nombre AS categoria,
           p.proveedor_id AS "proveedorId", pr.nombre AS proveedor,
           p.cantidad, p.unidad, p.precio_unitario AS precio, p.stock_minimo AS "stockMinimo",
           to_char(p.fecha_vencimiento, 'YYYY-MM-DD') AS vence
    FROM productos p
    INNER JOIN categorias c ON c.id = p.categoria_id
    LEFT JOIN proveedores pr ON pr.id = p.proveedor_id`;
 
const ok = (res, fn) => fn().catch(e => {
    console.error(e);
    if (e.code === "23505") return res.status(400).json({ error: "Ya existe un registro con ese valor" });
    if (e.code === "23503") return res.status(400).json({ error: "No se puede eliminar: está en uso" });
    res.status(500).json({ error: e.message });
});
 
// Control de acceso por cargo: administrador / jefe de almacén / operario
const tipo = c => /admin/i.test(c) ? "admin" : /jefe/i.test(c) ? "jefe" : "operario";
const solo = (...roles) => async (req, res, next) => {
    try {
        const id = Number(req.headers["x-usuario-id"]);
        const q = id ? await pool.query("SELECT cargo FROM usuarios WHERE id = $1", [id]) : { rows: [] };
        if (!q.rows.length) return res.status(401).json({ error: "Sesión no válida" });
        req.rol = tipo(q.rows[0].cargo); req.uid = id;
        if (roles.length && !roles.includes(req.rol)) return res.status(403).json({ error: "No tienes permiso para esta acción" });
        next();
    } catch (e) { res.status(500).json({ error: e.message }); }
};
 
// Probar conexión con la BD
app.get("/api/prueba", (req, res) => ok(res, async () => {
    const r = await pool.query("SELECT current_database() AS base_datos, current_user AS usuario, inet_server_port() AS puerto");
    res.json({ mensaje: "Conexión correcta con PostgreSQL", datos: r.rows[0] });
}));
 
// Login (usa pgcrypto: crypt)
app.post("/api/login", (req, res) => ok(res, async () => {
    const { correo, clave } = req.body;
    const r = await pool.query(
        `SELECT id, nombre, correo, cargo, (clave_hash = crypt($2, clave_hash)) AS correcta
         FROM usuarios WHERE correo = $1`, [correo, clave]);
    if (!r.rows.length || !r.rows[0].correcta)
        return res.status(401).json({ error: "Correo o contraseña incorrectos" });
    const u = r.rows[0];
    res.json({ usuario: { id: u.id, nombre: u.nombre, correo: u.correo, cargo: u.cargo } });
}));
 
app.use("/api", solo());   // todo lo de abajo exige sesión
 
app.get("/api/categorias", (req, res) => ok(res, async () => {
    res.json((await pool.query("SELECT c.id, c.nombre, count(p.id)::int AS productos FROM categorias c LEFT JOIN productos p ON p.categoria_id = c.id GROUP BY c.id ORDER BY c.nombre")).rows);
}));
 
app.get("/api/proveedores", (req, res) => ok(res, async () => {
    res.json((await pool.query("SELECT pr.id, pr.nombre, pr.ruc, pr.telefono, pr.correo, count(p.id)::int AS productos FROM proveedores pr LEFT JOIN productos p ON p.proveedor_id = pr.id GROUP BY pr.id ORDER BY pr.nombre")).rows);
}));
 
app.get("/api/productos", (req, res) => ok(res, async () => {
    res.json((await pool.query(SELECT_PRODUCTOS + " ORDER BY p.fecha_vencimiento, p.id")).rows);
}));
 
// Validar y convertir los datos del formulario
async function datosProducto(b) {
    if (!b.nombre || !b.categoria || !(Number(b.cantidad) > 0) || !b.unidad || b.precio === "" || b.precio == null || !b.vence)
        return { error: "Faltan datos del producto" };
    const c = await pool.query("SELECT id FROM categorias WHERE nombre = $1", [b.categoria]);
    if (!c.rows.length) return { error: "La categoría no existe en la base de datos" };
    let prov = null;
    if (b.proveedorId && Number(b.proveedorId) > 0) {
        const p = await pool.query("SELECT id FROM proveedores WHERE id = $1", [Number(b.proveedorId)]);
        if (!p.rows.length) return { error: "El proveedor no existe en la base de datos" };
        prov = Number(b.proveedorId);
    }
    const minimo = b.stockMinimo === "" || b.stockMinimo == null ? 0 : Number(b.stockMinimo);
    if (!(minimo >= 0)) return { error: "El stock mínimo no es válido" };
    return { v: [b.nombre, c.rows[0].id, prov, Number(b.cantidad), b.unidad, Number(b.precio), b.vence, minimo] };
}
 
app.post("/api/productos", (req, res) => ok(res, async () => {
    const d = await datosProducto(req.body);
    if (d.error) return res.status(400).json({ error: d.error });
    const r = await pool.query(
        `INSERT INTO productos (nombre, categoria_id, proveedor_id, cantidad, unidad, precio_unitario, fecha_vencimiento, stock_minimo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, d.v);
    const p = await pool.query(SELECT_PRODUCTOS + " WHERE p.id = $1", [r.rows[0].id]);
    res.status(201).json({ mensaje: "Producto guardado", producto: p.rows[0] });
}));
 
app.put("/api/productos/:id", (req, res) => ok(res, async () => {
    const d = await datosProducto(req.body);
    if (d.error) return res.status(400).json({ error: d.error });
    await pool.query(
        `UPDATE productos SET nombre=$1, categoria_id=$2, proveedor_id=$3, cantidad=$4,
                unidad=$5, precio_unitario=$6, fecha_vencimiento=$7, stock_minimo=$8 WHERE id=$9`, [...d.v, req.params.id]);
    res.json({ mensaje: "Producto actualizado" });
}));
 
// Eliminar: si estaba vencido, se registra como pérdida
app.delete("/api/productos/:id", solo("admin", "jefe"), (req, res) => ok(res, async () => {
    const usuarioId = Number(req.headers["x-usuario-id"]) || null;
    await pool.query(
        `INSERT INTO perdidas (producto_nombre, cantidad, unidad, monto_perdido, fecha_vencimiento, eliminado_por)
         SELECT nombre, cantidad, unidad, cantidad * precio_unitario, fecha_vencimiento, $2
         FROM productos WHERE id = $1 AND fecha_vencimiento < CURRENT_DATE`, [req.params.id, usuarioId]);
    await pool.query("DELETE FROM productos WHERE id = $1", [req.params.id]);
    res.json({ mensaje: "Producto eliminado" });
}));
 
app.get("/api/perdidas", solo("admin", "jefe"), (req, res) => ok(res, async () => {
    const r = await pool.query(
        `SELECT l.id, l.producto_nombre AS nombre, l.cantidad, l.unidad, l.monto_perdido AS monto,
                to_char(l.fecha_vencimiento,'YYYY-MM-DD') AS vence,
                to_char(l.eliminado_en,'YYYY-MM-DD') AS eliminado, u.nombre AS usuario
         FROM perdidas l LEFT JOIN usuarios u ON u.id = l.eliminado_por
         ORDER BY l.eliminado_en DESC`);
    res.json(r.rows);
}));
 
// ---- Movimientos de stock (entradas, salidas y ajustes) ----
app.get("/api/movimientos", (req, res) => ok(res, async () => {
    const r = await pool.query(
        `SELECT m.id, m.producto_id AS "productoId", m.producto_nombre AS producto, m.tipo, m.cantidad,
                m.stock_anterior AS anterior, m.stock_nuevo AS nuevo, m.motivo,
                to_char(m.creado_en, 'YYYY-MM-DD HH24:MI') AS fecha, u.nombre AS usuario,
                pr.unidad
         FROM movimientos m
         LEFT JOIN usuarios u ON u.id = m.usuario_id
         LEFT JOIN productos pr ON pr.id = m.producto_id
         ORDER BY m.creado_en DESC, m.id DESC LIMIT 300`);
    res.json(r.rows);
}));

app.post("/api/movimientos", (req, res) => ok(res, async () => {
    const { productoId, tipo, motivo } = req.body;
    const cant = Number(req.body.cantidad);
    if (!["entrada", "salida", "ajuste"].includes(tipo)) return res.status(400).json({ error: "Tipo de movimiento no válido" });
    if (tipo === "ajuste" && req.rol === "operario") return res.status(403).json({ error: "Solo administrador o jefe de almacén pueden hacer ajustes" });
    if (!Number(productoId)) return res.status(400).json({ error: "Elige un producto" });
    if (!(cant >= 0) || (tipo !== "ajuste" && !(cant > 0))) return res.status(400).json({ error: "La cantidad debe ser mayor que 0" });
    const cn = await pool.connect();
    try {
        await cn.query("BEGIN");
        const p = await cn.query("SELECT nombre, cantidad, unidad FROM productos WHERE id = $1 FOR UPDATE", [Number(productoId)]);
        if (!p.rows.length) { await cn.query("ROLLBACK"); return res.status(404).json({ error: "El producto no existe" }); }
        const antes = Number(p.rows[0].cantidad);
        const nuevo = tipo === "entrada" ? antes + cant : tipo === "salida" ? antes - cant : cant;
        if (nuevo < 0) { await cn.query("ROLLBACK"); return res.status(400).json({ error: `Stock insuficiente: solo hay ${antes} ${p.rows[0].unidad}` }); }
        await cn.query("UPDATE productos SET cantidad = $1 WHERE id = $2", [nuevo, Number(productoId)]);
        await cn.query(
            `INSERT INTO movimientos (producto_id, producto_nombre, tipo, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [Number(productoId), p.rows[0].nombre, tipo, tipo === "ajuste" ? Math.abs(nuevo - antes) : cant, antes, nuevo, (motivo || "").trim().slice(0, 200) || null, req.uid]);
        await cn.query("COMMIT");
        res.status(201).json({ mensaje: "Movimiento registrado", stock: nuevo });
    } catch (e) {
        await cn.query("ROLLBACK").catch(() => {});
        throw e;
    } finally { cn.release(); }
}));

// ---- Proveedores ----
app.post("/api/proveedores", solo("admin", "jefe"), (req, res) => ok(res, async () => {
    const { nombre, ruc, telefono, correo } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: "Falta el nombre" });
    const rucLimpio = String(ruc || "").trim();
    if (!/^\d{11}$/.test(rucLimpio)) return res.status(400).json({ error: "El RUC debe tener 11 dígitos numéricos" });
    try {
        await pool.query("INSERT INTO proveedores (nombre, ruc, telefono, correo) VALUES ($1,$2,$3,$4)", [nombre.trim(), rucLimpio, telefono || null, correo || null]);
    } catch (e) {
        if (e.code === "23505") return res.status(400).json({ error: "Ya existe un proveedor con ese RUC" });
        throw e;
    }
    res.status(201).json({ mensaje: "Proveedor agregado" });
}));
app.put("/api/proveedores/:id", solo("admin", "jefe"), (req, res) => ok(res, async () => {
    const { nombre, ruc, telefono, correo } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: "Falta el nombre" });
    const rucLimpio = String(ruc || "").trim();
    if (!/^\d{11}$/.test(rucLimpio)) return res.status(400).json({ error: "El RUC debe tener 11 dígitos numéricos" });
    try {
        const r = await pool.query("UPDATE proveedores SET nombre=$1, ruc=$2, telefono=$3, correo=$4 WHERE id=$5", [nombre.trim(), rucLimpio, telefono || null, correo || null, req.params.id]);
        if (!r.rowCount) return res.status(404).json({ error: "El proveedor no existe" });
    } catch (e) {
        if (e.code === "23505") return res.status(400).json({ error: "Ya existe un proveedor con ese RUC" });
        throw e;
    }
    res.json({ mensaje: "Proveedor actualizado" });
}));
app.delete("/api/proveedores/:id", solo("admin"), (req, res) => ok(res, async () => {
    await pool.query("DELETE FROM proveedores WHERE id = $1", [req.params.id]);   // sus productos quedan "sin proveedor"
    res.json({ mensaje: "Proveedor eliminado" });
}));
 



app.post("/api/categorias", solo("admin"), (req, res) => ok(res, async () => {
    const nombre = (req.body.nombre || "").trim();
    if (!nombre) return res.status(400).json({ error: "Falta el nombre" });
    await pool.query("INSERT INTO categorias (nombre) VALUES ($1)", [nombre]);
    res.status(201).json({ mensaje: "Categoría agregada" });
}));
app.delete("/api/categorias/:id", solo("admin"), (req, res) => ok(res, async () => {
    const n = await pool.query("SELECT count(*)::int AS n FROM productos WHERE categoria_id = $1", [req.params.id]);
    if (n.rows[0].n) return res.status(400).json({ error: "No se puede eliminar: hay productos en esa categoría" });
    await pool.query("DELETE FROM categorias WHERE id = $1", [req.params.id]);
    res.json({ mensaje: "Categoría eliminada" });
}));
 



app.get("/api/usuarios", solo("admin"), (req, res) => ok(res, async () => {
    res.json((await pool.query("SELECT id, nombre, correo, cargo, to_char(creado_en,'YYYY-MM-DD') AS creado FROM usuarios ORDER BY id")).rows);
}));
app.post("/api/usuarios", solo("admin"), (req, res) => ok(res, async () => {
    const { nombre, correo, clave, cargo } = req.body;
    if (!nombre || !correo || !clave || clave.length < 6) return res.status(400).json({ error: "Completa todo (clave mínimo 6 caracteres)" });
    if (!["Administrador", "Jefe de almacén", "Operario"].includes(cargo)) return res.status(400).json({ error: "Cargo no válido" });
    await pool.query("INSERT INTO usuarios (nombre, correo, clave_hash, cargo) VALUES ($1,$2,crypt($3, gen_salt('bf')),$4)", [nombre.trim(), correo.trim(), clave, cargo]);
    res.status(201).json({ mensaje: "Usuario creado" });
}));
app.delete("/api/usuarios/:id", solo("admin"), (req, res) => ok(res, async () => {
    if (Number(req.params.id) === req.uid) return res.status(400).json({ error: "No puedes eliminar tu propio usuario" });
    await pool.query("DELETE FROM usuarios WHERE id = $1", [req.params.id]);
    res.json({ mensaje: "Usuario eliminado" });
}));
 
app.post("/api/perfil/clave", (req, res) => ok(res, async () => {
    const { actual, nueva } = req.body;
    if (!nueva || nueva.length < 6) return res.status(400).json({ error: "La nueva clave debe tener mínimo 6 caracteres" });
    const r = await pool.query("SELECT (clave_hash = crypt($1, clave_hash)) AS ok FROM usuarios WHERE id = $2", [actual || "", req.uid]);
    if (!r.rows[0].ok) return res.status(400).json({ error: "La contraseña actual es incorrecta" });
    await pool.query("UPDATE usuarios SET clave_hash = crypt($1, gen_salt('bf')) WHERE id = $2", [nueva, req.uid]);
    res.json({ mensaje: "Contraseña actualizada" });
}));
 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("----------------------------------------");
    console.log("SERVIDOR INICIADO CORRECTAMENTE");
    console.log(`Servidor: http://localhost:${PORT}`);
    console.log("----------------------------------------");
});
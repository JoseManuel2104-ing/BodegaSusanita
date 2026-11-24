const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const S = {
  user: null,
  prods: [],
  agotadosCache: [],
  cats: [],
  provs: [],
  vista: "dashboard",
  filtro: "todos",
  q: "",
  qm: "",
  tm: "todos",
  qp: "",
  qcat: "todas",
  soloBajos: false,
  mostrarAgotados: false,
  qrep: "",
  edit: null
};
const ICONOS = { Lácteos: "🥛", Cereales: "🌾", Snacks: "🍪", Legumbres: "🫘", Conservas: "🥫", Aceites: "🫒", Bebidas: "🥤", Abarrotes: "🛒", Limpieza: "🧹", Carnes: "🥩", Otros: "📦" };

const api = async (url, op = {}) => {
  const r = await fetch(url, { headers: { "Content-Type": "application/json", "x-usuario-id": S.user?.id || "" }, ...op });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Error");
  return d;
};

// ---- semáforo: rojo = vencido, amarillo = 15 días o menos, verde = el resto ----
const dias = p => Math.round((new Date(p.vence + "T00:00:00") - new Date(new Date().toDateString())) / 864e5);
const estado = p => { const d = dias(p); return d < 0 ? "rojo" : d <= 15 ? "amarillo" : "verde"; };
const TAG = { rojo: ["t-red", "Vencido"], amarillo: ["t-warn", "Por vencer"], verde: ["t-ok", "Vigente"] };
const soles = n => "S/ " + Number(n || 0).toFixed(2);
const bajoStock = p => Number(p.stockMinimo) > 0 && Number(p.cantidad) > 0 && Number(p.cantidad) <= Number(p.stockMinimo);

// Combina los lotes con stock y los agotados (tanto los del backend como los recién agotados en sesión)
function obtenerTodosLosLotes() {
  const mapa = new Map();
  S.prods.forEach(p => mapa.set(Number(p.id), p));
  if (S.mostrarAgotados) {
    S.agotadosCache.forEach(p => {
      if (!mapa.has(Number(p.id))) mapa.set(Number(p.id), { ...p, cantidad: 0 });
    });
  }
  return Array.from(mapa.values());
}

const listaAgotados = () => obtenerTodosLosLotes().filter(p => Number(p.cantidad) <= 0);
const conStock = p => S.mostrarAgotados ? Number(p.cantidad) <= 0 : Number(p.cantidad) > 0;

// ---- orden interno por fecha de vencimiento más próxima ----
const ordenVencimiento = arr => [...arr].sort((a, b) => {
  const da = dias(a), db = dias(b);
  if (da !== db) return da - db;
  return String(a.vence || "").localeCompare(String(b.vence || "")) || (Number(a.id || 0) - Number(b.id || 0));
});

const stockVigentePorNombre = nombre =>
  S.prods
    .filter(p => String(p.nombre || "").trim().toLowerCase() === String(nombre || "").trim().toLowerCase() && dias(p) >= 0 && Number(p.cantidad) > 0)
    .reduce((acc, p) => acc + Number(p.cantidad || 0), 0);

// Lotes vigentes (> 0 stock y días >= 0) del mismo producto ordenados del más próximo a vencer al más lejano
function lotesVigentesProducto(nombreProd) {
  const clave = String(nombreProd || "").trim().toLowerCase();
  return ordenVencimiento(
    S.prods.filter(p => String(p.nombre || "").trim().toLowerCase() === clave && dias(p) >= 0 && Number(p.cantidad) > 0)
  );
}

// Simula el consumo encadenado lote por lote hasta agotarse y pasar al siguiente
function simularSalidaCascada(productoBase, cantidadSalida) {
  const lotes = lotesVigentesProducto(productoBase.nombre);
  let restante = Math.max(0, Number(cantidadSalida) || 0);
  const detalle = [];
  let totalDisponible = 0;

  for (const lote of lotes) {
    const dispLote = Number(lote.cantidad) || 0;
    totalDisponible += dispLote;
    const descontado = Math.min(dispLote, restante);
    const quedaLote = Number((dispLote - descontado).toFixed(4));
    restante = Number((restante - descontado).toFixed(4));
    detalle.push({
      loteRef: lote,
      id: lote.id,
      vence: lote.vence,
      unidad: lote.unidad,
      antes: dispLote,
      descontado,
      despues: quedaLote,
      agotado: quedaLote <= 0
    });
  }

  return {
    lotes,
    totalDisponible,
    insuficiente: restante > 0,
    totalRestanteGlobal: Number((totalDisponible - (Number(cantidadSalida) || 0)).toFixed(4)),
    detalle
  };
}

// ---- exportar a Excel (.xls HTML table compatible con Excel) ----
function descargarExcel(nombreArchivo, titulo, filas, columnas) {
  const th = columnas.map(c => `<th style="background:#1e293b;color:#ffffff;padding:8px 10px;border:1px solid #cbd5e1;text-align:left">${esc(c.label)}</th>`).join("");
  const tr = filas.map((fila, idx) =>
    `<tr>${columnas.map(c => {
      const raw = typeof c.val === "function" ? c.val(fila, idx) : fila[c.val];
      return `<td style="padding:7px 10px;border:1px solid #cbd5e1">${esc(raw ?? "")}</td>`;
    }).join("")}</tr>`
  ).join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head><body>
  <h3>${esc(titulo)}</h3>
  <p>Generado: ${esc(new Date().toLocaleString("es-PE"))} · Total registros: ${filas.length}</p>
  <table border="1" cellspacing="0" cellpadding="6">
    <thead><tr>${th}</tr></thead>
    <tbody>${tr || `<tr><td colspan="${columnas.length}">Sin registros</td></tr>`}</tbody>
  </table>
</body></html>`;

  const blob = new Blob(["\ufeff" + html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo.endsWith(".xls") ? nombreArchivo : `${nombreArchivo}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("📥 Excel descargado correctamente", "ok");
}

// ---- permisos por cargo: administrador / jefe de almacén / operario ----
const rol = () => /admin/i.test(S.user.cargo) ? "admin" : /jefe/i.test(S.user.cargo) ? "jefe" : "operario";
const esAdmin = () => rol() === "admin";
const puedeBorrar = () => rol() !== "operario";
const PERMISOS = {
  admin: ["Dashboard", "Inventario", "Productos: agregar, editar y eliminar", "Movimientos: entradas, salidas y ajustes", "Proveedores: agregar, editar y eliminar", "Categorías", "Usuarios", "Pérdidas", "Reportes"],
  jefe: ["Dashboard", "Inventario", "Productos: agregar, editar y eliminar", "Movimientos: entradas, salidas y ajustes", "Proveedores: agregar y editar", "Pérdidas", "Reportes"],
  operario: ["Dashboard", "Inventario (solo ver)", "Productos: agregar y editar", "Movimientos: entradas y salidas"],
};
const MENU = () => [
  ["sec", "Principal"], ["dashboard", "📊 Dashboard"], ["inventario", "🗂️ Inventario"], ["productos", "📦 Productos"], ["movimientos", "🔄 Movimientos"],
  ...(puedeBorrar() ? [["sec", "Gestión"], ["proveedores", "🚚 Proveedores"], ["perdidas", "📉 Pérdidas"], ["reportes", "🧾 Reportes"]] : []),
  ...(esAdmin() ? [["sec", "Administración"], ["categorias", "🏷️ Categorías"], ["usuarios", "👥 Usuarios"]] : []),
  ["sec", "Cuenta"], ["perfil", "👤 Mi perfil"],
];
const TITULOS = { dashboard: "Dashboard", inventario: "Inventario", productos: "Productos", movimientos: "Movimientos de stock", proveedores: "Proveedores", perdidas: "Pérdidas", reportes: "Reportes", categorias: "Categorías", usuarios: "Usuarios", perfil: "Mi perfil" };

function menu() {
  $("nav").innerHTML = MENU().map(([k, t]) =>
    k === "sec" ? `<div class="sec">${t}</div>` : `<button class="item ${S.vista === k ? "on" : ""}" data-v="${k}">${t}</button>`).join("");
  $("nav").querySelectorAll("[data-v]").forEach(b => b.onclick = () => ir(b.dataset.v));
}
function ir(v, filtro) {
  if (!MENU().some(m => m[0] === v)) v = "dashboard";
  S.vista = v;
  if (filtro) {
    S.filtro = filtro;
    S.mostrarAgotados = false;
  }
  S.edit = null;
  $("title").textContent = TITULOS[v];
  $("sidebar").classList.remove("open");
  menu();
  pintar();
}
const pintar = () => { ({ dashboard, inventario, productos, movimientos, proveedores, perdidas, reportes, categorias, usuarios, perfil }[S.vista])(); campana(); };

// ---- carga de datos ----
async function cargar() {
  [S.prods, S.cats, S.provs] = await Promise.all([api("/api/productos"), api("/api/categorias"), api("/api/proveedores")]);
  // Sincroniza caché de agotados si el backend devuelve registros en 0 o si alguno desapareció al agotarse
  const idsActivos = new Set(S.prods.filter(p => Number(p.cantidad) > 0).map(p => Number(p.id)));
  S.agotadosCache = S.agotadosCache.filter(p => !idsActivos.has(Number(p.id)));
  S.prods.filter(p => Number(p.cantidad) <= 0).forEach(p => {
    if (!S.agotadosCache.some(x => Number(x.id) === Number(p.id))) {
      S.agotadosCache.push({ ...p, cantidad: 0 });
    }
  });
}

// ---- DASHBOARD MODERNO CON DEFINICIÓN DE POR VENCER, VENCIDOS Y VIGENTES ----
function animar() {
  document.querySelectorAll("[data-n]").forEach(el => {
    const fin = +el.dataset.n, m = el.dataset.m, t0 = performance.now();
    const paso = t => {
      const k = Math.min(1, (t - t0) / 700);
      const v = fin * (1 - Math.pow(1 - k, 3));
      el.textContent = m ? soles(v) : Math.round(v);
      if (k < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  });
  requestAnimationFrame(() => {
    document.querySelectorAll("[data-w]").forEach(e => {
      e.style.width = e.dataset.w;
    });
  });
}

async function dashboard() {
  const activos = S.prods.filter(p => Number(p.cantidad) > 0);
  const c = { rojo: 0, amarillo: 0, verde: 0 };
  activos.forEach(p => c[estado(p)]++);

  const totalProd = activos.length;
  const t = totalProd || 1;
  const valorTotal = activos.reduce((a, p) => a + Number(p.cantidad) * Number(p.precio), 0);
  const valorRiesgo = activos.filter(p => estado(p) !== "verde").reduce((a, p) => a + Number(p.cantidad) * Number(p.precio), 0);
  const bajosCnt = activos.filter(bajoStock).length;

  const hace7Dias = new Date(Date.now() - 7 * 864e5);
  let movSem = [], perSem = [];
  try {
    const movs = await api("/api/movimientos");
    movSem = movs.filter(m => {
      const f = new Date(String(m.fecha || "").replace(" ", "T"));
      return !Number.isNaN(f.getTime()) && f >= hace7Dias;
    });
  } catch (_) {}
  if (puedeBorrar()) {
    try {
      const perds = await api("/api/perdidas");
      perSem = perds.filter(x => {
        const f = new Date((x.eliminado || "") + "T00:00:00");
        return !Number.isNaN(f.getTime()) && f >= hace7Dias;
      });
    } catch (_) {}
  }
  if (S.vista !== "dashboard") return;

  const entradasSem = movSem.filter(m => m.tipo === "entrada").length;
  const salidasSem = movSem.filter(m => m.tipo === "salida").length;
  const ajustesSem = movSem.filter(m => m.tipo === "ajuste").length;
  const montoPerSem = perSem.reduce((a, x) => a + Number(x.monto || 0), 0);

  const aviso = c.rojo
    ? ["rojo", `⚠️ Tienes ${c.rojo} producto(s) vencido(s). Retíralos del almacén para evitar salidas indebidas.`, "rojo"]
    : c.amarillo
    ? ["amarillo", `🟡 Hay ${c.amarillo} producto(s) por vencer (≤ 15 días). Dales salida primero.`, "amarillo"]
    : ["verde", "✅ Todo el stock está vigente (> 15 días). Sigue rotando desde la fecha más próxima.", "todos"];

  const porCat = {};
  activos.forEach(p => {
    porCat[p.categoria] = (porCat[p.categoria] || 0) + Number(p.cantidad) * Number(p.precio);
  });
  const cats = Object.entries(porCat).sort((x, y) => y[1] - x[1]);
  const maxCat = cats[0]?.[1] || 1;
  const prox = ordenVencimiento(activos).slice(0, 6);

  const rap = rol() === "admin"
    ? [["➕ Agregar producto", "productos"], ["🔄 Registrar salida", "movimientos"], ["🚚 Proveedores", "proveedores"], ["🧾 Reportes", "reportes"]]
    : rol() === "jefe"
    ? [["➕ Agregar producto", "productos"], ["🔄 Registrar salida", "movimientos"], ["🧾 Reportes", "reportes"]]
    : [["➕ Agregar producto", "productos"], ["🔄 Movimientos", "movimientos"], ["🗂️ Inventario", "inventario"]];

  $("main").innerHTML = `
    <div class="aviso aviso-${aviso[0]}">
      <span>${aviso[1]}</span>
      <button class="btn-aviso" id="verAviso">Ver detalle</button>
    </div>

    <div class="grid4">
      <div class="card kpi click" data-f="todos"><small>Lotes con stock</small><b data-n="${totalProd}">0</b><span>Stock bajo: ${bajosCnt}</span></div>
      <div class="card kpi red click" data-f="rojo"><small>Vencidos</small><b data-n="${c.rojo}">0</b><span>Fecha ya pasada</span></div>
      <div class="card kpi kpi-amarillo click" data-f="amarillo"><small>Por vencer</small><b data-n="${c.amarillo}">0</b><span>Vencen en 0 a 15 días</span></div>
      <div class="card kpi"><small>Valor del inventario</small><b data-n="${valorTotal}" data-m="1">0</b><span>En riesgo/vencido: ${soles(valorRiesgo)}</span></div>
    </div>

    <div class="card" style="margin-bottom:16px;background:linear-gradient(135deg,#f8fafc 0%,#eff6ff 100%);border:1px solid #dbeafe">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <div>
          <h4 style="margin:0">📌 Definición de estados del inventario</h4>
          <small class="muted">Criterio de clasificación automático según la fecha de caducidad de cada producto</small>
        </div>
      </div>
      <div class="grid4" style="margin-bottom:0">
        <div class="card click" data-f="amarillo" style="background:#fffbeb;border-left:5px solid var(--ambar);padding:12px 14px">
          <b style="color:#b45309;display:block;margin-bottom:4px">🟡 Por vencer</b>
          <span style="font-size:12.5px;color:#334155">Productos que caducan hoy o dentro de los próximos <b>15 días</b>. Deben venderse o salir primero.</span>
        </div>
        <div class="card click" data-f="rojo" style="background:#fef2f2;border-left:5px solid var(--rojo);padding:12px 14px">
          <b style="color:#b91c1c;display:block;margin-bottom:4px">🔴 Vencidos</b>
          <span style="font-size:12.5px;color:#334155">Productos cuya fecha de caducidad <b>ya pasó</b> (días negativos). No aptos para venta; deben retirarse.</span>
        </div>
        <div class="card click" data-f="verde" style="background:#f0fdf4;border-left:5px solid var(--verde);padding:12px 14px">
          <b style="color:#15803d;display:block;margin-bottom:4px">🟢 Vigentes</b>
          <span style="font-size:12.5px;color:#334155">Productos con más de <b>15 días</b> de vigencia restante. Se conservan para rotación posterior.</span>
        </div>
        <div class="card" style="background:#ffffff;border-left:5px solid #2563eb;padding:12px 14px">
          <b style="color:#1d4ed8;display:block;margin-bottom:4px">🔄 Rotación por lote</b>
          <span style="font-size:12.5px;color:#334155">Si un producto tiene varias fechas, sale primero el de caducidad más próxima hasta agotarse y pasa al siguiente.</span>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <div>
          <h4 style="margin:0">🗓️ Resumen de la semana (últimos 7 días)</h4>
          <small class="muted">Movimientos y retiros registrados en los últimos 7 días</small>
        </div>
        ${puedeBorrar() ? `<button class="btn-aviso" id="irRepSem">Ver reportes</button>` : ""}
      </div>
      <div class="grid4" style="margin-bottom:0">
        <div class="card kpi" style="background:#f8fafc"><small>Movimientos semanales</small><b>${movSem.length}</b><span>${entradasSem} entradas · ${salidasSem} salidas · ${ajustesSem} ajustes</span></div>
        <div class="card kpi" style="background:#f0fdf4"><small>Entradas (7 días)</small><b style="color:var(--verde)">${entradasSem}</b><span>Ingresos registrados</span></div>
        <div class="card kpi" style="background:#fffbeb"><small>Salidas (7 días)</small><b style="color:var(--ambar)">${salidasSem}</b><span>Despachos / ventas</span></div>
        <div class="card kpi ${montoPerSem > 0 ? "red" : ""}" style="background:#fef2f2"><small>Pérdidas semanales</small><b>${soles(montoPerSem)}</b><span>${perSem.length} retiro(s) vencido(s)</span></div>
      </div>
    </div>

    <div class="grid2">
      <div class="card">
        <h4>🚦 Distribución por estado</h4>
        <p class="muted" style="font-size:12px;margin-top:-4px;margin-bottom:12px">Haz clic en un bloque para filtrar el inventario.</p>
        ${[
          ["amarillo", "Por vencer (0 a 15 días)", "var(--ambar)", "#fffbeb", "Prioridad de salida"],
          ["rojo", "Vencidos (fecha pasada)", "var(--rojo)", "#fef2f2", "Retirar del almacén"],
          ["verde", "Vigentes (más de 15 días)", "var(--verde)", "#f0fdf4", "Vigencia amplia"]
        ].map(([k, tit, col, bg, tip]) => `
          <div data-f="${k}" style="cursor:pointer;background:${bg};border-left:5px solid ${col};border-radius:10px;padding:12px 14px;margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:baseline">
              <span style="font-size:13px;font-weight:700">${tit}</span>
              <b style="font-size:22px;color:${col}" data-n="${c[k]}">0</b>
            </div>
            <div style="height:8px;background:#fff;border-radius:99px;margin:8px 0 6px;overflow:hidden">
              <div style="height:100%;width:0;background:${col};border-radius:99px;transition:width .9s ease" data-w="${(c[k] / t) * 100}%"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--texto-suave)">
              <span>${Math.round((c[k] / t) * 100)}% del total</span>
              <span>${tip}</span>
            </div>
          </div>
        `).join("")}
      </div>

      <div class="card">
        <h4>💰 Valor por categoría</h4>
        <p class="muted" style="font-size:12px;margin-top:-4px;margin-bottom:12px">Monto total calculado por cantidad y precio unitario.</p>
        ${cats.map(([n, v]) => `
          <div class="hfila">
            <span>${ICONOS[n] || "📦"} ${esc(n)}</span>
            <div class="hpista"><div class="hbar" style="width:0" data-w="${(v / maxCat) * 100}%"></div></div>
            <span class="hval">${soles(v)}</span>
          </div>
        `).join("") || '<div class="vacio">Sin datos</div>'}
      </div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
        <h4 style="margin:0">⏳ Próximos por fecha de caducidad</h4>
        <span class="muted" style="font-size:12px">Primero los más cercanos a vencer; al final los de mayor duración</span>
      </div>
      ${prox.map((p, i) => {
        const k = estado(p), d = dias(p);
        const tiempoTxt = d < 0 ? `Venció hace ${-d} d` : d === 0 ? "Vence hoy" : `Vence en ${d} día(s)`;
        return `
          <div class="prox" data-f="${k}">
            <div>
              ${ICONOS[p.categoria] || "📦"} <b>#${i + 1} ${esc(p.nombre)}</b>
              <small>${p.cantidad} ${esc(p.unidad)} · Vence ${p.vence}${bajoStock(p) ? " · ⚠️ Stock bajo" : ""}</small>
            </div>
            <span class="tag ${TAG[k][0]}">${tiempoTxt}</span>
          </div>
        `;
      }).join("") || '<div class="vacio">Sin productos</div>'}
    </div>

    <div class="rapidos">
      ${rap.map(([t, v]) => `<button class="rapido" data-go="${v}">${t}</button>`).join("")}
    </div>
    <p class="muted" style="font-size:12px">Se actualiza automáticamente cada 30 segundos.</p>
  `;

  $("verAviso").onclick = () => ir("inventario", aviso[2]);
  if ($("irRepSem")) $("irRepSem").onclick = () => ir("reportes");
  $("main").querySelectorAll("[data-f]").forEach(e => e.onclick = () => ir("inventario", e.dataset.f));
  $("main").querySelectorAll("[data-go]").forEach(e => e.onclick = () => ir(e.dataset.go));
  animar();
}

// ---- INVENTARIO (FILTRO AGOTADOS INTERACTIVO) + DESCARGA EXCEL ----
function inventario() {
  const todosLotes = obtenerTodosLosLotes();
  const activos = todosLotes.filter(p => Number(p.cantidad) > 0);
  const agotados = todosLotes.filter(p => Number(p.cantidad) <= 0);

  const cnt = { todos: activos.length, rojo: 0, amarillo: 0, verde: 0 };
  activos.forEach(p => cnt[estado(p)]++);

  const catSel = S.qcat || "todas";
  const soloBajos = Boolean(S.soloBajos);

  const baseFuente = S.mostrarAgotados ? agotados : activos;
  const lista = ordenVencimiento(
    baseFuente.filter(p => {
      const okEst = S.mostrarAgotados ? true : (S.filtro === "todos" || estado(p) === S.filtro);
      const okTxt = p.nombre.toLowerCase().includes(S.q.toLowerCase());
      const okCat = catSel === "todas" || p.categoria === catSel;
      const okBaj = S.mostrarAgotados ? true : (!soloBajos || bajoStock(p));
      return okEst && okTxt && okCat && okBaj;
    })
  );

  $("main").innerHTML = `
    <div class="filtros" style="gap:8px;flex-wrap:wrap;align-items:center">
      <input id="bq" class="buscador" placeholder="Buscar producto..." value="${esc(S.q)}">
      <select id="bcat" style="padding:8px 10px;border-radius:8px;border:1px solid #cbd5e1;background:#fff">
        <option value="todas" ${catSel === "todas" ? "selected" : ""}>Todas las categorías</option>
        ${S.cats.map(c => `<option value="${esc(c.nombre)}" ${catSel === c.nombre ? "selected" : ""}>${esc(c.nombre)}</option>`).join("")}
      </select>
      <button class="chip ${soloBajos && !S.mostrarAgotados ? "on" : ""}" id="bbajos">⚠️ Stock bajo</button>
      <button class="chip ${S.mostrarAgotados ? "on" : ""}" id="bAgot" style="${S.mostrarAgotados ? "background:#dc2626;color:#fff;border-color:#dc2626" : ""}">🚫 Agotados (${agotados.length})</button>
      ${[["todos", "Todos"], ["rojo", "🔴 Vencidos"], ["amarillo", "🟡 Por vencer"], ["verde", "🟢 Vigentes"]].map(([k, t]) =>
        `<button class="chip ${!S.mostrarAgotados && S.filtro === k ? "on" : ""}" data-k="${k}">${t} (${cnt[k]})</button>`
      ).join("")}
      <button class="btn-aviso" id="expInvExcel" title="Descargar productos del inventario en Excel">📥 Excel</button>
    </div>
    <div class="card tabla-wrap">
      <table>
        <thead>
          <tr><th>Orden</th><th>Producto</th><th>Categoría</th><th>Proveedor</th><th>Stock</th><th>Total vigente</th><th>Valor</th><th>Vence</th><th>Días</th><th>Estado</th></tr>
        </thead>
        <tbody>
          ${lista.map((p, idx) => {
            const k = estado(p), d = dias(p);
            const totVig = stockVigentePorNombre(p.nombre);
            const esAgot = Number(p.cantidad) <= 0;
            return `<tr class="fila-${k}">
              <td><b>#${idx + 1}</b></td>
              <td><b>${esc(p.nombre)}</b></td>
              <td>${esc(p.categoria)}</td>
              <td>${esc(p.proveedor || "—")}</td>
              <td>${p.cantidad} ${esc(p.unidad)}${esAgot ? ' <span class="tag t-red">Agotado</span>' : bajoStock(p) ? ' <span class="tag t-warn" title="Por debajo del stock mínimo">Stock bajo</span>' : ""}</td>
              <td><b>${totVig}</b> ${esc(p.unidad)}</td>
              <td>${soles(p.cantidad * p.precio)}</td>
              <td>${p.vence}</td>
              <td>${d}</td>
              <td><span class="tag ${TAG[k][0]}">${TAG[k][1]}</span></td>
            </tr>`;
          }).join("") || `<tr><td colspan="10" class="vacio">${S.mostrarAgotados ? "No hay productos agotados registrados." : "No hay productos con estos filtros."}</td></tr>`}
        </tbody>
      </table>
    </div>`;

  $("bq").oninput = ev => { S.q = ev.target.value; const pos = ev.target.selectionStart; inventario(); $("bq").focus(); $("bq").setSelectionRange(pos, pos); };
  $("bcat").onchange = ev => { S.qcat = ev.target.value; inventario(); };
  $("bbajos").onclick = () => { S.mostrarAgotados = false; S.soloBajos = !S.soloBajos; inventario(); };
  $("bAgot").onclick = () => { S.mostrarAgotados = !S.mostrarAgotados; inventario(); };
  $("main").querySelectorAll("[data-k]").forEach(b => b.onclick = () => { S.mostrarAgotados = false; S.filtro = b.dataset.k; inventario(); });
  $("expInvExcel").onclick = () => {
    const todosOrdenados = ordenVencimiento(S.mostrarAgotados ? agotados : activos);
    descargarExcel("inventario_bodega_susanita.xls", "Inventario - Bodega Susanita", todosOrdenados, [
      { label: "Orden", val: (_, i) => i + 1 },
      { label: "Producto", val: p => p.nombre },
      { label: "Categoría", val: p => p.categoria },
      { label: "Proveedor", val: p => p.proveedor || "Sin proveedor" },
      { label: "Cantidad", val: p => p.cantidad },
      { label: "Total Vigente Producto", val: p => stockVigentePorNombre(p.nombre) },
      { label: "Unidad", val: p => p.unidad },
      { label: "Precio Unitario", val: p => Number(p.precio).toFixed(2) },
      { label: "Valor Total", val: p => (Number(p.cantidad) * Number(p.precio)).toFixed(2) },
      { label: "Vence", val: p => p.vence },
      { label: "Días Restantes", val: p => dias(p) },
      { label: "Estado", val: p => Number(p.cantidad) <= 0 ? "Agotado" : TAG[estado(p)][1] }
    ]);
  };
}

// ---- PRODUCTOS (FILTRO AGOTADOS INTERACTIVO + EDICIÓN Y NUEVA FECHA) ----
function productos() {
  const todosLotes = obtenerTodosLosLotes();
  const agotadosCnt = todosLotes.filter(p => Number(p.cantidad) <= 0).length;
  const e = S.edit ? todosLotes.find(p => p.id === S.edit) : null, v = e || {};
  const opt = (arr, sel, val) => arr.map(x => `<option value="${esc(val(x))}" ${sel == val(x) ? "selected" : ""}>${esc(x.nombre)}</option>`).join("");

  const filtrados = todosLotes.filter(p => {
    if (p.id === S.edit) return true;
    if (!conStock(p)) return false;
    if (!p.nombre.toLowerCase().includes(S.q.toLowerCase())) return false;
    if (S.mostrarAgotados) return true;
    return S.filtro === "todos" || estado(p) === S.filtro;
  });
  const lista = ordenVencimiento(filtrados);

  $("main").innerHTML = `
    <div class="card form-card ${e ? "editando" : ""}">
      <h4>${e ? "✏️ Editar fecha / cantidad o agregar nueva fecha de caducidad" : "➕ Agregar producto"}</h4>
      ${e ? `<p class="muted" style="font-size:12px;margin-top:-4px;margin-bottom:10px">Modifica la fecha de <b>Vence</b> y usa <b>Actualizar</b> para cambiar este registro, o <b>➕ Agregar con esta nueva fecha</b> para guardar otra fecha y que salga primero la más próxima a vencer.</p>` : ""}
      <form id="fp" class="form-prod">
        <div><label>Nombre</label><input id="fn" value="${esc(v.nombre)}" required></div>
        <div><label>Categoría</label><select id="fc">${opt(S.cats, v.categoria, x => x.nombre)}</select></div>
        <div><label>Proveedor</label><select id="fv"><option value="">— Sin proveedor —</option>${opt(S.provs, v.proveedorId, x => x.id)}</select></div>
        <div><label>Cantidad</label><input id="fq" type="number" step="any" min="0.01" value="${v.cantidad ?? ""}" required></div>
        <div><label>Unidad</label><input id="fu" placeholder="kg, L, unid" value="${esc(v.unidad)}" required></div>
        <div><label>Precio unitario</label><input id="fpz" type="number" step="any" min="0" value="${v.precio ?? ""}" required></div>
        <div><label>Nueva fecha de vence</label><input id="fd" type="date" value="${v.vence || ""}" required></div>
        <div><label>Stock mínimo</label><input id="fmin" type="number" step="any" min="0" placeholder="0 = sin alerta" value="${v.stockMinimo ?? ""}"></div>
        <button class="btn" type="submit">${e ? "Actualizar" : "Guardar"}</button>
        ${e ? `<button class="btn" type="button" id="fnuevoLote" style="background:#0284c7">➕ Agregar con esta nueva fecha</button><button class="btn-cancelar" type="button" id="fx">Cancelar</button>` : ""}
      </form><div id="fe" class="alert" hidden></div></div>
    <div class="filtros">
      <input id="bq" class="buscador" placeholder="Buscar producto..." value="${esc(S.q)}">
      <button class="chip ${S.mostrarAgotados ? "on" : ""}" id="bAgot" style="${S.mostrarAgotados ? "background:#dc2626;color:#fff;border-color:#dc2626" : ""}">🚫 Agotados (${agotadosCnt})</button>
      ${[["todos", "Todos"], ["rojo", "🔴 Vencidos"], ["amarillo", "🟡 Por vencer"], ["verde", "🟢 Vigentes"]].map(([k, t]) => `<button class="chip ${!S.mostrarAgotados && S.filtro === k ? "on" : ""}" data-k="${k}">${t}</button>`).join("")}
    </div>
    ${lista.length ? `<div class="pgrid">${lista.map(p => tarjeta(p)).join("")}</div>` : `<div class="vacio">${S.mostrarAgotados ? "No hay productos agotados para mostrar." : "No hay productos para mostrar."}</div>`}`;

  $("fp").onsubmit = ev => guardar(ev, false);
  if (e) {
    $("fnuevoLote").onclick = ev => guardar(ev, true);
    $("fx").onclick = () => { S.edit = null; productos(); };
  }
  $("bAgot").onclick = () => { S.mostrarAgotados = !S.mostrarAgotados; productos(); };
  $("bq").oninput = ev => { S.q = ev.target.value; const pos = ev.target.selectionStart; productos(); $("bq").focus(); $("bq").setSelectionRange(pos, pos); };
  $("main").querySelectorAll("[data-k]").forEach(b => b.onclick = () => { S.mostrarAgotados = false; S.filtro = b.dataset.k; productos(); });
  $("main").querySelectorAll("[data-e]").forEach(b => b.onclick = () => { S.edit = +b.dataset.e; productos(); scrollTo(0, 0); $("main").scrollTop = 0; });
  $("main").querySelectorAll("[data-d]").forEach(b => b.onclick = () => borrar(+b.dataset.d));
}

function tarjeta(p) {
  const k = estado(p), d = dias(p), [tc, tt] = TAG[k], vida = Math.max(0, Math.min(100, d / 90 * 100));
  const msg = d < 0 ? `Venció hace ${-d} día(s)` : d === 0 ? "Vence hoy" : `Vence en ${d} día(s)`;
  const agotadoTag = Number(p.cantidad) <= 0 ? ' <span class="tag t-red">Agotado</span>' : "";
  return `<div class="pcard est-${k}">
    <div class="pcard-cab"><div class="pcard-icono">${ICONOS[p.categoria] || "📦"}</div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${agotadoTag}<span class="tag ${tc}">${tt}</span></div></div>
    <div><h4>${esc(p.nombre)}</h4><div class="pcard-sub">${esc(p.categoria)} · ${esc(p.proveedor || "Sin proveedor")}</div></div>
    <div class="pcard-datos"><div><b>${p.cantidad} ${esc(p.unidad)}${bajoStock(p) ? " ⚠️" : ""}</b><span>${bajoStock(p) ? "Stock bajo (mín. " + p.stockMinimo + ")" : "Cantidad"}</span></div><div><b>${soles(p.precio)}</b><span>Precio unit.</span></div></div>
    <div class="vida"><div class="vida-bar" style="width:${vida}%"></div></div>
    <div class="pcard-fecha">📅 Vence: <b>${p.vence}</b> — ${msg}</div>
    <div class="pcard-acc"><button class="btn-edit" data-e="${p.id}">Editar</button>${puedeBorrar() ? `<button class="btn-del" data-d="${p.id}">Eliminar</button>` : ""}</div></div>`;
}

async function guardar(ev, comoNuevoRegistro = false) {
  ev.preventDefault(); $("fe").hidden = true;
  if (!$("fp").reportValidity()) return;
  const body = JSON.stringify({
    nombre: $("fn").value.trim(),
    categoria: $("fc").value,
    proveedorId: $("fv").value,
    cantidad: $("fq").value,
    unidad: $("fu").value.trim(),
    precio: $("fpz").value,
    vence: $("fd").value,
    stockMinimo: $("fmin").value
  });
  try {
    if (S.edit && !comoNuevoRegistro) {
      await api("/api/productos/" + S.edit, { method: "PUT", body });
      toast("✅ Producto y fecha actualizados", "ok");
    } else {
      await api("/api/productos", { method: "POST", body });
      toast("✅ Registro agregado con su fecha de caducidad", "ok");
    }
    S.edit = null;
    S.mostrarAgotados = false;
    await cargar();
    productos();
  } catch (e) { $("fe").textContent = e.message; $("fe").hidden = false; }
}

async function borrar(id) {
  const todosLotes = obtenerTodosLosLotes();
  const p = todosLotes.find(x => x.id === id);
  if (!confirm(`¿Eliminar "${p.nombre}"?` + (estado(p) === "rojo" ? "\nEstá vencido: se registrará como pérdida." : ""))) return;
  try {
    await api("/api/productos/" + id, { method: "DELETE" });
    S.agotadosCache = S.agotadosCache.filter(x => Number(x.id) !== Number(id));
    await cargar();
    productos();
  } catch (e) { alert(e.message); }
}

// ---- MOVIMIENTOS DE STOCK CON CONTEO ENCADENADO + EXCEL ----
const TIPO_MOV = { entrada: ["t-ok", "⬆️ Entrada"], salida: ["t-red", "⬇️ Salida"], ajuste: ["t-blue", "🔧 Ajuste"] };

async function aplicarSalidaEnCascada(productoSeleccionado, cantidadTotal, motivo) {
  const sim = simularSalidaCascada(productoSeleccionado, cantidadTotal);
  if (!sim.detalle.length || sim.insuficiente) {
    throw new Error(`Stock vigente insuficiente para "${productoSeleccionado.nombre}". Disponible: ${sim.totalDisponible} ${productoSeleccionado.unidad}`);
  }

  let descontadoAcumulado = 0;
  let lotesActualizados = 0;
  let ultimoRes = null;

  for (let i = 0; i < sim.detalle.length; i++) {
    const paso = sim.detalle[i];
    if (paso.descontado <= 0) continue;
    const motivoPaso = sim.detalle.filter(x => x.descontado > 0).length > 1
      ? `${motivo ? motivo + " · " : ""}Salida encadenada lote vence ${paso.vence}`
      : motivo;
    try {
      ultimoRes = await api("/api/movimientos", {
        method: "POST",
        body: JSON.stringify({
          productoId: paso.id,
          tipo: "salida",
          cantidad: paso.descontado,
          motivo: motivoPaso
        })
      });
      if (paso.agotado && paso.loteRef) {
        if (!S.agotadosCache.some(x => Number(x.id) === Number(paso.id))) {
          S.agotadosCache.push({ ...paso.loteRef, cantidad: 0 });
        }
      }
      descontadoAcumulado = Number((descontadoAcumulado + paso.descontado).toFixed(4));
      lotesActualizados++;
    } catch (err) {
      throw new Error(
        `Error en lote #${i + 1} (vence ${paso.vence}): ${err.message}. ` +
        `Se descontaron ${descontadoAcumulado} ${productoSeleccionado.unidad} en ${lotesActualizados} lote(s) antes de detenerse.`
      );
    }
  }
  return { ultimoRes, sim };
}

async function movimientos() {
  $("main").innerHTML = `<div class="vacio">Cargando...</div>`;
  let M;
  try { M = await api("/api/movimientos"); } catch (e) { $("main").innerHTML = `<div class="vacio">${esc(e.message)}</div>`; return; }
  if (S.vista !== "movimientos") return;
  const bajos = S.prods.filter(p => Number(p.cantidad) > 0 && bajoStock(p)).sort((x, y) => x.cantidad / x.stockMinimo - y.cantidad / y.stockMinimo);
  const hoy = new Date().toISOString().slice(0, 10), deHoy = M.filter(m => m.fecha.startsWith(hoy));
  const sum = t => deHoy.filter(m => m.tipo === t).length;
  const disponiblesSelect = ordenVencimiento(S.prods.filter(p => Number(p.cantidad) > 0));

  $("main").innerHTML = `
    <div class="grid4">
      <div class="card kpi"><small>Movimientos hoy</small><b>${deHoy.length}</b><span>${sum("entrada")} entradas · ${sum("salida")} salidas</span></div>
      <div class="card kpi ${bajos.length ? "red" : ""}"><small>Stock bajo el mínimo</small><b>${bajos.length}</b><span>producto(s) por reponer</span></div>
    </div>
    <div class="card form-card"><h4>🔄 Registrar movimiento</h4>
      <form id="fm" class="form-prod">
        <div><label>Producto</label><select id="mp" required><option value="">— Elige un producto —</option>${disponiblesSelect.map(p => `<option value="${p.id}">${esc(p.nombre)} · vence ${p.vence} (${p.cantidad} ${esc(p.unidad)})</option>`).join("")}</select></div>
        <div><label>Tipo</label><select id="mt"><option value="entrada">⬆️ Entrada (ingreso)</option><option value="salida">⬇️ Salida (venta, consumo, merma)</option>${rol() !== "operario" ? '<option value="ajuste">🔧 Ajuste (conteo real)</option>' : ""}</select></div>
        <div><label id="mcl">Cantidad</label><input id="mc" type="number" step="any" min="0" required></div>
        <div><label>Motivo (opcional)</label><input id="mm" maxlength="200" placeholder="Compra, venta, merma, conteo..."></div>
        <button class="btn" type="submit">Registrar</button>
      </form>
      <div id="mhint" class="muted" style="font-size:13px;margin-top:10px"></div>
      <div id="mcascada" style="margin-top:8px;font-size:12.5px"></div>
      <div id="me" class="alert" hidden></div>
    </div>
    ${bajos.length ? `<div class="card tabla-wrap"><h4>📉 Productos con stock bajo</h4><table><thead><tr><th>Producto</th><th>Proveedor</th><th>Stock actual</th><th>Mínimo</th><th></th></tr></thead><tbody>
      ${bajos.map(p => `<tr><td><b>${esc(p.nombre)}</b></td><td>${esc(p.proveedor || "—")}</td><td><span class="tag t-red">${p.cantidad} ${esc(p.unidad)}</span></td><td>${p.stockMinimo} ${esc(p.unidad)}</td><td><button class="btn-edit" data-rep="${p.id}">Registrar entrada</button></td></tr>`).join("")}</tbody></table></div>` : ""}
    <div class="filtros">
      <input id="bm" class="buscador" placeholder="Buscar en el historial por producto o motivo..." value="${esc(S.qm || "")}">
      ${[["todos", "Todos"], ["entrada", "⬆️ Entradas"], ["salida", "⬇️ Salidas"], ["ajuste", "🔧 Ajustes"]].map(([k, t]) => `<button class="chip ${(S.tm || "todos") === k ? "on" : ""}" data-t="${k}">${t}</button>`).join("")}
      <button class="btn-aviso" id="expMovExcel">📥 Excel</button>
    </div>
    <div class="card tabla-wrap"><h4 id="mTit"></h4><table><thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Stock</th><th>Motivo</th><th>Usuario</th></tr></thead><tbody id="mBody"></tbody></table></div>`;

  const filtrarMovs = () => {
    const q = (S.qm || "").trim().toLowerCase(), t = S.tm || "todos";
    return M.filter(m => (t === "todos" || m.tipo === t) && (!q || m.producto.toLowerCase().includes(q) || (m.motivo || "").toLowerCase().includes(q)));
  };

  const hist = () => {
    const f = filtrarMovs();
    $("mTit").textContent = `Historial (${f.length})`;
    $("mBody").innerHTML = f.map(m => { const [c, l] = TIPO_MOV[m.tipo], u = esc(m.unidad || "");
      return `<tr><td>${m.fecha}</td><td><b>${esc(m.producto)}</b></td><td><span class="tag ${c}">${l}</span></td><td>${m.tipo === "entrada" ? "+" : m.tipo === "salida" ? "−" : "±"}${Number(m.cantidad)} ${u}</td><td>${Number(m.anterior)} → <b>${Number(m.nuevo)}</b></td><td>${esc(m.motivo || "—")}</td><td>${esc(m.usuario || "—")}</td></tr>`; }).join("")
      || '<tr><td colspan="7" class="vacio">Aún no hay movimientos.</td></tr>';
  };
  hist();
  $("bm").oninput = ev => { S.qm = ev.target.value; hist(); };
  $("main").querySelectorAll("[data-t]").forEach(b => b.onclick = () => { S.tm = b.dataset.t; movimientos(); });
  $("expMovExcel").onclick = () => {
    descargarExcel("movimientos_bodega_susanita.xls", "Historial de movimientos - Bodega Susanita", filtrarMovs(), [
      { label: "Fecha", val: m => m.fecha },
      { label: "Producto", val: m => m.producto },
      { label: "Tipo", val: m => m.tipo },
      { label: "Cantidad", val: m => Number(m.cantidad) },
      { label: "Unidad", val: m => m.unidad || "" },
      { label: "Stock Anterior", val: m => Number(m.anterior) },
      { label: "Stock Nuevo", val: m => Number(m.nuevo) },
      { label: "Motivo", val: m => m.motivo || "" },
      { label: "Usuario", val: m => m.usuario || "" }
    ]);
  };

  const hint = () => {
    const p = S.prods.find(x => x.id == $("mp").value);
    const t = $("mt").value;
    const rawC = $("mc").value;
    const c = Number(rawC);
    $("mcl").textContent = t === "ajuste" ? "Nuevo stock (conteo real)" : "Cantidad";
    $("mcascada").innerHTML = "";

    if (!p) {
      $("mhint").textContent = "";
      return;
    }

    if (t === "salida") {
      const sim = simularSalidaCascada(p, rawC === "" ? 0 : c);
      $("mhint").textContent = `Total vigente disponible para "${p.nombre}": ${sim.totalDisponible} ${p.unidad}` +
        (rawC !== ""
          ? (sim.insuficiente
            ? " (stock vigente insuficiente en los lotes)"
            : ` → quedará en ${sim.totalRestanteGlobal} ${p.unidad}`)
          : "");

      if (sim.detalle.length) {
        $("mcascada").innerHTML = sim.detalle.map((d, idx) =>
          `<div style="padding:4px 0;color:#334155">• Lote #${idx + 1} (vence <b>${d.vence}</b>): <b>${d.antes}</b> → descontar <b>${d.descontado}</b> → queda <b>${d.despues}</b> ${esc(d.unidad)}${d.agotado ? ' <span class="tag t-warn">Agotado · pasa al siguiente</span>' : ""}</div>`
        ).join("");
      }
      return;
    }

    const nuevo = t === "entrada" ? Number(p.cantidad) + c : c;
    $("mhint").textContent = `Stock actual: ${p.cantidad} ${p.unidad}` +
      (rawC !== ""
        ? ` → quedará en ${nuevo} ${p.unidad}` + (nuevo < 0 ? " (stock insuficiente)" : Number(p.stockMinimo) > 0 && nuevo <= Number(p.stockMinimo) ? " ⚠️ por debajo del mínimo" : "")
        : "");
  };

  hint();
  ["mp", "mt", "mc"].forEach(i => { $(i).oninput = hint; $(i).onchange = hint; });
  $("main").querySelectorAll("[data-rep]").forEach(b => b.onclick = () => { $("mp").value = b.dataset.rep; $("mt").value = "entrada"; hint(); $("mc").focus(); scrollTo({ top: 0, behavior: "smooth" }); });

  $("fm").onsubmit = async ev => {
    ev.preventDefault(); $("me").hidden = true;
    const tipo = $("mt").value;
    const p = S.prods.find(x => x.id == $("mp").value);
    try {
      if (tipo === "salida" && p) {
        const { sim } = await aplicarSalidaEnCascada(p, Number($("mc").value), $("mm").value);
        await cargar();
        toast(`✅ Salida registrada en cascada. Total restante: ${sim.totalRestanteGlobal} ${p.unidad}`, "ok");
        pintar();
        return;
      }
      const r = await api("/api/movimientos", {
        method: "POST",
        body: JSON.stringify({ productoId: $("mp").value, tipo, cantidad: $("mc").value, motivo: $("mm").value })
      });
      await cargar();
      toast("✅ " + r.mensaje + ". Stock actual: " + r.stock, "ok");
      pintar();
    } catch (e) { $("me").textContent = e.message; $("me").hidden = false; }
  };
}

// ---- PÉRDIDAS + EXCEL ----
async function perdidas() {
  $("main").innerHTML = `<div class="vacio">Cargando...</div>`;
  const L = await api("/api/perdidas"), total = L.reduce((a, x) => a + Number(x.monto), 0);
  $("main").innerHTML = `
    <div class="grid4"><div class="card kpi red"><small>Pérdida total</small><b>${soles(total)}</b><span>${L.length} registro(s)</span></div></div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <h4 style="margin:0">Productos eliminados por vencimiento</h4>
        <button class="btn-aviso" id="expPerExcel">📥 Excel</button>
      </div>
      ${L.length ? `<table><thead><tr><th>Producto</th><th>Cantidad</th><th>Monto perdido</th><th>Venció</th><th>Eliminado</th><th>Por</th></tr></thead><tbody>
      ${L.map(x => `<tr><td>${esc(x.nombre)}</td><td>${x.cantidad} ${esc(x.unidad)}</td><td>${soles(x.monto)}</td><td>${x.vence}</td><td>${x.eliminado}</td><td>${esc(x.usuario || "—")}</td></tr>`).join("")}</tbody></table>` : `<div class="vacio">Aún no hay pérdidas registradas.</div>`}
    </div>`;
  $("expPerExcel").onclick = () => {
    descargarExcel("perdidas_bodega_susanita.xls", "Pérdidas por vencimiento - Bodega Susanita", L, [
      { label: "Producto", val: x => x.nombre },
      { label: "Cantidad", val: x => x.cantidad },
      { label: "Unidad", val: x => x.unidad },
      { label: "Monto Perdido", val: x => Number(x.monto).toFixed(2) },
      { label: "Venció", val: x => x.vence },
      { label: "Eliminado", val: x => x.eliminado },
      { label: "Usuario", val: x => x.usuario || "" }
    ]);
  };
}

// ---- REPORTES (BUSCADOR + FILTROS + AGOTADOS + EXCEL) ----
function reportes() {
  const todosLotes = obtenerTodosLosLotes();
  const agotadosCnt = todosLotes.filter(p => Number(p.cantidad) <= 0).length;
  const filtroValido = ["todos", "rojo", "amarillo", "verde"].includes(S.filtro) ? S.filtro : "todos";
  const qRep = (S.qrep || "").trim().toLowerCase();

  const base = todosLotes.filter(p => {
    if (!conStock(p)) return false;
    if (!S.mostrarAgotados && filtroValido !== "todos" && estado(p) !== filtroValido) return false;
    if (!qRep) return true;
    return (
      String(p.nombre || "").toLowerCase().includes(qRep) ||
      String(p.proveedor || "").toLowerCase().includes(qRep) ||
      String(p.categoria || "").toLowerCase().includes(qRep)
    );
  });
  const f = ordenVencimiento(base);
  const valorRep = f.reduce((a, p) => a + Number(p.cantidad) * Number(p.precio), 0);

  $("main").innerHTML = `
    <div class="card">
      <div class="reporte-cab">
        <div>
          <h4>Reporte de inventario</h4>
          <span class="muted">Fecha: ${esc(new Date().toLocaleDateString("es-PE"))} · Vista: <b>${S.mostrarAgotados ? "AGOTADOS" : filtroValido.toUpperCase()}</b></span>
        </div>
        <div class="reporte-botones no-print" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input id="bqrep" class="buscador" style="min-width:190px" placeholder="Buscar producto o proveedor..." value="${esc(S.qrep || "")}">
          <button class="chip ${S.mostrarAgotados ? "on" : ""}" id="bAgotRep" style="${S.mostrarAgotados ? "background:#dc2626;color:#fff;border-color:#dc2626" : ""}">🚫 Agotados (${agotadosCnt})</button>
          ${[["todos", "Todos"], ["rojo", "Vencidos"], ["amarillo", "Por vencer"], ["verde", "Vigentes"]].map(([k, t]) =>
            `<button class="chip ${!S.mostrarAgotados && filtroValido === k ? "on" : ""}" data-k="${k}">${t}</button>`
          ).join("")}
          <button class="btn-aviso" id="expRepExcel">📥 Excel</button>
          <button class="btn-aviso" id="imp">🖨️ Imprimir</button>
        </div>
      </div>
      <div class="reporte-resumen" style="margin:12px 0">
        <b>${f.length}</b> producto(s) · Valor total: <b>${soles(valorRep)}</b>
      </div>
      <div class="tabla-wrap">
        <table>
          <thead>
            <tr><th>#</th><th>Producto</th><th>Categoría</th><th>Proveedor</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th><th>Vence</th><th>Estado</th></tr>
          </thead>
          <tbody>
            ${f.map((p, i) => {
              const k = estado(p);
              const esAgot = Number(p.cantidad) <= 0;
              return `<tr>
                <td><b>#${i + 1}</b></td>
                <td><b>${esc(p.nombre)}</b></td>
                <td>${esc(p.categoria)}</td>
                <td>${esc(p.proveedor || "—")}</td>
                <td>${p.cantidad} ${esc(p.unidad)}</td>
                <td>${soles(p.precio)}</td>
                <td><b>${soles(Number(p.cantidad) * Number(p.precio))}</b></td>
                <td>${p.vence}</td>
                <td>${esAgot ? '<span class="tag t-red">Agotado</span>' : `<span class="tag ${TAG[k][0]}">${TAG[k][1]}</span>`}</td>
              </tr>`;
            }).join("") || `<tr><td colspan="9" class="vacio">${S.mostrarAgotados ? "No hay productos agotados para este reporte." : "No hay productos para este filtro."}</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

  $("bqrep").oninput = ev => { S.qrep = ev.target.value; const pos = ev.target.selectionStart; reportes(); $("bqrep").focus(); $("bqrep").setSelectionRange(pos, pos); };
  $("bAgotRep").onclick = () => { S.mostrarAgotados = !S.mostrarAgotados; reportes(); };
  $("imp").onclick = () => print();
  $("main").querySelectorAll("[data-k]").forEach(b => b.onclick = () => { S.mostrarAgotados = false; S.filtro = b.dataset.k; reportes(); });
  $("expRepExcel").onclick = () => {
    descargarExcel(`reporte_${S.mostrarAgotados ? "agotados" : filtroValido}_bodega_susanita.xls`, `Reporte de inventario (${S.mostrarAgotados ? "agotados" : filtroValido}) - Bodega Susanita`, f, [
      { label: "#", val: (_, i) => i + 1 },
      { label: "Producto", val: p => p.nombre },
      { label: "Categoría", val: p => p.categoria },
      { label: "Proveedor", val: p => p.proveedor || "Sin proveedor" },
      { label: "Cantidad", val: p => p.cantidad },
      { label: "Unidad", val: p => p.unidad },
      { label: "Precio Unitario", val: p => Number(p.precio).toFixed(2) },
      { label: "Subtotal", val: p => (Number(p.cantidad) * Number(p.precio)).toFixed(2) },
      { label: "Vence", val: p => p.vence },
      { label: "Estado", val: p => Number(p.cantidad) <= 0 ? "Agotado" : TAG[estado(p)][1] }
    ]);
  };
}

// ---- Utilidad para acciones con aviso de error ----
async function accion(fn) { try { await fn(); await cargar(); pintar(); } catch (e) { alert(e.message); } }
const val = id => $(id).value.trim();
const ST = "style=\"flex:0 0 auto\"";

// ---- PROVEEDORES ----
const filaProv = x => `<tr><td><b>${esc(x.nombre)}</b></td><td>${esc(x.ruc || "—")}</td><td>${esc(x.telefono || "—")}</td><td>${esc(x.correo || "—")}</td><td>${x.productos}</td><td style="white-space:nowrap"><button class="btn-del" style="color:var(--azul);border-color:var(--azul);background:#eff6ff" data-e="${x.id}">Editar</button> ${esAdmin() ? `<button class="btn-del" data-d="${x.id}">Eliminar</button>` : ""}</td></tr>`;
const sinTildes = t => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const filtrarProvs = q => { const t = sinTildes(q.trim()); return t ? S.provs.filter(x => sinTildes(x.nombre).includes(t) || String(x.ruc || "").includes(t)) : S.provs; };
function proveedores() {
  $("main").innerHTML = `<div class="card form-card"><h4 id="fpTit">➕ Agregar proveedor</h4><form id="fp" class="form-linea">
    <div><label>Nombre</label><input id="pn" required></div><div><label>RUC</label><input id="pr" required inputmode="numeric" maxlength="11" pattern="\\d{11}" title="11 dígitos numéricos" placeholder="20123456789"></div><div><label>Teléfono</label><input id="pt"></div><div><label>Correo</label><input id="pc" type="email"></div>
    <button class="btn" id="pg" ${ST}>Guardar</button><button type="button" class="btn" id="pcan" hidden style="flex:0 0 auto;background:#64748b">Cancelar</button></form></div>
    <div class="filtros"><input id="bp" class="buscador" placeholder="Buscar proveedor por RUC o nombre..." value="${esc(S.qp || "")}"></div>
    <div class="card tabla-wrap"><h4 id="provTit"></h4><table><thead><tr><th>Nombre</th><th>RUC</th><th>Teléfono</th><th>Correo</th><th>Productos</th><th></th></tr></thead><tbody id="provBody"></tbody></table>
    ${esAdmin() ? "" : '<p class="muted" style="font-size:12px">Solo el administrador puede eliminar proveedores.</p>'}</div>`;
  let editId = null;
  const modo = x => {
    editId = x ? x.id : null;
    $("fpTit").textContent = x ? "✏️ Editar proveedor" : "➕ Agregar proveedor";
    $("pg").textContent = x ? "Actualizar" : "Guardar";
    $("pcan").hidden = !x;
    $("pn").value = x?.nombre || ""; $("pr").value = x?.ruc || ""; $("pt").value = x?.telefono || ""; $("pc").value = x?.correo || "";
    if (x) { window.scrollTo({ top: 0, behavior: "smooth" }); $("pn").focus(); }
  };
  const lista = () => {
    const f = filtrarProvs(S.qp || "");
    $("provTit").textContent = S.qp && S.qp.trim() ? `Proveedores (${f.length} de ${S.provs.length})` : `Proveedores (${S.provs.length})`;
    $("provBody").innerHTML = f.map(filaProv).join("") || '<tr><td colspan="6" class="vacio">No se encontraron proveedores.</td></tr>';
    $("provBody").querySelectorAll("[data-e]").forEach(b => b.onclick = () => modo(S.provs.find(v => v.id == b.dataset.e)));
    $("provBody").querySelectorAll("[data-d]").forEach(b => b.onclick = () => {
      const x = S.provs.find(v => v.id == b.dataset.d);
      if (confirm(`¿Eliminar a "${x.nombre}"?` + (x.productos ? `\nSus ${x.productos} producto(s) quedarán sin proveedor.` : ""))) accion(() => api("/api/proveedores/" + x.id, { method: "DELETE" }));
    });
  };
  lista();
  $("pcan").onclick = () => modo(null);
  $("bp").oninput = ev => { S.qp = ev.target.value; lista(); };
  $("pr").oninput = ev => { ev.target.value = ev.target.value.replace(/\D/g, "").slice(0, 11); };
  $("fp").onsubmit = e => {
    e.preventDefault();
    if (!/^\d{11}$/.test(val("pr"))) return alert("El RUC debe tener 11 dígitos numéricos");
    const body = JSON.stringify({ nombre: val("pn"), ruc: val("pr"), telefono: val("pt"), correo: val("pc") });
    accion(() => editId ? api("/api/proveedores/" + editId, { method: "PUT", body }) : api("/api/proveedores", { method: "POST", body }));
  };
}

// ---- CATEGORÍAS ----
function categorias() {
  $("main").innerHTML = `<div class="card form-card"><h4>➕ Agregar categoría</h4><form id="fk" class="form-linea">
    <div><label>Nombre</label><input id="kn" placeholder="Ej: Carnes, Limpieza, Frutas..." required></div><button class="btn" ${ST}>Guardar</button></form></div>
    <div class="card tabla-wrap"><h4>Categorías (${S.cats.length})</h4><table><thead><tr><th>Categoría</th><th>Productos</th><th></th></tr></thead><tbody>
    ${S.cats.map(x => `<tr><td>${ICONOS[x.nombre] || "📦"} <b>${esc(x.nombre)}</b></td><td>${x.productos}</td><td><button class="btn-del" data-d="${x.id}">Eliminar</button></td></tr>`).join("")}</tbody></table></div>`;
  $("fk").onsubmit = e => { e.preventDefault(); accion(() => api("/api/categorias", { method: "POST", body: JSON.stringify({ nombre: val("kn") }) })); };
  $("main").querySelectorAll("[data-d]").forEach(b => b.onclick = () => { if (confirm("¿Eliminar esta categoría?")) accion(() => api("/api/categorias/" + b.dataset.d, { method: "DELETE" })); });
}

// ---- USUARIOS ----
async function usuarios() {
  $("main").innerHTML = '<div class="vacio">Cargando...</div>';
  const U = await api("/api/usuarios");
  $("main").innerHTML = `<div class="card form-card"><h4>➕ Crear usuario</h4><form id="fu" class="form-linea">
    <div><label>Nombre</label><input id="un" required></div><div><label>Correo</label><input id="uc" type="email" required></div>
    <div><label>Contraseña</label><input id="up" type="password" minlength="6" required></div>
    <div><label>Cargo</label><select id="ur"><option>Jefe de almacén</option><option>Operario</option><option>Administrador</option></select></div>
    <button class="btn" ${ST}>Crear</button></form></div>
    <div class="card tabla-wrap"><h4>Usuarios (${U.length})</h4><table><thead><tr><th>Nombre</th><th>Correo</th><th>Cargo</th><th>Creado</th><th></th></tr></thead><tbody>
    ${U.map(x => `<tr><td><b>${esc(x.nombre)}</b></td><td>${esc(x.correo)}</td><td><span class="tag t-blue">${esc(x.cargo)}</span></td><td>${x.creado}</td><td>${x.id === S.user.id ? '<span class="muted">(tú)</span>' : `<button class="btn-del" data-d="${x.id}">Eliminar</button>`}</td></tr>`).join("")}</tbody></table></div>`;
  $("fu").onsubmit = async e => { e.preventDefault(); try { await api("/api/usuarios", { method: "POST", body: JSON.stringify({ nombre: val("un"), correo: val("uc"), clave: $("up").value, cargo: $("ur").value }) }); usuarios(); } catch (er) { alert(er.message); } };
  $("main").querySelectorAll("[data-d]").forEach(b => b.onclick = async () => { if (!confirm("¿Eliminar este usuario?")) return; try { await api("/api/usuarios/" + b.dataset.d, { method: "DELETE" }); usuarios(); } catch (er) { alert(er.message); } });
}

// ---- PERFIL ----
function perfil() {
  const u = S.user;
  $("main").innerHTML = `<div class="card"><div class="perfil"><div class="perfil-avatar">${esc(u.nombre[0].toUpperCase())}</div>
    <div class="perfil-datos"><h4>${esc(u.nombre)}</h4><p>${esc(u.correo)}</p><span class="tag t-blue">${esc(u.cargo)}</span></div>
    <div class="perfil-permisos"><b>Lo que puedes hacer:</b><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${PERMISOS[rol()].map(p => `<span class="perm-chip">✓ ${p}</span>`).join("")}</div></div></div></div>
    <div class="card form-card"><h4>🔒 Cambiar contraseña</h4><form id="fc2" class="form-linea">
      <div><label>Contraseña actual</label><input id="ca" type="password" required></div><div><label>Nueva (mín. 6)</label><input id="cn" type="password" minlength="6" required></div>
      <div><label>Repetir nueva</label><input id="cr" type="password" required></div><button class="btn" ${ST}>Actualizar</button></form><div id="cm" class="alert" hidden></div></div>`;
  $("fc2").onsubmit = async e => { e.preventDefault(); const m = $("cm"); m.hidden = false;
    if ($("cn").value !== $("cr").value) { m.textContent = "Las contraseñas nuevas no coinciden"; return; }
    try { await api("/api/perfil/clave", { method: "POST", body: JSON.stringify({ actual: $("ca").value, nueva: $("cn").value }) }); m.textContent = "✅ Contraseña actualizada"; e.target.reset(); }
    catch (er) { m.textContent = er.message; } };
}

// ---- NOTIFICACIONES ----
const alertas = () => S.prods.filter(p => Number(p.cantidad) > 0 && estado(p) !== "verde").sort((x, y) => dias(x) - dias(y));
function campana() {
  const al = alertas(), n = al.length, b = $("bellN"), p = $("notifPanel");
  if (!b || !p) return;
  b.hidden = !n;
  b.textContent = n;
  p.innerHTML = n
    ? `<div class="notif-cab"><b>Alertas de vencimiento (${n})</b></div>` +
      al.slice(0, 8).map(x => {
        const k = estado(x), d = dias(x);
        const txt = d < 0 ? `Venció hace ${-d} d` : d === 0 ? "Vence hoy" : `Vence en ${d} d`;
        return `<div class="notif-item" data-ir="${x.id}"><div><b>${esc(x.nombre)}</b><small>${x.cantidad} ${esc(x.unidad)} · ${x.vence}</small></div><span class="tag ${TAG[k][0]}">${txt}</span></div>`;
      }).join("") +
      `<div class="notif-pie"><button class="btn-aviso" id="irAlerta">Ver en inventario</button></div>`
    : `<div class="vacio" style="padding:16px">Sin alertas de vencimiento.</div>`;
  p.querySelectorAll("[data-ir]").forEach(el => {
    el.onclick = () => { p.hidden = true; S.edit = +el.dataset.ir; ir("productos"); scrollTo(0, 0); };
  });
  const btnAll = $("irAlerta");
  if (btnAll) btnAll.onclick = () => { p.hidden = true; ir("inventario", "rojo"); };
}

function toast(msg, tipo = "ok") {
  let t = $("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:9999;padding:12px 16px;border-radius:10px;color:#fff;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.18);transition:opacity .25s";
    document.body.appendChild(t);
  }
  t.style.background = tipo === "err" ? "#dc2626" : "#16a34a";
  t.textContent = msg;
  t.style.opacity = "1";
  t.hidden = false;
  clearTimeout(t._tm);
  t._tm = setTimeout(() => { t.style.opacity = "0"; setTimeout(() => { t.hidden = true; }, 250); }, 2800);
}

// ---- EVENTOS GLOBALES, LOGIN Y AUTO-ACTUALIZACIÓN ----
$("bell").onclick = ev => { ev.stopPropagation(); const p = $("notifPanel"); p.hidden = !p.hidden; };
document.addEventListener("click", ev => {
  const p = $("notifPanel"), b = $("bell");
  if (p && !p.hidden && !p.contains(ev.target) && ev.target !== b && !b.contains(ev.target)) p.hidden = true;
});
$("menuBtn").onclick = () => $("sidebar").classList.toggle("open");

async function entrar(usuario) {
  S.user = usuario;
  $("login").hidden = true;
  $("app").hidden = false;
  $("avatar").textContent = (usuario.nombre || "U")[0].toUpperCase();
  $("uName").textContent = usuario.nombre;
  $("uRole").textContent = usuario.cargo;
  menu();
  await cargar();
  ir("dashboard");
}

$("loginForm").onsubmit = async ev => {
  ev.preventDefault();
  $("loginError").hidden = true;
  try {
    const r = await api("/api/login", { method: "POST", body: JSON.stringify({ correo: $("email").value.trim(), clave: $("password").value }) });
    await entrar(r.usuario);
  } catch (e) {
    $("loginError").textContent = e.message || "Correo o contraseña incorrectos";
    $("loginError").hidden = false;
  }
};

$("logout").onclick = () => {
  S.user = null;
  S.prods = [];
  S.agotadosCache = [];
  $("app").hidden = true;
  $("login").hidden = false;
  $("loginForm").reset();
};

setInterval(async () => {
  const escribiendo = ["bq", "bm", "bp", "bqrep"].some(id => $(id) && $(id).value.trim() !== "");
  if (!S.user || S.edit || escribiendo) return;
  try {
    await cargar();
    if (S.vista === "dashboard" || S.vista === "inventario") pintar();
    else campana();
  } catch (_) {}
}, 30000);
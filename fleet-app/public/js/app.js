import { api } from "./api.js";
import { initDespachoForm, bindDespachoForm, loadOps, loadKpis } from "./ui.js";

const $ = (id) => document.getElementById(id);
const PALETTE = {
  Manhattan: "#2563eb", Brooklyn: "#16a34a", Queens: "#d97706",
  Bronx: "#dc2626", "Staten Island": "#7c3aed", EWR: "#0891b2",
};
const colorOf = (b) => PALETTE[b] || "#6b7385";
const ROLES = { despachador: "Despachador", analista: "Analista" };

let map, layerGroup, layersById = new Map(), features = [], selectedId = null;
let currentUser = null;
let metricsById = new Map();
let heatMode = "borough";
let activeView = "mapa";

// ---------- Vistas ----------
function showLogin() {
  $("app-view").hidden = true;
  $("login-view").hidden = false;
  $("password").value = "";
  $("username").focus();
}

async function showApp(user) {
  currentUser = user;
  $("login-view").hidden = true;
  $("app-view").hidden = false;
  $("user-info").textContent = `${user.name} · ${ROLES[user.role] ?? user.role}`;
  applyRole(user);
  setView("mapa");
  initMap();
  await loadZones();
  initDespachoForm(features);
  if (user.role === "analista") await loadMetrics();
}

// Muestra solo lo que corresponde al rol (la seguridad real la da el backend)
function applyRole(user) {
  document.body.dataset.role = user.role;
  document.querySelectorAll("[data-roles]").forEach((el) => {
    el.dataset.roleOk = el.dataset.roles.split(" ").includes(user.role) ? "1" : "0";
  });
  document.querySelectorAll("#tabs button").forEach((b) => {
    b.hidden = b.dataset.roleOk !== "1";
  });
  $("heat-controls").hidden = user.role !== "analista";
}

function setView(name) {
  const tab = document.querySelector(`#tabs button[data-view="${name}"]`);
  if (!tab || tab.dataset.roleOk !== "1") return; // rol sin acceso a esa vista
  activeView = name;
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== `view-${name}`));
  document.querySelectorAll("#tabs button").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === name)
  );
  if (name === "mapa" && map) setTimeout(() => map.invalidateSize(), 0);
  if (name === "ops") guard(() => loadOps(currentUser.role));
  if (name === "kpis") guard(loadKpis);
}

// Si la sesión caducó (401), vuelve al login
async function guard(fn) {
  try { await fn(); } catch (err) { if (err.status === 401) showLogin(); }
}

// ---------- Mapa ----------
function initMap() {
  if (map) { map.invalidateSize(); return; }
  map = L.map("map").setView([40.73, -73.95], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  layerGroup = L.layerGroup().addTo(map);
}

// ---------- Capa de métricas (analista) ----------
const CLUSTER_COLORS = { baja: "#16a34a", media: "#f59e0b", alta: "#dc2626" };

function slowColor(pct) {
  if (pct == null) return "#6b7385";
  if (pct < 15) return "#16a34a";
  if (pct < 25) return "#f59e0b";
  return "#dc2626";
}

async function loadMetrics() {
  try {
    const rows = await api.zonasMetricas();
    metricsById = new Map(rows.map((r) => [r.zone_id, r]));
  } catch (err) {
    if (err.status === 401) return showLogin();
    metricsById = new Map();
  }
  render();
}

function featureColor(f) {
  if (heatMode === "slow_pct") return slowColor(metricsById.get(f.properties.zone_id)?.slow_pct);
  if (heatMode === "cluster") return CLUSTER_COLORS[metricsById.get(f.properties.zone_id)?.cluster] ?? "#6b7385";
  return colorOf(f.properties.borough);
}

function renderLegend() {
  const el = $("legend");
  const items =
    heatMode === "slow_pct"
      ? [["#16a34a", "< 15%"], ["#f59e0b", "15–25%"], ["#dc2626", "≥ 25%"], ["#6b7385", "sin datos"]]
      : heatMode === "cluster"
      ? [["#16a34a", "baja"], ["#f59e0b", "media"], ["#dc2626", "alta"], ["#6b7385", "sin datos"]]
      : [];
  el.hidden = items.length === 0;
  el.replaceChildren(
    ...items.map(([color, label]) => {
      const s = document.createElement("span");
      const dot = document.createElement("i");
      dot.style.background = color;
      s.append(dot, document.createTextNode(label));
      return s;
    })
  );
}

//const baseStyle = (f) => ({ color: colorOf(f.properties.borough), weight: 1, fillOpacity: 0.25 });
//const activeStyle = (f) => ({ color: colorOf(f.properties.borough), weight: 3, fillOpacity: 0.5 });
const baseStyle = (f) => ({ color: featureColor(f), weight: 1, fillOpacity: heatMode === "borough" ? 0.25 : 0.45 });
const activeStyle = (f) => ({ color: featureColor(f), weight: 3, fillOpacity: 0.65 });

async function loadZones() {
  $("zones-error").hidden = true;
  try {
    const geo = await api.zonas();
    features = geo.features;
    const boroughs = [...new Set(features.map((f) => f.properties.borough))].sort();
    $("borough-filter").replaceChildren(
      new Option("Todos los boroughs", ""),
      ...boroughs.map((b) => new Option(b, b))
    );
    render();
    const bounds = L.featureGroup(layerGroup.getLayers()).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
  } catch (err) {
    if (err.status === 401) return showLogin();
    $("zones-error").textContent = err.message;
    $("zones-error").hidden = false;
  }
}

// Dibuja mapa y lista según los filtros
function render() {
  const q = $("search").value.trim().toLowerCase();
  const borough = $("borough-filter").value;
  const visible = features.filter(
    (f) => (!borough || f.properties.borough === borough) && (!q || f.properties.zone.toLowerCase().includes(q))
  );

  layerGroup.clearLayers();
  layersById = new Map();
  for (const f of visible) {
    const layer = L.geoJSON(f, { style: baseStyle }).on("click", () => select(f.properties.zone_id));
    layer.bindTooltip(f.properties.zone, { sticky: true });
    layer.addTo(layerGroup);
    layersById.set(f.properties.zone_id, layer);
  }

  $("count").textContent = `${visible.length} de ${features.length} zonas`;
  const list = $("zone-list");
  list.replaceChildren(
    ...visible.map((f) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.id = f.properties.zone_id;
      btn.className = f.properties.zone_id === selectedId ? "active" : "";
      const dot = document.createElement("span");
      dot.className = "dot";
      //dot.style.background = colorOf(f.properties.borough);
      // El punto de color de la lista
      dot.style.background = featureColor(f);
      const name = document.createElement("span");
      name.textContent = f.properties.zone;
      const meta = document.createElement("small");
      meta.textContent = f.properties.borough;
      btn.append(dot, name, meta);
      btn.addEventListener("click", () => select(f.properties.zone_id, true));
      li.append(btn);
      return li;
    })
  );
  if (selectedId && layersById.has(selectedId)) layersById.get(selectedId).setStyle(activeStyle);
  renderLegend();
}

function select(id, fit = false) {
  selectedId = id;
  const f = features.find((x) => x.properties.zone_id === id);
  if (!f) return;
  for (const [zid, layer] of layersById) {
    const feat = features.find((x) => x.properties.zone_id === zid);
    layer.setStyle(zid === id ? activeStyle(feat) : baseStyle(feat));
  }
  document.querySelectorAll("#zone-list button").forEach((b) => b.classList.toggle("active", Number(b.dataset.id) === id));
  if (fit && layersById.has(id)) map.fitBounds(layersById.get(id).getBounds(), { maxZoom: 14, padding: [40, 40] });

  const info = $("zone-info");
  const title = document.createElement("h3");
  title.textContent = f.properties.zone;
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = `${f.properties.borough} · LocationID ${f.properties.zone_id}`;
  info.replaceChildren(title, p);

  const m = metricsById.get(id);
  if (currentUser?.role === "analista" && m) {
    const q = document.createElement("p");
    q.textContent =
      `${m.trips.toLocaleString("es-MX")} viajes · ${m.avg_speed_kmh} km/h · ` +
      `${m.slow_pct}% lentos` + (m.cluster ? ` · congestión ${m.cluster}` : "");
    info.append(q);
  }
  info.hidden = false;
}

// ---------- Eventos ----------
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.submitter ?? e.target.querySelector("button");
  const err = $("login-error");
  err.hidden = true;
  const username = $("username").value.trim();
  const password = $("password").value;
  if (username.length < 3 || password.length < 8) {
    err.textContent = "Usuario (mín. 3) y contraseña (mín. 8 caracteres) requeridos";
    err.hidden = false;
    return;
  }
  btn.disabled = true;
  try {
    await showApp(await api.login(username, password));
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

$("logout-btn").addEventListener("click", async () => {
  try { await api.logout(); } catch { /* sesión ya caducada */ }
  selectedId = null;
  $("zone-info").hidden = true;

  currentUser = null;
  metricsById = new Map();
  heatMode = "borough";
  $("heat-mode").value = "borough";

  showLogin();
});

$("search").addEventListener("input", render);
$("borough-filter").addEventListener("change", render);

$("tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-view]");
  if (b) setView(b.dataset.view);
});

$("heat-mode").addEventListener("change", (e) => {
  heatMode = e.target.value;
  render();
});

bindDespachoForm(() => {
  if (activeView === "ops") guard(() => loadOps(currentUser.role));
});

// ---------- Arranque: ¿ya hay sesión? ----------
try {
  await showApp(await api.me());
} catch {
  
  showLogin();
}

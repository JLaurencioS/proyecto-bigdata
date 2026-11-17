import { api } from "./api.js";

const $ = (id) => document.getElementById(id);
const fmtDate = (iso) =>
  new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });

let zoneNames = new Map();

// ---------- Utilidades ----------
function td(text, cls) {
  const el = document.createElement("td");
  el.textContent = text;
  if (cls) el.className = cls;
  return el;
}

const zoneLabel = (id) => zoneNames.get(id) ?? `Zona ${id}`;

// ---------- Formulario de nueva operación ----------
export function initDespachoForm(features) {
  zoneNames = new Map(features.map((f) => [f.properties.zone_id, f.properties.zone]));

  const sorted = [...features].sort((a, b) => a.properties.zone.localeCompare(b.properties.zone));
  const options = () =>
    sorted.map((f) => new Option(`${f.properties.zone} (${f.properties.borough})`, f.properties.zone_id));
  $("d-origin").replaceChildren(new Option("Selecciona…", ""), ...options());
  $("d-dest").replaceChildren(new Option("Selecciona…", ""), ...options());

  // Flota simulada V-01 … V-20 (el contrato exige V-NN)
  $("d-vehicle").replaceChildren(
    ...Array.from({ length: 20 }, (_, i) => {
      const id = `V-${String(i + 1).padStart(2, "0")}`;
      return new Option(id, id);
    })
  );

  // Hora de salida por defecto: dentro de 1 hora, en hora local
  const d = new Date(Date.now() + 3600_000 - new Date().getTimezoneOffset() * 60_000);
  $("d-departure").value = d.toISOString().slice(0, 16);
}

export function bindDespachoForm(onCreated) {
  $("despacho-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("d-error");
    const ok = $("d-ok");
    err.hidden = true;
    ok.hidden = true;

    const origin = Number($("d-origin").value);
    const dest = Number($("d-dest").value);
    const dep = $("d-departure").value;

    if (!origin || !dest || !dep) {
      err.textContent = "Completa origen, destino y salida";
      err.hidden = false;
      return;
    }
    if (origin === dest) {
      err.textContent = "El origen y el destino deben ser distintos";
      err.hidden = false;
      return;
    }

    const btn = e.submitter ?? e.target.querySelector("button");
    btn.disabled = true;
    try {
      const created = await api.crearDespacho({
        origin_zone: origin,
        dest_zone: dest,
        departure_time: new Date(dep).toISOString(),
        vehicle_id: $("d-vehicle").value,
      });
      ok.textContent = `Operación registrada: ${zoneLabel(created.origin_zone)} → ${zoneLabel(created.dest_zone)}`;
      ok.hidden = false;
      onCreated?.();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- Tabla de operaciones ----------
export async function loadOps(role) {
  $("ops-error").hidden = true;
  $("ops-title").textContent = role === "analista" ? "Operaciones (todas)" : "Mis operaciones";
  const tbody = $("ops-table").querySelector("tbody");
  try {
    const rows = await api.despachos(50);
    $("ops-empty").hidden = rows.length > 0;
    tbody.replaceChildren(
      ...rows.map((r) => {
        const tr = document.createElement("tr");
        tr.append(
          td(fmtDate(r.departure_time)),
          td(zoneLabel(r.origin_zone)),
          td(zoneLabel(r.dest_zone)),
          td(r.vehicle_id),
          td(r.status, `status status-${r.status}`),
          td(r.predicted_duration_min != null ? `${r.predicted_duration_min.toFixed(1)} min` : "—"),
          td(r.created_by)
        );
        return tr;
      })
    );
  } catch (ex) {
    if (ex.status === 401) throw ex;
    $("ops-error").textContent = ex.message;
    $("ops-error").hidden = false;
  }
}

// ---------- Dashboard de KPIs ----------
export async function loadKpis() {
  $("kpi-error").hidden = true;
  try {
    const k = await api.kpis();
    const empty = k.totals.trips === 0;
    $("kpi-empty").hidden = !empty;
    $("kpi-updated").textContent = k.updated_at ? `· actualizado ${fmtDate(k.updated_at)}` : "";

    const cards = [
      ["Viajes", k.totals.trips.toLocaleString("es-MX")],
      ["Duración promedio", `${k.totals.avg_duration_min} min`],
      ["Velocidad promedio", `${k.totals.avg_speed_kmh} km/h`],
      ["Viajes lentos", `${k.totals.slow_pct}%`],
    ];
    $("kpi-cards").replaceChildren(
      ...cards.map(([label, value]) => {
        const c = document.createElement("div");
        c.className = "kpi";
        const v = document.createElement("strong");
        v.textContent = value;
        const l = document.createElement("span");
        l.textContent = label;
        c.append(v, l);
        return c;
      })
    );
    drawHourChart(k.by_hour);
  } catch (ex) {
    if (ex.status === 401) throw ex;
    $("kpi-error").textContent = ex.message;
    $("kpi-error").hidden = false;
  }
}

// Gráfica de barras en SVG (sin librerías)
function drawHourChart(byHour) {
  const host = $("kpi-chart");
  if (!byHour.length) return host.replaceChildren();

  const NS = "http://www.w3.org/2000/svg";
  const W = 720, H = 240, M = { t: 10, r: 10, b: 28, l: 36 };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  const byH = new Map(byHour.map((h) => [h.hour, h.avg_duration_min]));
  const max = Math.max(...byHour.map((h) => h.avg_duration_min), 1);
  const bw = iw / 24;

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Duración promedio por hora del día");

  const add = (name, attrs, text) => {
    const el = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text != null) el.textContent = text;
    svg.append(el);
    return el;
  };

  for (let i = 0; i <= 4; i++) {
    const y = M.t + ih - (ih * i) / 4;
    add("line", { x1: M.l, x2: W - M.r, y1: y, y2: y, class: "grid" });
    add("text", { x: M.l - 6, y: y + 4, "text-anchor": "end", class: "axis" }, Math.round((max * i) / 4));
  }
  for (let h = 0; h < 24; h++) {
    const v = byH.get(h);
    if (v != null) {
      const bh = (v / max) * ih;
      const bar = add("rect", {
        x: M.l + h * bw + 2, y: M.t + ih - bh, width: Math.max(bw - 4, 1), height: bh, class: "bar",
      });
      const t = document.createElementNS(NS, "title");
      t.textContent = `${h}:00 · ${v} min`;
      bar.append(t);
    }
    if (h % 3 === 0) add("text", { x: M.l + h * bw + bw / 2, y: H - 8, "text-anchor": "middle", class: "axis" }, `${h}h`);
  }
  host.replaceChildren(svg);
}
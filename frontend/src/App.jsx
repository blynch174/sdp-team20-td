import { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

/* ==========================================================================
   CHANNEL CONFIG
   Keys are what the backend sends (CSV channel name, lowercased, spaces -> _).

   limits: when to change color.
     dir "high" = bigger is worse (temps, current); "low" = smaller is worse (SoC, voltage)
     [caution, warning, critical] = where it turns yellow, orange, red.
     No limits = informational channel, drawn in a neutral color.
   scale: multiply the raw value (e.g. the logger reports mV; we show V).
   valid: [min, max] after scaling; anything outside is treated as a sensor
          glitch and dropped (e.g. Torque Feedback's 6553.5 Nm "invalid" value).

   ESTIMATE = threshold picked from typical values / the July 2025 logs, not
   from the car's spec sheet. Confirm these with the Formula SAE team.
   ========================================================================== */
const CHANNELS = {
  // Driver inputs
  gps_speed: { label: "Speed", unit: "km/h", color: "#38bdf8", decimals: 0, valid: [0, 200] },
  rpm: {
    label: "Motor RPM", unit: "rpm", decimals: 0, valid: [-100, 8000],
    limits: { dir: "high", caution: 4500, warning: 5000, critical: 5300 }, // ESTIMATE: assumes ~5,500 rpm motor max
  },
  throttle_pos: { label: "Throttle", unit: "%", color: "#a78bfa", decimals: 0, valid: [0, 110] },
  rbrakepressure: { label: "Rear Brake Pressure", unit: "bar", color: "#e879f9", decimals: 1, valid: [-1, 200] },

  // Battery (accumulator)
  state_of_charge: {
    label: "State of Charge", unit: "%", decimals: 1, valid: [0, 100],
    limits: { dir: "low", caution: 40, warning: 25, critical: 15 },
  },
  pack_voltage: {
    label: "Pack Voltage", unit: "V", decimals: 1, valid: [0, 600],
    limits: { dir: "low", caution: 360, warning: 340, critical: 320 }, // ESTIMATE: ~3.4/3.2/3.0 V per cell x ~105 cells
  },
  pack_current: {
    label: "Pack Current", unit: "A", decimals: 0, valid: [-50, 400],
    limits: { dir: "high", caution: 140, warning: 170, critical: 190 }, // FSAE 80 kW limit is ~200 A at ~400 V
  },
  min_cell_voltage: {
    label: "Min Cell Voltage", unit: "V", decimals: 3, scale: 0.001, valid: [1, 5],
    limits: { dir: "low", caution: 3.4, warning: 3.2, critical: 3.0 }, // typical Li-ion; ESTIMATE until cell datasheet is known
  },
  pack_temp: {
    label: "Pack Temp", unit: "°C", decimals: 1, valid: [-20, 100],
    limits: { dir: "high", caution: 45, warning: 50, critical: 55 }, // FSAE rule: cells must stay below 60 °C
  },
  bms_disch_lim: { label: "BMS Discharge Limit", unit: "A", color: "#94a3b8", decimals: 0, valid: [0, 400] },
  bms_lv_input: {
    label: "LV Battery", unit: "V", decimals: 2, scale: 0.001, valid: [5, 40],
    limits: { dir: "low", caution: 24, warning: 23, critical: 22 }, // ESTIMATE: logs suggest a ~24 V low-voltage system
  },

  // Motor
  torque_command: { label: "Torque Requested", unit: "Nm", color: "#94a3b8", decimals: 0, valid: [0, 250] },
  torque_feedback: { label: "Torque Delivered", unit: "Nm", color: "#38bdf8", decimals: 0, valid: [0, 250] },

  // Vehicle dynamics
  lateralacc: { label: "Lateral g", unit: "g", decimals: 2, valid: [-3, 3] },
  inlineacc: { label: "Longitudinal g", unit: "g", decimals: 2, valid: [-3, 3] },
  yawrate: { label: "Yaw Rate", unit: "°/s", color: "#a78bfa", decimals: 1, valid: [-300, 300] },

  // Position (track map)
  gps_latitude: { label: "Latitude", unit: "°", decimals: 6, valid: [-90, 90] },
  gps_longitude: { label: "Longitude", unit: "°", decimals: 6, valid: [-180, 180] },

  // Status flags (0/1)
  inverterenable: { label: "Inverter", flag: "onOff" },
  bse_fault: { label: "Brake Sensor (BSE)", flag: "fault" },
  apps_dist_fault: { label: "Pedal Sensors (APPS)", flag: "fault" },
  dc_undervoltage: { label: "DC Undervoltage", flag: "fault" },
  invovervolt: { label: "Inverter Overvoltage", flag: "fault" },
};

const CHANNEL_KEYS = Object.keys(CHANNELS);

/* ==========================================================================
   LAYOUT
   OVERVIEW = the one-screen glance view for the pit crew.
   PANELS   = detail tabs with full charts, for digging in.
   ========================================================================== */
const STATUS_LIGHTS = ["inverterenable", "bse_fault", "apps_dist_fault", "dc_undervoltage", "invovervolt"];

const OVERVIEW = {
  top: [
    { type: "gauge", channel: "gps_speed", max: 120, ticks: [0, 30, 60, 90, 120] },
    { type: "gauge", channel: "rpm", max: 6000, ticks: [0, 1500, 3000, 4500, 6000], tickSuffix: "k", tickScale: 0.001 },
    { type: "pedals" },
    { type: "stat", channel: "state_of_charge", bar: true },
  ],
  tiles: ["pack_temp", "pack_current", "min_cell_voltage", "pack_voltage", "bms_lv_input", "torque_feedback"],
  lights: STATUS_LIGHTS,
};

const PANELS = [
  {
    id: "driver",
    title: "Driver Inputs",
    widgets: [
      { type: "gauge", channel: "gps_speed", max: 120, ticks: [0, 30, 60, 90, 120] },
      { type: "gauge", channel: "rpm", max: 6000, ticks: [0, 1500, 3000, 4500, 6000], tickSuffix: "k", tickScale: 0.001 },
      { type: "pedals" },
      { type: "chart", series: ["gps_speed"], title: "Speed History" },
      { type: "chart", series: ["rpm"], title: "RPM History" },
      { type: "chart", series: ["throttle_pos"] },
      { type: "chart", series: ["rbrakepressure"] },
    ],
  },
  {
    id: "battery",
    title: "Battery",
    widgets: [
      { type: "stat", channel: "state_of_charge", bar: true },
      { type: "stat", channel: "bms_lv_input" },
      { type: "chart", series: ["pack_voltage"] },
      { type: "chart", series: ["pack_current"] },
      { type: "chart", series: ["min_cell_voltage"] },
      { type: "chart", series: ["pack_temp"] },
    ],
  },
  {
    id: "motor",
    title: "Motor",
    widgets: [
      { type: "chart", series: ["torque_command", "torque_feedback"], title: "Torque: Requested vs Delivered" },
      { type: "stat", channel: "bms_disch_lim" },
    ],
  },
  {
    id: "dynamics",
    title: "Vehicle Dynamics",
    widgets: [
      { type: "gg" },
      { type: "chart", series: ["yawrate"] },
    ],
  },
];

const widgetKeys = (w) =>
  w.type === "chart" ? w.series
    : w.type === "stat" || w.type === "gauge" ? [w.channel]
    : w.type === "lights" ? w.channels
    : w.type === "pedals" ? ["throttle_pos", "rbrakepressure"]
    : w.type === "gg" ? ["lateralacc", "inlineacc"]
    : [];
const panelKeys = (panel) => panel.widgets.flatMap(widgetKeys);
const OVERVIEW_KEYS = [...OVERVIEW.top.flatMap(widgetKeys), ...OVERVIEW.tiles, ...OVERVIEW.lights];

/** Which detail tab holds the full view of a channel ("overview" for the status lights). */
function tabForChannel(key) {
  const panel = PANELS.find((p) => panelKeys(p).includes(key));
  return panel ? panel.id : "overview";
}

/* ==========================================================================
   SEVERITY
   ========================================================================== */
const LEVELS = {
  nodata: { rank: -1, color: "#475569", label: "NO DATA" },
  info: { rank: 0, color: "#38bdf8", label: "" },
  ok: { rank: 1, color: "#22c55e", label: "OK" },
  caution: { rank: 2, color: "#eab308", label: "CAUTION" },
  warning: { rank: 3, color: "#f97316", label: "WARNING" },
  critical: { rank: 4, color: "#ef4444", label: "CRITICAL" },
};

function severityOf(key, value) {
  const cfg = CHANNELS[key];
  if (value === null || value === undefined || !Number.isFinite(value)) return "nodata";
  if (cfg.flag === "fault") return value >= 1 ? "critical" : "ok";
  if (cfg.flag === "onOff") return value >= 1 ? "ok" : "info";
  const lim = cfg.limits;
  if (!lim) return "info";
  if (lim.dir === "high") {
    if (value >= lim.critical) return "critical";
    if (value >= lim.warning) return "warning";
    if (value >= lim.caution) return "caution";
    return "ok";
  }
  if (value <= lim.critical) return "critical";
  if (value <= lim.warning) return "warning";
  if (value <= lim.caution) return "caution";
  return "ok";
}

function worst(levels) {
  return levels.reduce((a, b) => (LEVELS[b].rank > LEVELS[a].rank ? b : a), "nodata");
}

/** Raw backend value -> display value, or null if it's a glitch. */
function clean(key, raw) {
  const cfg = CHANNELS[key];
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const v = n * (cfg.scale ?? 1);
  if (cfg.valid && (v < cfg.valid[0] || v > cfg.valid[1])) return null;
  return v;
}

/** toFixed without a "-0" (tiny negative sensor noise around zero). */
function num(v, d) {
  const out = v.toFixed(d);
  return /^-0(\.0+)?$/.test(out) ? out.slice(1) : out;
}

function fmt(key, v) {
  const cfg = CHANNELS[key];
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${num(v, cfg.decimals ?? 2)} ${cfg.unit ?? ""}`.trim();
}

const latestOf = (series) => (series?.length ? series[series.length - 1].value : null);

/* ==========================================================================
   SETTINGS
   ========================================================================== */
const MAX_POINTS = 130;
const WINDOW_MS = 2 * 60 * 1000;
const CHART_HEIGHT = 170;
const GG_TRAIL = 40;

function formatAxisTime(ms) {
  return new Date(ms).toLocaleTimeString([], { hour12: false });
}

/* ==========================================================================
   WIDGETS
   ========================================================================== */
function Card({ level, children, wide, id, onClick, title }) {
  const color = LEVELS[level].color;
  const flagged = LEVELS[level].rank >= 2;
  const edge = `1px solid ${flagged ? `${color}99` : "#1e293b"}`;
  return (
    <div
      id={id}
      onClick={onClick}
      title={title}
      className={level === "critical" ? "pulse-critical" : undefined}
      style={{
        cursor: onClick ? "pointer" : undefined,
        backgroundColor: flagged ? `${color}26` : "#0f172a",
        // Longhand borders only: mixing `border` + `borderLeft` makes React drop updates.
        borderTop: edge,
        borderRight: edge,
        borderBottom: edge,
        borderLeft: `4px solid ${color}`,
        borderRadius: "10px",
        padding: "14px",
        minWidth: 0,
        boxSizing: "border-box",
        gridColumn: wide ? "1 / -1" : undefined,
        transition: "background-color 300ms, border-color 300ms",
      }}
    >
      {children}
    </div>
  );
}

function Badge({ level }) {
  const { color, label } = LEVELS[level];
  if (!label || level === "ok") return null;
  return (
    <span
      style={{
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "0.08em",
        color: "#020817",
        backgroundColor: color,
        borderRadius: "4px",
        padding: "2px 6px",
      }}
    >
      {label}
    </span>
  );
}

function CardHeader({ title, level, valueText, valueColor }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ color: "#94a3b8", fontSize: "12px", letterSpacing: "0.08em" }}>{title.toUpperCase()}</span>
        <Badge level={level} />
      </div>
      {valueText ? (
        <span style={{ color: valueColor, fontWeight: 700, fontSize: "18px", fontFamily: "monospace", whiteSpace: "nowrap" }}>
          {valueText}
        </span>
      ) : null}
    </div>
  );
}

function ChartWidget({ series, title, data, windowEndMs }) {
  const windowStartMs = windowEndMs - WINDOW_MS;
  const single = series.length === 1 ? series[0] : null;

  // Merge each series into rows keyed by timestamp so recharts can draw them together.
  const rows = useMemo(() => {
    const byTime = new Map();
    for (const key of series) {
      for (const p of data[key] || []) {
        if (p.timestampMs < windowStartMs) continue;
        const row = byTime.get(p.timestampMs) || { timestampMs: p.timestampMs };
        row[key] = p.value;
        byTime.set(p.timestampMs, row);
      }
    }
    return [...byTime.values()].sort((a, b) => a.timestampMs - b.timestampMs);
  }, [data, series, windowStartMs]);

  const levels = series.map((k) => severityOf(k, latestOf(data[k])));
  const level = worst(levels);
  const lineColor = (k, i) => {
    const lv = levels[i];
    if (lv === "info" || lv === "nodata") return CHANNELS[k].color ?? LEVELS.info.color;
    return LEVELS[lv].color;
  };

  const lim = single ? CHANNELS[single].limits : null;
  const stats = useMemo(() => {
    if (!single) return null;
    const nums = rows.map((r) => r[single]).filter(Number.isFinite);
    if (!nums.length) return null;
    return { min: Math.min(...nums), max: Math.max(...nums) };
  }, [rows, single]);

  return (
    <Card level={level} id={`card-${series[0]}`}>
      <CardHeader
        title={title ?? CHANNELS[single].label}
        level={level}
        valueText={single ? fmt(single, latestOf(data[single])) : null}
        valueColor={single ? lineColor(single, 0) : undefined}
      />
      {single && stats ? (
        <div style={{ fontSize: "11px", color: "#64748b", fontFamily: "monospace", marginBottom: "6px" }}>
          min {fmt(single, stats.min)} <span style={{ color: "#334155" }}>|</span> max {fmt(single, stats.max)}
        </div>
      ) : null}
      {!single ? (
        <div style={{ display: "flex", gap: "14px", fontSize: "11px", marginBottom: "6px", flexWrap: "wrap" }}>
          {series.map((k, i) => (
            <span key={k} style={{ color: lineColor(k, i) }}>
              ■ {CHANNELS[k].label}: {fmt(k, latestOf(data[k]))}
            </span>
          ))}
        </div>
      ) : null}
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis type="number" dataKey="timestampMs" domain={[windowStartMs, windowEndMs]} stroke="#334155" tick={false} />
          <YAxis stroke="#334155" tick={{ fontSize: 9, fill: "#475569" }} width={40} domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{ backgroundColor: "#1e293b", border: "none", color: "#e2e8f0", fontSize: "12px" }}
            labelFormatter={(l) => formatAxisTime(l)}
            formatter={(v, name) => [fmt(name, Number(v)), CHANNELS[name]?.label ?? name]}
          />
          {lim
            ? ["caution", "warning", "critical"].map((lv) => (
                <ReferenceLine key={lv} y={lim[lv]} stroke={LEVELS[lv].color} strokeOpacity={0.5} strokeDasharray="4 4" />
              ))
            : null}
          {series.map((k, i) => (
            <Line
              key={k}
              type="monotone"
              dataKey={k}
              stroke={lineColor(k, i)}
              dot={false}
              connectNulls
              isAnimationActive={false}
              strokeWidth={2}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

function StatWidget({ channel, bar, data }) {
  const cfg = CHANNELS[channel];
  const v = latestOf(data[channel]);
  const level = severityOf(channel, v);
  const color = level === "info" || level === "nodata" ? cfg.color ?? LEVELS.info.color : LEVELS[level].color;
  return (
    <Card level={level} id={`card-${channel}`}>
      <CardHeader title={cfg.label} level={level} />
      <div style={{ fontSize: "40px", fontWeight: 800, fontFamily: "monospace", color, lineHeight: 1.1 }}>
        {v === null ? "—" : num(v, cfg.decimals ?? 1)}
        <span style={{ fontSize: "16px", color: "#64748b", marginLeft: "6px" }}>{cfg.unit}</span>
      </div>
      {bar ? (
        <div style={{ marginTop: "12px", height: "10px", backgroundColor: "#1e293b", borderRadius: "5px", overflow: "hidden" }}>
          <div
            style={{
              width: `${Math.max(0, Math.min(100, v ?? 0))}%`,
              height: "100%",
              backgroundColor: color,
              transition: "width 500ms, background-color 300ms",
            }}
          />
        </div>
      ) : null}
    </Card>
  );
}

/* --- Dial gauge (speedometer / tachometer) ------------------------------- */
const G_START = 150; // degrees, SVG angles run clockwise from 3 o'clock
const G_SWEEP = 240;

function polar(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx, cy, r, f0, f1) {
  const a0 = G_START + G_SWEEP * Math.max(0, Math.min(1, f0));
  const a1 = G_START + G_SWEEP * Math.max(0, Math.min(1, f1));
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

function GaugeWidget({ channel, max, ticks, tickScale = 1, tickSuffix = "", data, windowEndMs }) {
  const cfg = CHANNELS[channel];
  const series = (data[channel] || []).filter((p) => p.timestampMs >= windowEndMs - WINDOW_MS);
  const v = latestOf(data[channel]);
  const level = severityOf(channel, v);
  const color = level === "info" || level === "nodata" ? cfg.color ?? LEVELS.info.color : LEVELS[level].color;
  const frac = v === null ? 0 : v / max;
  const nums = series.map((p) => p.value);
  const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  const peak = nums.length ? Math.max(...nums) : null;

  // Colored zones on the outer edge from the channel's limits (high-is-bad only).
  const lim = cfg.limits;
  const zones = lim && lim.dir === "high"
    ? [
        ["ok", 0, lim.caution],
        ["caution", lim.caution, lim.warning],
        ["warning", lim.warning, lim.critical],
        ["critical", lim.critical, max],
      ]
    : [];

  const cx = 100, cy = 100, r = 78;
  // Pointer sits on the arc (F1 style) so the center stays clear for the number.
  const needleDeg = G_START + G_SWEEP * Math.max(0, Math.min(1, frac));
  const [px0, py0] = polar(cx, cy, r - 12, needleDeg);
  const [px1, py1] = polar(cx, cy, r + 8, needleDeg);

  return (
    <Card level={level}>
      <CardHeader title={cfg.label} level={level} />
      <svg viewBox="0 0 200 150" style={{ width: "100%", maxWidth: 260, display: "block", margin: "0 auto" }} role="img"
        aria-label={`${cfg.label}: ${fmt(channel, v)}`}>
        <path d={arcPath(cx, cy, r, 0, 1)} stroke="#1e293b" strokeWidth="12" fill="none" strokeLinecap="round" />
        {zones.map(([lv, a, b]) => (
          <path key={lv} d={arcPath(cx, cy, r + 10, a / max, b / max)} stroke={LEVELS[lv].color} strokeOpacity="0.55" strokeWidth="3" fill="none" />
        ))}
        <path d={arcPath(cx, cy, r, 0, frac)} stroke={color} strokeWidth="12" fill="none" strokeLinecap="round"
          style={{ transition: "stroke 300ms" }} />
        {ticks.map((t) => {
          const [tx, ty] = polar(cx, cy, r - 24, G_START + (G_SWEEP * t) / max);
          return (
            <text key={t} x={tx} y={ty} fill="#64748b" fontSize="10" textAnchor="middle" dominantBaseline="middle">
              {Math.round(t * tickScale * 10) / 10}
              {t > 0 ? tickSuffix : ""}
            </text>
          );
        })}
        <line x1={px0} y1={py0} x2={px1} y2={py1} stroke="#f8fafc" strokeWidth="3.5" strokeLinecap="round" />
        <text x={cx} y={cy + 6} fill={color} fontSize="34" fontWeight="800" textAnchor="middle" fontFamily="monospace">
          {v === null ? "—" : num(v, cfg.decimals ?? 0)}
        </text>
        <text x={cx} y={cy + 26} fill="#64748b" fontSize="11" textAnchor="middle">
          {cfg.unit}
        </text>
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#94a3b8", fontFamily: "monospace", marginTop: "4px" }}>
        <span>AVG {fmt(channel, avg)}</span>
        <span>MAX {fmt(channel, peak)}</span>
      </div>
    </Card>
  );
}

/* --- Pedal bars: live throttle and brake -------------------------------- */
const BRAKE_FULL_SCALE = 40; // bar; logs peak around 35

function PedalsWidget({ data }) {
  const thr = latestOf(data.throttle_pos);
  const brk = latestOf(data.rbrakepressure);
  const bars = [
    { label: "THROTTLE", pct: thr ?? 0, text: thr === null ? "—" : `${thr.toFixed(0)}%`, color: CHANNELS.throttle_pos.color },
    { label: "BRAKE", pct: brk === null ? 0 : (Math.max(0, brk) / BRAKE_FULL_SCALE) * 100, text: brk === null ? "—" : `${Math.max(0, brk).toFixed(1)} bar`, color: CHANNELS.rbrakepressure.color },
  ];
  return (
    <Card level="info">
      <CardHeader title="Pedals" level="info" />
      <div style={{ display: "flex", justifyContent: "center", gap: "36px", height: 190, paddingTop: 6 }}>
        {bars.map((b) => (
          <div key={b.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ width: 44, flex: 1, backgroundColor: "#1e293b", borderRadius: 6, position: "relative", overflow: "hidden" }}>
              <div
                style={{
                  position: "absolute", bottom: 0, left: 0, right: 0,
                  height: `${Math.max(0, Math.min(100, b.pct))}%`,
                  backgroundColor: b.color, transition: "height 250ms",
                }}
              />
            </div>
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: b.color, fontSize: 15 }}>{b.text}</span>
            <span style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.1em" }}>{b.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Friction-circle ("g-g") plot: lateral vs longitudinal g, with a short trail. */
function GgWidget({ data }) {
  const points = useMemo(() => {
    const lon = new Map((data.inlineacc || []).map((p) => [p.timestampMs, p.value]));
    return (data.lateralacc || [])
      .filter((p) => lon.has(p.timestampMs))
      .map((p) => ({ x: p.value, y: lon.get(p.timestampMs) }))
      .slice(-GG_TRAIL);
  }, [data]);
  const latest = points.length ? [points[points.length - 1]] : [];
  const combined = latest.length ? Math.hypot(latest[0].x, latest[0].y) : null;

  return (
    <Card level="info">
      <CardHeader
        title="Friction Circle (g-g)"
        level="info"
        valueText={combined === null ? "—" : `${combined.toFixed(2)} g`}
        valueColor={LEVELS.info.color}
      />
      <ResponsiveContainer width="100%" height={CHART_HEIGHT + 30}>
        <ScatterChart>
          <CartesianGrid stroke="#1e293b" />
          <XAxis type="number" dataKey="x" domain={[-2, 2]} ticks={[-2, -1, 0, 1, 2]} stroke="#334155" tick={{ fontSize: 9, fill: "#475569" }} name="Lateral" unit="g" />
          <YAxis type="number" dataKey="y" domain={[-2, 2]} ticks={[-2, -1, 0, 1, 2]} stroke="#334155" tick={{ fontSize: 9, fill: "#475569" }} width={30} name="Longitudinal" unit="g" />
          <ZAxis range={[20, 20]} />
          <ReferenceLine x={0} stroke="#334155" />
          <ReferenceLine y={0} stroke="#334155" />
          <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "none", color: "#e2e8f0", fontSize: "12px" }} />
          <Scatter data={points} fill="#38bdf8" fillOpacity={0.35} isAnimationActive={false} />
          <Scatter data={latest} fill="#f8fafc" isAnimationActive={false} shape="circle" />
        </ScatterChart>
      </ResponsiveContainer>
      <div style={{ fontSize: "10px", color: "#64748b", textAlign: "center" }}>← left · lateral · right →   |   ↑ accel · braking ↓</div>
    </Card>
  );
}

function LightsWidget({ channels, data }) {
  const levels = channels.map((k) => severityOf(k, latestOf(data[k])));
  return (
    <Card level={worst(levels)} wide>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
        {channels.map((k, i) => {
          const cfg = CHANNELS[k];
          const lv = levels[i];
          const v = latestOf(data[k]);
          const color = lv === "info" ? "#64748b" : LEVELS[lv].color;
          const text =
            v === null ? "NO DATA" : cfg.flag === "onOff" ? (v >= 1 ? "ON" : "OFF") : v >= 1 ? "FAULT" : "OK";
          return (
            <div
              key={k}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                borderRadius: "8px",
                backgroundColor: "#020817",
                border: `1px solid ${color}66`,
                fontSize: "12px",
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
              <span style={{ color: "#cbd5e1" }}>{cfg.label}</span>
              <span style={{ color, fontWeight: 700 }}>{text}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const levelOfKeys = (keys, data) => worst(keys.map((k) => severityOf(k, latestOf(data[k]))));

function renderWidget(w, i, data, windowEndMs) {
  if (w.type === "chart") return <ChartWidget key={i} series={w.series} title={w.title} data={data} windowEndMs={windowEndMs} />;
  if (w.type === "stat") return <StatWidget key={i} channel={w.channel} bar={w.bar} data={data} />;
  if (w.type === "gauge") return <GaugeWidget key={i} {...w} data={data} windowEndMs={windowEndMs} />;
  if (w.type === "pedals") return <PedalsWidget key={i} data={data} />;
  if (w.type === "gg") return <GgWidget key={i} data={data} />;
  if (w.type === "lights") return <LightsWidget key={i} channels={w.channels} data={data} />;
  return null;
}

/** Compact number tile with a sparkline, used on the Overview. Click opens its detail tab. */
function MiniStat({ channel, data, windowEndMs, onOpen }) {
  const cfg = CHANNELS[channel];
  const series = (data[channel] || []).filter((p) => p.timestampMs >= windowEndMs - WINDOW_MS);
  const v = latestOf(data[channel]);
  const level = severityOf(channel, v);
  const color = level === "info" || level === "nodata" ? cfg.color ?? LEVELS.info.color : LEVELS[level].color;
  return (
    <Card level={level} onClick={() => onOpen(channel)} title={`Open ${cfg.label} details`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
        <span style={{ color: "#94a3b8", fontSize: "11px", letterSpacing: "0.08em" }}>{cfg.label.toUpperCase()}</span>
        <Badge level={level} />
      </div>
      <div style={{ fontSize: "28px", fontWeight: 800, fontFamily: "monospace", color, lineHeight: 1.2, marginTop: 4 }}>
        {v === null ? "—" : num(v, cfg.decimals ?? 1)}
        <span style={{ fontSize: "13px", color: "#64748b", marginLeft: 5 }}>{cfg.unit}</span>
      </div>
      <ResponsiveContainer width="100%" height={40}>
        <LineChart data={series} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <YAxis hide domain={["auto", "auto"]} />
          <XAxis hide type="number" dataKey="timestampMs" domain={[windowEndMs - WINDOW_MS, windowEndMs]} />
          <Line type="monotone" dataKey="value" stroke={color} dot={false} isAnimationActive={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

/* --- Track map ---------------------------------------------------------- */
const TRACK_MAX_POINTS = 3000; // ~50 min of 1-per-second GPS
const TRACK_GAP_M = 120;       // a jump bigger than this (log loop, GPS glitch) breaks the line

function overallLevel(data) {
  const levels = CHANNEL_KEYS.map((k) => severityOf(k, latestOf(data[k])));
  const ranked = levels.filter((lv) => LEVELS[lv].rank >= 1);
  return ranked.length ? worst(ranked) : "nodata";
}

/** Turns lat/lon into flat x/y meters, fitted into the SVG box. */
function useProjection(points, W, H, pad) {
  return useMemo(() => {
    if (!points.length) return null;
    const lat0 = points.reduce((a, p) => a + p.lat, 0) / points.length;
    const kx = Math.cos((lat0 * Math.PI) / 180) * 111320;
    const ky = 110540;
    const xs = points.map((p) => p.lon * kx);
    const ys = points.map((p) => p.lat * ky);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, 30), spanY = Math.max(maxY - minY, 30);
    const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
    const offX = (W - spanX * scale) / 2, offY = (H - spanY * scale) / 2;
    const toXY = (p) => [offX + (p.lon * kx - minX) * scale, H - (offY + (p.lat * ky - minY) * scale)];
    const metersBetween = (a, b) => Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * ky);
    return { toXY, metersBetween, scale };
  }, [points, W, H, pad]);
}

/** Smooth line through points (quadratic curves through midpoints). GPS arrives ~1/s, so straight lines look jagged. */
function smoothPath(pts) {
  if (pts.length < 2) return "";
  const f = (n) => n.toFixed(1);
  if (pts.length === 2) return `M${f(pts[0][0])},${f(pts[0][1])} L${f(pts[1][0])},${f(pts[1][1])}`;
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${f(pts[i][0])},${f(pts[i][1])} ${f(mx)},${f(my)}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${f(last[0])},${f(last[1])}`;
}

function TrackMap({ track, cursorMs, data }) {
  const W = 640, H = 440, PAD = 28;
  // Size the map from real driving, not isolated GPS jumps (e.g. while the GPS is still getting a fix).
  const framing = useMemo(() => {
    if (track.length < 3) return track;
    const kx = Math.cos(((track[0].lat || 0) * Math.PI) / 180) * 111320;
    const far = (a, b) => Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * 110540) > TRACK_GAP_M;
    const kept = track.filter((p, i) => {
      const nearPrev = i > 0 && !far(track[i - 1], p);
      const nearNext = i < track.length - 1 && !far(p, track[i + 1]);
      return nearPrev || nearNext;
    });
    if (!kept.length) return track;
    const last = track[track.length - 1];
    return kept[kept.length - 1] === last ? kept : [...kept, last]; // always keep the car in view
  }, [track]);
  const proj = useProjection(framing, W, H, PAD);
  const level = overallLevel(data);
  const carColor = level === "nodata" ? LEVELS.info.color : LEVELS[level].color;

  let outline = "", trail = "", car = null, heading = 0;
  if (proj && track.length) {
    const segs = [];
    let cur = [];
    track.forEach((p, i) => {
      if (i && proj.metersBetween(track[i - 1], p) > TRACK_GAP_M) {
        segs.push(cur);
        cur = [];
      }
      cur.push(proj.toXY(p));
    });
    segs.push(cur);
    outline = segs.filter((s) => s.length > 1).map(smoothPath).join(" ");
    const upTo = cursorMs == null ? track : track.slice(0, lowerBound(track, cursorMs + 1, "t"));
    let tail = upTo.slice(-8);
    for (let i = tail.length - 1; i > 0; i--) {
      if (proj.metersBetween(tail[i - 1], tail[i]) > TRACK_GAP_M) {
        tail = tail.slice(i); // don't draw the trail across a jump
        break;
      }
    }
    const recent = tail.map(proj.toXY);
    trail = smoothPath(recent);
    car = recent[recent.length - 1];
    if (recent.length > 1) {
      const [x0, y0] = recent[recent.length - 2];
      heading = (Math.atan2(car[1] - y0, car[0] - x0) * 180) / Math.PI;
    }
  }

  const speed = latestOf(data.gps_speed);
  const latG = latestOf(data.lateralacc);

  return (
    <Card level={level === "nodata" ? "info" : level}>
      <CardHeader title="Track" level={level === "nodata" ? "info" : level} />
      <div style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "min(500px, max(260px, calc(100vh - 330px)))", display: "block" }} role="img"
          aria-label="Track map with the car's live position">
          <rect x="0" y="0" width={W} height={H} rx="8" fill="#020817" />
          {outline ? (
            <>
              <path d={outline} fill="none" stroke="#1e293b" strokeWidth="18" strokeLinejoin="round" strokeLinecap="round" />
              <path d={outline} fill="none" stroke="#334155" strokeWidth="1.5" strokeDasharray="6 8" />
            </>
          ) : null}
          {trail ? <path d={trail} fill="none" stroke="#38bdf8" strokeOpacity="0.8" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {car ? (
            <g style={{ transform: `translate(${car[0]}px, ${car[1]}px)`, transition: "transform 1s linear" }}>
              <circle r="16" fill={carColor} opacity="0.18" className={level === "critical" ? "pulse-dot" : undefined} />
              <g transform={`rotate(${heading})`}>
                <path d="M 11 0 L -7 -7 L -3 0 L -7 7 Z" fill={carColor} stroke="#020817" strokeWidth="1.5" />
              </g>
            </g>
          ) : (
            <text x={W / 2} y={H / 2} fill="#64748b" fontSize="14" textAnchor="middle">Waiting for GPS…</text>
          )}
        </svg>
        <div style={{ position: "absolute", top: 10, left: 12, display: "flex", gap: 14, fontFamily: "monospace", fontSize: 13 }}>
          <span style={{ color: "#38bdf8", fontWeight: 700 }}>{speed === null ? "—" : `${speed.toFixed(0)} km/h`}</span>
          <span style={{ color: "#94a3b8" }}>{latG === null ? "" : `${Math.abs(latG).toFixed(2)} g lateral`}</span>
        </div>
      </div>
    </Card>
  );
}

function TrackView({ track, cursorMs, data, windowEndMs }) {
  return (
    <div className="track-grid">
      <TrackMap track={track} cursorMs={cursorMs} data={data} />
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", minWidth: 0 }}>
        <GaugeWidget channel="gps_speed" max={120} ticks={[0, 30, 60, 90, 120]} data={data} windowEndMs={windowEndMs} />
        <GaugeWidget channel="rpm" max={6000} ticks={[0, 1500, 3000, 4500, 6000]} tickSuffix="k" tickScale={0.001} data={data} windowEndMs={windowEndMs} />
      </div>
    </div>
  );
}

function Overview({ data, windowEndMs, onOpen }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "14px" }}>
        {OVERVIEW.top.map((w, i) => renderWidget(w, i, data, windowEndMs))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))", gap: "14px" }}>
        {OVERVIEW.tiles.map((k) => (
          <MiniStat key={k} channel={k} data={data} windowEndMs={windowEndMs} onOpen={onOpen} />
        ))}
      </div>
      <div style={{ display: "grid" }}>
        <LightsWidget channels={OVERVIEW.lights} data={data} />
      </div>
    </div>
  );
}

function Tabs({ tab, setTab, data }) {
  const tabs = [
    { id: "overview", title: "Overview", keys: OVERVIEW_KEYS },
    { id: "track", title: "Track", keys: CHANNEL_KEYS },
    ...PANELS.map((p) => ({ id: p.id, title: p.title, keys: panelKeys(p) })),
  ];
  return (
    <div role="tablist" style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
      {tabs.map((t) => {
        const lv = levelOfKeys(t.keys, data);
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => setTab(t.id)}
            style={{
              display: "inline-flex", alignItems: "center", gap: "7px",
              padding: "7px 12px", borderRadius: "8px", cursor: "pointer",
              fontFamily: "inherit", fontSize: "12px", letterSpacing: "0.08em",
              color: active ? "#020817" : "#cbd5e1",
              backgroundColor: active ? "#e2e8f0" : "#0f172a",
              borderTop: "1px solid #334155", borderRight: "1px solid #334155",
              borderBottom: "1px solid #334155", borderLeft: "1px solid #334155",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: LEVELS[lv].color }} />
            {t.title.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

function Panel({ panel, data, windowEndMs }) {
  const level = levelOfKeys(panelKeys(panel), data);
  return (
    <section style={{ marginBottom: "28px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: LEVELS[level].color }} />
        <h2 style={{ margin: 0, fontSize: "14px", letterSpacing: "0.15em", color: "#cbd5e1" }}>{panel.title.toUpperCase()}</h2>
        <Badge level={level} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 290px), 1fr))", gap: "14px" }}>
        {panel.widgets.map((w, i) => renderWidget(w, i, data, windowEndMs))}
      </div>
    </section>
  );
}

function StatusBar({ data, onOpen }) {
  const flagged = CHANNEL_KEYS.map((k) => ({ k, lv: severityOf(k, latestOf(data[k])) }))
    .filter(({ lv }) => LEVELS[lv].rank >= 2)
    .sort((a, b) => LEVELS[b.lv].rank - LEVELS[a.lv].rank);
  const anyData = CHANNEL_KEYS.some((k) => latestOf(data[k]) !== null);
  const level = !anyData ? "nodata" : flagged.length ? flagged[0].lv : "ok";
  const color = LEVELS[level].color;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "10px",
        padding: "10px 14px",
        borderRadius: "10px",
        backgroundColor: `color-mix(in srgb, ${color} 12%, #020817)`,
        border: `1px solid ${color}88`,
        fontSize: "13px",
      }}
    >
      <strong style={{ color }}>{!anyData ? "WAITING FOR DATA" : flagged.length ? `${flagged.length} CHANNEL(S) NEED ATTENTION` : "ALL SYSTEMS NORMAL"}</strong>
      {flagged.map(({ k, lv }) => (
        <button
          key={k}
          onClick={() => onOpen(k)}
          title="Show details"
          style={{
            color: LEVELS[lv].color, background: "none", border: "none", padding: 0,
            font: "inherit", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "3px",
          }}
        >
          • {CHANNELS[k].label}
          {CHANNELS[k].flag ? "" : `: ${fmt(k, latestOf(data[k]))}`}
        </button>
      ))}
    </div>
  );
}

function Legend() {
  return (
    <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", fontSize: "11px", color: "#94a3b8" }}>
      {["ok", "caution", "warning", "critical"].map((lv) => (
        <span key={lv} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: LEVELS[lv].color }} />
          {LEVELS[lv].label}
        </span>
      ))}
      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
        <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: LEVELS.info.color }} />
        INFO (no limits)
      </span>
    </div>
  );
}

/* ==========================================================================
   APP: loads the last 2 minutes from Redis, then streams live over WebSocket.
   ========================================================================== */
/* ==========================================================================
   RECORDING + RUNS
   Everything that streams in is recorded in memory for the whole session, so
   you can scroll back to any moment. A run is a named slice of that recording
   (Start run / Stop run). Recording happens whether or not a run is started,
   so nothing is lost if nobody presses Start.

   Phase 2: the pit laptop saves runs to a database and the run list loads
   from there. The views below stay the same.
   ========================================================================== */
const MOCK_URL = import.meta.env.VITE_MOCK_URL || "http://localhost:5000";
const HISTORY_MAX_POINTS = 4 * 60 * 60; // per channel: ~4 hours at 1 update per second

const emptyHistory = () => Object.fromEntries(CHANNEL_KEYS.map((k) => [k, []]));

/** Index of the first point at or after time t (arrays are sorted by time). */
function lowerBound(arr, t, key = "timestampMs") {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid][key] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Every channel's points between startMs and endMs. */
function sliceHistory(history, startMs, endMs) {
  const out = {};
  for (const k of CHANNEL_KEYS) {
    const a = history[k];
    out[k] = a.slice(lowerBound(a, startMs), lowerBound(a, endMs + 1));
  }
  return out;
}

function pushPoint(arr, p, key = "timestampMs") {
  if (arr.length && arr[arr.length - 1][key] >= p[key]) return; // duplicate or out of order
  arr.push(p);
  if (arr.length > HISTORY_MAX_POINTS) arr.splice(0, arr.length - HISTORY_MAX_POINTS);
}

/** 754000 -> "12:34", 3754000 -> "1:02:34" */
function fmtDuration(ms) {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? h + ":" : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

const clockTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });

const controlStyle = {
  backgroundColor: "#1e293b", color: "#e2e8f0", fontFamily: "inherit", fontSize: "12px",
  padding: "6px 10px", borderRadius: "6px",
  borderTop: "1px solid #334155", borderRight: "1px solid #334155",
  borderBottom: "1px solid #334155", borderLeft: "1px solid #334155",
};

/* --- Run bar: Start/Stop, run picker, timeline, Back to live ------------- */
function RunBar({ runs, activeRun, view, setView, isLive, scopeStart, scopeEnd, windowEnd, onSeek, onBackToLive, onStart, onStop, now }) {
  const viewedRun = view === "live" ? null : runs.find((r) => r.id === view);
  const span = Math.max(1000, scopeEnd - scopeStart);
  const pos = Math.min(scopeEnd, Math.max(scopeStart, windowEnd));

  let label;
  if (viewedRun) label = `REPLAY · ${viewedRun.name} · ${fmtDuration(pos - scopeStart)} / ${fmtDuration(span)}`;
  else if (!isLive) label = `PAUSED at ${clockTime(pos)} · still recording`;
  else label = activeRun ? `● REC ${activeRun.name} · ${fmtDuration(now - activeRun.startMs)}` : "LIVE · recording";
  const labelColor = viewedRun || !isLive ? "#38bdf8" : activeRun ? "#ef4444" : "#22c55e";

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
      <select aria-label="Choose what to view" value={view} onChange={(e) => setView(e.target.value)} style={controlStyle}>
        <option value="live">{activeRun ? `Live · ${activeRun.name} (recording)` : "Live"}</option>
        {runs.filter((r) => r.endMs != null).length ? (
          <optgroup label="Today's runs">
            {runs
              .filter((r) => r.endMs != null)
              .slice()
              .reverse()
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {clockTime(r.startMs)} · {fmtDuration(r.endMs - r.startMs)}
                </option>
              ))}
          </optgroup>
        ) : null}
      </select>

      {activeRun ? (
        <button onClick={onStop} style={{ ...controlStyle, color: "#fecaca", backgroundColor: "#450a0a", borderTop: "1px solid #ef4444", borderRight: "1px solid #ef4444", borderBottom: "1px solid #ef4444", borderLeft: "1px solid #ef4444", cursor: "pointer" }}>
          ■ Stop run
        </button>
      ) : (
        <button onClick={onStart} style={{ ...controlStyle, color: "#bbf7d0", backgroundColor: "#052e16", borderTop: "1px solid #22c55e", borderRight: "1px solid #22c55e", borderBottom: "1px solid #22c55e", borderLeft: "1px solid #22c55e", cursor: "pointer" }}>
          ● Start run
        </button>
      )}

      <span style={{ fontSize: "12px", fontWeight: 700, color: labelColor, whiteSpace: "nowrap" }}>{label}</span>

      <div style={{ flex: "1 1 260px", display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
        <span style={{ fontSize: "10px", color: "#64748b", whiteSpace: "nowrap" }}>{viewedRun ? "0:00" : clockTime(scopeStart)}</span>
        <div style={{ position: "relative", flex: 1, minWidth: 120 }}>
          {/* Run segments shaded on the live timeline */}
          {!viewedRun
            ? runs.map((r) => {
                const a = Math.max(scopeStart, r.startMs), b = Math.min(scopeEnd, r.endMs ?? now);
                if (b <= a) return null;
                return (
                  <div key={r.id} title={r.name} style={{
                    position: "absolute", top: 6, height: 6, borderRadius: 3, pointerEvents: "none",
                    left: `${((a - scopeStart) / span) * 100}%`, width: `${((b - a) / span) * 100}%`,
                    backgroundColor: r.endMs == null ? "#ef444466" : "#38bdf855",
                  }} />
                );
              })
            : null}
          <input
            type="range"
            aria-label="Timeline: drag to go back in time"
            min={scopeStart}
            max={scopeStart + span}
            step={1000}
            value={pos}
            onChange={(e) => onSeek(Number(e.target.value))}
            style={{ width: "100%", accentColor: viewedRun || !isLive ? "#38bdf8" : "#22c55e", position: "relative" }}
          />
        </div>
        <span style={{ fontSize: "10px", color: "#64748b", whiteSpace: "nowrap" }}>{viewedRun ? fmtDuration(span) : "now"}</span>
      </div>

      {!isLive ? (
        <button onClick={onBackToLive} style={{ ...controlStyle, color: "#020817", backgroundColor: "#22c55e", fontWeight: 700, cursor: "pointer" }}>
          Back to live ●
        </button>
      ) : null}
    </div>
  );
}

/* --- Demo feed picker (only appears when the mock car is reachable) ------- */
function DemoFeed({ feeds, status, onFeed, onSpeed }) {
  if (!feeds.length) return null;
  const pos = status?.position_s ?? 0;
  const detail = status
    ? status.kind === "sim"
      ? `Sim run ${status.run} · lap ${status.lap}`
      : `${fmtDuration(pos * 1000)} / ${fmtDuration((status.duration_s ?? 0) * 1000)}`
    : "";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "12px" }}
      title="Demo only: chooses what the fake car sends. The real car can't be switched.">
      <span style={{ color: "#64748b", letterSpacing: "0.1em", fontSize: "10px" }}>DEMO FEED</span>
      <select aria-label="Demo feed" value={status?.id ?? "sim"} onChange={(e) => onFeed(e.target.value)} style={controlStyle}>
        {feeds.map((f) => (
          <option key={f.id} value={f.id}>
            {f.kind === "sim" ? f.label : `${f.label} · ${fmtDuration(f.duration_s * 1000)}${f.moving === false ? " (car parked)" : ""}`}
          </option>
        ))}
      </select>
      <select aria-label="Playback speed" value={String(status?.speed ?? 1)} onChange={(e) => onSpeed(Number(e.target.value))} style={controlStyle}>
        {[1, 2, 5, 10].map((x) => (
          <option key={x} value={String(x)}>{x}×</option>
        ))}
      </select>
      <span style={{ color: "#94a3b8", fontFamily: "monospace" }}>{detail}</span>
    </div>
  );
}

/* ==========================================================================
   APP
   ========================================================================== */
export default function App() {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
  const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws";

  // Recording lives in refs (it can get large); `version` re-renders when it grows.
  const historyRef = useRef(emptyHistory());
  const trackRef = useRef([]); // [{ t, lat, lon }]
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeDuck, setActiveDuck] = useState("");
  const [ducks, setDucks] = useState([]);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Runs and what's being viewed
  const [runs, setRuns] = useState([]); // [{ id, name, startMs, endMs|null }]
  const runCounter = useRef(0);
  const [view, setViewState] = useState("live"); // "live" or a run id
  const [cursorMs, setCursorMs] = useState(null); // null = follow live / show end of run
  const [liveSince, setLiveSince] = useState(0); // Live view starts here (reset when the feed changes)

  // Demo feed (mock car controls)
  const [feeds, setFeeds] = useState([]);
  const [feedStatus, setFeedStatus] = useState(null);

  const validTabs = ["overview", "track", ...PANELS.map((p) => p.id)];
  const [tab, setTabState] = useState(() => {
    const h = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    return validTabs.includes(h) ? h : "overview";
  });
  const setTab = (t) => {
    setTabState(t);
    try {
      window.history.replaceState(null, "", `#${t}`);
    } catch {
      /* ignore */
    }
  };

  /** Jump to a channel's detail view and flash its card. */
  const openChannel = (key) => {
    const target = tabForChannel(key);
    setTab(target);
    setTimeout(() => {
      const el = document.getElementById(`card-${key}`);
      if (!el) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.animate?.([{ outline: "3px solid #f8fafc" }, { outline: "3px solid transparent" }], { duration: 1500 });
    }, 60);
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  /* --- Demo feed: load list, poll status --- */
  const mockCall = async (path, method = "GET") => {
    const res = await fetch(`${MOCK_URL}${path}`, { method });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  };
  useEffect(() => {
    let alive = true;
    mockCall("/control/feeds")
      .then((j) => alive && setFeeds(j.feeds || []))
      .catch(() => alive && setFeeds([])); // no mock (real hardware): hide the demo controls
    const poll = setInterval(() => {
      mockCall("/control/status").then((j) => alive && setFeedStatus(j)).catch(() => {});
    }, 2000);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, []);

  /* --- Ducks --- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/ducks`);
        const json = await res.json();
        const list = Array.isArray(json?.ducks) ? json.ducks : [];
        if (cancelled) return;
        setDucks(list);
        if (list.length) setActiveDuck((cur) => cur || list[0]);
      } catch (e) {
        console.error("Failed to load ducks:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* --- Load the last 2 minutes from Redis, then record everything live --- */
  useEffect(() => {
    let cancelled = false;
    let socket = null;

    async function hydrateAndConnect() {
      historyRef.current = emptyHistory();
      trackRef.current = [];
      setRuns([]);
      setViewState("live");
      setCursorMs(null);
      bump();
      setLastUpdated(null);
      setConnected(false);
      if (!activeDuck) return;

      const next = emptyHistory();
      await Promise.all(
        CHANNEL_KEYS.map(async (k) => {
          try {
            const res = await fetch(`${API_BASE_URL}/api/${encodeURIComponent(activeDuck)}/metrics/${k}`);
            const json = await res.json();
            const raw = json?.[Object.keys(json || {})[0]] ?? [];
            next[k] = raw
              .map((s) => {
                try {
                  const o = typeof s === "string" ? JSON.parse(s) : s;
                  return { timestampMs: new Date(o.timestamp).getTime(), value: clean(k, o.value) };
                } catch {
                  return null;
                }
              })
              .filter((p) => p && Number.isFinite(p.timestampMs) && p.value !== null)
              .sort((a, b) => a.timestampMs - b.timestampMs);
          } catch (e) {
            console.error(`Hydration failed for ${k}:`, e);
          }
        })
      );
      if (cancelled) return;
      historyRef.current = next;
      const lonByTime = new Map(next.gps_longitude.map((p) => [p.timestampMs, p.value]));
      trackRef.current = next.gps_latitude
        .filter((p) => lonByTime.has(p.timestampMs))
        .map((p) => ({ t: p.timestampMs, lat: p.value, lon: lonByTime.get(p.timestampMs) }))
        .filter((p) => Math.abs(p.lat) > 1e-6 || Math.abs(p.lon) > 1e-6);
      bump();
      setLastUpdated(new Date().toLocaleTimeString());

      socket = new WebSocket(WS_URL);
      socket.onopen = () => !cancelled && setConnected(true);
      socket.onmessage = (event) => {
        if (cancelled) return;
        const message = JSON.parse(event.data);
        if (message.type !== "data" || !Array.isArray(message.records)) return;
        const hist = historyRef.current;
        let touched = false;
        for (const record of message.records) {
          if (record?.device_id !== activeDuck) continue;
          const ts = new Date(record.timestamp).getTime();
          if (!Number.isFinite(ts)) continue;
          for (const k of CHANNEL_KEYS) {
            if (record[k] === undefined) continue;
            const v = clean(k, record[k]);
            if (v === null) continue; // sensor glitch: skip it
            pushPoint(hist[k], { timestampMs: ts, value: v });
            touched = true;
          }
          const lat = clean("gps_latitude", record.gps_latitude);
          const lon = clean("gps_longitude", record.gps_longitude);
          if (lat !== null && lon !== null && (Math.abs(lat) > 1e-6 || Math.abs(lon) > 1e-6)) {
            pushPoint(trackRef.current, { t: ts, lat, lon }, "t");
          }
        }
        if (touched) {
          bump();
          setLastUpdated(new Date().toLocaleTimeString());
        }
      };
      socket.onerror = (err) => {
        console.error("WebSocket Error:", err);
        if (!cancelled) setConnected(false);
      };
      socket.onclose = () => !cancelled && setConnected(false);
    }

    hydrateAndConnect();
    return () => {
      cancelled = true;
      setConnected(false);
      if (socket) socket.close();
    };
  }, [activeDuck]);

  /* --- Runs --- */
  const activeRun = runs.find((r) => r.endMs == null) || null;
  const viewedRun = view === "live" ? null : runs.find((r) => r.id === view) || null;

  const startRun = async () => {
    // On the mock, a new run also means a fresh battery at the start line.
    if (feeds.length) {
      try {
        setFeedStatus(await mockCall("/control/restart", "POST"));
      } catch {
        /* real hardware: nothing to reset */
      }
    }
    runCounter.current += 1;
    const id = `run-${Date.now()}`;
    setRuns((rs) => [...rs, { id, name: `Run ${runCounter.current}`, startMs: Date.now(), endMs: null }]);
    setViewState("live");
    setCursorMs(null);
  };
  const stopRun = () => {
    const end = Date.now();
    setRuns((rs) => rs.map((r) => (r.endMs == null ? { ...r, endMs: end } : r)));
  };
  const setView = (v) => {
    setViewState(v);
    setCursorMs(null); // a past run opens at its end; Live follows now
  };
  const backToLive = () => {
    setViewState("live");
    setCursorMs(null);
  };

  const changeFeed = async (id) => {
    if (activeRun) stopRun(); // a different car feed can't be the same run
    // Start the live view fresh (skip ~2 s so the old feed's last in-flight sample doesn't sneak in).
    setLiveSince(Date.now() + 2000);
    setViewState("live");
    setCursorMs(null);
    try {
      setFeedStatus(await mockCall(`/control/feed?id=${encodeURIComponent(id)}`, "POST"));
    } catch (e) {
      console.error("Could not switch demo feed:", e);
    }
  };
  const changeSpeed = async (x) => {
    try {
      setFeedStatus(await mockCall(`/control/speed?x=${x}`, "POST"));
    } catch (e) {
      console.error("Could not change speed:", e);
    }
  };

  /* --- What's on screen: everything is "as of" windowEnd --- */
  const firstTs = useMemo(() => {
    const firsts = CHANNEL_KEYS.map((k) => historyRef.current[k][0]?.timestampMs).filter(Number.isFinite);
    return firsts.length ? Math.min(...firsts) : null;
  }, [version]);
  const scopeStart = viewedRun ? viewedRun.startMs : Math.max(firstTs ?? now - WINDOW_MS, liveSince);
  const scopeEnd = viewedRun ? viewedRun.endMs : now;
  const isLive = !viewedRun && cursorMs === null;
  const windowEnd = cursorMs ?? scopeEnd;

  const data = useMemo(
    () => sliceHistory(historyRef.current, Math.max(windowEnd - WINDOW_MS, scopeStart), windowEnd),
    [version, windowEnd, scopeStart]
  );
  const scopeTrack = useMemo(() => {
    const t = trackRef.current;
    return t.slice(lowerBound(t, scopeStart, "t"), lowerBound(t, scopeEnd + 1, "t"));
  }, [version, scopeStart, scopeEnd]);

  const seek = (ms) => {
    // Dragging all the way right on Live snaps back to following live.
    if (!viewedRun && ms >= now - 1500) setCursorMs(null);
    else setCursorMs(ms);
  };

  return (
    <div
      style={{
        backgroundColor: "#020817",
        minHeight: "100vh",
        width: "100%",
        maxWidth: "100vw",
        padding: "24px clamp(12px, 4vw, 40px)",
        color: "#e2e8f0",
        fontFamily: "'Courier New', monospace",
        boxSizing: "border-box",
        overflowX: "clip", // "clip" (not "hidden") so the sticky header keeps working
        alignSelf: "flex-start",
      }}
    >
      <style>{`
        body { background-color: #020817; }
        @keyframes pulseCritical { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.0); } 50% { box-shadow: 0 0 14px 2px rgba(239,68,68,0.45); } }
        .pulse-critical { animation: pulseCritical 1.4s ease-in-out infinite; }
        .track-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
        @media (min-width: 900px) { .track-grid { grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr); } }
        @keyframes pulseDot { 0%,100% { opacity: 0.15; } 50% { opacity: 0.55; } }
        .pulse-dot { animation: pulseDot 1s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .pulse-critical, .pulse-dot { animation: none; } }
        button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid #38bdf8; outline-offset: 2px; }
      `}</style>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "16px",
          paddingBottom: "6px",
        }}
      >
        <div>
          <div style={{ fontSize: "11px", color: "#475569", letterSpacing: "0.2em", marginBottom: "4px" }}>UCONN FORMULA SAE</div>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 800, letterSpacing: "0.05em" }}>TELEMETRY DASHBOARD</h1>
          <div style={{ marginTop: "8px" }}>
            <Legend />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <select value={activeDuck} onChange={(e) => setActiveDuck(e.target.value)} style={controlStyle} aria-label="Car">
              {!ducks.length ? (
                <option value="" disabled>
                  Loading...
                </option>
              ) : null}
              {ducks.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: connected ? "#22c55e" : "#ef4444" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: connected ? "#22c55e" : "#ef4444" }} />
              {connected ? "CONNECTED" : "DISCONNECTED"}
            </span>
            <span style={{ fontSize: "11px", color: "#64748b" }}>{lastUpdated ? `Updated ${lastUpdated}` : ""}</span>
          </div>
          <DemoFeed feeds={feeds} status={feedStatus} onFeed={changeFeed} onSpeed={changeSpeed} />
        </div>
      </div>

      {/* Sticky: tabs, run bar and warning bar stay visible while scrolling */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          backgroundColor: "#020817",
          paddingTop: "10px",
          paddingBottom: "12px",
          marginBottom: "12px",
          borderBottom: "1px solid #1e293b",
        }}
      >
        <Tabs tab={tab} setTab={setTab} data={data} />
        <RunBar
          runs={runs}
          activeRun={activeRun}
          view={view}
          setView={setView}
          isLive={isLive}
          scopeStart={scopeStart}
          scopeEnd={scopeEnd}
          windowEnd={windowEnd}
          onSeek={seek}
          onBackToLive={backToLive}
          onStart={startRun}
          onStop={stopRun}
          now={now}
        />
        <StatusBar data={data} onOpen={openChannel} />
      </div>

      {tab === "overview" ? (
        <Overview data={data} windowEndMs={windowEnd} onOpen={openChannel} />
      ) : tab === "track" ? (
        <TrackView track={scopeTrack} cursorMs={isLive ? null : windowEnd} data={data} windowEndMs={windowEnd} />
      ) : (
        PANELS.filter((p) => p.id === tab).map((p) => (
          <Panel key={p.id} panel={p} data={data} windowEndMs={windowEnd} />
        ))
      )}
    </div>
  );
}
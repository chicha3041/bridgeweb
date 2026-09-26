// Histórico local v6. El partido conserva su evento original y una clave de serie.
import { pyRound2 } from "./bridge-core.js";
const KEY = "bridgelab_stats";
export const SIN_EVENTO = "sin-evento";
const empty = () => ({ version: 6, partidos: {}, equipos: {} });

// No se quitan números de temporada/jornada: 2025 y 2026 no deben mezclarse.
// Solo se quita un sufijo inequívoco de enfrentamiento tras ':' ("A vs B").
// No se intenta adivinar ligas con nombres totalmente diferentes.
export function eventKey(evento) {
  const text = String(evento || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*:\s*[^:]+\s+(?:vs\.?|v\.?|contra)\s+[^:]+$/i, "")
    .toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, " ").trim();
  return text || SIN_EVENTO;
}
export function eventLabel(evento) {
  const original = String(evento || "").trim();
  return original.replace(/\s*:\s*[^:]+\s+(?:vs\.?|v\.?|contra)\s+[^:]+$/i, "").trim() || original || "Sin evento";
}
export function eventOptions(stats) {
  const result = new Map();
  for (const p of Object.values(stats.partidos || {})) {
    const key = p.eventoClave || eventKey(p.evento);
    if (!result.has(key)) result.set(key, eventLabel(p.evento));
  }
  return [...result].sort((a, b) => a[1].localeCompare(b[1], "es"));
}
export function filterStats(stats, key) {
  if (!key) return stats;
  return { ...stats, partidos: Object.fromEntries(Object.entries(stats.partidos || {})
    .filter(([, p]) => (p.eventoClave || eventKey(p.evento)) === key)) };
}
function nextTeamId(stats) {
  let n = 1;
  while (stats.equipos[`eq${n}`]) n++;
  return `eq${n}`;
}
function migrate(s) {
  if (!s || typeof s !== "object" || !s.partidos || typeof s.partidos !== "object" || Array.isArray(s.partidos))
    throw new Error("Histórico incompatible. No se ha modificado; guarda una copia antes de borrarlo.");
  if (s.version === 6) return s;
  const oldTeams = s.equipos || {};
  const teams = {};
  const mapping = new Map();
  // Dos pasos: los ID originales deben estar disponibles antes de remapearlos.
  for (const p of Object.values(s.partidos)) {
    p.eventoClave = eventKey(p.evento);
    for (const side of Object.values(p.equipos || {})) {
      if (!side || !side.id) continue;
      const old = `${p.eventoClave}\u0000${side.id}`;
      if (!mapping.has(old)) {
        let id = side.id;
        if (teams[id]) { let n = 1; while (teams[`eq${n}`]) n++; id = `eq${n}`; }
        mapping.set(old, id);
        const def = oldTeams[side.id] || {};
        teams[id] = { nombre: def.nombre || `Equipo ${id.slice(2)}`, jugadores: [] };
      }
    }
  }
  for (const p of Object.values(s.partidos)) {
    for (const side of Object.values(p.equipos || {})) {
      if (!side || !side.id) continue;
      side.id = mapping.get(`${p.eventoClave}\u0000${side.id}`);
      teams[side.id].jugadores = [...new Set([...teams[side.id].jugadores, ...(side.jugadores || [])])].sort();
    }
  }
  // Guardar también definiciones v5 sin partidos asociados (p. ej. renombradas),
  // sin permitir que interfieran con la asignación de equipos nuevos.
  for (const [id, def] of Object.entries(oldTeams)) {
    if (![...mapping.keys()].some(k => k.endsWith(`\u0000${id}`))) {
      let target = id;
      if (teams[target]) { let n = 1; while (teams[`eq${n}`]) n++; target = `eq${n}`; }
      teams[target] = def;
    }
  }
  s.equipos = teams;
  s.version = 6;
  return s;
}
export function loadStats() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return empty();
  const parsed = JSON.parse(raw);
  if (parsed.version === 6) return parsed;
  // Se escribe solamente después de completar la migración; la versión antigua permanece
  // intacta si no puede leerse o si el navegador rechaza la escritura.
  const s = migrate(parsed);
  saveStats(s);
  return s;
}
export function saveStats(stats) { localStorage.setItem(KEY, JSON.stringify(stats)); }
export function clearStats(key) {
  if (!key) { localStorage.removeItem(KEY); return; }
  const s = loadStats();
  for (const [id, p] of Object.entries(s.partidos))
    if ((p.eventoClave || eventKey(p.evento)) === key) delete s.partidos[id];
  const used = new Set(Object.values(s.partidos).flatMap(p => Object.values(p.equipos || {}).map(e => e.id)));
  for (const id of Object.keys(s.equipos)) if (!used.has(id)) delete s.equipos[id];
  saveStats(s);
}
export function renameEquipo(id, nombre) {
  const s = loadStats();
  if (s.equipos[id]) { s.equipos[id].nombre = nombre; saveStats(s); }
  return s;
}
async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
// V6 identifica el contenido y no solo los nombres de archivos y números de mano.
export async function matchKey(analyzer) {
  const base = analyzer.matchIdentity || analyzer.sourceFiles.slice().sort().join("|") + "|" +
    [...analyzer.activeBoards].sort((a, b) => a - b).join(",");
  return (await sha256Hex(base)).slice(0, 24);
}
function asignarEquipo(stats, roster, eventoClave, excluidos = new Set()) {
  let best = null, bestOv = 0;
  const used = new Set(Object.values(stats.partidos).filter(p => p.eventoClave === eventoClave)
    .flatMap(p => Object.values(p.equipos || {}).map(e => e.id)));
  for (const [id, eq] of Object.entries(stats.equipos)) {
    if (!used.has(id) || excluidos.has(id)) continue;
    const ov = roster.filter(n => (eq.jugadores || []).includes(n)).length;
    if (ov > bestOv) { best = id; bestOv = ov; }
  }
  if (best) return best;
  const id = nextTeamId(stats);
  stats.equipos[id] = { nombre: "Equipo " + id.slice(2), jugadores: [] };
  return id;
}
export async function registrarEstadisticas(analyzer) {
  const stats = loadStats();
  const eventoClave = eventKey(analyzer.matchEvent);
  const jugadores = {};
  for (const [name, d] of Object.entries(analyzer.playersData)) {
    if (!name) continue;
    const manos = new Set([...Object.keys(d.bidding), ...Object.keys(d.play)]);
    jugadores[name] = {
      subasta: Object.values(d.bidding).reduce((a, b) => a + b, 0),
      carteo: Object.values(d.play).reduce((a, b) => a + b, 0),
      imps: pyRound2(Object.values(d.imps).reduce((a, b) => a + b, 0)),
      manos: manos.size, errores_carteo: d.errores_carteo || [],
    };
  }
  const key = await matchKey(analyzer);
  // Compatibilidad al volver a analizar un partido guardado en v5: sustituir solo
  // si coinciden fecha, evento y archivos; nunca descartar otro partido distinto.
  let replaceKey = key;
  if (!stats.partidos[key]) {
    const files = analyzer.sourceFiles.map(f => f.split("/").pop()).sort().join("|");
    const old = Object.entries(stats.partidos).find(([id, p]) => id.length === 12 &&
      p.fecha === analyzer.matchDate && p.eventoClave === eventoClave &&
      (p.archivos || []).slice().sort().join("|") === files && p.manos === analyzer.activeBoards.size);
    if (old) replaceKey = old[0];
  }
  // Reutilizar los equipos del partido si ya existía, sin cambiar identidades al repetirlo.
  const previous = stats.partidos[replaceKey];
  const equiposPartido = {};
  for (const [lado, tn] of [["A", "Equipo A"], ["B", "Equipo B"]]) {
    const roster = [...analyzer.teamsRoster[tn]].filter(Boolean).sort();
    if (!roster.length) continue;
    const id = previous?.eventoClave === eventoClave && previous.equipos?.[lado]?.id ||
      asignarEquipo(stats, roster, eventoClave, new Set(Object.values(equiposPartido).map(side => side.id)));
    const eq = stats.equipos[id] || (stats.equipos[id] = { nombre: `Equipo ${id.slice(2)}`, jugadores: [] });
    eq.jugadores = [...new Set([...(eq.jugadores || []), ...roster])].sort();
    equiposPartido[lado] = { id, jugadores: roster, imps: analyzer.matchGrossGain[tn] || 0 };
  }
  const now = new Date(), pad = n => String(n).padStart(2, "0");
  stats.partidos[replaceKey] = {
    fecha: analyzer.matchDate || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    evento: analyzer.matchEvent || "", eventoClave,
    archivos: analyzer.sourceFiles.map(f => f.split("/").pop()),
    manos: analyzer.activeBoards.size,
    procesado: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    jugadores, equipos: equiposPartido,
  };
  saveStats(stats);
  return stats;
}

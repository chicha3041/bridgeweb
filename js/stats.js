// Histórico de partidos en localStorage (sustituye a bridgelab_stats.json)
import { pyRound2 } from "./bridge-core.js";

const KEY = "bridgelab_stats";

export function loadStats() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (!s.equipos) s.equipos = {};
      return s;
    }
  } catch (e) { /* corrupto: empezar de cero */ }
  return { partidos: {}, equipos: {} };
}
export function saveStats(stats) {
  localStorage.setItem(KEY, JSON.stringify(stats));
}
export function clearStats() {
  localStorage.removeItem(KEY);
}

export function renameEquipo(id, nombre) {
  const stats = loadStats();
  if (!stats.equipos) stats.equipos = {};
  if (stats.equipos[id]) {
    stats.equipos[id].nombre = nombre;
    saveStats(stats);
  }
  return stats;
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Clave deduplicadora del partido (misma base que el Python: nombres de archivo ordenados + manos)
export async function matchKey(analyzer) {
  const base = analyzer.sourceFiles.slice().sort().join("|") + "|" +
    [...analyzer.activeBoards].sort((a, b) => a - b).join(",");
  return (await sha256Hex(base)).slice(0, 12);
}

// Asigna una alineación (los jugadores de un bando en este partido) a un equipo
// registrado: gana el equipo con más jugadores en común; si ninguno coincide, se crea.
function asignarEquipo(stats, roster) {
  if (!stats.equipos) stats.equipos = {};
  let best = null, bestOv = 0;
  for (const [id, eq] of Object.entries(stats.equipos)) {
    const ov = roster.filter(n => (eq.jugadores || []).includes(n)).length;
    if (ov > bestOv) { best = id; bestOv = ov; }
  }
  if (best) return best;
  const id = "eq" + (Object.keys(stats.equipos).length + 1);
  stats.equipos[id] = { nombre: "Equipo " + id.slice(2), jugadores: [] };
  return id;
}

// Port de registrar_estadisticas: guarda el partido en el histórico, con equipos
export async function registrarEstadisticas(analyzer) {
  const stats = loadStats();
  if (!stats.equipos) stats.equipos = {};
  const jugadores = {};
  for (const [name, d] of Object.entries(analyzer.playersData)) {
    if (!name) continue;
    const manos = new Set([...Object.keys(d.bidding), ...Object.keys(d.play)]);
    jugadores[name] = {
      subasta: Object.values(d.bidding).reduce((a, b) => a + b, 0),
      carteo: Object.values(d.play).reduce((a, b) => a + b, 0),
      imps: pyRound2(Object.values(d.imps).reduce((a, b) => a + b, 0)),
      manos: manos.size,
      errores_carteo: d.errores_carteo || [],
    };
  }
  // Equipos: cada bando se asigna al equipo registrado con más coincidencias
  const equiposPartido = {};
  for (const [lado, tn] of [["A", "Equipo A"], ["B", "Equipo B"]]) {
    const roster = [...analyzer.teamsRoster[tn]].filter(Boolean).sort();
    if (!roster.length) continue;
    const id = asignarEquipo(stats, roster);
    const eq = stats.equipos[id];
    eq.jugadores = [...new Set([...(eq.jugadores || []), ...roster])].sort();
    equiposPartido[lado] = {
      id,
      jugadores: roster,
      imps: analyzer.matchGrossGain[tn] || 0,
    };
  }
  const key = await matchKey(analyzer);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  stats.partidos[key] = {
    fecha: analyzer.matchDate || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    evento: analyzer.matchEvent || "",
    archivos: analyzer.sourceFiles.map(f => f.split("/").pop()),
    manos: analyzer.activeBoards.size,
    procesado: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    jugadores,
    equipos: equiposPartido,
  };
  saveStats(stats);
  return stats;
}

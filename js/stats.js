// Histórico de partidos en localStorage (sustituye a bridgelab_stats.json)
import { pyRound2 } from "./bridge-core.js";

const KEY = "bridgelab_stats";

export function loadStats() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* corrupto: empezar de cero */ }
  return { partidos: {} };
}
export function saveStats(stats) {
  localStorage.setItem(KEY, JSON.stringify(stats));
}
export function clearStats() {
  localStorage.removeItem(KEY);
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

// Port de registrar_estadisticas: guarda el partido en el histórico
export async function registrarEstadisticas(analyzer) {
  const stats = loadStats();
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
  };
  saveStats(stats);
  return stats;
}

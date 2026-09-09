// Exportación a Excel con ExcelJS: estructura clara y formato real
// (cabeceras con color, anchos de columna, negativos en rojo, subtotales)
import {
  filasInformePorEquipos, ordenarPorEquipos, ladoDe,
  calcularEstadisticasEquipos, filasJugadoresEquipo,
} from "./analyzer.js";
import { pyRound2 } from "./bridge-core.js";

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A5F" } };
const TEAM_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E2F3" } };
const SUBTOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
const TITLE_FONT = { bold: true, size: 14, color: { argb: "FF1F3A5F" } };
const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" } };
const RED = "FFB00020", GREEN = "FF0A6B2D";

// Sustituye letras de palo por símbolos en textos de subasta/contrato ("1S - P" -> "1♠ - P", "4SS+2" -> "4♠S+2")
const SUIT_SYM_TXT = { S: "♠", H: "♥", D: "♦", C: "♣" };
const suitify = (s) => String(s ?? "").replace(/([1-7])([SHDC])/g, (m, l, st) => l + SUIT_SYM_TXT[st]);

function titleRow(ws, text) {
  const r = ws.addRow([text]);
  r.getCell(1).font = TITLE_FONT;
  r.height = 20;
  return r;
}
function headerRow(ws, values) {
  const r = ws.addRow(values);
  r.eachCell(c => { c.fill = HEADER_FILL; c.font = HEADER_FONT; });
  return r;
}
function teamRow(ws, text, span) {
  const r = ws.addRow([text]);
  for (let i = 1; i <= span; i++) { r.getCell(i).fill = TEAM_FILL; r.getCell(i).font = { bold: true }; }
  return r;
}
function dataRow(ws, values, { bold = false, fill = null, numFmt = {} } = {}) {
  const r = ws.addRow(values);
  r.eachCell((c, i) => {
    if (bold) c.font = { ...(c.font || {}), bold: true };
    if (fill) c.fill = fill;
    if (typeof c.value === "number") {
      if (numFmt[i]) c.numFmt = numFmt[i];
      if (c.value < 0) c.font = { ...(c.font || {}), color: { argb: RED }, bold };
    }
  });
  return r;
}

export async function exportToExcel(analyzer, stats) {
  const wb = new ExcelJS.Workbook();
  const boards = [...analyzer.activeBoards].sort((a, b) => a - b);
  const numFmtImps = { 5: "0.00" };

  // ---- Resumen (primera hoja: lo importante de un vistazo) ----
  const ws = wb.addWorksheet("Resumen");
  ws.columns = [{ width: 28 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 14 }];
  titleRow(ws, "INFORME DEL PARTIDO");
  dataRow(ws, ["Evento", analyzer.matchEvent || "-"]);
  dataRow(ws, ["Fecha", analyzer.matchDate || "-"]);
  dataRow(ws, ["Manos", boards.length]);
  ws.addRow([]);
  const ra = analyzer.matchGrossGain["Equipo A"], rb = analyzer.matchGrossGain["Equipo B"];
  teamRow(ws, "BALANCE DEL PARTIDO", 5);
  dataRow(ws, ["Equipo A (bruto)", ra, "Equipo B (bruto)", rb], { bold: true });
  const neto = pyRound2(ra - rb);
  const wr = dataRow(ws, [ra > rb ? "EQUIPO A GANA" : rb > ra ? "EQUIPO B GANA" : "EMPATE", Math.abs(neto)]);
  wr.getCell(1).font = { bold: true, color: { argb: neto < 0 ? RED : GREEN } };
  ws.addRow([]);
  headerRow(ws, ["Jugador", "Subasta", "Carteo", "Total Pts", "IMPs"]);
  for (const g of filasInformePorEquipos(analyzer)) {
    teamRow(ws, g.equipo.toUpperCase(), 5);
    const conImps = g.filas.map(([name, ts, tc, tot]) => {
      const d = analyzer.playersData[name];
      const ti = d ? pyRound2(Object.values(d.imps).reduce((a, b) => a + b, 0)) : 0;
      return [name, ts, tc, tot, ti];
    });
    for (const row of conImps) dataRow(ws, row, { numFmt: numFmtImps });
    const timp = pyRound2(conImps.reduce((a, r) => a + r[4], 0));
    dataRow(ws, [`Subtotal ${g.equipo}`, g.subtotal[0], g.subtotal[1], g.subtotal[2], timp],
      { bold: true, fill: SUBTOTAL_FILL, numFmt: numFmtImps });
  }
  ws.addRow([]);
  for (const tn of ["Equipo A", "Equipo B"]) {
    let bT = [null, -1e9], bC = [null, -1e9];
    for (const n of [...analyzer.teamsRoster[tn]]) {
      const d = analyzer.playersData[n];
      if (!d) continue;
      const tot = Object.values(d.bidding).reduce((a, b) => a + b, 0) + Object.values(d.play).reduce((a, b) => a + b, 0);
      const ti = Object.values(d.imps).reduce((a, b) => a + b, 0);
      if (tot > bT[1]) bT = [n, tot];
      if (ti > bC[1]) bC = [n, ti];
    }
    dataRow(ws, [`Mejor técnico ${tn}: ${bT[0] || "-"}`, bT[1] === -1e9 ? "" : bT[1]]);
    const r2 = dataRow(ws, [`Mejor competitivo ${tn}: ${bC[0] || "-"}`, "", "", "", bC[1] === -1e9 ? "" : pyRound2(bC[1])], { numFmt: numFmtImps });
  }

  // ---- Una hoja por mano ----
  for (const num of boards) {
    const bd = analyzer.boardsDetail[num];
    const wsB = wb.addWorksheet(`Mano ${num}`.slice(0, 31));
    wsB.columns = [{ width: 26 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 44 }];
    titleRow(wsB, `MANO ${num}`);
    const s = bd.imps_summary || {};
    if (s.board_imps !== undefined) {
      dataRow(wsB, [`Resultado: diff ${s.diff_pts} pts NS → ${s.board_imps} IMPs para Equipo ${s.board_imps >= 0 ? "A" : "B"}`], { bold: true });
    }
    wsB.addRow([]);
    for (const room of ["Abierta", "Cerrada"]) {
      const det = bd[room];
      if (!det) continue;
      const m = det.meta;
      teamRow(wsB, `SALA ${room.toUpperCase()}`, 7);
      dataRow(wsB, ["Subasta", suitify(m["Subasta Real"])]);
      dataRow(wsB, ["Contrato", suitify(m["Contrato Final"]), "Puntos (NS)", m["Puntos Reales (NS)"]]);
      dataRow(wsB, ["Par", `${suitify(m["Par Contrato"])} (${m["Par Puntos (NS)"]} pts NS)`, "Vulnerabilidad", m.Vulnerabilidad, "Dador", m.Dador]);
      if (m.Comentarios) dataRow(wsB, ["Comentarios", m.Comentarios]);
      wsB.addRow([]);
      headerRow(wsB, ["Jugador", "Equipo", "Pos", "Subasta", "Carteo", "Total", "Detalle carteo / IMPs"]);
      let lastTeam = null;
      for (const p of ordenarPorEquipos(det.players, room)) {
        const team = ladoDe(room, p.Pos) === "A" ? "Equipo A" : "Equipo B";
        if (team !== lastTeam) { teamRow(wsB, team, 7); lastTeam = team; }
        dataRow(wsB, [p.Jugador, team.slice(-1), p.Pos, p.Subasta, p.Carteo, p.Total,
          `${p.Detalle_Carteo || ""}${p.Detalle_Carteo ? " · " : ""}IMPs: ${p.IMPs_Atribuidos}`]);
      }
      wsB.addRow([]);
    }
    if (s.board_imps !== undefined) {
      teamRow(wsB, "ATRIBUCIÓN DE IMPs", 7);
      dataRow(wsB, ["Equipo A", s.team_a_imps, "Equipo B", s.team_b_imps], { bold: true });
    }
  }

  // ---- Estadísticas por equipo ----
  const { teams, legacyCount } = calcularEstadisticasEquipos(stats);
  const ids = Object.keys(teams);
  if (ids.length) {
    const wsE = wb.addWorksheet("Estadísticas");
    wsE.columns = [{ width: 26 }, { width: 10 }, { width: 8 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 11 }, { width: 12 }];
    titleRow(wsE, "ESTADÍSTICAS ACUMULADAS POR EQUIPO");
    wsE.addRow([]);
    ids.sort((a, b) => teams[b].imps - teams[a].imps);
    for (const id of ids) {
      const t = teams[id];
      teamRow(wsE, `${t.nombre} — ${t.partidos} partido(s), ${t.manos} manos, ${pyRound2(t.imps)} IMPs (butler ${t.manos ? pyRound2(t.imps / t.manos) : 0})`, 9);
      headerRow(wsE, ["Jugador", "Partidos", "Manos", "IMPs", "Butler", "Subasta", "Carteo", "Err.Carteo", "Tendencia"]);
      for (const f of filasJugadoresEquipo(t)) {
        dataRow(wsE, [f.name, f.partidos, f.manos, f.imps, f.butler, f.subasta, f.carteo, f.errores, f.tendencia],
          { numFmt: { 4: "0.00", 5: "0.00" } });
      }
      wsE.addRow([]);
    }
    if (legacyCount) dataRow(wsE, [`Nota: ${legacyCount} partido(s) antiguo(s) sin datos de equipo no incluidos.`]);
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "bridge_match_technical_report.xlsx";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

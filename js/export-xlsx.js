// Exportación a Excel con SheetJS (misma estructura que el informe Python)
import { calcularEstadisticas, filasEstadisticas } from "./analyzer.js";
import { pyRound2 } from "./bridge-core.js";

export function exportToExcel(analyzer, stats) {
  const wb = XLSX.utils.book_new();
  const boards = [...analyzer.activeBoards].sort((a, b) => a - b);

  for (const num of boards) {
    const bd = analyzer.boardsDetail[num];
    const rows = [];
    const rooms = Object.keys(bd).filter(k => k !== "imps_summary");
    for (const room of rooms) {
      const det = bd[room];
      rows.push([`SALA: ${room.toUpperCase()}`]);
      const meta = { ...det.meta }; delete meta.Manos; delete meta.Play; delete meta.Actors; delete meta.Critical_Plays;
      rows.push(Object.keys(meta));
      rows.push(Object.values(meta).map(v => typeof v === "object" ? JSON.stringify(v) : v));
      rows.push([]);
      for (const [sn, sr] of [["Pareja NS", ["NORTH", "SOUTH"]], ["Pareja EW", ["EAST", "WEST"]]]) {
        const sp = det.players.filter(p => sr.includes(p.Pos));
        if (!sp.length) continue;
        rows.push([`Pareja: ${sn}`]);
        rows.push(["Jugador", "Pos", "Subasta", "Carteo", "Total", "Detalle_Carteo", "Subasta_Calculo", "IMPs_Atribuidos", "Sala", "Vulnerabilidad"]);
        for (const p of sp) rows.push([p.Jugador, p.Pos, p.Subasta, p.Carteo, p.Total, p.Detalle_Carteo, p.Subasta_Calculo, p.IMPs_Atribuidos, p.Sala, p.Vulnerabilidad]);
        const sb = sp.reduce((a, p) => a + p.Subasta, 0), sv = sp.reduce((a, p) => a + p.Carteo, 0);
        rows.push([`SUBTOTAL ${sn}`, "", sb, sv, sb + sv]);
        rows.push([]);
      }
    }
    const summary = bd.imps_summary || {};
    if (summary.board_imps !== undefined) {
      rows.push(["ATRIBUCIÓN DE IMPS POR EQUIPO"]);
      rows.push(["Diff Abierta NS - Cerrada NS", "TOTAL IMPs TABLERO"]);
      rows.push([summary.diff_pts, summary.board_imps]);
      rows.push([]);
      for (const tn of ["Equipo A", "Equipo B"]) {
        const teamList = [];
        for (const rn of rooms) {
          for (const p of bd[rn].players) {
            const isA = (rn.toLowerCase() === "abierta" && ["NORTH", "SOUTH"].includes(p.Pos)) ||
                        (rn.toLowerCase() === "cerrada" && ["EAST", "WEST"].includes(p.Pos));
            if ((tn === "Equipo A" && isA) || (tn === "Equipo B" && !isA)) teamList.push(p);
          }
        }
        if (!teamList.length) continue;
        const timps = tn === "Equipo A" ? summary.team_a_imps : summary.team_b_imps;
        rows.push([`EQUIPO: ${tn}`, `Total IMPs Equipo: ${timps}`]);
        rows.push(["Jugador", "Pos", "Subasta", "Carteo", "Total", "IMPs_Atribuidos"]);
        for (const p of teamList) rows.push([p.Jugador, p.Pos, p.Subasta, p.Carteo, p.Total, p.IMPs_Atribuidos]);
        rows.push([]);
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 40 }, { wch: 30 }, { wch: 14 }, { wch: 10 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, `Mano ${num}`.slice(0, 31));
  }

  // Resumen Final
  const srows = [["Jugador", "Subasta", "Carteo", "Total Pts", "Total IMPs"]];
  const bTech = { "Equipo A": [null, -1e9], "Equipo B": [null, -1e9] };
  const bComp = { "Equipo A": [null, -1e9], "Equipo B": [null, -1e9] };
  for (const tn of ["Equipo A", "Equipo B"]) {
    const pdata = [];
    for (const n of [...analyzer.teamsRoster[tn]].sort()) {
      const d = analyzer.playersData[n];
      const ts = Object.values(d.bidding).reduce((a, b) => a + b, 0);
      const tc = Object.values(d.play).reduce((a, b) => a + b, 0);
      const ti = Object.values(d.imps).reduce((a, b) => a + b, 0);
      pdata.push([n, ts, tc, ts + tc, pyRound2(ti)]);
      if (ts + tc > bTech[tn][1]) bTech[tn] = [n, ts + tc];
      if (ti > bComp[tn][1]) bComp[tn] = [n, ti];
    }
    pdata.sort((a, b) => b[4] - a[4]);
    srows.push([tn.toUpperCase(), "", "", "", ""]);
    srows.push(...pdata);
    const tts = pdata.reduce((a, p) => a + p[1], 0), ttc = pdata.reduce((a, p) => a + p[2], 0), tti = pdata.reduce((a, p) => a + p[4], 0);
    srows.push([`SUBTOTAL NETO ${tn}`, tts, ttc, tts + ttc, pyRound2(tti)]);
    srows.push(["", "", "", "", ""]);
  }
  const ra = analyzer.matchGrossGain["Equipo A"], rb = analyzer.matchGrossGain["Equipo B"];
  srows.push(["BALANCE DEL PARTIDO", `Equipo A (Bruto): ${ra}`, `Equipo B (Bruto): ${rb}`, "Resultado Neto", pyRound2(ra - rb)]);
  srows.push([`${ra > rb ? "EQUIPO A" : "EQUIPO B"} GANA POR ${Math.abs(pyRound2(ra - rb))} IMPs`, "", "", "", ""]);
  srows.push(["", "", "", "", ""]);
  for (const tn of ["Equipo A", "Equipo B"]) {
    srows.push([`Mejor Jugador Competitivo ${tn}: ${bComp[tn][0]}`, "", "", "", pyRound2(bComp[tn][1])]);
    srows.push([`Mejor Jugador Técnico ${tn}: ${bTech[tn][0]}`, "", "", pyRound2(bTech[tn][1]), ""]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(srows), "Resumen Final");

  // Estadísticas
  const agg = calcularEstadisticas(stats);
  if (Object.keys(agg).length) {
    const erows = [["Jugador", "Partidos", "Manos", "IMPs", "Butler", "Subasta", "Carteo", "Err.Carteo", "Tendencia"]];
    erows.push(...filasEstadisticas(agg));
    erows.push([]);
    erows.push(["DETALLE POR PARTIDO"]);
    erows.push(["Jugador", "Fecha", "Partido", "Manos", "IMPs", "Subasta", "Carteo"]);
    for (const name of Object.keys(agg).sort()) {
      for (const h of agg[name].historial) erows.push([name, h.fecha, h.partido, h.manos, h.imps, h.subasta, h.carteo]);
    }
    const ws = XLSX.utils.aoa_to_sheet(erows);
    ws["!cols"] = [{ wch: 25 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, "Estadísticas");
  }

  XLSX.writeFile(wb, "bridge_match_technical_report.xlsx");
}

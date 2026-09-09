// Render del informe interactivo en la página
import { calcularEstadisticas, filasEstadisticas } from "./analyzer.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const suitHtml = { S: '<span class="suit s">♠</span>', H: '<span class="suit h">♥</span>', D: '<span class="suit d">♦</span>', C: '<span class="suit c">♣</span>' };

function handHtml(manos) {
  const cell = (p) => {
    const m = manos[p];
    if (!m) return "";
    return `<div class="hand"><b>${p}</b>` +
      ["S", "H", "D", "C"].map(s => `<div>${suitHtml[s]} ${esc(m[s] || "-")}</div>`).join("") + "</div>";
  };
  return `<table class="diagram"><tr><td></td><td>${cell("N")}</td><td></td></tr>` +
    `<tr><td>${cell("O")}</td><td class="center-mark">🂡</td><td>${cell("E")}</td></tr>` +
    `<tr><td></td><td>${cell("S")}</td><td></td></tr></table>`;
}

function playersTable(players, title) {
  let h = `<h4>${esc(title)}</h4><table><thead><tr><th>Jugador</th><th>Pos</th><th>Subasta</th><th>Carteo</th><th>Total</th><th>IMPs</th><th>Detalle carteo</th></tr></thead><tbody>`;
  for (const p of players) {
    const cls = p.Total < 0 ? "neg" : "pos";
    h += `<tr><td>${esc(p.Jugador)}</td><td>${esc(p.Pos)}</td><td class="${p.Subasta < 0 ? "neg" : ""}">${p.Subasta}</td>` +
      `<td class="${p.Carteo < 0 ? "neg" : ""}">${p.Carteo}</td><td class="${cls}"><b>${p.Total}</b></td>` +
      `<td>${p.IMPs_Atribuidos}</td><td class="small">${esc(p.Detalle_Carteo)}</td></tr>`;
  }
  return h + "</tbody></table>";
}

function playTable(meta) {
  const play = meta.Play || [], actors = meta.Actors || [];
  if (!play.length) return "<p><i>Sin carteo registrado.</i></p>";
  const crit = {};
  for (const c of meta.Critical_Plays || []) crit[c.idx] = c;
  let h = `<h4>Carteo</h4><table class="play"><thead><tr><th>Baza</th>`;
  const nTricks = Math.ceil(play.length / 4);
  const cols = [];
  for (let t = 0; t < nTricks; t++) {
    const cells = [];
    for (let i = 0; i < 4; i++) {
      const idx = t * 4 + i;
      if (idx >= play.length) break;
      const c = crit[idx];
      const mark = c ? ` class="crit" title="${esc(c.player_pos)} ${c.points} pts"` : "";
      cells.push(`<td${mark}>${esc(actors[idx] || "")}: ${esc(play[idx])}${c ? " ⚠" : ""}</td>`);
    }
    cols.push(`<tr><td>${t + 1}</td>${cells.join("")}</tr>`);
  }
  h += "<th colspan=\"4\">Cartas (jugador: carta, ⚠ = jugada crítica)</th></tr></thead><tbody>" + cols.join("") + "</tbody></table>";
  return h;
}

export function renderReport(analyzer, stats, container) {
  const boards = [...analyzer.activeBoards].sort((a, b) => a - b);
  let h = `<h2>Informe del partido</h2>`;
  h += `<p><b>Evento:</b> ${esc(analyzer.matchEvent || "-")} &nbsp; <b>Fecha:</b> ${esc(analyzer.matchDate || "-")} &nbsp; <b>Manos:</b> ${boards.length}</p>`;

  // Tabla técnica del partido
  h += `<h3>Puntos técnicos del partido</h3><table><thead><tr><th>Jugador</th><th>Subasta</th><th>Carteo</th><th>Total Pts</th></tr></thead><tbody>`;
  for (const [name, ts, tc, tot] of analyzer.generateReportRows()) {
    h += `<tr><td>${esc(name)}</td><td class="${ts < 0 ? "neg" : ""}">${ts}</td><td class="${tc < 0 ? "neg" : ""}">${tc}</td><td class="${tot < 0 ? "neg" : "pos"}"><b>${tot}</b></td></tr>`;
  }
  h += `</tbody></table>`;

  // Balance
  const ra = analyzer.matchGrossGain["Equipo A"], rb = analyzer.matchGrossGain["Equipo B"];
  h += `<h3>Balance del partido</h3><p>Equipo A (NS en abierta / EO en cerrada): <b>${ra}</b> IMPs brutos &nbsp;|&nbsp; Equipo B: <b>${rb}</b> IMPs brutos &nbsp;|&nbsp; Resultado neto: <b>${ra - rb}</b> IMPs &nbsp;→&nbsp; <b>${ra > rb ? "EQUIPO A" : rb > ra ? "EQUIPO B" : "EMPATE"}${ra !== rb ? ` GANA POR ${Math.abs(ra - rb)} IMPs` : ""}</b></p>`;

  // Detalle por mano
  h += `<h3>Detalle por mano</h3>`;
  for (const num of boards) {
    const bd = analyzer.boardsDetail[num];
    h += `<details class="board"><summary><b>Mano ${num}</b>`;
    const s = bd.imps_summary || {};
    if (s.board_imps !== undefined) h += ` &nbsp; (diff ${s.diff_pts} pts NS → ${s.board_imps} IMPs para Equipo ${s.board_imps >= 0 ? "A" : "B"})`;
    h += `</summary>`;
    for (const room of ["Abierta", "Cerrada"]) {
      const det = bd[room];
      if (!det) continue;
      const m = det.meta;
      h += `<div class="room"><h3>Sala ${room}</h3>`;
      h += `<p><b>Subasta:</b> ${esc(m["Subasta Real"])}<br><b>Contrato:</b> ${esc(m["Contrato Final"])} &nbsp; <b>Puntos (NS):</b> ${m["Puntos Reales (NS)"]}<br>` +
        `<b>Par:</b> ${esc(m["Par Contrato"])} (${m["Par Puntos (NS)"]} pts NS) &nbsp; <b>Vul:</b> ${esc(m.Vulnerabilidad)} &nbsp; <b>Dador:</b> ${esc(m.Dador)}${m.Comentarios ? `<br><i>${esc(m.Comentarios)}</i>` : ""}</p>`;
      h += handHtml(m.Manos);
      h += playersTable(det.players, `Jugadores - Sala ${room}`);
      h += playTable(m);
      h += `</div>`;
    }
    if (s.board_imps !== undefined) {
      h += `<h4>Atribución de IMPs</h4><table><thead><tr><th>Equipo</th><th>IMPs</th></tr></thead><tbody>` +
        `<tr><td>Equipo A</td><td>${s.team_a_imps}</td></tr><tr><td>Equipo B</td><td>${s.team_b_imps}</td></tr></tbody></table>`;
    }
    h += `</details>`;
  }

  // Estadísticas acumuladas
  const agg = calcularEstadisticas(stats);
  h += `<h3>Estadísticas acumuladas (${Object.keys(stats.partidos || {}).length} partido(s))</h3>`;
  if (Object.keys(agg).length) {
    h += `<table><thead><tr><th>Jugador</th><th>Partidos</th><th>Manos</th><th>IMPs</th><th>Butler</th><th>Subasta</th><th>Carteo</th><th>Err.Carteo</th><th>Tendencia</th></tr></thead><tbody>`;
    for (const f of filasEstadisticas(agg)) {
      h += "<tr>" + f.map((v, i) => `<td class="${i >= 3 && i <= 6 && typeof v === "number" && v < 0 ? "neg" : ""}">${esc(v)}</td>`).join("") + "</tr>";
    }
    h += `</tbody></table>`;
    h += `<h4>Detalle por partido</h4><table><thead><tr><th>Jugador</th><th>Fecha</th><th>Partido</th><th>Manos</th><th>IMPs</th><th>Subasta</th><th>Carteo</th></tr></thead><tbody>`;
    for (const name of Object.keys(agg).sort()) {
      for (const hh of agg[name].historial) {
        h += `<tr><td>${esc(name)}</td><td>${esc(hh.fecha)}</td><td>${esc(hh.partido)}</td><td>${hh.manos}</td><td>${hh.imps}</td><td>${hh.subasta}</td><td>${hh.carteo}</td></tr>`;
      }
    }
    h += `</tbody></table>`;
  } else {
    h += `<p><i>Sin histórico todavía.</i></p>`;
  }

  container.innerHTML = h;
}

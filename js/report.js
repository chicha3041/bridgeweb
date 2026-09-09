// Render del informe interactivo en la página
import {
  filasInformePorEquipos, ordenarPorEquipos,
  calcularEstadisticasEquipos, filasJugadoresEquipo,
} from "./analyzer.js";
import { renameEquipo } from "./stats.js";
import { playViewHtml, initPlayViews } from "./playview.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const suitHtml = { S: '<span class="suit s">♠</span>', H: '<span class="suit h">♥</span>', D: '<span class="suit d">♦</span>', C: '<span class="suit c">♣</span>' };
const SEAT_LABEL = { N: "N", E: "E", S: "S", W: "O" };

function handHtml(manos) {
  const cell = (p) => {
    const m = manos[p];
    if (!m) return "";
    return `<div class="hand"><b>${SEAT_LABEL[p]}</b>` +
      ["S", "H", "D", "C"].map(s => `<div>${suitHtml[s]} ${esc(m[s] || "-")}</div>`).join("") + "</div>";
  };
  return `<table class="diagram"><tr><td></td><td>${cell("N")}</td><td></td></tr>` +
    `<tr><td>${cell("W")}</td><td class="center-mark">🂡</td><td>${cell("E")}</td></tr>` +
    `<tr><td></td><td>${cell("S")}</td><td></td></tr></table>`;
}

function playersTable(players, title, roomName) {
  const ordenados = ordenarPorEquipos(players, roomName);
  let h = `<h4>${esc(title)}</h4><table><thead><tr><th>Jugador</th><th>Equipo</th><th>Pos</th><th>Subasta</th><th>Carteo</th><th>Total</th><th>IMPs</th><th>Detalle carteo</th></tr></thead><tbody>`;
  let lastTeam = null;
  for (const p of ordenados) {
    const team = { A: "Equipo A", B: "Equipo B" }[teamOfRow(p, roomName)];
    if (team !== lastTeam) {
      h += `<tr class="team-sep"><td colspan="8">${esc(team)}</td></tr>`;
      lastTeam = team;
    }
    const cls = p.Total < 0 ? "neg" : "pos";
    h += `<tr><td>${esc(p.Jugador)}</td><td>${esc(team.slice(-1))}</td><td>${esc(p.Pos)}</td><td class="${p.Subasta < 0 ? "neg" : ""}">${p.Subasta}</td>` +
      `<td class="${p.Carteo < 0 ? "neg" : ""}">${p.Carteo}</td><td class="${cls}"><b>${p.Total}</b></td>` +
      `<td>${p.IMPs_Atribuidos}</td><td class="small">${esc(p.Detalle_Carteo)}</td></tr>`;
  }
  return h + "</tbody></table>";
}

function teamOfRow(p, roomName) {
  const esNS = p.Pos === "NORTH" || p.Pos === "SOUTH";
  return (roomName.toLowerCase() === "abierta") === esNS ? "A" : "B";
}

function playTable(meta) {
  const play = meta.Play || [], actors = meta.Actors || [];
  if (!play.length) return "";
  const crit = {};
  for (const c of meta.Critical_Plays || []) crit[c.idx] = c;
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
  return `<details class="play-static"><summary>Ver tabla del carteo</summary><table class="play"><thead><tr><th>Baza</th>` +
    `<th colspan="4">Cartas (jugador: carta, ⚠ = jugada crítica)</th></tr></thead><tbody>${cols.join("")}</tbody></table></details>`;
}

// Sección de estadísticas acumuladas por equipo
function statsHtml(stats) {
  const { teams, legacyCount } = calcularEstadisticasEquipos(stats);
  const ids = Object.keys(teams);
  let h = `<h3>Estadísticas acumuladas por equipo (${Object.keys(stats.partidos || {}).length} partido(s))</h3>`;
  if (!ids.length) {
    h += `<p><i>Sin histórico todavía.</i></p>`;
    return h;
  }
  ids.sort((a, b) => teams[b].imps - teams[a].imps);
  for (const id of ids) {
    const t = teams[id];
    const butlerEq = t.manos ? Math.round((t.imps / t.manos) * 100) / 100 : 0;
    h += `<div class="team-block"><h4 class="team-header">${esc(t.nombre)} ` +
      `<button type="button" class="team-rename small secondary" data-team="${esc(id)}" title="Renombrar equipo">✏️</button></h4>`;
    h += `<p class="team-summary"><b>${t.partidos}</b> partido(s) · <b>${t.manos}</b> manos · ` +
      `<b class="${t.imps < 0 ? "neg" : "pos"}">${Math.round(t.imps * 100) / 100} IMPs</b> · Butler equipo: <b>${butlerEq}</b> IMPs/mano · ` +
      `Subasta: <b>${t.subasta}</b> · Carteo: <b>${t.carteo}</b></p>`;
    h += `<table><thead><tr><th>Jugador</th><th>Partidos</th><th>Manos</th><th>IMPs</th><th>Butler</th><th>Subasta</th><th>Carteo</th><th>Err.Carteo</th><th>Tendencia</th></tr></thead><tbody>`;
    for (const f of filasJugadoresEquipo(t)) {
      h += `<tr><td>${esc(f.name)}</td><td>${f.partidos}</td><td>${f.manos}</td>` +
        `<td class="${f.imps < 0 ? "neg" : ""}">${f.imps}</td><td class="${f.butler < 0 ? "neg" : ""}">${f.butler}</td>` +
        `<td class="${f.subasta < 0 ? "neg" : ""}">${f.subasta}</td><td class="${f.carteo < 0 ? "neg" : ""}">${f.carteo}</td>` +
        `<td>${f.errores}</td><td>${esc(f.tendencia)}</td></tr>`;
    }
    h += `</tbody></table>`;
    h += `<details class="team-detail"><summary>Detalle por partido</summary><table><thead><tr><th>Jugador</th><th>Fecha</th><th>Partido</th><th>Manos</th><th>IMPs</th><th>Subasta</th><th>Carteo</th></tr></thead><tbody>`;
    for (const f of filasJugadoresEquipo(t)) {
      for (const hh of f.historial) {
        h += `<tr><td>${esc(f.name)}</td><td>${esc(hh.fecha)}</td><td>${esc(hh.partido)}</td><td>${hh.manos}</td><td>${hh.imps}</td><td>${hh.subasta}</td><td>${hh.carteo}</td></tr>`;
      }
    }
    h += `</tbody></table></details></div>`;
  }
  if (legacyCount) {
    h += `<p class="small"><i>${legacyCount} partido(s) antiguo(s) sin datos de equipo no aparecen en esta vista. Bórralos con «Borrar histórico» y vuelve a analizarlos para incluirlos.</i></p>`;
  }
  return h;
}

export function renderReport(analyzer, stats, container) {
  const boards = [...analyzer.activeBoards].sort((a, b) => a - b);
  let h = `<h2>Informe del partido</h2>`;
  h += `<p><b>Evento:</b> ${esc(analyzer.matchEvent || "-")} &nbsp; <b>Fecha:</b> ${esc(analyzer.matchDate || "-")} &nbsp; <b>Manos:</b> ${boards.length}</p>`;

  // Tabla técnica del partido, agrupada por equipos
  h += `<h3>Puntos técnicos del partido</h3><table><thead><tr><th>Jugador</th><th>Subasta</th><th>Carteo</th><th>Total Pts</th></tr></thead><tbody>`;
  for (const g of filasInformePorEquipos(analyzer)) {
    h += `<tr class="team-sep"><td colspan="4">${esc(g.equipo)}</td></tr>`;
    for (const [name, ts, tc, tot] of g.filas) {
      h += `<tr><td>${esc(name)}</td><td class="${ts < 0 ? "neg" : ""}">${ts}</td><td class="${tc < 0 ? "neg" : ""}">${tc}</td><td class="${tot < 0 ? "neg" : "pos"}"><b>${tot}</b></td></tr>`;
    }
    h += `<tr class="subtotal"><td>Subtotal ${esc(g.equipo)}</td><td>${g.subtotal[0]}</td><td>${g.subtotal[1]}</td><td><b>${g.subtotal[2]}</b></td></tr>`;
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
      h += playersTable(det.players, `Jugadores - Sala ${room}`, room);
      h += playViewHtml(num, room, m);
      h += playTable(m);
      h += `</div>`;
    }
    if (s.board_imps !== undefined) {
      h += `<h4>Atribución de IMPs</h4><table><thead><tr><th>Equipo</th><th>IMPs</th></tr></thead><tbody>` +
        `<tr><td>Equipo A</td><td>${s.team_a_imps}</td></tr><tr><td>Equipo B</td><td>${s.team_b_imps}</td></tr></tbody></table>`;
    }
    h += `</details>`;
  }

  // Estadísticas acumuladas por equipo
  h += statsHtml(stats);

  container.innerHTML = h;
  initPlayViews(analyzer, container);
  container.querySelectorAll(".team-rename").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.team;
      const actual = (stats.equipos && stats.equipos[id] && stats.equipos[id].nombre) || "";
      const nuevo = prompt("Nombre del equipo:", actual);
      if (nuevo && nuevo.trim()) {
        const s = renameEquipo(id, nuevo.trim());
        renderReport(analyzer, s, container);
      }
    });
  });
}

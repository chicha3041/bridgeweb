// Render del informe interactivo en la página
import {
  filasInformePorEquipos, ordenarPorEquipos,
  calcularEstadisticasEquipos, filasJugadoresEquipo,
} from "./analyzer.js";
import { renameEquipo } from "./stats.js";
import { playViewHtml, initPlayViews, cardHtml } from "./playview.js";
import { pyRound2 } from "./bridge-core.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const suitHtml = { S: '<span class="suit s">♠</span>', H: '<span class="suit h">♥</span>', D: '<span class="suit d">♦</span>', C: '<span class="suit c">♣</span>' };
const SEAT_LABEL = { N: "N", E: "E", S: "S", W: "O" };
const SUIT_SYM = { S: "♠", H: "♥", D: "♦", C: "♣" };

// Una voz de subasta con símbolo de palo: "1S" -> 1♠, "3NT", "P", "X", "XX"
function bidHtml(str) {
  const s = String(str || "");
  if (s === "P") return `<span class="call-pass">P</span>`;
  if (s === "X" || s === "XX") return `<span class="call-x">${s}</span>`;
  const m = s.match(/^([1-7])(NT|[SHDC])$/);
  if (!m) return esc(s);
  const denom = m[2] === "NT" ? `<span class="suit-nt">NT</span>` : `<span class="suit-${m[2].toLowerCase()}">${SUIT_SYM[m[2]]}</span>`;
  return `${m[1]}${denom}`;
}

// Contrato con símbolo de palo y declarante en español: "4SS+2" -> 4♠S+2, "3NTW+1" -> 3NTO+1
function contractHtml(str) {
  const s = String(str || "");
  const m = s.match(/^([1-7])(NT|[SHDC])([NESW])(x{0,2})(.*)$/);
  if (!m) return esc(s);
  const denom = m[2] === "NT" ? `<span class="suit-nt">NT</span>` : `<span class="suit-${m[2].toLowerCase()}">${SUIT_SYM[m[2]]}</span>`;
  return `${m[1]}${denom}${SEAT_LABEL[m[3]] || m[3]}${m[4]}${m[5]}`;
}

// Mesa de subasta (columnas O N E S) con comparación entre salas:
// - voces distintas a la otra sala sombreadas en ámbar
// - contrato final con borde verde si se juega lo mismo en las dos salas, rojo si no
const AUC_COLS = ["W", "N", "E", "S"];
function auctionHtml(meta, otherMeta) {
  const calls = meta.Auction || [];
  if (!calls.length) return "";
  const other = (otherMeta && otherMeta.Auction) || [];
  const dealerCol = Math.max(0, AUC_COLS.indexOf(meta.DealerAbbr || "N"));
  let lastBid = -1;
  calls.forEach((c, idx) => { if (!["P", "X", "XX"].includes(c)) lastBid = idx; });
  const contractCells = new Set();
  if (lastBid >= 0) {
    contractCells.add(lastBid);
    for (let k = lastBid + 1; k < calls.length && (calls[k] === "X" || calls[k] === "XX"); k++) contractCells.add(k);
  }
  const sameContract = !!(otherMeta && meta.ContractKey && otherMeta.ContractKey === meta.ContractKey);
  const nRows = Math.ceil((dealerCol + calls.length) / 4);
  let rows = "";
  for (let r = 0; r < nRows; r++) {
    rows += "<tr>";
    for (let c = 0; c < 4; c++) {
      const idx = r * 4 + c - dealerCol;
      if (idx < 0 || idx >= calls.length) { rows += "<td></td>"; continue; }
      const call = calls[idx];
      const isDiff = otherMeta && (idx < other.length ? other[idx] !== call : call !== "P");
      const cls = [];
      if (isDiff) cls.push("diff-call");
      if (otherMeta && contractCells.has(idx)) cls.push(sameContract ? "contract-same" : "contract-diff");
      rows += `<td${cls.length ? ` class="${cls.join(" ")}"` : ""}>${bidHtml(call)}</td>`;
    }
    rows += "</tr>";
  }
  const legend = otherMeta ? `<div class="auction-legend small">` +
    `<span class="lg"><span class="sw sw-same"></span>mismo contrato en las dos salas</span>` +
    `<span class="lg"><span class="sw sw-diff"></span>contrato distinto entre salas</span>` +
    `<span class="lg"><span class="sw sw-call"></span>voz distinta a la otra sala</span></div>` : "";
  return `<table class="auction"><thead><tr><th>O</th><th>N</th><th>E</th><th>S</th></tr></thead><tbody>${rows}</tbody></table>${legend}`;
}

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
      `<td>${p.IMPs_Atribuidos}${p.Nota_IMPs ? `<br><span class="small">${esc(p.Nota_IMPs)}</span>` : ""}</td><td class="small">${esc(p.Detalle_Carteo)}</td></tr>`;
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
      cells.push(`<td${mark}>${SEAT_LABEL[actors[idx]] || esc(actors[idx] || "")}: ${cardHtml(play[idx])}${c ? " ⚠" : ""}</td>`);
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
  h += `<h3>Puntos técnicos del partido</h3><table><thead><tr><th>Jugador</th><th>Subasta</th><th>Carteo</th><th>Total Pts</th><th>IMPs</th></tr></thead><tbody>`;
  for (const g of filasInformePorEquipos(analyzer)) {
    h += `<tr class="team-sep"><td colspan="5">${esc(g.equipo)}</td></tr>`;
    let subImps = 0;
    for (const [name, ts, tc, tot] of g.filas) {
      const d = analyzer.playersData[name];
      const ti = d ? pyRound2(Object.values(d.imps).reduce((a, b) => a + b, 0)) : 0;
      subImps += ti;
      h += `<tr><td>${esc(name)}</td><td class="${ts < 0 ? "neg" : ""}">${ts}</td><td class="${tc < 0 ? "neg" : ""}">${tc}</td><td class="${tot < 0 ? "neg" : "pos"}"><b>${tot}</b></td><td class="${ti < 0 ? "neg" : ""}">${ti}</td></tr>`;
    }
    h += `<tr class="subtotal"><td>Subtotal ${esc(g.equipo)}</td><td>${g.subtotal[0]}</td><td>${g.subtotal[1]}</td><td><b>${g.subtotal[2]}</b></td><td><b>${pyRound2(subImps)}</b></td></tr>`;
  }
  h += `</tbody></table>`;

  // Mejores del partido por equipo (como en la hoja Resumen del Excel)
  h += `<h3>Mejores del partido</h3><ul class="best">`;
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
    h += `<li><b>${tn}:</b> mejor técnico <b>${esc(bT[0] || "-")}</b>${bT[0] ? ` (${bT[1]} pts)` : ""} · mejor competitivo <b>${esc(bC[0] || "-")}</b>${bC[0] ? ` (${pyRound2(bC[1])} IMPs)` : ""}</li>`;
  }
  h += `</ul>`;

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
      const otherDet = bd[room === "Abierta" ? "Cerrada" : "Abierta"];
      h += `<div class="room"><h3>Sala ${room}</h3>`;
      h += `<h4 class="auc-title">Subasta</h4>` + auctionHtml(m, otherDet && otherDet.meta);
      h += `<p><b>Contrato:</b> ${contractHtml(m["Contrato Final"])} &nbsp; <b>Puntos (NS):</b> ${m["Puntos Reales (NS)"]}<br>` +
        `<b>Par:</b> ${contractHtml(m["Par Contrato"])} (${m["Par Puntos (NS)"]} pts NS) &nbsp; <b>Vul:</b> ${esc(m.Vulnerabilidad)} &nbsp; <b>Dador:</b> ${esc(m.Dador)}${m.Comentarios ? `<br><i>${esc(m.Comentarios)}</i>` : ""}</p>`;
      h += handHtml(m.Manos);
      h += playersTable(det.players, `Jugadores - Sala ${room}`, room);
      h += playViewHtml(num, room, m);
      h += playTable(m);
      h += `</div>`;
    }
    if (s.board_imps !== undefined) {
      h += `<h4>Atribución de IMPs</h4><table><thead><tr><th>Equipo</th><th>IMPs</th></tr></thead><tbody>` +
        `<tr><td>Equipo A</td><td>${s.team_a_imps}</td></tr><tr><td>Equipo B</td><td>${s.team_b_imps}</td></tr></tbody></table>` +
        (s.criterio ? `<p class="small"><b>Criterio:</b> ${esc(s.criterio)}</p>` : "") +
        ((s.errores_decisivos || []).length ? `<p class="small"><b>Errores decisivos:</b><br>${s.errores_decisivos.map(esc).join("<br>")}</p>` : "");
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

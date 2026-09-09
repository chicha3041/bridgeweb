// Visor interactivo del carteo: recorre la jugada carta a carta y marca
// en rojo las jugadas críticas (errores técnicos detectados por el DDS)
const SUIT_SYM = { S: "♠", H: "♥", D: "♦", C: "♣" };
const SEAT_LABEL = { N: "N", E: "E", S: "S", W: "O" };

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function cardHtml(str, extra = "") {
  const s = str[0], r = str.slice(1);
  return `<span class="card suit-${s.toLowerCase()}${extra}">${esc(r)}${SUIT_SYM[s]}</span>`;
}

class PlayView {
  constructor(root, data) {
    this.root = root;
    this.manos = data.manos;       // {N:{S:"AKQ",H:"..",D:"..",C:".."}, ...}
    this.play = data.play || [];   // ["SA", ...] en orden lineal de juego
    this.actors = data.actors || [];
    this.crit = data.crit || {};   // idx -> {points, player_pos}
    this.names = data.names || {}; // N/E/S/W -> nombre del jugador
    this.i = 0;
    root.querySelector(".pv-prev").addEventListener("click", () => this.step(-1));
    root.querySelector(".pv-next").addEventListener("click", () => this.step(1));
    root.querySelector(".pv-start").addEventListener("click", () => { this.i = 0; this.draw(); });
    root.querySelector(".pv-end").addEventListener("click", () => { this.i = this.play.length; this.draw(); });
    this.draw();
  }
  step(d) {
    this.i = Math.max(0, Math.min(this.play.length, this.i + d));
    this.draw();
  }
  handCell(seat) {
    const m = this.manos[seat] || {};
    const played = new Set(this.play.slice(0, this.i));
    const rows = ["S", "H", "D", "C"].map(s => {
      const rem = (m[s] || "").split("").filter(r => !played.has(s + r)).join("");
      return `<div class="pv-suit">${SUIT_SYM[s]} <span class="suit-${s.toLowerCase()}">${esc(rem || "-")}</span></div>`;
    }).join("");
    const nm = this.names[seat];
    return `<div class="hand pv-hand"><b>${SEAT_LABEL[seat]}</b>${nm ? ` <span class="pv-name">${esc(nm)}</span>` : ""}${rows}</div>`;
  }
  draw() {
    const i = this.i, n = this.play.length;
    // Baza en curso: la que contiene la última carta jugada
    let trickHtml = '<div class="pv-empty">Pulsa ▶ para empezar el carteo</div>';
    if (i > 0) {
      const start = Math.floor((i - 1) / 4) * 4;
      const cards = [];
      for (let k = start; k < i; k++) {
        const seat = this.actors[k] || "?";
        const last = k === i - 1 ? " pv-last" : "";
        cards.push(`<div class="pv-trick-card"><span class="pv-seat">${SEAT_LABEL[seat] || esc(seat)}</span>${cardHtml(this.play[k], last)}</div>`);
      }
      trickHtml = cards.join("");
    }
    this.root.querySelector(".pv-center").innerHTML = trickHtml;
    this.root.querySelector(".pv-cell-n").innerHTML = this.handCell("N");
    this.root.querySelector(".pv-cell-e").innerHTML = this.handCell("E");
    this.root.querySelector(".pv-cell-s").innerHTML = this.handCell("S");
    this.root.querySelector(".pv-cell-w").innerHTML = this.handCell("W");
    const baza = i === 0 ? 1 : Math.floor((i - 1) / 4) + 1;
    const juega = i < n ? (this.names[this.actors[i]] || SEAT_LABEL[this.actors[i]] || "") : "-";
    this.root.querySelector(".pv-status").textContent =
      `Carta ${i}/${n} · Baza ${Math.min(baza, Math.ceil(n / 4) || 1)} · ${i < n ? "Juega: " + juega : "Carteo completo"}`;
    const alert = this.root.querySelector(".pv-alert");
    const c = i > 0 ? this.crit[i - 1] : null;
    if (c) {
      const seat = this.actors[i - 1];
      const who = this.names[seat] || c.player_pos || seat;
      if (c.points < 0) {
        alert.className = "pv-alert err";
        alert.innerHTML = `⚠ <b>Error:</b> ${esc(who)} pierde ${Math.abs(c.points)} puntos con ${cardHtml(this.play[i - 1])}`;
      } else {
        alert.className = "pv-alert good";
        alert.innerHTML = `✔ <b>Buena jugada:</b> ${esc(who)} gana +${c.points} puntos con ${cardHtml(this.play[i - 1])}`;
      }
      alert.style.display = "";
    } else {
      alert.style.display = "none";
      alert.innerHTML = "";
    }
    this.root.querySelector(".pv-prev").disabled = i === 0;
    this.root.querySelector(".pv-start").disabled = i === 0;
    this.root.querySelector(".pv-next").disabled = i >= n;
    this.root.querySelector(".pv-end").disabled = i >= n;
  }
}

// Crea el HTML base del visor y lo activa
export function playViewHtml(num, room, meta) {
  if (!meta.Play || !meta.Play.length) return "";
  return `<h4>Carteo interactivo</h4>
  <div class="playview" data-board="${num}" data-room="${esc(room)}">
    <table class="diagram pv-diagram">
      <tr><td></td><td class="pv-cell-n"></td><td></td></tr>
      <tr><td class="pv-cell-w"></td><td class="pv-center center-mark"></td><td class="pv-cell-e"></td></tr>
      <tr><td></td><td class="pv-cell-s"></td><td></td></tr>
    </table>
    <div class="pv-alert" style="display:none"></div>
    <div class="pv-controls">
      <button type="button" class="pv-start small" title="Ir al principio">⏮</button>
      <button type="button" class="pv-prev small">◀ Anterior</button>
      <button type="button" class="pv-next small">Siguiente ▶</button>
      <button type="button" class="pv-end small" title="Ir al final">⏭</button>
      <span class="pv-status"></span>
    </div>
  </div>`;
}

export function initPlayViews(analyzer, container) {
  container.querySelectorAll(".playview").forEach(el => {
    const num = Number(el.dataset.board), room = el.dataset.room;
    const det = analyzer.boardsDetail[num] && analyzer.boardsDetail[num][room];
    if (!det) return;
    const m = det.meta;
    const crit = {};
    for (const c of m.Critical_Plays || []) crit[c.idx] = c;
    const names = {};
    for (const p of det.players || []) names[{ NORTH: "N", EAST: "E", SOUTH: "S", WEST: "W" }[p.Pos] || p.Pos] = p.Jugador;
    new PlayView(el, { manos: m.Manos, play: m.Play, actors: m.Actors, crit, names });
  });
}

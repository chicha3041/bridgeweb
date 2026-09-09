// BridgeLab - núcleo de bridge (port de endplay + lógica de puntuación del analizador Python)
// Jugadores: 0=N, 1=E, 2=S, 3=O. Palos: 0=Picas(S), 1=Corazones(H), 2=Diamantes(D), 3=Tréboles(C), 4=ST(NT)

export const PLAYER_NAMES = ["NORTH", "EAST", "SOUTH", "WEST"];
export const PLAYER_ABBR = ["N", "E", "S", "W"];
export const SUIT_LETTERS = ["S", "H", "D", "C"]; // índices 0..3
export const DENOM_NAMES = ["spades", "hearts", "diamonds", "clubs", "nt"];

export const PENALTY = { PASSED: 0, DOUBLED: 1, REDOUBLED: 2 };

export function nextPlayer(p, n = 1) { return (p + n) % 4; }
export function partner(p) { return (p + 2) % 4; }
export function lho(p) { return (p + 1) % 4; }
export function isNS(p) { return p === 0 || p === 2; }

// Rangos: 2..14 (11=J, 12=Q, 13=K, 14=A). Formato DDS en crudo: 2..14.
export const RANK_CHARS = "??23456789TJQKA"; // índice = rango
export function rankFromChar(ch) {
  const i = "23456789TJQKA".indexOf(ch.toUpperCase());
  if (i < 0) throw new Error("Rango inválido: " + ch);
  return i + 2;
}
export function rankToChar(r) { return RANK_CHARS[r]; }

// Carta: {suit: 0..3 (o 4 para comodín ST), rank: 2..14}
export function parseCard(s) {
  if (!s || s.length < 2) throw new Error("Carta inválida: " + s);
  const suit = SUIT_LETTERS.indexOf(s[0].toUpperCase());
  if (suit < 0) throw new Error("Palo inválido: " + s);
  return { suit, rank: rankFromChar(s.slice(1)) };
}
export function cardToString(c) { return SUIT_LETTERS[c.suit] + rankToChar(c.rank); }
export function sameCard(a, b) { return a.suit === b.suit && a.rank === b.rank; }

// Ganador de la baza (port fiel de endplay.utils.play.trick_winner):
// solo supera una carta del mismo palo más alta, o cualquier triunfo si aún no se jugó triunfo.
export function trickWinner(trick, first, trump) {
  let winner = first, topcard = trick[0];
  for (let i = 1; i < 4; i++) {
    if (trick[i].suit === topcard.suit) {
      if (trick[i].rank > topcard.rank) { winner = nextPlayer(first, i); topcard = trick[i]; }
    } else if (trick[i].suit === trump) {
      winner = nextPlayer(first, i); topcard = trick[i];
    }
  }
  return winner;
}

// ---- Puntuación duplicate (port de calculate_bridge_score) ----
// contract: {level 1..7, denom 0..4, penalty 0/1/2}; tricksTaken: bazas del declarante; isVul: bool
export function calculateBridgeScore(contract, tricksTaken, isVul) {
  if (!contract || contract.level === 0) return 0; // paso
  const level = contract.level, denom = contract.denom, penalty = contract.penalty;
  const tricksNeeded = level + 6;
  const diff = tricksTaken - tricksNeeded;
  const isMinor = (denom === 2 || denom === 3); // D, C
  if (diff >= 0) {
    const base = isMinor ? 20 : 30;
    let contractPts = base * level;
    if (denom === 4) contractPts += 10;
    if (penalty === PENALTY.DOUBLED) contractPts *= 2;
    else if (penalty === PENALTY.REDOUBLED) contractPts *= 4;
    let overtrickPts = 0;
    if (diff > 0) {
      if (penalty === PENALTY.PASSED) overtrickPts = diff * (isMinor ? 20 : 30);
      else if (penalty === PENALTY.DOUBLED) overtrickPts = diff * (isVul ? 200 : 100);
      else overtrickPts = diff * (isVul ? 400 : 200);
    }
    let bonus = 0;
    if (contractPts >= 100) bonus += isVul ? 500 : 300;
    else bonus += 50;
    if (level === 6) bonus += isVul ? 750 : 500;
    else if (level === 7) bonus += isVul ? 1500 : 1000;
    if (penalty === PENALTY.DOUBLED) bonus += 50;
    else if (penalty === PENALTY.REDOUBLED) bonus += 100;
    return contractPts + overtrickPts + bonus;
  } else {
    const undertricks = -diff;
    let pts = 0;
    if (!isVul) {
      if (penalty === PENALTY.PASSED) pts = undertricks * 50;
      else if (penalty === PENALTY.DOUBLED) {
        if (undertricks >= 1) pts += 100;
        if (undertricks >= 2) pts += 200;
        if (undertricks >= 3) pts += 200;
        if (undertricks > 3) pts += (undertricks - 3) * 300;
      } else {
        if (undertricks >= 1) pts += 200;
        if (undertricks >= 2) pts += 400;
        if (undertricks >= 3) pts += 400;
        if (undertricks > 3) pts += (undertricks - 3) * 600;
      }
    } else {
      if (penalty === PENALTY.PASSED) pts = undertricks * 100;
      else if (penalty === PENALTY.DOUBLED) {
        if (undertricks >= 1) pts += 200;
        if (undertricks > 1) pts += (undertricks - 1) * 300;
      } else {
        if (undertricks >= 1) pts += 400;
        if (undertricks > 1) pts += (undertricks - 1) * 600;
      }
    }
    return -pts;
  }
}

// ---- Tabla IMPs (port de get_imps) ----
export function getImps(diff) {
  const d = Math.abs(diff);
  if (d <= 10) return 0;
  else if (d <= 40) return 1;
  else if (d <= 80) return 2;
  else if (d <= 120) return 3;
  else if (d <= 160) return 4;
  else if (d <= 210) return 5;
  else if (d <= 260) return 6;
  else if (d <= 310) return 7;
  else if (d <= 360) return 8;
  else if (d <= 420) return 9;
  else if (d <= 490) return 10;
  else if (d <= 590) return 11;
  else if (d <= 740) return 12;
  else if (d <= 890) return 13;
  else if (d <= 1090) return 14;
  else if (d <= 1290) return 15;
  else if (d <= 1490) return 16;
  else if (d <= 1740) return 17;
  else if (d <= 1990) return 18;
  else if (d <= 2240) return 19;
  else if (d <= 2490) return 20;
  else if (d <= 2990) return 21;
  else if (d <= 3490) return 22;
  else if (d <= 3990) return 23;
  return 24;
}

// Redondeo a 2 decimales estilo Python (round-half-even), usado por el analizador original
export function pyRound2(x) {
  if (!Number.isFinite(x)) return x;
  const sign = x < 0 ? -1 : 1;
  const v = Math.abs(x) * 100;
  const f = Math.floor(v);
  const diff = v - f;
  let r;
  if (diff > 0.5 + 1e-9) r = f + 1;
  else if (diff < 0.5 - 1e-9) r = f;
  else r = (f % 2 === 0) ? f : f + 1;
  return sign * r / 100;
}

// ---- Estado dinámico de la mano durante el carteo (port de endplay Deal.play) ----
export class DealState {
  constructor(hands, trump, first) {
    // hands: array[4] de arrays de cartas (se copian)
    this.hands = hands.map(h => h.slice());
    this.trump = trump;
    this.first = first; // jugador que sale a la baza actual
    this.currentTrick = []; // cartas de la baza actual en orden de juego
  }
  clone() {
    const d = new DealState(this.hands, this.trump, this.first);
    d.currentTrick = this.currentTrick.slice();
    return d;
  }
  curplayer() { return nextPlayer(this.first, this.currentTrick.length); }
  // Juega una carta; lanza error si el jugador no la tiene (como endplay)
  play(card) {
    const p = this.curplayer();
    const idx = this.hands[p].findIndex(c => sameCard(c, card));
    if (idx < 0) throw new Error("Trying to play card not in hand");
    this.hands[p].splice(idx, 1);
    if (this.currentTrick.length === 3) {
      const full = this.currentTrick.concat([card]);
      this.first = trickWinner(full, this.first, this.trump);
      this.currentTrick = [];
    } else {
      this.currentTrick.push(card);
    }
  }
  cardsPlayed() { // total de cartas jugadas (bazas completas * 4 + baza actual)
    return this.hands.reduce((a, h) => a + (13 - 0) - h.length, 0) - (13 * 4 - 52); // simplificado abajo
  }
  // remainCards en formato PBN DDS "N:S.H.D.C E:.. S:.. O:.."
  toRemainCardsPBN() {
    const parts = [];
    for (let p = 0; p < 4; p++) {
      const suits = [[], [], [], []];
      for (const c of this.hands[p]) suits[c.suit].push(rankToChar(c.rank));
      parts.push(suits.map(s => s.join("")).join("."));
    }
    return "N:" + parts.join(" ");
  }
  toSolveInput() {
    return {
      trump: this.trump,
      first: this.first,
      currentTrickSuit: this.currentTrick.map(c => c.suit),
      currentTrickRank: this.currentTrick.map(c => c.rank),
      remainCards: this.toRemainCardsPBN(),
    };
  }
}

// Contrato: {level 0..7 (0=paso), denom 0..4, penalty 0/1/2, declarer 0..3, result ±n}
export function isPassout(contract) { return !contract || contract.level === 0; }

// str(Contract) de endplay, ya normalizado a letras (como hace normalize_str del analizador)
export function contractToString(contract) {
  if (!contract || contract.level === 0) return "Pass";
  const denom = contract.denom === 4 ? "NT" : SUIT_LETTERS[contract.denom];
  const pen = contract.penalty === PENALTY.DOUBLED ? "x" : contract.penalty === PENALTY.REDOUBLED ? "xx" : "";
  const res = contract.result === 0 ? "=" : (contract.result > 0 ? "+" + contract.result : String(contract.result));
  return `${contract.level}${denom}${PLAYER_ABBR[contract.declarer]}${pen}${res}`;
}

// Parseo de la cadena de contrato de la etiqueta PBN (regex de endplay Contract)
export function parseContractTag(value, declarer) {
  if (!value || value.toLowerCase().startsWith("pass")) {
    return { level: 0, denom: 4, declarer: declarer ?? 0, penalty: 0, result: 0 };
  }
  const m = value.toUpperCase().match(/^([1-7])((?:NT?)|S|H|D|C)([NSEW]?)((?:XX|X|D|R)?)((?:=|(?:[+-]\d+))?)$/);
  if (!m) return { level: 0, denom: 4, declarer: declarer ?? 0, penalty: 0, result: 0 };
  const denomMap = { S: 0, H: 1, D: 2, C: 3, N: 4, NT: 4 };
  let decl = m[3] ? "NESW".indexOf(m[3]) : (declarer ?? 0);
  let penalty = 0;
  if (m[4] === "X" || m[4] === "D") penalty = 1;
  else if (m[4] === "XX" || m[4] === "R") penalty = 2;
  const result = m[5] === "=" ? 0 : parseInt(m[5] || "0", 10);
  return { level: parseInt(m[1], 10), denom: denomMap[m[2]], declarer: decl, penalty, result };
}

// Vulnerabilidad estilo PBN/endplay
export function parseVulnerable(v) {
  const s = (v || "").toLowerCase();
  if (s === "none" || s === "-" || s === "love") return "none";
  if (s === "ns") return "ns";
  if (s === "ew") return "ew";
  if (s === "all" || s === "both") return "both";
  return "none";
}
export function vulDisplay(v) {
  return { none: "nadie", both: "todos", ns: "norte/sur", ew: "este/oeste" }[v] || v;
}

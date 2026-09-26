// BBO LIN reader. LIN is not a published standard: see README for supported tags.
// qx/ md delimit boards; md carries dealer (1=S,2=W,3=N,4=E),
// followed by hands S,W,N[,E]. pn is also S,W,N,E. pc is chronological.
import { parseCard, rankFromChar, trickWinner, nextPlayer } from "./bridge-core.js";
const SWNE = [2, 3, 0, 1];
const RANKS = "23456789TJQKA";
const SUITS = { S: 0, H: 1, D: 2, C: 3 };
const norm = s => String(s || "").trim();

function hand(str) {
  const out = [];
  let suit = null;
  for (const c of norm(str).toUpperCase()) {
    if (c in SUITS) suit = SUITS[c];
    else if (RANKS.includes(c) && suit !== null) out.push({ suit, rank: rankFromChar(c) });
    else if (!/\s/.test(c)) throw new Error(`Carta LIN no válida: ${c}`);
  }
  return out;
}
function deal(value) {
  const dealer = Number(value[0]);
  if (!(dealer >= 1 && dealer <= 4)) throw new Error("LIN sin dador válido en md (1-4).");
  const parts = value.slice(1).split(",");
  if (parts.length !== 3 && parts.length !== 4) throw new Error("LIN md necesita tres o cuatro manos.");
  const hands = [[], [], [], []], seen = new Set();
  for (let i = 0; i < parts.length; i++) hands[SWNE[i]] = hand(parts[i]);
  for (const h of hands) for (const c of h) {
    const id = `${c.suit}:${c.rank}`;
    if (seen.has(id)) throw new Error("Carta duplicada en md LIN.");
    seen.add(id);
  }
  if (parts.length === 3) {
    for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) {
      if (!seen.has(`${s}:${r}`)) hands[1].push({ suit: s, rank: r });
    }
  }
  if (hands.some(h => h.length !== 13) || seen.size !== (parts.length === 3 ? 39 : 52))
    throw new Error("Reparto LIN incompleto o inválido (13 cartas por jugador).");
  return { dealer: SWNE[dealer - 1], hands };
}
function bid(raw) {
  const v = norm(raw).toUpperCase().replace(/!$/, "");
  if (/^(P|PASS)$/.test(v)) return { kind: "pass", str: "P" };
  if (/^(D|X|DBL)$/.test(v)) return { kind: "double", str: "X" };
  if (/^(R|XX|RDBL)$/.test(v)) return { kind: "redouble", str: "XX" };
  const m = /^([1-7])(S|H|D|C|N|NT)$/.exec(v);
  if (!m) throw new Error(`Voz LIN desconocida: ${raw}`);
  return { kind: "bid", level: +m[1], denom: m[2] === "N" || m[2] === "NT" ? 4 : SUITS[m[2]],
    str: m[1] + (m[2] === "N" ? "NT" : m[2]) };
}
function contract(auction, dealer) {
  let last = null, penalty = 0;
  let seat = dealer;
  for (const b of auction) {
    if (b.kind === "bid") { last = { ...b, bidder: seat }; penalty = 0; }
    else if (b.kind === "double" && last) penalty = 1;
    else if (b.kind === "redouble" && last) penalty = 2;
    seat = nextPlayer(seat);
  }
  if (!last) return { level: 0, denom: 4, declarer: dealer, penalty: 0, result: 0 };
  seat = dealer;
  let declarer = last.bidder;
  for (const b of auction) {
    if (b.kind === "bid" && b.denom === last.denom && b.level <= last.level &&
        seat % 2 === last.bidder % 2) { declarer = seat; break; }
    seat = nextPlayer(seat);
  }
  return { level: last.level, denom: last.denom, declarer, penalty, result: 0 };
}
function board(fields, fallbackNum, common = {}) {
  const first = key => fields.find(([k]) => k === key)?.[1] ?? common[key] ?? "";
  const all = key => fields.filter(([k]) => k === key).map(([,v]) => v);
  const { dealer, hands } = deal(first("md"));
  const qx = first("qx");
  const num = /\d+/.exec(qx)?.[0] || /\d+/.exec(first("ah"))?.[0] || fallbackNum;
  const pn = first("pn").split(",");
  if (pn.length !== 4 || pn.some(n => !norm(n)))
    throw new Error(`Mano ${num}: faltan los cuatro nombres pn (Sur,Oeste,Norte,Este).`);
  const info = { Board: String(num) };
  ["South", "West", "North", "East"].forEach((k, i) => { info[k] = norm(pn[i]) || k; });
  if (first("tn") || first("rh")) info.Event = first("tn") || first("rh");
  if (first("dt")) info.Date = first("dt");
  const vul = ({ n: "ns", e: "ew", b: "both", "-": "none", "0": "none", o: "none" })[first("sv").toLowerCase()] || "none";
  const auction = all("mb").map(bid);
  if (!auction.length) throw new Error(`Mano ${num}: faltan voces mb; no se puede inferir contrato.`);
  const final = contract(auction, dealer);
  const play = all("pc").filter(Boolean).map(v => parseCard(v.trim().toUpperCase()));
  if (play.length > 52) throw new Error(`Mano ${num}: más de 52 cartas jugadas.`);
  const valid = new Set(hands.flatMap(h => h.map(c => `${c.suit}:${c.rank}`)));
  const used = new Set();
  for (const c of play) {
    const id = `${c.suit}:${c.rank}`;
    if (!valid.has(id) || used.has(id)) throw new Error(`Mano ${num}: carta pc duplicada o fuera del reparto.`);
    used.add(id);
  }
  const claim = first("mc");
  let tricks;
  if (final.level) {
    if (/^\d+$/.test(claim)) tricks = Number(claim);
    else if (play.length === 52) {
      tricks = 0;
      let leader = nextPlayer(final.declarer), won = 0;
      for (let i = 0; i < 52; i += 4) {
        const winner = trickWinner(play.slice(i, i + 4), leader, final.denom);
        if (winner % 2 === final.declarer % 2) won++;
        leader = winner;
      }
      tricks = won;
    } else throw new Error(`Mano ${num}: carteo parcial sin mc (bazas del declarante); resultado desconocido.`);
    if (tricks < 0 || tricks > 13) throw new Error(`Mano ${num}: mc fuera de rango.`);
    final.result = tricks - final.level - 6;
  }
  return { info, boardNum: Number(num), vul, dealer, hands, contract: final,
    auction, play, claimed: play.length < 52 && !!claim };
}
export function parseLIN(text) {
  // The separator is |; empty values (pg||) are significant.
  const raw = text.replace(/^\uFEFF/, "").split("|");
  const pairs = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const k = norm(raw[i]).toLowerCase(), v = raw[i + 1];
    if (k) pairs.push([k, v]);
  }
  const boards = []; let fields = [], common = {};
  const flush = () => { if (fields.some(([k]) => k === "md")) boards.push(board(fields, boards.length + 1, common)); fields = []; };
  for (const [k, v] of pairs) {
    if ((k === "qx" || k === "md") && fields.some(([key]) => key === "md")) flush();
    if (!fields.length && ["pn", "tn", "rh", "dt", "st"].includes(k)) common[k] = v;
    fields.push([k, v]);
  }
  flush();
  return boards;
}

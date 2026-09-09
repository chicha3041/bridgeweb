// Parser PBN (subconjunto usado por el analizador, fiel a endplay.parsers.pbn)
import { parseCard, parseContractTag, parseVulnerable, SUIT_LETTERS, rankFromChar, PENALTY, trickWinner, nextPlayer } from "./bridge-core.js";

function parseDeal(str) {
  // "N:spades.hearts.diamonds.clubs E:.. ..." o con espacios; el primer jugador puede variar
  const m = str.trim().match(/^([NESW])\s*:\s*(.+)$/i);
  let first = 0, rest = str.trim();
  if (m) { first = "NESW".indexOf(m[1].toUpperCase()); rest = m[2]; }
  const handStrs = rest.trim().split(/\s+/);
  const hands = [[], [], [], []];
  for (let i = 0; i < Math.min(4, handStrs.length); i++) {
    const p = (first + i) % 4;
    const suits = handStrs[i].split(".");
    for (let s = 0; s < Math.min(4, suits.length); s++) {
      for (const ch of suits[s]) {
        if (/[23456789TJQKA]/i.test(ch)) hands[p].push({ suit: s, rank: rankFromChar(ch) });
      }
    }
  }
  return hands;
}

function parseBid(tok) {
  const t = tok.toUpperCase();
  if (t === "P" || t === "PASS" || t === "PASO") return { kind: "pass", str: "P" };
  if (t === "X" || t === "D" || t === "DBL") return { kind: "double", str: "X" };
  if (t === "XX" || t === "R" || t === "RDBL") return { kind: "redouble", str: "XX" };
  const m = t.match(/^([1-7])(NT?|S|H|D|C)!?$/);
  if (m) {
    const denomMap = { S: 0, H: 1, D: 2, C: 3, N: 4, NT: 4 };
    const level = parseInt(m[1], 10), denom = denomMap[m[2]];
    return { kind: "bid", level, denom, str: level + (denom === 4 ? "NT" : SUIT_LETTERS[denom]) };
  }
  return null;
}

// Convierte la tabla de carteo PBN a orden lineal (port de linearise_play)
function linearisePlay(table, first, trump) {
  const PAD = { suit: 4, rank: 2 }; // carta de relleno (NT 2)
  const play = [];
  let winner = first;
  for (const row of table) {
    if (!row.length) continue;
    const rots = (winner - first + 4) % 4;
    const trick = row.slice(rots).concat(row.slice(0, rots));
    play.push(...trick);
    const full = trick.concat(Array(Math.max(0, 4 - trick.length)).fill(PAD));
    winner = trickWinner(full.slice(0, 4), winner, trump);
  }
  while (play.length && play[play.length - 1].suit === 4) play.pop();
  return play.filter(c => c.suit !== 4 || play.indexOf(c) === -1 ? true : true).filter(c => true);
}

export function parsePBN(text) {
  const boards = [];
  let tags = {};
  let curSection = null; // 'auction' | 'play' | null
  const lines = text.split(/\r?\n/);
  const flush = () => {
    if (Object.keys(tags).length === 0) return;
    const b = buildBoard(tags);
    if (b) boards.push(b);
    tags = {};
  };
  for (let raw of lines) {
    const line = raw.trim();
    if (line === "") { flush(); curSection = null; continue; }
    if (line.startsWith("%") || line.startsWith("{")) continue;
    const tm = line.match(/^\[(\w+)\s+"([^"]*)"\]/);
    if (tm) {
      const key = tm[1], value = tm[2];
      const lk = key.toLowerCase();
      if (lk in Object.fromEntries(Object.keys(tags).map(k => [k.toLowerCase(), 1]))) { curSection = null; continue; } // endplay ignora etiquetas repetidas
      if (lk === "auction" || lk === "play") {
        tags[lk] = { value, data: [] };
        curSection = lk;
      } else {
        tags[key] = { value };
        curSection = null;
      }
      continue;
    }
    if (curSection) {
      tags[curSection].data.push(line.split(/\s+/).filter(x => x));
      continue;
    }
    if (line === "*") continue;
  }
  flush();
  return boards;
}

function buildBoard(tags) {
  const g = (k) => tags[k]?.value ?? tags[Object.keys(tags).find(t => t.toLowerCase() === k.toLowerCase())]?.value;
  const board = { info: {}, boardNum: 1, vul: "none", dealer: 0, hands: null, contract: null, auction: [], play: [], claimed: false };
  for (const [k, f] of Object.entries(tags)) {
    const key = k.toLowerCase();
    const value = f.value;
    if (key === "board") board.boardNum = parseInt(value, 10) || 1;
    else if (key === "vulnerable") board.vul = parseVulnerable(value);
    else if (key === "deal") board.hands = parseDeal(value);
    else if (key === "dealer") board.dealer = value ? "NESW".indexOf(value[0].toUpperCase()) : 0;
    else if (key === "declarer") board._declarer = value === "?" ? null : "NESW".indexOf((value || "N")[0].toUpperCase());
    else if (key === "contract") board.contract = value === "?" ? null : parseContractTag(value || "Pass", null);
    else if (key === "result") board._tricks = value === "?" ? 0 : parseInt(value || "0", 10);
    else if (key === "auction") {
      if (value) board.dealer = "NESW".indexOf(value[0].toUpperCase());
      const flat = f.data.flat();
      for (const tok of flat) {
        if (tok.toLowerCase() === "ap") { board.auction.push({ kind: "pass", str: "P" }, { kind: "pass", str: "P" }, { kind: "pass", str: "P" }); continue; }
        if (tok.startsWith("=") && tok.endsWith("=")) continue; // nota
        if (["-", "*", "+"].includes(tok)) break;
        const b = parseBid(tok.replace(/!$/, ""));
        if (b) board.auction.push(b);
      }
    } else if (key === "play") {
      board._playFirst = "NESW".indexOf((value || "N")[0].toUpperCase());
      const table = [];
      for (const rawRow of f.data) {
        if (rawRow.length === 1 && rawRow[0] === "*") { board.claimed = true; break; }
        const row = [];
        for (const tok of rawRow) {
          if (tok.startsWith("=") && tok.endsWith("=")) continue;
          if (["+", "-", "*"].includes(tok)) { if (tok === "*") board.claimed = true; row.push({ suit: 4, rank: 2 }); }
          else { try { row.push(parseCard(tok)); } catch (e) { /* ignora token inválido */ } }
        }
        table.push(row);
      }
      board._playTable = table;
    } else {
      board.info[k] = value;
    }
  }
  if (board.contract) {
    if (board._declarer != null && board._declarer >= 0) board.contract.declarer = board._declarer;
    if (board._tricks != null) board.contract.result = board._tricks - (board.contract.level + 6);
  }
  if (board._playTable && board.contract && board.hands) {
    board.play = linearisePlay(board._playTable, board._playFirst ?? 0, board.contract.denom);
  }
  delete board._declarer; delete board._tricks; delete board._playTable; delete board._playFirst;
  return board;
}

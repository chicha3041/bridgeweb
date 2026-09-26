import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parsePBN } from '../js/pbn.js';
import { parseLIN } from '../js/lin.js';
const rank = r => '??23456789TJQKA'[r];
const letter = s => 'SHDC'[s];
function toLin(boards) {
 return boards.map(b => {
   const parts = [['qx', 'o'+b.boardNum], ['pn', [2,3,0,1].map(i => b.info[['North','East','South','West'][i]]).join(',')],
     ['tn', b.info.Event || ''], ['dt', b.info.Date || '']];
   const names = ['North','East','South','West'];
   const hand = i => 'SHDC'.split('').map((s,idx) => s + b.hands[i].filter(c=>c.suit===idx).map(c=>rank(c.rank)).join('')).join('');
   parts.push(['md', String([3,4,1,2][b.dealer])+[2,3,0,1].map(hand).join(',')]);
   parts.push(['sv', ({none:'-',ns:'n',ew:'e',both:'b'})[b.vul]]);
   for (const x of b.auction) parts.push(['mb', x.str.replace('NT','N').replace(/^X$/,'D').replace(/^XX$/,'R')]);
   for (const c of b.play) parts.push(['pc',letter(c.suit)+rank(c.rank)]);
   if (b.contract.level) parts.push(['mc',String(6+b.contract.level+b.contract.result)]);
   parts.push(['pg','']);
   return parts.map(([k,v])=> k+'|'+v+'|').join('');
 }).join('\n');
}
const pick = b => ({boardNum:b.boardNum,info:Object.fromEntries(["North","East","South","West","Event","Date"].map(k=>[k,b.info[k]])),vul:b.vul,dealer:b.dealer,hands:b.hands,contract:b.contract,auction:b.auction,play:b.play});
for (const [i,path] of process.argv.slice(2).entries()) {
 const pbn = parsePBN(readFileSync(path,'utf8'));
 const lin = toLin(pbn);
 writeFileSync(`tests/mesa${i+1}.lin`,lin);
 const parsed = parseLIN(lin);
 assert.equal(parsed.length,pbn.length);
 for(let j=0;j<pbn.length;j++) {
  try{ assert.deepEqual(pick(parsed[j]),pick(pbn[j])); }catch(e){console.error('Board',j+1,'field',Object.keys(pick(pbn[j])).filter(k=>JSON.stringify(pick(pbn[j])[k])!==JSON.stringify(pick(parsed[j])[k]))); throw e;}
 }
 console.log(path,'boards',pbn.length,'LIN bytes',lin.length,'identical parsed board data');
}

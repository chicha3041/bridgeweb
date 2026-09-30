import assert from 'node:assert/strict';
import { teamKey, teamOptions, filterSelection, renameEquipo, loadStats } from '../js/stats.js';
import { calcularEstadisticasEquipos } from '../js/analyzer.js';
const j = (imps) => ({imps, manos:14, subasta:3, carteo:-1, errores_carteo:[]});
const stats = {version:6, equipos:{eq1:{nombre:'Galáctus',jugadores:['David','Ana']},eq2:{nombre:'Other'},eq3:{nombre:'GALACTUS!',jugadores:['David','Eva']},eq4:{nombre:'Else'}},
  partidos:{a:{evento:'Last Minute - Galactus',eventoClave:'first',manos:14,jugadores:{David:j(4),Ana:j(2)},equipos:{A:{id:'eq1',jugadores:['David','Ana'],imps:6}}},
  b:{evento:'Galactus - Bridgebrothers',eventoClave:'second',manos:14,jugadores:{David:j(-1),Eva:j(3)},equipos:{B:{id:'eq3',jugadores:['David','Eva'],imps:2}}}}};
const before=JSON.stringify(stats);
assert.equal(teamKey(' GÁLACTUS! '),'galactus');
assert.equal(teamOptions(stats).length,1);
assert.equal(teamOptions(stats,'first')[0][0],'eq1');
const {teams} = calcularEstadisticasEquipos(filterSelection(stats,'','global:galactus'));
assert.equal(Object.keys(teams).length,1);
const t=teams['global:galactus'];assert.equal(t.partidos,2);assert.equal(t.manos,28);assert.equal(t.imps,8);
assert.equal(t.jugadores.David.partidos,2);assert.equal(t.jugadores.David.imps,3);assert.equal(t.jugadores.Eva.partidos,1);
assert.equal(JSON.stringify(stats),before);
assert.equal(Object.keys(filterSelection(stats,'first','eq1').partidos).length,1);
assert.equal(Object.keys(filterSelection(stats,'','global:missing').partidos).length,0);
let raw=JSON.stringify(stats);globalThis.localStorage={getItem:()=>raw,setItem:(_,value)=>raw=value};
renameEquipo('global:galactus','Nuevo');assert.equal(loadStats().equipos.eq1.nombre,'Nuevo');assert.equal(loadStats().equipos.eq3.nombre,'Nuevo');
renameEquipo('eq1','Solo uno');assert.equal(loadStats().equipos.eq3.nombre,'Nuevo');
console.log('OK: Global teams, rotating roster, exact player names, non-mutation, per-event isolation, rename scope.');

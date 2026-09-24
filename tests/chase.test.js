import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAYERS,SEASONS} from '../data.js';
import {chaseFixtures,createChase,isBatting,applyBall,battingResult} from '../engine.js';
const fixtures=chaseFixtures(SEASONS),xi=PLAYERS.slice(0,11);
test('fixed route includes every source opponent; targets never drop and strength rises every match',()=>{
 assert.deepEqual(new Set(fixtures.map(f=>f.opponent)),new Set(SEASONS.flatMap(s=>s.teams)));
 for(const [i,f] of fixtures.entries()){assert.equal(f.limit,36);assert.ok(f.target<=f.limit*6);if(i){assert.ok(f.target>=fixtures[i-1].target);assert.ok(f.strength>fixtures[i-1].strength)}}
});
test('every campaign match begins batting against an existing score and terminates as a chase',()=>{
 for(const f of fixtures){const m=createChase(xi,f);assert.ok(isBatting(m));assert.equal(m.inning,1);assert.equal(m.innings[0].runs,f.target-1);while(m.stage==='ready')applyBall(m,{runs:6,wicket:false});assert.equal(m.winner,'fours');assert.equal(m.stage,'done')}
});
test('a failed chase or tied score requires a retry, with no bowling innings',()=>{
 for(const tie of [false,true]){const m=createChase(xi,fixtures[0]);for(let b=0;b<m.limit;b++)applyBall(m,{runs:tie&&b===0?fixtures[0].target-1:0,wicket:false});assert.equal(m.winner,tie?'tie':'opponent');assert.equal(m.inning,1);assert.ok(isBatting(m))}
});
test('arrow shots award six for sweet timing and less for mistiming',()=>{
 const shot=error=>battingResult({error,style:'arcade',rating:70,rng:()=>.99});assert.equal(shot(0).runs,6);assert.ok(shot(.16).runs<6);assert.equal(shot(.5).runs,0);
});
test('all attacking arrows can score four or six, and mistiming distinguishes caught from bowled',()=>{
 for(const direction of ['leg','off','straight']){
  const four=battingResult({error:.045,style:'arcade',rating:70,gap:false});
  const six=battingResult({error:0,style:'arcade',rating:70,gap:false});
  assert.equal(four.runs,4,direction);assert.equal(six.runs,6,direction);
 }
 const caught=battingResult({error:.32,style:'arcade'}),bowled=battingResult({error:.6,style:'arcade'});
 assert.equal(caught.dismissal,'caught');assert.equal(bowled.dismissal,'bowled');
 for(const result of [caught,bowled]){assert.equal(result.runs,0);assert.equal(result.wicket,true);const m=createChase(xi,fixtures[0]);applyBall(m,result);assert.equal(m.innings[1].wickets,1);assert.equal(m.innings[1].balls,1);assert.equal(m.innings[1].striker,2)}
});
test('wides add a run to the team without using a ball, and can win a chase',()=>{
 const m=createChase(xi,fixtures[0]);applyBall(m,{runs:1,wide:true,wicket:false});
 assert.equal(m.innings[1].runs,1);assert.equal(m.innings[1].balls,0);assert.equal(m.innings[1].extras,1);assert.equal(m.innings[1].batting[0].runs,0);
 const n=createChase(xi,fixtures[0]);applyBall(n,{runs:fixtures[0].target-1,wicket:false});applyBall(n,{runs:1,wide:true,wicket:false});assert.equal(n.winner,'fours');assert.equal(n.stage,'done');
});
test('campaign runs from a run a ball (36) to 84 off six overs',()=>{assert.equal(fixtures[0].target,36);assert.equal(fixtures.at(-1).target,84);assert.ok(fixtures.every(f=>f.target>=f.limit));assert.equal(fixtures[0].limit,36)});

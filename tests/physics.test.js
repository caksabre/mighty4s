import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDelivery,deliveryPath,playShot,simulateHit,resolveBall,makeField,insideBoundary,shotFit,findGap,LENGTHS,PITCH,CONTACT_Y} from '../physics.js';
const seeded=seed=>()=>((seed=(seed*1664525+1013904223)%4294967296)/4294967296);
const delivery=(o={})=>({type:'pace',kmh:110,length:'full',bounceY:3,line:0,movement:0,wide:false,release:{x:-.32,y:19,h:2.15},...o});

test('deliveries stay within realistic pace, length and line ranges at every strength',()=>{
 const rng=seeded(1);
 for(const s of [0,.5,1])for(const type of ['pace','spin'])for(let i=0;i<400;i++){
  const d=makeDelivery({strength:s,type,rng});
  assert.ok(d.kmh>=62&&d.kmh<=148,`${d.kmh}`);assert.ok(d.bounceY>=LENGTHS[d.length][0]&&d.bounceY<=LENGTHS[d.length][1]);
  if(!d.wide)assert.ok(d.line>=-.42&&d.line<=.7);
  const p=deliveryPath(d);assert.ok(p.ideal<p.crease&&p.crease<p.stumps);assert.ok(p.crease-p.ideal<=.171);if(d.length!=='yorker')assert.ok(p.ideal>=p.bounceTime-.031);assert.ok(p.ideal>.25&&p.ideal<1.3,`${p.ideal}`);
  assert.ok(Math.abs(p.at(p.bounceTime).h)<.02);
 }
});
test('faster bowling reaches the bat sooner; later fixtures bowl quicker on average',()=>{
 assert.ok(deliveryPath(delivery({kmh:140})).ideal<deliveryPath(delivery({kmh:100})).ideal);
 const avg=s=>{const rng=seeded(3);let t=0;for(let i=0;i<300;i++)t+=makeDelivery({strength:s,rng}).kmh;return t/300};
 assert.ok(avg(1)>avg(0)+30);
});
test('leaving: straight balls hit the stumps, wide ones are safe or called wide',()=>{
 const f=makeField(0,seeded(2));
 assert.equal(resolveBall({delivery:delivery({line:0}),fielders:f}).outcome.dismissal,'bowled');
 assert.deepEqual(resolveBall({delivery:delivery({line:.5}),fielders:f}).outcome,{runs:0,wicket:false,left:true});
 const wide=resolveBall({delivery:delivery({line:1.1,wide:true}),fielders:f}).outcome;assert.equal(wide.wide,true);assert.equal(wide.runs,1);
 assert.equal(resolveBall({delivery:delivery({length:'bouncer',bounceY:10,line:0}),fielders:f}).path.hitsStumps,false);
});
test('timing: far outside the window misses, and a miss on the stumps is bowled',()=>{
 const f=makeField(0,seeded(4));
 for(const e of [-400,-200,200,400]){const r=resolveBall({delivery:delivery(),shot:'straight',errorMs:e,fielders:f,rng:seeded(5)});assert.equal(r.play.contact,'miss');assert.equal(r.outcome.dismissal,'bowled')}
});
test('the right shot beats the wrong one for each type of delivery',()=>{
 const ball=(len,x,h=.6)=>[{length:len},{x,h}];
 assert.ok(shotFit('leg',...ball('short',0,1.1))>shotFit('straight',...ball('short',0,1.1)));
 assert.ok(shotFit('straight',...ball('full',0))>shotFit('leg',...ball('full',0)));
 assert.ok(shotFit('off',...ball('good',.4))>shotFit('leg',...ball('good',.4)));
});
test('early timing sends it to leg, late to off',()=>{
 const d=delivery(),path=deliveryPath(d);
 const early=playShot({delivery:d,path,shot:'straight',errorMs:-60,rng:()=>.5}),late=playShot({delivery:d,path,shot:'straight',errorMs:60,rng:()=>.5});
 assert.ok(early.launch.angle<-10);assert.ok(late.launch.angle>10);
});
test('a perfectly timed lofted drive off a full ball clears the rope',()=>{
 const d=delivery(),path=deliveryPath(d),empty=[];
 const play=playShot({delivery:d,path,shot:'straight',loft:true,errorMs:0,rating:80,rng:()=>.5});
 assert.equal(play.contact,'middle');
 const sim=simulateHit({launch:play.launch,fielders:empty});assert.equal(sim.outcome.runs,6);assert.equal(sim.boundary,6);
});
test('ground shots never score six; lofted shots straight at a fielder can be caught',()=>{
 const rng=seeded(9);
 for(let i=0;i<300;i++){const sim=simulateHit({launch:{x:0,y:CONTACT_Y,h:.5,speed:10+rng()*30,angle:rng()*360-180,elevation:-6+rng()*6},fielders:[],rng});assert.notEqual(sim.outcome.runs,6)}
 const catcher=[{name:'Long-on',x:0,y:40,speed:7,react:.2,catching:1}];
 const sim=simulateHit({launch:{x:0,y:CONTACT_Y,h:.8,speed:22,angle:0,elevation:38},fielders:catcher,rng:()=>0});
 assert.equal(sim.outcome.wicket,true);assert.equal(sim.outcome.fielder,'Long-on');
});
test('the field simulation always ends inside legal cricket scores',()=>{
 const rng=seeded(11);
 for(let i=0;i<500;i++){
  const d=makeDelivery({strength:rng(),rng}),r=resolveBall({delivery:d,shot:['leg','off','straight','defend'][i%4],loft:i%3===0,errorMs:(rng()-.5)*260,fielders:makeField(rng(),rng),rng});
  assert.ok([0,1,2,3,4,6].includes(r.outcome.runs),JSON.stringify(r.outcome));
  if(r.outcome.wicket)assert.equal(r.outcome.runs,0);
  if(r.sim)for(const p of r.sim.samples.slice(0,-1))assert.ok(insideBoundary(p.x,p.y));
 }
});
test('placement steers perfect ground shots away from fielders',()=>{
 const fielder=[{x:0,y:30}];const a=findGap(0,18,fielder);assert.ok(Math.abs(a)>=10);
});
test('a solid club batter can win the opening chase and the last one is a genuine challenge',()=>{
 const rng=seeded(21),g=()=>(rng()+rng()+rng()-1.5)/.75;
 const chase=(strength,target)=>{let runs=0,wk=0;for(let b=0;b<36&&wk<10&&runs<target;b++){const d=makeDelivery({strength,type:b%12<6?'pace':'spin',rng}),p=deliveryPath(d);const shot=p.atBat.x>.6?null:['leg','off','straight'].sort((x,y)=>shotFit(y,d,p.atBat)-shotFit(x,d,p.atBat))[0];const o=resolveBall({delivery:d,shot,loft:rng()<.3,errorMs:g()*45,fielders:makeField(strength,rng),rng}).outcome;runs+=o.runs;if(o.wide)b--;if(o.wicket)wk++}return runs>=target};
 let first=0,last=0;for(let i=0;i<60;i++){first+=chase(0,18);last+=chase(1,80)}
 assert.ok(first>=54,`opening chase won ${first}/60`);assert.ok(last>=3&&last<=50,`final chase won ${last}/60`);
});
test('the sweet spot is where the ball visibly meets the bat: about 170ms before it reaches the crease',()=>{
 const rng=seeded(31);let lead=0,n=0;
 for(let i=0;i<500;i++){const p=deliveryPath(makeDelivery({strength:rng(),type:i%2?'pace':'spin',rng}));lead+=p.crease-p.ideal;n++}
 assert.ok(lead/n>.13&&lead/n<=.17,`${lead/n}`);
});

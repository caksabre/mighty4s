// Ball physics for the arcade batting game. Pure functions, so the whole model is testable in Node.
// World: x = lateral metres (off side +, for a right-hander), y = metres down the pitch towards the
// bowler (striker's stumps at 0, bowler's at 20.12), h = height in metres.
import {clamp} from './engine.js';

export const TIMING_LEAD=.17,RUN_FIRST=2.9,RUN_NEXT=2.6,G=9.81,PITCH=20.12,CONTACT_Y=1.0,STUMP_HALF=.14,STUMP_TOP=.74;
export const BOUNDARY={cx:0,cy:10,rx:57,ry:63};
export const insideBoundary=(x,y)=>((x-BOUNDARY.cx)/BOUNDARY.rx)**2+((y-BOUNDARY.cy)/BOUNDARY.ry)**2<1;
const weighted=(rng,entries)=>{const total=entries.reduce((s,[,w])=>s+w,0);let r=rng()*total;for(const [v,w] of entries){if((r-=w)<=0)return v}return entries.at(-1)[0]};
const gauss=rng=>(rng()+rng()+rng()-1.5)/.75;

export const LENGTHS={yorker:[.6,1.5],full:[2,3.8],good:[4.2,6.6],short:[7,8.8],bouncer:[9.2,11]};
export function lengthName(bounceY){return bounceY<1.8?'yorker':bounceY<4?'full':bounceY<6.9?'good':bounceY<9?'short':'bouncer'}
export function lineName(x){return x<-.5?'wide-leg':x<-STUMP_HALF?'leg':x<=STUMP_HALF?'stumps':x<.85?'off':'wide-off'}

// A single delivery. strength runs 0 (first fixture) to 1 (last fixture).
export function makeDelivery({strength=0,type='pace',rng=Math.random}={}){
 const s=clamp(strength,0,1),spin=type==='spin';
 const kmh=spin?clamp(72+s*16+gauss(rng)*3,62,95):clamp(98+s*40+gauss(rng)*4,88,148);
 const length=weighted(rng,spin?[['full',3],['good',5],['short',1.2+s],['yorker',.4+s]]:[['yorker',.6+s*1.6],['full',3],['good',4],['short',1.5+s],['bouncer',.4+s*1.4]]);
 const [a,b]=LENGTHS[length];const bounceY=a+rng()*(b-a);
 const wide=rng()<.035;
 const line=wide?(rng()<.7?.95+rng()*.3:-.62-rng()*.2):clamp(.08+gauss(rng)*(.17+s*.1),-.42,.7);
 // Pace bowlers swing in the air; spinners turn after pitching. Better sides move it more.
 const movement=(rng()<.5?-1:1)*(spin?.12+rng()*(.18+s*.22):rng()<.55?0:.05+rng()*(.12+s*.16));
 return {type,kmh:Math.round(kmh),length,bounceY,line,movement,wide,release:{x:-.32,y:19,h:spin?1.95:2.15}};
}

// Closed-form path. Returns positions for any time since release, plus timing landmarks.
export function deliveryPath(d){
 const v=d.kmh/3.6*.93,{release:r}=d,spin=d.type==='spin';
 const tb=(r.y-d.bounceY)/v,vh0=(G*tb*tb/2-r.h)/tb,impact=vh0-G*tb,e=spin?.52:.6,vh1=-impact*e,v2=v*(spin?.84:.9);
 // Line is where the ball would be at the batter's crease; swing bends it progressively in the air.
 const pre=d.type==='spin'?0:d.movement,turn=d.type==='spin'?d.movement:0;
 const xAt=y=>{const q=clamp((r.y-y)/(r.y-CONTACT_Y),0,1.4);let x=r.x+(d.line-pre-r.x)*q+pre*q*q;if(y<d.bounceY)x+=turn*clamp((d.bounceY-y)/Math.max(1,d.bounceY-CONTACT_Y),0,1.6);return x};
 const at=t=>{
  if(t<=tb){const y=r.y-v*t;return {x:xAt(y),y,h:Math.max(0,r.h+vh0*t-G*t*t/2),bounced:false}}
  const u=t-tb,y=d.bounceY-v2*u;let h=vh1*u-G*u*u/2;
  if(h<0){const u2=u-2*vh1/G;h=Math.max(0,vh1*.4*u2-G*u2*u2/2)}
  return {x:xAt(y),y,h,bounced:true};
 };
 const timeAtY=y=>y>=d.bounceY?(r.y-y)/v:tb+(d.bounceY-y)/v2;
 // From behind the striker the ball visually meets the bat a few metres before the crease, so the
 // sweet spot sits TIMING_LEAD earlier than crease arrival (at most a frame or two before the ball pitches).
 const crease=timeAtY(CONTACT_Y),stumps=timeAtY(0),atStumps=at(stumps),atBat=at(crease);
 const ideal=Math.max(tb<crease?tb-.03:0,crease-TIMING_LEAD);
 const hitsStumps=Math.abs(atStumps.x)<=STUMP_HALF&&atStumps.h<=STUMP_TOP;
 return {at,bounceTime:tb,ideal,crease,stumps,hitsStumps,atBat,speed:v};
}

// How well each shot suits each delivery. 1 is the textbook answer; low values mean edges and misses.
export function shotFit(shot,d,ball){
 const L=d.length,line=lineName(ball.x),high=ball.h>1.25;
 if(shot==='defend')return high?.8:1;
 if(shot==='leg'){let m={yorker:.55,full:.8,good:.85,short:1.08,bouncer:1.1}[L];if(line==='leg'||line==='wide-leg')m=Math.max(m,1.05);if(line==='off')m-=.28;if(line==='wide-off')m-=.45;return m}
 if(shot==='off'){let m={yorker:.6,full:.95,good:1,short:1.05,bouncer:.55}[L];if(line==='off'||line==='wide-off')m+=.1;if(line==='stumps')m-=.12;if(line==='leg')m-=.35;if(line==='wide-leg')m-=.5;return m}
 let m={yorker:1,full:1.08,good:.92,short:.62,bouncer:.4}[L];if(line==='stumps')m+=.04;if(line==='wide-off'||line==='wide-leg')m-=.35;return m;
}

export const WINDOW={perfect:28,good:65,edge:125,miss:150};
export function timingLabel(ms){const e=Math.abs(ms);return e<=WINDOW.perfect?'Perfect':e<=WINDOW.good?'Good':e<=WINDOW.edge?(ms<0?'Early':'Late'):ms<0?'Way too early':'Way too late'}

// Resolve bat on ball. errorMs < 0 means early. Returns a launch for the field simulation, or a miss.
export function playShot({delivery:d,path,shot,loft=false,errorMs,rating=70,fielders=null,rng=Math.random}){
 const ball=path.atBat,e=Math.abs(errorMs),skill=(rating-60)/100;
 const timing=timingLabel(errorMs);
 const base={timing,errorMs,shot,loft};
 const limit=shot==='defend'?WINDOW.miss+20:WINDOW.miss;
 if(e>limit)return {...base,contact:'miss'};
 const q=clamp(1-Math.max(0,e-8)/(WINDOW.edge+10),0,1);
 const fit=shotFit(shot,d,ball);
 const x0=clamp(ball.x,-.6,.9),origin={x:x0,y:CONTACT_Y,h:clamp(ball.h,.15,1.6)};
 if(shot==='defend'){
  if(fit<.9&&rng()<.18)return edgeShot(base,origin,ball,rng,.6);
  return {...base,contact:'block',launch:{...origin,speed:3+rng()*4,angle:(rng()-.5)*80,elevation:rng()*6}};
 }
 const edgeChance=clamp((1-fit)*.85+(q<.5?(.5-q)*.9:0)+(loft?.1:0)-skill*.25,0,.8);
 if(fit<.97&&rng()<edgeChance){
  // Playing across the line to a straight one: inside edge onto the stumps.
  if(shot==='leg'&&lineName(ball.x)==='stumps'&&path.hitsStumps&&rng()<.45)return {...base,contact:'played-on'};
  if(q<.25&&path.hitsStumps)return {...base,contact:'miss'};
  return edgeShot(base,origin,ball,rng,q);
 }
 if(q<.18)return {...base,contact:'miss'};
 const Q=clamp(q*Math.min(fit,1.08)+skill*.08,0,1.12);
 const baseAngle={leg:-72,off:66,straight:0}[shot]+(shot==='straight'?clamp(ball.x*25,-12,12):0);
 let angle=baseAngle+clamp(errorMs,-110,110)*.34+gauss(rng)*7;
 // Sweet timing on the ground is placement: the ball is steered into the nearest gap.
 if(!loft&&fielders&&q>.55)angle=findGap(angle,q>.85?18:9,fielders);
 const launch=loft
  ?{...origin,speed:10+19*Q+rng()*1.2,angle,elevation:q<.6?44+rng()*16:30+rng()*9}
  :{...origin,speed:10+26*Q+rng()*2,angle,elevation:q<.45?7+rng()*9:-6+rng()*6+(ball.h>1.1?5:0)};
 return {...base,contact:q>.82&&fit>=.95?'middle':'hit',quality:Q,launch};
}
function edgeShot(base,origin,ball,rng,q){
 const outside=ball.x>-.05;
 const angle=(outside?1:-1)*(150+rng()*25)+(rng()-.5)*10;
 return {...base,contact:'edge',launch:{...origin,speed:8+rng()*16*(1.1-q*.3),angle,elevation:4+rng()*18}};
}

export function findGap(angle,range,fielders){
 let best=angle,bestScore=-1;
 for(let a=angle-range;a<=angle+range;a+=1.5){
  let score=99;for(const f of fielders){const d=Math.hypot(f.x,f.y-CONTACT_Y);if(d<6||d>55)continue;const fa=Math.atan2(f.x,f.y-CONTACT_Y)*180/Math.PI;let diff=Math.abs(((a-fa+540)%360)-180);score=Math.min(score,diff*(1+d/40))}
  score-=Math.abs(a-angle)*.15;if(score>bestScore){bestScore=score;best=a}
 }
 return best;
}

// Standard club fields for a right-hander. Deeper sets at higher strength.
const FIELDS=[
 [['Wicketkeeper',0,-13],['Slip',4,-14],['Point',21,2],['Cover',22,17],['Mid-off',10,32],['Mid-on',-10,32],['Midwicket',-22,17],['Square leg',-23,1],['Fine leg',-26,-30]],
 [['Wicketkeeper',0,-13],['Slip',4,-14],['Deep point',46,4],['Cover',22,17],['Long-off',18,64],['Mid-on',-10,32],['Deep midwicket',-42,38],['Square leg',-23,1],['Fine leg',-38,-36]],
 [['Wicketkeeper',0,-13],['Backward point',19,-6],['Deep cover',42,38],['Extra cover',16,26],['Long-off',16,66],['Long-on',-16,66],['Deep midwicket',-44,36],['Deep square',-50,0],['Short fine',-14,-18]],
];
export function makeField(strength=0,rng=Math.random){
 const s=clamp(strength,0,1),layout=FIELDS[s<.3?0:s<.66?(rng()<.5?0:1):(rng()<.5?1:2)];
 const bowler={name:'Bowler',x:1.4,y:16.5,speed:5,react:.5,catching:.75};
 return [...layout.map(([name,x,y])=>({name,x:x+gauss(rng)*1.5,y:y+gauss(rng)*1.5,speed:6.1+s*1.5,react:.28-s*.08,catching:.8+s*.16})),bowler];
}

export const throwTime=p=>.45+Math.min(Math.hypot(p.x,p.y),Math.hypot(p.x,p.y-PITCH))/27;

// Simulate the ball off the bat, all fielders chasing, and the batters' running.
export function simulateHit({launch,fielders,runnerSpeed=1,rng=Math.random,dt=1/60}){
 const rad=launch.angle*Math.PI/180,el=launch.elevation*Math.PI/180;
 let x=launch.x,y=launch.y,h=launch.h,vg=launch.speed*Math.cos(el),vh=launch.speed*Math.sin(el);
 const dx=Math.sin(rad),dy=Math.cos(rad),samples=[];let bounced=false,t=0,boundary=null;
 while(t<9){
  samples.push({t,x,y,h,bounced,v:vg});
  if(!insideBoundary(x,y)){boundary=bounced?4:6;break}
  if(vg<.3&&h<=0)break;
  x+=dx*vg*dt;y+=dy*vg*dt;
  if(h>0||vh>0){vh-=G*dt;h+=vh*dt;vg*=1-.05*dt;if(h<=0){h=0;bounced=true;if(-vh>2.2){vh=-vh*.32;vg*=.72}else vh=0}}
  else vg=Math.max(0,vg-(2.1+.07*vg)*dt);
  t+=dt;
 }
 // The earliest fielder who can get to the ball, below head height, wins it.
 let best=null;
 for(const f of fielders){
  for(const p of samples){
   if(p.t<.08)continue;const reach=p.h<2.5?(p.h>.3?1.6:p.v>24?.8:1.1):0;if(!reach)continue;
   const run=Math.max(0,Math.hypot(p.x-f.x,p.y-f.y)-reach),time=f.react+run/f.speed;
   if(time<=p.t){if(!best||p.t<best.t)best={f,t:p.t,x:p.x,y:p.y,h:p.h,aerial:!p.bounced&&p.h>.3,margin:p.t-time};break}
  }
 }
 const end=samples.at(-1);
 const runTime=n=>n<=0?0:(RUN_FIRST+(n-1)*RUN_NEXT)/runnerSpeed;
 const runsFor=avail=>{let n=0;while(n<3&&runTime(n+1)+.35<=avail)n++;return n};
 if(best&&(!boundary||best.t<end.t)){
  const truncated=samples.filter(p=>p.t<=best.t);
  if(best.aerial){
   // Hard chances: on the run, very close to the bat, or rockets straight at the fielder.
   const fast=launch.speed>26&&best.t<.6;
   const chance=best.f.catching*(best.margin<.18?.62:best.margin<.45?.86:1)*(fast?.7:1)*(best.f.name==='Wicketkeeper'?1.04:1);
   if(rng()<Math.min(.97,chance))return {samples:truncated,fielder:best.f,catchAt:best,outcome:{runs:0,wicket:true,dismissal:'caught',fielder:best.f.name,margin:best.margin}};
   const avail=best.t+1.1+throwTime(best);
   return {samples:truncated,fielder:best.f,dropAt:best,outcome:{runs:runsFor(avail),wicket:false,dropped:best.f.name,collectTime:best.t+1.1}};
  }
  const avail=best.t+throwTime(best);
  return {samples:truncated,fielder:best.f,collectAt:best,outcome:{runs:runsFor(avail),wicket:false,fielder:best.f.name,collectTime:best.t}};
 }
 if(boundary)return {samples,boundary,outcome:{runs:boundary,wicket:false,boundary}};
 // Nobody got there: the ball stopped in the outfield and the nearest fielder jogs over.
 if(!fielders.length)return {samples,outcome:{runs:runsFor(end.t+2),wicket:false}};
 const near=fielders.reduce((a,f)=>Math.hypot(f.x-end.x,f.y-end.y)<Math.hypot(a.x-end.x,a.y-end.y)?f:a);
 const collect=Math.max(end.t,near.react+Math.hypot(near.x-end.x,near.y-end.y)/near.speed);
 return {samples,fielder:near,collectAt:{...end,t:collect,f:near},outcome:{runs:runsFor(collect+throwTime(end)),wicket:false,fielder:near.name,collectTime:collect}};
}

// Full ball resolution with no animation: used by tests and difficulty tuning.
export function resolveBall({delivery,shot=null,loft=false,errorMs=0,rating=70,fielders,rng=Math.random}){
 const path=deliveryPath(delivery);
 if(!shot){
  if(path.hitsStumps)return {path,outcome:{runs:0,wicket:true,dismissal:'bowled',left:true}};
  if(delivery.wide)return {path,outcome:{runs:1,wide:true,wicket:false}};
  return {path,outcome:{runs:0,wicket:false,left:true}};
 }
 const play=playShot({delivery,path,shot,loft,errorMs,rating,fielders,rng});
 if(play.contact==='miss'){
  if(path.hitsStumps)return {path,play,outcome:{runs:0,wicket:true,dismissal:'bowled'}};
  if(delivery.wide)return {path,play,outcome:{runs:1,wide:true,wicket:false,beaten:true}};
  return {path,play,outcome:{runs:0,wicket:false,beaten:true}};
 }
 if(play.contact==='played-on')return {path,play,outcome:{runs:0,wicket:true,dismissal:'played on'}};
 const sim=simulateHit({launch:play.launch,fielders,runnerSpeed:.9+rating/500,rng});
 return {path,play,sim,outcome:sim.outcome};
}

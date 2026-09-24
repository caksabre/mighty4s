// The arcade match: a full-screen batting game drawn on one canvas, with a DOM HUD on top.
// Two cameras share one world (see physics.js): a perspective batter-cam and a tilted overhead field-cam.
import {applyBall,overs} from './engine.js';
import {PITCH,BOUNDARY,CONTACT_Y,WINDOW,RUN_FIRST,RUN_NEXT,makeDelivery,deliveryPath,playShot,makeField,simulateHit,throwTime,lineName} from './physics.js';

const OVER_TYPES=['pace','pace','spin','pace','spin','pace'];
const REGION=a=>a<-120?'fine leg':a<-65?'square leg':a<-22?'midwicket':a<0?'long-on':a<22?'long-off':a<65?'cover':a<120?'point':'third man';
const lerp=(a,b,t)=>a+(b-a)*t,ease=t=>t<0?0:t>1?1:t*t*(3-2*t),mixPt=(a,b,t)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t)];
const hueOf=name=>[...name].reduce((h,ch)=>(h*31+ch.charCodeAt(0))%360,7);

// ---------- Sound: everything is synthesised, so the standalone file needs no audio assets.
export const sfx=(()=>{
 let ctx=null,master=null,noiseBuf=null,murmur=null,on=true;
 // Real crowd recordings (public domain / CC0, see assets/sfx/CREDITS.md). The build inlines them.
 const CLIP_URLS={six:'assets/sfx/six.mp3',wicket:'assets/sfx/wicket.mp3',ooh:'assets/sfx/ooh.mp3',bed:'assets/sfx/bed.mp3'},clips={};
 function loadClips(){for(const [k,u] of Object.entries(CLIP_URLS))fetch(u).then(r=>r.arrayBuffer()).then(b=>ctx&&ctx.decodeAudioData(b)).then(buf=>{if(!buf)return;clips[k]=buf;if(k==='bed')startBed()}).catch(()=>{})}
 function startBed(){if(!ctx||!clips.bed)return;const s=ctx.createBufferSource();s.buffer=clips.bed;s.loop=true;const g=ctx.createGain();g.gain.value=.22;s.connect(g);g.connect(master);s.start();if(murmur)murmur.gain.value=0}
 // Plays a clip; falls back to the synthesised version until clips have loaded.
 function clip(name,{gain=1,cut=0,delay=0}={}){if(!ctx||!clips[name])return false;const t=ctx.currentTime+delay,s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=clips[name];g.gain.setValueAtTime(gain,t);if(cut){g.gain.setValueAtTime(gain,t+cut*.6);g.gain.exponentialRampToValueAtTime(.0001,t+cut)}s.connect(g);g.connect(master);s.start(t);return true}
 function init(){if(ctx||!on)return;try{ctx=new (window.AudioContext||window.webkitAudioContext)();master=ctx.createGain();master.gain.value=.9;master.connect(ctx.destination);
  noiseBuf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const d=noiseBuf.getChannelData(0);let b=0;for(let i=0;i<d.length;i++){const w=Math.random()*2-1;b=(b+.02*w)/1.02;d[i]=w*.6+b*3}
  const src=ctx.createBufferSource();src.buffer=noiseBuf;src.loop=true;const f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=520;f.Q.value=.6;murmur=ctx.createGain();murmur.gain.value=.018;src.connect(f);f.connect(murmur);murmur.connect(master);src.start();loadClips()}catch{ctx=null}}
 function burst(dur,{type='bandpass',freq=1000,q=1,gain=.3,attack=.004,sweep=0,delay=0}={}){if(!ctx)return;const t=ctx.currentTime+delay,s=ctx.createBufferSource();s.buffer=noiseBuf;const f=ctx.createBiquadFilter();f.type=type;f.frequency.setValueAtTime(freq,t);if(sweep)f.frequency.exponentialRampToValueAtTime(freq*sweep,t+dur);f.Q.value=q;const g=ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+attack);g.gain.exponentialRampToValueAtTime(.0001,t+dur);s.connect(f);f.connect(g);g.connect(master);s.start(t,Math.random()*1.5);s.stop(t+dur+.05)}
 function tone(freq,dur,{gain=.2,type='sine',slide=1,delay=0}={}){if(!ctx)return;const t=ctx.currentTime+delay,o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);if(slide!==1)o.frequency.exponentialRampToValueAtTime(freq*slide,t+dur);g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g);g.connect(master);o.start(t);o.stop(t+dur+.02)}
 return {
  init,get on(){return on},get loaded(){return Object.keys(clips)},set(v){on=v;if(!v&&ctx){ctx.close();ctx=null}else init()},
  bat(q=1){burst(.05,{type:'highpass',freq:1800,gain:.5*q+.15});tone(1250,.09,{gain:.25*q+.08,type:'triangle',slide:.6});tone(420,.07,{gain:.12,slide:.5})},
  edge(){tone(1900,.05,{gain:.12,type:'square',slide:.7});burst(.03,{freq:3000,gain:.12})},
  bounce(){burst(.05,{type:'lowpass',freq:420,gain:.22})},
  step(){burst(.04,{type:'lowpass',freq:260,gain:.08})},
  stumps(){for(let i=0;i<4;i++){burst(.06,{freq:2200-i*300,q:3,gain:.35,delay:i*.035});tone(700-i*90,.12,{gain:.1,type:'square',delay:i*.035,slide:.6})}},
  // Six: the full cheer. Four: a shorter, quieter one. Singles: a ripple of applause.
  cheer(level=1){if(clip('six',{gain:level>=2?1:level>=1?.55:.22,cut:level>=2?0:level>=1?1.9:1.1}))return;burst(1.2+level,{freq:900,q:.5,gain:.2*level,attack:.18,sweep:1.3});burst(1+level*.8,{freq:2100,q:.8,gain:.08*level,attack:.25});if(level>1.2)for(let i=0;i<6;i++)burst(.05,{type:'highpass',freq:3000,gain:.06,delay:.2+i*.09+Math.random()*.05})},
  wicket(delay=0){if(clip('wicket',{delay}))return;this.cheer(1.6)},
  ooh(){if(clip('ooh',{gain:.9}))return;burst(.9,{freq:380,q:1.8,gain:.16,attack:.12,sweep:1.8})},
  groan(){burst(1,{freq:600,q:1.4,gain:.12,attack:.1,sweep:.55})},
  click(){tone(880,.05,{gain:.07,type:'triangle'})},
  win(){[523,659,784,1047].forEach((f,i)=>tone(f,.35,{gain:.12,type:'triangle',delay:i*.12}));this.cheer(2)},
 };
})();

// ---------- Drawing primitives shared by both cameras.
export function makePen(c){
 const line=(pts,col,w)=>{c.strokeStyle=col;c.lineWidth=w;c.lineCap='round';c.lineJoin='round';c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke()};
 const poly=(pts,col,stroke,w=1)=>{c.fillStyle=col;c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=w;c.stroke()}};
 const dot=(x,y,r,col)=>{c.fillStyle=col;c.beginPath();c.arc(x,y,Math.max(.5,r),0,Math.PI*2);c.fill()};
 const oval=(x,y,rx,ry,col)=>{c.fillStyle=col;c.beginPath();c.ellipse(x,y,Math.max(.5,rx),Math.max(.5,ry),0,0,Math.PI*2);c.fill()};
 const text=(t,x,y,size,col,align='center',weight=800)=>{c.font=`${weight} ${size}px "Arial Black",Arial,sans-serif`;c.textAlign=align;c.fillStyle=col;c.fillText(t,x,y)};
 return {c,line,poly,dot,oval,text};
}

// A stick cricketer. (X,Y) is the feet on screen, sc is pixels per metre.
function drawFigure(P,X,Y,sc,{pose='ready',t=0,kit='#f6f3e6',cap='#1d5a45',skin='#e0aa7c',facing=0}={}){
 const J={hip:[0,.86],neck:[0,1.42],head:[0,1.62],lk:[-.14,.45],lf:[-.2,0],rk:[.14,.45],rf:[.2,0],le:[-.26,1.12],lh:[-.28,.84],re:[.26,1.12],rh:[.28,.84]};
 if(pose==='ready'){const b=Math.sin(t*3)*.015;J.hip=[0,.74+b];J.neck=[0,1.28+b];J.head=[0,1.48+b];J.lk=[-.24,.4];J.rk=[.24,.4];J.lf=[-.28,0];J.rf=[.28,0];J.le=[-.3,.98];J.lh=[-.2,.72];J.re=[.3,.98];J.rh=[.2,.72]}
 if(pose==='run'){const s=Math.sin(t),k=Math.cos(t);J.hip=[0,.88+Math.abs(k)*.05];J.neck=[facing*.08,1.44];J.head=[facing*.1,1.64];J.lk=[-.12+facing*s*.2,.5+s*.12];J.lf=[-.14+facing*s*.35,Math.max(0,s*.22)];J.rk=[.12-facing*s*.2,.5-s*.12];J.rf=[.14-facing*s*.35,Math.max(0,-s*.22)];J.le=[-.3,1.12-s*.1];J.lh=[-.3+facing*s*.2,.92-s*.2];J.re=[.3,1.12+s*.1];J.rh=[.3-facing*s*.2,.92+s*.2]}
 if(pose==='bowl'){const p=Math.min(1,t);const a=-Math.PI/2+p*Math.PI*1.4;J.re=[.1+Math.cos(a)*.3,1.42-Math.sin(a)*.3];J.rh=[.1+Math.cos(a)*.62,1.42-Math.sin(a)*.62];J.le=[-.34,1.3];J.lh=[-.42,1.05+p*.2];J.lk=[-.1,.5];J.lf=[-.16,0];J.rk=[.2,.36];J.rf=[.34,.14]}
 if(pose==='arms-up'){J.le=[-.3,1.72];J.lh=[-.36,2.05];J.re=[.3,1.72];J.rh=[.36,2.05]}
 if(pose==='catch'){J.le=[-.25,1.45];J.lh=[-.08,1.62];J.re=[.25,1.45];J.rh=[.08,1.62];J.hip=[0,.8];J.lk=[-.22,.4];J.rk=[.22,.4]}
 if(pose==='throw'){J.re=[.28,1.55];J.rh=[.5,1.9];J.le=[-.34,1.3];J.lh=[-.55,1.4]}
 const S=([x,y])=>[X+x*sc,Y-y*sc],w=m=>Math.max(1.2,m*sc);
 P.oval(X,Y+sc*.02,sc*.38,sc*.1,'#0d2b1c40');
 const outline='#163630';
 const limb=(a,b,cc,ww,col)=>{P.line([S(a),S(b),S(cc)],outline,w(ww)+2);P.line([S(a),S(b),S(cc)],col,w(ww))};
 limb(J.hip,J.lk,J.lf,.13,kit);limb(J.hip,J.rk,J.rf,.13,kit);
 P.line([S(J.hip),S(J.neck)],outline,w(.3)+2);P.line([S(J.hip),S(J.neck)],kit,w(.3));
 limb(J.neck,J.le,J.lh,.085,kit);limb(J.neck,J.re,J.rh,.085,kit);
 P.dot(...S(J.lh),w(.06),skin);P.dot(...S(J.rh),w(.06),skin);
 const [hx,hy]=S(J.head);P.dot(hx,hy,w(.14)+1,outline);P.dot(hx,hy,w(.14),skin);
 P.c.fillStyle=cap;P.c.beginPath();P.c.arc(hx,hy-w(.02),w(.15),Math.PI,Math.PI*2);P.c.fill();P.line([[hx-w(.15),hy-w(.02)],[hx+w(.15)+(facing||.5)*w(.12),hy-w(.02)]],cap,w(.04));
}

// The striker: a right-hander seen from behind, facing the off side (screen right).
// Poses are keyed from Stick Cricket reference footage: still until the key press, a quick backlift,
// a big stride, and a long-held follow-through. Local metres, x = off side, y = up, origin at the feet.
// ff/fk front foot & knee (further from camera), bf/bk back foot & knee, ls/rs shoulders (square = wide),
// le/re elbows, hands = top hand on the handle, tip = toe of the bat.
const BASE={shift:[0,0],ff:[.12,.06],fk:[.15,.5],bf:[-.12,0],bk:[-.07,.48],hip:[0,.93],chest:[.08,1.38],head:[.18,1.6],ls:[.15,1.42],rs:[-.03,1.4],le:[.17,1.12],re:[.03,1.1],hands:[.13,.88],tip:[.16,.03]};
const pose=o=>({...BASE,...o});
const BAT_POSES={
 stance:BASE,
 trigger:pose({hands:[.14,.95],tip:[.02,.13],le:[.17,1.17],re:[.03,1.14]}),
 backlift:pose({hip:[-.02,.94],chest:[.04,1.4],head:[.15,1.62],hands:[.18,1.3],tip:[-.42,1.9],le:[.22,1.22],re:[.05,1.2]}),
 // ↑ Front-foot straight drive: long stride, bat through vertical, finish high over the left shoulder.
 'straight-contact':pose({shift:[.05,.14],ff:[.18,.32],fk:[.24,.7],bf:[-.14,0],bk:[-.05,.44],hip:[.06,.95],chest:[.16,1.38],head:[.24,1.58],ls:[.22,1.42],rs:[.04,1.38],le:[.26,1.1],re:[.08,1.05],hands:[.2,.86],tip:[.34,.02]}),
 'straight-finish':pose({shift:[.06,.16],ff:[.18,.32],fk:[.2,.72],bf:[-.1,.06],bk:[-.02,.5],hip:[.04,1.0],chest:[.04,1.46],head:[.1,1.68],ls:[.2,1.48],rs:[-.14,1.46],le:[.02,1.58],re:[-.2,1.52],hands:[-.14,1.72],tip:[.44,2.34]}),
 'straight-finish-loft':pose({shift:[.06,.16],ff:[.18,.32],fk:[.2,.72],bf:[-.1,.08],bk:[-.02,.52],hip:[.04,1.02],chest:[.02,1.48],head:[.08,1.7],ls:[.2,1.5],rs:[-.16,1.48],le:[.04,1.7],re:[-.18,1.66],hands:[-.1,1.86],tip:[.3,2.6]}),
 // → Cut / off drive: stride across, bat swings through flat to the off side, finishes up to the right.
 'off-down':pose({shift:[.08,.06],ff:[.26,.16],fk:[.3,.56],hip:[.06,.93],chest:[.16,1.38],head:[.25,1.58],ls:[.2,1.42],rs:[.04,1.4],le:[.3,1.12],re:[.16,1.08],hands:[.3,1.0],tip:[.5,.18]}),
 'off-contact':pose({shift:[.14,.08],ff:[.36,.2],fk:[.38,.6],bf:[-.12,0],bk:[0,.46],hip:[.1,.93],chest:[.22,1.36],head:[.3,1.56],ls:[.28,1.42],rs:[.06,1.38],le:[.36,1.2],re:[.28,1.14],hands:[.45,1.05],tip:[1.28,.85]}),
 'off-finish':pose({shift:[.14,.08],ff:[.36,.2],fk:[.4,.58],bf:[-.14,.02],bk:[-.02,.46],hip:[.08,.95],chest:[.14,1.4],head:[.2,1.62],ls:[.26,1.44],rs:[-.08,1.42],le:[.2,1.2],re:[.38,1.18],hands:[.32,1.32],tip:[.62,2.12]}),
 'off-finish-loft':pose({shift:[.14,.08],ff:[.36,.2],fk:[.4,.58],bf:[-.14,.04],bk:[-.02,.48],hip:[.08,.97],chest:[.12,1.42],head:[.18,1.64],ls:[.26,1.46],rs:[-.1,1.44],le:[.18,1.34],re:[.36,1.3],hands:[.3,1.46],tip:[.5,2.28]}),
 // ← Pull / hook: back and across, bat swings flat to leg, then wraps round the neck.
 'leg-contact':pose({shift:[.1,-.02],ff:[.04,.08],fk:[.04,.52],bf:[.08,-.03],bk:[.06,.46],hip:[.02,.95],chest:[.04,1.42],head:[.12,1.63],ls:[.14,1.44],rs:[-.06,1.42],le:[.14,1.26],re:[.04,1.2],hands:[.12,1.16],tip:[.62,1.24]}),
 'leg-through':pose({shift:[.12,-.03],ff:[.02,.08],fk:[.02,.52],bf:[.1,-.04],bk:[.08,.46],hip:[.02,.95],chest:[-.02,1.42],head:[.06,1.64],ls:[.12,1.44],rs:[-.12,1.42],le:[-.04,1.26],re:[-.14,1.22],hands:[-.18,1.22],tip:[-1.0,1.42]}),
 'leg-over':pose({shift:[.12,-.03],ff:[.02,.08],fk:[.02,.52],bf:[.1,-.04],bk:[.08,.46],hip:[.02,.96],chest:[-.02,1.44],head:[.04,1.66],ls:[.16,1.46],rs:[-.16,1.44],le:[-.02,1.5],re:[-.18,1.46],hands:[-.16,1.62],tip:[-.3,2.46]}),
 'leg-finish':pose({shift:[.12,-.03],ff:[.02,.08],fk:[.02,.52],bf:[.12,-.04],bk:[.1,.46],hip:[.02,.96],chest:[0,1.44],head:[.02,1.66],ls:[.16,1.46],rs:[-.16,1.44],le:[-.04,1.36],re:[-.22,1.36],hands:[-.2,1.52],tip:[.64,1.62]}),
 // ↓ Block: front foot forward, head over the ball, bat angled down in front of the pad.
 defend:pose({shift:[.05,.1],ff:[.28,.3],fk:[.33,.66],bf:[-.14,0],bk:[-.04,.44],hip:[.1,.9],chest:[.24,1.33],head:[.32,1.53],ls:[.28,1.37],rs:[.14,1.35],le:[.34,1.12],re:[.2,1.07],hands:[.28,.9],tip:[.42,.07]}),
 // Leaving: bat held high out of the way.
 leave:pose({ff:[.16,.14],fk:[.2,.54],hip:[0,.96],chest:[.04,1.44],head:[.14,1.66],ls:[.14,1.48],rs:[-.04,1.46],le:[.12,1.4],re:[-.08,1.36],hands:[0,1.62],tip:[-.4,2.37]}),
};
// Bat swings are arcs round the hands ('arc'); flat horizontal sweeps foreshorten, so they move in a line ('sweep').
const SWINGS={
 straight:[[0,'stance'],[.05,'backlift'],[.1,'straight-contact'],[.24,'straight-finish'],[.95,'straight-finish'],[1.3,'stance']],
 off:[[0,'stance'],[.05,'backlift'],[.08,'off-down'],[.1,'off-contact'],[.24,'off-finish'],[.95,'off-finish'],[1.3,'stance']],
 leg:[[0,'stance'],[.05,'backlift'],[.1,'leg-contact','sweep'],[.14,'leg-through','sweep'],[.19,'leg-over'],[.28,'leg-finish'],[.95,'leg-finish'],[1.3,'stance']],
 defend:[[0,'stance'],[.06,'trigger'],[.1,'defend'],[.8,'defend'],[1.1,'stance']],
 leave:[[0,'trigger'],[.15,'leave'],[.9,'leave'],[1.2,'stance']],
};
const CONTACT_T=.1; // seconds from the start of a swing to bat meeting ball
function blendPose(a,b,t,mode='arc'){
 const out={};for(const k in a)out[k]=mixPt(a[k],b[k],t);
 if(mode==='arc'){
  const va=[a.tip[0]-a.hands[0],a.tip[1]-a.hands[1]],vb=[b.tip[0]-b.hands[0],b.tip[1]-b.hands[1]];
  const aa=Math.atan2(va[1],va[0]),ab=Math.atan2(vb[1],vb[0]);let d=ab-aa;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;
  const ang=aa+d*t,len=lerp(Math.hypot(...va),Math.hypot(...vb),t);out.tip=[out.hands[0]+Math.cos(ang)*len,out.hands[1]+Math.sin(ang)*len];
 }
 return out;
}
function playTimeline(keys,u,loft){
 const name=n=>loft&&BAT_POSES[n+'-loft']?n+'-loft':n;
 if(u<=keys[0][0])return BAT_POSES[name(keys[0][1])];
 for(let i=0;i<keys.length-1;i++){const [t0,p0]=keys[i],[t1,p1,mode]=keys[i+1];if(u<t1){const q=(u-t0)/(t1-t0);return blendPose(BAT_POSES[name(p0)],BAT_POSES[name(p1)],t1-t0<.2?1-(1-q)*(1-q):ease(q),mode)}}
 return BAT_POSES[name(keys.at(-1)[1])];
}
export function batterPose(sw,now){
 // sw: {phase:'stance'|'ready'|'swing'|'leave', start, shot, loft}. The batter stays still until the key press.
 if(!sw||sw.phase==='stance')return BAT_POSES.stance;
 if(sw.phase==='ready'){const q=ease((now-sw.start)/.25);return blendPose(BAT_POSES.stance,BAT_POSES.trigger,q*(.6+.4*Math.sin(now*9)**2))}
 if(sw.phase==='leave')return playTimeline(SWINGS.leave,now-sw.start,false);
 const u=now-sw.start,p=playTimeline(SWINGS[sw.shot]||SWINGS.straight,u,sw.loft);
 if(!sw.aim)return p;
 const k=u<CONTACT_T?ease(u/CONTACT_T):Math.max(0,1-(u-CONTACT_T)/.14),[ax,ay]=sw.aim,out={...p};
 for(const [j,f] of [['hands',1],['tip',1],['le',.7],['re',.7],['ls',.25],['rs',.25],['chest',.2]])out[j]=[p[j][0]+ax*k*f,p[j][1]+ay*k*f];
 return out;
}
// Where a ball at world (x,y,h) appears in the striker's local frame, independent of screen width.
function ballInBatterFrame(ball,batterY=1){const db=batterY-CAM.z,d=Math.max(.35,ball.y-CAM.z);return [ball.x*db/d-BATTER_X,CAM.h-(CAM.h-ball.h)*db/d]}
function aimFor(shot,ball){
 const P=BAT_POSES[shot==='defend'?'defend':shot+'-contact'];if(!P)return null;
 const s=P.shift||[0,0],sweet=[P.hands[0]+(P.tip[0]-P.hands[0])*.62+s[0],P.hands[1]+(P.tip[1]-P.hands[1])*.62+s[1]];
 const [bx,by]=ballInBatterFrame(ball),dx=bx-sweet[0],dy=by-sweet[1],m=Math.hypot(dx,dy),cap=.7;
 return m>cap?[dx/m*cap,dy/m*cap]:[dx,dy];
}
export function drawBatter(P,X,Y,sc,pose,{helmet='#12483a',shirtName='',shirtNumber=''}={}){
 // Weight transfer: the body moves with the stride; knees go part of the way, feet are placed explicitly.
 const [sx,sy]=pose.shift||[0,0];pose={...pose};for(const k in pose){if(k==='shift'||k==='ff'||k==='bf')continue;const f=k==='fk'||k==='bk'?.5:1;pose[k]=[pose[k][0]+sx*f,pose[k][1]+sy*f]}
 pose.ff=[pose.ff[0]+sx*.6,pose.ff[1]];
 const S=([x,y])=>[X+x*sc,Y-y*sc],w=m=>Math.max(1.5,m*sc),ink='#152f2a',cream='#fbf8ec',shade='#dfe3d2',skin='#e0aa7c';
 const limb=(pts,ww,col)=>{P.line(pts.map(S),ink,w(ww)+3);P.line(pts.map(S),col,w(ww))};
 P.oval(X+w(.05),Y+w(.02),w(.5),w(.11),'#0d2b1c55');
 // Front leg (further away) first, then the back leg with its pad.
 limb([pose.hip,pose.fk,pose.ff],.15,shade);
 limb([[pose.hip[0]-.05,pose.hip[1]],pose.bk,pose.bf],.16,cream);
 for(const [k,f] of [[pose.fk,pose.ff],[pose.bk,pose.bf]]){const [kx,ky]=S(k),[fx,fy]=S(f);for(let i=1;i<4;i++){const q=i/4;P.line([[lerp(kx,fx,q)-w(.07),lerp(ky,fy,q)],[lerp(kx,fx,q)+w(.07),lerp(ky,fy,q)]],'#b9c3b2',Math.max(1,w(.015)))}}
 P.line([S([pose.ff[0]-.04,pose.ff[1]]),S([pose.ff[0]+.14,pose.ff[1]])],ink,w(.07));P.line([S([pose.bf[0]-.04,pose.bf[1]]),S([pose.bf[0]+.15,pose.bf[1]])],ink,w(.08));
 // Grip: bottom hand sits just below the top hand on the handle.
 const bv=[pose.tip[0]-pose.hands[0],pose.tip[1]-pose.hands[1]],bl=Math.hypot(...bv)||1,bu=[bv[0]/bl,bv[1]/bl],low=[pose.hands[0]+bu[0]*.1,pose.hands[1]+bu[1]*.1];
 // Front (left) arm is on the far side of the body.
 limb([pose.ls,pose.le,pose.hands],.085,shade);
 // Torso: a quad from hips to shoulders, so turning square to the bowler reads as broadening.
 const hw=.1,[l0,l1]=[[pose.hip[0]-hw,pose.hip[1]],[pose.hip[0]+hw,pose.hip[1]]];
 P.poly([S(l0),S(l1),S([Math.max(pose.ls[0],pose.rs[0])+.05,Math.max(pose.ls[1],pose.rs[1])]),S([Math.min(pose.ls[0],pose.rs[0])-.05,Math.min(pose.ls[1],pose.rs[1])])],cream,ink,2);
 P.line([S([pose.hip[0],pose.hip[1]+.02]),S([pose.chest[0],pose.chest[1]-.06])],'#e8eadc',w(.04));
 // Name and number on the back of the shirt: the camera is behind the striker, so this is what we see.
 if(shirtName||shirtNumber){
  const top=[(pose.ls[0]+pose.rs[0])/2,(pose.ls[1]+pose.rs[1])/2],span=Math.max(.16,Math.abs(pose.ls[0]-pose.rs[0])+.12)*sc*.92;
  const [cx,cy]=S(mixPt(top,pose.hip,.2)),c=P.c;c.save();c.textAlign='center';c.textBaseline='top';c.fillStyle='#12483a';
  let fs=Math.max(5,w(.075));c.font=`900 ${fs}px Arial,sans-serif`;const tw=c.measureText(shirtName).width;if(tw>span){fs*=span/tw;c.font=`900 ${fs}px Arial,sans-serif`}
  if(shirtName)c.fillText(shirtName,cx,cy);
  const ns=Math.max(8,w(.19));c.font=`900 ${ns}px "Arial Black",Arial,sans-serif`;c.lineWidth=Math.max(1,ns*.08);c.strokeStyle='#f2c85b';
  c.strokeText(String(shirtNumber),cx,cy+fs*1.1);c.fillText(String(shirtNumber),cx,cy+fs*1.1);c.restore();
 }
 // Bat.
 const [hx,hy]=S(pose.hands),[tx,ty]=S(pose.tip),vx=tx-hx,vy=ty-hy,n=Math.hypot(vx,vy)||1,ux=vx/n,uy=vy/n,px=-uy,py=ux;
 const bs=[hx+vx*.3,hy+vy*.3],bw=w(.055);
 P.line([[hx-ux*w(.08),hy-uy*w(.08)],bs],ink,w(.045)+3);P.line([[hx-ux*w(.08),hy-uy*w(.08)],bs],'#2b3f36',w(.045));
 P.poly([[bs[0]+px*bw*.8,bs[1]+py*bw*.8],[tx+px*bw,ty+py*bw],[tx-px*bw,ty-py*bw],[bs[0]-px*bw*.8,bs[1]-py*bw*.8]],'#e6c083',ink,2);
 P.line([[bs[0]+ux*4,bs[1]+uy*4],[tx-ux*4,ty-uy*4]],'#f7deaa',Math.max(1,bw*.45));
 // Back (right) arm, nearest the camera, and both gloves.
 limb([pose.rs,pose.re,low],.09,cream);
 for(const g of [pose.hands,low]){const [gx,gy]=S(g);P.dot(gx,gy,w(.065)+1.5,ink);P.dot(gx,gy,w(.065),'#fdfbf1')}
 // Neck and helmet: back of the head, peak and grille facing down the pitch.
 const [nx,ny]=S([lerp(pose.chest[0],pose.head[0],.6),lerp(pose.chest[1],pose.head[1],.6)]);P.dot(nx,ny,w(.06),skin);
 const [x0,y0]=S(pose.head);P.dot(x0,y0,w(.15)+2,ink);P.dot(x0,y0,w(.15),helmet);
 P.line([[x0+w(.04),y0+w(.02)],[x0+w(.21),y0+w(.03)]],helmet,w(.05));
 P.line([[x0+w(.1),y0+w(.06)],[x0+w(.14),y0+w(.16)]],'#9fb3ab',Math.max(1,w(.02)));
}

// ---------- Batter cam: a perspective view from behind the striker.
const CAM={z:-6.2,h:3.2,f:700,hz:150},BATTER_X=-.36;
function batProj(W,x,y,h){const d=Math.max(.35,y-CAM.z);return [W/2+CAM.f*x/d,CAM.hz+CAM.f*(CAM.h-h)/d,CAM.f/d]}

function drawBatScene(P,W,H,s){
 const c=P.c,pr=(x,y,h=0)=>batProj(W,x,y,h),t=s.time;
 // Sky, trees and the pavilion end.
 const sky=c.createLinearGradient(0,0,0,CAM.hz+30);sky.addColorStop(0,'#5fc2ec');sky.addColorStop(1,'#c9eef3');c.fillStyle=sky;c.fillRect(0,0,W,CAM.hz+40);
 P.oval(W*.82,40,70,70,'#fff7d044');P.dot(W*.82,40,22,'#fffbe3');
 for(let i=0;i<7;i++){const x=((i*260+t*6)%(W+300))-150,y=28+(i%3)*18;P.oval(x,y,56,13,'#ffffffb0');P.oval(x+30,y-8,34,15,'#ffffffb0')}
 for(let i=0;i<W/28+2;i++){const x=i*28-14,hh=36+((i*37)%5)*7;P.oval(x,CAM.hz-6-hh*.3,22,hh*.55,i%2?'#2d6f58':'#357a5f')}
 const [,byT]=pr(0,76,5.5),[,byB]=pr(0,76,0);
 // Stands left and right, sight-screen behind the bowler.
 for(const side of [-1,1]){for(let r=0;r<4;r++){const y0=byT+6+r*6;for(let i=0;i<W/2/9;i++){const x=W/2+side*(60+i*9);if(x<0||x>W)continue;P.dot(x,y0,2.6,['#f3c89a','#e7e3da','#c99468','#8a5a3c'][(i+r)%4]);c.fillStyle=['#e24a3b','#f2f0e6','#3a7cc8','#f0c44c','#2a8f63'][(i*7+r*3)%5];c.fillRect(x-2.6,y0+2.5,5.2,3.5)}}}
 c.fillStyle='#1d4f45';c.fillRect(0,byT+2,W/2-58,4);c.fillRect(W/2+58,byT+2,W,4);
 const [sx0,sy0]=pr(-5.5,76,5),[sx1,sy1]=pr(5.5,76,0);P.poly([[sx0,sy0],[sx1,sy0],[sx1,sy1],[sx0,sy1]],'#fbfbf5','#c9cfc2');
 // Boundary boards.
 const boardY=byB-2;c.fillStyle='#113f39';c.fillRect(0,boardY-9,W,11);
 const boards=['NORTH MIDDLESEX CC','MIGHTY4S.COM','MAY THE 4THS BE WITH YOU','FORTRESS WALTHAMSTOW'];
 for(let i=0,x=-((t*0)%1);x<W;i++,x+=210){if(Math.abs(x+95-W/2)<70)continue;P.text(boards[i%4],x+95,boardY-.5,8,i%2?'#f4d56d':'#e9f4ea')}
 // Outfield with mowing stripes that run with the pitch.
 const g=c.createLinearGradient(0,byB,0,H);g.addColorStop(0,'#4fae62');g.addColorStop(1,'#2f8f4f');c.fillStyle=g;c.fillRect(0,byB+2,W,H);
 for(let k=-12;k<12;k++){if(k%2)continue;const a=pr(k*4.5,74),b=pr(k*4.5+4.5,74),cc=pr(k*4.5+4.5,-5.9),d=pr(k*4.5,-5.9);P.poly([[a[0],a[1]],[b[0],b[1]],[cc[0],cc[1]],[d[0],d[1]]],'#ffffff0b')}
 // Inner circle.
 const ring=[];for(let a=0;a<=Math.PI*2+.01;a+=.05){const x=Math.cos(a)*27,y=10+Math.sin(a)*27;if(y>CAM.z+1.5)ring.push(pr(x,y));else{if(ring.length>1)P.line(ring.map(p=>[p[0],p[1]]),'#ffffff55',2);ring.length=0}}
 if(ring.length>1)P.line(ring.map(p=>[p[0],p[1]]),'#ffffff55',2);
 // Pitch, creases, rough and wear.
 const q=[pr(-1.52,23.6),pr(1.52,23.6),pr(1.52,-5.7),pr(-1.52,-5.7)];P.poly(q.map(p=>[p[0],p[1]]),'#d4bd86');
 const q2=[pr(-1.52,23.6),pr(1.52,23.6),pr(1.52,-5.7),pr(-1.52,-5.7)];c.strokeStyle='#b89c65';c.lineWidth=2;c.beginPath();q2.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();c.stroke();
 for(const [y0,y1] of [[.4,5.5],[15,19.7]]){const a=[pr(-.5,y1),pr(.5,y1),pr(.5,y0),pr(-.5,y0)];P.poly(a.map(p=>[p[0],p[1]]),'#c6aa70aa')}
 const crease=(y,half,col='#fffbe8',w=2)=>{const a=pr(-half,y),b=pr(half,y);P.line([[a[0],a[1]],[b[0],b[1]]],col,Math.max(1.4,w*a[2]/40))};
 crease(1.22,1.9);crease(0,1.32);crease(PITCH-1.22,1.9);crease(PITCH,1.32);
 for(const x of [-1.32,1.32]){const a=pr(x,-1.2),b=pr(x,1.22),cc=pr(x,PITCH-1.22),d=pr(x,PITCH+1.2);P.line([[a[0],a[1]],[b[0],b[1]]],'#fffbe8',2.5);P.line([[cc[0],cc[1]],[d[0],d[1]]],'#fffbe8',1.2)}
 // Bounce mark for this delivery.
 if(s.bounceMark){const [bx,by,bs]=pr(s.bounceMark.x,s.bounceMark.y),age=t-s.bounceMark.t;P.oval(bx,by,bs*.14,bs*.05,'#8b6b3a66');if(age<.5)c.strokeStyle=`rgba(255,255,255,${.6*(1-age/.5)})`,c.lineWidth=2,c.beginPath(),c.ellipse(bx,by,bs*(.1+age*.5),bs*(.03+age*.15),0,0,Math.PI*2),c.stroke()}
 // Depth-sorted actors, far to near.
 const actors=[];
 for(const f of s.fielders||[]){if(f.y<3||f.name==='Bowler')continue;actors.push({y:f.y,draw(){const [x,y,k]=pr(f.x,f.y);drawFigure(P,x,y,k,{pose:s.celebrate?'arms-up':'ready',t:t+f.x,cap:s.oppCap})}})}
 actors.push({y:PITCH+2,draw(){const [x,y,k]=pr(-1.2,PITCH+1.8);drawFigure(P,x,y,k,{pose:'ready',t,kit:'#f2efe4',cap:'#fbfbf5'})}});
 actors.push({y:PITCH+.8,draw(){const [x,y,k]=pr(1.25,PITCH+.8);drawFigure(P,x,y,k,{pose:'ready',t:t*.6,cap:'#12483a'})}});
 actors.push({y:PITCH,draw(){drawStumpsP(P,pr,PITCH,null)}});
 if(s.bowler){const b=s.bowler;actors.push({y:b.y,draw(){const [x,y,k]=pr(b.x,b.y);drawFigure(P,x,y,k,{pose:b.pose,t:b.anim,cap:s.oppCap,facing:0})}})}
 const ball=s.ballPos;
 // The ball always draws in front of the striker so it is never lost behind the body.
 if(ball&&ball.y>CAM.z+.8)actors.push({y:ball.y>0?.5:ball.y,draw(){const [x,y,k]=pr(ball.x,ball.y,0),[bx,by]=pr(ball.x,ball.y,ball.h);const r=Math.max(2.6,k*.085);P.oval(x,y,r*1.1,r*.45,'#0c2a1a66');if(s.trail)for(const [i,p] of s.trail.entries()){const [tx,ty,tk]=pr(p.x,p.y,p.h);P.dot(tx,ty,Math.max(1.5,tk*.07)*(i/s.trail.length),`rgba(255,240,220,${.25*i/s.trail.length})`)}P.dot(bx,by,r+1.2,'#5a0f1c');P.dot(bx,by,r,'#c3243a');P.dot(bx-r*.3,by-r*.3,r*.35,'#ffb3a8')}});
 actors.push({y:1.0,draw(){const [x,y,k]=pr(BATTER_X,1.0);drawBatter(P,x,y,k,s.batPose,{shirtName:s.shirtName,shirtNumber:s.shirtNumber})}});
 actors.push({y:0,draw(){drawStumpsP(P,pr,0,s.stumps)}});
 actors.sort((a,b)=>b.y-a.y).forEach(a=>a.draw());
}
function drawStumpsP(P,pr,y,broken){
 const xs=[-.114,0,.114];
 if(!broken){for(const x of xs){const [a,b]=[pr(x,y,0),pr(x,y,.71)];P.line([[a[0],a[1]],[b[0],b[1]]],'#3b2a18',Math.max(2,a[2]*.05)+1.5);P.line([[a[0],a[1]],[b[0],b[1]]],'#f6e7c0',Math.max(1.4,a[2]*.05))}
  const [l,r]=[pr(-.12,y,.72),pr(.12,y,.72)];P.line([[l[0],l[1]],[r[0],r[1]]],'#f1d27a',Math.max(1.5,l[2]*.03));return}
 for(const p of broken.parts){const [ax,ay,k]=pr(p.x,p.y,p.h),len=p.len*k;P.line([[ax,ay],[ax+Math.sin(p.rot)*len,ay-Math.cos(p.rot)*len]],'#3b2a18',Math.max(2,k*.05)+1.5);P.line([[ax,ay],[ax+Math.sin(p.rot)*len,ay-Math.cos(p.rot)*len]],p.bail?'#f1d27a':'#f6e7c0',Math.max(1.4,k*.05))}
}
function breakStumps(y){return {y,parts:[...[-.114,0,.114].map((x,i)=>({x,y,h:0,len:.71,rot:0,vx:(i-1)*1.2+(Math.random()-.5),vy:-2-Math.random()*2,vh:1+Math.random()*1.5,vr:(i-1||.6)*(4+Math.random()*4)})),...[-.06,.06].map(x=>({bail:true,x,y,h:.72,len:.11,rot:Math.PI/2,vx:x*30,vy:-3-Math.random()*2,vh:3.5+Math.random()*2,vr:14+Math.random()*10}))]}}
function stepStumps(b,dt){for(const p of b.parts){if(p.h<=0&&p.vh<=0&&!p.bail&&Math.abs(p.rot)>1.4)continue;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vh-=9.8*dt;p.h+=p.vh*dt;p.rot+=p.vr*dt;if(p.h<0){p.h=0;p.vh*=-.3;p.vx*=.6;p.vy*=.6;p.vr*=.5;if(!p.bail)p.rot=Math.sign(p.rot||1)*Math.max(Math.abs(p.rot),1.45)}}}

// ---------- Field cam: a tilted overhead view that follows the ball.
function fieldProj(W,H,cam){const base=Math.min(H/(2*BOUNDARY.ry*.62+18),W/(2*BOUNDARY.rx+18))*cam.zoom;return (x,y,h=0)=>[W/2+(x-cam.x)*base,H*.54-(y-cam.y)*base*.62-h*base*.85,base]}
let crowdCache=null;
function drawFieldScene(P,W,H,s){
 const c=P.c,cam=s.cam,pr=fieldProj(W,H,cam),[cx,cy,k]=pr(BOUNDARY.cx,BOUNDARY.cy),rx=BOUNDARY.rx*k,ry=BOUNDARY.ry*k*.62;
 c.fillStyle='#1f4a37';c.fillRect(0,0,W,H);
 // Crowd ring and boards outside the rope.
 if(!crowdCache)crowdCache=Array.from({length:2600},(_,i)=>({a:Math.random()*Math.PI*2,r:1.12+Math.random()*.3,col:['#f2c79b','#e2dfd6','#e0493a','#3a7cc8','#f1c44b','#2a8f63','#fdfdfd'][i%7]}));
 P.oval(cx,cy,rx*1.5,ry*1.5,'#324a38');P.oval(cx,cy,rx*1.1,ry*1.1,'#113f39');
 for(const d of crowdCache){c.fillStyle=d.col;c.fillRect(cx+Math.cos(d.a)*rx*d.r,cy+Math.sin(d.a)*ry*d.r,Math.max(1.5,k*.42),Math.max(1.5,k*.42))}
 P.oval(cx,cy,rx*1.03,ry*1.03,'#113f39');
 // Grass, stripes, circle.
 c.save();c.beginPath();c.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);c.clip();
 const g=c.createRadialGradient(cx,cy,10,cx,cy,rx);g.addColorStop(0,'#5dbb6c');g.addColorStop(1,'#3d9c55');c.fillStyle=g;c.fillRect(0,0,W,H);
 for(let i=-14;i<14;i+=2){const [,y0]=pr(0,10+i*5),[,y1]=pr(0,10+i*5+5);c.fillStyle='#ffffff0d';c.fillRect(0,Math.min(y0,y1),W,Math.abs(y1-y0))}
 c.restore();
 c.setLineDash([6,6]);c.strokeStyle='#ffffff66';c.lineWidth=1.5;c.beginPath();c.ellipse(cx,cy,27*k,27*k*.62,0,0,Math.PI*2);c.stroke();c.setLineDash([]);
 c.strokeStyle='#fffdf2';c.lineWidth=Math.max(2,k*.35);c.beginPath();c.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);c.stroke();
 const pa=[pr(-1.52,-1.3),pr(1.52,-1.3),pr(1.52,PITCH+1.3),pr(-1.52,PITCH+1.3)];P.poly(pa.map(p=>[p[0],p[1]]),'#d4bd86','#b89c65');
 for(const y of [1.22,PITCH-1.22]){const a=pr(-1.6,y),b=pr(1.6,y);P.line([[a[0],a[1]],[b[0],b[1]]],'#fffbe8',1.5)}
 for(const y of [0,PITCH]){const a=pr(0,y),b=pr(0,y,.71);P.line([[a[0],a[1]],[b[0],b[1]]],'#f6e7c0',Math.max(2,k*.25))}
 // Landing spot while the ball is in the air.
 if(s.landing&&!s.landing.done){const [lx,ly]=pr(s.landing.x,s.landing.y),pulse=1+Math.sin(s.time*14)*.15;c.strokeStyle='#fff27a';c.lineWidth=2;c.beginPath();c.ellipse(lx,ly,k*1.8*pulse,k*1.1*pulse,0,0,Math.PI*2);c.stroke();P.line([[lx-k,ly],[lx+k,ly]],'#fff27a',2)}
 // Everyone, far to near.
 const actors=[];
 for(const f of s.fieldMen){actors.push({y:f.y,draw(){const [x,y,kk]=pr(f.x,f.y);drawFigure(P,x,y,kk*1.35,{pose:f.pose,t:f.anim,cap:s.oppCap,facing:f.facing||0});if(f.tag){P.text(f.tag,x,y-kk*3.2,12,'#fff6c4')}}})}
 for(const r of s.runners){actors.push({y:r.y,draw(){const [x,y,kk]=pr(r.x,r.y);drawFigure(P,x,y,kk*1.35,{pose:r.moving?'run':'ready',t:r.anim,cap:'#12483a',facing:r.dir})}})}
 const b=s.fball;
 if(b){actors.push({y:b.y,draw(){const [x,y,kk]=pr(b.x,b.y,0),[bx,by]=pr(b.x,b.y,b.h);P.oval(x,y,Math.max(2,kk*.45),Math.max(1,kk*.22),'#0b2a1966');
  for(const [i,p] of s.ftrail.entries()){const [tx,ty]=pr(p.x,p.y,p.h);P.dot(tx,ty,Math.max(1,kk*.25)*(i/s.ftrail.length),`rgba(255,255,255,${.5*i/s.ftrail.length})`)}
  const r=Math.max(3.5,kk*.42+b.h*.1);P.dot(bx,by,r+1.2,'#3a0a14');P.dot(bx,by,r,'#e0364c');P.dot(bx-r*.3,by-r*.3,r*.35,'#ffc9bf')}})}
 actors.sort((a,b)=>b.y-a.y).forEach(a=>a.draw());
 if(s.ropeFlash){const [x,y]=pr(s.ropeFlash.x,s.ropeFlash.y),age=s.time-s.ropeFlash.t;if(age<1.2){c.globalAlpha=1-age/1.2;P.text(s.ropeFlash.text,x,y-20-age*30,34,s.ropeFlash.text==='6'?'#ffe066':'#ffffff');c.globalAlpha=1}}
 if(W>600)P.text('FIELD CAM',18,H-18,11,'#e9f6ec','left');
}

// ---------- The game.
export function createGame(root,opts){
 const {match,fixture,totalFixtures,onResult,onNext,onRetry,onExit,onSoundChange,onTimingChange}=opts;
 let timingOffset=opts.timingOffset||0; // player's own calibration in ms: positive moves the sweet spot later
 const strength=fixture.strength,opp=match.opponent,oppCap=`hsl(${hueOf(opp)} 55% 38%)`;
 root.innerHTML=`<div class="g-root" tabindex="-1">
  <canvas class="g-canvas" aria-label="Batting view"></canvas>
  <div class="g-hud-top">
   <div class="g-score"><span class="g-crest">4</span><div><b id="g-runs">0/0</b><small id="g-overs">0.0 ov</small></div></div>
   <div class="g-target"><small>TARGET ${fixture.target}</small><b id="g-need"></b><small id="g-rrr"></small></div>
   <div class="g-overballs" id="g-overballs"></div>
   <div class="g-buttons"><button id="g-sound" aria-label="Toggle sound"></button><button id="g-pause" aria-label="Pause">II</button></div>
  </div>
  <div class="g-bowler" id="g-bowler"></div>
  <div class="g-batter" id="g-batter"></div>
  <div class="g-callout" id="g-callout" aria-live="polite"></div>
  <div class="g-comm" id="g-comm"></div>
  <div class="g-legend"><span><kbd>←</kbd>Pull</span><span><kbd>↑</kbd>Drive</span><span><kbd>→</kbd>Cut</span><span><kbd>↓</kbd>Block</span><span class="g-loft-key"><kbd>Shift</kbd>+ arrow = go aerial</span><span><kbd>P</kbd>Pause</span></div>
  <div class="g-touch"><button data-loft class="g-loft">LOFT<small>off</small></button><button data-shot="leg">←</button><button data-shot="straight">↑</button><button data-shot="off">→</button><button data-shot="defend">↓</button></div>
  <div class="g-card" id="g-card" hidden></div>
 </div>`;
 const el=id=>root.querySelector('#'+id),canvas=root.querySelector('canvas'),ctx=canvas.getContext('2d'),P=makePen(ctx);
 const G={phase:'intro',time:0,timer:0,ball:null,fielders:makeField(strength),bowler:null,stumps:null,bounceMark:null,trail:[],shake:0,confetti:[],field:null,touchLoft:false,paused:false,wagon:[],overRuns:0,lastFrame:performance.now(),raf:0,ended:false};
 const inn=()=>match.innings[1],striker=()=>match.xi[inn().striker],need=()=>fixture.target-inn().runs,left=()=>match.limit-inn().balls;
 const shirtName=()=>{const p=match.xi[G.outIndex??inn().striker];return p?p.name.split(' ').slice(-1)[0].toUpperCase():''};
 const overType=()=>OVER_TYPES[Math.floor(inn().balls/6)%OVER_TYPES.length];

 function hud(){
  const i=inn();el('g-runs').textContent=`${i.runs}/${i.wickets}`;el('g-overs').textContent=`${overs(i.balls)} / ${match.limit/6} ov`;
  el('g-need').textContent=need()>0?`Need ${need()} off ${left()}`:'Target reached!';
  el('g-rrr').textContent=need()>0&&left()>0?`Req. rate ${(need()/left()*6).toFixed(1)}`:'';
  const start=i.balls%6===0&&G.overJustEnded?i.balls-6:i.balls-i.balls%6;
  const balls=i.log.filter(b=>b.wide?b.ball>=start:b.ball>start);
  el('g-overballs').innerHTML=balls.slice(-8).map(b=>`<span class="${b.wicket?'w':b.runs>=6?'six':b.runs>=4?'four':b.wide?'wd':''}">${b.wicket?'W':b.wide?'wd':b.runs||'•'}</span>`).join('')+'<span class="g-e"></span>'.repeat(Math.max(0,6-balls.filter(b=>!b.wide).length));
  // After a wicket, keep showing the dismissed batter until the new one walks out.
  const si=G.outIndex??i.striker,p=match.xi[si],bi=i.batting[si],ns=match.xi[i.nonStriker],nb=i.batting[i.nonStriker];
  el('g-batter').innerHTML=`<b>${esc(p.name)}${p.nickname?` <i>“${esc(p.nickname)}”</i>`:''}</b><span>${bi.runs} <small>(${bi.balls})</small>${bi.out?' <small class="g-outtag">OUT</small>':''}</span><em>${esc(ns.name)} ${nb.runs} (${nb.balls})</em>`;
  const type=overType();el('g-bowler').innerHTML=`<small>${esc(opp.toUpperCase())}</small><b>${type==='spin'?'Spinner':'Seamer'}</b>${G.ball?`<span>${G.ball.d.kmh} km/h</span>`:''}`;
  el('g-sound').textContent=sfx.on?'♪':'×';el('g-sound').classList.toggle('off',!sfx.on);
 }
 const esc=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 function callout(big,sub='',cls=''){const e=el('g-callout');e.className='g-callout '+cls;e.innerHTML=`<b>${big}</b>${sub?`<span>${sub}</span>`:''}`;void e.offsetWidth;e.classList.add('show')}
 function clearCallout(){el('g-callout').className='g-callout'}
 function comm(text){const e=el('g-comm');e.textContent=text;e.classList.remove('show');void e.offsetWidth;e.classList.add('show')}
 function card(html){const e=el('g-card');e.innerHTML=html;e.hidden=false;e.querySelector('button')?.focus()}
 function hideCard(){el('g-card').hidden=true;root.querySelector('.g-root').focus()}

 // --- Flow
 function intro(){
  G.phase='intro';
  card(`<div class="g-eyebrow">Match ${fixture.index+1} of ${totalFixtures} · ${esc(opp)}</div><h2>${esc(opp)} made ${fixture.target-1}.</h2><p class="g-big">Chase <b>${fixture.target}</b> off <b>${match.limit/6} overs</b></p>
  <div class="g-howto"><div><kbd>←</kbd><b>Pull</b><small>short balls, leg side</small></div><div><kbd>↑</kbd><b>Drive</b><small>full balls, straight</small></div><div><kbd>→</kbd><b>Cut</b><small>wide of off stump</small></div><div><kbd>↓</kbd><b>Block</b><small>survive</small></div></div>
  <p class="g-tip">Hit as the ball arrives at the bat. <b>Early</b> sends it to leg, <b>late</b> to off.<br>Hold <kbd>Shift</kbd> (or tap LOFT) to go aerial: sixes, but you can be caught.<br>Don't press anything to leave it. Just don't leave one on the stumps.</p>
  <button class="g-go" id="g-start">Take guard →</button><button class="g-ghost" id="g-quit">Back to the clubhouse</button>`);
  el('g-start').onclick=begin;el('g-quit').onclick=()=>exit();
 }
 function begin(){sfx.init();hideCard();sfx.cheer(.5);newBatterCard(true)}
 function newBatterCard(first=false){
  G.outIndex=null;const p=striker();G.phase='card';G.timer=first?1.6:1.9;
  const c=el('g-callout');c.className='g-callout batter-in show';c.innerHTML=`<small>${first?'OPENING THE BATTING':'NEW BATTER'}</small><b>${esc(p.name)}</b><span>${p.nickname?`“${esc(p.nickname)}” · `:''}${p.matches?`${p.runs.toLocaleString()} career runs · HS ${p.hs}`:'Making their debut'}</span>`;
  hud();
 }
 function nextBall(){
  el('g-comm').classList.remove('show'); // never leave last ball's words over the bowler's run-up
  clearCallout();G.cheered=false;G.phase='runup';G.stumps=null;G.bounceMark=null;G.trail=[];G.field=null;G.overJustEnded=false;
  const type=overType();G.ball={d:makeDelivery({strength,type}),shot:null,swing:null,result:null};G.ball.path=deliveryPath(G.ball.d);
  G.runDur=type==='spin'?1.0:1.55-strength*.2;G.timer=0;G.swing={phase:'stance'};
  G.bowler={x:-.6,y:type==='spin'?27:36,pose:'run',anim:0};hud();
 }
 function release(){G.phase='live';G.ball.t0=G.time;G.swing={phase:'ready',start:G.time}}

 function playerShot(shot,loft,at){
  if(G.paused)return;
  if(G.phase==='intro'||G.phase==='end')return;
  if(G.phase==='card'||G.phase==='result'||G.phase==='gap'){if(G.phase!=='card'||G.timer<1.2)skip();return}
  if(G.phase!=='live'||G.ball.shot)return;
  const b=G.ball,t=at-b.t0,errorMs=(t-b.path.ideal)*1000-timingOffset;
  if(errorMs<-WINDOW.miss-120)return; // far too early: ignore, the ball is barely out of the hand
  b.shot=shot;b.loft=loft;
  b.play=playShot({delivery:b.d,path:b.path,shot,loft,errorMs,rating:striker().bat,fielders:G.fielders});
  G.swing={phase:'swing',start:at,shot,loft};
  if(b.play.launch){
   // Launch from wherever the ball actually is when bat meets it, so the hit is seamless on screen.
   b.contactAt=Math.max(at+CONTACT_T*.6,b.t0+b.path.ideal+timingOffset/1000-.02);G.swing.start=b.contactAt-CONTACT_T;const pos=b.path.at(b.contactAt-b.t0);G.swing.aim=aimFor(shot,pos);
   const launch={...b.play.launch,x:Math.max(-.6,Math.min(.9,pos.x)),y:Math.max(CONTACT_Y,pos.y),h:Math.max(.15,Math.min(1.6,pos.h))};
   b.sim=simulateHit({launch,fielders:G.fielders,runnerSpeed:.9+striker().bat/500});
  }
 }
 function skip(){if(G.phase==='card'||G.phase==='result'||G.phase==='gap')G.timer=Math.min(G.timer,.001)}

 // Called once the outcome is certain; updates the engine and the scorecard.
 function settle(o){
  const b=G.ball,p=striker(),nick=p.nickname||p.name.split(' ')[0],angle=b.play?.launch?.angle??0,reg=REGION(angle);
  let big,sub='',cls='',say,label;
  const timing=b.play?`${b.play.timing.toUpperCase()}${Math.abs(b.play.errorMs)>WINDOW.perfect?` ${b.play.errorMs>0?'+':''}${Math.round(b.play.errorMs)}ms`:''}`:'';
  if(o.wide){big='WIDE';sub='+1';say=`Wide called. ${opp} can't find the cut strip.`;label='Wide'}
  else if(o.wicket){
   cls='out';big='OUT!';
   if(o.dismissal==='caught'){sub=`CAUGHT · ${o.fielder}`;say=pickOne([`Caught at ${o.fielder.toLowerCase()}! ${p.name} has to go.`,`${nick} picks out ${o.fielder.toLowerCase()}. Gone!`,`Up in the air... and taken at ${o.fielder.toLowerCase()}.`]);if(o.fielder==='Wicketkeeper')sub='CAUGHT BEHIND',say=`Feathered through to the keeper. ${p.name} walks.`}
   else if(o.dismissal==='played on'){sub='PLAYED ON';say=`Dragged on! ${nick} tried to work it to leg.`}
   else{sub=o.left?'BOWLED · NO SHOT':'BOWLED';say=o.left?`Shouldered arms and lost the off pole. ${nick} can't believe it.`:pickOne([`Bowled him! Timber at the Stow.`,`Through the gate! Stumps everywhere.`,`Knocked over. ${nick} missed a straight one.`])}
   label=sub;
  }else if(o.runs===6){cls='six';big='SIX!';say=pickOne([`${nick} launches it over ${reg}! Into the trees!`,`That's out of the ground. Massive from ${p.name}.`,`Clean as you like. Over ${reg} for six.`,`Someone fetch the ball from the car park. SIX!`]);label='Six'}
  else if(o.runs===4){cls='four';big='FOUR!';say=pickOne([`${nick} threads it through ${reg}. Four!`,`Timed! Races away past ${reg}.`,`That's a Mighty Four. ${p.name} finds the rope.`]);label='Four'}
  else if(o.runs>0){big=`${o.runs} RUN${o.runs>1?'S':''}`;say=o.dropped?`Dropped at ${o.dropped.toLowerCase()}! ${nick} survives and they scamper ${o.runs}.`:pickOne([`Worked into the gap at ${reg}. ${o.runs===1?'Quick single.':'Good running.'}`,`${nick} finds ${reg} and they come back for ${o.runs}.`]);label=`${o.runs}`;if(o.dropped)sub='DROPPED!'}
  else{big=o.left?'LEFT':o.beaten?'BEATEN':b.play?.contact==='block'?'BLOCKED':'DOT';cls='dot';say=o.dropped?`Dropped by ${o.dropped.toLowerCase()}! Let off.`:o.left?`Left alone outside off. Good judgement.`:o.beaten?pickOne([`Played and missed! Lovely bit of ${b.d.type==='spin'?'turn':'movement'}.`,`Beaten all ends up.`]):b.play?.contact==='block'?`Solid defence from ${nick}.`:`Straight to ${String(o.fielder||'the fielder').toLowerCase()}. No run.`;label='Dot';if(o.dropped)sub='DROPPED!'}
  if(timing&&!o.wide&&!o.left)sub=sub?`${sub} · ${timing}`:timing;
  if(b.play?.launch&&!o.wide)G.wagon.push({angle,dist:o.runs>=4?60:(b.sim?.samples.at(-1)?Math.hypot(b.sim.samples.at(-1).x,b.sim.samples.at(-1).y):10),runs:o.runs,wicket:o.wicket});
  G.outIndex=o.wicket?inn().striker:null;
  applyBall(match,{runs:o.runs,wicket:!!o.wicket,wide:!!o.wide,dismissal:o.dismissal,label});
  callout(big,sub,cls);comm(say);
  // The fielding side and the crowd erupt for a wicket; boundaries cheer once (the field cam may already have).
  if(o.wicket){if(!G.cheered)sfx.wicket(o.dismissal==='caught'?0:.12);G.shake=.25;G.celebrate=G.time+2.2}
  else if(o.runs===6){if(!G.cheered)sfx.cheer(2.2);G.shake=.5;burstConfetti(80)}
  else if(o.runs===4){if(!G.cheered)sfx.cheer(1.4);G.shake=.2;burstConfetti(25)}
  else if(o.beaten)sfx.ooh();
  else if(o.runs>0)sfx.cheer(.5);
  G.phase='result';G.timer=o.runs>=6?2.4:o.wicket?2.2:o.runs>=4?2:1.4;G.lastWicket=!!o.wicket;
  if(!o.wide&&inn().balls%6===0&&match.stage!=='done'){G.overJustEnded=true;G.overEnded=true}else G.overEnded=false;
  hud();
 }
 const pickOne=a=>a[Math.floor(Math.random()*a.length)];
 function burstConfetti(n){const W=canvas.clientWidth;for(let i=0;i<n;i++)G.confetti.push({x:W/2+(Math.random()-.5)*W*.6,y:-10-Math.random()*80,vx:(Math.random()-.5)*160,vy:60+Math.random()*120,r:Math.random()*6,vr:(Math.random()-.5)*10,col:['#f2c85b','#fff4c7','#2a8f63','#e0493a','#ffffff'][i%5],life:2.5+Math.random()})}

 function afterResult(){
  clearCallout();
  if(match.stage==='done')return end();
  if(G.lastWicket)return newBatterCard();
  if(G.overEnded){
   const i=inn(),overNo=i.balls/6,runsThis=i.log.filter(b=>b.ball>i.balls-6||(b.wide&&b.ball>=i.balls-6)).reduce((s,b)=>s+b.runs,0);
   G.fielders=makeField(strength);G.phase='card';G.timer=1.8;
   const c=el('g-callout');c.className='g-callout batter-in show';c.innerHTML=`<small>END OF OVER ${overNo}</small><b>${runsThis} run${runsThis===1?'':'s'} from the over</b><span>Next: ${overType()==='spin'?'a spinner. Watch the turn.':'the seamer. Watch the swing.'} ${need()>0?`Need ${need()} off ${left()}.`:''}</span>`;
   return;
  }
  G.phase='gap';G.timer=.45;
 }
 function end(){
  G.phase='end';const win=match.winner==='fours';const info=onResult(match)||{};
  const i=inn(),rows=match.xi.map((p,k)=>({p,b:i.batting[k]})).filter(r=>r.b.entered);
  const top=rows.reduce((a,r)=>r.b.runs>(a?.b.runs??-1)?r:a,null);
  if(win){sfx.win();burstConfetti(160)}else sfx.groan();
  card(`<div class="g-eyebrow">${win?'Chase conquered':match.winner==='tie'?'A tie. So close.':'Target missed'}</div>
  <h2>${win?(info.complete?'The league is yours!':'That’s the Mighty 4s!'):'Have another crack.'}</h2>
  <p class="g-big">${i.runs}/${i.wickets} <small>(${overs(i.balls)} ov) · needed ${fixture.target}</small></p>
  <div class="g-end"><canvas id="g-wagon" width="220" height="220" aria-label="Wagon wheel"></canvas><table>${rows.map(r=>`<tr class="${r===top?'top':''}"><td>${esc(r.p.name)}${r.b.out?'':' *'}</td><td>${r.b.runs}</td><td><small>(${r.b.balls})</small></td></tr>`).join('')}${i.extras?`<tr><td>Extras</td><td>${i.extras}</td><td></td></tr>`:''}</table></div>
  ${top&&top.b.runs>0?`<p class="g-tip">Top scorer: <b>${esc(top.p.name)}</b> ${top.b.runs} off ${top.b.balls}${top.p.nickname?`. Take a bow, ${esc(top.p.nickname)}.`:'.'}</p>`:''}
  ${win&&!info.complete&&info.next?`<button class="g-go" id="g-next">Next: ${esc(info.next.opponent)} · chase ${info.next.target} →</button>`:`<button class="g-go" id="g-retry">${win?'Play the campaign again':'Retry this chase'} →</button>`}
  <button class="g-ghost" id="g-home">Back to the clubhouse</button>`);
  drawWagon(el('g-wagon'));
  el('g-next')?.addEventListener('click',()=>{destroy();onNext()});el('g-retry')?.addEventListener('click',()=>{destroy();onRetry()});el('g-home').onclick=()=>{destroy();onExit()};
 }
 function drawWagon(cv){const c=cv.getContext('2d'),P2=makePen(c);P2.oval(110,110,104,104,'#3d9c55');P2.oval(110,110,104,104,'#3d9c55');c.strokeStyle='#fff';c.lineWidth=2;c.beginPath();c.arc(110,110,104,0,Math.PI*2);c.stroke();P2.poly([[106,96],[114,96],[114,124],[106,124]],'#d4bd86');
  for(const w of G.wagon){const a=w.angle*Math.PI/180,r=Math.min(100,w.dist*1.6);P2.line([[110,120],[110+Math.sin(a)*r,120-Math.cos(a)*r]],w.wicket?'#e0493a':w.runs===6?'#ffe066':w.runs===4?'#ffffff':'#b8e6c4',w.runs>=4?2.5:1.5)}
  P2.text('WAGON WHEEL',110,214,9,'#e9f4ea')}

 function pause(v=!G.paused){
  if(G.phase==='end'||G.phase==='intro')return;G.paused=v;
  if(v){card(`<div class="g-eyebrow">Drinks break</div><h2>Paused.</h2><p class="g-tip">← Pull · ↑ Drive · → Cut · ↓ Block · Shift+arrow to loft<br>Leave a ball by not pressing anything.</p>
   <div class="g-calib"><span>Timing sweet spot</span><button id="g-earlier" aria-label="Earlier sweet spot">− Earlier</button><b id="g-offset"></b><button id="g-later" aria-label="Later sweet spot">Later +</button></div>
   <p class="g-tip g-calib-note">Always told you're early? Press Earlier. Always late? Press Later.</p>
   <button class="g-go" id="g-resume">Back to the middle →</button><button class="g-ghost" id="g-leave">Abandon this match</button>`);
   const show=()=>{el('g-offset').textContent=timingOffset===0?'Standard':`${timingOffset>0?'+':''}${timingOffset} ms`};show();
   const nudge=d=>{timingOffset=Math.max(-150,Math.min(150,timingOffset+d));show();sfx.click();onTimingChange?.(timingOffset)};
   el('g-earlier').onclick=()=>nudge(-20);el('g-later').onclick=()=>nudge(20);el('g-resume').onclick=()=>pause(false);el('g-leave').onclick=()=>exit()}
  else hideCard();
 }
 function exit(){destroy();onExit()}

 // --- Update
 function update(dt){
  G.time+=dt;const b=G.ball;
  for(const p of G.confetti){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=40*dt;p.vx*=.99;p.r+=p.vr*dt;p.life-=dt}G.confetti=G.confetti.filter(p=>p.life>0);
  G.shake=Math.max(0,G.shake-dt);
  if(G.stumps)stepStumps(G.stumps,dt);
  if(G.phase==='card'||G.phase==='result'||G.phase==='gap'){if((G.timer-=dt)<=0){if(G.phase==='result')afterResult();else nextBall()}}
  if(G.phase==='runup'){
   G.timer+=dt;const p=Math.min(1,G.timer/G.runDur),bw=G.bowler;const startY=overType()==='spin'?27:36;
   bw.y=lerp(startY,20.6,p);bw.anim+=dt*(overType()==='spin'?11:15);bw.pose='run';
   if(Math.floor(bw.anim/Math.PI)!==Math.floor((bw.anim-dt*15)/Math.PI))sfx.step();
   if(p>=1)release();
  }
  if(G.phase==='live'||G.phase==='post'){
   const t=G.time-b.t0,bw=G.bowler;bw.pose='bowl';bw.anim=Math.min(1,t*3);bw.y=Math.max(17.5,20.6-t*3.5);
   if(!b.bounced&&t>=b.path.bounceTime){b.bounced=true;G.bounceMark={x:b.path.at(b.path.bounceTime).x,y:b.d.bounceY,t:G.time};sfx.bounce()}
   // Contact: the ball leaves the bat and the batter-cam follows it briefly.
   if(b.sim&&G.time>=b.contactAt){startHit();return}
   G.ballPos=b.path.at(t);G.trail.push(G.ballPos);if(G.trail.length>7)G.trail.shift();
   if(!b.shot&&t>b.path.ideal-.03&&G.swing.phase==='ready'&&(!b.path.hitsStumps||b.d.wide||lineName(b.path.atBat.x)==='wide-off'))G.swing={phase:'leave',start:G.time};
   const playedOn=b.play?.contact==='played-on';
   if(!b.settled&&t>=b.path.stumps&&(b.path.hitsStumps||playedOn)&&(!b.play||b.play.contact==='miss'||playedOn)){
    b.settled=true;G.stumps=breakStumps(0);sfx.stumps();settle({runs:0,wicket:true,dismissal:playedOn?'played on':'bowled',left:!b.shot});G.phase='result';G.ballPos=null;return;
   }
   if(!b.settled&&t>b.path.stumps+.45){b.settled=true;G.ballPos=null;if(b.d.wide)settle({runs:1,wide:true,beaten:!!b.shot});else settle({runs:0,wicket:false,left:!b.shot,beaten:!!b.shot})}
  }
  if(G.phase==='hit'){
   const u=G.time-b.contactAt,s=sampleAt(b.sim.samples,u);G.ballPos=s;G.trail.push(s);if(G.trail.length>9)G.trail.shift();
   const quick=b.play.contact==='block'||(b.sim.samples.at(-1).t<.9&&!b.sim.boundary);
   if(u>(quick?Math.min(1.1,b.sim.samples.at(-1).t+.3):.42)){if(quick){b.settled=true;G.ballPos=null;settle(b.sim.outcome)}else startField(u)}
  }
  if(G.phase==='field')updateField(dt);
 }
 function startHit(){
  const b=G.ball;G.phase='hit';G.trail=[];
  const c=b.play.contact;if(c==='edge')sfx.edge();else sfx.bat(c==='middle'?1:c==='block'?.3:.65);
  if(c==='middle'&&b.loft)G.shake=.15;
 }
 function sampleAt(samples,t){if(t<=0)return samples[0];const i=Math.min(samples.length-1,Math.floor(t*60));return samples[i]}

 function startField(u0){
  const b=G.ball,sim=b.sim,o=sim.outcome;G.phase='field';
  const catcher=sim.catchAt||sim.dropAt,collect=sim.collectAt;
  const chaser=sim.fielder;
  G.field={t:u0,rate:1.15,end:0,catcher,collect,landing:null,ropeFlash:null,flashed:false,
   cam:{x:0,y:12,zoom:1},runs:o.runs,runStart:.35,
   men:G.fielders.map(f=>({ref:f,x:f.x,y:f.y,pose:'ready',anim:Math.random()*6,tag:''})),
   runners:[{x:-.5,y:1.2,from:1.2,dir:1,anim:0,moving:false},{x:.6,y:PITCH-1.2,from:PITCH-1.2,dir:-1,anim:0,moving:false}],
   trail:[],chaser};
  // Show where a skied ball will come down: the catch point, or its first bounce.
  const first=sim.samples.find(p=>p.bounced),aerial=b.play.launch.elevation>18;
  if(catcher)G.field.landing={x:catcher.x,y:catcher.y,done:false};
  else if(aerial&&first)G.field.landing={x:first.x,y:first.y,done:false};
  const lastT=sim.samples.at(-1).t;
  G.field.ballEnd=lastT;
  G.field.throwDur=collect?throwTime(collect):0;
  const runDone=o.runs>0&&!o.boundary?G.field.runStart+RUN_FIRST+(o.runs-1)*RUN_NEXT:0;
  G.field.end=o.boundary?lastT+1.0:sim.catchAt?lastT+1.3:Math.max(lastT+G.field.throwDur+.4,runDone+.3,(sim.dropAt?lastT+1.6:0));
 }
 function updateField(dt){
  const F=G.field,b=G.ball,sim=b.sim,o=sim.outcome;
  const settledBall=F.t>F.ballEnd;F.rate=settledBall?2.1:(F.t>1.4?1.35:1.1);F.t+=dt*F.rate;const t=F.t;
  // Ball position: flight samples, then a throw back to the stumps if fielded.
  let bp=sampleAt(sim.samples,t);
  if(t>F.ballEnd){const last=sim.samples.at(-1);
   if(sim.catchAt){bp={...last,h:1.4}}
   else if(sim.dropAt){const dd=Math.min(1,(t-F.ballEnd)/.4);bp={x:last.x+.8,y:last.y+.4,h:lerp(1.2,0,dd)};if(t>F.ballEnd+1.1)bp=throwPos(bp,t-F.ballEnd-1.1)}
   else if(F.collect){bp=throwPos(last,t-F.ballEnd)}
   else if(sim.collectAt){bp=throwPos(last,t-sim.collectAt.t)}
  }
  G.fball=bp;F.trail.push(bp);if(F.trail.length>14)F.trail.shift();
  if(F.landing&&t>=(sim.catchAt||sim.dropAt||{t:99}).t)F.landing.done=true;
  if(F.landing&&!sim.catchAt&&!sim.dropAt){const land=sim.samples.find(p=>p.bounced);if(land&&t>=land.t)F.landing.done=true}
  // Fielders: the chaser runs to the interception, everyone else drifts towards the ball.
  for(const m of F.men){
   const f=m.ref,isChaser=f===F.chaser;m.tag='';
   let tx=m.x,ty=m.y,spd=f.speed;
   if(isChaser){const target=sim.catchAt||sim.dropAt||sim.collectAt;if(target&&t>f.react){tx=target.x;ty=target.y}else if(t>f.react){tx=bp.x;ty=bp.y}m.tag=o.wicket&&t>=target?.t?'CAUGHT!':sim.dropAt&&t>=sim.dropAt.t&&t<sim.dropAt.t+1.5?'DROPPED!':''}
   else if(t>f.react+.2&&!o.boundary){tx=lerp(f.x,bp.x,.25);ty=lerp(f.y,bp.y,.25);spd*=.5}
   const dx=tx-m.x,dy=ty-m.y,dd=Math.hypot(dx,dy);
   if(dd>.15){const step=Math.min(dd,spd*dt*F.rate);m.x+=dx/dd*step;m.y+=dy/dd*step;m.pose='run';m.anim+=dt*F.rate*14;m.facing=Math.sign(dx)||0}
   else{m.pose=isChaser&&sim.catchAt&&t>=sim.catchAt.t?'arms-up':isChaser&&(sim.collectAt&&t>=sim.collectAt.t&&t<sim.collectAt.t+.5)?'throw':'ready';m.anim+=dt}
   if(isChaser&&sim.catchAt&&t>=sim.catchAt.t-.25&&t<sim.catchAt.t)m.pose='catch';
  }
  if(sim.catchAt){for(const m of F.men)if(m.ref!==F.chaser&&t>sim.catchAt.t+.2)m.pose='arms-up'}
  // Batters run their completed runs.
  const legs=o.boundary||o.wicket?0:o.runs;
  for(const [k,r] of F.runners.entries()){
   const u=t-F.runStart;if(u<0||legs===0){r.moving=o.boundary&&u>0&&u<1.2;if(r.moving){r.y=r.from+(k?-1:1)*Math.min(u,1.2)*2.5;r.anim+=dt*F.rate*12}continue}
   const legT=n=>n<=0?0:RUN_FIRST+(n-1)*RUN_NEXT,done=legT(Math.floor(legs));let pos,leg;
   if(u>=done&&Math.floor(legs)===legs){leg=legs;pos=0}
   else{leg=0;while(legT(leg+1)<=u)leg++;pos=(u-legT(leg))/(legT(leg+1)-legT(leg))}
   const a=k===0?1.2:PITCH-1.2,z=k===0?PITCH-1.2:1.2,evenLeg=leg%2===0;
   r.y=evenLeg?lerp(a,z,pos):lerp(z,a,pos);r.dir=(evenLeg?1:-1)*(k===0?1:-1);r.moving=pos>0&&pos<1&&u<done+.01;if(r.moving)r.anim+=dt*F.rate*13;r.x=k===0?-.5:.6;
   if(k===0&&leg>(F.shownRuns||0)&&leg<=legs&&!o.wicket){F.shownRuns=leg;callout(String(leg),leg===1?'RUN':'RUNS','runs');sfx.click()}
  }
  // Boundary flash when the rope is crossed.
  if(o.boundary&&!F.flashed&&t>=F.ballEnd){F.flashed=true;const last=sim.samples.at(-1);F.ropeFlash={x:last.x,y:last.y,text:String(o.boundary),t:G.time};G.cheered=true;if(o.boundary===6){G.shake=.4;sfx.cheer(2.2)}else sfx.cheer(1.4)}
  if(sim.catchAt&&!F.caughtCue&&t>=sim.catchAt.t){F.caughtCue=true;G.cheered=true;sfx.wicket()}
  if(sim.dropAt&&!F.dropCue&&t>=sim.dropAt.t){F.dropCue=true;sfx.ooh()}
  // Camera follows the ball, framed with the pitch.
  const cam=F.cam,wantX=bp.x*.55,wantY=10+(bp.y-10)*.55,wantZ=1.25+Math.min(.35,Math.hypot(bp.x,bp.y-10)/200);
  cam.x=lerp(cam.x,wantX,Math.min(1,dt*3));cam.y=lerp(cam.y,wantY,Math.min(1,dt*3));cam.zoom=lerp(cam.zoom,wantZ,Math.min(1,dt*2));
  if(t>=F.end){G.fball=null;G.ball.settled=true;settle(o)}
 }
 function throwPos(from,u){const to=Math.hypot(from.x,from.y)<Math.hypot(from.x,from.y-PITCH)?{x:0,y:0}:{x:0,y:PITCH},dur=throwTime(from)-.45,q=Math.min(1,Math.max(0,u-.25)/Math.max(.2,dur));return {x:lerp(from.x,to.x,q),y:lerp(from.y,to.y,q),h:1.2+Math.sin(q*Math.PI)*3*(dur>1?1:.3)}}

 // --- Draw
 function draw(){
  const w=canvas.clientWidth||innerWidth,h=canvas.clientHeight||innerHeight,dpr=Math.min(devicePixelRatio||1,2);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
  const H=720,S=h/H,W=w/S;ctx.setTransform(dpr*S,0,0,dpr*S,0,0);
  const sh=G.shake>0?G.shake*18:0;if(sh)ctx.translate((Math.random()-.5)*sh,(Math.random()-.5)*sh);
  if(G.phase==='field'&&G.field){const F=G.field;drawFieldScene(P,W,H,{cam:F.cam,time:G.time,fieldMen:F.men.map(m=>({...m})),runners:F.runners,fball:G.fball,ftrail:F.trail,landing:F.landing,ropeFlash:F.ropeFlash,oppCap})}
  else{
   const swingPose=batterPose(G.swing,G.time);
   drawBatScene(P,W,H,{time:G.time,phase:G.phase,fielders:G.fielders,bowler:G.phase==='intro'?{x:-.6,y:30,pose:'ready',anim:0}:G.bowler||{x:-.6,y:30,pose:'ready',anim:G.time},ballPos:(G.phase==='live'||G.phase==='post'||G.phase==='hit')?G.ballPos:null,trail:G.trail,batPose:swingPose,celebrate:G.celebrate>G.time,shirtName:shirtName(),shirtNumber:(G.outIndex??inn().striker)+1,stumps:G.stumps,bounceMark:G.bounceMark,oppCap});
   // Timing guide: the contact zone lights as the ball arrives.
   // It closes onto the contact point as the ball arrives, and fades out as the campaign gets harder.
   if(G.phase==='live'&&G.ball&&!G.ball.shot){const t=G.time-G.ball.t0,ideal=G.ball.path.ideal+timingOffset/1000,dd=ideal-t,help=1-strength*.75;if(dd<.5&&dd>-.08){const at=G.ball.path.at(ideal),[x,y,k]=batProj(W,at.x,at.y,at.h),q=Math.max(0,dd)/.5,r=k*(.1+q*.55),a=help*(dd<0?Math.max(0,1+dd/.08):.35+.65*(1-q)),hot=Math.abs(dd)<WINDOW.perfect/1000;ctx.strokeStyle=hot?`rgba(255,226,90,${a})`:`rgba(255,255,255,${a})`;ctx.lineWidth=hot?4:2.5;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke()}}
   if(G.phase!=='intro'&&W>600)P.text('BATTER CAM',18,H-18,11,'#e9f6ec','left');
  }
  ctx.setTransform(dpr*S,0,0,dpr*S,0,0);
  for(const p of G.confetti){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.r);ctx.fillStyle=p.col;ctx.globalAlpha=Math.min(1,p.life);ctx.fillRect(-4,-2,8,4);ctx.restore()}
 }

 function frame(now){
  const dt=Math.min(.05,(now-G.lastFrame)/1000);G.lastFrame=now;
  if(!G.paused)update(dt);draw();G.raf=requestAnimationFrame(frame);
 }
 // Precise input timing: the key's own timestamp, mapped onto the game clock.
 const clockAt=e=>G.time+Math.max(-.05,Math.min(.05,((e?.timeStamp??performance.now())-G.lastFrame)/1000));
 function onKey(e){
  if(G.ended)return;
  if(e.target.closest?.('input,select,textarea'))return;
  const k=e.key;
  if(k==='p'||k==='P'||k==='Escape'){e.preventDefault();if(G.phase==='intro'&&k==='Escape')return exit();pause();return}
  if(G.paused)return;
  const map={ArrowLeft:'leg',ArrowUp:'straight',ArrowRight:'off',ArrowDown:'defend',a:'leg',w:'straight',d:'off',s:'defend',A:'leg',W:'straight',D:'off',S:'defend'};
  if(map[k]){e.preventDefault();if(e.repeat)return;sfx.init();if(G.phase==='intro'){begin();return}
   const loft=e.shiftKey||G.touchLoft;playerShot(map[k],loft&&map[k]!=='defend',clockAt(e));return}
  if(k===' '||k==='Enter'){if(G.phase==='intro'&&k===' '){e.preventDefault();begin();return}if(G.phase!=='end'&&el('g-card').hidden){e.preventDefault();skip()}}
 }
 function onTouch(e){
  const btn=e.target.closest('[data-shot],[data-loft]');if(!btn)return;e.preventDefault();sfx.init();
  if(btn.dataset.loft!==undefined){G.touchLoft=!G.touchLoft;btn.classList.toggle('on',G.touchLoft);btn.querySelector('small').textContent=G.touchLoft?'on':'off';return}
  if(G.phase==='intro'){begin();return}
  playerShot(btn.dataset.shot,G.touchLoft&&btn.dataset.shot!=='defend',clockAt(e));
 }
 function onVisibility(){if(document.hidden&&!G.paused&&G.phase!=='end'&&G.phase!=='intro')pause(true)}
 document.addEventListener('keydown',onKey);
 const touch=root.querySelector('.g-touch');touch.addEventListener('pointerdown',onTouch);
 document.addEventListener('visibilitychange',onVisibility);
 el('g-pause').onclick=()=>pause();
 el('g-sound').onclick=()=>{sfx.set(!sfx.on);onSoundChange?.(sfx.on);hud()};
 canvas.addEventListener('pointerdown',()=>{sfx.init();if(G.phase!=='live')skip()});
 function destroy(){if(G.ended)return;G.ended=true;cancelAnimationFrame(G.raf);document.removeEventListener('keydown',onKey);document.removeEventListener('visibilitychange',onVisibility);root.innerHTML=''}
 hud();intro();G.raf=requestAnimationFrame(frame);
 return {destroy,state:G};
}

// Static art for the clubhouse hero: the same batter-cam, frozen as the bowler runs in.
export function paintHero(canvas){
 const w=canvas.clientWidth||900,h=canvas.clientHeight||520,dpr=Math.min(devicePixelRatio||1,2),c=canvas.getContext('2d');
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 const H=720,S=h/H,W=w/S;c.setTransform(dpr*S,0,0,dpr*S,0,0);
 drawBatScene(makePen(c),W,H,{time:3,phase:'hero',fielders:makeField(.5,()=>.5),bowler:{x:-.6,y:26,pose:'run',anim:2},ballPos:null,trail:[],batPose:BAT_POSES.stance,stumps:null,bounceMark:null,oppCap:'#7a2f3a'});
}

export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const overs=b=>`${Math.floor(b/6)}.${b%6}`;
export function createMatch({xi,opponent,limit=12,batFirst=true,difficulty='club',campaign=false,strength=.5}) {
 const innings=()=>({runs:0,wickets:0,balls:0,striker:0,nonStriker:1,next:2,batting:Array.from({length:11},()=>({runs:0,balls:0,out:false,entered:false})),bowling:{},log:[]});
 return {xi,opponent,limit,batFirst,difficulty,campaign,strength,inning:0,innings:[innings(),innings()],stage:'ready',bowler:xi.reduce((a,b)=>a.bowl>b.bowl?a:b),lastBowler:null,winner:null};
}
export function isBatting(m){return m.inning===0?m.batFirst:!m.batFirst}
export function battingResult({error,style='drive',rating=70,gap=true,difficulty='club',strength=.5,rng=Math.random}){
 const e=Math.abs(error)*(difficulty==='legend'?1.42:1)*(0.9+strength*.22);const skill=(rating-50)/100;
 const risk=style==='loft'?1.7:style==='defend'?.42:1;
 // Arcade arrows: a complete miss hits the stumps; a badly timed contact balloons up.
 if(style==='arcade'&&e>.4)return {runs:0,wicket:true,dismissal:'bowled',label:'Bowled! Through the gate.'};
 if(style==='arcade'&&e>.25)return {runs:0,wicket:true,dismissal:'caught',label:'Caught! A mistimed chip.'};
 if(e>.25&&rng()<clamp((e-.20)*2.2*risk-skill*.12,.03,.86))return {runs:0,wicket:true,dismissal:e>.4?'bowled':'caught',label:e>.4?'Bowled!':'Caught!'};
 if(e>.32)return {runs:0,wicket:false,label:error<0?'Too early':'Too late'};
 const quality=clamp(1-e*3.2+skill*.12,0,1);
 let runs=style==='defend'?(quality>.72?1:0):style==='arcade'?(quality>.90?6:quality>.76?4:quality>.61?2:quality>.36?1:0):style==='loft'?(quality>.89?6:quality>.68?4:quality>.45?2:0):(quality>.82?4:quality>.61?2:quality>.36?1:0);
 if(!gap&&runs>=4&&e>.09){if(style==='loft'&&rng()<.35)return {runs:0,wicket:true,dismissal:'caught',label:'Caught on the rope!'};runs=1}
 return {runs,wicket:false,label:runs===6?'Into the trees!':runs===4?'That’s a mighty four!':runs===0?'Dot ball':runs===1?'Quick single':'Finds the gap'};
}
export function bowlingResult({error,movement='straight',bowlingType='seam',line='straight',length='good',rating=70,repeated=false,difficulty='club',strength=.5,rng=Math.random}){
 const e=Math.abs(error),control=clamp(1-e*2.6,0,1),skill=(rating-30)/100;
 const bend=movement==='left'?-1:movement==='right'?1:0;
 const lineValue=line==='leg'?-1:line==='off'?1:0;
 const attacksStumps=lineValue!==0&&lineValue*bend<0;
 const driftsAway=lineValue!==0&&lineValue*bend>0;
 const chance=clamp(.035+control*.16+skill*.13+(attacksStumps?.04:0)+(length==='full'?.025:0)-(driftsAway?.05:0)-(repeated?.10:0)-(difficulty==='legend'?.06:0)-strength*.035,.02,.4);
 if(rng()<chance)return {runs:0,wicket:true,label:movement==='straight'?'Bowled through the gate!':bowlingType==='spin'?'Turned past the bat!':'Swung past the edge!'};
 const attack=rng()+(1-control)*.70-skill*.12+(repeated?.15:0)+(driftsAway?.13:0)+(length==='short'?.07:0)+strength*.08+(difficulty==='legend'?.08:0);
 const runs=attack>.96?6:attack>.76?4:attack>.53?2:attack>.27?1:0;
 return {runs,wicket:false,label:runs>=4?'Punished to the boundary':runs?'Worked into the field':bowlingType==='spin'?'Beaten by the turn!':'Beautiful dot ball'};
}
export function applyBall(m,result){
 if(m.stage==='break'||m.stage==='done')return false;
 const inn=m.innings[m.inning];
 // Wides: runs to the team, no ball faced, same striker.
 if(result.wide){inn.runs+=result.runs;inn.extras=(inn.extras||0)+result.runs;inn.log.push({...result,ball:inn.balls});if(m.inning===1&&inn.runs>m.innings[0].runs){m.stage='done';m.winner=isBatting(m)?'fours':'opponent'}return true}
 inn.batting[0].entered=true;inn.batting[1].entered=true;const batter=inn.batting[inn.striker];batter.balls++;batter.runs+=result.runs;inn.runs+=result.runs;inn.balls++;
 if(!isBatting(m)){const b=inn.bowling[m.bowler.name]??={balls:0,runs:0,wickets:0};b.balls++;b.runs+=result.runs;if(result.wicket)b.wickets++}
 if(result.wicket){inn.wickets++;batter.out=true;if(inn.wickets<10){inn.striker=inn.next++;inn.batting[inn.striker].entered=true}}
 else if(result.runs%2)[inn.striker,inn.nonStriker]=[inn.nonStriker,inn.striker];
 if(inn.balls%6===0){[inn.striker,inn.nonStriker]=[inn.nonStriker,inn.striker];if(!isBatting(m))m.lastBowler=m.bowler.name}
 inn.log.push({...result,ball:inn.balls});
 const chased=m.inning===1&&inn.runs>m.innings[0].runs;
 if(chased||inn.wickets===10||inn.balls===m.limit){
  if(m.inning===0)m.stage='break';
  else {m.stage='done';const a=m.innings[0].runs,b=inn.runs;m.winner=a===b?'tie':(b>a?(isBatting(m)?'fours':'opponent'):(isBatting(m)?'opponent':'fours'))}
 } else m.stage='ready';return true;
}
export function nextInnings(m){if(m.stage!=='break')return false;m.inning=1;m.stage='ready';return true}
export function schedule(teams){let rotating=[...teams];if(rotating.length%2)rotating.push(null);const rounds=[];for(let r=0;r<rotating.length-1;r++){const games=[];for(let i=0;i<rotating.length/2;i++){const a=rotating[i],b=rotating[rotating.length-1-i];if(a&&b)games.push([a,b])}rounds.push(games);rotating=[rotating[0],rotating.at(-1),...rotating.slice(1,-1)]}return rounds}
export function newLeague(season){const names=['The Mighty Fours',...season.teams];return {year:season.year,round:0,rounds:schedule(names),table:names.map(name=>({name,played:0,won:0,lost:0,tied:0,points:0})),results:[],complete:false}}
export function finishRound(league,userResult,rng=Math.random){if(league.complete)return;for(const [a,b] of league.rounds[league.round]){const user=a==='The Mighty Fours'||b==='The Mighty Fours';let winner=user?(userResult==='tie'?null:userResult==='fours'?'The Mighty Fours':a==='The Mighty Fours'?b:a):(rng()<.5?a:b);for(const name of [a,b]){const row=league.table.find(r=>r.name===name);row.played++;if(!winner){row.tied++;row.points++}else if(winner===name){row.won++;row.points+=2}else row.lost++}league.results.push({round:league.round,a,b,winner})}league.round++;league.complete=league.round>=league.rounds.length}

// A fixed route through every distinct opponent in the source league tables.
export function chaseFixtures(seasons){
 const names=[...new Set(seasons.flatMap(s=>[...s.teams].reverse()))];
 const last=Math.max(1,names.length-1);
 // Targets climb a run a match, from 18 to 80, off six overs; strength drives bowling pace, movement and fielding.
 return names.map((opponent,index)=>({opponent,index,target:18+index,limit:36,strength:index/last}));
}
export function createChase(xi,fixture){
 const m=createMatch({xi,opponent:fixture.opponent,limit:fixture.limit,batFirst:false,strength:fixture.strength});
 m.innings[0].runs=fixture.target-1;m.innings[0].balls=fixture.limit;m.inning=1;m.campaign=true;m.chase=true;m.fixture=fixture;
 return m;
}

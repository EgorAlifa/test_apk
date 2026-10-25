/* «Собери монеты»: coins (and rare gems worth 5) pop up around a treasure vault; walk over them to collect.
   Bumping into players knocks coins out of them, a dash ("Рывок") steals coins on hit. Most coins after 45 s wins.
   Contract: docs/action-games-spec.md */
(()=>{
const TAU=Math.PI*2;
const AX0=40,AY0=92,AX1=1560,AY1=846;           // arena walls (top band left free for the HUD / timer pill)
const PR=34,ACC=1500,DRAG=3.2,VMAX=330,DASH=720,DASH_T=.38,DASH_CD=1.5,HIT_WIN=.18,BOUNCE=.6,KICK=80;
const CR=17,GR=26,PICK=PR+20;                     // coin / gem radius, generous pickup distance
const SPAWN_T=.55,GEM_EVERY=7,GEM_WARN=1.3,RAIN_AT=33,BUMP_V=300,INV_T=1.1;
let S=null;
// most coins first (stolen coins still in flight already count for the thief), ties → join order
function order(ctx){const own=new Map();for(const f of (S?S.fly:[]))own.set(f.to,(own.get(f.to)||0)+1);
  return ctx.players.slice().sort((a,b)=>(b.data.score+(own.get(b)||0))-(a.data.score+(own.get(a)||0))||a.idx-b.idx)}
const rnd=(a,b)=>a+Math.random()*(b-a);
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
function fx(x,y,n,col,sp,life){for(let i=0;i<n;i++){const a=Math.random()*TAU,v=sp*(.3+Math.random()*.7);
  S.fx.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,l:life*(.6+Math.random()*.4),L:life,col,r:3+Math.random()*5})}}
function pop(x,y,text,col){S.pops.push({x,y:Math.max(AY0+40,y),text,col,l:1.1})}
function freeSpot(ctx,minD){
  for(let k=0;k<25;k++){const x=rnd(AX0+60,AX1-60),y=rnd(AY0+60,AY1-50);
    if(ctx.players.every(p=>Math.hypot(p.data.x-x,p.data.y-y)>minD)&&S.coins.every(c=>Math.hypot(c.x-x,c.y-y)>60))return{x,y}}
  return{x:rnd(AX0+60,AX1-60),y:rnd(AY0+60,AY1-50)}}
function addCoin(x,y,o={}){S.coins.push(Object.assign({x,y,vx:0,vy:0,v:1,born:S.t,grow:.45,lock:0,owner:null,ph:Math.random()*TAU},o))}
function cap(ctx){return 12+3*ctx.players.length+(S.t>=RAIN_AT?8:0)}
// knock k coins out of player p (stolen part flies straight to the thief)
function knock(ctx,p,k,thief,steal){const d=p.data;k=Math.min(k,d.score);if(k<=0)return;
  d.score-=k;d.inv=INV_T;d.lost=.5;
  const st=thief?Math.min(k,steal):0;
  for(let i=0;i<st;i++)S.fly.push({x:d.x,y:d.y,to:thief,l:0,delay:i*.08});
  for(let i=st;i<k;i++){const a=Math.random()*TAU,v=rnd(260,460);
    addCoin(d.x+Math.cos(a)*PR*.6,d.y+Math.sin(a)*PR*.6,{vx:Math.cos(a)*v,vy:Math.sin(a)*v,grow:0,lock:.45,owner:p,ownLock:1.1})}
  pop(d.x,d.y-PR-48,"−"+k,"#ff5d73");fx(d.x,d.y,14,"#ffd75e",300,.5);S.shake=Math.min(12,S.shake+3+k)}

(window.ACTION_GAMES=window.ACTION_GAMES||[]).push({
  id:"coins",
  title:"Собери монеты",
  rules:"Собирай монеты, толкайся! Рывок выбивает монеты у соперника.",
  controls:"stick+btn",
  btnLabel:"Рывок",
  duration:45,

  init(ctx){
    S={t:0,coins:[],fly:[],fx:[],pops:[],shake:0,spawnAcc:0,nextGem:5,gemWarn:null,rain:false,lead:null,
      tiles:Array.from({length:60},()=>({x:rnd(AX0,AX1),y:rnd(AY0,AY1),s:rnd(1.5,3.5),a:rnd(.15,.5)}))};
    const ps=ctx.players,n=ps.length,cx=(AX0+AX1)/2,cy=(AY0+AY1)/2;
    ps.forEach((p,i)=>{const a=i/n*TAU-Math.PI/2,rr=n>1?300:0;
      p.data={x:cx+Math.cos(a)*rr*1.5,y:cy+Math.sin(a)*rr,vx:0,vy:0,face:a+Math.PI,cd:0,dash:0,hitWin:0,taps:p.input.taps,pb:false,
        score:0,inv:0,lost:0,got:0,trail:[]}});
    // a first batch of coins so the intro already shows the idea
    for(let i=0;i<10+2*n;i++){const q=freeSpot(ctx,110);addCoin(q.x,q.y,{grow:0,born:-1})}
  },

  update(ctx,dt){
    const ps=ctx.players;S.t=ctx.t;const t=S.t;
    if(S.shake>0)S.shake=Math.max(0,S.shake-dt*40);
    if(!S.rain&&t>=RAIN_AT){S.rain=true;ctx.banner("Золотой дождь!",1.8)}
    // spawn coins
    S.spawnAcc+=dt;const every=S.rain?SPAWN_T*.4:SPAWN_T/(1+ps.length*.12);
    while(S.spawnAcc>=every){S.spawnAcc-=every;if(S.coins.length<cap(ctx)){const q=freeSpot(ctx,90);addCoin(q.x,q.y)}}
    // gems: telegraphed by a beam, then appear
    if(!S.gemWarn&&t>=S.nextGem){const q=freeSpot(ctx,200);S.gemWarn={x:q.x,y:q.y,t};S.nextGem=t+GEM_EVERY+rnd(-1,2)}
    if(S.gemWarn&&t-S.gemWarn.t>=GEM_WARN){addCoin(S.gemWarn.x,S.gemWarn.y,{v:5,grow:.25});fx(S.gemWarn.x,S.gemWarn.y,22,"#c9a2ff",380,.6);S.gemWarn=null}
    // players
    for(const p of ps){const d=p.data,inp=p.input;
      const pressed=inp.taps>d.taps||(inp.btn&&!d.pb);d.taps=inp.taps;d.pb=inp.btn;
      if(pressed&&d.cd<=0){let dx=inp.x,dy=inp.y,l=Math.hypot(dx,dy);
        if(l<.2){dx=d.vx;dy=d.vy;l=Math.hypot(dx,dy)}if(l<1){dx=Math.cos(d.face);dy=Math.sin(d.face);l=1}
        d.vx=dx/l*DASH;d.vy=dy/l*DASH;d.dash=DASH_T;d.hitWin=DASH_T+HIT_WIN;d.cd=DASH_CD;fx(d.x,d.y,10,"#fff",260,.35)}
      d.vx+=inp.x*ACC*dt;d.vy+=inp.y*ACC*dt;
      const k=Math.exp(-(d.dash>0?.8:DRAG)*dt);d.vx*=k;d.vy*=k;
      const sp=Math.hypot(d.vx,d.vy);
      if(d.dash<=0&&sp>VMAX){const ns=VMAX+(sp-VMAX)*Math.exp(-6*dt);d.vx*=ns/sp;d.vy*=ns/sp}
      if(sp>40)d.face=Math.atan2(d.vy,d.vx);
      d.cd-=dt;d.dash-=dt;d.hitWin-=dt;d.inv-=dt;d.lost-=dt;d.got-=dt;
      d.trail.push({x:d.x,y:d.y});if(d.trail.length>(d.dash>0?9:2))d.trail.shift();if(d.dash<=0&&d.trail.length>1)d.trail.shift()}
    // collisions
    for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){const A=ps[i],B=ps[j],a=A.data,b=B.data;
      let nx=b.x-a.x,ny=b.y-a.y,dd=Math.hypot(nx,ny);if(dd>=PR*2)continue;if(dd<.01){nx=1;ny=0;dd=.01}
      nx/=dd;ny/=dd;const ma=a.dash>0?2:1,mb=b.dash>0?2:1,ov=PR*2-dd;
      a.x-=nx*ov*mb/(ma+mb);a.y-=ny*ov*mb/(ma+mb);b.x+=nx*ov*ma/(ma+mb);b.y+=ny*ov*ma/(ma+mb);
      const vn=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(vn>=0)continue;
      const va=a.vx*nx+a.vy*ny,vb=-(b.vx*nx+b.vy*ny); // how fast each one was moving into the other
      const jimp=-(1+BOUNCE)*vn/(1/ma+1/mb);
      a.vx-=(jimp/ma+KICK)*nx;a.vy-=(jimp/ma+KICK)*ny;b.vx+=(jimp/mb+KICK)*nx;b.vy+=(jimp/mb+KICK)*ny;
      const aD=a.hitWin>0,bD=b.hitWin>0;
      if(aD||bD){ // dash hit: the dasher steals; both dashing → both lose a bit
        const hit=(att,vic)=>{if(vic.data.inv>0)return;const s=vic.data.score,k=Math.max(2,Math.ceil(s*.3));
          const kk=Math.min(s,k,8);if(kk<=0){pop(vic.data.x,vic.data.y-PR-48,"Пусто!","#fbf4ff");return}
          knock(ctx,vic,kk,att,Math.ceil(kk/2));if(kk>=4)ctx.banner(`${att.name} грабит ${vic.name}!`,1.3)};
        if(aD&&!bD)hit(A,B);else if(bD&&!aD)hit(B,A);else{hit(A,B);hit(B,A)}
        if(aD)a.hitWin=0;if(bD)b.hitWin=0;S.shake=Math.min(14,S.shake+5)}
      else if(-vn>BUMP_V){ // plain bump: whoever was hit (moving slower into the other) drops a coin or two
        const vic=va>vb?B:A;if(vic.data.inv<=0)knock(ctx,vic,-vn>480?2:1,null,0)}
      if(-vn>200)fx((a.x+b.x)/2,(a.y+b.y)/2,6+Math.min(10,-vn/80|0),"#fff6d0",-vn*.4,.35)}
    for(const p of ps){const d=p.data;d.x+=d.vx*dt;d.y+=d.vy*dt;
      if(d.x<AX0+PR){d.x=AX0+PR;d.vx=Math.abs(d.vx)*.5}if(d.x>AX1-PR){d.x=AX1-PR;d.vx=-Math.abs(d.vx)*.5}
      if(d.y<AY0+PR){d.y=AY0+PR;d.vy=Math.abs(d.vy)*.5}if(d.y>AY1-PR){d.y=AY1-PR;d.vy=-Math.abs(d.vy)*.5}}
    // coins: move (scattered ones), get picked up
    for(const c of S.coins){if(c.vx||c.vy){c.x+=c.vx*dt;c.y+=c.vy*dt;const k=Math.exp(-3.2*dt);c.vx*=k;c.vy*=k;
        if(c.x<AX0+CR){c.x=AX0+CR;c.vx=Math.abs(c.vx)}if(c.x>AX1-CR){c.x=AX1-CR;c.vx=-Math.abs(c.vx)}
        if(c.y<AY0+CR){c.y=AY0+CR;c.vy=Math.abs(c.vy)}if(c.y>AY1-CR){c.y=AY1-CR;c.vy=-Math.abs(c.vy)}
        if(Math.hypot(c.vx,c.vy)<8){c.vx=0;c.vy=0}}
      c.lock-=dt;if(c.ownLock)c.ownLock-=dt;
      if(c.lock>0||t-c.born<c.grow*.6)continue;
      let best=null,bd=1e9;
      for(const p of ps){if(c.owner===p&&c.ownLock>0)continue;const d=p.data,dist=Math.hypot(d.x-c.x,d.y-c.y);if(dist<PICK+(c.v>1?8:0)&&dist<bd){bd=dist;best=p}}
      if(best){const d=best.data;d.score+=c.v;d.got=.25;c.dead=true;
        if(c.v>1){pop(c.x,c.y-30,"+5","#d6b8ff");fx(c.x,c.y,18,"#c9a2ff",320,.5);ctx.banner(`${best.name}: алмаз +5!`,1.1)}
        else{pop(c.x,c.y-24,"+1","#ffd75e");fx(c.x,c.y,6,"#ffd75e",180,.3)}}}
    S.coins=S.coins.filter(c=>!c.dead);
    // stolen coins flying to the thief
    for(const f of S.fly){if(f.delay>0){f.delay-=dt;continue}f.l+=dt*2.6;if(f.l>=1&&!f.done){f.done=true;f.to.data.score+=1;f.to.data.got=.25}}
    const stolen=S.fly.filter(f=>f.done);if(stolen.length){const by=new Map();stolen.forEach(f=>by.set(f.to,(by.get(f.to)||0)+1));
      by.forEach((n,p)=>pop(p.data.x,p.data.y-PR-48,"+"+n,"#5ce1c6"))}
    S.fly=S.fly.filter(f=>!f.done);
    for(const f of S.fx){f.x+=f.vx*dt;f.y+=f.vy*dt;f.vx*=.93;f.vy*=.93;f.l-=dt}S.fx=S.fx.filter(f=>f.l>0);
    for(const q of S.pops){q.y=Math.max(AY0+30,q.y-55*dt);q.l-=dt}S.pops=S.pops.filter(q=>q.l>0);
    // leader change banner (only once there is something to lead with)
    const top=order(ctx)[0];
    if(ps.length>1&&top&&top.data.score>=5&&top!==S.lead&&top.data.score>Math.max(...ps.filter(p=>p!==top).map(p=>p.data.score))){
      if(S.lead)ctx.banner(`${top.name} лидирует!`,1.2);S.lead=top}
    // phone status: own coin count, gold while leading
    for(const p of ps)ctx.status(p,`Монет: ${p.data.score}`+(ps.length>1&&p===S.lead&&p===top?" · лидер!":""),{color:ps.length>1&&p===S.lead&&p===top?"gold":null})
  },

  standings(ctx){return order(ctx)},

  draw(ctx,g){
    const W=ctx.W,H=ctx.H,now=performance.now()/1000,t=S.t;
    if(S.shake>0)g.translate((Math.random()-.5)*S.shake,(Math.random()-.5)*S.shake);
    // background
    const bg=g.createLinearGradient(0,0,0,H);bg.addColorStop(0,"#2a1446");bg.addColorStop(1,"#150a26");g.fillStyle=bg;g.fillRect(-20,-20,W+40,H+40);
    // vault floor
    g.fillStyle="rgba(0,0,0,.35)";g.beginPath();g.roundRect(AX0+8,AY0+12,AX1-AX0,AY1-AY0,34);g.fill();
    const fg=g.createRadialGradient(W/2,(AY0+AY1)/2,80,W/2,(AY0+AY1)/2,900);fg.addColorStop(0,"#4a2d6e");fg.addColorStop(1,"#2b1846");
    g.fillStyle=fg;g.beginPath();g.roundRect(AX0,AY0,AX1-AX0,AY1-AY0,30);g.fill();
    g.save();g.beginPath();g.roundRect(AX0,AY0,AX1-AX0,AY1-AY0,30);g.clip();
    g.strokeStyle="rgba(255,255,255,.05)";g.lineWidth=3;
    for(let x=AX0+95;x<AX1;x+=95){g.beginPath();g.moveTo(x,AY0);g.lineTo(x,AY1);g.stroke()}
    for(let y=AY0+97;y<AY1;y+=97){g.beginPath();g.moveTo(AX0,y);g.lineTo(AX1,y);g.stroke()}
    for(const s of S.tiles){g.fillStyle=`rgba(255,215,94,${s.a*(.6+.4*Math.sin(now*2+s.x))})`;g.fillRect(s.x,s.y,s.s,s.s)}
    g.restore();
    g.lineWidth=8;g.strokeStyle=S.rain?`rgba(255,201,74,${.7+.3*Math.sin(now*8)})`:"#c89b3c";g.beginPath();g.roundRect(AX0,AY0,AX1-AX0,AY1-AY0,30);g.stroke();
    g.lineWidth=2;g.strokeStyle="rgba(255,230,160,.35)";g.beginPath();g.roundRect(AX0+9,AY0+9,AX1-AX0-18,AY1-AY0-18,24);g.stroke();
    // gem telegraph: pulsing beam + ring where it will land
    if(S.gemWarn){const w=S.gemWarn,k=clamp((t-w.t)/GEM_WARN,0,1);
      g.fillStyle=`rgba(201,162,255,${.12+.18*k})`;g.fillRect(w.x-24-12*k,AY0,48+24*k,w.y-AY0);
      g.strokeStyle=`rgba(214,184,255,${.5+.4*Math.sin(now*14)})`;g.lineWidth=5;g.beginPath();g.ellipse(w.x,w.y,60-30*k,(60-30*k)*.5,0,0,TAU);g.stroke()}
    // coins
    for(const c of S.coins){const age=t-c.born,gk=c.grow>0?clamp(age/c.grow,0,1):1;if(gk<=0)continue;
      const bob=Math.sin(now*3+c.ph)*3,sc=gk<1?gk*(1.25-.25*gk):1,locked=c.lock>0;
      g.save();g.translate(c.x,c.y);
      g.fillStyle="rgba(0,0,0,.3)";g.beginPath();g.ellipse(3,(c.v>1?GR:CR)*.8,(c.v>1?GR:CR)*.85*sc,6*sc,0,0,TAU);g.fill();
      g.translate(0,bob-4);g.scale(sc,sc);if(locked)g.globalAlpha=.75;
      if(c.v>1){ // gem: glowing faceted diamond
        g.fillStyle=`rgba(201,162,255,${.25+.15*Math.sin(now*6)})`;g.beginPath();g.arc(0,0,GR*1.8,0,TAU);g.fill();
        g.fillStyle="#9d6bff";g.beginPath();g.moveTo(0,-GR);g.lineTo(GR,-GR*.25);g.lineTo(0,GR*1.1);g.lineTo(-GR,-GR*.25);g.closePath();g.fill();
        g.fillStyle="#d6b8ff";g.beginPath();g.moveTo(0,-GR);g.lineTo(GR*.45,-GR*.25);g.lineTo(0,GR*1.1);g.lineTo(-GR*.45,-GR*.25);g.closePath();g.fill();
        g.fillStyle="#f3eaff";g.beginPath();g.moveTo(-GR*.45,-GR*.25);g.lineTo(0,-GR);g.lineTo(GR*.45,-GR*.25);g.closePath();g.fill();
        g.lineWidth=3;g.strokeStyle="#3b1c73";g.beginPath();g.moveTo(0,-GR);g.lineTo(GR,-GR*.25);g.lineTo(0,GR*1.1);g.lineTo(-GR,-GR*.25);g.closePath();g.stroke();
        g.font='900 26px "Unbounded","Arial Black",sans-serif';g.textAlign="center";g.textBaseline="middle";g.lineWidth=6;g.strokeStyle="#2a1446";g.strokeText("+5",0,GR*1.75);g.fillStyle="#fff";g.fillText("+5",0,GR*1.75)}
      else{ // coin: spinning gold disc
        const sx=.35+.65*Math.abs(Math.cos(now*2.4+c.ph));g.scale(sx,1);
        g.fillStyle="#b07a12";g.beginPath();g.arc(0,0,CR,0,TAU);g.fill();
        g.fillStyle="#ffd75e";g.beginPath();g.arc(0,-1.5,CR-2.5,0,TAU);g.fill();
        g.strokeStyle="#e0a91f";g.lineWidth=3;g.beginPath();g.arc(0,-1.5,CR-7,0,TAU);g.stroke();
        g.fillStyle="rgba(255,255,255,.6)";g.beginPath();g.ellipse(-5,-7,4,2.5,-.6,0,TAU);g.fill()}
      g.restore()}
    // players
    const ps=ctx.players.slice().sort((a,b)=>a.data.y-b.data.y);
    const leadScore=Math.max(...ctx.players.map(p=>p.data.score));
    for(const p of ps){const d=p.data;
      for(let i=0;i<d.trail.length-1;i++){const q=d.trail[i];g.globalAlpha=.12+.3*i/d.trail.length;g.fillStyle=p.color;g.beginPath();g.arc(q.x,q.y,PR*(.6+.4*i/d.trail.length),0,TAU);g.fill()}
      g.globalAlpha=1;
      if(d.cd>0){g.strokeStyle="rgba(255,255,255,.5)";g.lineWidth=5;g.beginPath();g.arc(d.x,d.y,PR+9,-Math.PI/2,-Math.PI/2+TAU*(1-d.cd/DASH_CD));g.stroke()}
      else{g.strokeStyle=`rgba(92,225,198,${.55+.3*Math.sin(now*6)})`;g.lineWidth=4;g.beginPath();g.arc(d.x,d.y,PR+9,0,TAU);g.stroke()}
      if(d.dash>0){g.strokeStyle="#fff";g.lineWidth=7;g.beginPath();g.arc(d.x,d.y,PR+3,0,TAU);g.stroke()}
      g.save();if(d.inv>0&&Math.sin(now*30)>0)g.globalAlpha=.55;
      const r=PR*(d.got>0?1+d.got*.4:1);ctx.drawPlayer(g,p,d.x,d.y,r);g.restore();
      // crown for the leader
      if(ctx.players.length>1&&d.score>0&&d.score===leadScore){const cx=d.x,cy=d.y-PR-56;
        g.fillStyle="#ffc94a";g.strokeStyle="#5a3a00";g.lineWidth=3;g.beginPath();
        g.moveTo(cx-20,cy+10);g.lineTo(cx-22,cy-8);g.lineTo(cx-10,cy+1);g.lineTo(cx,cy-13);g.lineTo(cx+10,cy+1);g.lineTo(cx+22,cy-8);g.lineTo(cx+20,cy+10);g.closePath();g.fill();g.stroke()}
      // coin counter badge under the player
      const txt=String(d.score);g.font='900 24px "Unbounded","Arial Black",sans-serif';const tw=g.measureText(txt).width;
      const bw=tw+44,bx=d.x-bw/2,by=d.y+PR+6;
      g.fillStyle=d.lost>0?"rgba(160,20,40,.92)":"rgba(23,12,43,.88)";g.beginPath();g.roundRect(bx,by,bw,32,16);g.fill();
      g.fillStyle="#ffd75e";g.beginPath();g.arc(bx+17,by+16,9,0,TAU);g.fill();g.strokeStyle="#b07a12";g.lineWidth=2.5;g.stroke();
      g.textAlign="left";g.textBaseline="middle";g.fillStyle="#fff";g.fillText(txt,bx+32,by+17)}
    // stolen coins in flight
    for(const f of S.fly){if(f.delay>0)continue;const victimX=f.x,victimY=f.y,to=f.to.data,k=f.l;
      const x=victimX+(to.x-victimX)*k,y=victimY+(to.y-victimY)*k-Math.sin(k*Math.PI)*120;
      g.fillStyle="#ffd75e";g.strokeStyle="#b07a12";g.lineWidth=3;g.beginPath();g.arc(x,y,CR*.8,0,TAU);g.fill();g.stroke()}
    for(const f of S.fx){g.globalAlpha=Math.max(0,f.l/f.L);g.fillStyle=f.col;g.beginPath();g.arc(f.x,f.y,f.r,0,TAU);g.fill()}
    g.globalAlpha=1;
    g.textAlign="center";g.textBaseline="middle";g.lineJoin="round";
    for(const q of S.pops){g.globalAlpha=clamp(q.l/.4,0,1);g.font='900 34px "Unbounded","Arial Black",sans-serif';g.lineWidth=7;g.strokeStyle="rgba(23,12,43,.9)";g.strokeText(q.text,q.x,q.y);g.fillStyle=q.col;g.fillText(q.text,q.x,q.y)}
    g.globalAlpha=1;
    // HUD: top-3 on the left of the timer, coins on the floor on the right
    const top=order(ctx).slice(0,3);
    g.font='800 26px "Manrope",system-ui,sans-serif';g.textAlign="left";
    let x=AX0;for(let i=0;i<top.length;i++){const p=top[i],s=`${i+1}. ${p.name} ${p.data.score}`,w=Math.min(220,g.measureText(s).width)+52;
      if(x+w>W/2-90)break;
      g.fillStyle="rgba(23,12,43,.82)";g.beginPath();g.roundRect(x,18,w,52,26);g.fill();
      g.fillStyle=p.color;g.beginPath();g.arc(x+24,44,11,0,TAU);g.fill();
      g.fillStyle=i===0?"#ffc94a":"#fbf4ff";g.fillText(s,x+42,45,w-52);x+=w+10}
    if(S.rain){g.font='900 28px "Unbounded","Arial Black",sans-serif';g.textAlign="right";g.fillStyle="rgba(23,12,43,.82)";
      const rw=g.measureText("Золотой дождь!").width+48;g.beginPath();g.roundRect(W-AX0-rw,18,rw,52,26);g.fill();g.fillStyle="#ffc94a";g.fillText("Золотой дождь!",W-AX0-24,46)}
  }
});
})();

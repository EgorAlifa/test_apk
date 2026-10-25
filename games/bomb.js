/* «Бомба» (горячая картошка): one player carries a ticking bomb; touching someone passes it on.
   When the fuse burns out the carrier explodes and is out; a new bomb with a shorter fuse lands on a random survivor.
   Last one standing wins. With fewer than 3 players, grey robots join so the round is still a real game
   (robots never get points and are not in ctx.players). Contract: docs/action-games-spec.md */
(()=>{
const TAU=Math.PI*2;
// arena (keeps the engine's timer pill at the top centre free)
const AX0=70,AY0=100,AX1=1530,AY1=868;
const PR=34,VRUN=340,VBOMB=375,VSPRINT=620,SPRINT_T=.45,SPRINT_CD=2.8,RESP=4.5;
// forgiving pass: touch radius bigger than the discs, giver can't get it back for IMM s, receiver can't pass for GRACE s
const PASS_D=PR*2+20,IMM=1.4,GRACE=.45,GAP=1.9,START_DELAY=1.2,FMIN=4.5,FMUL=.88;
const PILLARS=[{x:470,y:330,r:52},{x:1130,y:330,r:52},{x:470,y:650,r:52},{x:1130,y:650,r:52}];
const BOTCOL=["#9097ad","#b9a68a"];
let S=null;

const ents=()=>S.ents;
const aliveEnts=()=>S.ents.filter(e=>e.alive);
function fuseFor(k){return Math.max(FMIN,S.f0*Math.pow(FMUL,k))}
function puff(x,y,n,col,sp,life,size){for(let i=0;i<n;i++){const a=Math.random()*TAU,v=sp*(.25+Math.random()*.75);
  S.fx.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,l:life*(.5+Math.random()*.5),L:life,col,r:(size||6)*(.5+Math.random())})}}
function pop(x,y,text,col){S.pops.push({x,y,text,col,l:1.1})}
function giveBomb(e,from,t){
  const b=S.bomb;b.holder=e;b.from=from||null;b.passT=t;b.fly=from?.22:0;
  if(from){b.fx=from.data.x;b.fy=from.data.y;from.data.imm=IMM;S.lastPass={from,to:e,t}}
  e.data.grace=GRACE}
function newBomb(ctx){
  const al=aliveEnts();if(!al.length)return;
  // prefer someone who has not just had it; humans and robots alike
  const e=al[Math.random()*al.length|0];
  S.bomb={holder:null,left:fuseFor(S.n),total:fuseFor(S.n),fly:0,drop:.55,passT:ctx.t,from:null};
  giveBomb(e,null,ctx.t);S.lastPass=null;S.n++;
  ctx.banner(`Новая бомба: ${e.name}!`,1.6)}
function explode(ctx){
  const b=S.bomb,e=b.holder,d=e.data;
  S.booms.push({x:d.x,y:d.y,l:0});S.scorch.push({x:d.x,y:d.y,r:60+Math.random()*20,a:Math.random()*TAU,name:e.name});
  puff(d.x,d.y,46,"f",720,.9,11);puff(d.x,d.y,22,"k",380,1.4,16);S.shake=26;
  // blast wave shoves everybody nearby away
  for(const o of aliveEnts()){if(o===e)continue;const dx=o.data.x-d.x,dy=o.data.y-d.y,l=Math.hypot(dx,dy)||1;
    if(l<330){const k=(1-l/330)*900;o.data.vx+=dx/l*k;o.data.vy+=dy/l*k}}
  const lp=S.lastPass,by=lp&&lp.to===e&&ctx.t-lp.t<3&&lp.from.alive?lp.from.name:null;
  // small games (1-2 people): everyone has two lives, so the round is not over after one bomb
  if(--d.lives>0){d.imm=GAP+1.2;ctx.banner(`БАХ! ${e.name}: осталась 1 жизнь`,1.8)}
  else{if(e.bot)e.alive=false;else ctx.eliminate(e);
    ctx.banner(by?`${by} → ${e.name}: БАХ!`:`БАХ! ${e.name} — вылет`,1.8)}
  S.bomb=null;S.gap=GAP}
function heart(g,x,y,r){g.save();g.translate(x,y);g.fillStyle="#ff5d73";g.strokeStyle="rgba(23,12,43,.9)";g.lineWidth=3;g.beginPath();
  g.moveTo(0,r*.9);g.bezierCurveTo(-r*1.6,-r*.1,-r*.7,-r*1.3,0,-r*.45);g.bezierCurveTo(r*.7,-r*1.3,r*1.6,-r*.1,0,r*.9);g.closePath();g.stroke();g.fill();g.restore()}
function botThink(e,t){
  const d=e.data,b=S.bomb;if(t<d.think)return;d.think=t+.22+Math.random()*.18;
  let x=0,y=0;
  if(b&&b.holder===e){ // chase the nearest player who can take it
    let best=null,bd=1e9;for(const o of aliveEnts())if(o!==e&&o.data.imm<=0){const l=Math.hypot(o.data.x-d.x,o.data.y-d.y);if(l<bd){bd=l;best=o}}
    if(best){x=best.data.x-d.x;y=best.data.y-d.y;if(bd<200&&Math.random()<.35)e.input.taps++}}
  else if(b){ // run from the bomb, slide along walls
    const h=b.holder.data,dx=d.x-h.x,dy=d.y-h.y,l=Math.hypot(dx,dy)||1;
    if(l<520){x=dx/l;y=dy/l;if(l<170&&Math.random()<.3)e.input.taps++}
    const cx=(AX0+AX1)/2-d.x,cy=(AY0+AY1)/2-d.y;x+=cx/900;y+=cy/500;}
  else{x=Math.cos(t*.7+e.idx);y=Math.sin(t*.9+e.idx*2)}
  const j=(Math.random()-.5)*.9,l=Math.hypot(x,y)||1,k=.78; // robots are a bit slower and sloppier than people
  e.input.x=(x/l*Math.cos(j)-y/l*Math.sin(j))*k;e.input.y=(x/l*Math.sin(j)+y/l*Math.cos(j))*k;
  if(!b){e.input.x*=.4;e.input.y*=.4}}

(window.ACTION_GAMES=window.ACTION_GAMES||[]).push({
  id:"bomb",
  title:"Бомба",
  rules:"Коснись — и бомба у другого. Взорвался — выбыл!",
  controls:"stick+btn",
  btnLabel:"Рывок",
  duration:75,

  init(ctx){
    const hs=ctx.players,bots=[];
    for(let i=hs.length;i<3;i++)bots.push({name:`Робот ${bots.length+1}`,color:BOTCOL[bots.length%2],idx:100+i,
      input:{x:0,y:0,btn:false,taps:0},alive:true,data:{},bot:true});
    const all=hs.concat(bots),N=all.length;
    const lives=hs.length<=2?2:1,nb=N*lives-1; // number of bombs a full round takes
    let sum=0;for(let k=0;k<nb;k++)sum+=Math.pow(FMUL,k);
    S={ents:all,fx:[],pops:[],booms:[],scorch:[],shake:0,bomb:null,gap:0,n:0,ending:-1,lastPass:null,
      f0:Math.min(18,Math.max(8,50/Math.max(1,sum))),started:false,
      tiles:Array.from({length:60},()=>({x:AX0+Math.random()*(AX1-AX0),y:AY0+Math.random()*(AY1-AY0),r:6+Math.random()*16,a:Math.random()*TAU}))};
    // spawn on an ellipse around the centre, between the pillars
    const cx=(AX0+AX1)/2,cy=(AY0+AY1)/2;
    all.forEach((p,i)=>{const a=i/N*TAU-Math.PI/2;
      p.data={x:cx+Math.cos(a)*560,y:cy+Math.sin(a)*290,vx:0,vy:0,imm:0,grace:0,spr:0,cd:0,taps:p.input.taps,pb:false,think:0,trail:[],lives}});
    // the first carrier is known from the start, so the intro already shows who starts with the bomb
    const e=all[Math.random()*N|0];
    S.bomb={holder:e,left:fuseFor(0),total:fuseFor(0),fly:0,drop:0,passT:0,from:null};S.n=1;
  },

  update(ctx,dt){
    const t=ctx.t,es=ents();
    if(!S.started&&t>=START_DELAY*.75){S.started=true;if(S.bomb)ctx.banner(`Бомба: ${S.bomb.holder.name}! Все бегом!`,1.8)}
    if(S.shake>0)S.shake=Math.max(0,S.shake-dt*45);
    const live=es.filter(e=>e.alive);
    for(const e of live){const d=e.data;if(e.bot)botThink(e,t);const inp=e.input;
      const pressed=inp.taps>d.taps||(inp.btn&&!d.pb);d.taps=inp.taps;d.pb=inp.btn;
      if(pressed&&d.cd<=0&&Math.hypot(inp.x,inp.y)>.2){d.spr=SPRINT_T;d.cd=SPRINT_CD;puff(d.x,d.y,9,"s",240,.35)}
      const carrier=S.bomb&&S.bomb.holder===e,vm=d.spr>0?VSPRINT:carrier?VBOMB:VRUN;
      const k=1-Math.exp(-(d.spr>0?9:RESP)*dt);
      d.vx+=(inp.x*vm-d.vx)*k;d.vy+=(inp.y*vm-d.vy)*k;
      d.spr-=dt;d.cd-=dt;d.imm-=dt;d.grace-=dt;
      d.x+=d.vx*dt;d.y+=d.vy*dt;
      // walls
      if(d.x<AX0+PR){d.x=AX0+PR;d.vx=Math.abs(d.vx)*.5}if(d.x>AX1-PR){d.x=AX1-PR;d.vx=-Math.abs(d.vx)*.5}
      if(d.y<AY0+PR){d.y=AY0+PR;d.vy=Math.abs(d.vy)*.5}if(d.y>AY1-PR){d.y=AY1-PR;d.vy=-Math.abs(d.vy)*.5}
      for(const c of PILLARS){let nx=d.x-c.x,ny=d.y-c.y,l=Math.hypot(nx,ny);const m=c.r+PR;if(l<m){if(l<.01){nx=1;ny=0;l=.01}nx/=l;ny/=l;
        d.x=c.x+nx*m;d.y=c.y+ny*m;const vn=d.vx*nx+d.vy*ny;if(vn<0){d.vx-=vn*1.4*nx;d.vy-=vn*1.4*ny}}}
      d.trail.push({x:d.x,y:d.y});if(d.trail.length>(d.spr>0?7:2))d.trail.shift();if(d.spr<=0&&d.trail.length>1)d.trail.shift()}
    // soft body collisions
    for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){const a=live[i].data,b=live[j].data;
      let nx=b.x-a.x,ny=b.y-a.y,l=Math.hypot(nx,ny);if(l>=PR*2)continue;if(l<.01){nx=1;ny=0;l=.01}
      nx/=l;ny/=l;const ov=(PR*2-l)/2;a.x-=nx*ov;a.y-=ny*ov;b.x+=nx*ov;b.y+=ny*ov;
      const vn=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(vn<0){a.vx+=vn*.6*nx;a.vy+=vn*.6*ny;b.vx-=vn*.6*nx;b.vy-=vn*.6*ny}}
    // bomb
    const b=S.bomb;
    if(b&&t>=START_DELAY){
      if(b.fly>0)b.fly-=dt;if(b.drop>0)b.drop-=dt;
      if(b.drop<=0)b.left-=dt;
      const h=b.holder,hd=h.data;
      if(b.drop<=0&&hd.grace<=0){let best=null,bd=PASS_D;
        for(const o of live)if(o!==h&&o.data.imm<=0){const l=Math.hypot(o.data.x-hd.x,o.data.y-hd.y);if(l<bd){bd=l;best=o}}
        if(best){const od=best.data,nx=(od.x-hd.x)/(bd||1),ny=(od.y-hd.y)/(bd||1);
          // shove them apart so the new carrier has to chase again
          hd.vx-=nx*420;hd.vy-=ny*420;od.vx+=nx*200;od.vy+=ny*200;
          giveBomb(best,h,t);pop((hd.x+od.x)/2,(hd.y+od.y)/2-40,"Пас!","#ffc94a");puff((hd.x+od.x)/2,(hd.y+od.y)/2,12,"s",300,.35);S.shake=Math.max(S.shake,6)}}
      if(b.left<=0)explode(ctx)}
    else if(!b&&S.gap>0){S.gap-=dt;if(S.gap<=0&&live.length>1)newBomb(ctx)}
    for(const f of S.fx){f.x+=f.vx*dt;f.y+=f.vy*dt;f.vx*=.93;f.vy*=.93;if(f.col==="k")f.vy-=30*dt;f.l-=dt}
    S.fx=S.fx.filter(f=>f.l>0);
    for(const p of S.pops){p.y-=50*dt;p.l-=dt}S.pops=S.pops.filter(p=>p.l>0);
    for(const o of S.booms)o.l+=dt;S.booms=S.booms.filter(o=>o.l<1.1);
    // end: one survivor left, or (with 2+ people) at most one person left, or nobody human left
    const hs=ctx.players,humansAlive=hs.filter(p=>p.alive).length,entsAlive=live.length;
    const over=entsAlive<=1||humansAlive===0||(hs.length>=2&&humansAlive<=1);
    if(over){if(S.ending<0)S.ending=t;if(t-S.ending>1.3)ctx.finish()}
    // carrier's phone: big red warning + seconds left, one buzz when the bomb arrives
    const bb=S.bomb;
    for(const p of hs){if(!p.alive)continue;const mine=!!bb&&bb.holder===p&&t>=START_DELAY*.75;
      if(mine)ctx.status(p,`БОМБА У ТЕБЯ! ${Math.max(0,Math.ceil(bb.left))} с`,{color:"red",vibrate:p.data.hadB?0:350});
      else if(p.data.hadB)ctx.status(p,"");
      p.data.hadB=mine}
  },

  // timeout / admin "Дальше": survivors ranked by distance from the bomb, the carrier last among them
  standings(ctx){
    const b=S.bomb,h=b&&b.holder;
    const dist=p=>h?Math.hypot(p.data.x-h.data.x,p.data.y-h.data.y):0;
    return ctx.players.filter(p=>p.alive).sort((a,c)=>(a===h)-(c===h)||dist(c)-dist(a))},

  draw(ctx,g){
    const W=ctx.W,H=ctx.H,now=performance.now()/1000,b=S.bomb;
    if(S.shake>0)g.translate((Math.random()-.5)*S.shake,(Math.random()-.5)*S.shake);
    // background + arena floor
    const bg=g.createLinearGradient(0,0,0,H);bg.addColorStop(0,"#1d1033");bg.addColorStop(1,"#0d0619");g.fillStyle=bg;g.fillRect(-30,-30,W+60,H+60);
    const danger=b&&b.left<4&&b.drop<=0?(1-b.left/4):0;
    g.fillStyle="rgba(0,0,0,.45)";g.beginPath();g.roundRect(AX0-14,AY0-6,AX1-AX0+28,AY1-AY0+30,30);g.fill();
    const fg=g.createRadialGradient(W/2,H/2,80,W/2,H/2,900);fg.addColorStop(0,"#3b2d55");fg.addColorStop(1,"#241838");
    g.fillStyle=fg;g.beginPath();g.roundRect(AX0,AY0,AX1-AX0,AY1-AY0,24);g.fill();
    g.save();g.beginPath();g.roundRect(AX0,AY0,AX1-AX0,AY1-AY0,24);g.clip();
    g.strokeStyle="rgba(255,255,255,.05)";g.lineWidth=2;
    for(let x=AX0;x<AX1;x+=80){g.beginPath();g.moveTo(x,AY0);g.lineTo(x,AY1);g.stroke()}
    for(let y=AY0;y<AY1;y+=80){g.beginPath();g.moveTo(AX0,y);g.lineTo(AX1,y);g.stroke()}
    for(const s of S.tiles){g.fillStyle="rgba(255,255,255,.025)";g.beginPath();g.arc(s.x,s.y,s.r,0,TAU);g.fill()}
    // scorch marks where people blew up
    for(const s of S.scorch){const sg=g.createRadialGradient(s.x,s.y,4,s.x,s.y,s.r*1.6);sg.addColorStop(0,"rgba(0,0,0,.75)");sg.addColorStop(.6,"rgba(20,8,10,.45)");sg.addColorStop(1,"rgba(0,0,0,0)");
      g.fillStyle=sg;g.beginPath();g.arc(s.x,s.y,s.r*1.6,0,TAU);g.fill();
      g.font='800 22px "Manrope",system-ui,sans-serif';g.textAlign="center";g.textBaseline="middle";g.fillStyle="rgba(255,255,255,.35)";g.fillText(s.name,s.x,s.y)}
    if(danger>0){g.fillStyle=`rgba(255,40,60,${danger*.16*(.6+.4*Math.sin(now*18))})`;g.fillRect(AX0,AY0,AX1-AX0,AY1-AY0)}
    g.restore();
    // hazard-striped border
    g.save();g.beginPath();g.roundRect(AX0-12,AY0-12,AX1-AX0+24,AY1-AY0+24,32);g.roundRect(AX0,AY0,AX1-AX0,AY1-AY0,24);g.clip("evenodd");
    g.fillStyle="#ffc94a";g.fillRect(AX0-14,AY0-14,AX1-AX0+28,AY1-AY0+28);g.fillStyle="#170c2b";
    for(let k=-H;k<W+H;k+=44){g.beginPath();g.moveTo(k,0);g.lineTo(k+22,0);g.lineTo(k+22-H,H);g.lineTo(k-H,H);g.fill()}
    g.restore();
    // pillars (crates)
    for(const c of PILLARS){g.fillStyle="rgba(0,0,0,.35)";g.beginPath();g.ellipse(c.x+8,c.y+14,c.r,c.r*.9,0,0,TAU);g.fill();
      const pg=g.createLinearGradient(c.x-c.r,c.y-c.r,c.x+c.r,c.y+c.r);pg.addColorStop(0,"#7a5a9e");pg.addColorStop(1,"#4a3366");
      g.fillStyle=pg;g.beginPath();g.arc(c.x,c.y,c.r,0,TAU);g.fill();g.lineWidth=6;g.strokeStyle="#170c2b";g.stroke();
      g.strokeStyle="rgba(255,255,255,.18)";g.lineWidth=4;g.beginPath();g.arc(c.x,c.y,c.r*.62,0,TAU);g.stroke()}
    // players
    const live=ents().filter(e=>e.alive).sort((a,c)=>a.data.y-c.data.y);
    for(const e of live){const d=e.data,carrier=b&&b.holder===e;
      for(let i=0;i<d.trail.length-1;i++){const q=d.trail[i];g.globalAlpha=.1+.25*i/d.trail.length;g.fillStyle=e.color;g.beginPath();g.arc(q.x,q.y,PR*(.6+.4*i/d.trail.length),0,TAU);g.fill()}
      g.globalAlpha=1;
      if(carrier){ // red pulsing danger zone, faster as the fuse burns down
        const f=b.left/b.total,rate=4+14*(1-f),pul=.5+.5*Math.sin(now*rate);
        g.fillStyle=`rgba(255,60,80,${.16+.18*pul})`;g.beginPath();g.arc(d.x,d.y,PASS_D+6+pul*8,0,TAU);g.fill();
        g.strokeStyle="rgba(23,12,43,.6)";g.lineWidth=12;g.beginPath();g.arc(d.x,d.y,PR+14,0,TAU);g.stroke();
        g.strokeStyle=f>.5?"#ffc94a":f>.25?"#ff9f43":"#ff3b55";g.lineWidth=8;g.lineCap="round";
        g.beginPath();g.arc(d.x,d.y,PR+14,-Math.PI/2,-Math.PI/2+TAU*Math.max(0,f));g.stroke();g.lineCap="butt"}
      if(d.imm>0){g.save();g.setLineDash([10,9]);g.lineDashOffset=-now*40;g.strokeStyle=`rgba(156,240,255,${.5+.5*Math.min(1,d.imm/.4)})`;g.lineWidth=5;
        g.beginPath();g.arc(d.x,d.y,PR+10,0,TAU);g.stroke();g.restore()}
      if(d.spr>0){g.strokeStyle="#fff";g.lineWidth=5;g.beginPath();g.arc(d.x,d.y,PR+3,0,TAU);g.stroke()}
      ctx.drawPlayer(g,e,d.x,d.y,PR);
      if(d.lives>1)for(let i=0;i<d.lives;i++)heart(g,d.x+(i-(d.lives-1)/2)*26,d.y+PR+16,10)}
    // the bomb itself (flies between players on a pass, drops from above when new)
    if(b){const hd=b.holder.data;let bx=hd.x+PR*1.05,by=hd.y+PR*.2;
      if(b.fly>0){const k=1-b.fly/.22;bx=b.fx+(bx-b.fx)*k;by=b.fy+(by-b.fy)*k-Math.sin(k*Math.PI)*70}
      if(b.drop>0){const k=b.drop/.55;by-=k*k*500;g.globalAlpha=1-k*.5}
      const f=Math.max(0,b.left/b.total),R=32,tick=.5+.5*Math.sin(now*(4+14*(1-f))),sc=1+tick*.07*(1+2*(1-f));
      g.save();g.translate(bx,by);g.scale(sc,sc);
      g.fillStyle="rgba(0,0,0,.3)";g.beginPath();g.ellipse(4,R*.8,R*.9,R*.35,0,0,TAU);g.fill();
      // fuse: length shrinks with time left, spark at the tip
      const fl=10+46*f,cx1=8,cy1=-R-8;
      g.strokeStyle="#c9a86a";g.lineWidth=5;g.lineCap="round";g.beginPath();g.moveTo(R*.45,-R*.8);
      const tx=R*.45+fl*.75,ty=-R*.8-fl*.6;g.quadraticCurveTo(cx1+fl*.6,cy1-fl*.15,tx,ty);g.stroke();
      for(let i=0;i<5;i++){const a=Math.random()*TAU,l=4+Math.random()*12;g.strokeStyle=i%2?"#ffc94a":"#fff";g.lineWidth=3;g.beginPath();g.moveTo(tx,ty);g.lineTo(tx+Math.cos(a)*l,ty+Math.sin(a)*l);g.stroke()}
      g.fillStyle="#fff7c2";g.beginPath();g.arc(tx,ty,5,0,TAU);g.fill();
      g.fillStyle="#3a3350";g.fillRect(R*.2,-R*1.0,R*.55,R*.4);
      const bgr=g.createRadialGradient(-R*.35,-R*.35,2,0,0,R);bgr.addColorStop(0,"#5a5470");bgr.addColorStop(1,f<.25&&tick>.5?"#5a0d18":"#120c1e");
      g.fillStyle=bgr;g.beginPath();g.arc(0,0,R,0,TAU);g.fill();g.lineWidth=4;g.strokeStyle="#000";g.stroke();
      g.fillStyle="rgba(255,255,255,.4)";g.beginPath();g.ellipse(-R*.38,-R*.4,R*.25,R*.14,-.6,0,TAU);g.fill();
      {const s=Math.ceil(b.left);g.font='900 30px "Unbounded","Arial Black",system-ui,sans-serif';g.textAlign="center";g.textBaseline="middle";
        g.fillStyle=s<=3?"#ff5d73":"#fff";g.fillText(String(s),0,2)}
      g.restore();g.globalAlpha=1;
      // big countdown for the last 3 seconds, above the carrier's name
      if(b.drop<=0&&b.left<=3&&ctx.t>=START_DELAY){const s=Math.ceil(b.left),fr=s-b.left;
        g.save();g.translate(hd.x,hd.y-PR-70);g.scale(1+fr*.5,1+fr*.5);g.globalAlpha=.4+.6*(1-fr);
        g.font='900 64px "Unbounded","Arial Black",system-ui,sans-serif';g.textAlign="center";g.textBaseline="middle";g.lineJoin="round";
        g.lineWidth=10;g.strokeStyle="rgba(23,12,43,.92)";g.strokeText(String(s),0,0);g.fillStyle="#ff5d73";g.fillText(String(s),0,0);g.restore()}}
    // explosions
    for(const o of S.booms){const k=o.l/1.1;
      if(o.l<.12){g.fillStyle=`rgba(255,250,220,${1-o.l/.12})`;g.fillRect(-30,-30,W+60,H+60)}
      g.strokeStyle=`rgba(255,201,74,${1-k})`;g.lineWidth=26*(1-k)+2;g.beginPath();g.arc(o.x,o.y,40+k*320,0,TAU);g.stroke();
      g.strokeStyle=`rgba(255,93,115,${.8*(1-k)})`;g.lineWidth=14*(1-k)+2;g.beginPath();g.arc(o.x,o.y,20+k*220,0,TAU);g.stroke();
      const fg2=g.createRadialGradient(o.x,o.y,0,o.x,o.y,140*(1-k*.5));fg2.addColorStop(0,`rgba(255,240,180,${1-k})`);fg2.addColorStop(.5,`rgba(255,120,40,${.8*(1-k)})`);fg2.addColorStop(1,"rgba(255,60,40,0)");
      g.fillStyle=fg2;g.beginPath();g.arc(o.x,o.y,140,0,TAU);g.fill()}
    for(const f of S.fx){const a=Math.max(0,f.l/f.L);g.globalAlpha=f.col==="k"?a*.6:a;
      g.fillStyle=f.col==="f"?(a>.6?"#fff2b0":a>.3?"#ff9f43":"#ff5d73"):f.col==="k"?"#2a2238":"#fff6d0";
      g.beginPath();g.arc(f.x,f.y,f.col==="k"?f.r*(2-a):f.r,0,TAU);g.fill()}
    g.globalAlpha=1;
    g.textAlign="center";g.textBaseline="middle";g.lineJoin="round";
    for(const p of S.pops){g.globalAlpha=Math.min(1,p.l*2);g.font='900 40px "Unbounded","Arial Black",system-ui,sans-serif';
      g.lineWidth=9;g.strokeStyle="rgba(23,12,43,.92)";g.strokeText(p.text,p.x,p.y);g.fillStyle=p.col;g.fillText(p.text,p.x,p.y)}
    g.globalAlpha=1;
    // HUD: survivors (left), bomb number (right)
    const al=ents().filter(e=>e.alive).length;
    g.font='800 30px "Manrope",system-ui,sans-serif';g.textBaseline="middle";
    g.fillStyle="rgba(23,12,43,.85)";g.beginPath();g.roundRect(20,18,300,58,29);g.fill();
    g.textAlign="left";g.fillStyle="#fbf4ff";g.fillText(`Живы: ${al} из ${ents().length}`,44,48);
    const label=b?"Бомба: "+(b.holder.name.length>12?b.holder.name.slice(0,11)+"…":b.holder.name):"Новая бомба…";
    g.font='800 30px "Manrope",system-ui,sans-serif';const tw=Math.max(300,g.measureText(label).width+130);
    g.fillStyle="rgba(23,12,43,.85)";g.beginPath();g.roundRect(W-20-tw,18,tw,58,29);g.fill();
    g.fillStyle="#120c1e";g.beginPath();g.arc(W-20-tw+38,47,16,0,TAU);g.fill();g.strokeStyle="#ff5d73";g.lineWidth=3;g.stroke();
    g.fillStyle="#ffc94a";g.beginPath();g.arc(W-20-tw+50,30,4+2*Math.sin(now*12),0,TAU);g.fill();
    g.textAlign="left";g.fillStyle=b?"#ff8a9a":"#fbf4ff";g.fillText(label,W-20-tw+68,48);
  }
});
})();

/* «Метеоритный дождь»: meteors rain onto a rocky plateau. Every impact point is telegraphed by a growing red
   shadow (1.3-2.1 s, generous for phone lag). Getting hit eliminates; density ramps up, big meteors now and then.
   Last survivor(s) win; the engine's default order ranks the rest by survival time. Contract: docs/action-games-spec.md */
(()=>{
const TAU=Math.PI*2;
// arena (plateau) rect; the top strip stays free for the HUD and the engine's timer pill
const AX=40,AY=100,AWD=1520,AHT=772,AR=46;
// movement: momentum on dusty ground, terminal speed ~ACC/DRAG; slow enough that 0.5 s of lag does not throw you far
const PR=34,ACC=1350,DRAG=3.4,VMAX=420;
// meteors: radius, telegraph time; the hit test is forgiving (centre must be well inside the zone)
const MR=[78,104],BIG_R=185,TELE=1.4,TELE_BIG=2.1,HIT_IN=PR*.35,FALL_VIS=.55,GRACE=2.2;
const FALL_DX=-0.5,FALL_DY=-1; // meteors come in from the upper left
let S=null;

const rnd=(a,b)=>a+Math.random()*(b-a);
const clampX=x=>Math.max(AX+PR,Math.min(AX+AWD-PR,x)),clampY=y=>Math.max(AY+PR,Math.min(AY+AHT-PR,y));
function insideRR(x,y,m){ // point inside the rounded arena rect shrunk by m
  const x0=AX+m,y0=AY+m,x1=AX+AWD-m,y1=AY+AHT-m,r=Math.max(0,AR-m);
  if(x<x0||x>x1||y<y0||y>y1)return false;
  const cx=Math.max(x0+r,Math.min(x1-r,x)),cy=Math.max(y0+r,Math.min(y1-r,y));return Math.hypot(x-cx,y-cy)<=r}

function spawnRate(t,n){ // meteors per second
  const base=t<GRACE?0:Math.min(3.6,.85+t*.05+(t>40?(t-40)*.09:0));
  return base*(.8+.07*Math.min(10,n))}
function addMeteor(ctx,x,y,big){
  const r=big?BIG_R:rnd(MR[0],MR[1]),T=big?TELE_BIG:TELE;
  S.met.push({x:Math.max(AX+20,Math.min(AX+AWD-20,x)),y:Math.max(AY+20,Math.min(AY+AHT-20,y)),r,T,age:0,big,rot:Math.random()*TAU,
    spin:rnd(-3,3),lumps:Array.from({length:9},()=>rnd(.78,1.08))})}
function spawn(ctx){
  const live=ctx.players.filter(p=>p.alive);
  // half of the meteors hunt a random survivor (aimed a little ahead of where they are going), the rest fall anywhere
  if(live.length&&Math.random()<.5){const p=live[Math.random()*live.length|0],d=p.data;
    addMeteor(ctx,d.x+d.vx*.45+rnd(-70,70),d.y+d.vy*.45+rnd(-70,70),false)}
  else{let x,y,k=0;do{x=rnd(AX+40,AX+AWD-40);y=rnd(AY+40,AY+AHT-40);k++}
    while(k<6&&S.met.some(m=>Math.hypot(m.x-x,m.y-y)<m.r*.8));addMeteor(ctx,x,y,false)}}
function puff(x,y,n,kind,sp,life,size){for(let i=0;i<n;i++){const a=Math.random()*TAU,v=sp*(.25+Math.random()*.75);
  S.fx.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,l:life*(.5+Math.random()*.5),L:life,kind,r:size*(.5+Math.random()*.8)})}}

function makeGround(){ // pre-rendered plateau: rock gradient, old craters, pebbles
  const c=document.createElement("canvas");c.width=1600;c.height=900;const g=c.getContext("2d");
  const rr=()=>{g.beginPath();g.roundRect(AX,AY,AWD,AHT,AR)};
  g.fillStyle="rgba(0,0,0,.5)";g.beginPath();g.roundRect(AX+8,AY+16,AWD,AHT,AR);g.fill();
  g.fillStyle="#5a2f2a";g.beginPath();g.roundRect(AX,AY+10,AWD,AHT,AR);g.fill(); // cliff edge
  const gr=g.createRadialGradient(800,450,80,800,480,900);gr.addColorStop(0,"#b7714c");gr.addColorStop(.6,"#9a5a3e");gr.addColorStop(1,"#6e3b2e");
  g.fillStyle=gr;rr();g.fill();
  g.save();rr();g.clip();
  for(let i=0;i<26;i++){const x=rnd(AX,AX+AWD),y=rnd(AY,AY+AHT),r=rnd(18,70);
    g.fillStyle="rgba(70,30,22,.14)";g.beginPath();g.ellipse(x,y,r,r*.8,0,0,TAU);g.fill();
    g.strokeStyle="rgba(255,220,180,.09)";g.lineWidth=4;g.beginPath();g.ellipse(x,y-2,r,r*.8,0,Math.PI*1.05,Math.PI*1.95);g.stroke()}
  for(let i=0;i<420;i++){g.fillStyle=Math.random()<.5?"rgba(70,30,22,.35)":"rgba(255,215,170,.18)";const s=rnd(2,6);g.fillRect(rnd(AX,AX+AWD),rnd(AY,AY+AHT),s,s)}
  g.restore();
  g.lineWidth=6;g.strokeStyle="rgba(255,200,150,.35)";rr();g.stroke();
  return c}

(window.ACTION_GAMES=window.ACTION_GAMES||[]).push({
  id:"meteors",
  title:"Метеоритный дождь",
  rules:"Беги от красных кругов! Последний живой побеждает.",
  controls:"stick",
  duration:70,

  init(ctx){
    S={met:[],fx:[],scars:[],shake:0,acc:0,nextBig:10,storm:false,ending:-1,lastBanner:-9,ground:null,
      stars:Array.from({length:120},()=>({x:Math.random()*1600,y:Math.random()*900,s:rnd(1,3),p:Math.random()*TAU}))};
    const n=ctx.players.length;
    ctx.players.forEach((p,i)=>{const a=i/n*TAU-Math.PI/2,k=n>1?1:0;
      p.data={x:800+Math.cos(a)*330*k,y:488+Math.sin(a)*240*k,vx:0,vy:0,deadT:-1,survived:0}})
  },

  update(ctx,dt){
    const t=ctx.t,ps=ctx.players,live=ps.filter(p=>p.alive);
    if(S.shake>0)S.shake=Math.max(0,S.shake-dt*45);
    // movement with momentum, soft walls
    for(const p of live){const d=p.data,inp=p.input;
      d.vx+=inp.x*ACC*dt;d.vy+=inp.y*ACC*dt;const k=Math.exp(-DRAG*dt);d.vx*=k;d.vy*=k;
      const sp=Math.hypot(d.vx,d.vy);if(sp>VMAX){d.vx*=VMAX/sp;d.vy*=VMAX/sp}
      d.x+=d.vx*dt;d.y+=d.vy*dt;
      const nx=clampX(d.x),ny=clampY(d.y);if(nx!==d.x){d.x=nx;d.vx*=-.3}if(ny!==d.y){d.y=ny;d.vy*=-.3}
      d.survived=t}
    // players bump each other (no overlap, a little shove)
    for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){const a=live[i].data,b=live[j].data;
      let nx=b.x-a.x,ny=b.y-a.y,dd=Math.hypot(nx,ny);if(dd>=PR*2)continue;if(dd<.01){nx=1;ny=0;dd=.01}
      nx/=dd;ny/=dd;const ov=(PR*2-dd)/2;a.x-=nx*ov;a.y-=ny*ov;b.x+=nx*ov;b.y+=ny*ov;
      const vn=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(vn<0){const j2=-vn*.8;a.vx-=j2*nx;a.vy-=j2*ny;b.vx+=j2*nx;b.vy+=j2*ny}}
    // spawning
    if(!S.storm&&t>=40){S.storm=true;ctx.banner("Метеоритный шторм!",2);S.lastBanner=t}
    S.acc+=spawnRate(t,ps.length)*dt;
    while(S.acc>=1){S.acc-=1;spawn(ctx)}
    if(t>=S.nextBig&&live.length){S.nextBig=t+rnd(7,10);
      // the big one lands near the middle of the crowd so it really reshuffles everybody
      const mx=live.reduce((s,p)=>s+p.data.x,0)/live.length,my=live.reduce((s,p)=>s+p.data.y,0)/live.length;
      addMeteor(ctx,mx+rnd(-120,120),my+rnd(-90,90),true);ctx.banner("Большой метеорит!",1.5);S.lastBanner=t}
    // meteors fall and hit
    for(const m of S.met){m.age+=dt;m.rot+=m.spin*dt;
      if(m.age>=m.T&&!m.done){m.done=true;
        S.shake=Math.min(18,S.shake+(m.big?16:6));
        puff(m.x,m.y,m.big?46:22,"fire",m.big?620:400,m.big?.9:.6,m.big?16:10);
        puff(m.x,m.y,m.big?26:12,"rock",m.big?520:340,m.big?1.1:.8,m.big?9:6);
        S.fx.push({x:m.x,y:m.y,kind:"ring",r:m.r,l:.5,L:.5});
        S.scars.push({x:m.x,y:m.y,r:m.r,born:t,rot:m.rot});
        const hit=[];
        for(const p of ps){if(!p.alive)continue;const d=p.data;
          if(Math.hypot(d.x-m.x,d.y-m.y)<m.r+HIT_IN){hit.push(p);d.deadT=0;const a=Math.atan2(d.y-m.y,d.x-m.x);d.vx=Math.cos(a)*260;d.vy=Math.sin(a)*260}}
        for(const p of hit)ctx.eliminate(p);
        if(hit.length&&ps.filter(p=>p.alive).length>(ps.length>1?1:0)){
          ctx.banner(hit.length>1?`Сбиты: ${hit.map(p=>p.name).join(", ")}`:`${hit[0].name} сбит!`,1.4);S.lastBanner=t}}}
    S.met=S.met.filter(m=>!m.done);
    if(S.scars.length>40)S.scars.shift();
    S.scars=S.scars.filter(s=>t-s.born<9);
    for(const p of ps){const d=p.data;if(d.deadT<0)continue;d.deadT+=dt;d.x+=d.vx*dt;d.y+=d.vy*dt;d.vx*=.9;d.vy*=.9}
    for(const f of S.fx){if(f.kind==="ring"){f.l-=dt;continue}f.x+=f.vx*dt;f.y+=f.vy*dt;f.vx*=.92;f.vy*=.92;f.l-=dt}
    S.fx=S.fx.filter(f=>f.l>0);
    // end: one survivor left (or nobody in a solo game) -> short pause so the hit is visible, then finish
    const alive=ps.filter(p=>p.alive).length;
    if(ps.length>1?alive<=1:alive===0){if(S.ending<0){S.ending=t;
        const w=ps.find(p=>p.alive);ctx.banner(w?`${w.name} выжил!`:"Никто не выжил!",2)}
      if(t-S.ending>1.2)ctx.finish()}
  },

  draw(ctx,g){
    const W=ctx.W,H=ctx.H,now=performance.now()/1000,t=ctx.t;
    if(!S.ground)S.ground=makeGround();
    if(S.shake>0)g.translate((Math.random()-.5)*S.shake,(Math.random()-.5)*S.shake);
    // night sky
    const sk=g.createLinearGradient(0,0,0,H);sk.addColorStop(0,"#140a2e");sk.addColorStop(1,"#2b1236");g.fillStyle=sk;g.fillRect(-30,-30,W+60,H+60);
    for(const s of S.stars){g.globalAlpha=.4+.4*Math.sin(now*2+s.p);g.fillStyle="#fff";g.fillRect(s.x,s.y,s.s,s.s)}g.globalAlpha=1;
    g.drawImage(S.ground,0,0);
    // fresh craters: glowing at first, cooling down to dark scars
    g.save();g.beginPath();g.roundRect(AX,AY,AWD,AHT,AR);g.clip();
    for(const s of S.scars){const age=t-s.born,fade=Math.max(0,1-age/9);
      g.fillStyle=`rgba(40,16,14,${.4*fade})`;g.beginPath();g.ellipse(s.x,s.y,s.r*.78,s.r*.66,0,0,TAU);g.fill();
      g.strokeStyle=`rgba(255,210,170,${.22*fade})`;g.lineWidth=5;g.beginPath();g.ellipse(s.x,s.y-3,s.r*.78,s.r*.66,0,Math.PI*1.05,Math.PI*1.95);g.stroke();
      if(age<2.5){const k=1-age/2.5,gl=g.createRadialGradient(s.x,s.y,0,s.x,s.y,s.r*.7);gl.addColorStop(0,`rgba(255,200,80,${.8*k})`);gl.addColorStop(1,"rgba(255,80,30,0)");
        g.fillStyle=gl;g.beginPath();g.arc(s.x,s.y,s.r*.7,0,TAU);g.fill()}}
    // telegraph: dashed danger circle at full size from the start + a red shadow growing inside it
    for(const m of S.met){const k=Math.min(1,m.age/m.T),pulse=.5+.5*Math.sin(now*(10+k*14));
      g.fillStyle=`rgba(255,40,50,${.10+.12*k})`;g.beginPath();g.arc(m.x,m.y,m.r,0,TAU);g.fill();
      const sg=g.createRadialGradient(m.x,m.y,0,m.x,m.y,m.r*k);sg.addColorStop(0,`rgba(120,0,10,${.45+.35*k})`);sg.addColorStop(1,`rgba(255,30,40,${.25+.35*k})`);
      g.fillStyle=sg;g.beginPath();g.arc(m.x,m.y,Math.max(1,m.r*(.15+.85*k)),0,TAU);g.fill();
      g.setLineDash([18,12]);g.lineDashOffset=-now*40;g.lineWidth=m.big?8:6;g.strokeStyle=`rgba(255,${90+80*pulse|0},${90+60*pulse|0},${.75+.25*k})`;
      g.beginPath();g.arc(m.x,m.y,m.r,0,TAU);g.stroke();g.setLineDash([]);
      if(m.big){g.font='900 46px "Unbounded","Arial Black",sans-serif';g.textAlign="center";g.textBaseline="middle";g.lineJoin="round";
        g.lineWidth=8;g.strokeStyle="rgba(23,12,43,.85)";g.strokeText("!",m.x,m.y);g.fillStyle="#ffc94a";g.fillText("!",m.x,m.y)}}
    g.restore();
    // players (the hit ones fly back and fade as smoky ghosts)
    const ps=ctx.players.filter(p=>p.alive||(p.data.deadT>=0&&p.data.deadT<1.4)).sort((a,b)=>a.data.y-b.data.y);
    for(const p of ps){const d=p.data;
      if(!p.alive){const k=d.deadT/1.4;g.save();g.globalAlpha=1-k;ctx.drawPlayer(g,p,d.x,d.y-k*40,PR*(1-k*.4));g.restore();continue}
      // warning ring when standing in a red zone
      const danger=S.met.some(m=>Math.hypot(d.x-m.x,d.y-m.y)<m.r+HIT_IN);
      if(danger){g.strokeStyle=`rgba(255,255,255,${.6+.4*Math.sin(now*20)})`;g.lineWidth=5;g.beginPath();g.arc(d.x,d.y,PR+8,0,TAU);g.stroke()}
      ctx.drawPlayer(g,p,d.x,d.y,PR)}
    // falling rocks with fiery trails (only during the last part of the telegraph)
    for(const m of S.met){const left=m.T-m.age;if(left>FALL_VIS)continue;const u=left/FALL_VIS,dist=900*u,sz=(m.big?62:30)*(1-u*.35);
      const x=m.x+FALL_DX*dist,y=m.y+FALL_DY*dist,tl=m.big?420:260;
      const tg=g.createLinearGradient(x,y,x+FALL_DX*tl,y+FALL_DY*tl);tg.addColorStop(0,"rgba(255,230,140,.95)");tg.addColorStop(.3,"rgba(255,120,40,.7)");tg.addColorStop(1,"rgba(255,60,30,0)");
      g.strokeStyle=tg;g.lineCap="round";g.lineWidth=sz*1.5;g.beginPath();g.moveTo(x,y);g.lineTo(x+FALL_DX*tl,y+FALL_DY*tl);g.stroke();
      const gl=g.createRadialGradient(x,y,0,x,y,sz*2.2);gl.addColorStop(0,"rgba(255,200,90,.7)");gl.addColorStop(1,"rgba(255,90,30,0)");g.fillStyle=gl;g.beginPath();g.arc(x,y,sz*2.2,0,TAU);g.fill();
      g.fillStyle="#4a2a24";g.beginPath();m.lumps.forEach((l,i)=>{const a=m.rot+i/m.lumps.length*TAU,rx=x+Math.cos(a)*sz*l,ry=y+Math.sin(a)*sz*l;i?g.lineTo(rx,ry):g.moveTo(rx,ry)});g.closePath();g.fill();
      g.strokeStyle="#ffb35c";g.lineWidth=4;g.stroke()}
    // explosions
    for(const f of S.fx){const k=Math.max(0,f.l/f.L);
      if(f.kind==="ring"){const rr=f.r*(1.05+(1-k)*.6);g.strokeStyle=`rgba(255,230,170,${k})`;g.lineWidth=14*k+2;g.beginPath();g.arc(f.x,f.y,rr,0,TAU);g.stroke();continue}
      g.globalAlpha=k;g.fillStyle=f.kind==="fire"?(k>.5?"#ffe08a":"#ff7a3d"):"#5b3328";g.beginPath();g.arc(f.x,f.y,f.r*(f.kind==="fire"?.6+k*.6:1),0,TAU);g.fill()}
    g.globalAlpha=1;
    // HUD (top-left: survivors, top-right: danger level) — the top centre belongs to the engine's timer
    const al=ctx.players.filter(p=>p.alive).length;
    g.font='800 32px "Manrope",system-ui,sans-serif';g.textBaseline="middle";
    g.fillStyle="rgba(23,12,43,.8)";g.beginPath();g.roundRect(20,18,300,60,30);g.fill();
    g.textAlign="left";g.fillStyle="#fbf4ff";g.fillText(`Живы: ${al} из ${ctx.players.length}`,44,49);
    const lvl=Math.min(5,1+Math.floor(t/12));
    g.fillStyle="rgba(23,12,43,.8)";g.beginPath();g.roundRect(W-370,18,350,60,30);g.fill();
    g.textAlign="left";g.fillStyle="#fbf4ff";g.fillText("Опасность",W-348,49);
    for(let i=0;i<5;i++){g.fillStyle=i<lvl?(lvl>=4?"#ff5d73":"#ffc94a"):"rgba(255,255,255,.18)";g.beginPath();g.roundRect(W-150+i*24,32,16,34,5);g.fill()}
  }
});
})();

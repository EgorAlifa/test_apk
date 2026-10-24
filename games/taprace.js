/* «Гонка тапов»: rockets race left → right in lanes, every tap on the phone pushes yours forward.
   Now and then the light turns yellow (≈1.4 s warning), then red «СТОП!»: taps during red push you back.
   Ranking: finish order, then distance. Contract: docs/action-games-spec.md */
(()=>{
const L=100;                       // track length, metres
const X0=150,X1=1450,TOP=104,BOT=884; // racer x at 0 m / at the finish, lanes area
const IMP=.5,DRAG=1.6,VMAX=7.5;   // m/s added per tap, drag per s, speed cap (≈8 taps/s → ~2.5 m/s, ~40 s race)
const RATE=15,BURST=8;             // tap rate cap: token bucket 15/s, bursts up to 8 (latency bunches taps together)
const WARN=1.4,GRACE=.6,PEN=2,PEN_MAX=10; // yellow warning s, red taps ignored for this long (lag), metres back per tap, max per stop
const AFTER=12;                    // the rest get this many seconds after the first finisher
const TAU=Math.PI*2,F='"Unbounded","Arial Black",system-ui,sans-serif',B='"Manrope",system-ui,sans-serif';
let S=null;

function laneY(ctx,i){const n=ctx.players.length+(S&&S.ghost?1:0),h=Math.min(150,(BOT-TOP)/n),top=TOP+((BOT-TOP)-h*n)/2;return{y:top+h*(i+.5),h,top:top+h*i}}
function laneR(ctx){return Math.max(20,Math.min(34,laneY(ctx,0).h*.29))}
function px(pos){return X0+Math.min(1,pos/L)*(X1-X0)}
function nextStop(t){return t+7+Math.random()*4.5}
function puff(x,y,n,col,sp,life,dir){for(let i=0;i<n;i++){const a=(dir==null?Math.random()*TAU:dir+(Math.random()-.5)*.9),v=sp*(.3+Math.random()*.7);
  S.fx.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,l:life*(.6+Math.random()*.4),L:life,col,r:3+Math.random()*6})}}
function float(x,y,text,col){S.txt.push({x,y,text,col,l:1.1})}
// solo round: a faded robot paces in a second lane so one player still has someone to beat
const GHOST_V=2.6,GHOST={name:"Робот",color:"#9a8fbf",alive:false,idx:7,input:{x:0,y:0}};
function order(ctx){return ctx.players.slice().sort((a,b)=>{const A=a.data,Bd=b.data;
  if(A.fin>=0||Bd.fin>=0)return (A.fin<0?1e9:A.fin)-(Bd.fin<0?1e9:Bd.fin);return Bd.pos-A.pos||a.idx-b.idx})}

(window.ACTION_GAMES=window.ACTION_GAMES||[]).push({
  id:"taprace",
  title:"Гонка тапов",
  rules:"Жми быстрее всех! На красный «СТОП» не жми — откатит!",
  controls:"tap",
  duration:75,

  init(ctx){
    S={started:false,warnedEnd:false,light:"green",lt:0,stopAt:nextStop(3),redFor:0,fx:[],txt:[],first:-1,ending:-1,nfin:0,flash:0,
      stars:Array.from({length:120},()=>({x:Math.random()*1600,y:Math.random()*900,s:.5+Math.random()*2.2,v:20+Math.random()*60}))};
    S.ghost=ctx.players.length===1?{pos:0,v:0,fin:-1,shake:0,hurt:0}:null;
    ctx.players.forEach(p=>{p.data={pos:0,v:0,taps:p.input.taps,tok:BURST,fin:-1,place:0,pen:0,hurt:0,shake:0,tapT:-9,rate:0,tapsTotal:0}})
  },

  update(ctx,dt){
    const t=ctx.t,ps=ctx.players;
    if(!S.started){S.started=true;ps.forEach(p=>p.data.taps=p.input.taps)} // taps pressed during the intro do not count
    // --- traffic light: green → yellow (warning) → red (СТОП) → green
    S.lt+=dt;const racing=ps.some(p=>p.data.fin<0);
    if(S.light==="green"&&t>=S.stopAt&&racing){S.light="yellow";S.lt=0}
    else if(S.light==="yellow"&&S.lt>=WARN){S.light="red";S.lt=0;S.redFor=2+Math.random()*1.2;S.flash=1;ps.forEach(p=>p.data.pen=0)}
    else if(S.light==="red"&&S.lt>=S.redFor){S.light="green";S.lt=0;S.stopAt=nextStop(t);ctx.banner("ЖМИ!",.8)}
    if(S.flash>0)S.flash=Math.max(0,S.flash-dt*2);
    for(const p of ps){const d=p.data,inp=p.input;
      let n=Math.max(0,inp.taps-d.taps);d.taps=inp.taps;
      d.tok=Math.min(BURST,d.tok+RATE*dt);const ok=Math.min(n,Math.floor(d.tok));d.tok-=ok;n=ok;
      d.rate+=(n/dt-d.rate)*Math.min(1,dt*3);
      d.hurt=Math.max(0,d.hurt-dt);d.shake=Math.max(0,d.shake-dt*30);
      if(d.fin>=0){d.v*=Math.exp(-3*dt);continue}
      const {y}=laneY(ctx,p.idx);
      if(n>0){
        if(S.light==="red"&&S.lt>GRACE){ // caught tapping on red: roll back (capped per stop so one mistake is not the end)
          const back=Math.min(n*PEN,PEN_MAX-d.pen);
          if(back>0){d.pen+=back;d.pos=Math.max(0,d.pos-back);d.v=-2.5;d.hurt=.6;d.shake=12;if(d.ft&&d.ft.l>.4){d.ft.text=`−${Math.round(d.pen)} м`;d.ft.l=1.1}else{float(px(d.pos),y-40,`−${Math.round(back)} м`,"#ff5d73");d.ft=S.txt[S.txt.length-1]};puff(px(d.pos),y,8,"#ff5d73",220,.4)}}
        else if(S.light!=="red"){d.v=Math.min(VMAX,d.v+IMP*n);d.tapT=t;d.tapsTotal+=n}}
      const drag=S.light==="red"?5:DRAG;d.v*=Math.exp(-drag*dt);
      d.pos=Math.max(0,d.pos+d.v*dt);
      if(d.v>.4&&Math.random()<d.v*dt*4)puff(px(d.pos)-laneR(ctx)*2.9,y,1,"#ffb347",80+d.v*30,.35,Math.PI);
      if(d.pos>=L){d.pos=L;d.fin=t;d.place=++S.nfin;puff(px(L),y,26,p.color,420,.8);puff(px(L),y,14,"#fff",300,.6);
        if(S.nfin===1){S.first=t;ctx.banner(ps.length>1?`${p.name} — 1-е место!`:S.ghost&&S.ghost.fin<0?`Робот побеждён! ${t.toFixed(1)} с`:`Финиш за ${t.toFixed(1)} с!`,2);}
        else ctx.banner(`${p.name} — ${S.nfin}-е место`,1.2)}}
    if(S.first>=0&&ps.length>1&&S.nfin<ps.length&&!S.warnedEnd&&t-S.first>1.5){S.warnedEnd=true;ctx.banner(`Ещё ${AFTER} секунд!`,1.6)}
    if(S.ghost){const q=S.ghost;
      if(q.fin<0){q.v+=((S.light==="red"?0:GHOST_V)-q.v)*Math.min(1,dt*(S.light==="red"?5:1.5));q.pos+=q.v*dt;
        if(q.pos>=L){q.pos=L;q.fin=t;if(ps[0].data.fin<0)ctx.banner("Робот уже на финише!",1.6)}}
      else q.v*=Math.exp(-3*dt);
      if(q.v>.4&&Math.random()<q.v*dt*4){const ly=laneY(ctx,1).y;puff(px(q.pos)-laneR(ctx)*2.9,ly,1,"#ffb347",80+q.v*30,.35,Math.PI)}}
    for(const s of S.stars){s.x-=s.v*dt*(S.light==="red"?.2:1);if(s.x<0){s.x+=1600;s.y=Math.random()*900}}
    for(const f of S.fx){f.x+=f.vx*dt;f.y+=f.vy*dt;f.vx*=.93;f.vy*=.93;f.l-=dt}S.fx=S.fx.filter(f=>f.l>0);
    for(const q of S.txt){q.y-=50*dt;q.l-=dt}S.txt=S.txt.filter(q=>q.l>0);
    // end: everybody finished, or the rest ran out of time after the first finisher
    const done=S.nfin===ps.length||(S.first>=0&&t-S.first>=AFTER+1.5);
    if(done){if(S.ending<0)S.ending=t;if(t-S.ending>1)ctx.finish(order(ctx))}
  },

  standings(ctx){return order(ctx)},

  draw(ctx,g){
    const W=ctx.W,H=ctx.H,now=performance.now()/1000,ps=ctx.players;
    // space background
    const bg=g.createLinearGradient(0,0,0,H);bg.addColorStop(0,"#1a0d3d");bg.addColorStop(1,"#070318");g.fillStyle=bg;g.fillRect(0,0,W,H);
    for(const s of S.stars){g.fillStyle=`rgba(255,255,255,${.25+s.s*.25})`;g.fillRect(s.x,s.y,s.s*2,s.s)}
    if(S.light==="red"){g.fillStyle=`rgba(255,40,70,${.13+.05*Math.sin(now*10)+S.flash*.25})`;g.fillRect(0,0,W,H)}
    // lanes
    const lanes=ps.map(p=>laneY(ctx,p.idx)).concat(S.ghost?[laneY(ctx,1)]:[]),h=lanes.length?lanes[0].h:100;
    lanes.forEach((ln,i)=>{g.fillStyle=i%2?"rgba(255,255,255,.035)":"rgba(255,255,255,.075)";g.fillRect(0,ln.top,W,ln.h);
      g.fillStyle=(ps[i]||GHOST).color;g.globalAlpha=.85;g.fillRect(0,ln.top+3,10,ln.h-6);g.globalAlpha=1});
    g.strokeStyle="rgba(255,255,255,.12)";g.lineWidth=2;g.setLineDash([18,16]);
    lanes.forEach((ln,i)=>{if(i){g.beginPath();g.moveTo(0,ln.top);g.lineTo(W,ln.top);g.stroke()}});g.setLineDash([]);
    const tTop=lanes.length?lanes[0].top:TOP,tBot=lanes.length?lanes[lanes.length-1].top+h:BOT;
    // distance marks
    g.font=`800 22px ${B}`;g.textAlign="center";g.textBaseline="bottom";
    for(const m of[25,50,75]){const x=px(m);g.strokeStyle="rgba(255,255,255,.18)";g.lineWidth=3;g.beginPath();g.moveTo(x,tTop);g.lineTo(x,tBot);g.stroke();
      g.fillStyle="rgba(255,255,255,.45)";g.fillText(m+" м",x,tTop-6)}
    // start + finish lines
    g.strokeStyle="rgba(255,255,255,.5)";g.lineWidth=5;g.beginPath();g.moveTo(X0+50,tTop);g.lineTo(X0+50,tBot);g.stroke();
    const cs=16,fx=X1+44;for(let y=tTop,r=0;y<tBot;y+=cs,r++)for(let c=0;c<2;c++){g.fillStyle=(r+c)%2?"#170c2b":"#fbf4ff";g.fillRect(fx+c*cs,y,cs,Math.min(cs,tBot-y))}
    g.fillStyle="#ffc94a";g.fillText("ФИНИШ",fx+cs,tTop-6);
    // racers
    const R=laneR(ctx),cur=order(ctx);
    ps.forEach((p,i)=>{const d=p.data,ln=lanes[i];let x=px(d.pos)+(d.fin>=0?Math.min(1,(ctx.t-d.fin)*1.5)*105:0),y=ln.y;
      if(d.shake>0){x+=(Math.random()-.5)*d.shake;y+=(Math.random()-.5)*d.shake*.5}
      // current place, big, at the left of the lane
      const pl=cur.indexOf(p)+1;g.font=`900 ${Math.round(Math.min(44,h*.42))}px ${F}`;g.textAlign="center";g.textBaseline="middle";
      if(ps.length>1){g.fillStyle=d.fin>=0?"#ffc94a":"rgba(251,244,255,.75)";g.fillText(String(pl),52,y+2)}
      drawRocket(g,p,x,y,R,d,now);
      ctx.drawPlayer(g,p,x,y,R);
    });
    if(S.ghost){const q=S.ghost,ln=lanes[1],x=px(q.pos)+(q.fin>=0?Math.min(1,(ctx.t-q.fin)*1.5)*105:0);
      g.save();g.globalAlpha=.6;drawRocket(g,GHOST,x,ln.y,R,q,now);g.restore();ctx.drawPlayer(g,GHOST,x,ln.y,R)}
    for(const f of S.fx){g.globalAlpha=Math.max(0,f.l/f.L);g.fillStyle=f.col;g.beginPath();g.arc(f.x,f.y,f.r,0,TAU);g.fill()}g.globalAlpha=1;
    for(const q of S.txt){g.globalAlpha=Math.min(1,q.l*2);g.font=`900 38px ${F}`;g.textAlign="center";g.lineWidth=8;g.strokeStyle="rgba(23,12,43,.9)";g.strokeText(q.text,q.x,q.y);g.fillStyle=q.col;g.fillText(q.text,q.x,q.y)}g.globalAlpha=1;
    // big signal text in the middle
    if(S.light!=="green"){const red=S.light==="red",k=red?1:.5+.5*Math.sin(now*12);
      g.fillStyle="rgba(23,12,43,.4)";g.fillRect(0,H/2-95,W,190);
      g.textAlign="center";g.textBaseline="middle";g.lineJoin="round";
      g.font=`900 ${red?150:96}px ${F}`;g.lineWidth=16;g.strokeStyle="rgba(23,12,43,.95)";
      const txt=red?"СТОП!":"ВНИМАНИЕ…";g.strokeText(txt,W/2,H/2-12);g.globalAlpha=red?1:.8+.2*k;g.fillStyle=red?"#ff3b5c":"#ffc94a";g.fillText(txt,W/2,H/2-12);g.globalAlpha=1;
      g.font=`800 34px ${B}`;g.fillStyle="#fbf4ff";g.fillText(red?"не жми — откатит назад!":"сейчас будет красный",W/2,H/2+70)}
    // HUD: finished counter (top-left), traffic light (top-right)
    g.font=`800 30px ${B}`;g.textAlign="left";g.textBaseline="middle";
    const hud=ps.length>1?`Финиш: ${S.nfin} из ${ps.length}`:ps[0].data.fin>=0?`Финиш: ${ps[0].data.fin.toFixed(1)} с`:`До финиша: ${Math.ceil(L-ps[0].data.pos)} м`;
    const hw=g.measureText(hud).width+48;g.fillStyle="rgba(23,12,43,.8)";g.beginPath();g.roundRect(20,16,hw,56,28);g.fill();g.fillStyle="#fbf4ff";g.fillText(hud,44,45);
    const lx=W-226;g.fillStyle="rgba(23,12,43,.85)";g.beginPath();g.roundRect(lx,12,206,64,32);g.fill();
    [["red","#ff3b5c"],["yellow","#ffc94a"],["green","#5ce1c6"]].forEach(([k,c],i)=>{const on=S.light===k,cx=lx+38+i*65;
      g.fillStyle=on?c:"rgba(255,255,255,.1)";g.beginPath();g.arc(cx,44,22,0,TAU);g.fill();
      if(on){g.save();g.globalAlpha=.35+.2*Math.sin(now*8);g.fillStyle=c;g.beginPath();g.arc(cx,44,32,0,TAU);g.fill();g.restore()}});
  }
});

function drawRocket(g,p,x,y,R,d,now){
  const len=R*3.2,tail=x-len*.85;
  // flame: grows with speed, flickers
  const v=Math.max(0,d.v),fl=d.fin>=0?R*.4:R*(.3+v*.42)*(1+.18*Math.sin(now*40+p.idx));
  if(v>.15||d.fin>=0){const fg=g.createLinearGradient(tail-fl,0,tail,0);fg.addColorStop(0,"rgba(255,80,40,0)");fg.addColorStop(.5,"rgba(255,140,40,.85)");fg.addColorStop(1,"#fff3b0");
    g.fillStyle=fg;g.beginPath();g.moveTo(tail+2,y-R*.42);g.quadraticCurveTo(tail-fl*.6,y-R*.3,tail-fl,y);g.quadraticCurveTo(tail-fl*.6,y+R*.3,tail+2,y+R*.42);g.closePath();g.fill()}
  // fins
  g.fillStyle=p.color;g.strokeStyle="rgba(23,12,43,.75)";g.lineWidth=3;
  for(const s of[-1,1]){g.beginPath();g.moveTo(tail+R*.9,y+s*R*.45);g.lineTo(tail-R*.15,y+s*R*1.05);g.lineTo(tail+R*.05,y+s*R*.4);g.closePath();g.fill();g.stroke()}
  // body
  g.fillStyle=d.hurt>0&&Math.sin(now*40)>0?"#ffb3be":"#e9e4f5";g.beginPath();
  g.moveTo(tail,y-R*.5);g.lineTo(x,y-R*.62);g.quadraticCurveTo(x+R*1.9,y,x,y+R*.62);g.lineTo(tail,y+R*.5);g.closePath();g.fill();g.stroke();
  g.fillStyle=p.color;g.fillRect(tail+R*.35,y-R*.5,R*.28,R);
  g.fillStyle="rgba(255,255,255,.5)";g.fillRect(tail+R*.2,y-R*.38,len*.5,R*.12);
}
})();

/* «Ледяной сумо»: round ice floe that slowly melts; players are heavy discs on ice.
   Push the others into the water, last one standing wins. Contract: docs/action-games-spec.md */
(()=>{
const CX=800,CY=488,R0=395,RMIN=150,MELT_AT=10,MELT_FOR=38; // floe radius shrinks from R0 to RMIN over MELT_FOR s
// slow-ish on purpose: phone input arrives 100-500 ms late, so nobody should be able to slide off the floe within that time
const PR=36,ACC=1000,DRAG=1.6,VMAX=300,DASH=520,DASH_CD=1.6,DASH_T=.3,FALL_T=.75,BOUNCE=.7,KICK=90,VHIT=640,EDGE=PR*.35;
let S=null; // round state (one round at a time)
const TAU=Math.PI*2;
function floeR(t){return t<MELT_AT?R0:Math.max(RMIN,R0-(t-MELT_AT)*(R0-RMIN)/MELT_FOR)}
function puff(x,y,n,col,sp,life){for(let i=0;i<n;i++){const a=Math.random()*TAU,v=sp*(.3+Math.random()*.7);
  S.fx.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-(col==="w"?sp*.6:0),l:life*(.6+Math.random()*.4),L:life,col,r:4+Math.random()*7})}}

(window.ACTION_GAMES=window.ACTION_GAMES||[]).push({
  id:"sumo",
  title:"Ледяной сумо",
  rules:"Сталкивай всех с льдины. Последний на льдине — победитель!",
  controls:"stick+btn",
  btnLabel:"Рывок",
  duration:60,

  init(ctx){
    S={r:R0,fx:[],shake:0,warned:false,ending:-1,
      cracks:Array.from({length:9},(_,i)=>{const a=i/9*TAU+Math.random()*.5;return{a,pts:[.15+Math.random()*.15,.45+Math.random()*.2,.8+Math.random()*.15].map(f=>({f,da:(Math.random()-.5)*.25}))}}),
      flakes:Array.from({length:70},()=>({a:Math.random()*TAU,f:Math.sqrt(Math.random())*.95,s:1+Math.random()*2.5}))};
    const n=ctx.players.length;
    ctx.players.forEach((p,i)=>{const a=i/n*TAU-Math.PI/2,rr=n>1?R0*.6:0;
      p.data={x:CX+Math.cos(a)*rr,y:CY+Math.sin(a)*rr,vx:0,vy:0,face:a+Math.PI,cd:0,dash:0,fall:-1,taps:p.input.taps,pb:false,hit:null,hitT:-9,trail:[]}})
  },

  update(ctx,dt){
    const t=ctx.t,ps=ctx.players;S.r=floeR(t);
    if(!S.warned&&t>=MELT_AT){S.warned=true;ctx.banner("Льдина тает!",1.8)}
    if(S.shake>0)S.shake=Math.max(0,S.shake-dt*40);
    const live=ps.filter(p=>p.alive&&p.data.fall<0);
    for(const p of live){const d=p.data,inp=p.input;
      // dash: on a new press (tap counter or button edge) when the cooldown is over
      const pressed=inp.taps>d.taps||(inp.btn&&!d.pb);d.taps=inp.taps;d.pb=inp.btn;
      if(pressed&&d.cd<=0){let dx=inp.x,dy=inp.y,l=Math.hypot(dx,dy);
        if(l<.2){dx=d.vx;dy=d.vy;l=Math.hypot(dx,dy)}if(l<1){dx=Math.cos(d.face);dy=Math.sin(d.face);l=1}
        d.vx+=dx/l*DASH;d.vy+=dy/l*DASH;d.dash=DASH_T;d.cd=DASH_CD;puff(d.x,d.y,10,"s",260,.35)}
      d.vx+=inp.x*ACC*dt;d.vy+=inp.y*ACC*dt;
      const k=Math.exp(-DRAG*dt);d.vx*=k;d.vy*=k;
      const sp=Math.hypot(d.vx,d.vy);
      if(d.dash<=0&&sp>VMAX){const ns=VMAX+(sp-VMAX)*Math.exp(-5*dt);d.vx*=ns/sp;d.vy*=ns/sp}
      if(sp>40)d.face=Math.atan2(d.vy,d.vx);
      d.cd-=dt;d.dash-=dt;
      d.trail.push({x:d.x,y:d.y});if(d.trail.length>(d.dash>0?8:3))d.trail.shift();if(d.dash<=0&&d.trail.length>1)d.trail.shift()}
    // collisions: dashing discs are heavier, every hit gets a little extra kick so pushes feel strong
    for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){const a=live[i].data,b=live[j].data;
      let nx=b.x-a.x,ny=b.y-a.y,dd=Math.hypot(nx,ny);if(dd>=PR*2)continue;if(dd<.01){nx=1;ny=0;dd=.01}
      nx/=dd;ny/=dd;const ma=a.dash>0?2:1,mb=b.dash>0?2:1,ov=PR*2-dd;
      a.x-=nx*ov*mb/(ma+mb);a.y-=ny*ov*mb/(ma+mb);b.x+=nx*ov*ma/(ma+mb);b.y+=ny*ov*ma/(ma+mb);
      const vn=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(vn>=0)continue;
      const jimp=-(1+BOUNCE)*vn/(1/ma+1/mb);
      const ka=KICK*mb/(ma+mb)*2,kb=KICK*ma/(ma+mb)*2; // fixed extra shove, the lighter disc gets more of it
      a.vx-=(jimp/ma+ka)*nx;a.vy-=(jimp/ma+ka)*ny;b.vx+=(jimp/mb+kb)*nx;b.vy+=(jimp/mb+kb)*ny;
      for(const d of[a,b]){const v=Math.hypot(d.vx,d.vy);if(v>VHIT){d.vx*=VHIT/v;d.vy*=VHIT/v}}
      a.hit=live[j];a.hitT=t;b.hit=live[i];b.hitT=t;
      if(-vn>220){S.shake=Math.min(14,S.shake+(-vn)/90);puff((a.x+b.x)/2,(a.y+b.y)/2,8+Math.min(14,-vn/60|0),"s",-vn*.5,.4)}}
    for(const p of live){const d=p.data;d.x+=d.vx*dt;d.y+=d.vy*dt;
      if(Math.hypot(d.x-CX,d.y-CY)>S.r+EDGE){d.fall=0;puff(d.x,d.y,26,"w",380,.8);S.shake=Math.min(14,S.shake+6)}}
    // falling players sink, then they are out
    for(const p of ps){const d=p.data;if(!p.alive||d.fall<0)continue;d.fall+=dt;d.x+=d.vx*dt*.4;d.y+=d.vy*dt*.4;d.vx*=.92;d.vy*=.92;
      if(d.fall>=FALL_T){ctx.eliminate(p);
        const by=d.hit&&t-d.hitT<3&&d.hit!==p?d.hit.name:null;
        ctx.banner(by?`${by} скидывает ${p.name}!`:`${p.name} в воде!`,1.6)}}
    for(const f of S.fx){f.x+=f.vx*dt;f.y+=f.vy*dt;f.vx*=.94;f.vy=f.vy*.94+(f.col==="w"?900*dt:0);f.l-=dt}
    S.fx=S.fx.filter(f=>f.l>0);
    // end of round
    const standing=ps.filter(p=>p.alive&&p.data.fall<0).length,falling=ps.some(p=>p.alive&&p.data.fall>=0);
    if(!falling&&(ps.length>1?standing<=1:standing===0)){if(S.ending<0)S.ending=t;if(t-S.ending>.6)ctx.finish()}
  },

  // on timeout / early end: the one closest to the centre of the floe is ahead
  standings(ctx){return ctx.players.filter(p=>p.alive).sort((a,b)=>Math.hypot(a.data.x-CX,a.data.y-CY)-Math.hypot(b.data.x-CX,b.data.y-CY))},

  draw(ctx,g){
    const W=ctx.W,H=ctx.H,now=performance.now()/1000,r=S.r;
    if(S.shake>0)g.translate((Math.random()-.5)*S.shake,(Math.random()-.5)*S.shake);
    // water
    const wg=g.createLinearGradient(0,0,0,H);wg.addColorStop(0,"#0c3a6b");wg.addColorStop(1,"#051a36");g.fillStyle=wg;g.fillRect(-20,-20,W+40,H+40);
    g.strokeStyle="rgba(140,200,255,.13)";g.lineWidth=3;
    for(let y=30;y<H+40;y+=46){g.beginPath();for(let x=-20;x<=W+20;x+=20){const yy=y+Math.sin(x/90+now*1.4+y*.05)*7;x<0?g.moveTo(x,yy):g.lineTo(x,yy)}g.stroke()}
    // where the edge used to be
    if(r<R0){g.setLineDash([14,18]);g.strokeStyle="rgba(255,255,255,.12)";g.lineWidth=3;g.beginPath();g.arc(CX,CY,R0,0,TAU);g.stroke();g.setLineDash([])}
    // floe
    g.fillStyle="rgba(0,10,30,.45)";g.beginPath();g.ellipse(CX+10,CY+22,r+6,r+4,0,0,TAU);g.fill();
    g.fillStyle="#6fb3dc";g.beginPath();g.ellipse(CX,CY+12,r,r,0,0,TAU);g.fill(); // ice thickness
    const ig=g.createRadialGradient(CX-r*.3,CY-r*.35,r*.1,CX,CY,r);ig.addColorStop(0,"#ffffff");ig.addColorStop(.55,"#dff2fd");ig.addColorStop(1,"#a9d8f2");
    g.fillStyle=ig;g.beginPath();g.arc(CX,CY,r,0,TAU);g.fill();
    g.save();g.beginPath();g.arc(CX,CY,r,0,TAU);g.clip();
    g.strokeStyle="rgba(90,150,200,.35)";g.lineWidth=3;g.lineCap="round";
    for(const c of S.cracks){g.beginPath();g.moveTo(CX,CY);for(const q of c.pts){const a=c.a+q.da,rr=q.f*R0;g.lineTo(CX+Math.cos(a)*rr,CY+Math.sin(a)*rr)}g.stroke()}
    g.fillStyle="rgba(255,255,255,.8)";for(const f of S.flakes){const rr=f.f*R0;if(rr>r-6)continue;g.fillRect(CX+Math.cos(f.a)*rr,CY+Math.sin(f.a)*rr,f.s,f.s)}
    g.restore();
    const melting=ctx.t>=MELT_AT&&r>RMIN;
    g.lineWidth=8;g.strokeStyle=melting?`rgba(255,93,115,${.55+.35*Math.sin(now*8)})`:"rgba(255,255,255,.9)";g.beginPath();g.arc(CX,CY,r,0,TAU);g.stroke();
    // players (falling ones first, they are below the ice level)
    const ps=ctx.players.filter(p=>p.alive||(p.data.fall>=0&&p.data.fall<FALL_T)).sort((a,b)=>(b.data.fall>=0)-(a.data.fall>=0)||a.data.y-b.data.y);
    for(const p of ps){const d=p.data;
      if(d.fall>=0){const k=Math.min(1,d.fall/FALL_T);g.save();g.globalAlpha=1-k;ctx.drawPlayer(g,p,d.x,d.y+k*30,PR*(1-k*.6));g.restore();continue}
      for(let i=0;i<d.trail.length-1;i++){const q=d.trail[i];g.globalAlpha=.12+.25*i/d.trail.length;g.fillStyle=p.color;g.beginPath();g.arc(q.x,q.y,PR*(.6+.4*i/d.trail.length),0,TAU);g.fill()}
      g.globalAlpha=1;
      // dash cooldown ring: fills up, glows when ready
      if(d.cd>0){g.strokeStyle="rgba(255,255,255,.55)";g.lineWidth=5;g.beginPath();g.arc(d.x,d.y,PR+9,-Math.PI/2,-Math.PI/2+TAU*(1-d.cd/DASH_CD));g.stroke()}
      else{g.strokeStyle=`rgba(255,201,74,${.5+.3*Math.sin(now*6)})`;g.lineWidth=4;g.beginPath();g.arc(d.x,d.y,PR+9,0,TAU);g.stroke()}
      if(d.dash>0){g.strokeStyle="#fff";g.lineWidth=6;g.beginPath();g.arc(d.x,d.y,PR+3,0,TAU);g.stroke()}
      ctx.drawPlayer(g,p,d.x,d.y,PR)}
    for(const f of S.fx){g.globalAlpha=Math.max(0,f.l/f.L);g.fillStyle=f.col==="w"?"#d8f1ff":"#fff6d0";g.beginPath();g.arc(f.x,f.y,f.r,0,TAU);g.fill()}
    g.globalAlpha=1;
    // HUD
    const st=ctx.players.filter(p=>p.alive&&p.data.fall<0).length;
    g.font='800 30px "Manrope",system-ui,sans-serif';g.textAlign="left";g.textBaseline="middle";g.fillStyle="rgba(23,12,43,.8)";
    g.beginPath();g.roundRect(20,16,290,56,28);g.fill();g.fillStyle="#fbf4ff";g.fillText(`На льдине: ${st} из ${ctx.players.length}`,42,45);
  }
});
})();

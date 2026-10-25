/* «Падающие плитки»: a floor of hexagonal tiles over an abyss. A tile you stand on cracks and falls ~0.9 s later,
   tiles never come back. Fall through a hole = out, last one standing wins. Jump hops over one gap.
   From 22 s the floor also crumbles from the edge inwards, so every round ends. Contract: docs/action-games-spec.md */
(()=>{
const CX=800,CY=492,RX=700,RY=372;            // floor = hexes whose centres fit in this ellipse
const HR=46,SQ3=Math.sqrt(3),HW=HR*SQ3;        // hex radius (pointy-top), width
const CRACK_T=1,DROP_T=.55,GRACE=1.5;          // tile falls CRACK_T after first touch; no cracking during the first GRACE s
const PR=29,ACC=1050,DRAG=4.8,VMAX=225;         // slow-ish momentum: phone input is 100-500 ms late
const JUMP_T=.6,JUMP_CD=3.5,JUMP_V=300,FALL_T=.8,COYOTE=.22,SUPPORT=HR*.87+PR*.7,PUSH=60; // SUPPORT: big overhang grace, you only drop when your centre is deep in a hole
const COLLAPSE_AT=22,COLLAPSE_END=66;          // edge crumble: ellipse "radius" goes from 1.1 to 0 over this window
const TAU=Math.PI*2;
let S=null;
const key=(q,r)=>q+","+r;
function hexAt(x,y){const px=(x-CX)/HR,py=(y-CY)/HR;let q=SQ3/3*px-py/3,r=2/3*py,s=-q-r;
  let rq=Math.round(q),rr=Math.round(r),rs=Math.round(s);const dq=Math.abs(rq-q),dr=Math.abs(rr-r),ds=Math.abs(rs-s);
  if(dq>dr&&dq>ds)rq=-rr-rs;else if(dr>ds)rr=-rq-rs;return S.map.get(key(rq,rr))}
function hexPath(g,x,y,r){g.beginPath();for(let i=0;i<6;i++){const a=Math.PI/6+i*Math.PI/3;i?g.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r):g.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r)}g.closePath()}
function collapseR(t){return t<COLLAPSE_AT?9:1.1-(t-COLLAPSE_AT)/(COLLAPSE_END-COLLAPSE_AT)*1.15}
function mix(a,b,k){return a.map((v,i)=>Math.round(v+(b[i]-v)*k))}
const rgb=c=>`rgb(${c[0]},${c[1]},${c[2]})`;
const TOP=[[118,86,201],[98,70,180]],SIDE=[58,36,112],WARM=[255,170,70],HOT=[255,72,96];
function chips(x,y,n,col){for(let i=0;i<n;i++){const a=Math.random()*TAU,v=60+Math.random()*160;
  S.fx.push({x:x+Math.cos(a)*HR*.5,y:y+Math.sin(a)*HR*.4,vx:Math.cos(a)*v,vy:Math.sin(a)*v*.5-80,l:.5+Math.random()*.4,L:.9,col,r:3+Math.random()*5})}}

(window.ACTION_GAMES=window.ACTION_GAMES||[]).push({
  id:"tiles",
  title:"Падающие плитки",
  rules:"Плитка под тобой падает — беги! Выживи последним.",
  controls:"stick+btn",
  btnLabel:"Прыжок",
  duration:75,

  init(ctx){
    S={tiles:[],map:new Map(),fx:[],shake:0,warned:false,ending:-1,
      stars:Array.from({length:90},()=>({x:Math.random()*1600,y:Math.random()*900,s:.5+Math.random()*2,p:Math.random()*TAU}))};
    for(let r=-8;r<=8;r++)for(let q=-14;q<=14;q++){const x=CX+HR*SQ3*(q+r/2),y=CY+HR*1.5*r,dn=Math.hypot((x-CX)/RX,(y-CY)/RY);
      if(dn>1)continue;
      const t={q,r,x,y,dn:dn+(Math.random()-.5)*.08,st:-1,drop:-1,by:null,col:((q-r)%3+3)%3===0?1:0,
        cr:Array.from({length:3},()=>{const a=Math.random()*TAU;return[a,a+(Math.random()-.5)*1.2,.35+Math.random()*.5]})};
      S.tiles.push(t);S.map.set(key(q,r),t)}
    const n=ctx.players.length;
    ctx.players.forEach((p,i)=>{const a=i/n*TAU-Math.PI/2,k=n>1?.5:0;let x=CX+Math.cos(a)*RX*k,y=CY+Math.sin(a)*RY*k;
      const t=hexAt(x,y);if(t){x=t.x;y=t.y}
      p.data={x,y,vx:0,vy:0,face:a+Math.PI,cd:0,air:0,z:0,fall:-1,off:0,taps:p.input.taps,pb:false}})
  },

  update(ctx,dt){
    const t=ctx.t,ps=ctx.players,CR=collapseR(t);
    if(!S.warned&&t>=COLLAPSE_AT-.5){S.warned=true;ctx.banner("Пол рушится с краёв!",2)}
    if(S.shake>0)S.shake=Math.max(0,S.shake-dt*30);
    // edge crumble
    if(t>=COLLAPSE_AT)for(const tl of S.tiles)if(tl.st<0&&tl.dn>CR)tl.st=t;
    // tiles: cracking -> dropping -> gone
    for(const tl of S.tiles){
      if(tl.st>=0&&tl.drop<0&&t-tl.st>=CRACK_T){tl.drop=t;chips(tl.x,tl.y,6,"c");S.shake=Math.min(6,S.shake+.6)}}
    const live=ps.filter(p=>p.alive&&p.data.fall<0);
    for(const p of live){const d=p.data,inp=p.input;
      const pressed=inp.taps>d.taps||(inp.btn&&!d.pb);d.taps=inp.taps;d.pb=inp.btn;
      if(pressed&&d.cd<=0&&d.air<=0){let dx=inp.x,dy=inp.y,l=Math.hypot(dx,dy);
        if(l<.2){dx=d.vx;dy=d.vy;l=Math.hypot(dx,dy)}if(l<20&&Math.hypot(inp.x,inp.y)<.2){dx=Math.cos(d.face);dy=Math.sin(d.face);l=1}
        const sp=Math.max(JUMP_V,Math.hypot(d.vx,d.vy));d.vx=dx/l*sp;d.vy=dy/l*sp;d.air=JUMP_T;d.cd=JUMP_CD;chips(d.x,d.y+PR*.6,8,"d")}
      const ctl=d.air>0?.35:1; // a little air control
      d.vx+=inp.x*ACC*ctl*dt;d.vy+=inp.y*ACC*ctl*dt;
      if(d.air<=0){const k=Math.exp(-DRAG*dt);d.vx*=k;d.vy*=k}
      const sp=Math.hypot(d.vx,d.vy);if(sp>VMAX&&d.air<=0){const ns=VMAX+(sp-VMAX)*Math.exp(-6*dt);d.vx*=ns/sp;d.vy*=ns/sp}
      if(sp>30)d.face=Math.atan2(d.vy,d.vx);
      d.cd-=dt;if(d.air>0){d.air-=dt;const k=1-Math.max(0,d.air)/JUMP_T;d.z=Math.sin(k*Math.PI)*46;if(d.air<=0){d.z=0;chips(d.x,d.y+PR*.6,6,"d")}}}
    // soft bumps: you can shove people towards holes, but not knock them across the screen
    for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){const a=live[i].data,b=live[j].data;
      if((a.air>0)!==(b.air>0))continue;
      let nx=b.x-a.x,ny=b.y-a.y,dd=Math.hypot(nx,ny);if(dd>=PR*2)continue;if(dd<.01){nx=1;ny=0;dd=.01}
      nx/=dd;ny/=dd;const ov=PR*2-dd;a.x-=nx*ov/2;a.y-=ny*ov/2;b.x+=nx*ov/2;b.y+=ny*ov/2;
      const vn=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(vn>=0)continue;
      const jj=-1.5*vn/2+PUSH;a.vx-=jj*nx;a.vy-=jj*ny;b.vx+=jj*nx;b.vy+=jj*ny;
      if(-vn>160)chips((a.x+b.x)/2,(a.y+b.y)/2,5,"s")}
    for(const p of live){const d=p.data;d.x+=d.vx*dt;d.y+=d.vy*dt;
      d.x=Math.max(PR,Math.min(1600-PR,d.x));d.y=Math.max(PR+40,Math.min(900-PR,d.y));
      if(d.air>0){d.off=0;continue}
      // the tile under your centre starts cracking; you stay up while any solid tile is close enough under you
      const tl=hexAt(d.x,d.y);if(tl&&tl.st<0&&t>=GRACE){tl.st=t;tl.by=p}
      let ok=false;for(const s of S.tiles){if(s.drop>=0)continue;const dx=s.x-d.x,dy=s.y-d.y;if(dx*dx+dy*dy<SUPPORT*SUPPORT){ok=true;break}}
      if(ok)d.off=0;else{d.off+=dt;if(d.off>=COYOTE){d.fall=0;S.shake=Math.min(10,S.shake+4)}}}
    for(const p of ps){const d=p.data;if(!p.alive||d.fall<0)continue;d.fall+=dt;d.x+=d.vx*dt*.3;d.y+=d.vy*dt*.3;d.vx*=.9;d.vy*=.9;
      if(d.fall>=FALL_T){ctx.eliminate(p);ctx.banner(`${p.name} в пропасти!`,1.6)}}
    for(const f of S.fx){f.x+=f.vx*dt;f.y+=f.vy*dt;f.vx*=.95;f.vy+=(f.col==="c"?700:200)*dt;f.l-=dt}
    S.fx=S.fx.filter(f=>f.l>0);
    // drop fully fallen tiles from the list
    S.tiles=S.tiles.filter(tl=>!(tl.drop>=0&&t-tl.drop>DROP_T));
    const standing=ps.filter(p=>p.alive&&p.data.fall<0).length,falling=ps.some(p=>p.alive&&p.data.fall>=0);
    if(!falling&&(ps.length>1?standing<=1:standing===0)){if(S.ending<0)S.ending=t;if(t-S.ending>.6)ctx.finish()}
    // phone cues: the tile under you is cracking / jump ready
    for(const p of ps){const d=p.data;if(!p.alive||d.fall>=0)continue;const tl=d.air>0?null:hexAt(d.x,d.y);
      if(tl&&tl.st>=0&&t-tl.st>.45)ctx.status(p,"Плитка падает!",{color:"red"});
      else if(d.cd<=0&&d.air<=0)ctx.status(p,"Прыжок готов",{color:"green"});
      else ctx.status(p,d.air>0?"Прыжок!":`Прыжок через ${Math.ceil(d.cd)} с`)}
  },

  // timeout / early end: survivors ranked by how solid the ground under them is, then by distance to the centre
  standings(ctx){const sc=p=>{const tl=hexAt(p.data.x,p.data.y);return (tl&&tl.st<0?0:1000)+Math.hypot((p.data.x-CX)/RX,(p.data.y-CY)/RY)};
    return ctx.players.filter(p=>p.alive&&p.data.fall<0).sort((a,b)=>sc(a)-sc(b))},

  draw(ctx,g){
    const W=ctx.W,H=ctx.H,now=performance.now()/1000,t=ctx.t;
    if(S.shake>0)g.translate((Math.random()-.5)*S.shake,(Math.random()-.5)*S.shake);
    // abyss
    const bg=g.createRadialGradient(CX,CY+40,40,CX,CY,900);bg.addColorStop(0,"#2a0f3d");bg.addColorStop(.5,"#12061f");bg.addColorStop(1,"#06020c");
    g.fillStyle=bg;g.fillRect(-20,-20,W+40,H+40);
    for(const s of S.stars){g.globalAlpha=.25+.25*Math.sin(now*1.5+s.p);g.fillStyle="#c9b8ff";g.fillRect(s.x,s.y,s.s,s.s)}
    g.globalAlpha=1;
    const CR=collapseR(t),warnR=collapseR(t+3);
    // dropping tiles sink and fade into the abyss
    for(const tl of S.tiles){if(tl.drop<0)continue;const k=Math.min(1,(t-tl.drop)/DROP_T);
      g.globalAlpha=1-k;hexPath(g,tl.x,tl.y+k*k*120,HR*.92*(1-k*.45));g.fillStyle=rgb(mix(HOT,[40,10,30],k));g.fill()}
    g.globalAlpha=1;
    // falling players are below the floor
    for(const p of ctx.players){const d=p.data;if(!p.alive&&d.fall<0)continue;if(d.fall<0||d.fall>=FALL_T)continue;
      const k=d.fall/FALL_T;g.save();g.globalAlpha=1-k;ctx.drawPlayer(g,p,d.x,d.y+k*60,PR*(1-k*.6));g.restore()}
    // tile sides first, then tops (gives the floor some thickness)
    const solid=S.tiles.filter(tl=>tl.drop<0);
    const off=tl=>{if(tl.st<0)return[0,0,0];const k=Math.min(1,(t-tl.st)/CRACK_T),a=1+k*k*5;return[(Math.random()-.5)*a,(Math.random()-.5)*a,k]};
    const O=solid.map(off);
    g.fillStyle=rgb(SIDE);
    solid.forEach((tl,i)=>{hexPath(g,tl.x+O[i][0],tl.y+11+O[i][1]+O[i][2]*4,HR*.92);g.fill()});
    solid.forEach((tl,i)=>{const [ox,oy,k]=O[i],x=tl.x+ox,y=tl.y+oy+k*4;
      let c=TOP[tl.col];if(tl.st>=0)c=k<.5?mix(c,WARM,k*2):mix(WARM,HOT,(k-.5)*2);
      hexPath(g,x,y,HR*.92);g.fillStyle=rgb(c);g.fill();
      // bevel highlight
      g.lineWidth=3;g.strokeStyle=tl.st>=0?"rgba(255,240,200,.5)":"rgba(220,205,255,.35)";g.stroke();
      if(tl.st>=0){g.strokeStyle="rgba(40,8,24,.75)";g.lineWidth=3;g.lineCap="round";
        const n=k<.3?1:k<.65?2:3;for(let j=0;j<n;j++){const [a1,a2,f]=tl.cr[j];g.beginPath();g.moveTo(x,y);
          g.lineTo(x+Math.cos(a1)*HR*f*.6,y+Math.sin(a1)*HR*f*.6);g.lineTo(x+Math.cos(a2)*HR*.8,y+Math.sin(a2)*HR*.8);g.stroke()}}
      else if(t>=COLLAPSE_AT-3&&tl.dn>warnR){ // next to crumble: pulsing red rim
        hexPath(g,x,y,HR*.8);g.lineWidth=4;g.strokeStyle=`rgba(255,93,115,${.35+.35*Math.sin(now*9)})`;g.stroke()}});
    // players: shadows for jumpers, cooldown rings
    const ps=ctx.players.filter(p=>p.alive&&p.data.fall<0).sort((a,b)=>a.data.y-b.data.y);
    for(const p of ps){const d=p.data;
      if(d.air>0){g.fillStyle="rgba(0,0,0,.35)";g.beginPath();g.ellipse(d.x,d.y+PR*.5,PR*(1-d.z/140),PR*.5*(1-d.z/140),0,0,TAU);g.fill()}
      const y=d.y-d.z,r=PR*(1+d.z/160);
      if(d.cd>0){g.strokeStyle="rgba(255,255,255,.5)";g.lineWidth=5;g.beginPath();g.arc(d.x,y,r+9,-Math.PI/2,-Math.PI/2+TAU*(1-d.cd/JUMP_CD));g.stroke()}
      else{g.strokeStyle=`rgba(255,201,74,${.55+.3*Math.sin(now*6)})`;g.lineWidth=4;g.beginPath();g.arc(d.x,y,r+9,0,TAU);g.stroke()}
      if(d.off>0){g.strokeStyle="#ff5d73";g.lineWidth=5;g.beginPath();g.arc(d.x,y,r+3,0,TAU);g.stroke()}
      ctx.drawPlayer(g,p,d.x,y,r)}
    for(const f of S.fx){g.globalAlpha=Math.max(0,f.l/f.L);g.fillStyle=f.col==="c"?"#ffb36b":f.col==="d"?"#d9ccff":"#fff6d0";g.beginPath();g.arc(f.x,f.y,f.r,0,TAU);g.fill()}
    g.globalAlpha=1;
    // HUD
    const st=ps.length;
    g.font='800 30px "Manrope",system-ui,sans-serif';g.textAlign="left";g.textBaseline="middle";g.fillStyle="rgba(23,12,43,.85)";
    g.beginPath();g.roundRect(20,16,280,56,28);g.fill();g.fillStyle="#fbf4ff";g.fillText(`На полу: ${st} из ${ctx.players.length}`,42,45);
    if(t<GRACE+.5&&t>0){g.textAlign="center";g.font='900 40px "Unbounded","Arial Black",system-ui,sans-serif';g.lineJoin="round";g.lineWidth=10;
      g.strokeStyle="rgba(23,12,43,.92)";g.strokeText("Двигайся!",CX,860);g.fillStyle="#5ce1c6";g.fillText("Двигайся!",CX,860)}
  }
});
})();

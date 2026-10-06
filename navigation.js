export class NavigationSystem {
  constructor({player,getLevelName}){
    this.player=player;
    this.getLevelName=getLevelName||(()=> "BACKROOMS");
    this.elapsed=0;
    this.root=null;
    this._build();
  }

  _build(){
    const root=document.createElement("div");
    root.id="deepseekerNavigation";
    root.style.cssText=[
      "position:fixed","left:50%","top:14px","transform:translateX(-50%)",
      "z-index:6","pointer-events:none","display:flex","flex-direction:column",
      "align-items:center","gap:5px","font-family:ui-monospace,SFMono-Regular,Menlo,monospace",
      "text-shadow:0 2px 10px #000"
    ].join(";");
    root.innerHTML=
      '<div id="deepseekerCompass" style="font-size:12px;letter-spacing:4px;color:#d8d1ae;"></div>'+
      '<div id="deepseekerNavMeta" style="font-size:8px;letter-spacing:2px;color:#817d6c;"></div>';
    document.body.appendChild(root);
    this.root=root;
    this.compass=root.querySelector("#deepseekerCompass");
    this.meta=root.querySelector("#deepseekerNavMeta");
  }

  update(dt){
    this.elapsed+=dt;
    if(this.elapsed<.05) return;
    this.elapsed=0;
    const yaw=this.player.yaw;
    let deg=((yaw*180/Math.PI)%360+360)%360;
    const dirs=["N","NE","E","SE","S","SW","W","NW"];
    const dir=dirs[Math.round(deg/45)%8];
    const chunkX=Math.floor(this.player.pos.x/64);
    const chunkZ=Math.floor(this.player.pos.z/64);
    this.compass.textContent=dir+"  "+String(Math.round(deg)).padStart(3,"0")+"°";
    this.meta.textContent=this.getLevelName()+" · SECTOR "+chunkX+","+chunkZ;
  }
}

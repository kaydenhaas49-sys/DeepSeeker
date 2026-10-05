export class ComputerSystem {
  constructor({onOpenCameras,onWorldEvent,onClose}){
    this.onOpenCameras=onOpenCameras||(()=>{});
    this.onWorldEvent=onWorldEvent||(()=>{});
    this.onClose=onClose||(()=>{});
    this.overlay=null;
    this.output=null;
    this.current=null;
  }

  _ensure(){
    if(this.overlay) return;
    const overlay=document.createElement("div");
    overlay.id="deepseekerComputer";
    overlay.style.cssText=[
      "position:fixed","inset:0","z-index:30","display:none",
      "align-items:center","justify-content:center","background:rgba(0,0,0,.72)",
      "backdrop-filter:blur(5px)"
    ].join(";");
    overlay.innerHTML=
      '<div style="width:min(760px,92vw);max-height:76vh;overflow:auto;padding:22px;border:1px solid rgba(150,170,145,.28);background:#071008;box-shadow:0 30px 100px #000;color:#c8d9c5;font-family:ui-monospace,monospace">'+
        '<div style="display:flex;justify-content:space-between;gap:20px"><strong>DEEPSEEKER FIELD TERMINAL</strong><span id="deepseekerComputerId"></span></div>'+
        '<div id="deepseekerComputerOutput" style="margin-top:18px;min-height:180px;padding:15px;border:1px solid #ffffff12;background:#020502;color:#aebcab;white-space:pre-wrap;font-size:12px;line-height:1.6"></div>'+
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px">'+
          '<button data-cmd="status">STATUS</button>'+
          '<button data-cmd="files">FILES</button>'+
          '<button data-cmd="cameras">CAMERAS</button>'+
        '</div>'+
        '<button data-cmd="close" style="margin-top:9px;width:100%">CLOSE TERMINAL</button>'+
      '</div>';
    for(const button of overlay.querySelectorAll("button")){
      button.style.cssText="padding:10px 8px;border:1px solid #ffffff18;background:#0b150d;color:#b9c8b2;font:inherit;cursor:pointer;letter-spacing:1px";
      button.addEventListener("click",()=>{
        const cmd=button.dataset.cmd;
        if(cmd==="close") this.close();
        else this._run(cmd);
      });
    }
    document.body.appendChild(overlay);
    this.overlay=overlay;
    this.output=overlay.querySelector("#deepseekerComputerOutput");
  }

  open(data){
    this._ensure();
    this.current=data;
    this.overlay.style.display="flex";
    document.exitPointerLock?.();
    const id=this.overlay.querySelector("#deepseekerComputerId");
    if(id) id.textContent=data.id||"UNKNOWN TERMINAL";
    this._run("status");
    this.onWorldEvent({type:"computer_opened",id:data.id||"terminal"});
  }

  _run(cmd){
    if(!this.output) return;
    const id=this.current?.id||"DS-TERM";
    const isSecurity=Boolean(this.current?.security);
    if(cmd==="status"){
      this.output.textContent=
        "SYSTEM STATUS\n"+
        "---------------\n"+
        "UPLINK: LOST\n"+
        "LOCAL NODE: "+id+"\n"+
        "SIGNAL: UNSTABLE\n"+
        "DEEPSEEKER NETWORK: PARTIAL\n"+
        "CAMERA ACCESS: "+(isSecurity?"GRANTED":"UNAVAILABLE")+
        "\n\nThe terminal is still receiving power.\nSomething else appears to be using the network.";
    }else if(cmd==="files"){
      this.output.textContent=
        "RECOVERED FILES\n"+
        "----------------\n"+
        "[01] M_ENTRY_01\n"+
        "[02] M_ENTRY_03\n"+
        "[03] INCIDENT_REPORT\n"+
        "[04] NODE_MAP_FRAGMENT\n\n"+
        "Some files are corrupted.\nUse the phone to record anything important.";
    }else if(cmd==="cameras"){
      if(!isSecurity){
        this.output.textContent="CAMERA ACCESS DENIED\n\nThis terminal is not connected to a security node.";
        return;
      }
      this.onOpenCameras(this.current);
    }
  }

  close(){
    if(this.overlay) this.overlay.style.display="none";
    this.current=null;
    this.onClose();
  }

  get openState(){
    return Boolean(this.overlay && this.overlay.style.display==="flex");
  }
}

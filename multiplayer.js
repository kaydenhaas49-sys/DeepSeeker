import * as THREE from "three";
import {
  createHazmatCharacter,
  createRemoteFlashlight,
  updateRemoteFlashlight,
  disposeRemoteFlashlight,
  flashlightFlicker
} from "./character.js";

const SEND_INTERVAL = 0.10;
const REMOTE_LERP = 14;
const MP_LOW_END =
  (() => {
    const q = new URLSearchParams(location.search).get("quality");
    return q==="low" || q==="potato" ||
      ((navigator.hardwareConcurrency||4)<=4 && (navigator.deviceMemory||4)<=4);
  })();
const REMOTE_RENDER_DISTANCE = MP_LOW_END ? 38 : 60;

export class Multiplayer {
  constructor({ scene, player, getLevel, getFlashlightOn, onStatus, onCount, onRoster, onGameStart, onSharedFall, onChat, onWorldEvent }) {
    this.scene = scene;
    this.player = player;
    this.getLevel = getLevel;
    this.getFlashlightOn = getFlashlightOn || (() => true);
    this.onStatus = onStatus || (() => {});
    this.onCount = onCount || (() => {});
    this.onRoster = onRoster || (() => {});
    this.onGameStart = onGameStart || (() => {});
    this.onSharedFall = onSharedFall || (() => {});
    this.onChat = onChat || (() => {});

    this.socket = null;
    this.room = this.getRoomName();
    this.server = this.getServerUrl();
    this.playerId = null;
    this.players = new Map();
    this.sendTimer = 0;
    this.heartbeatTimer = 0;
    this.lastSent = null;
    this.reconnectTimer = 0;
    this.closedManually = false;
    this.lastStatus = "";
    this.elapsedTime = 0;
    this.fallSequence = 0;
    this.fallStartedAt = 0;
    this.lastSharedFallSequence = 0;
    this.worldEventSequence = 0;
    this.worldEvent = null;
    this.lastRemoteWorldEventSequence = 0;
    this.chatSequence = 0;
    this.chatMessage = "";
    this.chatSender = "";
    this.lastChatSentAt = 0;

    this.connect();
  }

  getRoomName() {
    const params = new URLSearchParams(location.search);
    return (params.get("room") || "main")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 32) || "main";
  }

  getServerUrl() {
    const params = new URLSearchParams(location.search);
    let value = params.get("server");
    const hasRoom = Boolean((params.get("room") || "").trim());

    // Multiplayer is opt-in. A normal solo/new-game URL must not silently
    // join a shared public room.
    if (!value && !hasRoom) return null;

    if (!value && (location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
      value = "ws://localhost:8787";
    }

    if (!value) {
      value = "wss://deepseeker-server.deepseeker-server.workers.dev";
    }

    value = value.trim().replace(/\/$/, "");

    if (value.startsWith("http://")) {
      value = "ws://" + value.slice("http://".length);
    } else if (value.startsWith("https://")) {
      value = "wss://" + value.slice("https://".length);
    }

    return value;
  }

  connect() {
    if (!this.server || this.closedManually) {
      this.setStatus("MULTIPLAYER OFFLINE");
      return;
    }

    this.setStatus("CONNECTING TO MULTIPLAYER...");

    try {
      this.socket = new WebSocket(
        `${this.server}/room/${encodeURIComponent(this.room)}`
      );
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket.addEventListener("open", () => {
      this.setStatus("MULTIPLAYER CONNECTED");
      this.socket.send(JSON.stringify({
        type: "join",
        name: this.getPlayerName(),
      }));
      this.sendState(true);
    });

    this.socket.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });

    this.socket.addEventListener("close", () => {
      this.socket = null;

      for (const remote of this.players.values()) {
        this.scene.remove(remote.group);
        if(remote.nameplate){
          remote.nameplate.texture.dispose();
          remote.nameplate.material.dispose();
        }
        disposeRemoteFlashlight(this.scene, remote.remoteLight);
      }
      this.players.clear();
      this.playerId = null;
      this.onCount(0, 10);

      if (!this.closedManually) {
        this.setStatus("MULTIPLAYER RECONNECTING...");
        this.scheduleReconnect();
      }
    });

    this.socket.addEventListener("error", () => {
      this.setStatus("MULTIPLAYER CONNECTION ERROR");
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer || this.closedManually) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = 0;
      this.connect();
    }, 2000);
  }

  getPlayerName() {
    const key = "deepseeker-player-name";
    let name = localStorage.getItem(key);

    if (!name) {
      name = "Player-" + Math.floor(1000 + Math.random() * 9000);
      localStorage.setItem(key, name);
    }

    return this.sanitizeName(name);
  }

  setStatus(message) {
    if (this.lastStatus === message) return;
    this.lastStatus = message;

    this.onStatus(message);

    if (message === "MULTIPLAYER CONNECTED") {
      setTimeout(() => {
        if (this.lastStatus === message) {
          this.onStatus("");
        }
      }, 1800);
    }
  }

  checkRemoteWorldEvent(state) {
    const sequence = Number(state?.worldEventSequence);
    if (!Number.isFinite(sequence) || sequence <= this.lastRemoteWorldEventSequence) return;
    this.lastRemoteWorldEventSequence = sequence;

    let payload = state?.worldEventPayload;
    if (typeof payload === "string") {
      try { payload = JSON.parse(payload); } catch { payload = {}; }
    }
    this.onWorldEvent({
      type: this.sanitizeMessage(state?.worldEventType || ""),
      id: this.sanitizeMessage(state?.worldEventId || ""),
      payload: payload && typeof payload === "object" ? payload : {},
      sequence
    });
  }

  checkSharedFall(state) {
    const normalized = this.normalizeState(state || {});
    const sequence = normalized.fallSequence;

    if(sequence <= this.lastSharedFallSequence) return;

    this.lastSharedFallSequence = sequence;
    this.onSharedFall(normalized.fallStartedAt);
  }

  handleMessage(raw) {
    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    switch (data?.type) {
      case "welcome":
        this.playerId = data.id ?? null;

        for (const player of data.players || []) {
          if (!player?.id || player.id === this.playerId) continue;
          this.addOrUpdatePlayer(player);
          this.checkSharedFall(player.state);
          this.checkRemoteWorldEvent(player.state);
        }
        this.updateCount();
        break;

      case "player_joined":
      case "player_updated":
        if (data.player?.id && data.player.id !== this.playerId) {
          this.addOrUpdatePlayer(data.player);
          this.checkSharedFall(data.player.state);
          this.checkRemoteWorldEvent(data.player.state);
          this.updateCount();
        }
        break;

      case "state": {
        if (!data.id || data.id === this.playerId) return;

        const nextState = this.normalizeState(data.state);
        let remote = this.players.get(data.id);

        if (!remote) {
          this.addOrUpdatePlayer({
            id: data.id,
            name: nextState.playerName || "Player",
            state: data.state || {},
          });
          remote = this.players.get(data.id);
        } else {
          remote.target = nextState;
        }

        if(remote){
          if(nextState.playerName && nextState.playerName!==remote.name){
            remote.name=nextState.playerName;
            this.updateNameplate(remote);
            this.updateCount();
          }
          this.checkRemoteChat(remote,nextState);
        }

        this.checkSharedFall(nextState);
        this.checkRemoteWorldEvent(nextState);
        break;
      }

      case "player_left": {
        if (!data.id) return;
        const remote = this.players.get(data.id);
        if (!remote) return;

        this.scene.remove(remote.group);
        disposeRemoteFlashlight(this.scene, remote.remoteLight);
        this.players.delete(data.id);
        this.updateCount();
        break;
      }

      case "game_start": {
        this.onGameStart();
        break;
      }
    }
  }

  updateCount() {
    this.onCount(Math.min(10, this.players.size + (this.playerId ? 1 : 0)), 10);
    this.onRoster([
      {id:this.playerId, name:this.getPlayerName(), self:true},
      ...Array.from(this.players.values()).map(remote=>({
        id:remote.id,
        name:remote.name || "Player",
        self:false,
      })),
    ]);
  }

  normalizeState(state) {
    const x = Number(state?.x);
    const z = Number(state?.z);
    const yaw = Number(state?.yaw);

    const fallSequence = Number(state?.fallSequence);
    const fallStartedAt = Number(state?.fallStartedAt);

    return {
      x: Number.isFinite(x) ? x : 0,
      z: Number.isFinite(z) ? z : 0,
      yaw: Number.isFinite(yaw) ? yaw : 0,
      pitch: Number.isFinite(Number(state?.pitch)) ? Number(state.pitch) : 0,
      level: state?.level === "house" ? "house" : "backrooms",
      crouched: Boolean(state?.crouched),
      flashlight: state?.flashlight !== false,
      playerName: this.sanitizeName(state?.playerName || ""),
      fallSequence: Number.isFinite(fallSequence) ? fallSequence : 0,
      fallStartedAt: Number.isFinite(fallStartedAt) ? fallStartedAt : 0,
      chatSequence: Number.isFinite(Number(state?.chatSequence)) ? Number(state.chatSequence) : 0,
      chatMessage: this.sanitizeMessage(state?.chatMessage || ""),
      chatSender: this.sanitizeName(state?.chatSender || ""),
      worldEventSequence: Number.isFinite(Number(state?.worldEventSequence)) ? Number(state.worldEventSequence) : 0,
      worldEventType: this.sanitizeMessage(state?.worldEventType || ""),
      worldEventId: this.sanitizeMessage(state?.worldEventId || ""),
      worldEventPayload: state?.worldEventPayload || "",
    };
  }

  sanitizeName(name){
    const clean=String(name||"").replace(/[<>]/g,"").replace(/\s+/g," ").trim().slice(0,20);
    return clean || "Player";
  }

  sanitizeMessage(message){
    return String(message||"").replace(/[<>]/g,"").replace(/\s+/g," ").trim().slice(0,120);
  }

  setPlayerName(name){
    const clean=this.sanitizeName(name);
    localStorage.setItem("deepseeker-player-name",clean);
    this.sendState(true);
    return clean;
  }

  createNameplate(remote){
    const canvas=document.createElement("canvas");
    canvas.width=512;
    canvas.height=96;
    const context=canvas.getContext("2d");
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;

    const material=new THREE.SpriteMaterial({
      map:texture,
      transparent:true,
      depthTest:true,
      depthWrite:false
    });
    const sprite=new THREE.Sprite(material);
    sprite.position.set(0,2.75,0);
    sprite.scale.set(3.15,.59,1);
    sprite.renderOrder=5;

    remote.nameplate={canvas,context,texture,material,sprite};
    remote.group.add(sprite);
    this.updateNameplate(remote);
  }

  updateNameplate(remote){
    if(!remote?.nameplate) return;
    const {canvas,context,texture}=remote.nameplate;
    context.clearRect(0,0,canvas.width,canvas.height);
    const name=this.sanitizeName(remote.name);
    context.font="600 30px system-ui, -apple-system, sans-serif";
    const width=Math.min(canvas.width-36,Math.max(150,context.measureText(name).width+46));
    const left=(canvas.width-width)/2;

    context.fillStyle="rgba(4,5,4,.78)";
    context.beginPath();
    context.roundRect(left,16,width,56,16);
    context.fill();

    context.fillStyle="rgba(232,225,191,.96)";
    context.textAlign="center";
    context.textBaseline="middle";
    context.fillText(name,canvas.width/2,44);
    texture.needsUpdate=true;
  }

  checkRemoteChat(remote,state){
    const sequence=state.chatSequence||0;
    if(sequence<=0 || sequence<=remote.lastChatSequence) return;

    remote.lastChatSequence=sequence;
    const message=this.sanitizeMessage(state.chatMessage);
    if(message){
      this.onChat({
        sender:this.sanitizeName(state.chatSender || remote.name || "Player"),
        message
      });
    }
  }

  sendChat(message){
    const clean=this.sanitizeMessage(message);
    if(!clean) return false;

    const now=performance.now();
    if(now-this.lastChatSentAt<350) return false;

    this.lastChatSentAt=now;
    this.chatSequence+=1;
    this.chatMessage=clean;
    this.chatSender=this.getPlayerName();
    this.sendState(true);
    this.onChat({sender:this.getPlayerName(),message:clean,self:true});
    return true;
  }

  addOrUpdatePlayer(player) {
    if (!player?.id || player.id === this.playerId) return;

    let remote = this.players.get(player.id);

    if (!remote) {
      const group = new THREE.Group();
      group.name = "RemoteHazmatPlayer_" + player.id;
      this.scene.add(group);

      remote = {
        id: player.id,
        name: player.name || "Player",
        group,
        model: null,
        mixer: null,
        flashlight: null,
        remoteLight: createRemoteFlashlight(this.scene),
        target: this.normalizeState(player.state || {}),
        current: this.normalizeState(player.state || {}),
        nameplate:null,
        lastChatSequence:this.normalizeState(player.state || {}).chatSequence,
        animationRefresh:0,
      };

      this.players.set(player.id, remote);
      this.createNameplate(remote);

      createHazmatCharacter()
        .then(character=>{
          if(!this.players.has(player.id)) return;

          remote.model = character.model;
          remote.mixer = character.mixer;
          remote.flashlight = character.flashlight;
          remote.group.add(character.model);
        })
        .catch(error=>{
          console.error("[DeepSeeker] remote hazmat failed:",error);
        });
    }else if(player.name){
      remote.name = this.sanitizeName(player.name);
      this.updateNameplate(remote);
    }

    if(player.state){
      remote.target = this.normalizeState(player.state);
      if(!remote.hasInitialState){
        remote.current={...remote.target};
        remote.hasInitialState=true;
      }
    }
  }

  hasPlayerInHouse(){
    for(const remote of this.players.values()){
      if(remote.target?.level==="house" || remote.current?.level==="house"){
        return true;
      }
    }
    return false;
  }

  getClosestBackroomsPlayerPosition(x,z){
    let closest=null;
    let closestDistance=Infinity;

    for(const remote of this.players.values()){
      const state=remote.current || remote.target;
      if(!state || state.level!=="backrooms") continue;

      const dx=state.x-x;
      const dz=state.z-z;
      const distance=dx*dx+dz*dz;

      if(distance<closestDistance){
        closestDistance=distance;
        closest={x:state.x,z:state.z};
      }
    }

    return closest;
  }

  startGameRoom() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;

    try {
      this.socket.send(JSON.stringify({ type: "start" }));
      return true;
    } catch {
      return false;
    }
  }

  broadcastFall(startedAt = Date.now()) {
    this.fallSequence += 1;
    this.fallStartedAt = Number.isFinite(startedAt) ? startedAt : Date.now();
    this.sendState(true);
  }

  broadcastWorldEvent(type, id, payload = {}) {
    this.worldEventSequence += 1;
    this.worldEvent = {
      type: this.sanitizeMessage(type),
      id: this.sanitizeMessage(id),
      payload: payload && typeof payload === "object" ? payload : {}
    };
    this.sendState(true);
    return this.worldEventSequence;
  }

  sendState(force = false) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    const state = {
      x: Number(this.player.pos.x.toFixed(3)),
      z: Number(this.player.pos.z.toFixed(3)),
      yaw: Number(this.player.yaw.toFixed(2)),
      pitch: Number(this.player.pitch.toFixed(2)),
      level: this.getLevel() ? "house" : "backrooms",
      crouched: Boolean(this.player.crouched),
      flashlight: Boolean(this.getFlashlightOn()),
      playerName: this.getPlayerName(),
      fallSequence: this.fallSequence,
      fallStartedAt: this.fallStartedAt,
      chatSequence: this.chatSequence,
      chatMessage: this.chatMessage,
      chatSender: this.chatSender,
      worldEventSequence: this.worldEventSequence,
      worldEventType: this.worldEvent?.type || "",
      worldEventId: this.worldEvent?.id || "",
      worldEventPayload: this.worldEvent ? JSON.stringify(this.worldEvent.payload || {}) : "",
    };

    const changed =
      !this.lastSent ||
      Math.abs(state.x - this.lastSent.x) > 0.03 ||
      Math.abs(state.z - this.lastSent.z) > 0.03 ||
      Math.abs(state.yaw - this.lastSent.yaw) > 0.03 ||
      Math.abs(state.pitch - this.lastSent.pitch) > 0.03 ||
      state.level !== this.lastSent.level ||
      state.crouched !== this.lastSent.crouched ||
      state.flashlight !== this.lastSent.flashlight ||
      state.playerName !== this.lastSent.playerName ||
      state.fallSequence !== this.lastSent.fallSequence ||
      state.fallStartedAt !== this.lastSent.fallStartedAt ||
      state.chatSequence !== this.lastSent.chatSequence ||
      state.worldEventSequence !== this.lastSent.worldEventSequence;

    const heartbeat = this.heartbeatTimer >= 1.0;

    if (!force && !changed && !heartbeat) return;

    try {
      this.socket.send(JSON.stringify({ type: "state", state }));
      this.lastSent = state;
      this.heartbeatTimer = 0;

    } catch {
      // Socket may have closed between the readyState check and send().
    }
  }

  update(dt) {
    this.elapsedTime += dt;
    this.sendTimer += dt;
    this.heartbeatTimer += dt;

    if (this.sendTimer >= SEND_INTERVAL) {
      this.sendTimer = 0;
      this.sendState();
    }

    for (const remote of this.players.values()) {
      remote.current.x = THREE.MathUtils.lerp(
        remote.current.x,
        remote.target.x,
        1 - Math.exp(-REMOTE_LERP * dt)
      );
      remote.current.z = THREE.MathUtils.lerp(
        remote.current.z,
        remote.target.z,
        1 - Math.exp(-REMOTE_LERP * dt)
      );
      remote.current.yaw = remote.target.yaw;
      remote.current.pitch = remote.target.pitch;
      remote.current.level = remote.target.level;
      remote.current.crouched = remote.target.crouched;
      remote.current.flashlight = remote.target.flashlight;
      remote.current.playerName = remote.target.playerName;

      remote.group.position.set(
        remote.current.x,
        0,
        remote.current.z
      );
      remote.group.rotation.y = remote.current.yaw + Math.PI;

      const sameLevel = remote.current.level === (this.getLevel() ? "house" : "backrooms");
      const dx = remote.current.x - this.player.pos.x;
      const dz = remote.current.z - this.player.pos.z;
      const nearby = dx * dx + dz * dz < REMOTE_RENDER_DISTANCE * REMOTE_RENDER_DISTANCE;
      remote.group.visible = sameLevel && nearby;

      if(remote.nameplate){
        remote.nameplate.sprite.visible = sameLevel && nearby;
        remote.nameplate.material.opacity = sameLevel && nearby
          ? Math.min(1,Math.max(0,(45-Math.sqrt(dx*dx+dz*dz))/15))
          : 0;
      }

      remote.animationRefresh=(remote.animationRefresh||0)-dt;
      if(remote.animationRefresh<=0){
        remote.animationRefresh=MP_LOW_END?0.10:0.033;
      }

      if(remote.mixer && remote.group.visible && remote.animationRefresh<=0){
        remote.mixer.update(MP_LOW_END?Math.min(dt,.10):dt);
      }

      if(remote.remoteLight && remote.flashlight && (!MP_LOW_END || nearby)){
        remote.flashlight.getWorldPosition(remote.remoteLight.origin);
        updateRemoteFlashlight(
          remote.remoteLight,
          remote.remoteLight.origin,
          remote.current.yaw,
          remote.current.pitch,
          remote.current.flashlight && sameLevel && nearby
        );
        if(remote.remoteLight.light.visible){
          remote.remoteLight.light.intensity = 27 * flashlightFlicker(this.elapsedTime);
        }
      }

      remote.group.position.y = remote.current.crouched ? -0.05 : 0;
    }
  }

  disconnect() {
    this.closedManually = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = 0;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    for (const remote of this.players.values()) {
      this.scene.remove(remote.group);
      if(remote.nameplate){
        remote.nameplate.texture.dispose();
        remote.nameplate.material.dispose();
      }
    }
    this.players.clear();
  }
}

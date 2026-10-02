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

export class Multiplayer {
  constructor({ scene, player, getLevel, getFlashlightOn, onStatus, onCount, onRoster, onGameStart }) {
    this.scene = scene;
    this.player = player;
    this.getLevel = getLevel;
    this.getFlashlightOn = getFlashlightOn || (() => true);
    this.onStatus = onStatus || (() => {});
    this.onCount = onCount || (() => {});
    this.onRoster = onRoster || (() => {});
    this.onGameStart = onGameStart || (() => {});

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

    return name;
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
        }
        this.updateCount();
        break;

      case "player_joined":
      case "player_updated":
        if (data.player?.id && data.player.id !== this.playerId) {
          this.addOrUpdatePlayer(data.player);
          this.updateCount();
        }
        break;

      case "state": {
        if (!data.id || data.id === this.playerId) return;

        const remote = this.players.get(data.id);
        if (!remote) {
          this.addOrUpdatePlayer({
            id: data.id,
            name: "Player",
            state: data.state || {},
          });
        } else {
          remote.target = this.normalizeState(data.state);
        }
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

    return {
      x: Number.isFinite(x) ? x : 0,
      z: Number.isFinite(z) ? z : 0,
      yaw: Number.isFinite(yaw) ? yaw : 0,
      pitch: Number.isFinite(Number(state?.pitch)) ? Number(state.pitch) : 0,
      level: state?.level === "house" ? "house" : "backrooms",
      crouched: Boolean(state?.crouched),
      flashlight: state?.flashlight !== false,
    };
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
      };

      this.players.set(player.id, remote);

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
      remote.name = String(player.name).slice(0,20);
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

  startGameRoom() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;

    try {
      this.socket.send(JSON.stringify({ type: "start" }));
      return true;
    } catch {
      return false;
    }
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
    };

    const changed =
      !this.lastSent ||
      Math.abs(state.x - this.lastSent.x) > 0.03 ||
      Math.abs(state.z - this.lastSent.z) > 0.03 ||
      Math.abs(state.yaw - this.lastSent.yaw) > 0.03 ||
      Math.abs(state.pitch - this.lastSent.pitch) > 0.03 ||
      state.level !== this.lastSent.level ||
      state.crouched !== this.lastSent.crouched ||
      state.flashlight !== this.lastSent.flashlight;

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

      remote.group.position.set(
        remote.current.x,
        0,
        remote.current.z
      );
      remote.group.rotation.y = remote.current.yaw + Math.PI;

      const sameLevel = remote.current.level === (this.getLevel() ? "house" : "backrooms");
      const dx = remote.current.x - this.player.pos.x;
      const dz = remote.current.z - this.player.pos.z;
      const nearby = dx * dx + dz * dz < 60 * 60;
      remote.group.visible = sameLevel && nearby;

      if(remote.mixer){
        remote.mixer.update(dt);
      }

      if(remote.remoteLight && remote.flashlight){
        const active=remote.current.flashlight && sameLevel && nearby;
        if(active){
          remote.flashlight.getWorldPosition(remote.remoteLight.origin);
          updateRemoteFlashlight(
            remote.remoteLight,
            remote.remoteLight.origin,
            remote.current.yaw,
            remote.current.pitch,
            true
          );
          remote.remoteLight.light.intensity=27*flashlightFlicker(this.elapsedTime);
        }else{
          remote.remoteLight.light.visible=false;
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
    }
    this.players.clear();
  }
}

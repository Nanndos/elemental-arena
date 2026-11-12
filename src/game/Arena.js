import { Group, Mesh, MeshStandardMaterial, MeshBasicMaterial, IcosahedronGeometry, PlaneGeometry, RingGeometry, Vector3, DoubleSide } from 'three';
import { settings, castShapeOf, CastShape } from '../config/settings.js';

export const SPELLS = {
  ice: { damage: 34, cooldown: 1.4, status: 'slow', duration: 3 },
  thunder: { damage: 85, cooldown: 3 },
  meteor: { damage: 110, cooldown: 5 },
  beam: { damage: 65, cooldown: 4, lingering: true },
  snare: { damage: 24, cooldown: 5, status: 'root', duration: 3 },
  glacier: { damage: 55, cooldown: 7, status: 'freeze', duration: 2.5 }
};
const RADIUS = 18;
const UP = new Vector3(0, 1, 0);

/** Fixed enemy pool and combat driven by the existing live VFX instances. */
export class Arena {
  constructor(app) {
    this.app = app;
    this.state = { phase: 'title', wave: 0, score: 0, hp: 100, enemies: 0 };
    this.casts = new Map();
    this.clock = 0;
    this.enemies = [];
    const geometry = new IcosahedronGeometry(0.55, 0);
    const barGeometry = new PlaneGeometry(1, 0.1);
    for (let i = 0; i < 40; i++) {
      const root = new Group();
      const material = new MeshStandardMaterial({ color: 0x211832, emissive: 0x963bca, emissiveIntensity: 0.65, flatShading: true });
      const body = new Mesh(geometry, material);
      body.scale.set(0.85, 1.45, 0.85);
      const bar = new Group();
      const back = new Mesh(barGeometry, new MeshBasicMaterial({ color: 0x211729, side: DoubleSide }));
      const fill = new Mesh(barGeometry, new MeshBasicMaterial({ color: 0xe18bff, side: DoubleSide }));
      fill.position.z = 0.01;
      bar.add(back, fill);
      bar.position.y = 1.9;
      root.add(body, bar);
      root.visible = false;
      app.scene.add(root);
      this.enemies.push({ root, body, bar, fill, material, alive: false, burst: 0, generation: 0 });
    }
    const boundary = this.boundary = new Mesh(new RingGeometry(RADIUS, RADIUS + 0.12, 96), new MeshBasicMaterial({ color: 0x6699cc, transparent: true, opacity: 0.45, side: DoubleSide }));
    boundary.rotation.x = -Math.PI / 2;
    boundary.position.y = 0.025;
    app.scene.add(boundary);
    this.direction = new Vector3();
    this.right = new Vector3();
    this.move = new Vector3();
    this.readout = document.createElement('div');
    this.readout.className = 'arena-readout';
    document.body.append(this.readout);
    this.screen = document.createElement('div');
    this.screen.className = 'arena-screen';
    document.body.append(this.screen);
    this.showScreen();
    this.onEnter = (event) => { if (event.code === 'Enter' && this.state.phase !== 'playing') this.start(); };
    window.addEventListener('keydown', this.onEnter);
    window.__game = { start: () => this.start(), state: this.state };
    for (const [id, spell] of Object.entries(SPELLS)) settings[id].cooldown = spell.cooldown;
    settings.meteor.zoneRadius = settings.meteor.shockRadius ?? 4;
  }

  showScreen() {
    const dead = this.state.phase === 'gameover';
    this.screen.hidden = false;
    this.screen.innerHTML = `<div><p class="arena-eyebrow">SIX ELEMENTS · ONE SURVIVOR</p><h1>${dead ? 'Game Over' : 'Elemental Arena'}</h1><p>${dead ? `Score ${this.state.score} · Wave ${this.state.wave}` : 'Hold the arena against the crystal swarm.'}</p><p>WASD to move · Mouse to aim<br>Q / E / R / F / V / X to arm · Click to cast</p><button>${dead ? 'Play again' : 'Enter the arena'}</button><small>Press Enter or click to ${dead ? 'restart' : 'start'}</small></div>`;
    this.screen.onclick = () => this.start();
  }

  start() {
    if (this.state.phase === 'playing') return;
    this.app.clearEffects();
    this.casts.clear();
    this.app.paused = false;
    this.app.hud.setPaused(false);
    this.app.input.keys.clear();
    this.app.character.position.set(0, 0, 0);
    this.app.character.resetPlacement();
    for (const id of this.app.cooldowns.keys()) this.app.cooldowns.set(id, 0);
    for (const enemy of this.enemies) { enemy.alive = false; enemy.burst = 0; enemy.root.visible = false; }
    Object.assign(this.state, { phase: 'playing', wave: 0, score: 0, hp: 100, enemies: 0 });
    this.pending = 0;
    this.intermission = 0.5;
    this.invulnerable = 0;
    this.screen.hidden = true;
    this.app.aim.cancel();
    this.renderHUD();
  }

  register(ability) { if (ability) this.casts.set(ability, new Map()); }

  spawn() {
    const e = this.enemies.find((enemy) => !enemy.alive && !enemy.burst);
    if (!e) return false;
    const angle = Math.random() * Math.PI * 2;
    e.root.position.set(Math.cos(angle) * RADIUS, 0, Math.sin(angle) * RADIUS);
    e.root.scale.setScalar(1);
    e.root.visible = e.alive = true;
    e.generation++;
    e.maxHP = e.hp = 65 + this.state.wave * 10;
    e.speed = Math.min(4.2, 1.25 + this.state.wave * 0.14);
    e.slow = e.rooted = e.flash = 0;
    return true;
  }

  update(dt) {
    if (this.state.phase !== 'playing' || dt <= 0) return;
    this.clock += dt;
    const player = this.app.character.position;
    // Camera-relative movement keeps W pointing up the screen.
    this.app.camera.getWorldDirection(this.direction).setY(0).normalize();
    this.right.crossVectors(this.direction, UP);
    const keys = this.app.input.keys;
    this.move.set(0, 0, 0).addScaledVector(this.direction, Number(keys.has('KeyW')) - Number(keys.has('KeyS'))).addScaledVector(this.right, Number(keys.has('KeyD')) - Number(keys.has('KeyA')));
    if (this.move.lengthSq()) {
      this.move.normalize();
      player.addScaledVector(this.move, dt * 6);
      if (player.length() > RADIUS - 1) player.setLength(RADIUS - 1);
      if (!this.app.aim.isArmed) this.app.character.turnToward(Math.atan2(this.move.x, this.move.z), 12, dt);
    }
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    for (const [cast, hits] of this.casts) {
      if (!this.app.abilities.active.includes(cast)) { this.casts.delete(cast); continue; }
      const spell = SPELLS[cast.element];
      const zone = castShapeOf(cast.element) === CastShape.ZONE;
      if ((zone && cast.phase === 'travel') || cast.phase === 'fade') continue;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const dx = e.root.position.x - cast.origin.x;
        const dz = e.root.position.z - cast.origin.z;
        const along = dx * cast.direction.x + dz * cast.direction.z;
        const lateral = Math.abs(dx * cast.direction.z - dz * cast.direction.x);
        const config = cast.config;
        const width = cast.element === 'ice' ? config.width * Math.max(0.2, along / cast.length) : cast.element === 'beam' ? config.radiusNear + (config.radius - config.radiusNear) * Math.max(0, along / cast.length) : 0.7;
        const hit = zone ? Math.hypot(dx - cast.direction.x * cast.length, dz - cast.direction.z * cast.length) <= config.zoneRadius + 0.4 : along >= 0 && along <= Math.min(cast.length, cast.front) + 0.4 && lateral <= width + 0.4;
        const previous = hits.get(e);
        if (!hit || (!spell.lingering && previous === e.generation)) continue;
        hits.set(e, e.generation);
        e.hp -= spell.damage * (spell.lingering ? dt : 1);
        e.flash = 0.12;
        if (spell.status === 'slow') e.slow = spell.duration;
        if (spell.status === 'root' || spell.status === 'freeze') e.rooted = spell.duration;
        if (e.hp <= 0) { e.alive = false; e.burst = 0.3; this.state.score += 100 + this.state.wave * 10; }
      }
    }
    for (const e of this.enemies) {
      if (e.burst > 0) {
        e.burst = Math.max(0, e.burst - dt);
        e.root.scale.setScalar(1 + (0.3 - e.burst) * 5);
        e.body.scale.setScalar(Math.max(0.01, e.burst / 0.3));
        e.bar.visible = false;
        e.material.emissive.setHex(0xffc8ff);
        e.root.visible = e.burst > 0;
      }
      if (!e.alive) continue;
      e.bar.visible = true;
      e.body.scale.set(0.85, 1.45, 0.85);
      e.slow = Math.max(0, e.slow - dt);
      e.rooted = Math.max(0, e.rooted - dt);
      e.flash = Math.max(0, e.flash - dt);
      this.move.copy(player).sub(e.root.position).setY(0);
      const distance = this.move.length();
      if (distance > 0.85 && !e.rooted) e.root.position.addScaledVector(this.move, dt * e.speed * (e.slow ? 0.4 : 1) / distance);
      if (distance <= 1.05 && !e.rooted && !this.invulnerable) {
        this.state.hp = Math.max(0, this.state.hp - 12);
        this.invulnerable = 0.7;
        this.app.hud.showToast('Contact! −12 HP', 500);
      }
      e.body.position.y = 0.85 + Math.sin(this.clock * 4 + e.generation) * 0.12;
      e.body.rotation.y += dt;
      e.material.emissive.setHex(e.flash ? 0xffffff : e.rooted ? 0x66ddff : e.slow ? 0x237cbb : 0x963bca);
      e.fill.scale.x = Math.max(0, e.hp / e.maxHP);
      e.fill.position.x = (e.fill.scale.x - 1) / 2;
      e.bar.quaternion.copy(this.app.camera.quaternion);
    }
    this.state.enemies = this.enemies.filter(e => e.alive).length;
    if (!this.pending && !this.state.enemies) {
      this.intermission -= dt;
      if (this.intermission <= 0) {
        this.state.wave++;
        this.pending = Math.min(40, 5 + this.state.wave * 3);
        this.spawnTimer = 0;
        this.intermission = 3;
        this.app.hud.showToast(`Wave ${this.state.wave}`, 2200);
        this.state.hp = Math.min(100, this.state.hp + 8);
      }
    }
    this.spawnTimer = (this.spawnTimer ?? 0) - dt;
    if (this.pending && this.spawnTimer <= 0 && this.spawn()) { this.pending--; this.spawnTimer = Math.max(0.18, 0.7 - this.state.wave * 0.035); }
    if (this.state.hp <= 0) { this.state.phase = 'gameover'; this.app.aim.cancel(); this.showScreen(); }
    this.state.enemies = this.enemies.filter(e => e.alive).length;
    this.renderHUD();
  }

  renderHUD() { this.readout.textContent = `WAVE ${this.state.wave}   ·   SCORE ${this.state.score}   ·   HP ${this.state.hp} / 100`; }
  dispose() {
    window.removeEventListener('keydown', this.onEnter);
    const geometries = new Set();
    const materials = new Set();
    for (const root of [...this.enemies.map(e => e.root), this.boundary]) {
      root.traverse(node => { if (node.geometry) geometries.add(node.geometry); if (node.material) materials.add(node.material); });
      root.removeFromParent();
    }
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    delete window.__game;
    this.screen.remove();
    this.readout.remove();
  }
}

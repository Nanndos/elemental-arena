import assert from 'node:assert/strict';
import { Arena } from '../src/game/Arena.js';
import { Group, PerspectiveCamera, Vector3 } from 'three';
globalThis.document = { createElement: () => ({ hidden: false, remove() {} }), body: { append() {} } };
globalThis.window = { addEventListener() {}, removeEventListener() {} };
const app = { scene: new Group(), camera: new PerspectiveCamera(), character: { position: new Vector3(), resetPlacement() {}, turnToward() {} }, input: { keys: new Set() }, hud: { setPaused() {}, showToast() {} }, aim: { cancel() {}, isArmed: false }, cooldowns: new Map([['ice', 4]]), abilities: { active: [] }, clearEffects() { this.abilities.active = []; } };
const game = new Arena(app);
assert.equal(window.__game.state.phase, 'title');
window.__game.start();
assert.equal(game.state.hp, 100);
assert.equal(app.cooldowns.get('ice'), 0);
function enemy(x, z) { game.spawn(); const e = game.enemies.filter(e => e.alive).at(-1); e.root.position.set(x, 0, z); e.hp = e.maxHP = 500; e.speed = 0; return e; }
const inside = enemy(0, 4), outside = enemy(8, 4), beyond = enemy(0, 12);
function cast(element, phase = 'impact') { const c = { element, origin: new Vector3(), direction: new Vector3(0, 0, 1), length: 8, front: 8, phase, config: { width: 2.5, radius: 0.77, radiusNear: 0.16, zoneRadius: 3 } }; app.abilities.active = [c]; game.register(c); return c; }
cast('ice'); game.update(0.05);
assert.equal(inside.hp, 466); assert.equal(outside.hp, 500); assert.equal(beyond.hp, 500); assert(inside.slow > 0);
game.update(0.05); assert.equal(inside.hp, 466);
inside.root.position.set(0, 0, 8);
const zone = cast('glacier', 'travel'); game.update(0.05); assert.equal(inside.hp, 466);
zone.phase = 'impact'; game.update(0.05); assert.equal(inside.hp, 411); assert(inside.rooted > 0);
inside.root.position.set(0, 0, 4); cast('beam'); game.update(0.05); const hp = inside.hp; game.update(0.05); assert(inside.hp < hp);
app.input.keys.add('KeyW'); game.update(0.05); assert(app.character.position.length() > 0);
app.input.keys.clear(); inside.root.position.copy(app.character.position); inside.rooted = 0; game.invulnerable = 0; game.update(0.05); assert.equal(game.state.hp, 88);
game.state.hp = 1; game.invulnerable = 0; game.update(0.05); assert.equal(game.state.phase, 'gameover');
game.start(); assert.equal(game.state.score, 0); assert.equal(game.state.hp, 100); assert.equal(game.enemies.filter(e => e.alive).length, 0);
for(let i=0;i<45;i++) game.spawn(); assert.equal(game.enemies.filter(e=>e.alive).length,40);
console.log('PASS: line bounds, zone impact timing, slow/freeze, beam ticks, movement, contact damage, game over, restart, pool cap.');

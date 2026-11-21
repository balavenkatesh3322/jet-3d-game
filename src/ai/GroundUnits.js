// Ground & naval targets with simple behaviours (SAMs fire, AAA shoots flak, convoys drive).
import * as THREE from 'three';
import { makeWarship } from '../world/Bases.js';
import { rand } from '../util/math.js';
import { WEAPONS } from '../combat/Combat.js';

const M = (c, r = 0.8, m = 0.2) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const olive = M(0x55603f), sand = M(0x9c8a62), dark = M(0x2b2e2a), concrete = M(0x8d8a84, 0.95, 0), tankWhite = M(0xd9d6cf, 0.6, 0.3);
const wreckMat = M(0x1b1a19, 1, 0);

function box(w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
function cyl(r, h, mat, x = 0, y = 0, z = 0, seg = 12) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat); m.position.set(x, y, z); m.castShadow = true; return m; }

const BUILDERS = {
  sam(desert) {
    const g = new THREE.Group(); const mat = desert ? sand : olive;
    g.add(box(4, 2.2, 10, mat, 0, 1.6, 0));
    g.add(box(3.6, 2.4, 3, mat, 0, 2.6, -4.2));
    const rack = new THREE.Group();
    for (let i = 0; i < 4; i++) { const t = cyl(0.45, 8, tankWhite, (i % 2 - 0.5) * 1.1, (Math.floor(i / 2) - 0.5) * 1.1, 0, 8); t.rotation.x = Math.PI / 2; rack.add(t); }
    rack.position.set(0, 4.2, 1.5); rack.rotation.x = -0.6; g.add(rack);
    const radar = new THREE.Group(); radar.add(box(5, 3.5, 0.4, dark, 0, 0, 0)); radar.position.set(14, 6, 0);
    radar.add(cyl(0.3, 6, dark, 0, -3, 0, 6)); g.add(radar);
    g.userData.spin = radar;
    return { group: g, radius: 9, health: 110, name: 'SAM Site' };
  },
  radar() {
    const g = new THREE.Group();
    g.add(cyl(3, 18, concrete, 0, 9, 0, 10));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12), M(0xe8e8e8, 0.6, 0.1)).translateY(24));
    const dish = new THREE.Group(); dish.add(box(16, 5, 0.6, dark, 0, 0, 0)); dish.position.y = 33; g.add(dish);
    g.add(box(12, 4, 8, concrete, 10, 2, 4));
    g.userData.spin = dish;
    return { group: g, radius: 14, health: 160, name: 'Radar Station' };
  },
  aaa(desert) {
    const g = new THREE.Group(); const mat = desert ? sand : olive;
    g.add(cyl(3.5, 1.2, concrete, 0, 0.6, 0, 12));
    const turret = new THREE.Group();
    turret.add(box(2.6, 1.8, 3, mat, 0, 0, 0));
    for (const x of [-0.6, 0.6]) { const b = cyl(0.14, 5, dark, x, 0.6, -2.5, 6); b.rotation.x = Math.PI / 2; turret.add(b); }
    turret.position.y = 2.2; g.add(turret);
    g.userData.turret = turret;
    return { group: g, radius: 6, health: 60, name: 'AAA Gun' };
  },
  depot() {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) g.add(cyl(5, 7, tankWhite, (i - 1) * 12, 3.5, 0, 16));
    g.add(box(10, 4, 6, olive, 0, 2, 12));
    return { group: g, radius: 18, health: 100, name: 'Fuel Depot', fuel: true };
  },
  convoy(desert, i) {
    const g = new THREE.Group(); const mat = desert ? sand : olive;
    if (i % 3 === 0) {
      g.add(box(3.4, 1.4, 7, mat, 0, 1.1, 0));
      g.add(box(2.4, 1.0, 3, mat, 0, 2.2, 0.3));
      const b = cyl(0.12, 5, dark, 0, 2.4, -3, 6); b.rotation.x = Math.PI / 2; g.add(b);
      return { group: g, radius: 6, health: 70, name: 'Tank' };
    }
    g.add(box(2.4, 2, 2.4, mat, 0, 1.6, -3));
    g.add(box(2.6, 2.6, 5.5, dark, 0, 2.1, 1.2));
    return { group: g, radius: 6, health: 45, name: 'Supply Truck' };
  },
  frigate() {
    const g = makeWarship(0x4f5559, false);
    return { group: g, radius: 40, health: 380, name: 'Frigate', naval: true };
  },
  hq() {
    const g = new THREE.Group();
    g.add(box(60, 14, 40, concrete, 0, 7, 0));
    g.add(box(30, 10, 20, concrete, 0, 19, 0));
    g.add(cyl(1, 30, dark, 20, 24, 10, 6));
    for (let i = 0; i < 4; i++) g.add(box(14, 6, 10, olive, -45 + i * 30, 3, 40));
    return { group: g, radius: 38, health: 900, name: 'Command HQ' };
  },
};

export class GroundUnit {
  constructor(type, pos, opts = {}) {
    const b = BUILDERS[type](opts.desert, opts.index || 0);
    this.type = type;
    this.kind = 'ground';
    this.isAir = false;
    this.team = 'red';
    this.name = b.name;
    this.group = b.group;
    this.radius = b.radius;
    this.maxHealth = this.health = b.health;
    this.naval = !!b.naval;
    this.alive = true;
    this.pos = this.group.position;
    this.pos.copy(pos);
    this.group.rotation.y = opts.heading || rand(0, Math.PI * 2);
    this.vel = new THREE.Vector3();
    this.cool = rand(2, 6);
    this.path = opts.path || null;
    this.pathT = 0;
    this.burn = 0;
    this.objective = opts.objective;
    this.lockT = 0;
  }

  damage(amount, attacker, combat) {
    if (!this.alive) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.alive = false;
      this.burn = 45;
      const scale = this.type === 'hq' ? 3 : this.naval ? 2.4 : this.type === 'depot' ? 2.2 : 1.3;
      combat.explosion(this.pos.clone().add(new THREE.Vector3(0, 4, 0)), scale, this.naval ? 'water' : 'ground');
      // wreck look
      this.group.traverse((o) => { if (o.isMesh) o.material = wreckMat; });
      if (this.naval) { this.group.rotation.z = 0.25; }
      combat.events.onKilled?.(this, attacker);
    }
  }

  update(dt, ctx) {
    const { combat, particles, terrain, t } = ctx;
    if (!this.alive) {
      if (this.burn > 0) {
        this.burn -= dt;
        if (this.naval && this.pos.y > -20) this.pos.y -= dt * 0.5;
        if (Math.random() < 0.6) {
          particles.smoke.spawn({ x: this.pos.x + rand(-4, 4), y: this.pos.y + 6, z: this.pos.z + rand(-4, 4), vx: rand(-2, 2), vy: rand(8, 14), vz: rand(-2, 2), life: 9, size0: 12, size1: 90, color0: [0.08, 0.08, 0.08, 0.7], color1: [0.3, 0.3, 0.3, 0], drag: 0.15 });
          if (Math.random() < 0.5) particles.fire.spawn({ x: this.pos.x + rand(-5, 5), y: this.pos.y + 3, z: this.pos.z + rand(-5, 5), vy: 6, life: 0.8, size0: 10, size1: 3, color0: [1, 0.6, 0.2, 1], color1: [0.8, 0.2, 0, 0] });
        }
      }
      return;
    }
    if (this.group.userData.spin) this.group.userData.spin.rotation.y = t * 1.4;
    if (this.group.userData.dish) this.group.userData.dish.rotation.y = t * 1.6;

    // convoy movement
    if (this.path) {
      this.pathT += dt * 9;
      const p = this.path(this.pathT);
      const prev = this.pos.clone();
      this.pos.set(p.x, terrain.surfaceAt(p.x, p.z), p.z);
      this.vel.copy(this.pos).sub(prev).divideScalar(dt || 1);
      if (this.vel.lengthSq() > 0.1) this.group.rotation.y = Math.atan2(-this.vel.x, -this.vel.z);
      if (Math.random() < 0.2) particles.smoke.spawn({ x: this.pos.x, y: this.pos.y + 1, z: this.pos.z, vy: 1, life: 2.5, size0: 3, size1: 14, color0: [0.7, 0.6, 0.45, 0.35], color1: [0.7, 0.6, 0.45, 0], drag: 1 });
    }

    // find hostile aircraft in range
    const player = ctx.player;
    const targets = combat.aircraft.filter((a) => a.alive && a.team === 'blue');
    if (!targets.length) return;
    let best = null, bd = 1e9;
    for (const a of targets) { const d = a.pos.distanceTo(this.pos); if (d < bd) { bd = d; best = a; } }
    this.cool -= dt;

    if ((this.type === 'sam' || this.type === 'frigate') && best && bd < WEAPONS.sam.range && best.pos.y > this.pos.y + 60) {
      const stealth = best.spec?.stealth || 0;
      this.lockT += dt * (1 - stealth * 0.7);
      if (best === player && this.lockT > 0.3) player.lockedBy++;
      if (this.lockT > WEAPONS.sam.lockTime && this.cool <= 0) {
        const lp = this.pos.clone().add(new THREE.Vector3(0, 10, 0));
        const dir = best.pos.clone().sub(lp).normalize();
        dir.y = Math.max(dir.y, 0.5); dir.normalize();
        const shim = { pos: lp, vel: dir.clone().multiplyScalar(80), team: 'red', alive: true, getForward: (o) => o.copy(dir) };
        const m = combat.fireMissile(shim, 'sam', best, lp);
        m.owner = this;
        this.cool = (this.type === 'frigate' ? 7 : 9) / ctx.aiRate + rand(0, 4);
        if (best === player) ctx.onLaunchWarning?.(this);
      }
    } else this.lockT = Math.max(0, this.lockT - dt);

    if ((this.type === 'aaa' || this.type === 'frigate') && best && bd < 3200) {
      const lead = best.pos.clone().addScaledVector(best.vel, bd / 900);
      const muzzle = this.pos.clone().add(new THREE.Vector3(0, this.type === 'frigate' ? 14 : 3, 0));
      const dir = lead.sub(muzzle).normalize();
      if (this.group.userData.turret) this.group.userData.turret.rotation.y = Math.atan2(-dir.x, -dir.z) - this.group.rotation.y;
      this.flakT = (this.flakT || 0) - dt;
      if (this.flakT <= 0) {
        this.burstT = (this.burstT || 0) + dt;
        const spread = 0.025;
        dir.x += rand(-spread, spread); dir.y += rand(-spread, spread); dir.z += rand(-spread, spread);
        combat.fireFlak(muzzle, dir, this);
        this.flakT = 0.08;
        if (this.burstT > 2.2) { this.burstT = 0; this.flakT = 2.5 / ctx.aiRate; }
        ctx.onFlak?.(this);
      }
    }
  }
}

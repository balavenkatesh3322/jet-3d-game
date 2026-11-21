// Weapons simulation: guided missiles (IR / radar / AGM / SAM), cannon rounds, flares, explosions.
import * as THREE from 'three';
import { clamp, rand } from '../util/math.js';

export const WEAPONS = {
  ir: { name: 'AAM-IR', range: 3800, cone: 16, lockTime: 0.7, speed: 620, boost: 2.4, accel: 230, turnG: 38, life: 11, dmg: 140, decoy: 0.32, air: true },
  radar: { name: 'AAM-RDR', range: 9500, cone: 22, lockTime: 1.6, speed: 720, boost: 3.5, accel: 210, turnG: 30, life: 16, dmg: 150, decoy: 0.16, air: true },
  agm: { name: 'AGM', range: 8000, cone: 25, lockTime: 1.0, speed: 420, boost: 3, accel: 120, turnG: 18, life: 22, dmg: 260, decoy: 0, air: false },
  sam: { name: 'SAM', range: 9000, cone: 60, lockTime: 3, speed: 580, boost: 4, accel: 180, turnG: 24, life: 16, dmg: 95, decoy: 0.32, air: true },
  aam_ai: { name: 'AAM', range: 5000, cone: 18, lockTime: 1.2, speed: 600, boost: 2.5, accel: 220, turnG: 30, life: 12, dmg: 80, decoy: 0.35, air: true },
};

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const missileGeo = new THREE.CylinderGeometry(0.14, 0.14, 3.2, 8).rotateX(Math.PI / 2);
const missileMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5, metalness: 0.3 });
const plumeMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const plumeGeo = new THREE.SphereGeometry(0.7, 8, 6).scale(1, 1, 3);

class Missile {
  constructor(combat, owner, kind, target, pos, vel, dir) {
    const w = WEAPONS[kind];
    this.combat = combat; this.owner = owner; this.kind = kind; this.w = w;
    this.target = target;
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.dir = dir.clone().normalize();
    this.speed = Math.max(vel.length(), 150);
    this.t = 0; this.alive = true;
    this.team = owner ? owner.team : 'red';
    this.decoyChecked = new WeakSet();
    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(missileGeo, missileMat);
    const plume = new THREE.Mesh(plumeGeo, plumeMat);
    plume.position.z = 3; this.plume = plume;
    this.mesh.add(body, plume);
    this.mesh.position.copy(this.pos);
    combat.scene.add(this.mesh);
    if (target && target.incoming) target.incoming.push(this);
  }

  update(dt) {
    const w = this.w, c = this.combat;
    this.t += dt;
    const boosting = this.t < w.boost;
    if (boosting) this.speed = Math.min(w.speed * 1.15, this.speed + w.accel * dt);
    else this.speed -= (this.speed * 0.06 + 4) * dt;

    // seeker / guidance
    if (this.target && this.target.alive !== false) {
      const tp = this.target.pos, tv = this.target.vel || _c.set(0, 0, 0);
      const dist = this.pos.distanceTo(tp);
      const tgo = dist / Math.max(this.speed, 100);
      _a.copy(tp).addScaledVector(tv, tgo).sub(this.pos).normalize(); // lead point
      const off = this.dir.angleTo(_b.copy(tp).sub(this.pos).normalize());
      if (off > 1.4 && this.t > 0.6) this.loseTarget();
      else {
        const maxTurn = (w.turnG * 9.81 / Math.max(this.speed, 150)) * dt * (this.t < 0.25 ? 0.25 : 1);
        const ang = this.dir.angleTo(_a);
        if (ang > 1e-4) {
          const k = Math.min(1, maxTurn / ang);
          this.dir.lerp(_a, k).normalize();
        }
      }
      // flare decoy
      if (w.decoy > 0 && this.target && this.target.isAir) {
        for (const f of c.flares) {
          if (!f.lead || this.decoyChecked.has(f) || f.owner !== this.target) continue; // one roll per salvo
          if (f.pos.distanceTo(this.pos) > 2500) continue;
          this.decoyChecked.add(f);
          if (Math.random() < w.decoy * (this.target.isPlayer ? 1 : 0.9)) {
            this.loseTarget(); this.target = f; this.decoyed = true;
            if (this.owner?.isPlayer) c.events.onMessage?.('Missile decoyed by flares', 'warn');
            break;
          }
        }
      }
      // proximity fuse
      if (this.target && dist < (this.target.isAir ? 16 : 22) + this.speed * dt) {
        this.detonate(this.target.isFlare ? null : this.target);
        return;
      }
    }

    this.pos.addScaledVector(this.dir, this.speed * dt);
    this.mesh.position.copy(this.pos);
    this.mesh.lookAt(_b.copy(this.pos).sub(this.dir));
    this.plume.visible = boosting;
    this.plume.scale.setScalar(0.8 + Math.random() * 0.4);

    // smoke trail
    if (boosting || this.t < w.boost + 1.5) {
      const p = c.particles;
      const n = 2;
      for (let i = 0; i < n; i++) {
        const back = this.speed * dt * (i / n);
        p.smoke.spawn({ x: this.pos.x - this.dir.x * (3 + back), y: this.pos.y - this.dir.y * (3 + back), z: this.pos.z - this.dir.z * (3 + back),
          vx: rand(-1, 1), vy: rand(-0.5, 1.5), vz: rand(-1, 1), life: boosting ? 4.5 : 2, size0: 2.5, size1: 14,
          color0: [0.92, 0.92, 0.92, 0.55], color1: [0.85, 0.85, 0.85, 0], drag: 0.4 });
      }
      if (boosting) p.fire.spawn({ x: this.pos.x - this.dir.x * 2.5, y: this.pos.y - this.dir.y * 2.5, z: this.pos.z - this.dir.z * 2.5, life: 0.12, size0: 5, size1: 1, color0: [1, 0.8, 0.5, 1], color1: [1, 0.4, 0.1, 0] });
    }

    // terrain hit
    const g = c.terrain.surfaceAt(this.pos.x, this.pos.z);
    if (this.pos.y <= g + 1) { this.detonate(null, g <= 0.01 ? 'water' : 'ground'); return; }
    if (this.t > w.life || (!boosting && this.speed < 120)) this.detonate(null, 'air');
  }

  loseTarget() {
    if (this.target && this.target.incoming) {
      const i = this.target.incoming.indexOf(this);
      if (i >= 0) this.target.incoming.splice(i, 1);
    }
    this.target = null;
  }

  detonate(hit, surface = 'air') {
    if (!this.alive) return;
    this.alive = false;
    const c = this.combat;
    this.loseTarget();
    c.scene.remove(this.mesh);
    c.explosion(this.pos, this.kind === 'agm' ? 1.6 : 0.8, surface);
    // splash damage
    const radius = this.kind === 'agm' ? 45 : 22;
    for (const e of c.allTargets()) {
      if (!e.alive || e === this.owner) continue;
      const d = e.pos.distanceTo(this.pos);
      const r = radius + (e.radius || 5);
      if (d < r) {
        const dmg = this.w.dmg * (e === hit ? 1 : clamp(1 - d / r, 0, 1) * 0.6) * c.damageScale(this.owner, e);
        c.applyDamage(e, dmg, this.owner, this.kind);
      }
    }
  }
}

export class Combat {
  constructor(scene, particles, terrain, events) {
    this.scene = scene;
    this.particles = particles;
    this.terrain = terrain;
    this.events = events; // { onKilled, onMessage, onSound, difficulty }
    this.missiles = [];
    this.bullets = [];
    this.flares = [];
    this.aircraft = [];
    this.ground = [];
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffa040, 0, 900, 1.6);
      scene.add(l); this.lights.push({ l, t: 0 });
    }
    // tracers: instanced stretched boxes
    this.maxTracers = 600;
    this.tracerMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.18, 14), new THREE.MeshBasicMaterial({ color: 0xffd070, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), this.maxTracers);
    this.tracerMesh.frustumCulled = false;
    this.tracerMesh.count = 0;
    scene.add(this.tracerMesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion();
  }

  allTargets() { return [...this.aircraft, ...this.ground]; }

  damageScale(attacker, victim) {
    const d = this.events.difficulty || 1;
    if (victim.isPlayer) return d;
    if (victim.team === 'blue') return 0.7;
    return 1;
  }

  applyDamage(e, dmg, attacker, source) {
    if (!e.alive) return;
    if (e.isAir) e.damage(dmg, attacker, this.events);
    else e.damage(dmg, attacker, this);
    if (attacker?.isPlayer && source !== 'gun' && e.alive) this.events.onMessage?.('HIT', 'hit');
  }

  fireMissile(owner, kind, target, launchPos) {
    const fwd = owner.getForward ? owner.getForward(new THREE.Vector3()) : target.pos.clone().sub(launchPos).normalize();
    const pos = launchPos ? launchPos.clone() : owner.pos.clone().addScaledVector(fwd, 4).add(new THREE.Vector3(0, -1.2, 0));
    const vel = owner.vel ? owner.vel.clone() : fwd.clone().multiplyScalar(60);
    if (owner.getForward && owner.useStore) owner.useStore(kind === 'aam_ai' ? 'ir' : kind);
    const m = new Missile(this, owner, kind, target, pos, vel, fwd);
    this.missiles.push(m);
    this.events.onSound?.('missile', pos);
    return m;
  }

  fireGun(owner, dt) {
    const fwd = owner.getForward(new THREE.Vector3());
    const right = owner.getRight(new THREE.Vector3());
    const muzzle = owner.pos.clone().addScaledVector(fwd, owner.model.userData.len * 0.35).addScaledVector(right, owner.isPlayer ? -0.9 : 0);
    const spread = owner.isPlayer ? 0.003 : 0.012 + (1 - owner.skill) * 0.02;
    const v = fwd.clone().add(new THREE.Vector3(rand(-spread, spread), rand(-spread, spread), rand(-spread, spread))).normalize().multiplyScalar(1050).add(owner.vel);
    this.bullets.push({ pos: muzzle, vel: v, life: 2.2, owner, dmg: owner.isPlayer ? 6 : 3.2, tracer: Math.random() < 0.5 });
    if (Math.random() < 0.5) this.particles.fire.spawn({ x: muzzle.x, y: muzzle.y, z: muzzle.z, vx: owner.vel.x, vy: owner.vel.y, vz: owner.vel.z, life: 0.05, size0: 3, size1: 1.5, color0: [1, 0.85, 0.4, 1], color1: [1, 0.5, 0.1, 0] });
  }

  // ground-based gun (AAA / CIWS)
  fireFlak(pos, dir, owner) {
    const v = dir.clone().normalize().multiplyScalar(900);
    this.bullets.push({ pos: pos.clone(), vel: v, life: 3, owner, dmg: 2.5, tracer: true, flak: true });
  }

  dropFlares(owner) {
    const fwd = owner.getForward(new THREE.Vector3());
    for (let i = 0; i < 4; i++) {
      const v = owner.vel.clone().multiplyScalar(0.6).add(new THREE.Vector3(rand(-25, 25), rand(-30, -5), rand(-25, 25)));
      const f = { pos: owner.pos.clone().addScaledVector(fwd, -6), vel: v, life: 4.5, owner, isFlare: true, alive: true, isAir: false, lead: i === 0 };
      this.flares.push(f);
    }
    this.events.onSound?.('flare', owner.pos);
  }

  flash(pos, power) {
    const slot = this.lights.reduce((a, b) => (a.t < b.t ? a : b));
    slot.l.position.copy(pos); slot.t = 0.5 * power + 0.2; slot.power = power;
  }

  explosion(pos, scale = 1, surface = 'air') {
    const p = this.particles;
    const s = scale;
    this.flash(pos, s);
    this.events.onSound?.('explosion', pos, s);
    if (surface === 'water') {
      for (let i = 0; i < 60 * s; i++) p.smoke.spawn({ x: pos.x + rand(-4, 4) * s, y: 0.5, z: pos.z + rand(-4, 4) * s, vx: rand(-8, 8), vy: rand(20, 70) * s, vz: rand(-8, 8), life: rand(1.5, 3), size0: 6 * s, size1: 22 * s, color0: [0.95, 0.97, 1, 0.9], color1: [0.9, 0.95, 1, 0], grav: -25, drag: 0.5 });
    }
    // fireball
    for (let i = 0; i < 40 * s; i++) {
      const d = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(5, 38) * s);
      p.fire.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: d.x, vy: d.y, vz: d.z, life: rand(0.4, 1.1), size0: rand(8, 16) * s, size1: rand(18, 34) * s, color0: [1, 0.75, 0.35, 1], color1: [0.7, 0.15, 0.02, 0], drag: 2.5, spin: rand(-2, 2) });
    }
    // sparks / debris
    for (let i = 0; i < 30 * s; i++) {
      const d = new THREE.Vector3(rand(-1, 1), rand(-0.6, 1), rand(-1, 1)).normalize().multiplyScalar(rand(40, 140));
      p.fire.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: d.x, vy: d.y, vz: d.z, life: rand(0.6, 1.6), size0: 1.6, size1: 0.4, color0: [1, 0.85, 0.5, 1], color1: [1, 0.3, 0.05, 0], grav: -30, drag: 0.8 });
    }
    // smoke
    for (let i = 0; i < 26 * s; i++) {
      const d = new THREE.Vector3(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize().multiplyScalar(rand(4, 20) * s);
      p.smoke.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: d.x, vy: d.y + 3, vz: d.z, life: rand(3, 7), size0: 10 * s, size1: rand(40, 70) * s, color0: [0.2, 0.18, 0.16, 0.85], color1: [0.35, 0.34, 0.33, 0], drag: 1.2 });
    }
  }

  update(dt, camPos) {
    // missiles
    for (const m of this.missiles) if (m.alive) m.update(dt);
    this.missiles = this.missiles.filter((m) => m.alive);

    // flares
    for (const f of this.flares) {
      f.life -= dt; f.vel.y -= 9.81 * dt * 0.4; f.vel.multiplyScalar(Math.exp(-0.9 * dt));
      f.pos.addScaledVector(f.vel, dt);
      if (f.life <= 0) f.alive = false;
      this.particles.fire.spawn({ x: f.pos.x, y: f.pos.y, z: f.pos.z, life: 0.25, size0: 7, size1: 2, color0: [1, 0.95, 0.75, 1], color1: [1, 0.5, 0.1, 0] });
      if (Math.random() < 0.5) this.particles.smoke.spawn({ x: f.pos.x, y: f.pos.y, z: f.pos.z, life: 2.2, size0: 2, size1: 9, color0: [0.95, 0.95, 0.95, 0.4], color1: [1, 1, 1, 0], drag: 1 });
    }
    this.flares = this.flares.filter((f) => f.alive);

    // bullets
    const targets = this.allTargets();
    let tc = 0;
    const m = this._m, q = this._q;
    for (const b of this.bullets) {
      b.life -= dt;
      const start = _a.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      b.vel.y -= 9.81 * dt;
      // hit test (segment vs sphere)
      const seg = _b.copy(b.pos).sub(start);
      const segLen = seg.length();
      seg.divideScalar(segLen || 1);
      for (const e of targets) {
        if (!e.alive || e === b.owner || (b.owner && e.team === b.owner.team)) continue;
        _c.copy(e.pos).sub(start);
        const t = clamp(_c.dot(seg), 0, segLen);
        const d2 = _c.lengthSq() - t * t;
        const r = (e.radius || 6) * (e.isAir ? 0.8 : 1);
        if (d2 < r * r && _c.lengthSq() < (segLen + r) * (segLen + r)) {
          this.applyDamage(e, b.dmg * this.damageScale(b.owner, e), b.owner, 'gun');
          this.particles.fire.spawn({ x: b.pos.x, y: b.pos.y, z: b.pos.z, life: 0.2, size0: 4, size1: 1, color0: [1, 0.9, 0.6, 1], color1: [1, 0.4, 0.1, 0] });
          if (b.owner?.isPlayer) this.events.onSound?.('hit', b.pos);
          b.life = 0; break;
        }
      }
      if (b.flak && b.life < 2.2 && b.life > 0 && Math.random() < 0.04) {
        // flak burst
        b.life = 0;
        this.particles.smoke.spawn({ x: b.pos.x, y: b.pos.y, z: b.pos.z, life: 3, size0: 8, size1: 22, color0: [0.12, 0.12, 0.12, 0.9], color1: [0.3, 0.3, 0.3, 0], drag: 1 });
        this.particles.fire.spawn({ x: b.pos.x, y: b.pos.y, z: b.pos.z, life: 0.15, size0: 12, size1: 4, color0: [1, 0.7, 0.3, 1], color1: [1, 0.3, 0, 0] });
        for (const e of targets) if (e.isPlayer && e.pos.distanceTo(b.pos) < 30) this.applyDamage(e, 2 * this.damageScale(b.owner, e), b.owner, 'flak');
      }
      const g = this.terrain.surfaceAt(b.pos.x, b.pos.z);
      if (b.pos.y < g) {
        b.life = 0;
        if (camPos && camPos.distanceToSquared(b.pos) < 4e6) {
          const water = g <= 0.01;
          this.particles.smoke.spawn({ x: b.pos.x, y: g + 1, z: b.pos.z, vy: water ? 18 : 6, life: 1, size0: 2, size1: 7, color0: water ? [1, 1, 1, 0.8] : [0.5, 0.42, 0.32, 0.8], color1: [0.8, 0.8, 0.8, 0], grav: -10 });
        }
      }
      if (b.life > 0 && b.tracer && tc < this.maxTracers) {
        q.setFromUnitVectors(_c.set(0, 0, 1), seg);
        m.compose(b.pos, q, _a.set(1, 1, 1));
        this.tracerMesh.setMatrixAt(tc++, m);
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
    this.tracerMesh.count = tc;
    this.tracerMesh.instanceMatrix.needsUpdate = true;

    for (const s of this.lights) {
      s.t = Math.max(0, s.t - dt);
      s.l.intensity = s.t > 0 ? s.t * 9000 * (s.power || 1) : 0;
    }
  }

  clear() {
    for (const m of this.missiles) this.scene.remove(m.mesh);
    this.missiles = []; this.bullets = []; this.flares = [];
  }

  dispose() {
    this.clear();
    this.scene.remove(this.tracerMesh);
    for (const s of this.lights) this.scene.remove(s.l);
  }
}

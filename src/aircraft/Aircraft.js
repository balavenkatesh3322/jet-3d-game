// Aircraft entity: flight model (air + ground/catapult/arrested landing), weapons state, damage.
import * as THREE from 'three';
import { buildJet, animateJet, hideStore } from './JetModel.js';
import { clamp, damp, smoothstep, DEG, V_FWD, V_UP, V_RIGHT } from '../util/math.js';

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _e = new THREE.Euler();
const DOWN = new THREE.Vector3(0, -1, 0);

let _uid = 1;

export class Aircraft {
  constructor({ spec, livery, team, name, isPlayer = false, skill = 0.5, modelSpec }) {
    this.id = _uid++;
    this.spec = spec;
    this.team = team;
    this.name = name;
    this.isPlayer = isPlayer;
    this.isAir = true;
    this.skill = skill;
    this.kind = 'aircraft';
    const loadout = { ir: spec.ir, radar: spec.radar, agm: spec.agm };
    this.model = buildJet(modelSpec || spec.model, livery, loadout, { stealthGlass: (spec.stealth || 0) > 0.5 });
    this.radius = (modelSpec || spec.model).span * 0.45 + 2;
    this.gearHeight = this.model.userData.gearHeight;

    this.pos = this.model.position;
    this.quat = this.model.quaternion;
    this.vel = new THREE.Vector3();
    this.vDir = new THREE.Vector3(0, 0, -1);
    this.speed = 0;
    this.sink = 0;
    this.throttle = 0.6;
    this.av = new THREE.Vector3(); // local angular velocity: x pitch, y yaw, z roll
    this.gload = 1;
    this.aoa = 0;

    this.grounded = false;
    this.catapult = null;     // { state: 'hold'|'launch', endZ, holdT }
    this.arrested = false;
    this.gearDown = false;
    this.airbrake = false;
    this.landedOn = null;

    this.maxHealth = spec.health;
    this.health = spec.health;
    this.alive = true;
    this.ammo = { gun: spec.gun, ir: spec.ir, radar: spec.radar, agm: spec.agm, flares: spec.flares };
    this.weapon = 'ir';
    this.cool = { gun: 0, missile: 0, flare: 0 };
    this.target = null;
    this.lockT = 0;
    this.locked = false;
    this.seekerTone = 0; // 0 none, 1 searching growl, 2 locked
    this.incoming = [];   // missiles targeting me
    this.lockedBy = 0;    // count of radars locking me this frame
    this.heat = 1;
    this.controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0, gun: false, missile: false, flare: false };
    this.time = 0;
    this.smokeT = 0;
    this.kills = 0;
  }

  get forward() { return _v.copy(V_FWD).applyQuaternion(this.quat); }
  getForward(out) { return out.copy(V_FWD).applyQuaternion(this.quat); }
  getUp(out) { return out.copy(V_UP).applyQuaternion(this.quat); }
  getRight(out) { return out.copy(V_RIGHT).applyQuaternion(this.quat); }

  get altitude() { return this.pos.y; }
  get abOn() { return this.throttle > 1.001; }

  placeOnGround(pos, heading, deckY) {
    this.pos.copy(pos); this.pos.y = deckY + this.gearHeight;
    this.quat.setFromEuler(_e.set(0, -heading, 0, 'YXZ'));
    this.grounded = true; this.gearDown = true; this.speed = 0; this.throttle = 0.15;
    this.groundPitch = 0; this.groundYaw = -heading;
    this.vDir.copy(V_FWD).applyQuaternion(this.quat);
    this.model.userData.gearT = 1;
  }

  placeInAir(pos, dir, speed) {
    this.pos.copy(pos);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, V_UP);
    this.quat.setFromRotationMatrix(m);
    this.speed = speed; this.vDir.copy(dir).normalize();
    this.grounded = false; this.gearDown = false; this.throttle = 0.8;
    this.model.userData.gearT = 0;
  }

  thrustAcc() {
    const s = this.spec;
    const t = this.throttle;
    return t <= 1 ? t * s.thrust : s.thrust + ((t - 1) / 0.2) * (s.abThrust - s.thrust);
  }

  // ---------------------------------------------------------------- physics
  update(dt, env) {
    if (!this.alive) return;
    this.time += dt;
    const c = this.controls;
    // throttle
    if (c.throttleSet !== undefined) { this.throttle = damp(this.throttle, c.throttleSet, 2.5, dt); }
    else this.throttle = clamp(this.throttle + c.throttle * dt * 0.55, 0, 1.2);
    if (this.grounded) this.updateGround(dt, env);
    else this.updateAir(dt, env);
    for (const k in this.cool) this.cool[k] = Math.max(0, this.cool[k] - dt);
    this.heat = 0.6 + this.throttle * 0.5 + (this.abOn ? 0.8 : 0);
    animateJet(this.model, this.time, this.alive ? this.throttle : 0, this.gearDown, dt);
    this.vel.copy(this.vDir).multiplyScalar(this.speed);
    this.vel.y += this.sink;
    // damage smoke
    if (this.health < this.maxHealth * 0.5 && env.particles) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.03;
        const burning = this.health < this.maxHealth * 0.25;
        env.particles.smoke.spawn({ x: this.pos.x, y: this.pos.y, z: this.pos.z, vx: (Math.random() - 0.5) * 3, vy: 2, vz: (Math.random() - 0.5) * 3,
          life: 3.5, size0: 4, size1: 26, color0: burning ? [0.15, 0.13, 0.12, 0.8] : [0.35, 0.35, 0.35, 0.55], color1: [0.3, 0.3, 0.3, 0], drag: 0.6 });
        if (burning) env.particles.fire.spawn({ x: this.pos.x, y: this.pos.y, z: this.pos.z, life: 0.5, size0: 5, size1: 1, color0: [1, 0.5, 0.1, 1], color1: [0.6, 0.1, 0, 0] });
      }
    }
  }

  updateAir(dt, env) {
    const s = this.spec, c = this.controls;
    const fwd = this.getForward(new THREE.Vector3());
    const up = this.getUp(new THREE.Vector3());
    const speed = Math.max(this.speed, 1);

    let auth = clamp((speed - s.stall * 0.3) / (s.stall * 1.5), 0.1, 1);
    if (speed > 320) auth *= clamp(1 - (speed - 320) / 700, 0.55, 1);
    const maxPitchRate = (s.maxG * 9.81) / Math.max(speed, 35);
    const pr = Math.min(s.pitchRate * auth, maxPitchRate);
    const tgtPitch = c.pitch >= 0 ? c.pitch * pr : c.pitch * pr * 0.55;
    const tgtRoll = c.roll * s.rollRate * auth;
    const tgtYaw = c.yaw * s.yawRate * auth;
    this.av.x = damp(this.av.x, tgtPitch, 5, dt);
    this.av.z = damp(this.av.z, tgtRoll, 6, dt);
    this.av.y = damp(this.av.y, tgtYaw, 3, dt);

    _q.setFromAxisAngle(V_RIGHT, this.av.x * dt); this.quat.multiply(_q);
    _q.setFromAxisAngle(V_UP, -this.av.y * dt); this.quat.multiply(_q);
    _q.setFromAxisAngle(_v2.set(0, 0, 1), -this.av.z * dt); this.quat.multiply(_q);

    // gravity: lift only supports the aircraft when wings are roughly level and fast enough
    const liftCap = smoothstep(s.stall * 0.65, s.stall * 1.2, speed);
    const droop = (9.81 * (1 - liftCap * Math.max(0, up.y))) / Math.max(speed, 25);
    const axis = _v.crossVectors(fwd, DOWN);
    const al = axis.length();
    if (al > 1e-3) { _q.setFromAxisAngle(axis.multiplyScalar(1 / al), Math.min(droop, 1.2) * dt); this.quat.premultiply(_q); }
    this.quat.normalize();

    const fwd2 = this.getForward(new THREE.Vector3());
    this.vDir.lerp(fwd2, 1 - Math.exp(-(2 + 6 * liftCap) * dt)).normalize();
    this.aoa = this.vDir.angleTo(fwd2);

    this.gload = (speed * this.av.x) / 9.81 + up.y;
    const drag = s.dragK * speed * speed * (1 + (this.airbrake ? 1.8 : 0) + (this.gearDown ? 0.7 : 0)) + 0.16 * this.gload * this.gload + this.aoa * 25;
    this.speed += (this.thrustAcc() - drag - 9.81 * this.vDir.y) * dt;
    this.speed = Math.max(0, this.speed);

    this.sink = damp(this.sink, liftCap > 0.9 ? 0 : this.sink - 9.81 * (1 - liftCap) * 3, 1 + liftCap * 3, dt);
    this.sink = Math.max(this.sink, -60);

    this.pos.addScaledVector(this.vDir, this.speed * dt);
    this.pos.y += this.sink * dt;

    // ----- contact with ground / deck / sea
    const ground = env.terrain.surfaceAt(this.pos.x, this.pos.z);
    const deck = env.base ? env.base.surfaceAt(this.pos.x, this.pos.z) : null;
    const contact = deck !== null ? Math.max(deck, ground) : ground;
    const bottom = this.pos.y - (this.gearDown ? this.gearHeight : 1.4);
    if (bottom <= contact) {
      if (deck !== null && deck >= ground - 1) this.tryTouchdown(env, deck);
      else env.onCrash(this, ground <= 0.01 ? 'water' : 'terrain');
    }
  }

  tryTouchdown(env, deckY) {
    const s = this.spec;
    _e.setFromQuaternion(this.quat, 'YXZ');
    const pitch = _e.x, roll = _e.z;
    const vs = this.vDir.y * this.speed + this.sink;
    const isCarrier = env.base.type === 'carrier';
    const ok = this.gearDown && vs > (isCarrier ? -12 : -9) && Math.abs(roll) < 22 * DEG && pitch > -8 * DEG && pitch < 20 * DEG && this.speed < s.stall * 2.8;
    if (!ok) {
      env.onCrash(this, this.gearDown ? 'hard landing' : 'gear up landing');
      return;
    }
    this.grounded = true;
    this.groundPitch = Math.max(0, pitch);
    this.groundYaw = _e.y;
    this.sink = 0;
    this.pos.y = deckY + this.gearHeight;
    this.arrested = false;
    this.landedOn = env.base.type;
    if (isCarrier) {
      const z = this.pos.z;
      if (z > 55 && z < 152 && Math.abs(this.pos.x) < 18) {
        this.arrested = true;
        const wire = 1 + Math.max(0, Math.min(3, Math.floor((152 - z) / 24)));
        env.onEvent?.('wire', { ac: this, wire });
      } else env.onEvent?.('bolter', { ac: this });
    }
    env.onEvent?.('touchdown', { ac: this, vs });
  }

  updateGround(dt, env) {
    const s = this.spec, c = this.controls;
    const deck = env.base ? env.base.surfaceAt(this.pos.x, this.pos.z) : null;
    const ground = env.terrain.surfaceAt(this.pos.x, this.pos.z);
    const surface = deck !== null ? deck : ground;

    // catapult sequence (carrier)
    if (this.catapult) {
      const cat = this.catapult;
      if (cat.state === 'hold') {
        this.speed = 0;
        if (this.throttle >= 0.99) { cat.holdT += dt; if (cat.holdT > 1.2) { cat.state = 'launch'; env.onEvent?.('catapult', { ac: this }); } }
        else cat.holdT = 0;
      } else {
        this.speed += 38 * dt;
        if (this.pos.z <= cat.endZ + 2) {
          this.catapult = null;
          this.grounded = false;
          this.speed = Math.max(this.speed, s.vr + 12);
          _e.set(7 * DEG, this.groundYaw, 0, 'YXZ');
          this.quat.setFromEuler(_e);
          this.vDir.copy(V_FWD).applyQuaternion(this.quat);
          this.gearDown = true;
          env.onEvent?.('airborne', { ac: this, catapult: true });
          return;
        }
      }
    } else {
      const brake = (c.brake ? 9 : 0) + (this.throttle < 0.25 && this.landedOn ? 6 : 0);
      const roll = 0.25 + this.spec.dragK * this.speed * this.speed;
      let acc = this.thrustAcc() - roll - brake;
      if (this.arrested) acc = -Math.max(26, this.speed * 0.9);
      if (!this.landedOn && this.throttle < 0.2) acc = Math.min(acc, -4); // parking brake
      this.speed = Math.max(0, this.speed + acc * dt);
      if (this.arrested && this.speed <= 0.1) this.speed = 0;
      // nose-wheel steering
      const steer = (c.yaw + c.roll * 0.6) * (this.speed < 50 ? 0.6 : 0.1);
      this.groundYaw -= steer * dt * clamp(this.speed / 10, 0, 1);
      // rotation for takeoff
      if (this.speed > s.vr * 0.92 && c.pitch > 0.15) this.groundPitch = Math.min(14 * DEG, this.groundPitch + c.pitch * dt * 0.45);
      else this.groundPitch = Math.max(0, this.groundPitch - dt * 0.25);
      if (this.groundPitch > 5 * DEG && this.speed > s.vr) {
        this.grounded = false; this.landedOn = null;
        env.onEvent?.('airborne', { ac: this, catapult: false });
      }
    }

    _e.set(this.groundPitch || 0, this.groundYaw, 0, 'YXZ');
    this.quat.setFromEuler(_e);
    const fwd = this.getForward(new THREE.Vector3());
    this.vDir.set(fwd.x, 0, fwd.z).normalize();
    this.pos.addScaledVector(this.vDir, this.speed * dt);
    this.pos.y = surface + this.gearHeight;
    this.gload = 1; this.av.set(0, 0, 0);

    // rolled off the deck / runway
    const deck2 = env.base ? env.base.surfaceAt(this.pos.x, this.pos.z) : null;
    if (deck2 === null && this.grounded) {
      if (this.speed > s.stall * 0.95) {
        this.grounded = false; this.landedOn = null;
        env.onEvent?.('airborne', { ac: this, catapult: false, bolter: true });
      } else if (env.base.type === 'carrier' || Math.abs(env.terrain.slopeAt(this.pos.x, this.pos.z)) > 0.2) {
        env.onCrash(this, 'overran the deck');
      }
    }
    if (this.grounded && this.speed < 2 && this.landedOn) {
      env.onEvent?.('stopped', { ac: this });
    }
  }

  // ---------------------------------------------------------------- damage
  damage(amount, attacker, env) {
    if (!this.alive) return;
    this.health -= amount;
    this.lastAttacker = attacker;
    if (this.health <= 0) { this.health = 0; env.onKilled(this, attacker); }
  }

  useStore(kind) { hideStore(this.model, kind); }
}

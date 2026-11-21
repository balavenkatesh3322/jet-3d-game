// AI pilot: converts tactical intent (pursue, evade, form-up, attack ground) into stick inputs.
import * as THREE from 'three';
import { clamp, rand } from '../util/math.js';
import { WEAPONS } from '../combat/Combat.js';

const _inv = new THREE.Quaternion();
const _d = new THREE.Vector3();
const _f = new THREE.Vector3();

// Fly the aircraft toward a world direction. Returns angle-off.
export function steerToward(ac, dirWorld, aggress = 1, maxPull = 1) {
  _inv.copy(ac.quat).invert();
  _d.copy(dirWorld).normalize().applyQuaternion(_inv); // local: -z fwd, +x right, +y up
  const off = Math.acos(clamp(-_d.z, -1, 1));
  const lateral = Math.hypot(_d.x, _d.y);
  let rollErr = Math.atan2(_d.x, _d.y);
  // when the target is nearly dead ahead, keep wings near level instead of snapping
  if (off < 0.12) {
    // blend toward wings-level when the target is nearly dead ahead
    const up = ac.getUp(_f);
    const right = ac.getRight(new THREE.Vector3());
    const levelErr = Math.atan2(right.y, up.y); // >0: right wing high -> roll right to level
    const k = off / 0.12;
    rollErr = rollErr * k + levelErr * (1 - k);
  }
  const c = ac.controls;
  c.roll = clamp(rollErr * 2.2 * aggress, -1, 1);
  const pitchAim = Math.atan2(_d.y, -_d.z);
  const alignment = Math.cos(clamp(rollErr, -Math.PI / 2, Math.PI / 2));
  c.pitch = clamp((off > 0.5 ? 1 : pitchAim * 4) * Math.max(0.2, alignment) * aggress, -0.6, maxPull);
  if (lateral < 1e-4 && _d.z > 0) c.pitch = maxPull; // directly behind
  c.yaw = clamp(_d.x * 2, -1, 1) * 0.5;
  return off;
}

export class Pilot {
  constructor(ac, ctx) {
    this.ac = ac;
    this.ctx = ctx;
    this.state = 'patrol';
    this.target = null;
    this.retarget = 0;
    this.evadeT = 0;
    this.burstT = 0;
    this.formation = null; // { leader, offset }
    this.order = 'engage';
    this.missileCool = rand(3, 7);
    this.flareCool = 0;
    this.groundAttack = false;
  }

  pickTarget() {
    const ac = this.ac;
    const enemies = this.ctx.combat.aircraft.filter((a) => a.alive && a.team !== ac.team);
    let best = null, score = 1e12;
    for (const e of enemies) {
      const d = e.pos.distanceTo(ac.pos);
      let s = d;
      if (e.isPlayer) s *= ac.team === 'red' ? 0.6 : 1; // enemies like the player
      if (this.ctx.playerTarget === e && ac.team === 'blue' && this.order === 'attack') s *= 0.2;
      if (s < score) { score = s; best = e; }
    }
    return best;
  }

  update(dt) {
    const ac = this.ac, c = ac.controls, ctx = this.ctx;
    if (!ac.alive) return;
    c.gun = false; c.missile = false; c.agm = null;
    if (ac.grounded) {
      // takeoff roll / catapult
      c.roll = 0; c.yaw = 0;
      if ((this.launchDelay = (this.launchDelay ?? 0) - dt) > 0) { c.throttleSet = 0.1; c.pitch = 0; return; }
      c.throttleSet = 1.1;
      c.pitch = ac.speed > ac.spec.vr ? 0.8 : 0;
      return;
    }
    c.throttleSet = undefined;
    if (ac.gearDown && ac.pos.y - ctx.terrain.surfaceAt(ac.pos.x, ac.pos.z) > 60) ac.gearDown = false;
    const fwd = ac.getForward(new THREE.Vector3());

    // ---- terrain avoidance has priority
    const look = ac.pos.clone().addScaledVector(ac.vel, 3.5);
    const gh = Math.max(ctx.terrain.surfaceAt(look.x, look.z), ctx.terrain.surfaceAt(ac.pos.x, ac.pos.z));
    const agl = ac.pos.y - gh;
    const sinkRate = ac.vel.y;
    if (agl < 350 + Math.max(0, -sinkRate) * 4 || look.y < gh + 150) {
      steerToward(ac, new THREE.Vector3(fwd.x * 0.4, 1, fwd.z * 0.4), 1.4, 1);
      c.throttleSet = 1.15;
      return;
    }

    // ---- missile evasion
    const threat = ac.incoming.find((m) => m.alive && m.pos.distanceTo(ac.pos) < 3500);
    if (threat) {
      this.evadeT = 2.5;
      this.flareCool -= dt;
      if (this.flareCool <= 0 && ac.ammo.flares > 0 && Math.random() < 0.35 + ac.skill * 0.6) {
        ctx.combat.dropFlares(ac); ac.ammo.flares--; this.flareCool = 1.2 - ac.skill * 0.6;
      }
      // beam / break turn perpendicular to the missile
      const toM = threat.pos.clone().sub(ac.pos).normalize();
      const breakDir = new THREE.Vector3().crossVectors(toM, new THREE.Vector3(0, 1, 0)).normalize();
      if (breakDir.dot(fwd) < 0) breakDir.negate();
      breakDir.y = -0.15;
      steerToward(ac, breakDir, 1.5, 1);
      c.throttleSet = 1.2;
      return;
    }

    // ---- formation flying (wingmen when no enemies / cover order)
    this.retarget -= dt;
    if (this.retarget <= 0 || !this.target || !this.target.alive) {
      this.target = this.pickTarget();
      this.retarget = rand(4, 8);
    }
    const lead = this.formation?.leader;
    if ((!this.target || this.order === 'cover') && lead && lead.alive) {
      const offs = this.formation.offset;
      const lf = lead.getForward(new THREE.Vector3()), lr = lead.getRight(new THREE.Vector3());
      const slot = lead.pos.clone().addScaledVector(lr, offs.x).addScaledVector(lf, offs.z).add(new THREE.Vector3(0, offs.y, 0));
      const to = slot.clone().addScaledVector(lf, 250).sub(ac.pos);
      steerToward(ac, to, 0.8, 0.8);
      const along = slot.clone().sub(ac.pos).dot(lf);
      c.throttleSet = clamp(lead.throttle + along * 0.004, 0.3, 1.2);
      if (this.order === 'cover' && this.target && this.target.pos.distanceTo(ac.pos) < 3000) this.engage(dt, fwd);
      return;
    }

    if (!this.target) {
      // ground attack or patrol orbit
      const gt = ac.team === 'blue' ? ctx.combat.ground.find((g) => g.alive) : null;
      if (gt && ac.ammo.agm > 0) return this.attackGround(gt, dt, fwd);
      const center = new THREE.Vector3(0, 3000, -6000);
      const to = center.sub(ac.pos);
      to.y *= 0.3;
      steerToward(ac, to.lengthSq() > 4e6 ? to : new THREE.Vector3(fwd.z, 0, -fwd.x), 0.6, 0.6);
      c.throttleSet = 0.75;
      return;
    }
    this.engage(dt, fwd);
  }

  engage(dt, fwd) {
    const ac = this.ac, c = ac.controls, ctx = this.ctx, tgt = this.target;
    const to = tgt.pos.clone().sub(ac.pos);
    const dist = to.length();
    // lead pursuit
    const tof = dist / 900;
    const aim = tgt.pos.clone().addScaledVector(tgt.vel, tof * (0.5 + ac.skill * 0.5)).sub(ac.pos);
    const skillPull = 0.75 + ac.skill * 0.25;
    const off = steerToward(ac, aim, 1.2, skillPull);
    // energy management
    c.throttleSet = dist > 2500 ? 1.15 : off > 0.6 ? 1.05 : clamp(0.6 + (tgt.speed - ac.speed) * 0.01 + dist * 0.0002, 0.4, 1.1);

    // gun
    if (dist < 900 && off < 0.06 + (1 - ac.skill) * 0.03) {
      this.burstT += dt;
      if (this.burstT < 1.2) { c.gun = true; }
      else if (this.burstT > 2.2) this.burstT = 0;
    }
    // missile
    this.missileCool -= dt * ctx.aiRate;
    const w = WEAPONS.aam_ai;
    const angleToTarget = fwd.angleTo(to.clone().normalize());
    if (dist < w.range && dist > 600 && angleToTarget < w.cone * Math.PI / 180) {
      const stealth = tgt.spec?.stealth || 0;
      ac.lockT += dt * (1 - stealth * 0.75);
      if (tgt.isPlayer && ac.lockT > 0.3) tgt.lockedBy++;
      if (ac.lockT > w.lockTime && this.missileCool <= 0 && ac.ammo.ir + ac.ammo.radar > 0) {
        c.missile = true;
        this.missileCool = rand(9, 16) - ac.skill * 4;
        ac.lockT = 0;
      }
    } else ac.lockT = Math.max(0, ac.lockT - dt);
  }

  attackGround(gt, dt, fwd) {
    const ac = this.ac, c = ac.controls;
    const to = gt.pos.clone().add(new THREE.Vector3(0, 400, 0)).sub(ac.pos);
    const dist = to.length();
    if (dist > 6000) {
      to.y = Math.max(to.y, -0.1 * dist);
      steerToward(ac, to, 0.8, 0.8);
      c.throttleSet = 1.0;
      return;
    }
    const aim = gt.pos.clone().sub(ac.pos);
    const off = steerToward(ac, aim, 1, 0.8);
    c.throttleSet = 0.85;
    if (off < 0.3 && dist < WEAPONS.agm.range) {
      this.agmCool = (this.agmCool || 0) - dt;
      if (this.agmCool <= 0) { c.agm = gt; this.agmCool = 12; }
    }
  }
}

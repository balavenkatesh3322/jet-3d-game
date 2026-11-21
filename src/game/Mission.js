// Mission controller: spawns the theater, player, wingmen, enemy waves and ground targets;
// runs player weapons/targeting, auto-land, radio script, objectives and scoring.
import * as THREE from 'three';
import { World } from '../world/World.js';
import { Particles } from '../combat/Particles.js';
import { Combat, WEAPONS } from '../combat/Combat.js';
import { Aircraft } from '../aircraft/Aircraft.js';
import { Pilot, steerToward } from '../ai/Pilot.js';
import { GroundUnit } from '../ai/GroundUnits.js';
import { JETS, LIVERIES, ENEMY_JETS } from '../data/jets.js';
import { THEATERS } from '../data/theaters.js';
import { clamp, rand, pick, DEG, headingOf, KTS, FT } from '../util/math.js';

const ENEMY_CALLSIGNS = ['Raven', 'Cobra', 'Falcon', 'Storm', 'Spectre', 'Shadow', 'Talon', 'Wraith', 'Hydra', 'Dragon', 'Jackal', 'Mamba'];
const WING_CALLSIGNS = ['2', '3', '4'];

function bearingWords(deg) {
  return String(Math.round(deg) % 360).padStart(3, '0').split('').join('-');
}

export class Mission {
  constructor(game, cfg) {
    this.game = game;
    this.cfg = cfg;
    this.stage = cfg.stage;
    this.theaterId = cfg.theater;
    this.time = 0;
    this.phase = 'start';
    this.score = 0;
    this.kills = 0;
    this.groundKills = 0;
    this.damageFlash = 0;
    this.autoLand = false;
    this.wingOrder = 'engage';
    this.pending = [];   // timed waves
    this.wrecks = [];
    this.over = false;
    this.callsign = game.save.callsign || 'VIPER';
    this.cs = this.callsign.charAt(0) + this.callsign.slice(1).toLowerCase();
    const diff = { easy: [0.55, 0.7], normal: [1, 1], hard: [1.4, 1.35] }[game.save.settings.difficulty] || [1, 1];
    this.difficulty = diff[0];
    this.aiRate = diff[1];
  }

  // ---------------------------------------------------------------- setup
  build() {
    const g = this.game, scene = g.scene;
    this.world = new World(g.renderer, scene, this.theaterId, g.save.settings.quality);
    this.terrain = this.world.terrain;
    this.base = this.world.base;
    this.particles = new Particles(scene);
    const events = {
      onKilled: (v, a) => this.onKilled(v, a),
      onMessage: (t, k) => g.hud.message(t, k),
      onSound: (n, pos, s) => g.audio.play(n, pos ? pos.distanceTo(g.camera.position) : 0, s),
      onCrash: (ac, r) => this.onCrash(ac, r),
      onEvent: (n, d) => this.onEvent(n, d),
      difficulty: this.difficulty,
    };
    this.events = events;
    this.combat = new Combat(scene, this.particles, this.terrain, events);
    this.env = { terrain: this.terrain, base: this.base, particles: this.particles, onCrash: events.onCrash, onEvent: events.onEvent, onKilled: events.onKilled };
    this.aiCtx = { combat: this.combat, terrain: this.terrain, aiRate: this.aiRate, get playerTarget() { return null; } };
    const self = this;
    Object.defineProperty(this.aiCtx, 'playerTarget', { get() { return self.target; } });

    // ---- player
    const spec = JETS.find((j) => j.id === g.save.selectedJet) || JETS[0];
    const livery = LIVERIES.find((l) => l.id === g.save.livery) || LIVERIES[0];
    this.player = new Aircraft({ spec, livery, team: 'blue', name: `${this.cs} 1`, isPlayer: true });
    scene.add(this.player.model);
    this.combat.aircraft.push(this.player);
    const sp = this.base.spawn;
    this.player.placeOnGround(sp.pos, sp.heading, this.base.deckY);
    if (sp.catapult) this.player.catapult = { state: 'hold', holdT: 0, endZ: sp.launchEndZ };
    this.player.weapon = 'ir';
    this.weapon = 'ir';

    // ---- wingmen
    const wingN = this.stage ? this.stage.wingmen : this.cfg.wingmen ?? 2;
    this.wingmen = [];
    const wingSpec = spec;
    for (let i = 0; i < wingN; i++) {
      const ac = new Aircraft({ spec: wingSpec, livery, team: 'blue', name: `${this.cs} ${WING_CALLSIGNS[i]}`, skill: 0.75 });
      scene.add(ac.model);
      const pilot = new Pilot(ac, this.aiCtx);
      pilot.formation = { leader: this.player, offset: [{ x: 40, y: -5, z: 40 }, { x: -40, y: -5, z: 40 }, { x: 80, y: -10, z: 80 }][i] };
      pilot.voice = ['WING', 'WING2', 'WING3'][i];
      ac.pilot = pilot;
      if (this.base.type === 'carrier') {
        if (i === 0) {
          ac.placeOnGround(new THREE.Vector3(8, 0, -40), 0, this.base.deckY);
          ac.catapult = { state: 'hold', holdT: 0, endZ: sp.launchEndZ };
          pilot.launchDelay = 6;
        } else {
          ac.placeInAir(new THREE.Vector3(-1500 + i * 300, 1500, -3000 - i * 200), new THREE.Vector3(0, 0, -1), 200);
          ac.pendingJoin = true;
        }
      } else {
        ac.placeOnGround(new THREE.Vector3(i % 2 ? -16 : 16, 0, sp.pos.z + 90 + Math.floor(i / 2) * 90), 0, this.base.deckY);
        pilot.launchDelay = 6 + i * 4;
      }
      this.combat.aircraft.push(ac);
      this.wingmen.push(ac);
    }

    // ---- enemies
    const waves = this.stage ? this.stage.waves : this.cfg.waves;
    this.totalAir = waves.reduce((a, w) => a + w.count, 0);
    for (const w of waves) this.pending.push({ ...w, t: w.delay });
    this.enemyIndex = 0;

    // ---- ground targets
    this.groundGroups = [];
    const gts = this.stage ? this.stage.groundTargets : this.cfg.groundTargets || [];
    for (const gt of gts) this.spawnGround(gt);

    // ---- objectives
    this.objectives = [];
    for (const grp of this.groundGroups) this.objectives.push({ key: 'g:' + grp.type, text: `Destroy ${grp.units[0].name}s`, total: grp.units.length, count: 0 });
    if (this.totalAir) this.objectives.push({ key: 'air', text: 'Destroy enemy fighters', total: this.totalAir, count: 0 });
    this.requireLanding = !!this.stage?.requireLanding;
    this.objectives.push({ key: 'land', text: this.requireLanding ? `Land on ${this.base.type === 'carrier' ? 'the carrier' : 'the runway'}` : 'RTB & land (bonus)', total: 1, count: 0, optional: !this.requireLanding, hidden: true });
    this.refreshObjectives();
  }

  spawnGround(gt) {
    const z = gt.zone;
    const a = z.angle * DEG;
    const center = new THREE.Vector3(Math.sin(a) * z.dist, 0, -Math.cos(a) * z.dist);
    const grp = { type: gt.type, units: [] };
    const desert = this.theaterId === 'desert';
    if (gt.type === 'convoy') {
      const dirA = rand(0, Math.PI * 2);
      const dir = new THREE.Vector3(Math.cos(dirA), 0, Math.sin(dirA));
      const start = this.findLand(center, 400);
      for (let i = 0; i < gt.count; i++) {
        const path = (t) => {
          const d = t - i * 45;
          // gentle snake so they follow the terrain
          return { x: start.x + dir.x * d + Math.sin(d * 0.002) * 120 * dir.z, z: start.z + dir.z * d - Math.sin(d * 0.002) * 120 * dir.x };
        };
        const p0 = path(0);
        const u = new GroundUnit('convoy', new THREE.Vector3(p0.x, this.terrain.surfaceAt(p0.x, p0.z), p0.z), { desert, index: i, path });
        this.addGround(u, grp);
      }
    } else {
      for (let i = 0; i < gt.count; i++) {
        let p;
        if (gt.type === 'frigate') p = this.findWater(center, z.radius);
        else if (gt.highGround) p = this.findHigh(center, z.radius);
        else p = this.findLand(center, z.radius);
        const u = new GroundUnit(gt.type, p, { desert, index: i });
        if (gt.type === 'frigate') u.pos.y = 0;
        this.addGround(u, grp);
      }
    }
    this.groundGroups.push(grp);
  }

  addGround(u, grp) {
    u.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.game.scene.add(u.group);
    this.combat.ground.push(u);
    grp.units.push(u);
    u.groupType = grp.type;
  }

  findLand(c, r) {
    for (let i = 0; i < 200; i++) {
      const a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * r;
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      const h = this.terrain.heightAt(x, z);
      if (h > 6 && this.terrain.slopeAt(x, z) < 0.25) return new THREE.Vector3(x, h, z);
    }
    return new THREE.Vector3(c.x, Math.max(0, this.terrain.heightAt(c.x, c.z)), c.z);
  }
  findWater(c, r) {
    for (let i = 0; i < 300; i++) {
      const a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * r * (1 + i / 100);
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      if (this.terrain.heightAt(x, z) < -20) return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(c.x, 0, c.z);
  }
  findHigh(c, r) {
    let best = null, bh = -1e9;
    for (let i = 0; i < 300; i++) {
      const a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * r;
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      const h = this.terrain.heightAt(x, z);
      if (h > bh && this.terrain.slopeAt(x, z) < 0.35 && !this.combat.ground.some((g) => Math.hypot(g.pos.x - x, g.pos.z - z) < 1500)) { bh = h; best = new THREE.Vector3(x, h, z); }
    }
    return best || this.findLand(c, r);
  }

  spawnWave(w) {
    const type = ENEMY_JETS[w.type] || ENEMY_JETS[0];
    const ang = (this.stage?.groundTargets?.[0]?.zone.angle ?? rand(-40, 40)) * DEG + rand(-0.5, 0.5);
    const center = new THREE.Vector3(Math.sin(ang) * w.dist, w.alt, -Math.cos(ang) * w.dist);
    const base = JETS[0];
    const skill = clamp(type.skill + (this.difficulty - 1) * 0.2, 0.1, 1);
    const spec = {
      ...base, thrust: base.thrust * (0.92 + skill * 0.18), abThrust: base.abThrust * (0.92 + skill * 0.15),
      health: 70 + skill * 50, ir: 4, radar: 2, agm: 0, flares: 10 + Math.round(skill * 20),
      stealth: w.type >= 3 ? 0.35 : 0, pitchRate: base.pitchRate * (0.9 + skill * 0.3), maxG: 8 + skill * 2,
    };
    const ace = w.type >= 3;
    for (let i = 0; i < w.count; i++) {
      const name = `${pick(ENEMY_CALLSIGNS)}-${this.enemyIndex + 1}`;
      this.enemyIndex++;
      const ac = new Aircraft({ spec, livery: { base: type.base, alt: type.alt, accent: type.accent }, team: 'red', name: `${name} (${type.name})`, skill, modelSpec: type.model });
      const pos = center.clone().add(new THREE.Vector3(rand(-800, 800), rand(-300, 300), rand(-800, 800)));
      pos.y = Math.max(pos.y, this.terrain.surfaceAt(pos.x, pos.z) + 600);
      const dir = new THREE.Vector3(-pos.x, 0, -pos.z).normalize();
      ac.placeInAir(pos, dir, 230);
      ac.pilot = new Pilot(ac, this.aiCtx);
      ac.typeName = type.name;
      ac.ace = ace;
      this.game.scene.add(ac.model);
      this.combat.aircraft.push(ac);
    }
    const brg = headingOf(center.clone().sub(this.player.pos));
    const km = Math.round(center.distanceTo(this.player.pos) / 1000);
    if (w.delay > 0) this.radio('AWACS', 'Overlord', `${this.cs} one, Overlord. New contacts, ${w.count} ${ace ? 'bandits, flying like aces' : 'bandits'}, bearing ${bearingWords(brg)}, ${km} kilometers, angels ${Math.round(w.alt * FT / 1000)}.`);
    if (ace) setTimeout(() => this.radio('ENEMY', 'Intercept', pick(['This is Black Dragon lead. You are in our sky now.', 'All Dragons, engage. Leave none alive.', 'Their leader is mine.'])), 6000);
  }

  radio(sp, name, text, opts) { this.game.radio.say(sp, name, text, opts); }

  // ---------------------------------------------------------------- objectives / scoring
  refreshObjectives() {
    const list = this.objectives.filter((o) => !o.hidden).map((o) => ({ text: o.text, done: o.count >= o.total, progress: o.total > 1 ? `${o.count}/${o.total}` : '' }));
    this.game.hud.setObjectives(list);
  }

  objective(key) { return this.objectives.find((o) => o.key === key); }

  get primaryDone() { return this.objectives.filter((o) => o.key !== 'land').every((o) => o.count >= o.total); }

  onKilled(v, attacker) {
    const byPlayer = attacker === this.player;
    if (v.isAir) {
      v.alive = false;
      this.combat.explosion(v.pos.clone(), 1.1, 'air');
      this.wrecks.push({ model: v.model, vel: v.vel.clone(), t: 0, spin: rand(-2, 2) });
      if (v.team === 'red') {
        const o = this.objective('air'); if (o) o.count++;
        if (byPlayer) {
          this.kills++; this.score += v.ace ? 250 : 120;
          this.game.hud.message(`SPLASH ONE — ${v.name} DESTROYED`, 'kill');
          this.radio('AWACS', 'Overlord', pick([`Splash one. Good kill, ${this.cs}.`, 'Good kill, good kill.', 'Bandit destroyed. Nice shooting.', `Kill confirmed. ${this.remainingAir()} bandits remaining.`]), { key: 'splash', cooldown: 3000 });
        } else if (attacker?.pilot) {
          this.score += 30;
          this.radio(attacker.pilot.voice || 'WING', attacker.name, pick(['Splash one!', 'Bandit down!', 'Got him!', 'Scratch one bandit.']), { key: 'wsplash', cooldown: 3000 });
        }
      } else if (v.team === 'blue' && !v.isPlayer) {
        this.radio('AWACS', 'Overlord', `${v.name} is down! ${v.name} is down!`, { priority: 2 });
        this.game.hud.message(`${v.name} SHOT DOWN`, 'warn');
      }
      if (v.isPlayer) this.fail('You were shot down');
    } else {
      const o = this.objective('g:' + v.groupType); if (o) o.count++;
      if (byPlayer) {
        this.groundKills++;
        const pts = { hq: 600, frigate: 250, sam: 150, radar: 150 }[v.type] || 90;
        this.score += pts;
        this.game.hud.message(`TARGET DESTROYED — ${v.name.toUpperCase()}`, 'kill');
        this.radio('AWACS', 'Overlord', pick([`${v.name} destroyed. Good effect on target.`, 'Target destroyed.', `Shack! ${v.name} is gone.`]), { key: 'gkill', cooldown: 4000 });
      }
    }
    this.refreshObjectives();
    this.checkComplete();
  }

  remainingAir() { return this.combat.aircraft.filter((a) => a.alive && a.team === 'red').length + this.pending.reduce((a, w) => a + w.count, 0); }

  checkComplete() {
    if (this.phase === 'rtb' || this.over) return;
    if (this.primaryDone) {
      this.phase = 'rtb';
      const land = this.objective('land'); land.hidden = false;
      this.refreshObjectives();
      this.game.hud.banner('PRIMARY OBJECTIVES COMPLETE', this.requireLanding ? 'Return to base and land' : 'Land for a bonus, or press ENTER to end the mission', 6);
      this.radio('AWACS', 'Overlord', `All primary targets destroyed. Outstanding work, ${this.cs}. Return to base.`, { priority: 2 });
      this.game.music.setIntensity(0.2);
    }
  }

  onCrash(ac, reason) {
    if (!ac.alive) return;
    ac.alive = false;
    ac.health = 0;
    const water = reason === 'water' || (this.terrain.heightAt(ac.pos.x, ac.pos.z) <= 0 && reason !== 'terrain');
    this.combat.explosion(ac.pos.clone(), 1.4, water ? 'water' : 'ground');
    ac.model.visible = false;
    if (ac.isPlayer) this.fail(reason === 'terrain' ? 'Controlled flight into terrain' : reason === 'water' ? 'Crashed into the sea' : `Crashed: ${reason}`);
    else if (ac.team === 'red') {
      const o = this.objective('air'); if (o) o.count++;
      this.refreshObjectives(); this.checkComplete();
    }
  }

  onEvent(name, d) {
    const p = this.player;
    const isP = d.ac === p;
    const g = this.game;
    switch (name) {
      case 'catapult':
        if (isP) { g.audio.play('catapult'); g.hud.banner('CATAPULT LAUNCH', 'Afterburner engaged — rotate gently', 2.5); g.shake(1.2); }
        else this.radio(d.ac.pilot?.voice || 'WING', d.ac.name, 'Off the cat. Climbing to join.', { key: 'wcat' });
        break;
      case 'airborne':
        if (isP) {
          if (d.bolter) { this.radio('LSO', 'Paddles', 'Bolter, bolter, bolter! Power up and come around.', { priority: 2 }); g.hud.banner('BOLTER', 'Go around and try again', 3); }
          else {
            g.hud.message(d.catapult ? 'Airborne — raise gear [G]' : 'Positive rate — raise gear [G]');
            if (this.phase === 'start') {
              this.phase = 'combat';
              g.music.setIntensity(0.35);
              setTimeout(() => this.briefContacts(), 4000);
            }
          }
        }
        break;
      case 'touchdown':
        if (isP) { g.audio.play('touchdown'); g.shake(0.6); }
        break;
      case 'wire':
        if (isP) {
          g.audio.play('wire');
          g.hud.banner('TRAP!', `Caught the number ${d.wire} wire${d.wire === 3 ? ' — perfect!' : ''}`, 3.5);
          this.radio('LSO', 'Paddles', d.wire === 3 ? 'Trap, three wire. Beautiful pass.' : `Trap, ${['one', 'two', 'three', 'four'][d.wire - 1]} wire. Welcome home.`, { priority: 2 });
          this.wire = d.wire;
          this.autoLand = false;
        }
        break;
      case 'bolter': break;
      case 'stopped':
        if (isP && !this.over && this.phase !== 'start') this.onLanded();
        break;
      default: break;
    }
  }

  briefContacts() {
    if (this.over) return;
    const enemies = this.combat.aircraft.filter((a) => a.alive && a.team === 'red');
    const tgt = enemies[0] || this.combat.ground.find((x) => x.alive);
    if (!tgt) { this.radio('AWACS', 'Overlord', `${this.cs} one, Overlord. Picture clean for now. Proceed to the target area.`); return; }
    const brg = headingOf(tgt.pos.clone().sub(this.player.pos));
    const km = Math.round(tgt.pos.distanceTo(this.player.pos) / 1000);
    this.radio('AWACS', 'Overlord', `${this.cs} one, Overlord. ${enemies.length ? `${enemies.length} bandits` : 'Targets'} bearing ${bearingWords(brg)}, ${km} kilometers. You are weapons free.`, { priority: 1 });
    if (this.wingmen[0]) setTimeout(() => this.radio('WING', this.wingmen[0].name, `${this.wingmen[0].name}, tally. Fighting wing, let's go.`), 3000);
  }

  onLanded() {
    this.over = true;
    const land = this.objective('land'); land.count = 1; land.hidden = false;
    this.refreshObjectives();
    const carrier = this.base.type === 'carrier';
    const bonus = carrier ? (this.wire === 3 ? 1000 : 700) : 500;
    if (this.primaryDone) {
      this.score += bonus;
      this.radio('TOWER', this.base.tower, `${this.cs} one, welcome back. Taxi to the line. Great flying.`, { priority: 2 });
      setTimeout(() => this.complete(true), 2500);
    } else {
      this.over = false; // landed before finishing: rearm & continue
      this.radio('TOWER', this.base.tower, `${this.cs} one, you're down. Rearmed and refueled — you are cleared for another launch.`, { priority: 2 });
      this.rearm();
    }
  }

  rearm() {
    const p = this.player, s = p.spec;
    p.ammo = { gun: s.gun, ir: s.ir, radar: s.radar, agm: s.agm, flares: s.flares };
    p.health = p.maxHealth;
    p.model.userData.stores.ir.concat(p.model.userData.stores.radar, p.model.userData.stores.agm).forEach((m) => { m.visible = true; });
    p.landedOn = null; p.arrested = false;
    if (this.base.type === 'carrier') {
      p.placeOnGround(this.base.spawn.pos, 0, this.base.deckY);
      p.catapult = { state: 'hold', holdT: 0, endZ: this.base.spawn.launchEndZ };
    } else p.placeOnGround(this.base.spawn.pos, 0, this.base.deckY);
    this.game.hud.banner('REARMED & REFUELED', this.base.type === 'carrier' ? 'Throttle to MIL/AB for catapult launch' : 'Throttle up for takeoff', 3);
  }

  fail(reason) {
    if (this.over) return;
    this.over = true;
    this.phase = 'failed';
    this.game.hud.banner('MISSION FAILED', reason, 4);
    this.radio('AWACS', 'Overlord', pick([`${this.cs} one is down! Search and rescue is en route.`, `We lost ${this.cs} one. Mission abort.`]), { priority: 2 });
    setTimeout(() => this.game.endMission({ success: false, reason, score: this.score, kills: this.kills, groundKills: this.groundKills }), 4200);
  }

  complete(landed) {
    if (this.completed) return;
    this.completed = true;
    this.over = true;
    const hp = this.player.health / this.player.maxHealth;
    const stars = 1 + (landed ? 1 : 0) + (hp > 0.6 && this.time < 900 ? 1 : 0);
    this.game.endMission({ success: true, landed, score: this.score, kills: this.kills, groundKills: this.groundKills, stars, time: this.time });
  }

  // ---------------------------------------------------------------- per-frame
  update(dt) {
    this.time += dt;
    const g = this.game, input = g.input, p = this.player;

    p.lockedBy = 0;
    // timed waves (clock starts once the player is airborne)
    if (this.phase !== 'start') {
      for (const w of this.pending) w.t -= dt;
      const ready = this.pending.filter((w) => w.t <= 0);
      for (const w of ready) { this.spawnWave(w); this.pending.splice(this.pending.indexOf(w), 1); }
    }

    if (this.time > 0.5 && !this.introDone) {
      this.introDone = true;
      if (this.base.type === 'carrier') {
        this.radio('TOWER', 'Mother', `${this.cs} one, Mother. You are hooked up on cat one. Run up to military power and salute when ready.`, { priority: 2 });
        g.hud.banner(this.stage ? this.stage.name.toUpperCase() : 'SKIRMISH', 'Hold SHIFT to run up throttle — catapult fires at MIL power', 5);
      } else {
        this.radio('TOWER', this.base.tower, `${this.cs} flight, ${this.base.tower}. Runway three-six, wind calm. Cleared for takeoff.`, { priority: 2 });
        g.hud.banner(this.stage ? this.stage.name.toUpperCase() : 'SKIRMISH', 'Hold SHIFT for throttle, pull back (S) at 140 kts to rotate', 5);
      }
      for (const w of this.wingmen) if (w.pendingJoin) setTimeout(() => this.radio(w.pilot.voice, w.name, `${w.name} on CAP, joining on you.`), 2500);
    }

    if (p.alive) this.updatePlayer(dt);
    else p.controls.gun = false;

    // AI
    for (const ac of this.combat.aircraft) {
      if (ac.isPlayer || !ac.alive) continue;
      ac.pilot.order = this.wingOrder;
      ac.pilot.update(dt);
      this.aiWeapons(ac, dt);
    }
    // physics
    for (const ac of this.combat.aircraft) if (ac.alive) ac.update(dt, this.env);
    // ground units
    const gctx = { combat: this.combat, particles: this.particles, terrain: this.terrain, t: this.time, player: p, aiRate: this.aiRate,
      onLaunchWarning: () => this.radio('AWACS', 'Overlord', `${this.cs} one, SAM launch! SAM launch!`, { key: 'samlaunch', cooldown: 8000, priority: 2 }) };
    for (const u of this.combat.ground) u.update(dt, gctx);
    // re-evaluate locks on player (computed in AI/ground updates above for next frame)
    this.combat.update(dt, g.camera.position);
    this.particles.update(dt);
    this.updateWrecks(dt);
    this.world.update(dt, this.time, g.camera, p.pos);

    // wingmen chatter
    if (p.incoming.length && this.wingmen.some((w) => w.alive)) {
      const w = this.wingmen.find((x) => x.alive);
      this.radio(w.pilot.voice, w.name, pick([`${this.cs} lead, missile on your six! Break, break!`, 'Missile inbound, dump flares!', 'Break left! Break left!']), { key: 'breakcall', cooldown: 12000, priority: 1 });
    }
    if (p.alive && p.incoming.length) g.radio.warn('Missile. Missile.');
    if (!this.phase || this.phase === 'combat') {
      const anyRed = this.combat.aircraft.some((a) => a.alive && a.team === 'red');
      g.music.setIntensity(anyRed && p.pos.distanceTo(this.nearestEnemyPos() || p.pos) < 12000 ? 1 : 0.35);
    }
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.5);
    if (this.lastHealth !== undefined && p.health < this.lastHealth) { this.damageFlash = Math.min(0.8, this.damageFlash + 0.3 + (this.lastHealth - p.health) / 60); g.shake(0.5); }
    this.lastHealth = p.health;
    if (p.health < p.maxHealth * 0.3 && p.alive) g.radio.warn('Warning. Engine fire.');

    if (input.hit('Enter') && this.phase === 'rtb' && !this.requireLanding && !this.over) {
      this.over = true;
      this.complete(false);
    }
  }

  nearestEnemyPos() {
    let best = null, bd = 1e12;
    for (const a of this.combat.aircraft) if (a.alive && a.team === 'red') { const d = a.pos.distanceToSquared(this.player.pos); if (d < bd) { bd = d; best = a.pos; } }
    return best;
  }

  aiWeapons(ac, dt) {
    const c = ac.controls;
    if (c.gun) {
      ac.gunAcc = (ac.gunAcc || 0) + dt * 22;
      while (ac.gunAcc >= 1) { ac.gunAcc--; this.combat.fireGun(ac, dt); }
    }
    if (c.missile && ac.pilot.target) {
      if (ac.ammo.ir > 0) ac.ammo.ir--; else ac.ammo.radar--;
      this.combat.fireMissile(ac, 'aam_ai', ac.pilot.target);
      if (ac.team === 'blue') this.radio(ac.pilot.voice || 'WING', ac.name, pick(['Fox two!', 'Fox three!', 'Fox two, fox two!']), { key: 'fox' + ac.id, cooldown: 5000 });
      else if (ac.pilot.target.isPlayer) this.game.hud.message(`WARNING: ${ac.name.split(' ')[0]} FIRED MISSILE! [X] FLARES`, 'warn');
    }
    if (c.agm && ac.ammo.agm > 0) {
      ac.ammo.agm--;
      this.combat.fireMissile(ac, 'agm', c.agm);
      this.radio(ac.pilot.voice || 'WING', ac.name, 'Rifle, rifle! Missile away on ground target.', { key: 'rifle' + ac.id, cooldown: 8000 });
    }
  }

  // ---------------------------------------------------------------- player
  updatePlayer(dt) {
    const g = this.game, input = g.input, p = this.player, c = p.controls;
    // stick
    if (this.autoLand) this.autoLandControl(dt);
    else if (this.debugPilot) this.debugPilot(this, dt); // test hook
    else {
      c.pitch = input.axes.pitch; c.roll = input.axes.roll; c.yaw = input.axes.yaw;
      c.throttle = input.axes.throttle; c.throttleSet = undefined;
      if (input.mouseFlight && g.mouseStick) { c.pitch = clamp(c.pitch + g.mouseStick.y, -1, 1); c.roll = clamp(c.roll + g.mouseStick.x, -1, 1); }
    }
    if (Math.abs(input.axes.pitch) > 0.5 || Math.abs(input.axes.roll) > 0.5) { if (this.autoLand) { this.autoLand = false; g.hud.message('Auto-land disengaged'); } }
    c.brake = input.down('KeyB');
    p.airbrake = input.down('KeyB') && !p.grounded;

    if (input.hit('KeyG') && !p.grounded) { p.gearDown = !p.gearDown; g.audio.play('gear'); g.hud.message(p.gearDown ? 'Gear DOWN' + (this.base.type === 'carrier' ? ' — hook down' : '') : 'Gear UP'); }
    if (input.hit('KeyL')) {
      this.autoLand = !this.autoLand;
      this.onFinal = false; this.turnIn = false;
      g.hud.message(this.autoLand ? 'AUTO-LAND ENGAGED — approach to ' + this.base.tower.split(' ')[0] : 'Auto-land disengaged', 'info');
      if (this.autoLand) this.radio('TOWER', this.base.tower, `${this.cs} one, ${this.base.tower}. Radar contact. Fly heading for final approach, you're cleared to land.`, { key: 'appr', cooldown: 20000 });
    }
    if (input.hit('Tab')) {
      this.wingOrder = this.wingOrder === 'engage' ? 'cover' : this.wingOrder === 'cover' ? 'attack' : 'engage';
      const txt = { engage: 'Engage at will', cover: 'Cover me — form on my wing', attack: 'Attack my target' }[this.wingOrder];
      g.hud.message(`WINGMEN: ${txt.toUpperCase()}`);
      const w = this.wingmen.find((x) => x.alive);
      if (w) this.radio('SELF', p.name, `${this.cs} flight, ${txt.toLowerCase()}.`, { priority: 1, cooldown: 0, key: 'order' + this.time });
      if (w) setTimeout(() => this.radio(w.pilot.voice, w.name, pick(['Copy.', 'Wilco.', 'Roger that, lead.'])), 2200);
    }

    // weapon select
    if (input.hit('Digit1')) this.selectWeapon('ir');
    if (input.hit('Digit2')) this.selectWeapon('radar');
    if (input.hit('Digit3')) this.selectWeapon('agm');
    if (input.hit('Digit4')) this.selectWeapon('gun');
    if (input.hit('KeyR')) this.selectWeapon({ ir: 'radar', radar: 'agm', agm: 'gun', gun: 'ir' }[this.weapon]);

    // targeting
    if (input.hit('KeyT')) this.cycleTarget();
    if (!this.target || !this.target.alive || this.target.isFlare) this.autoTarget();
    this.updateLock(dt);

    // gun
    this.firing = false;
    if (input.down('Space') && p.ammo.gun > 0 && !p.grounded) {
      this.firing = true;
      this.gunAcc = (this.gunAcc || 0) + dt * 50;
      while (this.gunAcc >= 1 && p.ammo.gun > 0) { this.gunAcc--; p.ammo.gun--; this.combat.fireGun(p, dt); }
    }
    // missile
    if (input.hit('KeyF') && this.weapon !== 'gun' && !p.grounded) {
      if (p.ammo[this.weapon] > 0 && p.cool.missile <= 0) {
        p.ammo[this.weapon]--;
        p.cool.missile = 0.45;
        const tgt = this.locked ? this.target : null;
        this.combat.fireMissile(p, this.weapon, tgt);
        const call = this.weapon === 'ir' ? 'Fox two!' : this.weapon === 'radar' ? 'Fox three!' : 'Rifle!';
        g.hud.message(`${call} ${tgt ? '' : '(no lock)'}`, 'info');
        this.radio('SELF', p.name, call, { key: 'pfox', cooldown: 2500 });
        if (p.ammo[this.weapon] === 0) setTimeout(() => this.game.hud.message(`${WEAPONS[this.weapon]?.name || ''} EMPTY`, 'warn'), 400);
      } else if (p.ammo[this.weapon] <= 0) { g.audio.play('warn'); g.hud.message('NO AMMO — switch weapon [1-3 / R]', 'warn'); }
    }
    // flares
    if (input.down('KeyX') && p.cool.flare <= 0 && p.ammo.flares > 0 && !p.grounded) {
      p.ammo.flares--; p.cool.flare = 0.5; this.combat.dropFlares(p);
    }
    p.weapon = this.weapon;
  }

  selectWeapon(w) {
    this.weapon = w; this.lockT = 0; this.locked = false;
    this.game.audio.play('click');
    this.game.hud.message(`WEAPON: ${w === 'gun' ? 'GUN' : WEAPONS[w].name}`);
    this.target = null;
  }

  validTargets() {
    const wantAir = this.weapon !== 'agm';
    return this.combat.allTargets().filter((e) => e.alive && e.team === 'red' && (this.weapon === 'gun' ? true : e.isAir === wantAir));
  }

  autoTarget() {
    const p = this.player;
    const fwd = p.getForward(new THREE.Vector3());
    let best = null, bs = 1e12;
    for (const e of this.validTargets()) {
      const to = e.pos.clone().sub(p.pos); const d = to.length();
      const ang = fwd.angleTo(to.divideScalar(d || 1));
      const s = ang * 6000 + d;
      if (s < bs) { bs = s; best = e; }
    }
    if (best !== this.target) { this.lockT = 0; this.locked = false; }
    this.target = best;
  }

  cycleTarget() {
    const list = this.validTargets();
    if (!list.length) return;
    const p = this.player;
    list.sort((a, b) => a.pos.distanceToSquared(p.pos) - b.pos.distanceToSquared(p.pos));
    const i = list.indexOf(this.target);
    this.target = list[(i + 1) % list.length];
    this.lockT = 0; this.locked = false;
    this.game.audio.play('click');
  }

  updateLock(dt) {
    const p = this.player, t = this.target;
    this.seeker = 0;
    if (!t || this.weapon === 'gun') { this.locked = false; this.lockT = 0; return; }
    const w = WEAPONS[this.weapon];
    const to = t.pos.clone().sub(p.pos);
    const d = to.length();
    const ang = p.getForward(new THREE.Vector3()).angleTo(to.normalize()) / DEG;
    const inCone = ang < w.cone && d < w.range && (w.air === t.isAir);
    const wasLocked = this.locked;
    if (inCone && p.ammo[this.weapon] > 0) {
      this.lockT = Math.min(w.lockTime, this.lockT + dt);
      this.seeker = 1;
    } else this.lockT = Math.max(0, this.lockT - dt * 2);
    this.locked = this.lockT >= w.lockTime && inCone;
    if (this.locked) this.seeker = 2;
    if (this.locked && !wasLocked) this.game.audio.play('lock');
    if (this.weapon !== 'ir' && this.seeker === 1) this.seeker = 0; // only IR has the growl
    if (this.weapon !== 'ir' && this.locked) this.seeker = 2;
  }

  // ---------------------------------------------------------------- landing
  ilsState() {
    const p = this.player, a = this.base.approach;
    const rel = p.pos.clone().sub(a.threshold);
    const d = -rel.dot(a.dir);
    const right = new THREE.Vector3().crossVectors(a.dir, new THREE.Vector3(0, 1, 0));
    const lateral = rel.dot(right);
    const desiredAlt = Math.max(0, d) * Math.tan(a.glide);
    const alt = p.pos.y - a.threshold.y;
    const gs = (desiredAlt - alt) / Math.max(20, d * Math.tan(0.8 * DEG));
    const loc = -lateral / Math.max(30, d * Math.tan(2.5 * DEG));
    return { d, lateral, desiredAlt, alt, gs, loc, a };
  }

  ilsHud() {
    const p = this.player;
    if (p.grounded || !p.alive) return null;
    const s = this.ilsState();
    if (s.d < -200 || s.d > 22000) return null;
    if (!(p.gearDown || this.autoLand || this.phase === 'rtb')) return null;
    const targetSpeed = p.spec.stall * 1.32;
    let hint = '';
    if (!p.gearDown && s.d < 9000) hint = 'GEAR DOWN [G]';
    else if (Math.abs(s.loc) > 0.6) hint = s.loc > 0 ? 'COME RIGHT FOR LINEUP' : 'COME LEFT FOR LINEUP';
    else if (s.gs > 0.6) hint = 'LOW — POWER UP';
    else if (s.gs < -0.6) hint = 'HIGH — EASE DOWN';
    else if (p.speed > targetSpeed + 25) hint = 'FAST — THROTTLE BACK / BRAKE [B]';
    else if (p.speed < targetSpeed - 12) hint = 'SLOW — POWER!';
    // LSO calls on carrier final
    if (this.base.type === 'carrier' && s.d < 2500 && s.d > 150 && p.gearDown) {
      if (!this.ballCalled) { this.ballCalled = true; this.radio('LSO', 'Paddles', `${this.cs} one, call the ball.`, { priority: 2 }); setTimeout(() => this.radio('SELF', p.name, `${this.cs} one, Hornet ball, state four point two.`), 1600); setTimeout(() => this.radio('LSO', 'Paddles', 'Roger ball.'), 3600); }
      if (s.gs > 1) this.radio('LSO', 'Paddles', 'Power. Power!', { key: 'lsopower', cooldown: 4000 });
      else if (s.gs < -1) this.radio('LSO', 'Paddles', "You're high.", { key: 'lsohigh', cooldown: 4000 });
      else if (Math.abs(s.loc) > 1) this.radio('LSO', 'Paddles', s.loc > 0 ? 'Right for lineup.' : 'Come left.', { key: 'lsoline', cooldown: 4000 });
    } else if (s.d > 4000) this.ballCalled = false;
    return { loc: s.loc, gs: s.gs, dist: Math.max(0, s.d), name: this.base.type === 'carrier' ? 'CVN-77 ICLS' : 'RWY 36 ILS', hint, targetSpeed };
  }

  autoLandControl(dt) {
    const p = this.player, c = p.controls;
    const s = this.ilsState();
    const a = s.a;
    const right = new THREE.Vector3().crossVectors(a.dir, new THREE.Vector3(0, 1, 0));
    const approachSpeed = p.spec.stall * 1.3;
    let aim;
    const fwd = p.getForward(new THREE.Vector3());
    const aligned = fwd.dot(a.dir) > 0.6;
    const fafD = 11000;
    const faf = a.threshold.clone().addScaledVector(a.dir, -fafD);
    if (!this.onFinal && s.d > 1500 && s.d < 15000 && aligned && Math.abs(s.lateral) < s.d * 0.2 + 300 && s.alt - s.desiredAlt < 500) this.onFinal = true;
    const outer = a.threshold.clone().addScaledVector(a.dir, -fafD - 5000);
    if (!this.onFinal && !this.turnIn && Math.hypot(p.pos.x - outer.x, p.pos.z - outer.z) < 2500) this.turnIn = true;
    if (this.onFinal) this.turnIn = false;
    if (this.onFinal && s.d < -300) this.onFinal = false; // went around
    if (this.onFinal) {
      // on final: aim at a point down the glideslope
      const lead = clamp(p.speed * 7, 400, 1200);
      const ahead = Math.max(s.d - lead, -400);
      const gsErr = s.desiredAlt - s.alt; // + = below the glideslope
      const corr = clamp(gsErr * 1.6, -250, 120);
      aim = a.threshold.clone().addScaledVector(a.dir, -ahead).add(new THREE.Vector3(0, Math.max(0, ahead) * Math.tan(a.glide) + (this.base.type === 'carrier' ? -8 : 1) + corr, 0));
      aim.addScaledVector(right, -s.lateral * 0.1);
      if (s.d < 9000 && !p.gearDown) { p.gearDown = true; this.game.audio.play('gear'); this.game.hud.message('Auto-land: gear down'); }
      p.airbrake = p.speed > approachSpeed + 15;
    } else {
      // fly to the final approach fix (11 km out), slightly offset so we turn onto final
      // pattern: head for an outer point behind the fix, then turn in toward the fix
      const wp = (this.turnIn || s.d > fafD - 1000) ? faf : outer;
      aim = wp.clone().add(new THREE.Vector3(0, fafD * Math.tan(a.glide) + 150, 0));
      if (p.gearDown) { p.gearDown = false; }
    }
    // terrain clearance (look ahead)
    const look = p.pos.clone().addScaledVector(p.vel, 6);
    const th = Math.max(this.terrain.surfaceAt(look.x, look.z), this.terrain.surfaceAt(p.pos.x, p.pos.z));
    if (s.d > 2500 || !this.onFinal) aim.y = Math.max(aim.y, th + 350);
    const dir = aim.sub(p.pos).normalize();
    steerToward(p, dir, 0.7, 0.6);
    const tgtSpeed = this.onFinal ? (s.d < 9000 ? approachSpeed : approachSpeed + 30) : 200;
    c.throttleSet = clamp(0.55 + (tgtSpeed - p.speed) * 0.03 + (p.vel.y < -12 ? 0.2 : 0), 0.1, 1.0);
  }

  // ---------------------------------------------------------------- wrecks
  updateWrecks(dt) {
    for (const w of this.wrecks) {
      w.t += dt;
      w.vel.y -= 9.81 * dt;
      w.vel.multiplyScalar(Math.exp(-0.3 * dt));
      w.model.position.addScaledVector(w.vel, dt);
      w.model.rotateZ(w.spin * dt); w.model.rotateX(w.spin * 0.3 * dt);
      if (Math.random() < 0.8) {
        const q = w.model.position;
        this.particles.smoke.spawn({ x: q.x, y: q.y, z: q.z, life: 4, size0: 6, size1: 30, color0: [0.1, 0.1, 0.1, 0.8], color1: [0.3, 0.3, 0.3, 0], drag: 0.5 });
        this.particles.fire.spawn({ x: q.x, y: q.y, z: q.z, life: 0.4, size0: 8, size1: 2, color0: [1, 0.6, 0.2, 1], color1: [0.8, 0.2, 0, 0] });
      }
      const gh = this.terrain.surfaceAt(w.model.position.x, w.model.position.z);
      if (w.model.position.y < gh + 1 || w.t > 20) {
        this.combat.explosion(w.model.position.clone(), 1.2, gh <= 0.01 ? 'water' : 'ground');
        w.model.visible = false; w.done = true;
      }
    }
    this.wrecks = this.wrecks.filter((w) => !w.done);
  }

  // ---------------------------------------------------------------- HUD data
  hudState() {
    const p = this.player, g = this.game;
    const contacts = [];
    for (const e of this.combat.allTargets()) {
      if (!e.alive || e === p) continue;
      const dist = e.pos.distanceTo(p.pos);
      if (dist > 30000) continue;
      contacts.push({ e, dist, friendly: e.team === 'blue', selected: e === this.target, objective: !e.isAir });
    }
    const agl = p.pos.y - this.terrain.surfaceAt(p.pos.x, p.pos.z) - p.gearHeight;
    const vs = p.vel.y;
    const fwd = p.getForward(new THREE.Vector3());
    const lookT = clamp(-vs, 0, 200) > 0 ? agl / Math.max(1, -vs) : 99;
    const pullUp = !p.grounded && p.alive && agl < 600 && lookT < 6 && !p.gearDown;
    const stall = !p.grounded && p.speed < p.spec.stall * 1.05 && p.pos.y > 30;
    if (pullUp) g.radio.warn('Pull up. Pull up.');
    else if (stall) g.radio.warn('Stall. Stall.');
    const dist0 = Math.max(Math.abs(p.pos.x), Math.abs(p.pos.z));
    const zoneWarn = dist0 > 26000;
    const nearBase = p.pos.distanceTo(this.base.group.position) < 2500;
    void fwd;
    return {
      player: p, camera: g.camera, cockpit: g.camMode === 'cockpit', camName: g.camName,
      contacts, target: this.target, locked: this.locked, lockProgress: this.target && this.weapon !== 'gun' ? this.lockT / WEAPONS[this.weapon].lockTime : 0,
      weapon: this.weapon, agl, missiles: this.combat.missiles,
      missileInbound: p.incoming.length > 0, lockedOn: p.lockedBy > 0,
      pullUp, stall, zoneWarn, zone: zoneWarn ? 'LEAVING COMBAT AREA' : nearBase ? (this.base.type === 'carrier' ? 'CARRIER SAFE ZONE' : 'AIRBASE ZONE') : THEATERS[this.theaterId].name.toUpperCase(),
      radarRange: this.weapon === 'agm' ? 10000 : 16000, basePos: this.base.group.position,
      ils: this.ilsHud(), autoLand: this.autoLand, isCarrier: this.base.type === 'carrier',
      damageFlash: this.damageFlash, cloud: g.cloudDensity || 0,
      kills: this.kills + this.groundKills, score: this.score, showFps: g.save.settings.showFps,
    };
  }

  dispose() {
    const scene = this.game.scene;
    for (const a of this.combat.aircraft) scene.remove(a.model);
    for (const u of this.combat.ground) scene.remove(u.group);
    for (const w of this.wrecks) scene.remove(w.model);
    this.combat.dispose();
    this.particles.smoke.dispose(scene); this.particles.fire.dispose(scene);
    this.world.dispose();
  }
}

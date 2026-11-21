// Top-level game: renderer + post-processing, camera rigs, main loop, state machine (menu <-> mission).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Input } from './input.js';
import { loadSave, writeSave } from './save.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { Music } from '../audio/Music.js';
import { Radio } from '../audio/Radio.js';
import { HUD } from '../ui/HUD.js';
import { Menus } from '../ui/Menus.js';
import { Mission } from '../game/Mission.js';
import { buildJet, animateJet } from '../aircraft/JetModel.js';
import { JETS, LIVERIES } from '../data/jets.js';
import { STAGES } from '../data/stages.js';
import { clamp, damp, rand } from '../util/math.js';

const CAMS = [
  { id: 'chase', name: 'CHASE' },
  { id: 'cockpit', name: 'COCKPIT' },
  { id: 'far', name: 'FAR CHASE' },
  { id: 'padlock', name: 'TARGET LOCK' },
  { id: 'flyby', name: 'CINEMATIC' },
];

export class Game {
  constructor(container) {
    this.container = container;
    this.save = loadSave();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.55;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 140000);
    this.camQuat = new THREE.Quaternion();
    this.camIdx = 0;
    this.shakeAmt = 0;

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.4, 4.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.input = new Input();
    this.input.invertPitch = this.save.settings.invertPitch;
    this.audio = new AudioEngine();
    this.audio.setVolumes({ sfx: this.save.settings.sfx, music: this.save.settings.music, voice: this.save.settings.voice });
    this.music = new Music(this.audio);
    this.hud = new HUD(document.getElementById('hud'));
    this.hud.show(false);
    this.radio = new Radio(this.audio, (s) => this.hud.subtitle(s));
    this.menus = new Menus(this, document.getElementById('menus'));

    this.state = 'menu';
    this.mission = null;
    this.paused = false;
    this.lastT = performance.now();
    this.time = 0;
    this.buildShowroom();
    this.applyQuality();

    window.addEventListener('resize', () => this.onResize());
    const unlockAudio = () => { this.audio.init(); this.audio.setVolumes(this.save.settings); if (this.state === 'menu') this.music.start('menu'); };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    this.menus.show('main');
    this.renderer.setAnimationLoop(() => this.frame());
  }

  pixelRatio() {
    const q = this.save.settings.quality;
    return Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.25 : 1);
  }

  applyQuality() {
    const q = this.save.settings.quality;
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.shadowMap.enabled = q !== 'low';
    this.bloom.enabled = q !== 'low';
    this.onResize();
  }

  persist() { writeSave(this.save); }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
    this.mission?.particles.setViewport(innerHeight * this.renderer.getPixelRatio(), this.camera.fov * Math.PI / 180);
  }

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  // ---------------------------------------------------------------- showroom (menu background)
  buildShowroom() {
    const s = (this.showroom = new THREE.Scene());
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    s.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    s.background = new THREE.Color(0x07090d);
    s.fog = new THREE.Fog(0x07090d, 40, 140);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: 0x14181e, metalness: 0.6, roughness: 0.35 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(13, 13.3, 96), new THREE.MeshBasicMaterial({ color: 0x22d3ee }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; s.add(ring);
    const grid = new THREE.GridHelper(120, 60, 0x1d2a33, 0x111820); grid.position.y = 0.01; s.add(grid);
    const key = new THREE.SpotLight(0xffffff, 700, 120, 0.45, 0.6, 1.2);
    key.position.set(20, 30, 20); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); s.add(key);
    const rim = new THREE.SpotLight(0x38bdf8, 900, 120, 0.6, 0.6, 1.2); rim.position.set(-25, 15, -20); s.add(rim);
    const warm = new THREE.PointLight(0xff8a3d, 200, 60); warm.position.set(0, 3, 22); s.add(warm);
    s.add(new THREE.AmbientLight(0x404650, 0.6));
    this.showroomCam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 400);
    this.setShowroomJet(this.save.selectedJet, this.save.livery);
  }

  setShowroomJet(id, livery) {
    if (this.showJet) this.showroom.remove(this.showJet);
    const spec = JETS.find((j) => j.id === id) || JETS[0];
    const lv = LIVERIES.find((l) => l.id === livery) || LIVERIES[0];
    this.showJet = buildJet(spec.model, lv, { ir: spec.ir, radar: spec.radar, agm: spec.agm }, { stealthGlass: spec.stealth > 0.5 });
    this.showJet.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.showJet.position.y = this.showJet.userData.gearHeight;
    this.showJet.userData.gearT = 1;
    this.showroom.add(this.showJet);
    this.showSpec = spec;
  }

  // ---------------------------------------------------------------- mission flow
  startMission(cfg) {
    this.menus.show('loading');
    this.audio.init();
    setTimeout(() => {
      try {
        this.disposeMission();
        this.mission = new Mission(this, cfg);
        this.mission.build();
        this.mission.particles.setViewport(innerHeight * this.renderer.getPixelRatio(), this.camera.fov * Math.PI / 180);
        this.state = 'flight';
        this.paused = false;
        this.menus.hide();
        this.hud.show(true);
        this.hud.el.keys.style.display = '';
        this.camIdx = 0;
        this.camQuat.copy(this.mission.player.quat);
        this.renderPass.scene = this.scene;
        this.music.start('flight');
        this.music.setIntensity(0.15);
        this.camera.fov = 62; this.camera.updateProjectionMatrix();
        // warm-up compile to avoid hitch on first frame
        this.renderer.compile(this.scene, this.camera);
      } catch (e) {
        console.error(e);
        this.menus.show('main');
        alert('Failed to start mission: ' + e.message);
      }
    }, 60);
  }

  disposeMission() {
    if (!this.mission) return;
    this.radio.clear();
    this.mission.dispose();
    this.mission = null;
  }

  endMission(result) {
    if (this.state !== 'flight') return;
    this.state = 'debrief';
    this.hud.show(false);
    this.audio.silenceFlight();
    this.music.start('menu');
    const cfg = this.mission.cfg;
    let credits = 0, unlocked = [];
    if (result.success) {
      credits = Math.round(result.score * 2);
      if (cfg.stage) {
        const idx = STAGES.indexOf(cfg.stage);
        const first = this.save.stageUnlocked <= idx;
        credits += first ? cfg.stage.reward : Math.round(cfg.stage.reward * 0.3);
        if (first) this.save.stageUnlocked = Math.min(STAGES.length, idx + 1);
        this.save.stars[cfg.stage.id] = Math.max(this.save.stars[cfg.stage.id] || 0, result.stars);
        unlocked = JETS.filter((j) => j.unlockStage === idx + 1 && first).map((j) => j.name);
      }
    } else credits = Math.round(result.score * 0.5);
    this.save.credits += credits;
    this.persist();
    this.menus.showDebrief({ ...result, credits, unlocked, cfg });
  }

  quitToMenu() {
    this.state = 'menu';
    this.paused = false;
    this.hud.show(false);
    this.audio.silenceFlight();
    this.disposeMission();
    this.music.start('menu');
    this.menus.show('main');
  }

  togglePause() {
    if (this.state !== 'flight') return;
    this.paused = !this.paused;
    if (this.paused) { this.menus.show('pause'); this.audio.silenceFlight(); }
    else this.menus.hide();
  }

  // Debug/testing: advance the simulation without rendering (window.__game.simulate(5)).
  simulate(seconds, dt = 1 / 30, perStep) {
    if (!this.mission) return;
    for (let t = 0; t < seconds; t += dt) {
      this.input.update(dt);
      perStep?.(this.mission, t);
      this.mission.update(dt);
      this.updateCamera(dt);
      this.input.endFrame();
    }
  }

  get camMode() { return CAMS[this.camIdx].id; }
  get camName() { return CAMS[this.camIdx].name; }

  // ---------------------------------------------------------------- loop
  frame() {
    const now = performance.now();
    const dt = Math.min((now - this.lastT) / 1000, 1 / 20);
    this.lastT = now;
    this.time += dt;
    this.input.update(dt);
    if (this.input.hit('Escape') || this.input.hit('KeyP')) {
      if (this.state === 'flight') this.togglePause();
    }

    if (this.state === 'flight' && this.mission) {
      if (!this.paused) this.flightFrame(dt);
      this.composer.render();
    } else {
      this.showroomFrame(dt);
    }
    this.input.endFrame();
  }

  showroomFrame(dt) {
    const t = this.time;
    if (this.showJet) {
      this.showJet.rotation.y = t * 0.25;
      animateJet(this.showJet, t, 0.35 + 0.25 * Math.sin(t * 0.7), true, dt);
    }
    const span = this.showSpec?.model.span || 12;
    const r = span * 1.9 + 8;
    this.showroomCam.position.set(Math.sin(0.6) * r, 4 + span * 0.25, Math.cos(0.6) * r);
    this.showroomCam.lookAt(0, 2, 0);
    this.showroomCam.aspect = innerWidth / innerHeight;
    // offset jet to the right side of the screen so menus sit on the left
    this.showroomCam.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.18, 0, innerWidth, innerHeight);
    this.showroomCam.updateProjectionMatrix();
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.render(this.showroom, this.showroomCam);
  }

  flightFrame(dt) {
    const m = this.mission, input = this.input;
    if (input.hit('KeyC')) { this.camIdx = (this.camIdx + 1) % CAMS.length; this.flybyPos = null; }
    if (input.hit('KeyH')) { const k = this.hud.el.keys; k.style.display = k.style.display === 'none' ? '' : 'none'; }
    m.update(dt);
    this.updateCamera(dt);
    const p = m.player;
    this.renderer.toneMappingExposure = m.world.theater.exposure;
    // cloud whiteout (cheap check every few frames)
    this.cloudT = (this.cloudT || 0) - dt;
    if (this.cloudT <= 0) { this.cloudT = 0.1; this.cloudDensity = m.world.clouds.densityAt(this.camera.position); }
    // vapor effects
    if (p.alive && !p.grounded) {
      const right = p.getRight(new THREE.Vector3()), up = p.getUp(new THREE.Vector3()), fwd = p.getForward(new THREE.Vector3());
      const half = p.model.userData.span / 2;
      if (p.gload > 5.5) {
        for (const sx of [-1, 1]) {
          const w = p.pos.clone().addScaledVector(right, sx * half).addScaledVector(fwd, -2);
          m.particles.smoke.spawn({ x: w.x, y: w.y, z: w.z, life: 0.6, size0: 1.2, size1: 3, color0: [1, 1, 1, 0.5], color1: [1, 1, 1, 0], drag: 2 });
        }
        if (p.gload > 7) for (let i = 0; i < 3; i++) {
          const o = p.pos.clone().addScaledVector(right, rand(-half * 0.6, half * 0.6)).addScaledVector(up, 0.8).addScaledVector(fwd, rand(-3, 3));
          m.particles.smoke.spawn({ x: o.x, y: o.y, z: o.z, life: 0.25, size0: 3, size1: 5, color0: [1, 1, 1, 0.25], color1: [1, 1, 1, 0], drag: 3 });
        }
      }
      if (p.speed > 325 && p.speed < 355) {
        for (let i = 0; i < 4; i++) {
          const a = rand(0, Math.PI * 2);
          const o = p.pos.clone().addScaledVector(right, Math.cos(a) * 3).addScaledVector(up, Math.sin(a) * 3).addScaledVector(fwd, -2);
          m.particles.smoke.spawn({ x: o.x, y: o.y, z: o.z, life: 0.15, size0: 3, size1: 6, color0: [1, 1, 1, 0.35], color1: [1, 1, 1, 0], drag: 1 });
        }
      }
      if (p.abOn && Math.random() < 0.6) {
        const o = p.pos.clone().addScaledVector(fwd, -p.model.userData.len * 0.5 - 4);
        m.particles.fire.spawn({ x: o.x, y: o.y, z: o.z, vx: p.vel.x * 0.85, vy: p.vel.y * 0.85, vz: p.vel.z * 0.85, life: 0.2, size0: 3, size1: 0.5, color0: [1, 0.6, 0.3, 0.6], color1: [1, 0.3, 0.1, 0] });
      }
    }
    // HUD + audio
    const hs = m.hudState();
    this.hud.update(dt, hs);
    this.audio.updateFlight(dt, {
      throttle: p.alive ? p.throttle : 0, speed: p.speed, g: Math.abs(p.gload), firing: m.firing && p.alive, alive: p.alive,
      seeker: m.seeker || 0, missileInbound: hs.missileInbound, lockedOn: hs.lockedOn, cockpit: this.camMode === 'cockpit',
    });
  }

  updateCamera(dt) {
    const m = this.mission, p = m.player, cam = this.camera;
    const mode = this.camMode;
    p.model.visible = p.alive && mode !== 'cockpit';
    const L = p.model.userData.len;
    this.camQuat.slerp(p.quat, 1 - Math.exp(-(mode === 'far' ? 3 : 7) * dt));
    const lookBack = this.input.down('KeyV');
    let fov = 62;
    if (mode === 'cockpit') {
      cam.position.copy(p.pos).add(new THREE.Vector3(0, 1.45, -L * 0.27).applyQuaternion(p.quat));
      cam.quaternion.copy(p.quat);
      if (lookBack) cam.rotateY(Math.PI * 0.85);
      fov = 70;
    } else if (mode === 'padlock' && m.target && m.target.alive) {
      const to = m.target.pos.clone().sub(p.pos).normalize();
      const up = p.getUp(new THREE.Vector3());
      const want = p.pos.clone().addScaledVector(to, -L * 2.2 - 14).addScaledVector(up, 6);
      cam.position.lerp(want, 1 - Math.exp(-10 * dt));
      cam.up.copy(up);
      cam.lookAt(m.target.pos);
      cam.up.set(0, 1, 0);
    } else if (mode === 'flyby') {
      const fwd = p.getForward(new THREE.Vector3());
      if (!this.flybyPos || this.flybyPos.distanceTo(p.pos) > 1400 || fwd.dot(this.flybyPos.clone().sub(p.pos)) < -400) {
        const side = new THREE.Vector3(fwd.z, 0, -fwd.x).normalize();
        this.flybyPos = p.pos.clone().addScaledVector(p.vel.clone().normalize(), Math.max(400, p.speed * 3)).addScaledVector(side, rand(-60, 60)).add(new THREE.Vector3(0, rand(-15, 25), 0));
        const gh = m.terrain.surfaceAt(this.flybyPos.x, this.flybyPos.z) + 5;
        if (this.flybyPos.y < gh) this.flybyPos.y = gh;
      }
      cam.position.copy(this.flybyPos);
      cam.up.set(0, 1, 0);
      cam.lookAt(p.pos);
      fov = clamp(30 + p.pos.distanceTo(this.flybyPos) * 0.02, 20, 60);
    } else {
      const far = mode === 'far' || (mode === 'padlock');
      const dist = (far ? L * 3.6 + 30 : L * 1.25 + 12) * (lookBack ? -1 : 1);
      const height = far ? L * 0.6 + 6 : L * 0.26 + 2.6;
      const off = new THREE.Vector3(0, height, dist).applyQuaternion(this.camQuat);
      cam.position.copy(p.pos).add(off);
      const look = p.pos.clone().add(new THREE.Vector3(0, height * 0.55, -30 * (lookBack ? -1 : 1)).applyQuaternion(this.camQuat));
      cam.up.copy(new THREE.Vector3(0, 1, 0).applyQuaternion(this.camQuat));
      cam.lookAt(look);
      // keep the camera above the ground/deck
      const gh = Math.max(m.terrain.surfaceAt(cam.position.x, cam.position.z), m.base.surfaceAt(cam.position.x, cam.position.z) ?? -1e9) + 1.5;
      if (cam.position.y < gh) cam.position.y = gh;
      fov = 62 + clamp((p.speed - 150) / 250, 0, 1) * 8 + (p.abOn ? 4 : 0);
    }
    // shake
    const abShake = p.alive && p.abOn && !p.grounded ? 0.03 : 0;
    const gShake = Math.max(0, Math.abs(p.gload) - 6) * 0.02;
    const sh = this.shakeAmt + abShake + gShake + (p.catapult?.state === 'launch' ? 0.25 : 0);
    if (sh > 0) cam.position.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(sh * 0.5));
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.5);
    cam.fov = damp(cam.fov, fov, 3, dt);
    cam.updateProjectionMatrix();
  }
}

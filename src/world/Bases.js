// Aircraft carrier and land airbase: geometry, takeoff spawn, landing surface + arresting wires.
import * as THREE from 'three';
import { buildJet } from '../aircraft/JetModel.js';
import { JETS, LIVERIES } from '../data/jets.js';

const grey = (c, r = 0.8, m = 0.3) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });

function deckTexture(w, l) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 2048;
  const g = c.getContext('2d');
  const sx = 512 / w, sz = 2048 / l;
  g.fillStyle = '#3d4044'; g.fillRect(0, 0, 512, 2048);
  // grime noise
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '20,20,20' : '90,90,90'},0.08)`; g.fillRect(Math.random() * 512, Math.random() * 2048, 3, 3 + Math.random() * 12); }
  const X = (x) => (x + w / 2) * sx, Z = (z) => (z + l / 2) * sz;
  // landing area (angled-ish, here straight) edges
  g.strokeStyle = '#f4f4f0'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(X(-14), Z(l / 2)); g.lineTo(X(-14), Z(-40)); g.stroke();
  g.beginPath(); g.moveTo(X(14), Z(l / 2)); g.lineTo(X(14), Z(-40)); g.stroke();
  // centerline dashes
  g.strokeStyle = '#f4f4f0'; g.lineWidth = 3; g.setLineDash([30, 24]);
  g.beginPath(); g.moveTo(X(0), Z(l / 2)); g.lineTo(X(0), Z(-l / 2)); g.stroke();
  g.setLineDash([]);
  // catapult tracks
  g.strokeStyle = '#8a8d90'; g.lineWidth = 3;
  for (const cx of [-8, 8]) { g.beginPath(); g.moveTo(X(cx), Z(-60)); g.lineTo(X(cx), Z(-l / 2 + 2)); g.stroke(); }
  // yellow taxi lines
  g.strokeStyle = '#e8c21a'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(X(22), Z(120)); g.quadraticCurveTo(X(10), Z(40), X(8), Z(-60)); g.stroke();
  g.beginPath(); g.moveTo(X(-25), Z(80)); g.quadraticCurveTo(X(-10), Z(0), X(-8), Z(-60)); g.stroke();
  // wires
  g.strokeStyle = '#b0b0b0'; g.lineWidth = 2;
  for (const wz of [95, 107, 119, 131]) { g.beginPath(); g.moveTo(X(-15), Z(wz)); g.lineTo(X(15), Z(wz)); g.stroke(); }
  // hull number
  g.save(); g.fillStyle = '#f4f4f0'; g.font = 'bold 150px sans-serif'; g.textAlign = 'center';
  g.translate(X(0), Z(-110)); g.fillText('77', 0, 0); g.restore();
  // stern safety stripes
  for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#e8c21a' : '#1a1a1a'; g.fillRect(i * 512 / 12, Z(l / 2) - 14, 512 / 12, 14); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function runwayTexture(len, w) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 4096;
  const g = c.getContext('2d');
  g.fillStyle = '#2d2f31'; g.fillRect(0, 0, 256, 4096);
  for (let i = 0; i < 14000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '10,10,10' : '80,80,80'},0.07)`; g.fillRect(Math.random() * 256, Math.random() * 4096, 2, 2 + Math.random() * 6); }
  // tire marks near touchdown zones
  for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(10,10,10,0.25)'; const y = 3400 + Math.random() * 500; g.fillRect(100 + Math.random() * 60, y, 3, 30 + Math.random() * 60); }
  g.fillStyle = '#eeeeea';
  for (let y = 120; y < 4096 - 120; y += 90) g.fillRect(126, y, 4, 50);
  g.fillRect(8, 0, 4, 4096); g.fillRect(244, 0, 4, 4096);
  // piano keys at both ends
  for (let i = 0; i < 12; i++) { g.fillRect(20 + i * 18, 20, 9, 90); g.fillRect(20 + i * 18, 4096 - 110, 9, 90); }
  // touchdown zone markers
  for (const y of [400, 3600]) { g.fillRect(50, y, 30, 100); g.fillRect(176, y, 30, 100); }
  g.font = 'bold 60px sans-serif'; g.textAlign = 'center';
  g.save(); g.translate(128, 4096 - 220); g.fillText('36', 0, 0); g.restore();
  g.save(); g.translate(128, 220); g.rotate(Math.PI); g.fillText('18', 0, 0); g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function parkedJet(id, liveryId) {
  const spec = JETS.find((j) => j.id === id);
  const m = buildJet(spec.model, LIVERIES.find((l) => l.id === liveryId), { ir: 2, radar: 2, agm: 0 });
  m.userData.flames.forEach((f) => { f.mesh.visible = false; });
  return m;
}

export class Carrier {
  constructor() {
    this.type = 'carrier';
    this.group = new THREE.Group();
    this.deckY = 20.5;
    this.length = 330; this.width = 76;
    const L = this.length, W = this.width;
    // hull
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-W * 0.3, 0); hullShape.lineTo(W * 0.3, 0); hullShape.lineTo(W * 0.42, this.deckY + 7.5); hullShape.lineTo(-W * 0.42, this.deckY + 7.5); hullShape.closePath();
    const hullGeo = new THREE.ExtrudeGeometry(hullShape, { depth: L, bevelEnabled: false });
    hullGeo.translate(0, -8, -L / 2);
    const hull = new THREE.Mesh(hullGeo, grey(0x5c6268, 0.75, 0.35));
    hull.castShadow = hull.receiveShadow = true;
    this.group.add(hull);
    // deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(W, 1, L), [grey(0x45484c), grey(0x45484c), new THREE.MeshStandardMaterial({ map: deckTexture(W, L), roughness: 0.85, metalness: 0.1 }), grey(0x45484c), grey(0x45484c), grey(0x45484c)]);
    deck.position.y = this.deckY - 0.5;
    deck.receiveShadow = true; deck.castShadow = true;
    this.group.add(deck);
    // island superstructure
    const island = new THREE.Group();
    const isl = new THREE.Mesh(new THREE.BoxGeometry(10, 22, 34), grey(0x6a7076, 0.7, 0.3));
    isl.position.y = 11; island.add(isl);
    const isl2 = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 20), grey(0x6a7076, 0.7, 0.3));
    isl2.position.set(0, 26, 2); island.add(isl2);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(10.4, 2.2, 24), new THREE.MeshStandardMaterial({ color: 0x0b1620, metalness: 0.9, roughness: 0.1 }));
    bridge.position.set(0, 19, 0); island.add(bridge);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 18, 6), grey(0x55595e));
    mast.position.set(0, 39, 2); island.add(mast);
    this.radarDish = new THREE.Mesh(new THREE.BoxGeometry(9, 2.5, 0.4), grey(0x8b9196));
    this.radarDish.position.set(0, 44, 2); island.add(this.radarDish);
    const num = new THREE.Mesh(new THREE.PlaneGeometry(6, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    num.position.set(-5.05, 12, -8); num.rotation.y = -Math.PI / 2; island.add(num);
    island.position.set(W * 0.38, this.deckY, 40);
    island.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.group.add(island);
    // deck edge lights + landing lights
    const lightGeo = new THREE.SphereGeometry(0.35, 6, 4);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0x40ff80 });
    const lights = new THREE.InstancedMesh(lightGeo, lightMat, 60);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 30; i++) {
      m.setPosition(-14.5, this.deckY + 0.3, L / 2 - i * 9); lights.setMatrixAt(i * 2, m);
      m.setPosition(14.5, this.deckY + 0.3, L / 2 - i * 9); lights.setMatrixAt(i * 2 + 1, m);
    }
    this.group.add(lights);
    // optical landing system (meatball)
    this.meatball = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffaa22 }));
    this.meatball.position.set(-W * 0.45, this.deckY + 3, 70);
    this.group.add(this.meatball);
    // arresting wires
    this.wires = [95, 107, 119, 131];
    const wireMat = grey(0x9a9a9a, 0.4, 0.8);
    for (const wz of this.wires) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 30, 4), wireMat);
      w.rotation.z = Math.PI / 2; w.position.set(0, this.deckY + 0.15, wz);
      this.group.add(w);
    }
    // jet blast deflector
    this.jbd = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 0.4), grey(0x55595e));
    this.jbd.position.set(-8, this.deckY + 1.6, -20);
    this.jbd.rotation.x = 1.0;
    this.group.add(this.jbd);
    // parked aircraft
    const parked = [['fa18', 'navy', 28, 120, -0.6], ['fa18', 'navy', 28, 100, -0.6], ['f35', 'grey', 28, 80, -0.6], ['fa18', 'navy', 26, -20, -0.9], ['f35', 'grey', 26, -40, -0.9], ['fa18', 'navy', -28, 150, 0.4]];
    for (const [id, lv, x, z, ry] of parked) {
      const j = parkedJet(id, lv);
      j.position.set(x, this.deckY + j.userData.gearHeight, z); j.rotation.y = ry;
      this.group.add(j);
    }
    // escort destroyers
    this.escorts = [];
    for (const [ex, ez] of [[-900, 500], [700, -1200]]) {
      const d = makeWarship(0x5c6268, true);
      d.position.set(ex, 0, ez);
      this.group.add(d);
      this.escorts.push(d);
    }
    // wake
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(60, 700), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }));
    wake.rotation.x = -Math.PI / 2; wake.position.set(0, 0.4, L / 2 + 340);
    this.group.add(wake);

    this.spawn = { pos: new THREE.Vector3(-8, this.deckY, -40), heading: 0, catapult: true, launchEndZ: -L / 2 };
    this.tower = 'Resolute Tower';
    this.callsign = 'Mother';
  }

  // returns deck height if (x,z) is over the deck, else null
  surfaceAt(x, z) {
    if (Math.abs(x) <= this.width / 2 && z >= -this.length / 2 && z <= this.length / 2) return this.deckY;
    return null;
  }
  // landing runway corridor (for ILS/auto-land): runway threshold and heading (landing toward -Z)
  get approach() { return { threshold: new THREE.Vector3(0, this.deckY, 150), dir: new THREE.Vector3(0, 0, -1), glide: 3.5 * Math.PI / 180, wires: true, stopZ: -100 }; }
  update(dt, t) { this.radarDish.rotation.y = t * 1.5; this.meatball.material.color.setHSL(0.09, 1, 0.5 + 0.1 * Math.sin(t * 6)); }
}

export class Airbase {
  constructor(height) {
    this.type = 'airbase';
    this.group = new THREE.Group();
    this.deckY = height + 0.25;
    this.length = 3200; this.width = 60;
    const L = this.length, W = this.width;
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({ map: runwayTexture(L, W), roughness: 0.9 }));
    rw.rotation.x = -Math.PI / 2; rw.position.y = this.deckY;
    rw.receiveShadow = true;
    this.group.add(rw);
    // shoulders / taxiway / apron
    const asphalt = grey(0x3c3f42, 0.95, 0);
    const taxi = new THREE.Mesh(new THREE.PlaneGeometry(25, L * 0.9), asphalt);
    taxi.rotation.x = -Math.PI / 2; taxi.position.set(130, this.deckY - 0.05, 0); taxi.receiveShadow = true;
    this.group.add(taxi);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(220, 500), grey(0x6a6c6e, 0.95, 0));
    apron.rotation.x = -Math.PI / 2; apron.position.set(250, this.deckY - 0.08, 200); apron.receiveShadow = true;
    this.group.add(apron);
    for (const z of [-1300, 0, 1300]) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(100, 22), asphalt);
      c.rotation.x = -Math.PI / 2; c.position.set(80, this.deckY - 0.06, z); this.group.add(c);
    }
    // hangars
    const hangarMat = grey(0x7b8188, 0.7, 0.4);
    for (let i = 0; i < 4; i++) {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 50, 16, 1, false, 0, Math.PI), hangarMat);
      h.rotation.z = Math.PI / 2; h.rotation.y = Math.PI / 2;
      h.position.set(330, this.deckY, -10 + i * 70);
      h.castShadow = h.receiveShadow = true;
      this.group.add(h);
    }
    // control tower
    const tower = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(8, 30, 8), grey(0xb8b2a6, 0.8, 0.1));
    shaft.position.y = 15; tower.add(shaft);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(9, 7, 6, 8), new THREE.MeshStandardMaterial({ color: 0x0e1a24, metalness: 0.9, roughness: 0.1 }));
    cab.position.y = 33; tower.add(cab);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 1, 8), grey(0x444444));
    roof.position.y = 36.5; tower.add(roof);
    this.radarDish = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 0.4), grey(0xdddddd));
    this.radarDish.position.y = 39; tower.add(this.radarDish);
    tower.position.set(200, this.deckY, -300);
    tower.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    this.group.add(tower);
    // runway edge lights
    const lightGeo = new THREE.SphereGeometry(0.5, 6, 4);
    const n = 64;
    const lights = new THREE.InstancedMesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xfff2c0 }), n * 2 + 20);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const z = -L / 2 + (i / (n - 1)) * L;
      m.setPosition(-W / 2 - 2, this.deckY + 0.4, z); lights.setMatrixAt(i * 2, m);
      m.setPosition(W / 2 + 2, this.deckY + 0.4, z); lights.setMatrixAt(i * 2 + 1, m);
    }
    // approach lights
    for (let i = 0; i < 20; i++) { m.setPosition(0, this.deckY + 0.6, L / 2 + 30 + i * 30); lights.setMatrixAt(n * 2 + i, m); }
    this.group.add(lights);
    // PAPI
    this.papi = [];
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      p.position.set(-W / 2 - 15 - i * 4, this.deckY + 0.6, L / 2 - 350);
      this.group.add(p); this.papi.push(p);
    }
    // parked jets on apron
    const parked = [['f16', 'grey'], ['f16', 'grey'], ['f15', 'grey'], ['f15', 'desert'], ['f35', 'grey'], ['fa18', 'navy']];
    parked.forEach(([id, lv], i) => {
      const j = parkedJet(id, lv);
      j.position.set(220 + (i % 2) * 60, this.deckY + j.userData.gearHeight, 40 + Math.floor(i / 2) * 50);
      j.rotation.y = Math.PI / 2;
      this.group.add(j);
    });
    // fuel tanks
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 10, 18), grey(0xd6d3cc, 0.6, 0.2));
      t.position.set(420, this.deckY + 5, 300 + i * 24); t.castShadow = true;
      this.group.add(t);
    }
    this.spawn = { pos: new THREE.Vector3(0, this.deckY, L / 2 - 120), heading: 0, catapult: false };
    this.tower = 'Kestrel Tower';
    this.callsign = 'Kestrel';
  }

  surfaceAt(x, z) {
    if (Math.abs(x) <= this.width / 2 + 4 && Math.abs(z) <= this.length / 2) return this.deckY;
    if (x > 60 && x < 360 && z > -1500 && z < 1500) return this.deckY; // taxi/apron area
    return null;
  }
  get approach() { return { threshold: new THREE.Vector3(0, this.deckY, this.length / 2 - 350), dir: new THREE.Vector3(0, 0, -1), glide: 3 * Math.PI / 180, wires: false, stopZ: -this.length / 2 + 100 }; }
  update(dt, t, playerPos) {
    this.radarDish.rotation.y = t * 1.2;
    if (playerPos) {
      // PAPI: compare glide angle
      const a = this.approach;
      const dz = playerPos.z - a.threshold.z;
      const ang = Math.atan2(playerPos.y - this.deckY, Math.max(1, dz));
      const err = ang - a.glide;
      this.papi.forEach((p, i) => {
        const th = (i - 1.5) * 0.25 * Math.PI / 180;
        p.material.color.set(err > th ? 0xffffff : 0xff2020);
      });
    }
  }
}

export function makeWarship(color = 0x5a5f63, friendly = false) {
  const g = new THREE.Group();
  const mat = grey(color, 0.7, 0.35);
  const shape = new THREE.Shape();
  shape.moveTo(0, -70); shape.quadraticCurveTo(9, -40, 8, 0); shape.lineTo(7, 60); shape.lineTo(-7, 60); shape.lineTo(-8, 0); shape.quadraticCurveTo(-9, -40, 0, -70);
  const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 10, bevelEnabled: false });
  hullGeo.rotateX(-Math.PI / 2); hullGeo.translate(0, -3, 0);
  const hull = new THREE.Mesh(hullGeo, mat); hull.castShadow = hull.receiveShadow = true;
  g.add(hull);
  const sup = new THREE.Mesh(new THREE.BoxGeometry(11, 8, 34), mat); sup.position.set(0, 11, 5); g.add(sup);
  const sup2 = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 14), mat); sup2.position.set(0, 18, 0); g.add(sup2);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 14, 6), mat); mast.position.set(0, 27, 0); g.add(mast);
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 2, 10), mat); gun.position.set(0, 8, -42); g.add(gun);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 7, 6), mat); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 8.5, -46); g.add(barrel);
  const vls = new THREE.Mesh(new THREE.BoxGeometry(7, 1, 10), grey(0x2a2d30)); vls.position.set(0, 7.5, -28); g.add(vls);
  const dish = new THREE.Mesh(new THREE.BoxGeometry(5, 1.4, 0.3), grey(0xbbbbbb)); dish.position.set(0, 33, 0); g.add(dish);
  g.userData.dish = dish;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  if (!friendly) g.userData.hostile = true;
  return g;
}

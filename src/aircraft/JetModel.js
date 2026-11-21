// Procedural fighter-jet mesh builder. Builds a recognisable airframe from a compact spec
// (planform, tails, engines, canards, intakes) at real-world scale (meters), nose toward -Z.
import * as THREE from 'three';

const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x1a2430, metalness: 0.9, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.88 });
const goldGlassMat = new THREE.MeshPhysicalMaterial({ color: 0x8a6a20, metalness: 1, roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.9 });
const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3c, metalness: 0.9, roughness: 0.35 });
const missileMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.2, roughness: 0.5 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1e21, metalness: 0.4, roughness: 0.7 });

function flameMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, power: { value: 0.5 }, ab: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform float time; uniform float power; uniform float ab;
      varying vec2 vUv;
      void main(){
        float t = vUv.y; // 0 at nozzle, 1 at tip
        float flick = 0.85 + 0.15 * sin(time * 60.0 + t * 30.0);
        float diamonds = 0.6 + 0.4 * pow(abs(sin(t * 18.0 - time * 4.0)), 4.0) * ab;
        vec3 core = mix(vec3(1.0, 0.95, 0.85), vec3(1.0, 0.55, 0.2), t);
        vec3 blue = vec3(0.45, 0.6, 1.0);
        vec3 col = mix(blue * 1.4, core * 2.2, ab);
        float a = (1.0 - t) * (1.0 - t) * flick * diamonds * (0.25 + 0.75 * power);
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

function planform(points, thickness, mat, bevel = 0.06) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1 });
  geo.translate(0, 0, -thickness / 2);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Horizontal surface: shape in (x = span, y = chord forward) -> mesh lying in XZ plane
function horizontalSurface(points, thickness, mat) {
  const m = planform(points, thickness, mat);
  m.rotation.x = -Math.PI / 2; // shape +y -> -z (forward), extrude -> +y
  return m;
}

function makeMissile(len, radius, finScale = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 10), missileMat);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(radius, radius * 4, 10), missileMat);
  nose.rotation.x = -Math.PI / 2; nose.position.z = -len / 2 - radius * 2;
  g.add(nose);
  const finGeo = new THREE.BoxGeometry(radius * 5 * finScale, 0.02, radius * 4);
  for (let i = 0; i < 2; i++) {
    const f = new THREE.Mesh(finGeo, darkMat); f.position.z = len / 2 - radius * 2; f.rotation.z = i * Math.PI / 2; g.add(f);
    const f2 = new THREE.Mesh(finGeo, darkMat); f2.scale.set(0.7, 1, 0.7); f2.position.z = -len / 2 + radius * 3; f2.rotation.z = i * Math.PI / 2; g.add(f2);
  }
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

/**
 * @param {object} spec  model spec from jets.js
 * @param {object} livery {base, alt, accent}
 * @param {object} loadout {ir, radar, agm}
 */
export function buildJet(spec, livery, loadout = { ir: 2, radar: 2, agm: 0 }, opts = {}) {
  const root = new THREE.Group();
  const L = spec.len, S = spec.span;
  const twin = spec.engines === 2;
  const baseMat = new THREE.MeshStandardMaterial({ color: livery.base, metalness: 0.45, roughness: 0.42, envMapIntensity: 1.1 });
  const altMat = new THREE.MeshStandardMaterial({ color: livery.alt, metalness: 0.45, roughness: 0.5 });
  const accentMat = new THREE.MeshStandardMaterial({ color: livery.accent, metalness: 0.3, roughness: 0.4, emissive: livery.accent, emissiveIntensity: 0.15 });

  // ---------- Fuselage (lathe) ----------
  const R = twin ? 1.05 : 0.95;
  const prof = [
    [0.0, 0], [0.18, 0.04], [0.38, 0.1], [0.6, 0.18], [0.78, 0.27], [0.92, 0.36],
    [1.0, 0.5], [1.0, 0.72], [0.95, 0.86], [0.85, 0.97], [0.8, 1.0],
  ];
  const pts = prof.map(([r, t]) => new THREE.Vector2(Math.max(0.001, r * R), -t * L));
  const fusGeo = new THREE.LatheGeometry(pts, 20);
  fusGeo.rotateX(-Math.PI / 2); // lathe axis Y -> Z: nose (t=0) at z=0, tail at z=L
  fusGeo.translate(0, 0, -L * 0.5);
  const fus = new THREE.Mesh(fusGeo, baseMat);
  // after rotation, point (r, -t*L) maps to z = +t*L*? -> ensure nose is -Z
  fus.scale.set(twin ? (spec.wing === 'flying' ? 1.9 : 1.55) : 1.0, twin ? 0.72 : 0.95, 1);
  fus.castShadow = true; fus.receiveShadow = true;
  root.add(fus);

  // Radome (darker nose cone)
  const radome = new THREE.Mesh(new THREE.ConeGeometry(R * 0.36, L * 0.1, 18), altMat);
  radome.rotation.x = -Math.PI / 2; radome.position.z = -L * 0.5 + L * 0.035;
  root.add(radome);

  // Spine / body blend for twin-engine jets
  if (twin) {
    const spine = new THREE.Mesh(new THREE.BoxGeometry(R * 2.6, R * 0.55, L * 0.55), baseMat);
    spine.position.set(0, -0.05, L * 0.1);
    spine.castShadow = true;
    root.add(spine);
  }

  // ---------- Canopy ----------
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), opts.stealthGlass ? goldGlassMat : glassMat);
  canopy.scale.set(0.58, 0.62, L * 0.13);
  canopy.position.set(0, R * 0.62, -L * 0.27);
  root.add(canopy);
  const canopyFrame = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.04, 6, 16, Math.PI), darkMat);
  canopyFrame.position.set(0, R * 0.62, -L * 0.22);
  root.add(canopyFrame);

  // ---------- Intakes ----------
  if (spec.intake === 'chin') {
    const it = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, L * 0.32), altMat);
    it.position.set(0, -R * 0.85, -L * 0.02); root.add(it);
  } else {
    const w = spec.intake === 'chin2' ? R * 0.95 : R * 1.35;
    const yy = spec.intake === 'chin2' ? -R * 0.65 : -R * 0.05;
    for (const sx of [-1, 1]) {
      const it = new THREE.Mesh(new THREE.BoxGeometry(0.95, spec.intake === 'chin2' ? 0.9 : 1.1, L * 0.36), altMat);
      it.position.set(sx * w, yy, -L * 0.02);
      if (spec.intake === 'caret') it.rotation.z = sx * 0.25;
      it.castShadow = true;
      root.add(it);
    }
  }

  // ---------- Wings ----------
  const half = S / 2;
  const sw = Math.tan(spec.sweep * 0.9);
  const rootC = spec.wing === 'flying' ? L * 0.62 : spec.wing === 'delta' ? L * 0.5 : L * 0.36;
  const tipC = spec.wing === 'delta' ? 0.6 : spec.wing === 'cropped' ? L * 0.13 : spec.wing === 'flying' ? 1.2 : L * 0.085;
  const rootLE = rootC * 0.55;
  const tipLE = rootLE - half * sw;
  const tipTE = tipLE - tipC;
  const teFwd = spec.wing === 'diamond' || spec.wing === 'flying' ? half * 0.28 : 0;
  const lerx = spec.wing !== 'delta' && spec.wing !== 'flying';
  const wPts = [
    [-0.01, rootLE + (lerx ? L * 0.2 : 0)],
    [half * 0.12, rootLE],
    [half, tipLE], [half, tipTE],
    [half * 0.12, -rootC * 0.45 + teFwd * 0.4],
    [0, -rootC * 0.45 + (spec.wing === 'flying' ? -1.5 : 0)],
  ];
  const full = [...wPts, ...wPts.slice(0).reverse().map(([x, y]) => [-x, y])];
  const wing = horizontalSurface(full, 0.14, baseMat);
  wing.position.set(0, -0.15, L * 0.08);
  root.add(wing);
  // wingtip accent
  const tipGeo = new THREE.BoxGeometry(0.12, 0.2, tipC * 0.9);
  for (const sx of [-1, 1]) {
    const tp = new THREE.Mesh(tipGeo, altMat);
    tp.position.set(sx * half, -0.15, L * 0.08 - (tipLE + tipTE) / 2);
    root.add(tp);
  }
  // nav lights
  const navG = new THREE.SphereGeometry(0.12, 8, 6);
  const navL = new THREE.Mesh(navG, new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  const navR = new THREE.Mesh(navG, new THREE.MeshBasicMaterial({ color: 0x20ff40 }));
  navL.position.set(-half - 0.1, -0.1, L * 0.08 - tipLE + 0.3);
  navR.position.set(half + 0.1, -0.1, L * 0.08 - tipLE + 0.3);
  root.add(navL, navR);
  const strobe = new THREE.Mesh(navG, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  root.add(strobe);

  // ---------- Canards ----------
  if (spec.canards) {
    const cs = S * 0.2, cc = L * 0.09;
    const cp = [[0, cc * 0.5], [cs, cc * 0.5 - cs * 0.6], [cs, -cc * 0.4 - cs * 0.6 + cc * 0.3], [0, -cc * 0.5]];
    for (const sx of [-1, 1]) {
      const pts2 = cp.map(([x, y]) => [x * sx, y]);
      const c = horizontalSurface(sx > 0 ? pts2 : pts2.reverse(), 0.08, baseMat);
      c.position.set(sx * R * 0.9, 0.25, -L * 0.22);
      root.add(c);
    }
  }

  // ---------- Horizontal stabilizers ----------
  if (spec.wing !== 'delta' && spec.wing !== 'flying') {
    const hs = S * 0.24, hc = L * 0.15;
    const hp = [[0, hc * 0.5], [hs, hc * 0.5 - hs * sw * 0.9], [hs, hc * 0.5 - hs * sw * 0.9 - hc * 0.35], [0, -hc * 0.5]];
    for (const sx of [-1, 1]) {
      const pts2 = hp.map(([x, y]) => [x * sx, y]);
      const h = horizontalSurface(sx > 0 ? pts2 : pts2.reverse(), 0.1, baseMat);
      h.position.set(sx * R * (twin ? 1.4 : 0.8), -0.1, L * 0.43);
      root.add(h);
    }
  }

  // ---------- Vertical tails ----------
  if (spec.tails > 0) {
    const th = spec.tails === 1 ? L * 0.24 : L * 0.19, tc = L * 0.2;
    const tsw = Math.tan(spec.sweep * 0.85);
    // build in (z, y) plane: x(shape) -> along body (+ = aft), y(shape) -> height
    const vtPts = [[-tc * 0.5, 0], [tc * 0.5, 0], [tc * 0.5 + th * tsw * 0.6, th], [tc * 0.5 + th * tsw * 0.6 - tc * 0.45, th]];
    const positions = spec.tails === 1 ? [0] : [-1, 1];
    for (const sx of positions) {
      const t = planform(vtPts, 0.12, baseMat);
      t.rotation.y = -Math.PI / 2; // shape x -> +z (aft)
      const holder = new THREE.Group();
      holder.add(t);
      holder.position.set(sx * R * (twin ? 1.15 : 0), R * 0.45, L * 0.3);
      holder.rotation.z = -sx * (spec.tailCant || 0);
      root.add(holder);
      // accent band on fin
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.16, th * 0.12, tc * 0.6), accentMat);
      band.position.set(0, th * 0.75, tc * 0.05 + th * tsw * 0.45);
      holder.add(band);
    }
  }

  // ---------- Engines / nozzles / afterburner ----------
  const flames = [];
  const nozzles = twin ? [-R * 0.75, R * 0.75] : [0];
  const flameMatInst = flameMaterial();
  for (const nx of nozzles) {
    const nz = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.48, 1.6, 16, 1, true), nozzleMat);
    nz.rotation.x = Math.PI / 2;
    nz.position.set(nx, 0, L * 0.5 + 0.4);
    root.add(nz);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.46, 16), new THREE.MeshBasicMaterial({ color: 0xff8030 }));
    inner.position.set(nx, 0, L * 0.5 + 0.2);
    inner.rotation.y = 0;
    root.add(inner);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.48, 6, 16, 1, true), flameMatInst);
    flame.rotation.x = Math.PI / 2;
    flame.position.set(nx, 0, L * 0.5 + 1.2 + 3);
    root.add(flame);
    flames.push({ mesh: flame, inner, baseZ: L * 0.5 + 1.2 });
  }

  // ---------- Stores (visible missiles) ----------
  const stores = { ir: [], radar: [], agm: [] };
  const wingY = -0.15 - 0.45;
  const zAt = (x) => L * 0.08 - (rootLE - (Math.abs(x) / half) * (rootLE - tipLE)) + rootC * 0.25;
  const slots = [];
  const nIr = Math.min(loadout.ir, 2), nRad = Math.min(loadout.radar, 4), nAgm = Math.min(loadout.agm, 2);
  // wingtip IR missiles
  for (let i = 0; i < nIr; i++) slots.push({ kind: 'ir', x: (i % 2 ? 1 : -1) * (half - 0.1), y: -0.05 });
  for (let i = 0; i < nRad; i++) { const sx = i % 2 ? 1 : -1; const r = Math.floor(i / 2); slots.push({ kind: 'radar', x: sx * half * (0.45 + 0.2 * r), y: wingY }); }
  for (let i = 0; i < nAgm; i++) slots.push({ kind: 'agm', x: (i % 2 ? 1 : -1) * R * 0.6, y: -R * 1.05 });
  for (const s of slots) {
    const len = s.kind === 'ir' ? 2.9 : s.kind === 'radar' ? 3.7 : 2.5;
    const rad = s.kind === 'agm' ? 0.19 : s.kind === 'ir' ? 0.07 : 0.09;
    const m = makeMissile(len, rad, s.kind === 'agm' ? 1.3 : 1);
    m.position.set(s.x, s.y, s.kind === 'agm' ? L * 0.05 : zAt(s.x));
    if (s.kind !== 'ir') {
      const py = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 1.8), altMat);
      py.position.set(s.x, s.y + 0.3, m.position.z);
      root.add(py);
    }
    root.add(m);
    stores[s.kind].push(m);
  }

  // ---------- Landing gear ----------
  const gear = new THREE.Group();
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 14);
  const strutGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6);
  const gearPos = [[0, -L * 0.3, 1], [-R * 1.3, L * 0.08, 1.2], [R * 1.3, L * 0.08, 1.2]];
  for (const [gx, gz, s] of gearPos) {
    const strut = new THREE.Mesh(strutGeo, nozzleMat); strut.position.set(gx, -R - 0.6, gz); gear.add(strut);
    const w = new THREE.Mesh(wheelGeo, darkMat); w.rotation.z = Math.PI / 2; w.scale.setScalar(s);
    w.position.set(gx, -R - 1.4, gz); gear.add(w);
  }
  gear.traverse((o) => { o.castShadow = true; });
  root.add(gear);

  // Afterburner glow light (only used for player)
  root.userData = { flames, flameMat: flameMatInst, stores, gear, strobe, navL, navR, len: L, span: S, gearHeight: R + 1.75 };
  return root;
}

// Animate flames / gear / strobe each frame.
export function animateJet(model, t, throttle, gearDown, dt) {
  const u = model.userData;
  const ab = throttle > 1.0 ? Math.min(1, (throttle - 1) / 0.2) : 0;
  const power = Math.min(1, throttle);
  u.flameMat.uniforms.time.value = t;
  u.flameMat.uniforms.power.value = power;
  u.flameMat.uniforms.ab.value = ab;
  const len = 0.5 + power * 0.8 + ab * 2.4;
  for (const f of u.flames) {
    f.mesh.scale.set(0.8 + ab * 0.35, len * (0.92 + Math.random() * 0.16), 0.8 + ab * 0.35);
    f.mesh.position.z = f.baseZ + 3 * len;
    f.inner.material.color.setRGB(0.25 + power * 0.75, 0.1 + power * 0.25 + ab * 0.5, 0.05 + ab * 0.4);
  }
  // gear retract animation
  const target = gearDown ? 1 : 0;
  u.gearT = u.gearT ?? target;
  u.gearT += Math.sign(target - u.gearT) * Math.min(Math.abs(target - u.gearT), dt * 0.6);
  u.gear.visible = u.gearT > 0.02;
  u.gear.scale.y = Math.max(0.02, u.gearT);
  u.gear.position.y = (1 - u.gearT) * 1.2;
  u.strobe.visible = (t % 1.2) < 0.06;
  u.strobe.position.set(0, 0.9, u.len * 0.42);
}

export function hideStore(model, kind) {
  const list = model.userData.stores[kind];
  const s = list && list.find((m) => m.visible);
  if (s) { s.visible = false; return s; }
  return null;
}

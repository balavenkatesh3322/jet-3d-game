// Builds a theater: atmospheric sky, sun + shadows, reflective ocean, terrain, vegetation,
// volumetric-looking clouds and the home base (carrier or airbase).
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Terrain } from './Terrain.js';
import { Clouds } from './Clouds.js';
import { Carrier, Airbase } from './Bases.js';
import { THEATERS } from '../data/theaters.js';
import { mulberry32 } from '../util/noise.js';

function waterNormals() {
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const h = new Float32Array(S * S);
  const waves = [];
  const r = mulberry32(42);
  for (let i = 0; i < 24; i++) waves.push({ kx: Math.round((r() - 0.5) * 16), ky: Math.round((r() - 0.5) * 16), a: 1 / (1 + i * 0.3), p: r() * 6.28 });
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0;
    for (const w of waves) v += w.a * Math.sin(((w.kx * x + w.ky * y) / S) * Math.PI * 2 + w.p);
    h[y * S + x] = v;
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const hx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)];
    const hy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
    const n = new THREE.Vector3(-hx * 0.6, -hy * 0.6, 1).normalize();
    const i = (y * S + x) * 4;
    img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function flareTexture(size, inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner); grd.addColorStop(0.3, outer); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function treeGeometry(type) {
  const parts = [];
  const color = (geo, c) => {
    const col = new THREE.Color(c); const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return geo;
  };
  const trunk = (h, r) => color(new THREE.CylinderGeometry(r * 0.6, r, h, 5).translate(0, h / 2, 0), 0x4a3520);
  switch (type) {
    case 'palm':
      parts.push(trunk(14, 0.5));
      for (let i = 0; i < 6; i++) { const l = color(new THREE.ConeGeometry(1.2, 9, 3).rotateZ(Math.PI / 2.3).translate(4, 13, 0).rotateY((i / 6) * Math.PI * 2), 0x3f7a2a); parts.push(l); }
      break;
    case 'jungle':
      parts.push(trunk(16, 0.8));
      parts.push(color(new THREE.IcosahedronGeometry(9, 0).scale(1, 0.6, 1).translate(0, 19, 0), 0x2d5a1e));
      parts.push(color(new THREE.IcosahedronGeometry(6, 0).scale(1, 0.7, 1).translate(4, 16, 3), 0x376b25));
      break;
    case 'snowpine':
      parts.push(trunk(4, 0.5));
      parts.push(color(new THREE.ConeGeometry(4.5, 12, 6).translate(0, 10, 0), 0x2f4a3a));
      parts.push(color(new THREE.ConeGeometry(3.2, 6, 6).translate(0, 15.5, 0), 0xe8eef2));
      break;
    case 'rock':
      parts.push(color(new THREE.DodecahedronGeometry(6, 0).scale(1.4, 0.7, 1).translate(0, 2, 0), 0x8e6a4a));
      break;
    default: // pine
      parts.push(trunk(4, 0.5));
      parts.push(color(new THREE.ConeGeometry(4.5, 11, 6).translate(0, 9, 0), 0x2b4d2a));
      parts.push(color(new THREE.ConeGeometry(3.3, 8, 6).translate(0, 14, 0), 0x325a30));
  }
  return mergeGeometries(parts.map((p) => p.toNonIndexed()));
}

export class World {
  constructor(renderer, scene, theaterId, quality = 'high') {
    this.renderer = renderer;
    this.scene = scene;
    this.theaterId = theaterId;
    this.theater = THEATERS[theaterId];
    this.quality = quality;
    this.objects = [];
    this.build();
  }

  add(o) { this.scene.add(o); this.objects.push(o); return o; }

  build() {
    const th = this.theater, scene = this.scene;
    scene.fog = new THREE.FogExp2(th.fog, th.fogDensity);
    this.renderer.toneMappingExposure = th.exposure;

    // ---- Sky
    const sky = new Sky();
    sky.scale.setScalar(100000);
    const u = sky.material.uniforms;
    u.turbidity.value = th.turbidity; u.rayleigh.value = th.rayleigh;
    u.mieCoefficient.value = 0.005; u.mieDirectionalG.value = 0.85;
    if (u.cloudCoverage) { u.cloudCoverage.value = th.cloudCoverage; u.cloudDensity.value = 0.5; u.cloudScale.value = 0.00025; }
    const phi = THREE.MathUtils.degToRad(90 - th.sun.elevation);
    const theta = THREE.MathUtils.degToRad(th.sun.azimuth);
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(this.sunDir);
    this.sky = this.add(sky);

    // environment map from the sky for realistic reflections on aircraft
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const sky2 = new Sky(); sky2.scale.setScalar(1000);
    Object.assign(sky2.material.uniforms.turbidity, { value: th.turbidity });
    sky2.material.uniforms.rayleigh.value = th.rayleigh;
    sky2.material.uniforms.sunPosition.value.copy(this.sunDir);
    if (sky2.material.uniforms.cloudCoverage) sky2.material.uniforms.cloudCoverage.value = 0;
    envScene.add(sky2);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: th.water }));
    ground.position.y = -5; envScene.add(ground);
    this.envRT = pmrem.fromScene(envScene, 0.02);
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = 0.38;
    pmrem.dispose();

    // ---- Lights
    const sunColor = new THREE.Color().setHSL(0.1, 0.6, th.sun.elevation < 10 ? 0.62 : 0.92);
    this.sun = new THREE.DirectionalLight(sunColor, th.sun.elevation < 10 ? 2.4 : 3.2);
    this.sun.position.copy(this.sunDir).multiplyScalar(3000);
    this.sun.castShadow = this.quality !== 'low';
    const sm = this.quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -160; sc.right = 160; sc.top = 160; sc.bottom = -160; sc.near = 10; sc.far = 6000;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6;
    this.add(this.sun); this.add(this.sun.target);
    this.hemi = this.add(new THREE.HemisphereLight(0xbfd8ff, th.palette.low, 0.45));

    // lens flare on the sun
    const lf = new Lensflare();
    lf.addElement(new LensflareElement(flareTexture(256, 'rgba(255,250,230,1)', 'rgba(255,200,120,0.18)'), 320, 0, sunColor));
    lf.addElement(new LensflareElement(flareTexture(64, 'rgba(160,200,255,0.5)', 'rgba(80,120,255,0.1)'), 60, 0.6));
    lf.addElement(new LensflareElement(flareTexture(64, 'rgba(255,220,160,0.4)', 'rgba(255,160,80,0.1)'), 90, 0.75));
    lf.addElement(new LensflareElement(flareTexture(64, 'rgba(160,255,200,0.35)', 'rgba(80,255,160,0.05)'), 130, 0.95));
    this.flareLight = new THREE.PointLight(0xffffff, 0, 1);
    this.flareLight.add(lf);
    this.add(this.flareLight);

    // ---- Ocean
    const waterGeo = new THREE.PlaneGeometry(400000, 400000);
    if (this.quality === 'low') {
      this.water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({ color: th.water, roughness: 0.15, metalness: 0.6 }));
    } else {
      this.water = new Water(waterGeo, {
        textureWidth: this.quality === 'high' ? 1024 : 512, textureHeight: this.quality === 'high' ? 1024 : 512,
        waterNormals: waterNormals(), sunDirection: this.sunDir.clone(), sunColor: 0xffffff, waterColor: th.water,
        distortionScale: 3.2, fog: true,
      });
      this.water.material.uniforms.size.value = 6;
    }
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 0;
    this.water.receiveShadow = true;
    this.add(this.water);

    // ---- Terrain
    this.terrain = new Terrain(th, 7 + Object.keys(THEATERS).indexOf(this.theaterId) * 13, this.quality);
    this.add(this.terrain.mesh);

    // ---- Base
    this.base = th.base === 'carrier' ? new Carrier() : new Airbase(this.terrain.baseHeight);
    this.add(this.base.group);

    // ---- Vegetation
    this.buildTrees();

    // ---- Clouds
    this.clouds = new Clouds(scene, th, this.sunDir);
    this.objects.push(this.clouds.mesh);
  }

  buildTrees() {
    const th = this.theater;
    const density = th.trees.density * (this.quality === 'low' ? 0.4 : this.quality === 'medium' ? 0.7 : 1);
    const max = Math.floor(9000 * density);
    if (!max) return;
    const geo = treeGeometry(th.trees.type);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    const rnd = mulberry32(1234);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const t = this.terrain;
    const peak = (th.terrain.height + t.baseHeight);
    let n = 0, tries = 0;
    while (n < max && tries < max * 12) {
      tries++;
      // cluster near the base and the operational area (north)
      const r = Math.sqrt(rnd()) * 20000, a = rnd() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 3000 * rnd();
      const h = t.heightAt(x, z);
      if (h < 6 || h > peak * 0.62) continue;
      if (t.slopeAt(x, z) > 0.55) continue;
      if (this.base.surfaceAt(x, z) !== null || (Math.abs(x) < 600 && Math.abs(z) < 2200 && this.base.type === 'airbase')) continue;
      // forests are patchy
      if (t.noise.noise(x * 0.0008, z * 0.0008) < (th.trees.type === 'jungle' ? -0.5 : -0.05)) continue;
      const sc = 0.7 + rnd() * 0.8;
      p.set(x, h - 0.5, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
      s.set(sc, sc * (0.8 + rnd() * 0.5), sc);
      m.compose(p, q, s);
      mesh.setMatrixAt(n++, m);
    }
    mesh.count = n;
    mesh.castShadow = this.quality === 'high';
    mesh.receiveShadow = true;
    this.trees = this.add(mesh);
  }

  update(dt, t, camera, focus) {
    if (this.water.material.uniforms?.time) this.water.material.uniforms.time.value += dt * 0.6;
    if (this.sky.material.uniforms.time) this.sky.material.uniforms.time.value = t;
    // keep the shadow frustum around the focus object
    if (focus) {
      this.sun.position.copy(focus).addScaledVector(this.sunDir, 2500);
      this.sun.target.position.copy(focus);
      this.sun.target.updateMatrixWorld();
    }
    this.flareLight.position.copy(camera.position).addScaledVector(this.sunDir, 40000);
    this.base.update?.(dt, t, focus);
  }

  dispose() {
    for (const o of this.objects) {
      this.scene.remove(o);
      o.traverse?.((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach((mm) => { mm.map?.dispose?.(); mm.dispose(); });
      });
    }
    this.envRT?.dispose();
    this.scene.environment = null;
    this.scene.fog = null;
  }
}

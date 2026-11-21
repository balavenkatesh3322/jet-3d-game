// Procedural heightmap terrain per theater, with a fast bilinear height query for collisions.
import * as THREE from 'three';
import { Simplex2 } from '../util/noise.js';
import { smoothstep, clamp } from '../util/math.js';

export const TERRAIN_SIZE = 64000;
const SEG = 400;

export class Terrain {
  constructor(theater, seed = 7, quality = 'high') {
    this.theater = theater;
    this.noise = new Simplex2(seed);
    this.noise2 = new Simplex2(seed * 3 + 11);
    this.cfg = theater.terrain;
    this.size = TERRAIN_SIZE;
    this.seg = quality === 'low' ? 256 : SEG;
    this.baseHeight = this.cfg.baseHeight || 0;
    this.airbase = theater.base === 'airbase';
    this.flatZones = [];
    if (this.airbase) this.flatZones.push({ x: 0, z: 0, hx: 360, hz: 1900, h: this.baseHeight, falloff: 900 });
    this.build();
  }

  // Raw procedural height (meters). Water level = 0.
  rawHeight(x, z) {
    const n = this.noise, n2 = this.noise2, H = this.cfg.height;
    const d = Math.hypot(x, z);
    const edge = 1 - smoothstep(this.size * 0.36, this.size * 0.49, Math.max(Math.abs(x), Math.abs(z)));
    let h = 0;
    switch (this.cfg.kind) {
      case 'islands': {
        const m = n.fbm(x * 0.00006 + 3.1, z * 0.00006 - 1.7, 4);
        const r = n2.ridged(x * 0.00025, z * 0.00025, 4);
        h = (m - 0.08) * 2.2;
        h = h > 0 ? h * (0.4 + r) * H : h * 400;
        if (h <= 2) h = Math.min(h, -40 + h * 0.2);
        const open = smoothstep(2500, 6500, d); // keep the carrier area open sea
        h = -60 + (h + 60) * open;
        break;
      }
      case 'coast':
      case 'icecoast': {
        const c = (-z - 5500) + n.fbm(x * 0.00012, z * 0.00012, 4) * 3500;
        const land = smoothstep(-200, 2500, c);
        const r = n2.ridged(x * 0.0002, z * 0.0002, 5);
        const hills = (0.25 + r * 0.9 + n.fbm(x * 0.0006, z * 0.0006, 3) * 0.15) * H;
        h = land * hills + (c < 0 ? Math.max(-120, Math.min(-25, c * 0.08)) : c < 300 ? c * 0.02 : 6);
        if (this.cfg.kind === 'icecoast') {
          // icebergs/floes scattered in the sea
          const ice = n2.noise(x * 0.0012, z * 0.0012);
          if (c < -1200 && ice > 0.72 && d > 2500) h = Math.max(h, (ice - 0.72) * 300);
        }
        break;
      }
      case 'hills': {
        const r = n.fbm(x * 0.00018, z * 0.00018, 5);
        const ridge = n2.ridged(x * 0.0003, z * 0.0003, 4);
        h = this.baseHeight + (r * 0.55 + 0.35) * H * 0.6 + ridge * H * 0.45;
        // winding river valleys
        const riv = Math.abs(n2.noise(x * 0.00009 + 5, z * 0.00009 - 2));
        h = h * smoothstep(0.015, 0.09, riv) - (1 - smoothstep(0, 0.02, riv)) * 15;
        break;
      }
      case 'alpine': {
        const r = n.ridged(x * 0.00011, z * 0.00011, 6);
        const f = n2.fbm(x * 0.00005, z * 0.00005, 3) * 0.5 + 0.5;
        h = this.baseHeight + Math.pow(r, 1.6) * H * (0.4 + f);
        // carved valleys
        const v = Math.abs(n2.noise(x * 0.00007 + 9, z * 0.00007));
        h *= 0.35 + 0.65 * smoothstep(0.02, 0.22, v);
        break;
      }
      case 'desert': {
        const dunes = Math.abs(Math.sin((x * 0.6 + z) * 0.004 + n.noise(x * 0.0004, z * 0.0004) * 3)) * 18;
        const big = n.fbm(x * 0.00008, z * 0.00008, 4) * 0.5 + 0.5;
        const mesa = n2.noise(x * 0.00015, z * 0.00015);
        let mh = 0;
        if (mesa > 0.35) mh = Math.round(smoothstep(0.35, 0.55, mesa) * 4) / 4 * H;
        h = this.baseHeight + dunes + big * 120 + mh;
        break;
      }
      default: h = 0;
    }
    if (this.airbase || this.cfg.kind === 'desert') {
      // land theaters fade into a sea at the far edge
      h = h * edge + (1 - edge) * -60;
    } else {
      h = h * edge + (1 - edge) * Math.min(h, -60);
    }
    // flatten the airbase
    for (const fz of this.flatZones) {
      const dx = Math.max(0, Math.abs(x - fz.x) - fz.hx), dz = Math.max(0, Math.abs(z - fz.z) - fz.hz);
      const dd = Math.hypot(dx, dz);
      const k = 1 - smoothstep(0, fz.falloff, dd);
      h = h + (fz.h - h) * k;
    }
    return h;
  }

  build() {
    const seg = this.seg, size = this.size, step = size / seg;
    const n = seg + 1;
    this.heights = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -size / 2 + i * step, z = -size / 2 + j * step;
        this.heights[j * n + i] = this.rawHeight(x, z);
      }
    }
    this.step = step; this.n = n;

    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    // PlaneGeometry after rotateX: vertex order row-major from z=-size/2 (top) ... matches j index
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      const i = Math.round((x + size / 2) / step), j = Math.round((z + size / 2) / step);
      pos.setY(k, this.heights[j * n + i]);
    }
    geo.computeVertexNormals();

    // vertex colors from height/slope
    const pal = this.theater.palette;
    const cBeach = new THREE.Color(pal.beach), cLow = new THREE.Color(pal.low), cMid = new THREE.Color(pal.mid);
    const cHigh = new THREE.Color(pal.high), cPeak = new THREE.Color(pal.peak), cRock = new THREE.Color(0x6b6660);
    const cSea = new THREE.Color(0x284c4a);
    const colors = new Float32Array(pos.count * 3);
    const nrm = geo.attributes.normal;
    const H = this.cfg.height + this.baseHeight;
    const tmp = new THREE.Color();
    const snowLine = this.cfg.kind === 'alpine' ? H * 0.5 : this.cfg.kind === 'icecoast' ? -1e9 : 1e9;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      const slope = 1 - nrm.getY(k);
      const v = this.noise.noise(x * 0.002, z * 0.002) * 0.5 + 0.5;
      const hn = clamp((y - this.baseHeight) / Math.max(1, H - this.baseHeight), 0, 1);
      if (y < 2) tmp.copy(cSea).lerp(cBeach, smoothstep(-30, 2, y));
      else if (y < 12 && !this.airbase) tmp.copy(cBeach);
      else {
        tmp.copy(cLow).lerp(cMid, smoothstep(0.1, 0.45, hn + v * 0.15));
        tmp.lerp(cHigh, smoothstep(0.4, 0.7, hn + v * 0.1));
        tmp.lerp(cRock, smoothstep(0.25, 0.55, slope) * 0.85);
        if (y > snowLine - v * 200) tmp.lerp(cPeak, smoothstep(0.55, 0.3, slope));
        if (this.cfg.kind === 'icecoast' && y > 2) tmp.copy(cPeak).lerp(cHigh, smoothstep(0.2, 0.6, slope));
      }
      const shade = 0.88 + v * 0.24;
      colors[k * 3] = tmp.r * shade; colors[k * 3 + 1] = tmp.g * shade; colors[k * 3 + 2] = tmp.b * shade;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, map: detailTexture(), envMapIntensity: 0.5 });
    mat.map.repeat.set(seg / 2, seg / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
  }

  // Bilinear sample of the height grid.
  heightAt(x, z) {
    const { size, step, n, heights } = this;
    const fx = (x + size / 2) / step, fz = (z + size / 2) / step;
    if (fx < 0 || fz < 0 || fx >= n - 1 || fz >= n - 1) return -60;
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const h00 = heights[j * n + i], h10 = heights[j * n + i + 1];
    const h01 = heights[(j + 1) * n + i], h11 = heights[(j + 1) * n + i + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  // Ground or sea surface height
  surfaceAt(x, z) { return Math.max(0, this.heightAt(x, z)); }

  slopeAt(x, z) {
    const e = 30;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  dispose() { this.mesh.geometry.dispose(); this.mesh.material.map?.dispose(); this.mesh.material.dispose(); }
}

let _detail = null;
function detailTexture() {
  if (_detail) return _detail;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(256, 256);
  const s = new Simplex2(99);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    // tileable by sampling a torus-mapped noise
    const a = (x / 256) * Math.PI * 2, b = (y / 256) * Math.PI * 2;
    const v = s.fbm(Math.cos(a) * 3 + Math.sin(b) * 2, Math.sin(a) * 3 + Math.cos(b) * 2, 4);
    const k = 214 + v * 38;
    const i = (y * 256 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = k; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  _detail = new THREE.CanvasTexture(c);
  _detail.wrapS = _detail.wrapT = THREE.RepeatWrapping;
  _detail.colorSpace = THREE.SRGBColorSpace;
  _detail.anisotropy = 8;
  return _detail;
}

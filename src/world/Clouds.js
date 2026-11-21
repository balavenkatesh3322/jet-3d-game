// Instanced billboard cumulus clouds (one draw call), lit with a simple sun term.
import * as THREE from 'three';
import { Simplex2 } from '../util/noise.js';

function cloudTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 128 + (Math.random() - 0.5) * 120, y = 140 + (Math.random() - 0.5) * 70;
    const r = 30 + Math.random() * 60;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  }
  // fade edges
  const img = g.getImageData(0, 0, 256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const d = Math.hypot(x - 128, y - 128) / 128;
    const i = (y * 256 + x) * 4 + 3;
    img.data[i] *= Math.max(0, 1 - Math.pow(d, 3));
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class Clouds {
  constructor(scene, theater, sunDir) {
    const clusters = theater.clouds;
    const s = new Simplex2(5);
    const puffs = [];
    for (let c = 0; c < clusters; c++) {
      const cx = (Math.random() - 0.5) * 50000, cz = (Math.random() - 0.5) * 50000;
      const cy = 1600 + Math.random() * 2600;
      const n = 8 + Math.floor(Math.random() * 10);
      const spread = 500 + Math.random() * 700;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
        puffs.push({
          x: cx + Math.cos(a) * r, y: cy + Math.random() * 280 + Math.abs(s.noise(cx, i)) * 150,
          z: cz + Math.sin(a) * r * 0.7, size: 380 + Math.random() * 520,
        });
      }
    }
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        map: { value: null }, sunDir: { value: sunDir.clone() },
        lit: { value: new THREE.Color(2.3, 2.25, 2.15) }, shade: { value: new THREE.Color(1.45, 1.55, 1.75) },
      }]),
      vertexShader: /* glsl */`
        varying vec2 vUv; varying float vH; varying float vFade; varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main(){
          vUv = uv;
          vec4 center = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
          float sz = length(instanceMatrix[0].xyz);
          vWorld = center.xyz;
          vec4 mvPosition = modelViewMatrix * center;
          mvPosition.xy += position.xy * sz;
          vH = position.y + 0.5;
          float d = -mvPosition.z;
          vFade = smoothstep(sz * 0.2, sz * 1.1, d);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D map; uniform vec3 sunDir; uniform vec3 lit; uniform vec3 shade;
        varying vec2 vUv; varying float vH; varying float vFade; varying vec3 vWorld;
        #include <fog_pars_fragment>
        void main(){
          vec4 t = texture2D(map, vUv);
          float light = clamp(vH * 0.9 + 0.25 + sunDir.y * 0.3, 0.0, 1.0);
          vec3 col = mix(shade, lit, light);
          gl_FragColor = vec4(col, t.a * vFade * 0.95);
          if (gl_FragColor.a < 0.01) discard;
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog: true,
    });
    mat.uniforms.map.value = cloudTexture();
    mat.uniforms.sunDir.value.copy(sunDir);
    const mesh = new THREE.InstancedMesh(geo, mat, puffs.length);
    const m = new THREE.Matrix4();
    puffs.forEach((p, i) => {
      m.makeScale(p.size, p.size, p.size); m.setPosition(p.x, p.y, p.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    this.mesh = mesh;
    this.puffs = puffs;
    scene.add(mesh);
  }

  // Is a point inside cloud cover? (used for whiteout effect + IR missile breaking lock)
  densityAt(p) {
    let d = 0;
    for (const c of this.puffs) {
      const dx = p.x - c.x, dy = (p.y - c.y) * 1.6, dz = p.z - c.z;
      const r = c.size * 0.42;
      const q = (dx * dx + dy * dy + dz * dz) / (r * r);
      if (q < 1) d = Math.max(d, 1 - q);
    }
    return d;
  }

  dispose(scene) { scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

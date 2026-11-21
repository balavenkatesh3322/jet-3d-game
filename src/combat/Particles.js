// GPU point-sprite particle systems (one additive for fire/sparks, one alpha for smoke/spray).
import * as THREE from 'three';

function makeSmokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  // break up the disc with some lumps
  for (let i = 0; i < 40; i++) {
    const x = 64 + (Math.random() - 0.5) * 70, y = 64 + (Math.random() - 0.5) * 70, r = 8 + Math.random() * 18;
    const gg = g.createRadialGradient(x, y, 0, x, y, r);
    gg.addColorStop(0, 'rgba(255,255,255,0.25)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gg; g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const VERT = /* glsl */`
  attribute float size;
  attribute vec4 rgba;
  attribute float rot;
  varying vec4 vColor;
  varying float vRot;
  uniform float scale;
  #include <fog_pars_vertex>
  void main() {
    vColor = rgba;
    vRot = rot;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / max(-mvPosition.z, 0.5);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const FRAG = /* glsl */`
  uniform sampler2D map;
  uniform float boost;
  varying vec4 vColor;
  varying float vRot;
  #include <fog_pars_fragment>
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float c = cos(vRot), s = sin(vRot);
    uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y) + 0.5;
    vec4 tex = texture2D(map, uv);
    gl_FragColor = vec4(vColor.rgb * tex.rgb * boost, vColor.a * tex.a);
    if (gl_FragColor.a < 0.004) discard;
    #include <fog_fragment>
  }
`;

class ParticleSystem {
  constructor(scene, max, additive, texture) {
    this.max = max;
    this.count = 0;
    this.cursor = 0;
    // CPU state
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 4); this.c1 = new Float32Array(max * 4);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.rotv = new Float32Array(max);
    // GPU buffers
    this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos);
    this.geo.setAttribute('size', this.aSize);
    this.geo.setAttribute('rgba', this.aCol);
    this.geo.setAttribute('rot', this.aRot);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: texture }, scale: { value: 600 }, boost: { value: additive ? 2.6 : 1.7 } }]),
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mat.uniforms.map.value = texture;
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 11 : 10;
    scene.add(this.points);
    this.alive = new Uint8Array(max);
  }

  setScale(h, fovRad) { this.mat.uniforms.scale.value = h / (2 * Math.tan(fovRad / 2)); }

  spawn(o) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3, i4 = i * 4;
    this.p[i3] = o.x; this.p[i3 + 1] = o.y; this.p[i3 + 2] = o.z;
    this.v[i3] = o.vx || 0; this.v[i3 + 1] = o.vy || 0; this.v[i3 + 2] = o.vz || 0;
    this.life[i] = 0; this.maxLife[i] = o.life || 1;
    this.s0[i] = o.size0 ?? 1; this.s1[i] = o.size1 ?? this.s0[i];
    const a = o.color0 || [1, 1, 1, 1], b = o.color1 || a;
    this.c0.set(a, i4); this.c1.set(b, i4);
    this.drag[i] = o.drag ?? 0; this.grav[i] = o.grav ?? 0;
    this.rotv[i] = o.spin ?? (Math.random() - 0.5);
    this.aRot.array[i] = Math.random() * 6.28;
    this.alive[i] = 1;
  }

  update(dt) {
    const { p, v, life, maxLife, s0, s1, c0, c1, drag, grav, alive } = this;
    const pos = this.aPos.array, size = this.aSize.array, col = this.aCol.array, rot = this.aRot.array;
    for (let i = 0; i < this.max; i++) {
      if (!alive[i]) continue;
      life[i] += dt;
      const t = life[i] / maxLife[i];
      const i3 = i * 3, i4 = i * 4;
      if (t >= 1) { alive[i] = 0; size[i] = 0; col[i4 + 3] = 0; continue; }
      const dr = Math.exp(-drag[i] * dt);
      v[i3] *= dr; v[i3 + 1] = v[i3 + 1] * dr + grav[i] * dt; v[i3 + 2] *= dr;
      p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
      pos[i3] = p[i3]; pos[i3 + 1] = p[i3 + 1]; pos[i3 + 2] = p[i3 + 2];
      size[i] = s0[i] + (s1[i] - s0[i]) * t;
      const fade = t < 0.08 ? t / 0.08 : 1;
      col[i4] = c0[i4] + (c1[i4] - c0[i4]) * t;
      col[i4 + 1] = c0[i4 + 1] + (c1[i4 + 1] - c0[i4 + 1]) * t;
      col[i4 + 2] = c0[i4 + 2] + (c1[i4 + 2] - c0[i4 + 2]) * t;
      col[i4 + 3] = (c0[i4 + 3] + (c1[i4 + 3] - c0[i4 + 3]) * t) * fade;
      rot[i] += this.rotv[i] * dt;
    }
    this.aPos.needsUpdate = true; this.aSize.needsUpdate = true; this.aCol.needsUpdate = true; this.aRot.needsUpdate = true;
  }

  clear() {
    this.alive.fill(0); this.aSize.array.fill(0); this.aSize.needsUpdate = true;
  }

  dispose(scene) { scene.remove(this.points); this.geo.dispose(); this.mat.dispose(); }
}

export class Particles {
  constructor(scene) {
    const tex = makeSmokeTexture();
    this.smoke = new ParticleSystem(scene, 14000, false, tex);
    this.fire = new ParticleSystem(scene, 9000, true, tex);
  }
  setViewport(h, fov) { this.smoke.setScale(h, fov); this.fire.setScale(h, fov); }
  update(dt) { this.smoke.update(dt); this.fire.update(dt); }
  clear() { this.smoke.clear(); this.fire.clear(); }
}

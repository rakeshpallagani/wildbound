// Wildbound — built-in 3D map of Seattle (Three.js r128, global THREE).
// Real coordinates, stylised geometry: water, parks, highways, the Burke-Gilman Trail, procedural city blocks,
// landmark models with vigil beacons, Rainier / the Olympics / the Cascades on the horizon,
// and your avatar + spirit walking where your GPS (or Demo GPS) says you are.
import { project, unproject, BOUNDS, WATER, ISLANDS, CHANNELS, PARKS, ROADS, NEIGHBORHOODS, WATER_LABELS, isWater, isPark } from './geo.js';
import { VIGILS, VIGIL } from './data.js';

export function createMap3D({ onSelectVigil = () => {}, onMove = () => {} } = {}) {
  const THREE = window.THREE;
  if (!THREE) return null;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' }); } catch { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  const canvas = renderer.domElement;
  canvas.className = 'world-canvas';
  canvas.style.touchAction = 'none';
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', '3D map of Seattle. Drag to look around, scroll or pinch to zoom, tap a beacon to inspect a vigil.');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 9000);
  const clock = new THREE.Clock();
  const rng = mulberry(11);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra });
  const glow = (color, i = 1) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: i, flatShading: true });
  const add = (o, parent = scene) => { parent.add(o); return o; };
  const at = (lat, lon) => { const p = project(lat, lon); return new THREE.Vector3(p.x, 0, p.z); };

  // ---------- lights ----------
  const hemi = add(new THREE.HemisphereLight(0xd6e6ff, 0x37402f, 0.7));
  const sun = add(new THREE.DirectionalLight(0xfff1d6, 0.8));
  sun.position.set(-400, 600, 300);

  // ---------- ground, water, parks ----------
  const sw = project(BOUNDS.south, BOUNDS.west), ne = project(BOUNDS.north, BOUNDS.east);
  {
    const w = ne.x - sw.x + 4000, h = sw.z - ne.z + 4000;
    const land = add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat('#3b463a')));
    land.rotation.x = -Math.PI / 2;
    land.position.set((ne.x + sw.x) / 2, 0, (ne.z + sw.z) / 2);
  }
  function shape(ring, y, material) {
    const s = new THREE.Shape(ring.map(([lat, lon]) => { const p = project(lat, lon); return new THREE.Vector2(p.x, -p.z); }));
    const m = add(new THREE.Mesh(new THREE.ShapeGeometry(s), material));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    return m;
  }
  function ribbon(pts, width, y, material) {
    const P = pts.map(([lat, lon]) => project(lat, lon));
    const pos = [], idx = [];
    P.forEach((p, i) => {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      let dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      pos.push(p.x - dz * width / 2, y, p.z + dx * width / 2, p.x + dz * width / 2, y, p.z - dx * width / 2);
      if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return add(new THREE.Mesh(g, material));
  }
  const waterMat = new THREE.MeshStandardMaterial({ color: '#2a6684', roughness: 0.3, metalness: 0.15, side: THREE.DoubleSide });
  const parkMat = new THREE.MeshStandardMaterial({ color: '#4d7a3e', roughness: 1, side: THREE.DoubleSide });
  PARKS.forEach((p) => shape(p.ring, 0.2, parkMat));
  WATER.forEach((w) => shape(w.ring, 0.35, waterMat));
  ISLANDS.forEach((i) => shape(i.ring, 0.45, new THREE.MeshStandardMaterial({ color: '#3f4b3e', side: THREE.DoubleSide })));
  CHANNELS.forEach((c) => ribbon(c.pts, c.w, 0.36, waterMat));
  const roadMat = new THREE.MeshStandardMaterial({ color: '#6c7074', roughness: 1, side: THREE.DoubleSide });
  const trailMat = new THREE.MeshStandardMaterial({ color: '#d8b25a', emissive: '#6b5420', emissiveIntensity: 0.4, side: THREE.DoubleSide });
  ROADS.forEach((r) => ribbon(r.pts, r.w, r.kind === 'trail' ? 0.6 : 0.55, r.kind === 'trail' ? trailMat : roadMat));

  // ---------- procedural city blocks (instanced) ----------
  {
    const DT = { lat: 47.6070, lon: -122.3360 };
    const cells = [];
    const step = 0.0016;
    for (let lat = 47.53; lat < 47.73; lat += step) {
      for (let lon = -122.415; lon < -122.255; lon += step * 1.45) {
        const jl = lat + (rng() - 0.5) * step * 0.5, jo = lon + (rng() - 0.5) * step * 0.6;
        if (isWater(jl, jo) || isPark(jl, jo)) continue;
        if (VIGILS.some((v) => Math.abs(v.lat - jl) < 0.0012 && Math.abs(v.lon - jo) < 0.0016)) continue;
        if (Math.abs(jl - 47.6205) < 0.002 && Math.abs(jo + 122.3493) < 0.003) continue;
        const dkm = Math.hypot((jl - DT.lat) * 111, (jo - DT.lon) * 75);
        if (dkm > 1.3 && rng() > 0.55) continue;
        const h = dkm < 0.9 ? 6 + rng() * (32 - dkm * 20) : dkm < 2.5 ? 2 + rng() * 5 : 0.8 + rng() * 2;
        cells.push([jl, jo, h, dkm]);
      }
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), cells.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Color();
    cells.forEach(([lat, lon, h, d], i) => {
      const p = project(lat, lon);
      const fw = d < 0.9 ? 6 + rng() * 6 : 5 + rng() * 7;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rng() - 0.5) * 0.1);
      s.set(fw, h, fw * (0.6 + rng() * 0.6));
      m4.compose(new THREE.Vector3(p.x, 0, p.z), q, s);
      inst.setMatrixAt(i, m4);
      c.set(d < 0.9 ? (rng() < 0.5 ? '#8c9aa6' : '#a3adb5') : rng() < 0.5 ? '#7a7466' : '#8a8173');
      inst.setColorAt(i, c);
    });
    add(inst);
  }

  // ---------- labels ----------
  function label(text, { color = '#ffffff', bg = 'rgba(15,22,18,0.72)', size = 28, italic = false, w = 256 } = {}) {
    const cv = document.createElement('canvas');
    cv.width = w * 2; cv.height = 80;
    const x = cv.getContext('2d');
    x.font = `${italic ? 'italic ' : ''}600 ${size}px system-ui, sans-serif`;
    const tw = Math.min(cv.width - 8, x.measureText(text).width + 30);
    if (bg) { x.fillStyle = bg; roundRect(x, (cv.width - tw) / 2, 12, tw, 56, 28); x.fill(); }
    x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, cv.width / 2, 41);
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.userData.aspect = cv.width / cv.height;
    return sp;
  }
  const hoodLabels = [];
  NEIGHBORHOODS.forEach(([n, lat, lon]) => { const l = label(n, { color: '#e9efe6', bg: null, size: 30 }); l.position.copy(at(lat, lon)).setY(26); l.scale.set(60, 60 / l.userData.aspect, 1); hoodLabels.push(add(l)); });
  WATER_LABELS.forEach(([n, lat, lon]) => { const l = label(n, { color: '#a8d8ec', bg: null, size: 30, italic: true }); l.position.copy(at(lat, lon)).setY(8); l.scale.set(70, 70 / l.userData.aspect, 1); hoodLabels.push(add(l)); });

  // ---------- horizon ----------
  function peak(pos, r, h, color, snow = 0.4) {
    const g = new THREE.Group();
    const m1 = new THREE.MeshStandardMaterial({ color, flatShading: true, fog: false });
    const m2 = new THREE.MeshStandardMaterial({ color: '#f1f4f6', flatShading: true, fog: false });
    g.add(new THREE.Mesh(new THREE.ConeGeometry(r, h, 10), m1));
    const sh = h * snow;
    const cap = new THREE.Mesh(new THREE.ConeGeometry((r * sh) / h, sh, 10), m2);
    cap.position.y = h / 2 - sh / 2 + 0.5;
    g.add(cap);
    g.position.set(pos.x, h / 2 - 5, pos.z);
    add(g);
  }
  { // Rainier sits ~90 km SE; place it on the same bearing, closer, and huge.
    const r = project(46.853, -121.760);
    const d = Math.hypot(r.x, r.z);
    peak({ x: (r.x / d) * 3400, z: (r.z / d) * 3400 }, 900, 620, '#71819a', 0.42);
    for (let i = 0; i < 9; i++) peak({ x: 3200 + rng() * 500, z: -2600 + i * 520 }, 260 + rng() * 140, 200 + rng() * 140, '#56677a', 0.3);
    for (let i = 0; i < 8; i++) peak({ x: -2900 - rng() * 400, z: -2200 + i * 520 }, 240 + rng() * 120, 180 + rng() * 140, '#58695e', 0.32);
  }

  // ---------- landmark models ----------
  const L = {
    'space-needle'() {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.4, 30, 6), mat('#e6e3da'));
        leg.position.set(Math.cos(a) * 2.2, 15, Math.sin(a) * 2.2);
        leg.rotation.z = Math.cos(a) * 0.08; leg.rotation.x = -Math.sin(a) * 0.08;
        g.add(leg);
      }
      const halo = new THREE.Mesh(new THREE.CylinderGeometry(9, 5, 2.4, 20), mat('#efece2')); halo.position.y = 31;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(5, 8.5, 1.4, 20), glow('#f6d48a', 0.25)); top.position.y = 33;
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 9, 6), mat('#d0d0d0')); spire.position.y = 38;
      g.add(halo, top, spire);
      return g;
    },
    'pike-place'() {
      const g = new THREE.Group();
      const hall = new THREE.Mesh(new THREE.BoxGeometry(26, 5, 9), mat('#8f6b4e')); hall.position.y = 2.5;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(27, 0.8, 10), mat('#5c4636')); roof.position.y = 5.4;
      const sign = label('PUBLIC MARKET', { color: '#ff4a3a', bg: 'rgba(20,10,10,0.85)', size: 34 }); sign.position.set(0, 9, 0); sign.scale.set(22, 22 / sign.userData.aspect, 1);
      g.add(hall, roof, sign);
      return g;
    },
    'gas-works'() {
      const g = new THREE.Group();
      [[0, 0, 13], [4, 1, 11], [-4, 2, 12], [1.5, -4, 9], [-2, 4, 8]].forEach(([x, z, h]) => {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, h, 8), mat('#7a4b30')); t.position.set(x, h / 2, z); g.add(t);
      });
      const pipe = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 0.6), mat('#5d3826')); pipe.position.y = 8; g.add(pipe);
      const hill = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#5b8a46')); hill.position.set(9, 0, 6); hill.scale.y = 0.45; g.add(hill);
      return g;
    },
    'kerry-park'() {
      const g = new THREE.Group();
      const deck = new THREE.Mesh(new THREE.BoxGeometry(12, 1, 5), mat('#b9b2a2')); deck.position.y = 0.5;
      const art = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.5, 6, 14, Math.PI * 1.4), mat('#c8902f', { metalness: 0.4 })); art.position.set(-3, 3.4, 0);
      g.add(deck, art);
      return g;
    },
    'ballard-locks'() {
      const g = new THREE.Group();
      [-3, 3].forEach((z) => { const gate = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 9), mat('#59646e')); gate.position.set(0, 2, z); g.add(gate); });
      const walk = new THREE.Mesh(new THREE.BoxGeometry(18, 0.6, 1.6), mat('#9aa2a8')); walk.position.y = 4.2; g.add(walk);
      return g;
    },
    'west-point'() {
      const g = new THREE.Group();
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 9, 10), mat('#f1efe8')); t.position.y = 4.5;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), glow('#ffe58a', 2.2)); lamp.position.y = 9.6;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.4, 10), mat('#a8382c')); cap.position.y = 10.9;
      g.add(t, lamp, cap);
      return g;
    },
    'green-lake'() {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 5), mat('#d6cdb8')); b.position.y = 1.5;
      const r = new THREE.Mesh(new THREE.ConeGeometry(5.8, 2.4, 4), mat('#5a6b4f')); r.position.y = 4.2; r.rotation.y = Math.PI / 4;
      g.add(b, r);
      return g;
    },
    'fremont-troll'() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(5, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#6f726f')); body.scale.set(1.4, 0.9, 1);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), glow('#e9f1ff', 0.6)); eye.position.set(2, 3.2, 3.6);
      const car = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 1.8), mat('#3a6fa3')); car.position.set(-6, 0.9, 2);
      g.add(body, eye, car);
      return g;
    },
    'lumen-field'() {
      const g = new THREE.Group();
      const bowl = new THREE.Mesh(new THREE.TorusGeometry(16, 4, 6, 28), mat('#8e9aa3')); bowl.rotation.x = Math.PI / 2; bowl.scale.set(1.25, 1, 0.7); bowl.position.y = 3;
      const pitch = new THREE.Mesh(new THREE.PlaneGeometry(26, 15), mat('#3d8a3a')); pitch.rotation.x = -Math.PI / 2; pitch.position.y = 0.8;
      [-1, 1].forEach((s) => { const arch = new THREE.Mesh(new THREE.TorusGeometry(15, 0.7, 5, 20, Math.PI), mat('#c9d1d6')); arch.position.set(0, 3, s * 9); arch.scale.y = 0.6; g.add(arch); });
      g.add(bowl, pitch);
      return g;
    },
    'volunteer-park'() {
      const g = new THREE.Group();
      const t = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 11, 12), mat('#9c5a3f')); t.position.y = 5.5;
      const r = new THREE.Mesh(new THREE.ConeGeometry(3.2, 2, 12), mat('#4c3a33')); r.position.y = 12;
      g.add(t, r);
      return g;
    },
    'seward-park'() {
      const g = new THREE.Group();
      for (let i = 0; i < 9; i++) {
        const tr = new THREE.Group();
        for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(3 - k * 0.7, 5, 7), mat(k % 2 ? '#2f5a36' : '#28503a')); c.position.y = 4 + k * 3; tr.add(c); }
        tr.position.set((rng() - 0.5) * 18, 0, (rng() - 0.5) * 18);
        tr.scale.setScalar(1 + rng() * 0.6);
        g.add(tr);
      }
      return g;
    },
    'golden-gardens'() {
      const g = new THREE.Group();
      const sand = new THREE.Mesh(new THREE.CircleGeometry(9, 18), mat('#d8c48e')); sand.rotation.x = -Math.PI / 2; sand.position.y = 0.7;
      const fire = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3, 7), glow('#ff8a2a', 1.8)); fire.position.y = 2.2;
      g.add(sand, fire);
      return g;
    },
    'pioneer-square'() {
      const g = new THREE.Group();
      [[-4, -2], [4, -2], [-4, 2], [4, 2]].forEach(([x, z]) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 5, 6), mat('#2f3a33')); p.position.set(x, 2.5, z); g.add(p); });
      const roof = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 6), mat('#3d4a40', { metalness: 0.3 })); roof.position.y = 5.2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 12, 6), mat('#7b3e2b')); pole.position.set(7, 6, 0);
      g.add(roof, pole);
      return g;
    },
  };

  // ---------- vigils ----------
  const vigilObjs = {};
  const pickables = [];
  VIGILS.forEach((v) => {
    const g = new THREE.Group();
    g.position.copy(at(v.lat, v.lon));
    const model = (L[v.id] || (() => new THREE.Group()))();
    model.scale.setScalar(1.3);
    g.add(model);
    const beamMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, depthWrite: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 5, 180, 12, 1, true), beamMat);
    beam.position.y = 90;
    const base = new THREE.Mesh(new THREE.RingGeometry(VIGIL.radiusM / 10 - 1, VIGIL.radiusM / 10, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    base.rotation.x = -Math.PI / 2; base.position.y = 0.8;
    const wardArc = new THREE.Mesh(new THREE.RingGeometry(9, 11, 48, 1, 0, Math.PI * 2), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    wardArc.rotation.x = -Math.PI / 2; wardArc.position.y = 0.9;
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(2.6, 0), glow('#ffffff', 1));
    orb.position.y = 52;
    const tag = label(v.name);
    tag.position.y = 60;
    tag.scale.set(44, 44 / tag.userData.aspect, 1);
    const shield = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#9fd3ff', transparent: true, opacity: 0.15, depthWrite: false }));
    shield.visible = false;
    g.add(beam, base, wardArc, orb, tag, shield);
    [beam, orb, tag, ...model.children].forEach((o) => { o.userData.vigilId = v.id; pickables.push(o); });
    add(g);
    vigilObjs[v.id] = { g, beam, base, wardArc, orb, tag, shield, key: '' };
  });

  function applyVigils(list) {
    list.forEach((v) => {
      const o = vigilObjs[v.id];
      if (!o) return;
      const key = JSON.stringify(v);
      if (key === o.key) return;
      o.key = key;
      const col = v.color || '#ffffff';
      o.beam.material.color.set(col);
      o.beam.material.opacity = v.color ? (v.mine ? 0.38 : 0.26) : 0.1;
      o.orb.material.color.set(col); o.orb.material.emissive.set(col);
      o.orb.material.emissiveIntensity = v.color ? 1.4 : 0.3;
      o.base.material.color.set(v.selected ? '#ffd36e' : col);
      o.base.material.opacity = v.selected ? 0.8 : 0.25;
      o.wardArc.geometry.dispose();
      o.wardArc.geometry = new THREE.RingGeometry(9, 11, 48, 1, Math.PI / 2, Math.max(0.001, (v.ward / VIGIL.maxWard) * Math.PI * 2));
      o.wardArc.material.color.set(col);
      o.wardArc.visible = !!v.color;
      o.shield.visible = !!v.shielded;
      o.g.remove(o.tag);
      o.tag.material.map.dispose();
      o.tag = label(v.label, { color: v.color ? '#ffffff' : '#d7dbd6', bg: v.color ? hexA(v.color, 0.85) : 'rgba(15,22,18,0.7)' });
      o.tag.position.y = 60;
      o.tag.scale.set(52, 52 / o.tag.userData.aspect, 1);
      o.tag.userData.vigilId = v.id;
      pickables.push(o.tag);
      o.g.add(o.tag);
    });
  }

  // ---------- avatar & spirit ----------
  const AV = 4.2; // avatars are drawn ~4x life size so they read on a city map
  function avatar({ color, skin, gear = [], aspectColor }) {
    const g = new THREE.Group();
    const has = (id) => gear.includes(id);
    const cloth = has('wanderer') ? '#e2bf3d' : color;
    const rig = { group: g, legs: [], arms: [] };
    [-0.14, 0.14].forEach((x) => {
      const hip = new THREE.Group(); hip.position.set(x, 0.72, 0);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.7, 6), mat('#3b4152')); leg.position.y = -0.35; hip.add(leg);
      if (has('first_steps')) { const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.32), mat('#5a3a22')); boot.position.set(0, -0.68, 0.05); hip.add(boot); }
      rig.legs.push(hip); g.add(hip);
    });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.32, 0.8, 7), mat(cloth)); torso.position.y = 1.12; g.add(torso);
    [-0.38, 0.38].forEach((x, i) => {
      const sh = new THREE.Group(); sh.position.set(x, 1.45, 0);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.62, 5), mat(cloth)); arm.position.y = -0.3; sh.add(arm);
      if (i === 1 && has('lorekeeper')) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), glow('#ffd56b', 2.2)); l.position.set(0, -0.68, 0.06); sh.add(l); }
      rig.arms.push(sh); g.add(sh);
    });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), mat(skin)); head.position.y = 1.78; g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#2b2420')); hair.position.y = 1.82; hair.rotation.x = -0.25; g.add(hair);
    if (has('kindred')) { const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.95), new THREE.MeshStandardMaterial({ color: aspectColor, side: THREE.DoubleSide })); cape.position.set(0, 1.05, -0.33); cape.rotation.x = 0.12; g.add(cape); }
    if (has('century')) { const pack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.24), mat('#4f6b3a')); pack.position.set(0, 1.18, -0.3); g.add(pack); }
    if (has('streak3')) { const am = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), glow('#ffcf4a', 2)); am.position.set(0, 1.38, 0.3); g.add(am); }
    if (has('streak7')) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.03, 6, 20), glow('#dfe6ff', 1.2)); c.rotation.x = Math.PI / 2; c.position.y = 1.93; g.add(c); }
    if (has('warden')) { const crest = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 5), glow(aspectColor, 1.6)); crest.position.set(0, 2.08, 0); g.add(crest); }
    if (has('awakener')) { const halo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 24), glow('#ffe58a', 2)); halo.rotation.x = Math.PI / 2; halo.position.y = 2.2; g.add(halo); }
    if (has('harmony')) {
      const aura = new THREE.Group();
      ['#9bbf5f', '#ef7d3c', '#3fb6c9', '#b8a6f2', '#e3c46f'].forEach((c, i) => { const o = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), glow(c, 1.8)); const a = (i / 5) * Math.PI * 2; o.position.set(Math.cos(a) * 0.75, 1.1, Math.sin(a) * 0.75); aura.add(o); });
      rig.aura = aura; g.add(aura);
    }
    const reach = new THREE.Mesh(new THREE.RingGeometry(VIGIL.radiusM / 10 / AV - 0.12, VIGIL.radiusM / 10 / AV, 48), new THREE.MeshBasicMaterial({ color: aspectColor, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    reach.rotation.x = -Math.PI / 2; reach.position.y = 0.05; g.add(reach);
    g.scale.setScalar(AV);
    return rig;
  }
  function spiritMesh(aspect, color, stage, auraColor) {
    const geo = { ironroot: new THREE.DodecahedronGeometry(0.4, 0), emberclaw: new THREE.OctahedronGeometry(0.42, 0), tidecaller: new THREE.IcosahedronGeometry(0.4, 1), galewing: new THREE.TetrahedronGeometry(0.48, 0), mistwalker: new THREE.IcosahedronGeometry(0.42, 0) }[aspect] || new THREE.SphereGeometry(0.4, 10, 8);
    const g = new THREE.Group();
    const core = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1, flatShading: true }));
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.03, 6, 32), glow(auraColor || color, 1.6));
    halo.rotation.x = Math.PI / 2.4;
    g.add(core, halo);
    if (auraColor) { const shell = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12), new THREE.MeshBasicMaterial({ color: auraColor, transparent: true, opacity: 0.18, depthWrite: false })); g.add(shell); }
    g.scale.setScalar(AV * (0.65 + stage * 0.22));
    g.userData = { core, halo };
    return g;
  }

  let player = null, spirit = null;
  const pos = new THREE.Vector3();
  let yaw = Math.PI, walkTarget = null, walkPhase = 0, mode = 'demo';
  const gpsTarget = new THREE.Vector3();
  const trackGeo = new THREE.BufferGeometry();
  const trackLine = add(new THREE.Line(trackGeo, new THREE.LineBasicMaterial({ color: '#ffd36e' })));

  let avatarSig = '';
  function update(model) {
    applyVigils(model.vigils);
    const sig = JSON.stringify([model.avatar, model.spirit]);
    if (sig === avatarSig) return;
    avatarSig = sig;
    if (player) scene.remove(player.group);
    player = avatar(model.avatar);
    player.group.position.copy(pos);
    add(player.group);
    if (spirit) scene.remove(spirit);
    spirit = spiritMesh(model.spirit.aspect, model.spirit.color, model.spirit.stage, model.spirit.aura);
    spirit.position.copy(pos).add(new THREE.Vector3(6, 10, 0));
    add(spirit);
  }

  // ---------- sky ----------
  let rainOn = false, lastMin = -1;
  const RAIN_N = 1600;
  const rainGeo = new THREE.BufferGeometry();
  const rp = new Float32Array(RAIN_N * 3);
  for (let i = 0; i < RAIN_N; i++) { rp[i * 3] = (rng() - 0.5) * 400; rp[i * 3 + 1] = rng() * 200; rp[i * 3 + 2] = (rng() - 0.5) * 400; }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = add(new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: '#b9cdd8', size: 0.9, transparent: true, opacity: 0.55 })));
  rain.visible = false;
  function seattleHour() {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
    return (Number(p.find((x) => x.type === 'hour').value) % 24) + Number(p.find((x) => x.type === 'minute').value) / 60;
  }
  function updateSky(force) {
    const h = seattleHour();
    const m = Math.floor(h * 60);
    if (!force && m === lastMin) return;
    lastMin = m;
    const s = Math.sin(((h - 6.5) / 12) * Math.PI);
    const day = Math.max(0, Math.min(1, (s + 0.15) / 0.55));
    const dusk = Math.max(0, 1 - Math.abs(s - 0.05) / 0.25) * 0.6;
    const sky = new THREE.Color('#0d1828').lerp(new THREE.Color(rainOn ? '#98a6ae' : '#8dbad6'), day).lerp(new THREE.Color('#e3936a'), rainOn ? dusk * 0.3 : dusk);
    scene.background = sky;
    scene.fog = new THREE.Fog(sky, rainOn ? 500 : 900, rainOn ? 2600 : 3800);
    hemi.intensity = 0.35 + 0.5 * day;
    sun.intensity = (rainOn ? 0.35 : 0.85) * Math.max(0.15, day);
    sun.color.set(dusk > 0.3 ? '#ffc79a' : day > 0.2 ? '#fff1d6' : '#9fb6ff');
  }

  // ---------- controls ----------
  let theta = 0.35, phi = 0.95, dist = 220;
  const target = new THREE.Vector3();
  const pointers = new Map();
  let moved = 0, pinch0 = 0, dist0 = dist;
  const ray = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const keys = new Set();
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = dist; }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; dist = clampN(dist0 * (pinch0 / Math.hypot(a.x - b.x, a.y - b.y)), 40, 1600); moved = 99; return; }
    moved += Math.abs(dx) + Math.abs(dy);
    theta -= dx * 0.007;
    phi = clampN(phi - dy * 0.005, 0.25, 1.4);
  });
  const end = (e) => {
    const was = pointers.has(e.pointerId);
    pointers.delete(e.pointerId);
    if (!was || moved >= 6 || pointers.size) return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(pickables, false).find((h) => h.object.visible && h.object.parent);
    if (hit) { onSelectVigil(hit.object.userData.vigilId); return; }
    const p = new THREE.Vector3();
    if (ray.ray.intersectPlane(groundPlane, p)) {
      if (mode === 'demo') walkTarget = p.setY(0);
      onSelectVigil(null);
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); dist = clampN(dist * (1 + e.deltaY * 0.0012), 40, 1600); }, { passive: false });
  canvas.addEventListener('keydown', (e) => { const k = e.key.toLowerCase(); if ('wasd'.includes(k) || k.startsWith('arrow')) { keys.add(k); e.preventDefault(); walkTarget = null; } });
  canvas.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  canvas.addEventListener('blur', () => keys.clear());

  // ---------- loop ----------
  let raf = 0, container = null, ro = null, lastEmit = 0;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const SPEED = 32; // demo walking speed in units/s (fast-forwarded so you can cross the city)
  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;
    updateSky(false);
    let moving = false;
    if (mode === 'demo') {
      let mx = 0, mz = 0;
      if (keys.has('w') || keys.has('arrowup')) mz -= 1;
      if (keys.has('s') || keys.has('arrowdown')) mz += 1;
      if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
      if (keys.has('d') || keys.has('arrowright')) mx += 1;
      if (mx || mz) {
        const len = Math.hypot(mx, mz), fx = Math.sin(theta), fz = Math.cos(theta);
        const vx = (mx * fz + mz * fx) / len, vz = (-mx * fx + mz * fz) / len;
        pos.x += vx * SPEED * dt; pos.z += vz * SPEED * dt; yaw = Math.atan2(vx, vz); moving = true;
      } else if (walkTarget) {
        const dx = walkTarget.x - pos.x, dz = walkTarget.z - pos.z, d = Math.hypot(dx, dz);
        if (d > 0.5) { const st = Math.min(d, SPEED * dt); pos.x += (dx / d) * st; pos.z += (dz / d) * st; yaw = Math.atan2(dx, dz); moving = true; } else walkTarget = null;
      }
    } else {
      const dx = gpsTarget.x - pos.x, dz = gpsTarget.z - pos.z, d = Math.hypot(dx, dz);
      if (d > 0.3) { pos.x += dx * Math.min(1, dt * 3); pos.z += dz * Math.min(1, dt * 3); yaw = Math.atan2(dx, dz); moving = d > 1; }
    }
    if (player) {
      player.group.position.copy(pos);
      let diff = yaw - player.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      player.group.rotation.y += diff * Math.min(1, dt * 10);
      walkPhase = moving ? walkPhase + dt * 11 : walkPhase * 0.85;
      const sw = Math.sin(walkPhase) * (moving ? 0.65 : 0);
      player.legs[0].rotation.x = sw; player.legs[1].rotation.x = -sw;
      player.arms[0].rotation.x = -sw * 0.8; player.arms[1].rotation.x = sw * 0.8;
      if (player.aura) player.aura.rotation.y = t * 1.2;
    }
    if (spirit) {
      const off = new THREE.Vector3(Math.sin(t * 0.7) * 5 + 4, 9 + Math.sin(t * 2) * 0.8, Math.cos(t * 0.7) * 3);
      spirit.position.lerp(pos.clone().add(off), Math.min(1, dt * 3));
      if (!reduced) { spirit.userData.core.rotation.y += dt * 1.4; spirit.userData.halo.rotation.z += dt * 0.8; }
    }
    if (!reduced) Object.values(vigilObjs).forEach((o, i) => { o.orb.rotation.y += dt; o.orb.position.y = 52 + Math.sin(t * 1.4 + i) * 1.5; });
    if (rainOn) {
      const a = rainGeo.attributes.position.array;
      for (let i = 0; i < RAIN_N; i++) { a[i * 3 + 1] -= 140 * dt; if (a[i * 3 + 1] < 0) a[i * 3 + 1] = 200; }
      rainGeo.attributes.position.needsUpdate = true;
      rain.position.set(target.x, 0, target.z);
    }
    if (moving && t - lastEmit > 0.15) { lastEmit = t; const ll = unproject(pos.x, pos.z); onMove(ll.lat, ll.lon, mode); }
    target.lerp(new THREE.Vector3(pos.x, 4, pos.z), Math.min(1, dt * 4));
    camera.position.set(target.x + dist * Math.sin(phi) * Math.sin(theta), target.y + dist * Math.cos(phi), target.z + dist * Math.sin(phi) * Math.cos(theta));
    camera.lookAt(target);
    const labelScale = clampN(dist / 220, 0.6, 3);
    hoodLabels.forEach((l) => { l.scale.set(60 * labelScale, (60 * labelScale) / l.userData.aspect, 1); });
    renderer.render(scene, camera);
  }
  function resize() {
    if (!container) return;
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  updateSky(true);

  return {
    mount(el) { container = el; el.appendChild(canvas); ro = new ResizeObserver(resize); ro.observe(el); resize(); clock.getDelta(); cancelAnimationFrame(raf); frame(); },
    unmount() { cancelAnimationFrame(raf); ro?.disconnect(); canvas.remove(); container = null; keys.clear(); },
    update,
    setMode(m) { mode = m; walkTarget = null; },
    setPlayer(lat, lon, { jump = false } = {}) {
      const p = project(lat, lon);
      gpsTarget.set(p.x, 0, p.z);
      if (jump) { pos.set(p.x, 0, p.z); target.set(p.x, 4, p.z); }
    },
    setTrack(points) {
      const arr = new Float32Array(points.length * 3);
      points.forEach((pt, i) => { const p = project(pt.lat, pt.lon); arr[i * 3] = p.x; arr[i * 3 + 1] = 1.2; arr[i * 3 + 2] = p.z; });
      trackGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      trackGeo.computeBoundingSphere();
    },
    walkTo(lat, lon) { const p = project(lat, lon); walkTarget = new THREE.Vector3(p.x, 0, p.z); },
    focusOn(lat, lon) { const p = project(lat, lon); target.set(p.x, 4, p.z); },
    zoom(f) { dist = clampN(dist * f, 40, 1600); },
    recenter() { theta = 0.35; phi = 0.95; dist = 220; },
    setRain(on) { rainOn = !!on; rain.visible = rainOn; updateSky(true); },
    get rain() { return rainOn; },
  };
}

function clampN(n, a, b) { return Math.max(a, Math.min(b, n)); }
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
function roundRect(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
function mulberry(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

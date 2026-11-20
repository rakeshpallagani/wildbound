// Wildbound — 3D clan camp (Three.js r128, global THREE).
// A low-poly island on Puget Sound: your avatar, your spirit, your kin around the fire, the clan totem,
// buildings raised by Awakenings, and Rainier / the Olympics / the Space Needle on the horizon.

export function createWorld() {
  const THREE = window.THREE;
  if (!THREE) return null;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  const canvas = renderer.domElement;
  canvas.className = 'world-canvas';
  canvas.style.touchAction = 'none';
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Your 3D clan camp. Drag to look around, tap the ground to walk, or use W A S D.');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
  const clock = new THREE.Clock();
  const rng = mulberry(7);

  // ---------- helpers ----------
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra });
  const glow = (color, intensity = 1) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, flatShading: true });
  const mesh = (geo, m, { cast = true, receive = false } = {}) => { const o = new THREE.Mesh(geo, m); o.castShadow = cast; o.receiveShadow = receive; return o; };

  function height(x, z) {
    const r = Math.hypot(x, z);
    const n = Math.sin(x * 0.35) * Math.cos(z * 0.3) * 0.35 + Math.sin(x * 0.13 + z * 0.21) * 0.7 + Math.cos(z * 0.17 - x * 0.07) * 0.4;
    const hills = Math.max(0, n) * smooth(7, 13, r);
    const edge = r > 24 ? -(r - 24) * 0.55 : 0;
    return hills + edge;
  }

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x3a4a2a, 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 0.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
  scene.add(sun);
  scene.add(sun.target);
  const fireLight = new THREE.PointLight(0xff9a3c, 1.5, 18, 2);
  fireLight.position.set(0, 1.2, 0);
  scene.add(fireLight);

  // ---------- terrain & water ----------
  let ground;
  {
    const geo = new THREE.PlaneGeometry(64, 64, 72, 72);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = height(x, z);
      pos.setY(i, y);
      if (y < -0.25) c.set('#b8a47a');
      else if (Math.hypot(x, z) > 23) c.set('#cdbb8b');
      else if (y > 0.9) c.set('#456b36');
      else c.set(rng() < 0.5 ? '#5a8a43' : '#527f3d');
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    ground = mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }), { cast: false, receive: true });
    scene.add(ground);
    // camp clearing
    const clearing = mesh(new THREE.CircleGeometry(6.5, 28), mat('#7a6a4c'), { cast: false, receive: true });
    clearing.rotation.x = -Math.PI / 2;
    clearing.position.y = 0.02;
    scene.add(clearing);
  }
  const water = mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ color: '#2d6b86', roughness: 0.25, metalness: 0.2, transparent: true, opacity: 0.92 }), { cast: false, receive: true });
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.45;
  scene.add(water);

  // ---------- horizon: Rainier, Cascades, Olympics, Space Needle ----------
  function peak(x, z, r, h, color, snow = 0.4) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.ConeGeometry(r, h, 9), mat(color), { cast: false }));
    const sh = h * snow;
    const cap = mesh(new THREE.ConeGeometry((r * sh) / h, sh, 9), mat('#f2f5f7'), { cast: false });
    cap.position.y = h / 2 - sh / 2 + 0.05;
    g.add(cap);
    g.position.set(x, h / 2 - 1, z);
    scene.add(g);
  }
  peak(105, -150, 44, 40, '#6e7d8f', 0.45); // Tahoma / Rainier
  for (let i = 0; i < 9; i++) peak(-30 + i * 28, -185 - rng() * 30, 14 + rng() * 10, 14 + rng() * 10, '#56677a', 0.3);
  for (let i = 0; i < 7; i++) peak(-190 - rng() * 20, -90 + i * 30, 14 + rng() * 8, 13 + rng() * 9, '#5a6b5e', 0.3);
  {
    const city = new THREE.Group();
    const needle = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const leg = mesh(new THREE.CylinderGeometry(0.12, 0.3, 9, 5), mat('#d9d9d4'), { cast: false });
      const a = (i / 3) * Math.PI * 2;
      leg.position.set(Math.cos(a) * 0.5, 4.5, Math.sin(a) * 0.5);
      leg.rotation.z = Math.cos(a) * 0.08;
      leg.rotation.x = -Math.sin(a) * 0.08;
      needle.add(leg);
    }
    const saucer = mesh(new THREE.CylinderGeometry(2.1, 1.3, 0.6, 16), mat('#e8e6dc'), { cast: false });
    saucer.position.y = 9.2;
    const spire = mesh(new THREE.CylinderGeometry(0.05, 0.12, 2.5, 5), mat('#cfcfcf'), { cast: false });
    spire.position.y = 10.8;
    needle.add(saucer, spire);
    city.add(needle);
    for (let i = 0; i < 12; i++) {
      const h = 2 + rng() * 7;
      const b = mesh(new THREE.BoxGeometry(1.4, h, 1.4), mat(rng() < 0.5 ? '#7d8a96' : '#8f99a3'), { cast: false });
      b.position.set(3 + (i % 6) * 1.7, h / 2, -1 + Math.floor(i / 6) * 2);
      city.add(b);
    }
    const land = mesh(new THREE.CylinderGeometry(12, 13, 1, 16), mat('#5c7a4a'), { cast: false });
    land.position.set(6, -0.4, 0);
    city.add(land);
    city.position.set(-62, 0, -78);
    scene.add(city);
  }

  // ---------- trees & rocks ----------
  function fir(x, z, s) {
    const g = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 0.9 * s, 5), mat('#5b3b26'));
    trunk.position.y = 0.45 * s;
    g.add(trunk);
    const greens = ['#2e5a36', '#346640', '#28503a'];
    for (let i = 0; i < 3; i++) {
      const cone = mesh(new THREE.ConeGeometry((1.1 - i * 0.28) * s, 1.4 * s, 7), mat(greens[i]));
      cone.position.y = (1.2 + i * 0.75) * s;
      g.add(cone);
    }
    g.position.set(x, height(x, z) - 0.05, z);
    g.rotation.y = rng() * 6;
    scene.add(g);
  }
  for (let i = 0; i < 90; i++) {
    const a = rng() * Math.PI * 2, r = 13 + rng() * 9.5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > 4 && Math.abs(x) < 12) continue; // keep the camera's sightline into camp clear
    fir(x, z, 0.8 + rng() * 0.9);
  }
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2, r = 7 + rng() * 15;
    const rock = mesh(new THREE.DodecahedronGeometry(0.3 + rng() * 0.5, 0), mat('#7b7f80'));
    rock.position.set(Math.cos(a) * r, height(Math.cos(a) * r, Math.sin(a) * r) + 0.1, Math.sin(a) * r);
    rock.rotation.set(rng(), rng(), rng());
    scene.add(rock);
  }

  // ---------- campfire ----------
  const flame = mesh(new THREE.ConeGeometry(0.42, 1.1, 7), glow('#ff8a2a', 1.6), { cast: false });
  {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const s = mesh(new THREE.DodecahedronGeometry(0.22, 0), mat('#6f6f6a'));
      s.position.set(Math.cos(a) * 0.9, 0.12, Math.sin(a) * 0.9);
      scene.add(s);
    }
    for (let i = 0; i < 2; i++) {
      const log = mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 6), mat('#4a2f1d'));
      log.rotation.z = Math.PI / 2;
      log.rotation.y = i * Math.PI / 2 + 0.4;
      log.position.y = 0.15;
      scene.add(log);
    }
    flame.position.y = 0.7;
    scene.add(flame);
  }

  // ---------- totem ----------
  const ELS = ['earth', 'water', 'fire', 'air'];
  const totem = new THREE.Group();
  const totemBlocks = {};
  ELS.forEach((e, i) => {
    const b = mesh(new THREE.BoxGeometry(0.9, 0.85, 0.9), glow('#888888', 0.1));
    b.position.y = 0.45 + i * 0.88;
    b.rotation.y = i * 0.2;
    totemBlocks[e] = b;
    totem.add(b);
  });
  const crystal = mesh(new THREE.OctahedronGeometry(0.45, 0), glow('#ffffff', 0.8));
  crystal.position.y = 4.2;
  totem.add(crystal);
  const awakenRing = mesh(new THREE.TorusGeometry(1.4, 0.07, 6, 40), glow('#ffd36e', 2), { cast: false });
  awakenRing.rotation.x = Math.PI / 2;
  awakenRing.position.y = 0.1;
  totem.add(awakenRing);
  totem.position.set(0, 0, -3.4);
  scene.add(totem);

  // ---------- dynamic groups ----------
  const dyn = { buildings: new THREE.Group(), kin: new THREE.Group(), extras: new THREE.Group() };
  Object.values(dyn).forEach((g) => scene.add(g));
  let player = null;
  let spirit = null;
  let kinRigs = [];
  const playerPos = new THREE.Vector3(0, 0, 5.5);
  let playerYaw = Math.PI;
  let walkTarget = null;
  let walkPhase = 0;

  // ---------- avatar ----------
  const SKIN = ['#f1c7a5', '#d9a37e', '#b97c55', '#8d5a3b', '#6b4430', '#e8b896'];
  function label(text, color = '#ffffff') {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.font = '600 28px system-ui, sans-serif';
    const w = Math.min(240, x.measureText(text).width + 28);
    x.fillStyle = 'rgba(15,22,18,0.72)';
    roundRect(x, (256 - w) / 2, 10, w, 44, 22);
    x.fill();
    x.fillStyle = color;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, 128, 33);
    const tex = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
    s.scale.set(2.6, 0.65, 1);
    return s;
  }

  function avatar({ name, color, skin, gear = [], elColor, isPlayer, bonded }) {
    const g = new THREE.Group();
    const has = (id) => gear.includes(id);
    const cloth = has('local') ? '#e2bf3d' : color;
    const rig = { group: g, legs: [], arms: [] };
    [-0.14, 0.14].forEach((x) => {
      const hip = new THREE.Group();
      hip.position.set(x, 0.72, 0);
      const leg = mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.7, 6), mat('#3b4152'));
      leg.position.y = -0.35;
      hip.add(leg);
      if (has('first_steps')) {
        const boot = mesh(new THREE.BoxGeometry(0.2, 0.14, 0.32), mat('#5a3a22'));
        boot.position.set(0, -0.68, 0.05);
        hip.add(boot);
      }
      rig.legs.push(hip);
      g.add(hip);
    });
    const torso = mesh(new THREE.CylinderGeometry(0.27, 0.32, 0.8, 7), mat(cloth));
    torso.position.y = 1.12;
    g.add(torso);
    [-0.38, 0.38].forEach((x, i) => {
      const sh = new THREE.Group();
      sh.position.set(x, 1.45, 0);
      const arm = mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.62, 5), mat(cloth));
      arm.position.y = -0.3;
      sh.add(arm);
      if (i === 1 && has('lorekeeper')) {
        const lantern = mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), glow('#ffd56b', 2.2), { cast: false });
        lantern.position.set(0, -0.68, 0.06);
        sh.add(lantern);
      }
      rig.arms.push(sh);
      g.add(sh);
    });
    const head = mesh(new THREE.SphereGeometry(0.24, 10, 8), mat(skin));
    head.position.y = 1.78;
    g.add(head);
    const hair = mesh(new THREE.SphereGeometry(0.25, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#2b2420'));
    hair.position.y = 1.82;
    hair.rotation.x = -0.25;
    g.add(hair);
    if (has('kindred')) {
      const cape = mesh(new THREE.PlaneGeometry(0.62, 0.95), new THREE.MeshStandardMaterial({ color: elColor, side: THREE.DoubleSide, flatShading: true }));
      cape.position.set(0, 1.05, -0.33);
      cape.rotation.x = 0.12;
      g.add(cape);
    }
    if (has('century')) {
      const pack = mesh(new THREE.BoxGeometry(0.46, 0.52, 0.24), mat('#4f6b3a'));
      pack.position.set(0, 1.18, -0.3);
      g.add(pack);
    }
    if (has('streak3')) {
      const am = mesh(new THREE.SphereGeometry(0.06, 8, 6), glow('#ffcf4a', 2), { cast: false });
      am.position.set(0, 1.38, 0.3);
      g.add(am);
    }
    if (has('streak7')) {
      const circ = mesh(new THREE.TorusGeometry(0.25, 0.03, 6, 20), glow('#dfe6ff', 1.2), { cast: false });
      circ.rotation.x = Math.PI / 2;
      circ.position.y = 1.93;
      g.add(circ);
    }
    if (has('awakener')) {
      const crest = mesh(new THREE.ConeGeometry(0.09, 0.3, 5), glow(elColor, 1.6), { cast: false });
      crest.position.set(0, 2.08, 0);
      g.add(crest);
    }
    if (has('harmony')) {
      const aura = new THREE.Group();
      ['#9bbf5f', '#ef7d3c', '#4fb3d9', '#c7b8f5'].forEach((c, i) => {
        const o = mesh(new THREE.SphereGeometry(0.08, 8, 6), glow(c, 1.8), { cast: false });
        const a = (i / 4) * Math.PI * 2;
        o.position.set(Math.cos(a) * 0.75, 1.1, Math.sin(a) * 0.75);
        aura.add(o);
      });
      rig.aura = aura;
      g.add(aura);
    }
    if (bonded || isPlayer) {
      const ring = mesh(new THREE.RingGeometry(0.45, 0.6, 24), new THREE.MeshBasicMaterial({ color: bonded ? elColor : '#ffffff', transparent: true, opacity: bonded ? 0.85 : 0.25, side: THREE.DoubleSide }), { cast: false });
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      g.add(ring);
    }
    const tag = label(isPlayer ? `${name} (you)` : name, isPlayer ? '#ffe28a' : '#ffffff');
    tag.position.y = 2.45;
    g.add(tag);
    return rig;
  }

  function spiritMesh(element, color, stage) {
    const geo = { earth: new THREE.DodecahedronGeometry(0.4, 0), fire: new THREE.OctahedronGeometry(0.42, 0), water: new THREE.IcosahedronGeometry(0.4, 1), air: new THREE.TetrahedronGeometry(0.48, 0) }[element];
    const g = new THREE.Group();
    const core = mesh(geo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1, flatShading: true, transparent: element === 'water', opacity: 0.85 }), { cast: false });
    g.add(core);
    const halo = mesh(new THREE.TorusGeometry(0.62, 0.025, 6, 32), glow(color, 1.5), { cast: false });
    halo.rotation.x = Math.PI / 2.4;
    g.add(halo);
    g.scale.setScalar(0.65 + stage * 0.22);
    g.userData = { core, halo };
    return g;
  }

  // ---------- buildings ----------
  const SLOTS = [-2.0, -1.15, -2.75, -0.35, 2.85, 0.35].map((a) => [Math.cos(a) * 10, Math.sin(a) * 10]);
  const BUILD = {
    longhouse(c) {
      const g = new THREE.Group();
      const body = mesh(new THREE.BoxGeometry(4, 1.6, 2.4), mat('#8b4a2b'));
      body.position.y = 0.8;
      const roof = mesh(new THREE.CylinderGeometry(1.6, 1.6, 4.3, 3), mat('#5a3a28'));
      roof.rotation.z = Math.PI / 2;
      roof.rotation.x = Math.PI / 2;
      roof.position.y = 2.15;
      roof.scale.set(1, 1, 0.75);
      const door = mesh(new THREE.BoxGeometry(0.7, 1.1, 0.05), mat('#2b1a10'));
      door.position.set(0, 0.55, 1.22);
      const crest = mesh(new THREE.CircleGeometry(0.35, 6), glow(c, 1));
      crest.position.set(0, 1.35, 1.23);
      g.add(body, roof, door, crest);
      return g;
    },
    watchtower() {
      const g = new THREE.Group();
      [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]].forEach(([x, z]) => {
        const p = mesh(new THREE.CylinderGeometry(0.09, 0.12, 4, 5), mat('#6b4a2e'));
        p.position.set(x, 2, z);
        g.add(p);
      });
      const deck = mesh(new THREE.BoxGeometry(2, 0.2, 2), mat('#7b5636'));
      deck.position.y = 4;
      const roof = mesh(new THREE.ConeGeometry(1.6, 1.2, 4), mat('#4b3424'));
      roof.position.y = 5.2;
      roof.rotation.y = Math.PI / 4;
      g.add(deck, roof);
      return g;
    },
    stones(c) {
      const g = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const s = mesh(new THREE.BoxGeometry(0.45, 1.4 + (i % 3) * 0.35, 0.3), new THREE.MeshStandardMaterial({ color: '#80868a', emissive: c, emissiveIntensity: 0.25, flatShading: true }));
        s.position.set(Math.cos(a) * 1.5, 0.7, Math.sin(a) * 1.5);
        s.rotation.y = -a;
        g.add(s);
      }
      return g;
    },
    garden() {
      const g = new THREE.Group();
      const bed = mesh(new THREE.BoxGeometry(3, 0.3, 2), mat('#5b3f2a'));
      bed.position.y = 0.15;
      g.add(bed);
      for (let i = 0; i < 8; i++) {
        const b = mesh(new THREE.IcosahedronGeometry(0.3, 0), mat(i % 3 ? '#4d8a3e' : '#3f7a35'));
        b.position.set(-1.1 + (i % 4) * 0.75, 0.5, -0.45 + Math.floor(i / 4) * 0.9);
        g.add(b);
        if (i % 2) { const berry = mesh(new THREE.SphereGeometry(0.07, 6, 4), mat('#c0304a'), { cast: false }); berry.position.set(b.position.x + 0.2, 0.62, b.position.z + 0.15); g.add(berry); }
      }
      return g;
    },
    lighthouse() {
      const g = new THREE.Group();
      const t = mesh(new THREE.CylinderGeometry(0.55, 0.85, 4.5, 10), mat('#f1efe8'));
      t.position.y = 2.25;
      const band = mesh(new THREE.CylinderGeometry(0.66, 0.7, 0.6, 10), mat('#b8402f'));
      band.position.y = 2.6;
      const lamp = mesh(new THREE.SphereGeometry(0.42, 10, 8), glow('#ffe58a', 2.4), { cast: false });
      lamp.position.y = 4.85;
      const cap = mesh(new THREE.ConeGeometry(0.6, 0.6, 10), mat('#3a3a3a'));
      cap.position.y = 5.5;
      g.add(t, band, lamp, cap);
      return g;
    },
    observatory() {
      const g = new THREE.Group();
      const base = mesh(new THREE.CylinderGeometry(1.4, 1.5, 1.6, 12), mat('#c9c3b6'));
      base.position.y = 0.8;
      const dome = mesh(new THREE.SphereGeometry(1.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#9aa4ad', { metalness: 0.4, roughness: 0.4 }));
      dome.position.y = 1.6;
      const slit = mesh(new THREE.BoxGeometry(0.35, 1.2, 0.2), mat('#1d2630'));
      slit.position.set(0, 2.3, 1.15);
      slit.rotation.x = -0.6;
      g.add(base, dome, slit);
      return g;
    },
  };

  // ---------- rain ----------
  const RAIN_N = 1400;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RAIN_N * 3);
  for (let i = 0; i < RAIN_N; i++) { rainPos[i * 3] = (rng() - 0.5) * 60; rainPos[i * 3 + 1] = rng() * 25; rainPos[i * 3 + 2] = (rng() - 0.5) * 60; }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: '#b9cdd8', size: 0.09, transparent: true, opacity: 0.65 }));
  rain.visible = false;
  scene.add(rain);

  // ---------- sky ----------
  let lastSkyMin = -1;
  function seattleHour() {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
    const h = Number(p.find((x) => x.type === 'hour').value) % 24;
    const m = Number(p.find((x) => x.type === 'minute').value);
    return h + m / 60;
  }
  function updateSky(force) {
    const h = seattleHour();
    const min = Math.floor(h * 60);
    if (!force && min === lastSkyMin) return;
    lastSkyMin = min;
    const s = Math.sin(((h - 6.5) / 12) * Math.PI);
    const day = Math.max(0, Math.min(1, (s + 0.15) / 0.55));
    const dusk = Math.max(0, 1 - Math.abs(s - 0.05) / 0.25) * 0.6;
    const night = new THREE.Color('#0c1626');
    const noon = new THREE.Color(rain.visible ? '#97a5ad' : '#8dbad6');
    const sky = night.clone().lerp(noon, day).lerp(new THREE.Color('#e3936a'), rain.visible ? dusk * 0.3 : dusk);
    scene.background = sky;
    scene.fog = new THREE.Fog(sky, rain.visible ? 45 : 70, rain.visible ? 170 : 240);
    hemi.intensity = 0.22 + 0.55 * day;
    sun.intensity = (rain.visible ? 0.35 : 0.95) * Math.max(0.12, day);
    sun.color.set(dusk > 0.3 ? '#ffc79a' : day > 0.2 ? '#fff1d6' : '#9fb6ff');
    const ang = ((h - 6) / 24) * Math.PI * 2;
    sun.position.set(Math.cos(ang) * -40, Math.max(8, Math.sin(ang) * 50 + 20), -25);
    fireLight.intensity = 1.1 + (1 - day) * 2.2;
    state.hour = h;
    state.isNight = day < 0.25;
  }
  const state = { hour: 12, isNight: false };

  // ---------- model sync ----------
  let sig = '';
  function update(model) {
    const nextSig = JSON.stringify([model.player, model.kin, model.buildings, model.banner, model.clanColor, model.spiritStage]);
    applyTotem(model.totem, model.clanColor);
    if (nextSig === sig) return;
    sig = nextSig;
    // player
    if (player) scene.remove(player.group);
    player = avatar({ ...model.player, isPlayer: true, elColor: model.player.elColor, bonded: model.player.bonded });
    player.group.position.copy(playerPos);
    player.group.rotation.y = playerYaw;
    scene.add(player.group);
    // spirit
    if (spirit) scene.remove(spirit);
    spirit = spiritMesh(model.player.element, model.player.elColor, model.spiritStage);
    spirit.position.copy(playerPos).add(new THREE.Vector3(1, 2, 0));
    scene.add(spirit);
    // kin around the fire
    dyn.kin.clear();
    const KIN_ANGLES = [20, 160, 200, 340, 50, 130, 235, 305, 0, 180].map((d) => (d * Math.PI) / 180);
    kinRigs = model.kin.map((k, i) => {
      const a = KIN_ANGLES[i % KIN_ANGLES.length];
      const rad = i < KIN_ANGLES.length ? 3.3 : 4.6;
      const r = avatar({ ...k, isPlayer: false });
      r.group.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
      r.group.lookAt(0, 0, 0);
      r.phase = i * 1.7;
      dyn.kin.add(r.group);
      return r;
    });
    // buildings
    dyn.buildings.clear();
    model.buildings.forEach((id, i) => {
      const slot = SLOTS[i % SLOTS.length];
      const b = BUILD[id]?.(model.clanColor);
      if (!b) return;
      b.position.set(slot[0], height(slot[0], slot[1]), slot[1]);
      b.lookAt(0, b.position.y, 0);
      dyn.buildings.add(b);
    });
    // extras
    dyn.extras.clear();
    if (model.banner) {
      const pole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 5), mat('#ddd'));
      pole.position.set(2.6, 1.6, -2.2);
      const flag = mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshStandardMaterial({ color: model.clanColor, side: THREE.DoubleSide, flatShading: true }));
      flag.position.set(3.15, 2.85, -2.2);
      dyn.extras.add(pole, flag);
      dyn.extras.userData.flag = flag;
    }
  }

  function applyTotem(t, clanColor) {
    if (!t) return;
    ELS.forEach((e) => {
      const b = totemBlocks[e];
      b.material.color.set(t.colors[e]);
      b.material.emissive.set(t.colors[e]);
      b.material.emissiveIntensity = 0.04 + Math.min(1, t.fill[e]) * 0.55;
    });
    crystal.material.color.set(clanColor);
    crystal.material.emissive.set(clanColor);
    crystal.material.emissiveIntensity = 0.4 + t.pct * 1.6;
    crystal.scale.setScalar(0.6 + t.pct * 0.9);
    awakenRing.visible = !!t.awakened;
  }

  // ---------- controls ----------
  let theta = 0, phi = 1.02, dist = 13;
  const camTarget = new THREE.Vector3(0, 1, 3);
  const pointers = new Map();
  let dragMoved = 0;
  let pinchStart = 0, distStart = dist;
  const keys = new Set();
  const ray = new THREE.Raycaster();

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragMoved = 0;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchStart = Math.hypot(a.x - b.x, a.y - b.y); distStart = dist; }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart) dist = clampN(distStart * (pinchStart / d), 6, 34);
      dragMoved = 99;
      return;
    }
    dragMoved += Math.abs(dx) + Math.abs(dy);
    theta -= dx * 0.008;
    phi = clampN(phi - dy * 0.006, 0.35, 1.42);
  });
  const end = (e) => {
    const was = pointers.has(e.pointerId);
    pointers.delete(e.pointerId);
    if (was && dragMoved < 6 && pointers.size === 0) {
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(ground)[0];
      if (hit) {
        const p = hit.point;
        const r = Math.hypot(p.x, p.z);
        const k = r > 22 ? 22 / r : 1;
        walkTarget = new THREE.Vector3(p.x * k, 0, p.z * k);
      }
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); dist = clampN(dist * (1 + e.deltaY * 0.001), 6, 34); }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); e.preventDefault(); walkTarget = null; }
  });
  canvas.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  canvas.addEventListener('blur', () => keys.clear());

  // ---------- loop ----------
  let raf = 0, container = null, ro = null;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;
    updateSky(false);

    // movement
    let mx = 0, mz = 0;
    if (keys.has('w') || keys.has('arrowup')) mz -= 1;
    if (keys.has('s') || keys.has('arrowdown')) mz += 1;
    if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
    if (keys.has('d') || keys.has('arrowright')) mx += 1;
    let moving = false;
    const speed = 5.5;
    if (mx || mz) {
      const len = Math.hypot(mx, mz);
      const fx = Math.sin(theta), fz = Math.cos(theta);
      const vx = (mx * fz + mz * fx) / len, vz = (-mx * fx + mz * fz) / len;
      playerPos.x += vx * speed * dt; playerPos.z += vz * speed * dt;
      playerYaw = Math.atan2(vx, vz);
      moving = true;
    } else if (walkTarget) {
      const dx = walkTarget.x - playerPos.x, dz = walkTarget.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.15) {
        const step = Math.min(d, speed * dt);
        playerPos.x += (dx / d) * step; playerPos.z += (dz / d) * step;
        playerYaw = Math.atan2(dx, dz);
        moving = true;
      } else walkTarget = null;
    }
    const r = Math.hypot(playerPos.x, playerPos.z);
    if (r > 22) { playerPos.x *= 22 / r; playerPos.z *= 22 / r; }
    if (r < 1.5) { const k = 1.5 / Math.max(r, 0.01); playerPos.x *= k; playerPos.z *= k; }
    const dT = Math.hypot(playerPos.x - totem.position.x, playerPos.z - totem.position.z);
    if (dT < 1.1) { playerPos.x = totem.position.x + ((playerPos.x - totem.position.x) / dT) * 1.1; playerPos.z = totem.position.z + ((playerPos.z - totem.position.z) / dT) * 1.1; }
    playerPos.y = Math.max(0, height(playerPos.x, playerPos.z));

    if (player) {
      player.group.position.copy(playerPos);
      const cur = player.group.rotation.y;
      let diff = playerYaw - cur;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      player.group.rotation.y = cur + diff * Math.min(1, dt * 10);
      walkPhase = moving ? walkPhase + dt * 11 : walkPhase * 0.85;
      const sw = Math.sin(walkPhase) * (moving ? 0.65 : 0);
      player.legs[0].rotation.x = sw; player.legs[1].rotation.x = -sw;
      player.arms[0].rotation.x = -sw * 0.8; player.arms[1].rotation.x = sw * 0.8;
      if (player.aura) player.aura.rotation.y = t * 1.2;
    }
    if (spirit) {
      const off = new THREE.Vector3(Math.sin(t * 0.7) * 1.2 + 0.9, 2.1 + Math.sin(t * 2) * 0.18, Math.cos(t * 0.7) * 0.6);
      spirit.position.lerp(playerPos.clone().add(off), Math.min(1, dt * 3));
      if (!reduced) { spirit.userData.core.rotation.y += dt * 1.4; spirit.userData.halo.rotation.z += dt * 0.8; }
    }
    kinRigs.forEach((k) => {
      k.group.position.y = Math.abs(Math.sin(t * 1.3 + k.phase)) * 0.04;
      k.arms[1].rotation.x = Math.sin(t * 0.9 + k.phase) > 0.92 ? -2.4 : -0.1;
      if (k.aura) k.aura.rotation.y = t;
    });
    if (!reduced) {
      flame.scale.set(1 + Math.sin(t * 13) * 0.08, 1 + Math.sin(t * 9) * 0.15, 1 + Math.cos(t * 11) * 0.08);
      fireLight.intensity += Math.sin(t * 17) * 0.05;
      crystal.rotation.y += dt * 0.9;
      crystal.position.y = 4.2 + Math.sin(t * 1.6) * 0.12;
      awakenRing.rotation.z += dt * 0.6;
      water.position.y = -0.45 + Math.sin(t * 0.8) * 0.03;
      const flag = dyn.extras.userData.flag;
      if (flag) flag.rotation.y = Math.sin(t * 2) * 0.25;
    }
    if (rain.visible) {
      const arr = rainGeo.attributes.position.array;
      for (let i = 0; i < RAIN_N; i++) {
        arr[i * 3 + 1] -= 20 * dt;
        if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 25;
      }
      rainGeo.attributes.position.needsUpdate = true;
      rain.position.set(camTarget.x, 0, camTarget.z);
    }

    // camera
    camTarget.lerp(new THREE.Vector3(playerPos.x, playerPos.y + 1, playerPos.z), Math.min(1, dt * 4));
    camera.position.set(
      camTarget.x + dist * Math.sin(phi) * Math.sin(theta),
      camTarget.y + dist * Math.cos(phi),
      camTarget.z + dist * Math.sin(phi) * Math.cos(theta),
    );
    camera.lookAt(camTarget);
    sun.target.position.copy(camTarget);
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
    mount(el) {
      container = el;
      el.appendChild(canvas);
      ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();
      clock.getDelta();
      cancelAnimationFrame(raf);
      frame();
    },
    unmount() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro?.disconnect();
      canvas.remove();
      container = null;
      keys.clear();
    },
    update,
    setRain(on) { rain.visible = !!on; updateSky(true); },
    get rain() { return rain.visible; },
    resetCamera() { theta = 0; phi = 1.02; dist = 13; },
    walkTo(x, z) { walkTarget = new THREE.Vector3(x, 0, z); },
    get timeOfDay() { return state; },
  };
}

function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function clampN(n, a, b) { return Math.max(a, Math.min(b, n)); }
function roundRect(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
function mulberry(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

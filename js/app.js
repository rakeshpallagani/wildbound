// Wildbound — UI layer (vanilla JS modules, no build step).
import { ASPECTS, ASPECT_IDS, AFFINITY, ACTIVITIES, INTENSITY, EXPEDITIONS, BADGES, AWAKENING, POWERS, VIGIL, VIGILS, SHOP, HOME, CLAN_LEVELS, VIGIL_MIN_LEVEL, HOST_MIN_LEVEL, SPOTS, GATHERING } from './data.js';
import { haversineM } from './geo.js';
import * as G from './engine.js';
import * as store from './store.js';
import { SOURCES, fetchRecent } from './sync.js';
import { createMap3D } from './map3d.js';
import { createTracker, locateOnce, gpsSupported, locationPermission } from './tracker.js';
import { createGoogle3D } from './gmaps.js';
import { createBackend, readConfig, saveConfig, mergeWorld, remoteMsg } from './backend.js';

const bind = {};
let state = store.load();
let tab = 'map';
let ranksTab = 'clans';
let onboard = { primary: null, secondary: null };
let map = null, mapFailed = false, gmap = null;
const freshDraft = () => ({ type: null, when: 'today', minutes: 30, distance: '', steps: '', elev: '', intensity: 'moderate', place: '', note: '' });
let draft = freshDraft();
let chatChannel = null;
let radiusMi = 3;
let autoGpsTried = false;
let gpsIssue = null; // { code, message } from the last failed location attempt
const backend = createBackend({ onChange: onBackendChange });

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const now = () => G.worldNow(state);
const GMAPS_KEY = 'wildbound:gmapsKey';
const readKey = () => { try { return localStorage.getItem(GMAPS_KEY) || ''; } catch { return ''; } };

// ---------- units ----------
const imperial = () => (state.settings?.units || 'mi') === 'mi';
const num = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString(undefined, { maximumFractionDigits: d });
const dist = (km, d = 1) => (imperial() ? `${num(km / G.KM_PER_MI, d)} mi` : `${num(km, d)} km`);
const distNum = (km, d = 1) => (imperial() ? num(km / G.KM_PER_MI, d) : num(km, d));
const dUnit = () => (imperial() ? 'mi' : 'km');
const meters = (m) => (imperial() ? (m < 300 ? `${Math.round(m * 3.28084)} ft` : `${num(m / 1609.344, 1)} mi`) : (m < 1000 ? `${Math.round(m)} m` : `${num(m / 1000, 1)} km`));
const eUnit = () => (imperial() ? 'ft' : 'm');
const fmtDay = (d, o = { weekday: 'short', month: 'short', day: 'numeric' }) => new Date(d).toLocaleDateString(undefined, o);
const fmtTime = (d) => new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const SKINS = ['#f1c7a5', '#d9a37e', '#b97c55', '#8d5a3b', '#6b4430', '#e8b896'];
const OUTFITS = ['#3f6f8f', '#7a4f9a', '#b5523b', '#3e7d57', '#c08a2e', '#2f3b52'];
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const aspectOf = (id) => ASPECTS[id] || ASPECTS.mistwalker;
const lum = (n) => `<span class="lum">✦ ${Math.round(n).toLocaleString()}</span>`;

function save() { store.save(state); }
function commit(events = []) { save(); render(); announce(events); syncOut(events); }

// ---------- backend sync (no-ops when offline) ----------
const remoteClan = () => { const c = G.playerClan(state); return c?.remote ? c : null; };
async function remoteTry(fn, quiet = false) {
  if (!backend.online) return null;
  try { return await fn(); } catch (err) { if (!quiet) toast(`Sync failed: ${esc(err.message)}`, 'bad'); return null; }
}
function syncOut(events) {
  if (!backend.online) return;
  const rc = remoteClan();
  for (const a of state.activities) {
    if (a.synced) continue;
    a.synced = 'pending';
    remoteTry(() => backend.logActivity(a, rc?.id)).then((ok) => { a.synced = ok === null ? false : true; save(); });
  }
  for (const e of events) {
    if (e.type === 'sent' && rc) { const band = e.channel.includes('/') ? e.channel.split('/')[1] : null; remoteTry(() => backend.sendMessage(rc.id, band, e.msg.text)); }
    if (e.type === 'rally' && rc) remoteTry(() => backend.sendMessage(rc.id, null, '🔥 Rally! Who\'s moving today? Let\'s get everyone Bonded.', 'rally'));
    if ((e.type === 'band-joined' || e.type === 'band-left') && rc) remoteTry(() => backend.setBand(e.band.id, e.type === 'band-joined'));
    if (e.type === 'band-created' && rc) remoteTry(async () => { await backend.createBand(rc.id, e.band, G.spotById(e.band.spotId)); await pullAndMerge(); });
    if (e.type === 'hosted' && rc) remoteTry(async () => { await backend.hostGathering(e.g, G.spotById(e.g.spotId)); state.gatherings = state.gatherings.filter((g) => g.id !== e.g.id); await pullAndMerge(); });
    if ((e.type === 'rsvp' || e.type === 'attended') && e.g.remote) remoteTry(() => backend.rsvp(e.g.id, e.g.attended ? 'attended' : e.g.rsvp ? 'going' : null));
  }
}
async function pullAndMerge() {
  const w = await backend.pullWorld();
  mergeWorld(state, w);
  backend.subscribe(remoteClan()?.id || null);
  save();
  refreshQuiet();
}
// Re-render without tearing down the map while walking.
function refreshQuiet() {
  renderChip();
  if (tab === 'map' && map) { map.update(mapModel()); renderPanel(); renderList(); } else render();
}
async function onBackendChange(ev) {
  if (ev.type === 'auth') { if (backend.online && state.player) { await remoteTry(() => backend.saveProfile(state.player)); await remoteTry(pullAndMerge); } render(); }
  if (ev.type === 'repull') remoteTry(pullAndMerge, true);
  if (ev.type === 'message') {
    const rc = remoteClan();
    if (!rc || ev.row.user_id === backend.user?.id) return;
    const ch = ev.row.band_id ? `${rc.id}/${ev.row.band_id}` : rc.id;
    (state.chat[ch] = state.chat[ch] || []).push(remoteMsg(ev.row, rc, backend.user.id));
    save();
    if (tab === 'chat') render(); else toast(`💬 ${esc(rc.members.find((m) => m.userId === ev.row.user_id)?.name || 'Kin')}: ${esc(ev.row.body.slice(0, 60))}`);
  }
}

function armConfirm(btn, text, action) {
  if (btn.dataset.armed) { action(); return; }
  const orig = btn.textContent;
  btn.dataset.armed = '1'; btn.textContent = text; btn.classList.add('danger');
  setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = orig; btn.classList.remove('danger'); } }, 3500);
}

// ---------- toasts ----------
function toast(html, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = html;
  const box = $('#toasts');
  box.appendChild(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => el.classList.add('out'), 4600);
  setTimeout(() => el.remove(), 5200);
}
function announce(events) {
  const out = [];
  const lore = events.filter((e) => e.type === 'lore' && !e.quiet).map((e) => e.name);
  const trials = events.filter((e) => e.type === 'trial');
  for (const e of events) {
    if (e.quiet) continue;
    const P = (pri, html, kind = '') => out.push([pri, html, kind]);
    switch (e.type) {
      case 'awaken': P(0, `⚡ <b>Your clan AWAKENED!</b> ${e.power.icon} ${esc(e.power.name)}, +${AWAKENING.seals} Vigil Seals, +${AWAKENING.lumens} ✦`, 'epic'); break;
      case 'claimed': P(0, `🔱 <b>${esc(e.site.name)}</b> is now your clan's vigil! +${e.site.yield} ✦/day each`, 'epic'); break;
      case 'lost': P(0, `💔 ${esc(e.by.name)} broke your vigil at <b>${esc(e.site.name)}</b>`, 'bad'); break;
      case 'journey': P(0, `🏔️ Journey complete: <b>${esc(e.route.name)}</b>! +200 XP`, 'epic'); break;
      case 'evolve': { const a = aspectOf(state.player.primary); P(0, `✨ ${a.spirit.name} evolved into <b>${a.stages[e.stage]}</b>!`, 'epic'); break; }
      case 'siege': P(1, `⚔️ −${e.dmg} ward on ${esc(e.rival.name)}'s vigil at <b>${esc(e.site.name)}</b>${e.ward > 0 ? ` (${e.ward} left)` : ''}`, 'good'); break;
      case 'fortify': P(1, `🛡️ +${e.add} ward at <b>${esc(e.site.name)}</b> (${e.ward}/${VIGIL.maxWard})`, 'good'); break;
      case 'opened': P(1, `${esc(e.site.name)} has fallen open. You need a Vigil Seal to claim it.`); break;
      case 'attacked': P(1, `⚠️ ${esc(e.by.name)} sieged your vigil at <b>${esc(e.site.name)}</b>`, 'bad'); break;
      case 'tribute': P(1, `✦ Tribute from your vigils: <b>+${e.lumens}</b>`, 'good'); break;
      case 'tier': P(1, `🔥 Clan gauge <b>${e.tier.name}</b>: +${e.tier.reward} XP`, 'good'); break;
      case 'badge': P(1, `${e.badge.icon} <b>${esc(e.badge.name)}</b>. New gear: ${esc(e.badge.gear)}`, 'good'); break;
      case 'week': P(1, `📅 New week. Last week your clan reached ${Math.round(e.result.pct * 100)}%${e.result.awakened ? ' and awakened ⚡' : ''}.`); break;
      case 'bought': P(1, `${e.item.icon} <b>${esc(e.item.name)}</b> acquired`, 'good'); break;
      case 'equip': P(2, `${e.item.icon} ${esc(e.item.name)} equipped`); break;
      case 'logged': P(2, `+${e.entry.essence} XP · +${dist(e.entry.trailKm)} for the clan${e.entry.affinity ? ` <b>(×${e.entry.affinityMult})</b>` : ''}`); break;
      case 'imported': P(2, e.count ? `${SOURCES[e.source].name}: imported ${e.count} activit${e.count === 1 ? 'y' : 'ies'}` : `${SOURCES[e.source].name}: up to date`, 'good'); break;
      case 'rally': P(2, '🔥 Rally sent. Sleepy kin are more likely to move today.'); break;
      case 'cheer': P(3, `👏 +${e.amt} XP for cheering`); break;
      case 'rsvp': P(2, e.g.rsvp ? `📅 You're going to <b>${esc(e.g.title)}</b>` : 'RSVP removed'); break;
      case 'attended': P(0, `🤝 Checked in at <b>${esc(e.g.title)}</b>: +${GATHERING.essence} XP, +${GATHERING.lumens} ✦, +${GATHERING.clanXp} clan XP`, 'epic'); break;
      case 'hosted': P(0, `📍 <b>${esc(e.g.title)}</b> is on the map. Your kin have been told.`, 'good'); break;
    }
  }
  if (lore.length) out.push([1, lore.length === 1 ? `📜 Lore unlocked: <b>${esc(lore[0])}</b>` : `📜 ${lore.length} lore entries unlocked`, 'lore']);
  if (trials.length) out.push([2, trials.length === 1 ? `✅ ${esc(trials[0].trial.text)} <b>+${trials[0].trial.reward}</b>` : `✅ ${trials.length} trials complete <b>+${trials.reduce((s, t) => s + t.trial.reward, 0)}</b>`, 'good']);
  out.sort((a, b) => a[0] - b[0]).slice(0, 3).reverse().forEach(([, h, k]) => toast(h, k));
}

// ---------- shell ----------
function render() {
  map?.unmount();
  if (gmap) { gmap.destroy(); gmap = null; }
  const p = state.player;
  document.body.style.setProperty('--accent', p ? aspectOf(p.primary).color : '#e3c46f');
  const nav = $('#tabs');
  nav.hidden = !p;
  nav.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  renderChip();
  if (!p) { view.innerHTML = onboardingView(); bindOnboarding(); return; }
  const views = { map: mapView, log: logView, clan: clanView, chat: chatView, ranks: ranksView, me: meView };
  view.classList.toggle('wide', tab === 'map');
  view.innerHTML = views[tab]();
  bind[tab]?.();
  if (tab !== 'chat') window.scrollTo({ top: 0 });
}
function renderChip() {
  const chip = $('#player-chip');
  if (!state.player) { chip.innerHTML = ''; return; }
  const a = aspectOf(state.player.primary);
  const pr = G.spiritProgress(G.totalEssence(state));
  const demo = state.dayOffset ? `<span class="demo-pill">Demo: ${fmtDay(now())}</span>` : '';
  chip.innerHTML = `${demo}${lum(state.lumens)}<button class="chip-btn" data-go="me" title="Your spirit, shop, gear and settings"><span class="chip-glyph">${a.spirit.glyph}</span><span><b>${esc(state.player.name)}</b><small>Lv ${pr.level} · ${G.totalEssence(state).toLocaleString()} XP${backend.online ? ' · ☁︎' : ''}</small></span></button>`;
}
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) { tab = b.dataset.tab; render(); } });
document.addEventListener('click', (e) => { const go = e.target.closest('[data-go]'); if (go) { tab = go.dataset.go; render(); } });

// ---------- onboarding ----------
function aspectCard(a, picked, attr) {
  const acts = Object.entries(ACTIVITIES).filter(([, x]) => x.aspect === a.id).map(([, x]) => `<span>${x.icon} ${x.label}</span>`).join('');
  return `<button class="element-card ${picked ? 'picked' : ''}" ${attr}="${a.id}" style="--c:${a.color}">
    <div class="element-glyph">${a.spirit.glyph}</div>
    <div class="element-name">${a.name}</div>
    <div class="element-motto">${a.motto}</div>
    <div class="element-spirit">${a.domain} · ${a.spirit.name}, the ${a.spirit.kind}</div>
    <div class="affinity">${acts}</div>
  </button>`;
}
function onboardingView() {
  return `
  <section class="hero compact">
    <div class="eyebrow">Wildbound · ${esc(HOME.city)}</div>
    <h1>Move together.</h1>
    <p class="lead">Pick the spirit that matches how you move. Next, you'll find clans and gatherings near you on the map.</p>
  </section>
  <section class="card">
    <h2>Your primary Aspect</h2>
    <p class="muted small">Your spirit grows ×${AFFINITY.primary} from these. Everything you do still counts for your clan.</p>
    <div class="element-grid">${Object.values(ASPECTS).map((a) => aspectCard(a, onboard.primary === a.id, 'data-primary')).join('')}</div>
    <h3>Also into… <small class="muted">(optional, ×${AFFINITY.secondary})</small></h3>
    <div class="chips aspect-chips">${Object.values(ASPECTS).map((a) => `<button class="chip ${onboard.secondary === a.id ? 'on' : ''}" data-secondary="${a.id}" ${onboard.primary === a.id ? 'disabled' : ''} style="--c:${a.color}">${a.spirit.glyph} ${a.name} <small>${a.domain}</small></button>`).join('')}</div>
    <form id="onboard-form" class="row onboard-name">
      <input id="pname" maxlength="24" placeholder="Your trail name" autocomplete="nickname" required />
      <button class="btn primary" type="submit">Find clans near me →</button>
    </form>
    <p id="onboard-err" class="err"></p>
  </section>`;
}
function bindOnboarding() {
  const keep = (f) => () => { const n = $('#pname').value; f(); render(); $('#pname').value = n; };
  view.querySelectorAll('[data-primary]').forEach((b) => b.addEventListener('click', keep(() => { onboard.primary = b.dataset.primary; if (onboard.secondary === onboard.primary) onboard.secondary = null; })));
  view.querySelectorAll('[data-secondary]').forEach((b) => b.addEventListener('click', keep(() => { onboard.secondary = onboard.secondary === b.dataset.secondary ? null : b.dataset.secondary; })));
  $('#onboard-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!onboard.primary) { $('#onboard-err').textContent = 'Choose a primary Aspect first.'; return; }
    G.createPlayer(state, { name: $('#pname').value, ...onboard });
    state.player.avatar = { outfit: OUTFITS[hash(state.player.name) % OUTFITS.length], skin: SKINS[1] };
    tab = 'map'; mapLayer = 'clans'; sel = null;
    commit();
    remoteTry(async () => { await backend.saveProfile(state.player); await pullAndMerge(); }, true);
    const sp = aspectOf(onboard.primary).spirit;
    toast(`${sp.glyph} ${sp.name} has bound to you. Tap a clan Hearth to meet them.`, 'epic');
  });
}

// ---------- shared pieces ----------
function gauge(st, big = false) {
  let used = 0;
  const segs = ASPECT_IDS.map((a) => {
    const w = Math.max(0, Math.min(100 - used, ((st.energy[a] || 0) / st.target) * 100));
    used += w;
    return w > 0 ? `<i style="width:${w}%;background:${ASPECTS[a].color}" title="${ASPECTS[a].name}: ${dist(st.energy[a])}"></i>` : '';
  }).join('');
  return `<div class="gauge ${big ? 'big' : ''}">${segs}${AWAKENING.tiers.slice(0, 2).map((t) => `<b class="mark" style="left:${t.at * 100}%"></b>`).join('')}</div>`;
}
function tierPill(st) {
  if (st.awakened) return '<span class="pill awakened">⚡ Awakened</span>';
  if (st.tier) return `<span class="pill">${st.tier.name}</span>`;
  return '<span class="pill dim">Dormant</span>';
}
function dayDots(days, today) {
  return `<span class="dots">${DAYS.map((d, i) => `<i class="${days.includes(i) ? 'on' : ''} ${i === today ? 'today' : ''}">${d}</i>`).join('')}</span>`;
}
const daysLeft = () => 6 - G.weekdayIdx(now());
function clanColor(clan) { return clan ? aspectOf(clan.aspect).color : null; }
function wardBar(ward, color) { return `<span class="ward"><i style="width:${Math.round((ward / VIGIL.maxWard) * 100)}%;background:${color || 'var(--muted)'}"></i></span>`; }

// ---------- MAP (clans · gatherings · vigils) ----------
let mapLayer = 'gatherings';
let sel = null; // { kind: 'clan' | 'gathering' | 'vigil', id }
const tracker = createTracker({
  onFix: (p) => { state.player.pos = { lat: p.lat, lon: p.lon }; map?.setPlayer(p.lat, p.lon); gmap?.setPlayer(p.lat, p.lon); onPositionChanged(); },
  onPoints: (pts) => { map?.setTrack(pts); gmap?.setTrack(pts); updateTrekBar(); },
  onError: (msg) => toast(esc(msg), 'bad'),
});
let lastSave = 0;
function onPositionChanged() {
  const ev = G.visitIfNear(state);
  if (ev.length) announce(ev);
  if (Date.now() - lastSave > 2000) { save(); lastSave = Date.now(); }
  renderPanel();
  renderList();
  const yp = $('#you-pill'); if (yp) yp.textContent = youPill();
}
const metersTo = (p) => haversineM(state.player.pos, p);
const upcoming = () => (state.gatherings || []).filter((g) => g.day >= G.dayKey(now()));
const gDay = (g) => G.fmtGDay(g.day, now());
const matchesMe = (type) => [state.player.primary, state.player.secondary].includes(ACTIVITIES[type].aspect);
function vigilModel() {
  const mine = state.clanId;
  return VIGILS.map((site) => {
    const vs = G.vigilState(state, site.id);
    const color = clanColor(vs.holderClan);
    return {
      id: site.id, lat: site.lat, lon: site.lon, ward: vs.ward, color, mine: vs.holder === mine && !!mine,
      shielded: !!vs.shieldUntil && G.dayKey(now()) <= vs.shieldUntil, selected: sel?.kind === 'vigil' && sel.id === site.id,
      label: vs.holderClan ? `${site.name} · ${vs.holderClan.name}` : `${site.name} · open`,
    };
  });
}
function mapModel() {
  const clan = G.playerClan(state);
  const a = aspectOf(state.player.primary);
  const av = state.player.avatar || {};
  const aura = SHOP.find((i) => i.id === state.inventory.aura);
  return {
    vigils: vigilModel(),
    showVigils: mapLayer === 'vigils',
    hubs: state.clans.map((c) => ({ id: c.id, name: c.name, lat: c.hub.lat, lon: c.hub.lon, color: clanColor(c), glyph: aspectOf(c.aspect).spirit.glyph, level: G.clanLevel(c).level, mine: c.id === state.clanId, selected: sel?.kind === 'clan' && sel.id === c.id })),
    gatherings: nearbyGatherings().slice(0, 18).map((g) => { const sp = G.spotById(g.spotId); return { id: g.id, spotId: g.spotId, lat: sp.lat, lon: sp.lon, icon: ACTIVITIES[g.type].icon, when: `${gDay(g)} ${g.time}`, color: clanColor(G.clanById(state, g.clanId)), going: g.rsvp, highlight: matchesMe(g.type) }; }),
    avatar: { color: av.outfit || OUTFITS[0], skin: av.skin || SKINS[1], gear: state.badges, aspectColor: clan ? clanColor(clan) : a.color },
    spirit: { aspect: state.player.primary, color: a.color, stage: G.spiritProgress(G.totalEssence(state)).stage, aura: aura?.color || null },
  };
}
function defaultSel() {
  if (sel) return sel;
  if (mapLayer === 'clans') {
    const c = [...state.clans].sort((x, y) => (y.aspect === state.player.primary) - (x.aspect === state.player.primary) || metersTo(x.hub) - metersTo(y.hub))[0];
    return { kind: 'clan', id: (G.playerClan(state) || c).id };
  }
  if (mapLayer === 'gatherings') { const g = upcoming()[0]; return g ? { kind: 'gathering', id: g.id } : null; }
  return { kind: 'vigil', id: G.nearestVigil(state).site.id };
}
function mapView() {
  const live = tracker.mode === 'gps';
  const clan = G.playerClan(state);
  const layer = (id, label, n) => `<button class="${mapLayer === id ? 'active' : ''}" data-layer="${id}">${label}${n != null ? ` <small>${n}</small>` : ''}</button>`;
  return `
  ${clan ? '' : '<section class="card intro-strip"><b>Find your people.</b> Each glowing Hearth is a clan\'s home base. Tap one to meet them, or browse gatherings happening nearby.</section>'}
  <section class="world-wrap map-wrap">
    <div id="map" class="world"></div>
    <div class="hud tl"><div class="segmented map-layers">${layer('gatherings', '📍 Activities', nearbyGatherings().length)}${layer('clans', clan ? '⚔️ Rivals' : '🔥 Clans', state.clans.length - (clan ? 1 : 0))}${layer('vigils', '🔱 Vigils', VIGILS.length)}</div>
      <span class="hud-pill you-pill" id="you-pill">${youPill()}</span></div>
    <div class="hud tr">
      <button class="icon-btn ${live ? 'on' : ''}" id="locate" title="Use my real location">📍</button>
      <button class="icon-btn" id="follow" title="Follow me">🎯</button>
      <button class="icon-btn" id="zin" title="Zoom in">＋</button>
      <button class="icon-btn" id="zout" title="Zoom out">－</button>
      <button class="icon-btn" id="rain-btn" title="Toggle Seattle rain">☔</button>
    </div>
    <div class="hud bl trekbar" id="trekbar"></div>
  </section>
  <section class="card loc-help" id="loc-help" hidden></section>
  <section class="card sel-panel" id="sel-panel"></section>
  <section class="card"><div id="layer-list"></div></section>`;
}
function youPill() {
  const pr = G.spiritProgress(G.totalEssence(state));
  const todayKm = state.activities.filter((a) => G.dayKey(a.date) === G.dayKey(now())).reduce((s2, a) => s2 + a.trailKm, 0);
  return `${tracker.mode === 'gps' ? '📍 GPS' : '🎮 Demo GPS: tap map to walk'} · Lv ${pr.level} · ${G.totalEssence(state).toLocaleString()} XP · today ${dist(todayKm)}`;
}
function nearbyGatherings() {
  const lim = radiusMi ? radiusMi * 1609.344 : Infinity;
  return upcoming().filter((g) => metersTo(G.spotById(g.spotId)) <= lim);
}
async function startGps(quiet = false) {
  const btn = $('#loc-on');
  if (btn) { btn.disabled = true; btn.textContent = 'Finding you…'; }
  try {
    const p = await locateOnce();
    gpsIssue = null;
    state.player.pos = { lat: p.lat, lon: p.lon };
    tracker.follow(); map?.setMode('gps'); map?.setPlayer(p.lat, p.lon, { jump: true }); map?.followMe(); gmap?.setPlayer(p.lat, p.lon);
    toast(`📍 GPS live (±${Math.round(p.accuracy)} m). Your avatar moves with you.`, 'good');
    save(); render();
  } catch (err) {
    gpsIssue = { code: err.code, message: err.message, perm: await locationPermission() };
    if (!quiet) toast(`${esc(err.message)} See the steps under the map.`, 'bad');
    renderLocHelp();
  }
}
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const inPreview = () => { try { return window.top !== window; } catch { return true; } };
function renderLocHelp() {
  const el = $('#loc-help');
  if (!el) return;
  if (tracker.mode === 'gps') { el.hidden = true; return; }
  el.hidden = false;
  const blocked = gpsIssue?.code === 1 || gpsIssue?.perm === 'denied';
  const steps = inPreview()
    ? '<p class="small">This preview can\'t use your location. Open <b>rakeshpallagani.github.io/wildbound</b> in your phone\'s browser or installed app instead.</p>'
    : isIOS()
      ? `<ol class="small loc-steps">
          <li><b>Settings → Privacy &amp; Security → Location Services</b>: turn it <b>on</b>.</li>
          <li>In that same list, tap <b>Safari Websites</b> → <b>While Using the App</b> (home-screen apps use this setting too).</li>
          <li><b>Settings → Apps → Safari → Location</b> → <b>Ask</b> or <b>Allow</b>.</li>
          ${blocked ? '<li>If you tapped "Don\'t Allow" before: remove Wildbound from the home screen, add it again from Safari, and tap <b>Allow</b>.</li>' : ''}
          <li>Come back here and tap <b>Turn on location</b>.</li></ol>`
      : `<ol class="small loc-steps">
          <li>Turn on your phone's <b>Location</b> (quick settings).</li>
          <li>${blocked ? 'Location is blocked for this site: tap the ⓘ or 🔒 next to the address (or long-press the app icon → App info → Permissions) and allow <b>Location</b>.' : 'When asked, choose <b>Allow</b> (While using the app).'}</li>
          <li>Tap <b>Turn on location</b> again.</li></ol>`;
  el.innerHTML = `<div class="card-head"><div><h2>📍 ${gpsIssue ? 'Location isn\'t on yet' : 'Use your real location'}</h2>
      <p class="muted small">${gpsIssue ? esc(gpsIssue.message) : 'Your avatar walks with you, treks record your route, and Activities shows what\'s near you.'} Until then, Demo GPS is on: tap the map to walk.</p></div></div>
    <div class="row gap"><button class="btn primary" id="loc-on">Turn on location</button></div>
    ${gpsIssue || inPreview() ? steps : ''}`;
  $('#loc-on').addEventListener('click', () => startGps());
}
function updateTrekBar() {
  const el = $('#trekbar');
  if (!el) return;
  el.innerHTML = tracker.active
    ? `<span class="trek-live"><i class="rec"></i><b>${dist(tracker.distanceKm, 2)}</b> · ${tracker.mode === 'gps' ? `${Math.floor(tracker.elapsedMin)} min` : 'Demo GPS'}</span><button class="btn small primary" id="trek-stop">Stop &amp; log trek</button>`
    : '<button class="btn small primary" id="trek-start">▶ Start a trek</button>';
  $('#trek-start')?.addEventListener('click', () => { tracker.start(state.player.pos); updateTrekBar(); });
  $('#trek-stop')?.addEventListener('click', () => {
    const t = tracker.stop();
    const near = G.nearestVigil(state);
    try { commit(G.logTrek(state, { ...t, place: near.m < 600 ? near.site.name : '' })); } catch (err) { toast(esc(err.message), 'bad'); updateTrekBar(); }
  });
}
function goButton(lat, lon, m, label = 'Walk here') {
  return tracker.mode === 'gps'
    ? `<a class="btn primary" href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=walking" target="_blank" rel="noopener">Directions (${meters(m)})</a>`
    : `<button class="btn primary" data-walk="${lat},${lon}">🚶 ${label} (${meters(m)})</button>`;
}
function levelLine(c) {
  const l = G.clanLevel(c);
  return `<div class="lvl"><span><b>Lv ${l.level} · ${l.name}</b> <small>${l.xp.toLocaleString()} XP</small></span><div class="bar"><i style="width:${Math.round(l.pct * 100)}%"></i></div>${l.next ? `<small class="muted">Next: Lv ${l.next.level} ${l.next.name} at ${l.next.xp.toLocaleString()} XP · unlocks ${esc(l.next.unlock.toLowerCase())}</small>` : '<small class="muted">Max level</small>'}</div>`;
}
function clanPanelHTML(id) {
  const c = G.clanById(state, id);
  const a = aspectOf(c.aspect);
  const st = G.clanStatus(c);
  const mine = c.id === state.clanId;
  const gs = upcoming().filter((g) => g.clanId === c.id).slice(0, 3);
  const m = metersTo(c.hub);
  return `
    <div class="vp-head" style="--c:${a.color}"><span class="vp-orb"></span>
      <div class="grow"><div class="eyebrow">${a.name} clan · Hearth in ${esc(c.hub.name)} · ${meters(m)} away</div><h2>${esc(c.name)}</h2></div>
      ${mine ? '<span class="pill ok">Your clan</span>' : c.aspect === state.player.primary ? '<span class="tag">your Aspect</span>' : ''}</div>
    <p class="motto">“${esc(c.motto)}”</p>
    ${levelLine(c)}
    <div class="vp-stats">
      <div><small>Kin</small><b>${c.members.length}</b><span class="mini-kin">${c.members.slice(0, 6).map((k) => `<i style="background:${aspectOf(k.aspect).color}" title="${esc(k.name)} · ${aspectOf(k.aspect).name}"></i>`).join('')}</span></div>
      <div><small>This week</small><b>${Math.round(st.pct * 100)}% · ${st.bonded.length}/${st.bondNeeded} Bonded</b>${gauge(st)}</div>
      <div><small>Vigils held</small><b>${G.heldVigils(state, c.id).length}</b></div>
    </div>
    ${(c.bands || []).length ? `<h3>Bands in this clan</h3><div class="band-chips">${c.bands.map((b) => `<span class="band-chip">${ACTIVITIES[b.type].icon} ${esc(b.name)} <small>${b.members.length}</small></span>`).join('')}</div>` : ''}
    ${gs.length ? `<h3>Upcoming gatherings</h3><ul class="g-mini">${gs.map((g) => `<li data-sel="gathering:${g.id}">${ACTIVITIES[g.type].icon} <b>${esc(g.title)}</b> <small>${gDay(g)} ${g.time} · ${esc(G.spotById(g.spotId).name)}</small></li>`).join('')}</ul>` : ''}
    <div class="row gap">${mine ? '<button class="btn" data-go="clan">Open clan</button><button class="btn" data-go="chat">Chat</button>' : `<button class="btn primary" data-join="${c.id}">Join ${esc(c.name)}</button>`}${goButton(c.hub.lat, c.hub.lon, m, 'Visit Hearth')}</div>`;
}
function gatheringPanelHTML(id) {
  const g = state.gatherings.find((x) => x.id === id);
  if (!g) return '<p class="muted">That gathering has ended.</p>';
  const c = G.clanById(state, g.clanId);
  const sp = G.spotById(g.spotId);
  const m = metersTo(sp);
  const today = g.day === G.dayKey(now());
  const here = m <= GATHERING.radiusM;
  const kin = c.members.filter((k) => g.going.includes(k.id));
  let action;
  if (g.attended) action = '<button class="btn" disabled>✓ Checked in</button>';
  else if (today && here) action = `<button class="btn primary" data-attend="${g.id}">🤝 Check in (+${GATHERING.essence} XP, +${GATHERING.lumens} ✦)</button>`;
  else action = `<button class="btn ${g.rsvp ? '' : 'primary'}" data-rsvp="${g.id}">${g.rsvp ? '✓ Going · undo' : 'I\'m going'}</button>${goButton(sp.lat, sp.lon, m, 'Head there')}`;
  return `
    <div class="vp-head" style="--c:${clanColor(c)}"><span class="g-ic">${ACTIVITIES[g.type].icon}</span>
      <div class="grow"><div class="eyebrow">${gDay(g)} · ${g.time} · ${esc(sp.name)} · ${meters(m)} away</div><h2>${esc(g.title)}</h2></div>
      ${matchesMe(g.type) ? '<span class="tag">matches your Aspects</span>' : ''}</div>
    <p class="muted small">Hosted by <b>${esc(g.host)}</b> of <span style="color:${clanColor(c)}">${esc(c.name)}</span>. Open to everyone, any clan. ${aspectOf(ACTIVITIES[g.type].aspect).name} energy.</p>
    <div class="going">${kin.map((k) => `<span class="who-chip" style="--c:${aspectOf(k.aspect).color}">${esc(k.name)}${k.isPlayer ? ' (you)' : ''}</span>`).join('')}${g.rsvp && !kin.some((k) => k.isPlayer) ? '<span class="who-chip me">You</span>' : ''}<small class="muted">${g.going.length} going</small></div>
    <div class="row gap">${action}</div>
    <p class="muted small">Check in on the day, at the spot, after you've moved. Showing up earns XP, ✦ and clan XP for both clans.</p>`;
}
function vigilPanelHTML(id) {
  const vs = G.vigilState(state, id);
  const s = vs.site;
  const clan = G.playerClan(state);
  const m = G.distanceTo(state, s);
  const here = m <= VIGIL.radiusM;
  const col = clanColor(vs.holderClan);
  const shielded = vs.shieldUntil && G.dayKey(now()) <= vs.shieldUntil;
  const avail = G.pledgeableKm(state);
  const visited = state.unlockedLore.includes(`vigil:${s.id}`);
  let action = '';
  if (!clan) action = '<button class="btn primary" data-layer-go="clans">Find a clan first</button>';
  else if (!G.canVigil(clan)) { const l = G.clanLevel(clan); action = `<p class="callout">🔒 Vigils unlock at clan <b>Level ${VIGIL_MIN_LEVEL} · Outpost</b>. ${esc(clan.name)} is Lv ${l.level} (${l.xp.toLocaleString()} XP). Every mile your kin move, every Awakening and every gathering grows it.</p>`; }
  else if (!here) action = goButton(s.lat, s.lon, m);
  else if (vs.holder === clan.id) action = `<button class="btn primary" data-vact="fortify" ${avail > 0 ? '' : 'disabled'}>🛡️ Fortify with ${dist(avail)} (+${Math.round(avail * VIGIL.wardPerKm)} ward)</button>`;
  else if (vs.holder) action = shielded ? '<button class="btn" disabled>🛡️ Shielded until tomorrow</button>' : `<button class="btn primary" data-vact="siege" ${avail > 0 ? '' : 'disabled'}>⚔️ Siege with ${dist(avail)} (−${Math.round(avail * VIGIL.wardPerKm)} ward)</button>`;
  else action = `<button class="btn primary" data-vact="establish" ${clan.seals > 0 ? '' : 'disabled'}>🔱 Establish (uses 1 of ${clan.seals} Seals)</button>`;
  return `
    <div class="vp-head" style="--c:${col || 'var(--muted)'}"><span class="vp-orb"></span>
      <div class="grow"><div class="eyebrow">${esc(s.vigil)} · ${here ? '<b class="ok">You\'re here</b>' : `${meters(m)} away`}</div><h2>${esc(s.name)}</h2></div>
      <span class="pill" style="background:${col ? col + '33' : ''}">${vs.holderClan ? esc(vs.holderClan.name) : 'Open'}</span></div>
    <div class="vp-stats">
      <div><small>Ward</small>${wardBar(vs.ward, col)}<b>${vs.ward} / ${VIGIL.maxWard}</b></div>
      <div><small>Tribute</small><b>${lum(s.yield)} / day each</b></div>
      <div><small>Boon</small><b>${esc(s.boon.text)}</b></div>
    </div>
    <p class="why">${vs.holder && clan && vs.holder === clan.id ? `<b>While your clan holds it:</b> you get ${s.yield} ✦ every day and ${esc(s.boon.text.toLowerCase())}. Your pledges here: <b>${state.vigils[s.id]?.pledges?.me || 0} ward</b>${(state.vigils[s.id]?.pledges?.me || 0) >= Math.max(...Object.values(state.vigils[s.id]?.pledges || { x: 0 })) && state.vigils[s.id]?.pledges?.me ? ' · <b>you are its Keeper</b>' : ''}.` : `<b>Why take it:</b> every member of the holding clan gets ${s.yield} ✦ a day plus ${esc(s.boon.text.toLowerCase())}, and the clan climbs the weekly ranks. It lasts until a rival breaks the ward. Your ward comes from movement you did today.`}</p>
    <div class="row gap">${action}${here && clan && G.canVigil(clan) ? `<span class="muted small">Pledgeable today: <b>${dist(avail)}</b></span>` : ''}</div>
    <p class="lore ${visited ? '' : 'locked'}">${visited ? esc(s.lore) : '📜 Visit in person to unlock this landmark\'s story.'}</p>`;
}
function renderPanel() {
  const el = $('#sel-panel');
  if (!el) return;
  const s = defaultSel();
  if (!s) { el.innerHTML = '<p class="muted">Nothing here yet.</p>'; return; }
  el.innerHTML = s.kind === 'clan' ? clanPanelHTML(s.id) : s.kind === 'gathering' ? gatheringPanelHTML(s.id) : vigilPanelHTML(s.id);
  bindPanel(el, s);
}
function bindPanel(el, s) {
  const run = (fn) => { try { commit(fn()); } catch (err) { toast(esc(err.message), 'bad'); } };
  el.querySelectorAll('[data-join]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.join;
    const target = G.clanById(state, id);
    if (target.remote) { const ok = await remoteTry(() => backend.joinClan(id)); if (ok === null && backend.online) return; }
    mapLayer = 'gatherings'; sel = null;
    commit(G.joinClan(state, id));
    if (target.remote) remoteTry(pullAndMerge, true);
    toast(`🔥 You joined <b>${esc(G.playerClan(state).name)}</b>. Join a band in the Clan tab, and move on ${AWAKENING.bondDays} days this week to get Bonded.`, 'good');
  }));
  el.querySelectorAll('[data-walk]').forEach((b) => b.addEventListener('click', () => { const [la, lo] = b.dataset.walk.split(',').map(Number); map?.walkTo(la, lo); }));
  el.querySelectorAll('[data-rsvp]').forEach((b) => b.addEventListener('click', () => run(() => G.rsvp(state, b.dataset.rsvp))));
  el.querySelectorAll('[data-attend]').forEach((b) => b.addEventListener('click', () => run(() => G.attendGathering(state, b.dataset.attend))));
  el.querySelectorAll('[data-vact]').forEach((b) => b.addEventListener('click', () => run(() => G[b.dataset.vact](state, s.id))));
  el.querySelectorAll('[data-sel]').forEach((li) => li.addEventListener('click', () => { const [k, id] = li.dataset.sel.split(':'); mapLayer = k === 'gathering' ? 'gatherings' : mapLayer; select(k, id, true); }));
  el.querySelectorAll('[data-layer-go]').forEach((b) => b.addEventListener('click', () => { mapLayer = b.dataset.layerGo; sel = null; render(); }));
}
function renderList() {
  const el = $('#layer-list');
  if (!el) return;
  const clan = G.playerClan(state);
  const isSel = (k, id) => sel?.kind === k && sel.id === id;
  if (mapLayer === 'clans') {
    const rows = [...state.clans].filter((c) => c.id !== state.clanId).sort((a, b) => metersTo(a.hub) - metersTo(b.hub)).map((c) => {
      const a = aspectOf(c.aspect); const l = G.clanLevel(c); const st = G.clanStatus(c);
      return `<li class="${c.id === state.clanId ? 'mine' : ''} ${isSel('clan', c.id) ? 'sel' : ''}" data-pick="clan:${c.id}"><span class="v-dot" style="background:${a.color};border-color:${a.color}"></span>
        <span class="grow"><b>${a.spirit.glyph} ${esc(c.name)}${backend.online && !c.remote ? ' <span class="tag">demo</span>' : ''}</b><small>${a.name} · Lv ${l.level} ${l.name} · ${c.members.length} kin · ${Math.round(st.pct * 100)}% this week</small></span>
        <span class="pill ${c.aspect === state.player.primary ? '' : 'dim'}">${c.aspect === state.player.primary ? 'your Aspect' : a.name}</span><span class="v-dist">${meters(metersTo(c.hub))}</span></li>`;
    }).join('');
    el.innerHTML = `<div class="card-head"><div><h2>${clan ? 'Rival clans near you' : 'Clans near you'}</h2><p class="muted small">${clan ? 'Clans you compete with on the weekly ranks and for vigils. Their gatherings are open to you too.' : 'Join the one whose people and meetups suit you. Your Aspect doesn\'t have to match.'}</p></div></div><ul class="vigil-list">${rows}</ul>
      ${clan ? '' : `<details class="found"><summary>Or found your own clan here</summary><form id="found-form" class="stack"><input id="clan-name" name="name" maxlength="32" placeholder="Clan name" required /><input id="clan-motto" name="motto" maxlength="60" placeholder="Motto (optional)" /><button class="btn primary" type="submit">Light your Hearth 🔥</button></form><p class="muted small">Your Hearth is placed where you are now. New clans start at Lv 1.</p></details>`}`;
    $('#found-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (backend.online) {
        const row = await remoteTry(() => backend.createClan({ name: String(fd.get('name')).trim(), motto: String(fd.get('motto') || '').trim(), aspect: state.player.primary, hub: { name: 'Hearth', lat: state.player.pos.lat, lon: state.player.pos.lon } }));
        if (!row) return;
        await remoteTry(pullAndMerge);
        mapLayer = 'gatherings'; commit([]);
        toast('🔥 Your Hearth is lit. Invite friends to join it on the map.', 'epic');
        return;
      }
      try { commit(G.foundClan(state, { name: fd.get('name'), motto: fd.get('motto') })); toast('🔥 Your Hearth is lit. Two wanderers answered the call.', 'epic'); } catch (err) { toast(esc(err.message), 'bad'); }
    });
  } else if (mapLayer === 'gatherings') {
    const gs = nearbyGatherings().sort((a, b) => (a.day !== b.day ? (a.day < b.day ? -1 : 1) : metersTo(G.spotById(a.spotId)) - metersTo(G.spotById(b.spotId))));
    const canHost = clan && G.clanLevel(clan).level >= HOST_MIN_LEVEL;
    const chip = (r, l) => `<button class="chip ${radiusMi === r ? 'on' : ''}" data-radius="${r}">${l}</button>`;
    el.innerHTML = `<div class="card-head"><div><h2>Activities near you</h2><p class="muted small">Meetups hosted by clan bands. Anyone can join. ⭐ = matches your Aspects.</p></div></div>
      <div class="chips radius">${chip(1, imperial() ? '1 mi' : '1.6 km')}${chip(3, imperial() ? '3 mi' : '5 km')}${chip(10, imperial() ? '10 mi' : '16 km')}${chip(0, 'All Seattle')}</div>
      <ul class="vigil-list">${gs.map((g) => { const c = G.clanById(state, g.clanId); const sp = G.spotById(g.spotId); return `<li class="${isSel('gathering', g.id) ? 'sel' : ''} ${g.rsvp ? 'mine' : ''}" data-pick="gathering:${g.id}"><span class="g-ic sm">${ACTIVITIES[g.type].icon}</span>
        <span class="grow"><b>${matchesMe(g.type) ? '⭐ ' : ''}${esc(g.title)}</b><small>${gDay(g)} ${g.time} · ${esc(sp.name)} · <span style="color:${clanColor(c)}">${esc(c.name)}</span> · ${g.going.length} going</small></span>
        ${g.attended ? '<span class="pill ok">attended</span>' : g.rsvp ? '<span class="pill ok">going</span>' : '<span class="pill dim">open</span>'}<span class="v-dist">${meters(metersTo(sp))}</span></li>`; }).join('') || `<li class="muted">Nothing within this distance yet. Widen the radius${clan && canHost ? ', or host one below' : ''}.</li>`}</ul>
      ${clan ? (canHost ? hostForm(clan) : `<p class="callout">🔒 Hosting unlocks at clan <b>Level ${HOST_MIN_LEVEL} · Hearth</b>.</p>`) : ''}`;
    el.querySelectorAll('[data-radius]').forEach((b) => b.addEventListener('click', () => { radiusMi = Number(b.dataset.radius); if (map) map.update(mapModel()); renderList(); }));
    $('#host-form')?.addEventListener('submit', (e) => { e.preventDefault(); const fd = new FormData(e.target); try { const ev = G.hostGathering(state, Object.fromEntries(fd)); sel = { kind: 'gathering', id: ev[0].g.id }; commit(ev); } catch (err) { toast(esc(err.message), 'bad'); } });
  } else {
    const rows = VIGILS.map((s) => ({ s, m: G.distanceTo(state, s), vs: G.vigilState(state, s.id) })).sort((a, b) => a.m - b.m).map(({ s, m, vs }) => {
      const col = clanColor(vs.holderClan);
      return `<li class="${clan && vs.holder === clan.id ? 'mine' : ''} ${isSel('vigil', s.id) ? 'sel' : ''}" data-pick="vigil:${s.id}"><span class="v-dot" style="background:${col || 'transparent'};border-color:${col || 'var(--muted)'}"></span>
        <span class="grow"><b>${esc(s.name)}</b><small>${vs.holderClan ? esc(vs.holderClan.name) : 'Open'} · ${esc(s.boon.text)}</small></span>${vs.holder ? wardBar(vs.ward, col) : '<span class="pill dim">open</span>'}<span class="v-dist">${meters(m)}</span></li>`;
    }).join('');
    el.innerHTML = `<div class="card-head"><div><h2>Vigils</h2><p class="muted small">Clans at Level ${VIGIL_MIN_LEVEL}+ raise vigils on landmarks with today's movement. Holders earn daily ✦ and a boon until a rival breaks the ward.</p></div></div><ul class="vigil-list">${rows}</ul>`;
  }
  el.querySelectorAll('[data-pick]').forEach((li) => li.addEventListener('click', () => { const [k, id] = li.dataset.pick.split(':'); select(k, id, true); }));
}
function hostForm(clan) {
  const types = Object.keys(ACTIVITIES).sort((a, b) => (ACTIVITIES[b].aspect === clan.aspect) - (ACTIVITIES[a].aspect === clan.aspect));
  return `<details class="found"><summary>➕ Host a gathering for ${esc(clan.name)}</summary>
    <form id="host-form" class="host-form">
      <label>Band<select name="bandId"><option value="">Whole clan</option>${G.myBands(state).map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></label>
      <label>Activity<select name="type">${types.map((t) => `<option value="${t}">${ACTIVITIES[t].icon} ${ACTIVITIES[t].label}</option>`).join('')}</select></label>
      <label>Where<select name="spotId">${SPOTS.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
      <label>When<select name="when"><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="weekend">Saturday</option></select></label>
      <label>Time<input name="time" type="time" value="18:00" /></label>
      <button class="btn primary" type="submit">Post to the map</button>
    </form></details>`;
}
function select(kind, id, focus = false) {
  sel = kind ? { kind, id } : null;
  if (kind === 'vigil' && mapLayer !== 'vigils') mapLayer = 'vigils';
  if (kind === 'gathering' && mapLayer === 'vigils') mapLayer = 'gatherings';
  if (map) map.update(mapModel());
  view.querySelectorAll('[data-layer]').forEach((b) => b.classList.toggle('active', b.dataset.layer === mapLayer));
  if (kind && focus) {
    const p = kind === 'clan' ? G.clanById(state, id).hub : kind === 'gathering' ? G.spotById(state.gatherings.find((g) => g.id === id).spotId) : VIGILS.find((v) => v.id === id);
    map?.focusOn(p.lat, p.lon); gmap?.focusOn(p.lat, p.lon);
  }
  renderPanel();
  renderList();
  if (kind && focus) $('#sel-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
bind.map = async function () {
  const host = $('#map');
  const pos = state.player.pos || HOME.start;
  const key = readKey();
  view.querySelectorAll('[data-layer]').forEach((b) => b.addEventListener('click', () => { mapLayer = b.dataset.layer; sel = null; if (map) map.update(mapModel()); view.querySelectorAll('[data-layer]').forEach((x) => x.classList.toggle('active', x === b)); renderPanel(); renderList(); }));
  if (state.settings.mapEngine === 'google' && key) {
    try { gmap = await createGoogle3D(host, key, { center: pos, onSelectVigil: (id) => select('vigil', id) }); gmap.setVigils(vigilModel()); }
    catch (err) { toast(`${esc(err.message)} Using the built-in map.`, 'bad'); gmap = null; }
  }
  if (!gmap) {
    if (!map && !mapFailed) {
      map = createMap3D({
        onSelect: (kind, id) => select(kind, id),
        onMove: (lat, lon, mode) => { if (mode !== 'demo') return; state.player.pos = { lat, lon }; tracker.feed(lat, lon); onPositionChanged(); },
      });
      mapFailed = !map;
      if (map) { map.setPlayer(pos.lat, pos.lon, { jump: true }); const mo = new Date().getMonth(); map.setRain(mo >= 9 || mo <= 3); }
    }
    if (!map) host.innerHTML = '<div class="world-fallback">The 3D map needs WebGL, which isn\'t available in this browser. The lists below still work.</div>';
    else { map.mount(host); map.setMode(tracker.mode); map.update(mapModel()); map.setTrack(tracker.points); }
  }
  $('#rain-btn').classList.toggle('on', !!map?.rain);
  $('#rain-btn').addEventListener('click', (e) => { if (!map) return; map.setRain(!map.rain); e.currentTarget.classList.toggle('on', map.rain); });
  $('#zin').addEventListener('click', () => map?.zoom(0.7));
  $('#zout').addEventListener('click', () => map?.zoom(1.4));
  $('#locate').addEventListener('click', () => startGps());
  $('#follow').addEventListener('click', () => map?.followMe());
  // Outside the Claude preview (e.g. installed on your phone), start real GPS automatically once.
  if (!autoGpsTried && tracker.mode !== 'gps' && gpsSupported() && window.top === window) { autoGpsTried = true; startGps(true); }
  updateTrekBar();
  renderPanel();
  renderList();
  renderLocHelp();
};

// ---------- LOG ----------
function draftInput() {
  const act = ACTIVITIES[draft.type];
  const toKm = (v) => (Number(v) || 0) * (imperial() ? G.KM_PER_MI : 1);
  const date = draft.when === 'yesterday' ? G.addDays(now(), -1) : now();
  return {
    type: draft.type, minutes: Number(draft.minutes) || 0, intensity: draft.intensity,
    distanceKm: act?.distance ? toKm(draft.distance) : 0, steps: act?.steps ? Number(draft.steps) || 0 : 0,
    elevM: act?.elev ? (Number(draft.elev) || 0) / (imperial() ? 3.28084 : 1) : 0,
    place: draft.place, note: draft.note, date: date.toISOString(), source: 'manual',
  };
}
function impactPanel() {
  if (!draft.type) return '<div class="impact empty"><h3>What this does</h3><p class="muted">Pick an activity to see what it earns you, your spirit and your clan.</p></div>';
  const input = draftInput();
  const clan = G.playerClan(state);
  const sc = G.scoreForPlayer(state, input, new Date(input.date));
  const a = aspectOf(state.player.primary);
  const actAsp = aspectOf(sc.aspect);
  const ess = G.totalEssence(state);
  const p = G.spiritProgress(ess + sc.essence);
  const rows = [];
  const tags = [sc.affinityMult > 1 ? `<span class="tag">×${sc.affinityMult} ${sc.aspect === state.player.primary ? 'primary' : 'secondary'}</span>` : '', ...sc.applied.map((x) => `<span class="tag">${esc(x)}</span>`)].join(' ');
  rows.push(`<li><span class="ic">${a.spirit.glyph}</span><span><b>+${sc.essence} XP</b> for ${a.spirit.name} ${tags}<small>${p.nextAt ? `${(ess + sc.essence).toLocaleString()} / ${p.nextAt.toLocaleString()} to ${a.stages[p.stage + 1]}` : 'Final form'}</small></span></li>`);
  if (clan) {
    const st = G.clanStatus(clan);
    const after = Math.min(1, (st.charged + sc.trailKm) / st.target);
    rows.push(`<li><span class="ic" style="color:${actAsp.color}">●</span><span><b>+${dist(sc.trailKm)} of ${actAsp.name} energy</b> for ${esc(clan.name)}<small>Gauge ${Math.round(st.pct * 100)}% → ${Math.round(after * 100)}%. Counts in any clan, whatever its Aspect.</small></span></li>`);
    const days = clan.week.days.me || [];
    const nd = new Set([...days, G.weekdayIdx(new Date(input.date))]).size;
    rows.push(`<li><span class="ic">🤝</span><span>${days.length >= AWAKENING.bondDays ? '<b>You\'re Bonded</b> this week' : nd >= AWAKENING.bondDays ? '<b>Makes you Bonded</b> this week' : `<b>Day ${nd} of ${AWAKENING.bondDays}</b> toward Bonded`}<small>The clan awakens only when ${Math.round(AWAKENING.bondShare * 100)}% of kin are Bonded</small></span></li>`);
    if (draft.when === 'today') rows.push(`<li><span class="ic">🔱</span><span><b>+${dist(sc.trailKm)} pledgeable</b> at a vigil today<small>${Math.round(sc.trailKm * VIGIL.wardPerKm)} ward to fortify yours or siege a rival's</small></span></li>`);
  } else rows.push('<li><span class="ic">🔥</span><span>Join a clan to charge an Awakening and hold vigils with this.</span></li>');
  const tr = G.previewTrials(state, { ...sc, type: input.type, intensity: input.intensity, source: 'manual' });
  if (tr.length) rows.push(`<li><span class="ic">✅</span><span>Completes ${tr.map((t) => `<b>${esc(t.text)}</b> (+${t.reward})`).join(', ')}</span></li>`);
  return `<div class="impact"><h3>What this does</h3><ul>${rows.join('')}</ul></div>`;
}
function logView() {
  const p = state.player;
  const act = draft.type ? ACTIVITIES[draft.type] : null;
  const conn = state.connections || {};
  const grouped = ASPECT_IDS.map((asp) => {
    const a = ASPECTS[asp];
    const mult = asp === p.primary ? AFFINITY.primary : asp === p.secondary ? AFFINITY.secondary : null;
    const items = Object.entries(ACTIVITIES).filter(([, x]) => x.aspect === asp).map(([id, x]) => `
      <button class="act ${draft.type === id ? 'picked' : ''}" data-act="${id}" style="--c:${a.color}"><span>${x.icon}</span>${x.label}${mult ? `<i>×${mult}</i>` : ''}</button>`).join('');
    return `<div class="act-group" style="--c:${a.color}"><div class="act-group-name">${a.spirit.glyph} ${a.name}</div><div class="act-row">${items}</div></div>`;
  }).join('');
  return `
  <section class="card">
    <h2>Track or sync</h2>
    <div class="sources">
      <div class="source on" style="--sc:var(--accent)"><span class="src-logo">📍</span><div class="grow"><b>Trek on the map</b><small>${gpsSupported() ? 'GPS route tracking, logged as verified' : 'Demo GPS'}</small></div><button class="btn small primary" data-go="map">Open map</button></div>
      ${Object.entries(SOURCES).map(([id, s]) => {
        const c = conn[id];
        return `<div class="source ${c ? 'on' : ''}" style="--sc:${s.color}"><span class="src-logo">${s.glyph}</span><div class="grow"><b>${s.name}</b><small>${c ? `Connected · synced ${fmtTime(c.lastSync)}` : s.platform}</small></div>
          ${c ? `<button class="btn small" data-sync="${id}">Sync</button><button class="btn small ghost" data-disc="${id}" title="Disconnect">✕</button>` : `<button class="btn small primary" data-connect="${id}">Connect</button>`}</div>`;
      }).join('')}
    </div>
    <p class="muted small">Prototype: Connect imports sample Seattle workouts. Real sync is planned in docs/INTEGRATIONS.md. Synced and GPS activities are verified (×1.1).</p>
  </section>
  <div class="log-layout">
    <section class="card">
      <h2>Log it yourself</h2>
      <p class="muted small">Grouped by Aspect. Your ×${AFFINITY.primary} primary and ×${AFFINITY.secondary} secondary are marked. Everything charges your clan.</p>
      <div class="act-groups">${grouped}</div>
      <form id="log-form" class="log-form ${act ? '' : 'disabled'}" autocomplete="off">
        <fieldset class="chips wide"><legend>When</legend>${['today', 'yesterday'].map((w) => `<label><input type="radio" name="when" value="${w}" ${draft.when === w ? 'checked' : ''}/><span>${w === 'today' ? 'Today' : 'Yesterday'}</span></label>`).join('')}</fieldset>
        <label>Duration (min)<input id="f-min" type="number" name="minutes" min="1" max="${G.MAX_MINUTES}" value="${esc(draft.minutes)}" required /></label>
        ${act?.distance ? `<label>Distance (${dUnit()})<input id="f-dist" type="number" name="distance" min="0" step="0.1" value="${esc(draft.distance)}" placeholder="optional" /></label>` : ''}
        ${act?.steps ? `<label>Steps<input id="f-steps" type="number" name="steps" min="0" step="100" value="${esc(draft.steps)}" placeholder="if no distance" /></label>` : ''}
        ${act?.elev ? `<label>Elevation gain (${eUnit()})<input id="f-elev" type="number" name="elev" min="0" step="10" value="${esc(draft.elev)}" placeholder="optional" /></label>` : ''}
        <fieldset class="chips wide"><legend>Effort</legend>${Object.entries(INTENSITY).map(([k, v]) => `<label><input type="radio" name="intensity" value="${k}" ${draft.intensity === k ? 'checked' : ''}/><span>${v.label} <small>${v.hint}</small></span></label>`).join('')}</fieldset>
        <label class="wide">Where<input id="f-place" name="place" list="places" maxlength="60" value="${esc(draft.place)}" placeholder="e.g. Green Lake, home gym, Magnuson fields" /></label>
        <datalist id="places">${VIGILS.map((v) => `<option value="${esc(v.name)}">`).join('')}<option value="Burke-Gilman Trail"><option value="Home gym"></datalist>
        <label class="wide">Note<input id="f-note" name="note" maxlength="140" value="${esc(draft.note)}" placeholder="What did you see?" /></label>
        <button class="btn primary wide" type="submit" ${act ? '' : 'disabled'}>${act ? `Log ${act.label.toLowerCase()}` : 'Pick an activity'}</button>
      </form>
    </section>
    <aside class="card impact-card" id="impact">${impactPanel()}</aside>
  </div>`;
}
bind.log = function () {
  const form = $('#log-form');
  const sync = () => { const fd = new FormData(form); for (const k of ['when', 'minutes', 'distance', 'steps', 'elev', 'intensity', 'place', 'note']) if (fd.has(k)) draft[k] = fd.get(k); };
  view.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => { sync(); draft.type = b.dataset.act; render(); }));
  const refresh = () => { sync(); $('#impact').innerHTML = impactPanel(); };
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  form.addEventListener('submit', (e) => {
    e.preventDefault(); sync();
    try { const ev = G.logActivity(state, draftInput()); draft = freshDraft(); tab = 'clan'; commit(ev); } catch (err) { toast(esc(err.message), 'bad'); }
  });
  view.querySelectorAll('[data-connect],[data-sync]').forEach((b) => b.addEventListener('click', () => {
    const src = b.dataset.connect || b.dataset.sync;
    b.disabled = true; b.textContent = '…';
    setTimeout(() => commit(G.importActivities(state, src, fetchRecent(src, now()))), 600);
  }));
  view.querySelectorAll('[data-disc]').forEach((b) => b.addEventListener('click', () => { G.disconnect(state, b.dataset.disc); commit(); }));
};

// ---------- CLAN ----------
function clanView() {
  const clan = G.playerClan(state);
  if (!clan) return clanPickerView();
  const a = aspectOf(clan.aspect);
  const st = G.clanStatus(clan);
  const power = G.activePower(clan, now());
  const kin = G.kinStats(clan);
  const today = G.weekdayIdx(now());
  const held = G.heldVigils(state, clan.id);
  const tribute = held.reduce((s, v) => s + v.yield, 0) * (power ? 1.5 : 1);
  const route = G.getExpedition(clan.journeyId);
  const nx = G.journeyNext(route, clan.journeyKm);
  const mw = clan.week.days.me || [];
  const trials = G.dailyTrials(state);
  const share = (x) => (st.charged ? Math.round(((st.energy[x] || 0) / st.charged) * 100) : 0);
  return `
  <section class="card clan-banner" style="--c:${a.color}">
    <div class="clan-sigil">${a.spirit.glyph}</div>
    <div class="grow"><div class="eyebrow">${a.name} clan · ${clan.members.length} kin · ${clan.awakenings} awakening${clan.awakenings === 1 ? '' : 's'}</div><h2>${esc(clan.name)}</h2><p class="motto">“${esc(clan.motto)}”</p></div>
    <div class="clan-stats"><span><b>${held.length}</b>vigils</span><span><b>${clan.seals}</b>seals</span><span><b>${Math.round(tribute)}</b>✦/day</span></div>
  </section>

  <section class="card">
    <div class="card-head"><h2>Clan level</h2></div>
    ${levelLine(clan)}
    <ul class="unlocks">${CLAN_LEVELS.map((l) => `<li class="${G.clanLevel(clan).level >= l.level ? 'on' : ''}"><b>${G.clanLevel(clan).level >= l.level ? '✓' : '🔒'} Lv ${l.level} ${l.name}</b><small>${esc(l.unlock)}</small></li>`).join('')}</ul>
    <p class="muted small">Clan XP comes from every mile your kin move, +150 per Awakening, and +${GATHERING.clanXp} per gathering someone shows up to.</p>
  </section>

  <section class="card">
    <div class="card-head"><div><h2>Bands</h2><p class="muted small">Smaller groups inside ${esc(clan.name)}, each with its own meetups and chat channel. Join as many as you like.</p></div></div>
    <ul class="bands">${(clan.bands || []).map((b) => { const sp = G.spotById(b.spotId); const inb = b.members.includes('me'); const next = upcoming().find((g) => g.bandId === b.id); return `<li class="${inb ? 'mine' : ''}">
      <span class="g-ic sm">${ACTIVITIES[b.type].icon}</span>
      <span class="grow"><b>${esc(b.name)}</b><small>${ACTIVITIES[b.type].label} · ${esc(sp?.name || '')} · usually ${b.time} · ${b.members.length} member${b.members.length === 1 ? '' : 's'}${next ? ` · next: ${G.fmtGDay(next.day, now())} ${next.time}` : ''}</small></span>
      <button class="btn small ${inb ? '' : 'primary'}" data-band="${b.id}">${inb ? 'Leave' : 'Join'}</button></li>`; }).join('') || '<li class="muted">No bands yet. Start the first one.</li>'}</ul>
    <details class="found"><summary>➕ Start a band</summary>
      <form id="band-form" class="host-form">
        <label>Name<input name="name" maxlength="32" placeholder="e.g. Sunday Strikers" required /></label>
        <label>Activity<select name="type">${Object.keys(ACTIVITIES).map((t) => `<option value="${t}">${ACTIVITIES[t].icon} ${ACTIVITIES[t].label}</option>`).join('')}</select></label>
        <label>Home spot<select name="spotId">${SPOTS.map((p2) => `<option value="${p2.id}">${esc(p2.name)}</option>`).join('')}</select></label>
        <label>Usual time<input name="time" type="time" value="18:00" /></label>
        <button class="btn primary" type="submit">Start band</button>
      </form></details>
  </section>

  <section class="card whisper"><span class="quote-mark">“</span>${esc(G.spiritWhisper(state))}</section>

  <section class="card">
    <div class="card-head"><div><div class="eyebrow">Weekly Awakening · ${daysLeft()} day${daysLeft() === 1 ? '' : 's'} left</div><h2>Awaken the clan spirit</h2></div>${tierPill(st)}</div>
    ${gauge(st, true)}
    <div class="row-between small"><span><b>${dist(st.charged)}</b> / ${dist(st.target)}</span><span><b>${st.bonded.length}/${st.bondNeeded}</b> kin Bonded</span></div>
    ${clan.history[0] ? `<p class="muted small">Last week: ${Math.round(clan.history[0].pct * 100)}%, ${clan.history[0].bonded}/${clan.history[0].members} Bonded, ${clan.history[0].awakened ? '<b>awakened ⚡</b>' : 'did not awaken'}.</p>` : ''}
    <div class="energy-legend">${ASPECT_IDS.map((x) => `<span style="--c:${ASPECTS[x].color}"><i></i>${ASPECTS[x].name} ${share(x)}%</span>`).join('')}</div>
    ${power
      ? `<p class="callout good">${power.icon} <b>${esc(power.name)}</b> is active until ${fmtDay(G.fromKey(clan.power.until), { month: 'short', day: 'numeric' })}: ${esc(power.effect)}. Your vigils decay at half speed and pay ×1.5 tribute.</p>`
      : `<p class="callout"><b>Awaken</b> = full gauge <b>and</b> ${st.bondNeeded} kin Bonded (${AWAKENING.bondDays}+ active days). Reward: <b>${st.power.icon} ${esc(st.power.name)}</b> for 2 weeks (${esc(st.power.effect)}), <b>+${AWAKENING.seals} Vigil Seals</b>, empowered vigils, +150 XP and +${AWAKENING.lumens} ✦ each.</p>`}
    <h3>Your part</h3>
    <ul class="checklist">
      <li class="${mw.length >= AWAKENING.bondDays ? 'done' : ''}"><span class="check">${mw.length >= AWAKENING.bondDays ? '✓' : ''}</span><span>Be Bonded: move on ${AWAKENING.bondDays} days ${dayDots(mw, today)}</span></li>
      ${trials.map((t) => `<li class="${t.claimed ? 'done' : ''}"><span class="check">${t.claimed ? '✓' : ''}</span><span>${esc(t.text)}</span><b>+${t.reward}</b></li>`).join('')}
    </ul>
    <div class="row gap"><button class="btn primary" data-go="log">Log movement</button><button class="btn" data-go="map">Open map</button></div>
  </section>

  <section class="card">
    <div class="card-head"><h2>Our vigils</h2><button class="btn small" data-go="map">Map</button></div>
    ${!G.canVigil(clan) ? `<p class="callout">🔒 Vigils unlock at <b>Level ${VIGIL_MIN_LEVEL} · Outpost</b>. Grow the clan to claim ground on the map.</p>` : held.length ? `<ul class="vigil-list static">${held.map((s) => { const v = state.vigils[s.id]; return `<li><span class="v-dot" style="background:${a.color};border-color:${a.color}"></span><span class="grow"><b>${esc(s.name)}</b><small>${esc(s.boon.text)} · ${s.yield} ✦/day</small></span>${wardBar(v.ward, a.color)}<span class="v-dist">${v.ward}</span></li>`; }).join('')}</ul>`
      : `<p class="muted">No vigils yet. ${clan.seals ? `You have ${clan.seals} Vigil Seal${clan.seals === 1 ? '' : 's'}: walk to an open landmark and establish one.` : 'Awaken the clan to earn Seals, or siege a rival vigil until it falls.'}</p>`}
  </section>

  <section class="card">
    <div class="card-head"><h2>Kin this week</h2><span class="small">${st.bonded.length}/${st.bondNeeded} Bonded</span></div>
    <ul class="kin">${kin.map((k) => `<li class="${k.member.isPlayer ? 'me' : ''}">
      <span class="kin-dot" style="background:${aspectOf(k.member.aspect).color}" title="${aspectOf(k.member.aspect).name}"></span>
      <span class="kin-name">${esc(k.member.name)}${k.member.isPlayer ? ' (you)' : ''}</span>${dayDots(k.days, today)}<span class="kin-km">${dist(k.km)}</span>
      ${k.bonded ? '<span class="pill ok">Bonded</span>' : `<span class="pill dim">${AWAKENING.bondDays - k.days.length} to go</span>`}</li>`).join('')}</ul>
    <div class="row gap">
      <button class="btn" data-go="chat">💬 Rally in chat</button>
      <button class="btn" id="sim" title="Prototype: other members and rival clans act, then the clock advances one day">⏩ Simulate a day</button>
      <button class="btn" id="invite">Invite</button>
    </div>
    <p class="muted small">Prototype: kin and rival clans are simulated. "Simulate a day" lets them move, collects vigil tribute, lets rivals siege, and advances the demo clock.</p>
  </section>

  <section class="card">
    <div class="card-head"><div><div class="eyebrow">Clan journey · ${route.tier}</div><h2>${esc(route.name)}</h2></div><span class="small">${dist(clan.journeyKm)} / ${dist(route.lengthKm)}</span></div>
    <div class="bar"><i style="width:${Math.round((clan.journeyKm / route.lengthKm) * 100)}%"></i></div>
    <p class="muted small">${nx ? `Next: <b>${esc(nx.wp.name)}</b> in ${dist(nx.wp.km - clan.journeyKm)}. Everyone's distance moves the clan along this virtual route and unlocks lore.` : 'Arrived.'}</p>
  </section>

  <section class="card">
    <h2>Clan Powers</h2>
    <div class="powers">${Object.values(POWERS).map((pw) => `<div class="power ${st.dominant === pw.id ? 'lead' : ''}"><span>${pw.icon}</span><div><b>${pw.name}</b><small>${pw.effect}</small></div></div>`).join('')}</div>
    <p class="muted small">The Aspect with the most energy this week decides the Power. Keep every Aspect under ${Math.round(AWAKENING.convergenceShare * 100)}% to awaken Convergence.</p>
    <button class="btn ghost" id="leave">Leave clan</button>
  </section>`;
}
function clanPickerView() {
  return `<section class="card"><h2>You haven't joined a clan yet</h2><p class="muted">Clans live on the map. Each one has a Hearth in a Seattle neighborhood.</p><button class="btn primary" id="to-clans">Find clans on the map</button></section>`;
}
bind.clan = function () {
  $('#to-clans')?.addEventListener('click', () => { tab = 'map'; mapLayer = 'clans'; sel = null; render(); });
  view.querySelectorAll('[data-join]').forEach((b) => b.addEventListener('click', () => { commit(G.joinClan(state, b.dataset.join)); toast(`🔥 You joined <b>${esc(G.playerClan(state).name)}</b>. Move on ${AWAKENING.bondDays} days this week to become Bonded.`, 'good'); }));
  $('#found-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try { commit(G.foundClan(state, { name: fd.get('name'), motto: fd.get('motto') })); toast('🔥 Your clan fire is lit. Two wanderers answered the call.', 'epic'); } catch (err) { toast(esc(err.message), 'bad'); }
  });
  $('#leave')?.addEventListener('click', (e) => armConfirm(e.currentTarget, 'Tap again to leave', () => { const rc = remoteClan(); G.leaveClan(state); commit(); if (rc) remoteTry(() => backend.leaveClan()); }));
  view.querySelectorAll('[data-band]').forEach((b) => b.addEventListener('click', () => { try { commit(G.joinBand(state, b.dataset.band)); } catch (err) { toast(esc(err.message), 'bad'); } }));
  $('#band-form')?.addEventListener('submit', (e) => { e.preventDefault(); try { commit(G.createBand(state, Object.fromEntries(new FormData(e.target)))); } catch (err) { toast(esc(err.message), 'bad'); } });
  $('#sim')?.addEventListener('click', () => { commit(G.simulateDay(state)); toast(`⏩ A day passes. It's now ${fmtDay(now())}.`); });
  $('#invite')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(`Join my clan "${G.playerClan(state).name}" on Wildbound. Move together, hold the city.`); toast('Invite text copied.'); }
    catch { toast('Invites arrive with the multiplayer backend (see roadmap).'); }
  });
};

// ---------- CHAT ----------
function chatView() {
  const clan = G.playerClan(state);
  if (!clan) return '<section class="card"><h2>Clan chat</h2><p class="muted">Join a clan to talk with your kin.</p><button class="btn primary" data-go="clan">Find a clan</button></section>';
  const st = G.clanStatus(clan);
  const rallied = state.rallyDay === G.dayKey(now());
  let lastDay = '';
  const bands = G.myBands(state);
  if (!chatChannel || !(chatChannel === clan.id || bands.some((b) => `${clan.id}/${b.id}` === chatChannel))) chatChannel = clan.id;
  const items = (state.chat[chatChannel] || []).map((m) => {
    const day = G.dayKey(new Date(m.ts));
    const sep = day !== lastDay ? `<li class="day-sep"><span>${fmtDay(m.ts)}</span></li>` : '';
    lastDay = day;
    if (m.kind === 'system') return `${sep}<li class="sys"><span>${esc(m.text)}</span></li>`;
    const mine = m.from?.isPlayer;
    const who = m.from ? `<span class="who" style="color:${aspectOf(m.from.aspect).color}">${esc(m.from.name)}</span>` : '';
    if (m.kind === 'activity') {
      const x = m.act;
      return `${sep}<li class="msg act-card ${mine ? 'mine' : ''}">${who}<div class="bubble"><span class="feed-icon" style="--c:${aspectOf(x.aspect).color}">${x.icon}</span><span><b>${x.label}</b> · ${x.minutes} min${x.place ? ` · ${esc(x.place)}` : ''}<small>+${dist(x.km)} of ${aspectOf(x.aspect).name} energy</small></span>
        <button class="cheer ${m.cheered ? 'on' : ''}" data-cheer="${m.id}" ${mine || m.cheered ? 'disabled' : ''}>👏 ${m.cheers || ''}</button></div><time>${fmtTime(m.ts)}</time></li>`;
    }
    return `${sep}<li class="msg ${mine ? 'mine' : ''} ${m.kind === 'rally' ? 'rally' : ''}">${mine ? '' : who}<div class="bubble">${esc(m.text)}</div><time>${fmtTime(m.ts)}</time></li>`;
  }).join('');
  return `
  <section class="card chat-card">
    <div class="chat-head">
      <div class="grow"><b>${aspectOf(clan.aspect).spirit.glyph} ${esc(clan.name)}</b><small class="muted">${clan.members.length} kin · gauge ${Math.round(st.pct * 100)}% · ${st.bonded.length}/${st.bondNeeded} Bonded · ${G.heldVigils(state, clan.id).length} vigils</small></div>
      <button class="btn small ${rallied ? '' : 'primary'}" id="rally" ${rallied ? 'disabled' : ''}>${rallied ? 'Rallied today' : '🔥 Rally'}</button>
    </div>
    <div class="channels"><button class="chip ${chatChannel === clan.id ? 'on' : ''}" data-ch="${clan.id}">🔥 Whole clan</button>${bands.map((b) => `<button class="chip ${chatChannel === `${clan.id}/${b.id}` ? 'on' : ''}" data-ch="${clan.id}/${b.id}">${ACTIVITIES[b.type].icon} ${esc(b.name)}</button>`).join('')}${bands.length ? '' : '<span class="muted small">Join a band in the Clan tab to get its channel.</span>'}</div>
    <ul class="chat" id="chat-list">${items || '<li class="sys"><span>No messages yet. Say hi!</span></li>'}</ul>
    <div class="quick">${['Who\'s up for a walk tonight?', 'Let\'s take a vigil this weekend', 'Gym then soccer today 💪', 'Feeling tired today'].map((q) => `<button class="chip" data-quick="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <form id="chat-form" class="composer"><input id="chat-input" maxlength="280" placeholder="Message ${esc(clan.name)}…" autocomplete="off" /><button class="btn primary" type="submit">Send</button></form>
  </section>
  <p class="muted small center">${clan.remote ? 'Live chat · synced with your clan.' : 'Demo clan: replies are simulated. Connect the backend (Me → Settings) and create a real clan for live chat.'}</p>`;
}
bind.chat = function () {
  const list = $('#chat-list');
  if (list) list.scrollTop = list.scrollHeight;
  const send = (t) => { if (!t.trim()) return; commit(G.postMessage(state, t, now(), chatChannel)); setTimeout(() => $('#chat-input')?.focus(), 0); };
  view.querySelectorAll('[data-ch]').forEach((b) => b.addEventListener('click', () => { chatChannel = b.dataset.ch; render(); }));
  $('#chat-form')?.addEventListener('submit', (e) => { e.preventDefault(); send($('#chat-input').value); });
  view.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => send(b.dataset.quick)));
  view.querySelectorAll('[data-cheer]').forEach((b) => b.addEventListener('click', () => commit(G.cheer(state, b.dataset.cheer))));
  $('#rally')?.addEventListener('click', () => { try { commit(G.rally(state)); } catch (err) { toast(esc(err.message), 'bad'); } });
};

// ---------- RANKS ----------
function ranksView() {
  const ranks = G.weeklyRanks(state);
  const mine = ranks.find((r) => r.clan.id === state.clanId);
  const seg = (id, l) => `<button class="${ranksTab === id ? 'active' : ''}" data-rtab="${id}">${l}</button>`;
  let body = '';
  if (ranksTab === 'clans') {
    body = `<p class="muted small">Score = distance per member × share of kin Bonded, + 15 per vigil held. Everyone moving beats one athlete carrying the clan.</p>
    <div class="table-wrap"><table class="ranks"><thead><tr><th>#</th><th>Clan</th><th class="num hide-sm">${dUnit()}/member</th><th class="num">Bonded</th><th class="num">Vigils</th><th class="num">Score</th></tr></thead>
    <tbody>${ranks.map((r) => `<tr class="${r.clan.id === state.clanId ? 'me' : ''}"><td><b>${r.rank}</b> ${r.delta > 0 ? `<span class="up">▲${r.delta}</span>` : r.delta < 0 ? `<span class="down">▼${-r.delta}</span>` : ''}</td>
      <td><span class="kin-dot" style="background:${aspectOf(r.clan.aspect).color}"></span>${esc(r.clan.name)}</td><td class="num hide-sm">${distNum(r.perMember)}</td><td class="num">${Math.round(r.bondShare * 100)}%</td><td class="num">${r.vigils}</td><td class="num"><b>${r.score}</b></td></tr>`).join('')}</tbody></table></div>`;
  } else if (ranksTab === 'kin') {
    const clan = G.playerClan(state);
    if (!clan) body = '<p class="muted">Join a clan to see your kin.</p>';
    else {
      const kin = G.kinStats(clan);
      const top = (f) => [...kin].sort((x, y) => f(y) - f(x))[0];
      const aw = (i, t, k, v, why) => `<div class="award"><span>${i}</span><small>${t}</small><b>${esc(k.member.name)}${k.member.isPlayer ? ' (you)' : ''}</b><em>${v}</em><small class="muted">${why}</small></div>`;
      const tb = top((k) => k.km), sf = top((k) => k.days.length), wf = top((k) => k.types);
      body = `<div class="awards">${aw('🏃', 'Trailblazer', tb, dist(tb.km), 'Most distance')}${aw('🔥', 'Steady Flame', sf, `${sf.days.length} days`, 'Most active days')}${aw('🧭', 'Wayfinder', wf, `${wf.types} types`, 'Most variety')}</div>
      <div class="table-wrap"><table class="ranks"><thead><tr><th>#</th><th>Kin</th><th class="hide-sm">This week</th><th class="num">${dUnit()}</th></tr></thead>
      <tbody>${kin.map((k, i) => `<tr class="${k.member.isPlayer ? 'me' : ''}"><td><b>${i + 1}</b></td><td><span class="kin-dot" style="background:${aspectOf(k.member.aspect).color}"></span>${esc(k.member.name)} ${k.bonded ? '<span class="pill ok">Bonded</span>' : ''}</td><td class="hide-sm">${dayDots(k.days, G.weekdayIdx(now()))}</td><td class="num">${distNum(k.km)}</td></tr>`).join('')}</tbody></table></div>`;
    }
  } else if (ranksTab === 'vigils') {
    body = `<div class="table-wrap"><table class="ranks"><thead><tr><th>Landmark</th><th>Held by</th><th class="num">Ward</th><th class="num hide-sm">✦/day</th></tr></thead><tbody>
      ${VIGILS.map((s) => { const vs = G.vigilState(state, s.id); const c = clanColor(vs.holderClan); return `<tr class="${vs.holder && vs.holder === state.clanId ? 'me' : ''}"><td><b>${esc(s.name)}</b></td><td>${vs.holderClan ? `<span class="kin-dot" style="background:${c}"></span>${esc(vs.holderClan.name)}` : '<span class="muted">Open</span>'}</td><td class="num">${vs.ward}</td><td class="num hide-sm">${s.yield}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  } else {
    const tot = Object.fromEntries(ASPECT_IDS.map((x) => [x, 0]));
    state.clans.forEach((c) => ASPECT_IDS.forEach((x) => { tot[x] += c.week.energy[x] || 0; }));
    const max = Math.max(...Object.values(tot), 1), sum = Object.values(tot).reduce((p, q) => p + q, 0) || 1;
    body = `<p class="muted small">Every activity charges its Aspect's energy across Seattle this week.</p>
    <div class="elements-bars">${ASPECT_IDS.map((x) => `<div style="--c:${ASPECTS[x].color}"><span>${ASPECTS[x].spirit.glyph} ${ASPECTS[x].name}</span><span class="mbar"><i style="width:${Math.round((tot[x] / max) * 100)}%"></i></span><b>${Math.round((tot[x] / sum) * 100)}%</b></div>`).join('')}</div>`;
  }
  return `
  ${mine ? `<section class="card rank-hero" style="--c:${aspectOf(mine.clan.aspect).color}"><div class="big-rank">#${mine.rank}<small>of ${ranks.length}</small></div>
    <div class="grow"><div class="eyebrow">Seattle · this week</div><h2>${esc(mine.clan.name)}</h2><p class="muted small">${mine.delta > 0 ? `▲ Up ${mine.delta} from last week.` : mine.delta < 0 ? `▼ Down ${-mine.delta}.` : 'Same place as last week.'} ${mine.vigils} vigil${mine.vigils === 1 ? '' : 's'} held.</p></div></section>` : ''}
  <section class="card"><div class="segmented">${seg('clans', 'Clans')}${seg('kin', 'Your kin')}${seg('vigils', 'Vigils')}${seg('aspects', 'Aspects')}</div>${body}</section>`;
}
bind.ranks = function () { view.querySelectorAll('[data-rtab]').forEach((b) => b.addEventListener('click', () => { ranksTab = b.dataset.rtab; render(); })); };

// ---------- ME (spirit, shop, gear, lore, settings) ----------
function meView() {
  const p = state.player;
  const a = aspectOf(p.primary);
  const ess = G.totalEssence(state);
  const pr = G.spiritProgress(ess);
  const av = p.avatar || {};
  const loreTotal = VIGILS.length + EXPEDITIONS.reduce((s, e) => s + e.waypoints.length, 0);
  return `
  <section class="card spirit-row" style="--c:${a.color}">
    <div class="spirit-orb stage-${pr.stage}"><span>${a.spirit.glyph}</span></div>
    <div class="grow"><div class="eyebrow">${a.name} · ${a.domain}</div><h2>${a.spirit.name} <small>the ${a.stages[pr.stage]}</small></h2>
      <div class="bar"><i style="width:${Math.round(pr.pct * 100)}%"></i></div>
      <div class="muted small">${pr.nextAt ? `${ess.toLocaleString()} / ${pr.nextAt.toLocaleString()} XP to <b>${a.stages[pr.stage + 1]}</b>` : 'Final form reached'} · streak ${G.streak(state)} days · ${dist(G.totalTrailKm(state))} moved</div></div>
  </section>
  <section class="card">
    <h2>Your Aspects</h2>
    <p class="muted small">Primary ×${AFFINITY.primary}, secondary ×${AFFINITY.secondary} spirit growth. Clan energy always counts in full, whatever you do.</p>
    <div class="aspect-pick">${Object.values(ASPECTS).map((x) => `<div class="ap ${p.primary === x.id ? 'pri' : p.secondary === x.id ? 'sec' : ''}" style="--c:${x.color}"><span>${x.spirit.glyph}</span><b>${x.name}</b><small>${x.domain}</small>
      <div class="ap-btns"><button class="chip ${p.primary === x.id ? 'on' : ''}" data-pri="${x.id}">Primary</button><button class="chip ${p.secondary === x.id ? 'on' : ''}" data-sec="${x.id}" ${p.primary === x.id ? 'disabled' : ''}>Secondary</button></div></div>`).join('')}</div>
    <div class="swatch-row"><span>Outfit</span>${OUTFITS.map((c) => `<button class="swatch ${av.outfit === c ? 'on' : ''}" data-outfit="${c}" style="background:${c}" aria-label="Outfit ${c}"></button>`).join('')}</div>
    <div class="swatch-row"><span>Skin</span>${SKINS.map((c) => `<button class="swatch ${av.skin === c ? 'on' : ''}" data-skin="${c}" style="background:${c}" aria-label="Skin ${c}"></button>`).join('')}</div>
  </section>
  <section class="card">
    <div class="card-head"><div><h2>Lumen shop</h2><p class="muted small">Earn ✦ Lumens from vigil tribute (daily) and clan Awakenings. Spend them on rewards that matter in-game.</p></div>${lum(state.lumens)}</div>
    <div class="shop">${SHOP.map((i) => {
      const owned = i.kind === 'aura' && state.inventory.auras.includes(i.id);
      const equipped = state.inventory.aura === i.id;
      return `<div class="item ${owned ? 'owned' : ''}"><span class="item-ic" ${i.color ? `style="--ic:${i.color}"` : ''}>${i.icon}</span><div class="grow"><b>${i.name}</b><small>${i.desc}</small></div>
        <button class="btn small ${owned ? '' : 'primary'}" data-buy="${i.id}" ${equipped || (!owned && state.lumens < i.price) ? 'disabled' : ''}>${equipped ? 'Equipped' : owned ? 'Equip' : `✦ ${i.price}`}</button></div>`;
    }).join('')}</div>
    <p class="muted small">Roadmap: seasonal partner perks (park passes, gear-shop discounts) for clans that hold vigils all season.</p>
  </section>
  <section class="card">
    <h2>Badges &amp; gear</h2>
    <p class="muted small">Every badge unlocks gear your avatar wears on the map.</p>
    <div class="badges">${Object.entries(BADGES).map(([id, b]) => `<div class="badge ${state.badges.includes(id) ? 'earned' : ''}"><span>${b.icon}</span><b>${b.name}</b><small>${b.desc}</small><em>${state.badges.includes(id) ? '✓ Wearing' : 'Unlocks'}: ${b.gear}</em></div>`).join('')}</div>
  </section>
  <section class="card">
    <h2>Lore codex <small class="muted">${state.unlockedLore.length} / ${loreTotal}</small></h2>
    <details class="codex" open><summary><b>Seattle landmarks</b> <span class="muted small">visit in person</span></summary><ul>
      ${VIGILS.map((s) => state.unlockedLore.includes(`vigil:${s.id}`) ? `<li><b>${esc(s.name)}</b><p>${esc(s.lore)}</p></li>` : `<li class="locked"><b>${esc(s.name)}</b><p class="muted">Visit to unlock.</p></li>`).join('')}</ul></details>
    ${EXPEDITIONS.map((r) => { const f = r.waypoints.filter((_, i) => state.unlockedLore.includes(`${r.id}:${i}`)).length; return `<details class="codex"><summary><b>${r.name}</b> <span class="muted small">${f}/${r.waypoints.length}</span></summary><ul>${r.waypoints.map((wp, i) => state.unlockedLore.includes(`${r.id}:${i}`) ? `<li><b>${esc(wp.name)}</b><p>${esc(wp.lore)}</p></li>` : '<li class="locked"><b>???</b></li>').join('')}</ul></details>`; }).join('')}
  </section>
  <section class="card">
    <h2>Settings</h2>
    <div class="segmented small-seg"><button class="${imperial() ? 'active' : ''}" data-units="mi">Miles · feet</button><button class="${imperial() ? '' : 'active'}" data-units="km">Kilometres · metres</button></div>
    <h3>Map</h3>
    <div class="segmented small-seg"><button class="${state.settings.mapEngine !== 'google' ? 'active' : ''}" data-engine="builtin">Wildbound 3D (built-in)</button><button class="${state.settings.mapEngine === 'google' ? 'active' : ''}" data-engine="google">Google Photorealistic 3D</button></div>
    <form id="key-form" class="row"><input id="gkey" type="password" autocomplete="off" placeholder="Google Maps API key (stored only in this browser)" value="${esc(readKey())}" /><button class="btn" type="submit">Save key</button></form>
    <p class="muted small">Google 3D needs your own key (Maps JavaScript API + Map Tiles API), restricted to your site's address. It runs on the GitHub Pages / installed app version, not inside the Claude preview.</p>
    <h3>Backend (Supabase)</h3>
    ${backendSettings()}
    <h3>Data</h3>
    <button class="btn ghost" id="reset">Reset prototype data</button>
  </section>`;
}
function backendSettings() {
  const cfg = readConfig();
  const st = backend.status;
  const pill = { offline: '<span class="pill dim">Offline · local only</span>', connecting: '<span class="pill">Connecting…</span>', 'signed-out': '<span class="pill">Connected · sign in to sync</span>', online: '<span class="pill ok">Online · syncing</span>', error: `<span class="pill" style="color:var(--bad)">Error: ${esc(backend.error)}</span>` }[st];
  return `<div class="backend">${pill}
    <form id="be-form" class="stack"><input id="be-url" placeholder="https://YOUR-PROJECT.supabase.co" value="${esc(cfg.url)}" autocomplete="off" /><input id="be-key" placeholder="anon public key" value="${esc(cfg.key)}" autocomplete="off" /><button class="btn" type="submit">Save &amp; connect</button></form>
    ${st === 'signed-out' ? '<form id="be-login" class="row"><input id="be-email" type="email" placeholder="you@example.com" required /><button class="btn primary" type="submit">Email me a sign-in link</button><button class="btn" type="button" id="be-guest">Continue as guest</button></form>' : ''}
    ${st === 'online' ? `<p class="small">Signed in as <b>${esc(backend.user?.email || 'guest')}</b>. <button class="btn small" id="be-sync">Sync now</button> <button class="btn small ghost" id="be-out">Sign out</button></p>` : ''}
    <p class="muted small">Run <code>supabase/schema.sql</code> in your Supabase project, then paste its URL and anon key here (or in <code>config.js</code>). The anon key is meant to be public; the database rules decide who can read and write what.</p></div>`;
}
bind.me = function () {
  $('#be-form')?.addEventListener('submit', async (e) => { e.preventDefault(); saveConfig({ url: $('#be-url').value, key: $('#be-key').value }); await backend.connect(); if (backend.online) { await remoteTry(() => backend.saveProfile(state.player)); await remoteTry(pullAndMerge); } render(); });
  $('#be-login')?.addEventListener('submit', async (e) => { e.preventDefault(); try { await backend.signInEmail($('#be-email').value); toast('Check your email for the sign-in link, then open it on this device.', 'good'); } catch (err) { toast(esc(err.message), 'bad'); } });
  $('#be-guest')?.addEventListener('click', async () => { try { await backend.signInGuest(); } catch (err) { toast(`${esc(err.message)} (enable Anonymous sign-ins in Supabase → Authentication).`, 'bad'); } });
  $('#be-sync')?.addEventListener('click', () => remoteTry(pullAndMerge).then(() => toast('Synced.', 'good')));
  $('#be-out')?.addEventListener('click', async () => { await backend.signOut(); render(); });
  view.querySelectorAll('[data-pri]').forEach((b) => b.addEventListener('click', () => { G.setAspects(state, b.dataset.pri, state.player.secondary); commit(); }));
  view.querySelectorAll('[data-sec]').forEach((b) => b.addEventListener('click', () => { const s = b.dataset.sec; G.setAspects(state, state.player.primary, state.player.secondary === s ? null : s); commit(); }));
  view.querySelectorAll('[data-outfit]').forEach((b) => b.addEventListener('click', () => { state.player.avatar = { ...state.player.avatar, outfit: b.dataset.outfit }; commit(); }));
  view.querySelectorAll('[data-skin]').forEach((b) => b.addEventListener('click', () => { state.player.avatar = { ...state.player.avatar, skin: b.dataset.skin }; commit(); }));
  view.querySelectorAll('[data-units]').forEach((b) => b.addEventListener('click', () => { state.settings.units = b.dataset.units; commit(); }));
  view.querySelectorAll('[data-engine]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.engine === 'google' && !readKey()) { toast('Add a Google Maps API key first.', 'bad'); return; }
    state.settings.mapEngine = b.dataset.engine; commit();
  }));
  view.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => { try { commit(G.buy(state, b.dataset.buy)); } catch (err) { toast(esc(err.message), 'bad'); } }));
  $('#key-form').addEventListener('submit', (e) => { e.preventDefault(); try { localStorage.setItem(GMAPS_KEY, $('#gkey').value.trim()); toast('Key saved in this browser.', 'good'); } catch { toast('Couldn\'t save the key here.', 'bad'); } });
  $('#reset').addEventListener('click', (e) => armConfirm(e.currentTarget, 'Tap again to erase everything', () => { state = store.reset(); tab = 'map'; onboard = { primary: null, secondary: null }; draft = freshDraft(); render(); }));
};

// ---------- boot ----------
const bootEvents = state.player ? G.catchUp(state) : [];
save();
render();
backend.connect().then(async () => {
  if (backend.online && state.player) { await remoteTry(() => backend.saveProfile(state.player), true); await remoteTry(pullAndMerge, true); }
  renderChip();
  if (tab === 'me') render();
});
if (bootEvents.length) { toast('While you were away, your kin and rivals kept moving.'); announce(bootEvents.filter((e) => ['tribute', 'lost', 'awaken'].includes(e.type))); }
if ('serviceWorker' in navigator && window.top === window && /^https:|^http:\/\/localhost/.test(location.href)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

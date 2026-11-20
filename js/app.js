// Wildbound — UI layer (vanilla JS modules, no build step).
import { ELEMENTS, ACTIVITIES, INTENSITY, EXPEDITIONS, BADGES, AWAKENING, POWERS, BUILDINGS, PLACES, HOME } from './data.js';
import * as G from './engine.js';
import * as store from './store.js';
import { SOURCES, fetchRecent } from './sync.js';
import { createWorld } from './world3d.js';

const bind = {}; // per-tab event binders
let state = store.load();
let tab = 'home';
let ranksTab = 'clans';
let onboardPick = null;
let world;          // lazily created 3D world (null if WebGL is unavailable)
let worldFailed = false;
const freshDraft = () => ({ type: null, when: 'today', minutes: 30, distance: '', steps: '', elev: '', intensity: 'moderate', place: '', note: '' });
let draft = freshDraft();

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const now = () => G.worldNow(state);

// ---------- units (Seattle default: miles / feet) ----------
const imperial = () => (state.settings?.units || 'mi') === 'mi';
const num = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString(undefined, { maximumFractionDigits: d });
const dist = (km, d = 1) => (imperial() ? `${num(km / G.KM_PER_MI, d)} mi` : `${num(km, d)} km`);
const distNum = (km, d = 1) => (imperial() ? num(km / G.KM_PER_MI, d) : num(km, d));
const dUnit = () => (imperial() ? 'mi' : 'km');
const elev = (m) => (imperial() ? `${Math.round(m * 3.28084).toLocaleString()} ft` : `${Math.round(m).toLocaleString()} m`);
const eUnit = () => (imperial() ? 'ft' : 'm');
const fmtDay = (d, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => new Date(d).toLocaleDateString(undefined, opts);
const fmtTime = (d) => new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const SKINS = ['#f1c7a5', '#d9a37e', '#b97c55', '#8d5a3b', '#6b4430', '#e8b896'];
const OUTFITS = ['#3f6f8f', '#7a4f9a', '#b5523b', '#3e7d57', '#c08a2e', '#2f3b52'];
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function commit(events = []) {
  store.save(state);
  render();
  announce(events);
}

// Two-step confirm inside the page (native dialogs are blocked in embedded viewers).
function armConfirm(btn, labelText, action) {
  if (btn.dataset.armed) { action(); return; }
  const original = btn.textContent;
  btn.dataset.armed = '1';
  btn.textContent = labelText;
  btn.classList.add('danger');
  setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = original; btn.classList.remove('danger'); } }, 3500);
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
  const lore = events.filter((e) => e.type === 'lore' && !e.quiet).map((e) => e.waypoint.name);
  const trials = events.filter((e) => e.type === 'trial');
  for (const e of events) {
    if (e.quiet) continue;
    switch (e.type) {
      case 'awaken': out.push([0, `⚡ <b>Your clan AWAKENED!</b> ${e.power.icon} ${esc(e.power.name)} is active for 2 weeks.${e.building ? ` A ${esc(e.building.name)} rises in camp.` : ''}`, 'epic']); break;
      case 'journey': out.push([0, `🏔️ Journey complete: <b>${esc(e.route.name)}</b>! +200 essence. Next: ${esc(e.next.name)}`, 'epic']); break;
      case 'evolve': { const el = ELEMENTS[state.player.element]; out.push([0, `✨ ${el.spirit.name} evolved into <b>${el.stages[e.stage]}</b> form!`, 'epic']); break; }
      case 'tier': out.push([1, `🔥 Clan gauge <b>${e.tier.name}</b>: +${e.tier.reward} essence`, 'good']); break;
      case 'badge': out.push([1, `${e.badge.icon} <b>${esc(e.badge.name)}</b> earned. New gear: ${esc(e.badge.gear)}`, 'good']); break;
      case 'week': out.push([1, `📅 New week. Last week your clan reached ${Math.round(e.result.pct * 100)}%${e.result.awakened ? ' and awakened ⚡' : ''}.`, '']); break;
      case 'logged': out.push([2, `+${e.entry.essence} essence · +${dist(e.entry.trailKm)} for the clan${e.entry.affinity ? ' <b>(affinity ×1.5)</b>' : ''}`, '']); break;
      case 'imported': out.push([2, e.count ? `${SOURCES[e.source].name}: imported ${e.count} activit${e.count === 1 ? 'y' : 'ies'} (verified ×1.1)` : `${SOURCES[e.source].name}: you're up to date`, 'good']); break;
      case 'checkin': out.push([1, `📍 Checked in at <b>${esc(e.place.name)}</b>: +60 essence`, 'good']); break;
      case 'rally': out.push([2, '🔥 Rally sent. Sleepy kin are more likely to move today.', '']); break;
      case 'cheer': out.push([3, `👏 +${G.CHEER_ESSENCE} essence for cheering`, '']); break;
    }
  }
  if (lore.length) out.push([1, lore.length === 1 ? `📜 Lore unlocked: <b>${esc(lore[0])}</b>` : `📜 ${lore.length} lore entries unlocked`, 'lore']);
  if (trials.length) out.push([2, trials.length === 1 ? `✅ Trial: ${esc(trials[0].trial.text)} <b>+${trials[0].trial.reward}</b>` : `✅ ${trials.length} trials complete <b>+${trials.reduce((s, t) => s + t.trial.reward, 0)}</b>`, 'good']);
  out.sort((a, b) => a[0] - b[0]).slice(0, 3).reverse().forEach(([, html, kind]) => toast(html, kind));
}

// ---------- shell ----------

function render() {
  world?.unmount();
  document.body.dataset.element = state.player?.element || 'none';
  const nav = $('#tabs');
  nav.hidden = !state.player;
  nav.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  renderChip();
  if (!state.player) { view.innerHTML = onboardingView(); bindOnboarding(); return; }
  const views = { home: homeView, log: logView, clan: clanView, chat: chatView, journey: journeyView, ranks: ranksView, journal: journalView };
  view.innerHTML = views[tab]();
  bind[tab]?.();
  if (tab !== 'chat') window.scrollTo({ top: 0 });
}

function renderChip() {
  const chip = $('#player-chip');
  if (!state.player) { chip.innerHTML = ''; return; }
  const el = ELEMENTS[state.player.element];
  const p = G.spiritProgress(G.totalEssence(state));
  const offset = state.dayOffset ? `<span class="demo-pill" title="Days simulated in this prototype">Demo: ${fmtDay(now(), { weekday: 'short', month: 'short', day: 'numeric' })}</span>` : '';
  chip.innerHTML = `${offset}<button class="chip-btn" data-go="journal" title="Your journal: gear, lore and settings"><span class="chip-glyph">${el.spirit.glyph}</span><span><b>${esc(state.player.name)}</b><small>${el.clanTitle} · Lv ${p.level}</small></span></button>`;
}

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  render();
});
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) { tab = go.dataset.go; render(); }
});

// ---------- onboarding ----------

function onboardingView() {
  return `
  <section class="hero">
    <div class="eyebrow">Seattle · season one</div>
    <h1>Move together.<br/>Awaken your clan.</h1>
    <p class="lead">Humans evolved walking, carrying and climbing in tribes. In Wildbound, every walk, lift, swim and match charges your clan's spirit. When enough of your kin move each week, the clan <b>awakens a Power</b> that boosts everyone, raises a new building in your camp, and carries you further along real trails, from Discovery Park to the Wonderland Trail around Rainier.</p>
  </section>
  <section class="card">
    <h2>1 · Choose your element</h2>
    <p class="muted">Your spirit grows ×1.5 faster from its own movements, but every kind of movement counts for the clan.</p>
    <div class="element-grid">
      ${Object.values(ELEMENTS).map((el) => `
        <button class="element-card ${onboardPick === el.id ? 'picked' : ''}" data-el="${el.id}" style="--c:${el.color}">
          <div class="element-glyph">${el.spirit.glyph}</div>
          <div class="element-name">${el.name} <small>· ${el.clanTitle}</small></div>
          <div class="element-spirit">${el.spirit.name}, the ${el.spirit.kind}</div>
          <p>${el.blurb}</p>
          <div class="affinity">${el.affinity.map((a) => `<span>${ACTIVITIES[a].icon} ${ACTIVITIES[a].label}</span>`).join('')}</div>
          <div class="power-hint">${POWERS[el.id].icon} Clan power: <b>${POWERS[el.id].name}</b></div>
        </button>`).join('')}
    </div>
  </section>
  <section class="card">
    <h2>2 · Name your wanderer</h2>
    <form id="onboard-form" class="row">
      <input id="pname" maxlength="24" placeholder="Your trail name" autocomplete="nickname" required />
      <button class="btn primary" type="submit">Bind my spirit →</button>
    </form>
    <p id="onboard-err" class="err"></p>
  </section>`;
}

function bindOnboarding() {
  view.querySelectorAll('.element-card').forEach((b) => b.addEventListener('click', () => {
    onboardPick = b.dataset.el;
    const name = $('#pname').value;
    render();
    $('#pname').value = name;
  }));
  $('#onboard-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!onboardPick) { $('#onboard-err').textContent = 'Choose an element first.'; return; }
    G.createPlayer(state, { name: $('#pname').value, element: onboardPick });
    state.player.avatar = { outfit: OUTFITS[hash(state.player.name) % OUTFITS.length], skin: SKINS[1] };
    tab = 'clan';
    commit();
    const sp = ELEMENTS[onboardPick].spirit;
    toast(`${sp.glyph} ${sp.name} has bound to you. Now find your clan.`, 'epic');
  });
}

// ---------- shared pieces ----------

function gauge(st, big = false) {
  const ELS = ['earth', 'fire', 'water', 'air'];
  let used = 0;
  const segs = ELS.map((e) => {
    const w = Math.max(0, Math.min(100 - used, (st.energy[e] / st.target) * 100));
    used += w;
    return w > 0 ? `<i style="width:${w}%;background:${ELEMENTS[e].color}" title="${ELEMENTS[e].name}: ${dist(st.energy[e])}"></i>` : '';
  }).join('');
  const marks = AWAKENING.tiers.map((t) => `<b class="mark" style="left:${t.at * 100}%" title="${t.name}"></b>`).join('');
  return `<div class="gauge ${big ? 'big' : ''}">${segs}${marks}</div>`;
}

function tierPill(st) {
  if (st.awakened) return '<span class="pill awakened">⚡ Awakened</span>';
  if (st.tier) return `<span class="pill">${st.tier.name}</span>`;
  return '<span class="pill dim">Dormant</span>';
}

function dayDots(days, todayIdx) {
  return `<span class="dots">${DAYS.map((d, i) => `<i class="${days.includes(i) ? 'on' : ''} ${i === todayIdx ? 'today' : ''}" title="${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}">${d}</i>`).join('')}</span>`;
}

function myWeek(clan) {
  const days = clan?.week.days.me || [];
  return { days, bonded: days.length >= AWAKENING.bondDays };
}

function daysLeftInWeek() { return 6 - G.weekdayIdx(now()); }

// ---------- CAMP (3D) ----------

function worldModel() {
  const clan = G.playerClan(state);
  const st = clan ? G.clanStatus(clan) : null;
  const el = ELEMENTS[state.player.element];
  const av = state.player.avatar || {};
  const bondedIds = new Set(st ? st.bonded.map((m) => m.id) : []);
  return {
    player: {
      name: state.player.name, element: state.player.element, elColor: clan ? ELEMENTS[clan.element].color : el.color,
      color: av.outfit || OUTFITS[0], skin: av.skin || SKINS[1], gear: state.badges.filter((b) => b !== 'summit'), bonded: bondedIds.has('me'),
    },
    kin: clan ? clan.members.filter((m) => !m.isPlayer).map((m) => ({
      name: m.name, color: OUTFITS[hash(m.name) % OUTFITS.length], skin: SKINS[hash(m.name + 's') % SKINS.length],
      gear: ['kindred', ...(m.propensity > 0.6 ? ['first_steps'] : [])], elColor: ELEMENTS[clan.element].color, bonded: bondedIds.has(m.id),
    })) : [],
    buildings: clan ? clan.buildings : [],
    banner: state.badges.includes('summit'),
    clanColor: clan ? ELEMENTS[clan.element].color : el.color,
    spiritStage: G.spiritProgress(G.totalEssence(state)).stage,
    totem: st ? {
      colors: Object.fromEntries(Object.keys(ELEMENTS).map((k) => [k, ELEMENTS[k].color])),
      fill: Object.fromEntries(Object.keys(ELEMENTS).map((k) => [k, st.energy[k] / (st.target / 4)])),
      pct: st.pct, awakened: st.awakened,
    } : { colors: Object.fromEntries(Object.keys(ELEMENTS).map((k) => [k, ELEMENTS[k].color])), fill: { earth: 0, fire: 0, water: 0, air: 0 }, pct: 0, awakened: false },
  };
}

function homeView() {
  const el = ELEMENTS[state.player.element];
  const clan = G.playerClan(state);
  const st = clan ? G.clanStatus(clan) : null;
  const ess = G.totalEssence(state);
  const p = G.spiritProgress(ess);
  const trials = G.dailyTrials(state);
  const mw = myWeek(clan);
  const power = G.activePower(clan, now());
  return `
  <section class="world-wrap">
    <div id="world" class="world"></div>
    <div class="hud tl"><span class="hud-pill">${el.spirit.glyph} ${el.spirit.name} · ${el.stages[p.stage]}</span>${clan ? `<span class="hud-pill">${tierPill(st)} ${Math.round(st.pct * 100)}%</span>` : ''}${power ? `<span class="hud-pill">${power.icon} ${esc(power.name)}</span>` : ''}</div>
    <div class="hud tr">
      <button class="icon-btn" id="rain-btn" title="Toggle Seattle rain">☔</button>
      <button class="icon-btn" id="cam-btn" title="Reset view">⟲</button>
      <button class="icon-btn" data-go="journal" title="Customize your wanderer">✎</button>
    </div>
    <div class="hud bl"><span class="hint">Drag to look · tap the ground to walk · W A S D</span></div>
    <noscript>3D needs JavaScript.</noscript>
  </section>

  ${clan ? `
  <section class="card awaken-card">
    <div class="card-head"><div><div class="eyebrow">This week · ${daysLeftInWeek()} day${daysLeftInWeek() === 1 ? '' : 's'} left</div><h2>Awaken ${esc(clan.name)}</h2></div>${tierPill(st)}</div>
    ${gauge(st, true)}
    <div class="row-between small"><span><b>${dist(st.charged)}</b> of ${dist(st.target)} charged</span><span><b>${st.bonded.length}/${st.bondNeeded}</b> kin Bonded</span></div>
    ${st.awakened
      ? `<p class="callout good">${st.power.icon} <b>${esc(st.power.name)}</b> is active: ${esc(st.power.effect)}.</p>`
      : `<p class="callout">When the gauge is full <b>and</b> ${st.bondNeeded} kin are Bonded, the clan awakens <b>${st.power.icon} ${esc(st.power.name)}</b> (${esc(st.power.effect)}) and raises a new building in camp.</p>`}
    <h3>Your part</h3>
    <ul class="checklist">
      <li class="${mw.bonded ? 'done' : ''}"><span class="check">${mw.bonded ? '✓' : ''}</span><span>Be Bonded: move on ${AWAKENING.bondDays} different days ${dayDots(mw.days, G.weekdayIdx(now()))}</span></li>
      ${trials.map((t) => `<li class="${t.claimed ? 'done' : ''}"><span class="check">${t.claimed ? '✓' : ''}</span><span>${esc(t.text)}</span><b>+${t.reward}</b></li>`).join('')}
    </ul>
    <div class="row gap"><button class="btn primary" data-go="log">Log movement</button><button class="btn" data-go="clan">Clan details</button><button class="btn" data-go="chat">Chat</button></div>
  </section>` : `
  <section class="card"><h2>You're on your own</h2><p class="muted">Your camp is empty. Join a clan to share a fire, charge a weekly Awakening together, and walk real trails.</p><button class="btn primary" data-go="clan">Find a clan</button></section>`}

  <section class="card whisper"><span class="quote-mark">“</span>${esc(G.spiritWhisper(state))}</section>

  <section class="card spirit-row" style="--c:${el.color}">
    <div class="spirit-orb stage-${p.stage}"><span>${el.spirit.glyph}</span></div>
    <div class="grow">
      <div class="eyebrow">${el.name} spirit · ${el.virtue}</div>
      <h2>${el.spirit.name} <small>the ${el.stages[p.stage]}</small></h2>
      <div class="bar"><i style="width:${Math.round(p.pct * 100)}%"></i></div>
      <div class="muted small">${p.nextAt ? `${ess.toLocaleString()} / ${p.nextAt.toLocaleString()} essence to <b>${el.stages[p.stage + 1]}</b>` : 'Final form reached'} · <span class="stages">${el.stages.map((s, i) => `<span class="${i <= p.stage ? 'on' : ''}">${s}</span>`).join(' › ')}</span></div>
    </div>
  </section>

  <section class="stats">
    <div><b>${G.streak(state)}</b><span>day streak</span></div>
    <div><b>${distNum(G.totalTrailKm(state))}</b><span>trail ${dUnit()}</span></div>
    <div><b>${ess.toLocaleString()}</b><span>essence</span></div>
    <div><b>${state.badges.length}</b><span>gear pieces</span></div>
  </section>

  <section class="card">
    <h2>Recent movement</h2>
    ${state.activities.length ? `<ul class="feed">${state.activities.slice(0, 5).map(activityRow).join('')}</ul>` : '<p class="muted">Nothing yet. A 10-minute walk is enough to start your week.</p>'}
  </section>`;
}

function activityRow(a) {
  const act = ACTIVITIES[a.type];
  const src = a.source && a.source !== 'manual' ? `<span class="src" style="--sc:${SOURCES[a.source]?.color}">${SOURCES[a.source]?.name || a.source} ✓</span>` : '';
  return `<li>
    <span class="feed-icon" style="--c:${ELEMENTS[a.element].color}">${act.icon}</span>
    <span class="feed-main"><b>${act.label}</b> · ${a.minutes} min${a.distanceKm ? ` · ${dist(a.distanceKm)}` : ''}${a.elevM ? ` · ↑${elev(a.elevM)}` : ''} ${src}
      ${a.place || a.note ? `<em>${esc([a.place, a.note].filter(Boolean).join(' · '))}</em>` : ''}<small class="muted">${fmtDay(a.date)} · ${fmtTime(a.date)}</small></span>
    <span class="feed-score">+${a.essence}<small>${dist(a.trailKm)}</small></span>
  </li>`;
}

bind.home = function () {
  const host = $('#world');
  if (!world && !worldFailed) { world = createWorld(); worldFailed = !world; if (world) { const m = new Date().getMonth(); world.setRain(m >= 9 || m <= 3); } }
  if (!world) { host.innerHTML = '<div class="world-fallback">3D camp needs WebGL, which isn\'t available in this browser.</div>'; return; }
  world.mount(host);
  world.update(worldModel());
  $('#rain-btn').classList.toggle('on', world.rain);
  $('#rain-btn').addEventListener('click', (e) => { world.setRain(!world.rain); e.currentTarget.classList.toggle('on', world.rain); });
  $('#cam-btn').addEventListener('click', () => world.resetCamera());
};

// ---------- LOG ----------

function draftInput() {
  const act = ACTIVITIES[draft.type];
  const toKm = (v) => (Number(v) || 0) * (imperial() ? G.KM_PER_MI : 1);
  const date = draft.when === 'yesterday' ? G.addDays(now(), -1) : now();
  return {
    type: draft.type, minutes: Number(draft.minutes) || 0, intensity: draft.intensity,
    distanceKm: act?.distance ? toKm(draft.distance) : 0,
    steps: act?.steps ? Number(draft.steps) || 0 : 0,
    elevM: act?.elev ? (Number(draft.elev) || 0) / (imperial() ? 3.28084 : 1) : 0,
    place: draft.place, note: draft.note, date: date.toISOString(), source: 'manual',
  };
}

function impactPanel() {
  if (!draft.type) return `<div class="impact empty"><h3>What this does</h3><p class="muted">Pick an activity to see exactly what it earns you, your spirit and your clan.</p></div>`;
  const input = draftInput();
  const clan = G.playerClan(state);
  const power = G.activePower(clan, now());
  const sc = G.scoreActivity(input, { element: state.player.element, power });
  const el = ELEMENTS[state.player.element];
  const ess = G.totalEssence(state);
  const p = G.spiritProgress(ess + sc.essence);
  const rows = [];
  rows.push(`<li><span class="ic">${el.spirit.glyph}</span><span><b>+${sc.essence} essence</b> for ${el.spirit.name}${sc.affinity ? ' <span class="tag">affinity ×1.5</span>' : ''}${sc.verified ? ' <span class="tag">verified ×1.1</span>' : ''}${sc.boosted ? ` <span class="tag">${power.icon} power</span>` : ''}<small>${p.nextAt ? `${(ess + sc.essence).toLocaleString()} / ${p.nextAt.toLocaleString()} to ${el.stages[p.stage + 1]}` : 'Final form'}</small></span></li>`);
  if (clan) {
    const st = G.clanStatus(clan);
    const after = Math.min(1, (st.charged + sc.trailKm) / st.target);
    const ae = ELEMENTS[sc.element];
    rows.push(`<li><span class="ic" style="color:${ae.color}">●</span><span><b>+${dist(sc.trailKm)} of ${ae.name} energy</b> for the clan gauge<small>${Math.round(st.pct * 100)}% → ${Math.round(after * 100)}%${!st.awakened && after >= 1 && !st.bondOk ? ' · full, but more kin must be Bonded' : ''}</small></span></li>`);
    const mw = myWeek(clan);
    const d = G.weekdayIdx(new Date(input.date));
    const newDays = new Set([...mw.days, d]).size;
    rows.push(`<li><span class="ic">🤝</span><span>${mw.bonded ? '<b>You\'re Bonded</b> this week' : newDays >= AWAKENING.bondDays ? '<b>Makes you Bonded</b> this week' : `<b>Day ${newDays} of ${AWAKENING.bondDays}</b> toward Bonded`}<small>Bonded kin are what let the clan awaken</small></span></li>`);
    const route = G.getExpedition(clan.journeyId);
    const pos = G.routePosition(route, clan.journeyKm);
    if (pos.next) {
      const left = pos.next.km - clan.journeyKm - sc.trailKm;
      rows.push(`<li><span class="ic">🧭</span><span>${left <= 0 ? `<b>Reaches ${esc(pos.next.name)}</b> and unlocks its story` : `<b>${dist(left)} left</b> to ${esc(pos.next.name)}`}<small>${esc(route.name)}</small></span></li>`);
    }
  } else rows.push('<li><span class="ic">🔥</span><span>Join a clan to charge an Awakening with this.</span></li>');
  const tr = G.previewTrials(state, { ...sc, type: input.type, intensity: input.intensity });
  if (tr.length) rows.push(`<li><span class="ic">✅</span><span>Completes ${tr.map((t) => `<b>${esc(t.text)}</b> (+${t.reward})`).join(', ')}</span></li>`);
  return `<div class="impact"><h3>What this does</h3><ul>${rows.join('')}</ul></div>`;
}

function logView() {
  const el = state.player.element;
  const act = draft.type ? ACTIVITIES[draft.type] : null;
  const conn = state.connections || {};
  return `
  <section class="card">
    <div class="card-head"><div><h2>Sync automatically</h2><p class="muted small">Connect once and your workouts arrive on their own. Synced activities are verified and earn ×1.1 essence.</p></div></div>
    <div class="sources">
      ${Object.entries(SOURCES).map(([id, s]) => {
        const c = conn[id];
        return `<div class="source ${c ? 'on' : ''}" style="--sc:${s.color}">
          <span class="src-logo">${s.glyph}</span>
          <div class="grow"><b>${s.name}</b><small>${c ? `Connected · synced ${fmtTime(c.lastSync)}` : s.platform}</small></div>
          ${c ? `<button class="btn small" data-sync="${id}">Sync now</button><button class="btn small ghost" data-disc="${id}" title="Disconnect">✕</button>` : `<button class="btn small primary" data-connect="${id}">Connect</button>`}
        </div>`;
      }).join('')}
    </div>
    <p class="muted small">Prototype: Connect imports sample Seattle workouts so you can try the flow. Real sync is planned in docs/INTEGRATIONS.md (Strava OAuth, HealthKit in the iOS app, Health Connect on Android).</p>
  </section>

  <div class="log-layout">
    <section class="card">
      <h2>Or log it yourself</h2>
      <div class="activity-grid">
        ${Object.entries(ACTIVITIES).map(([id, a]) => `
          <button class="act ${draft.type === id ? 'picked' : ''}" data-act="${id}" style="--c:${ELEMENTS[a.element].color}">
            <span>${a.icon}</span>${a.label}${a.element === el ? '<i>×1.5</i>' : ''}
          </button>`).join('')}
      </div>
      <form id="log-form" class="log-form ${act ? '' : 'disabled'}" autocomplete="off">
        <fieldset class="chips wide"><legend>When</legend>
          ${['today', 'yesterday'].map((w) => `<label><input type="radio" name="when" value="${w}" ${draft.when === w ? 'checked' : ''}/><span>${w === 'today' ? 'Today' : 'Yesterday'}</span></label>`).join('')}
        </fieldset>
        <label>Duration (min)<input id="f-min" type="number" name="minutes" min="1" max="${G.MAX_MINUTES}" value="${esc(draft.minutes)}" required /></label>
        ${act?.distance ? `<label>Distance (${dUnit()})<input id="f-dist" type="number" name="distance" min="0" step="0.1" value="${esc(draft.distance)}" placeholder="optional" /></label>` : ''}
        ${act?.steps ? `<label>Steps<input id="f-steps" type="number" name="steps" min="0" step="100" value="${esc(draft.steps)}" placeholder="if no distance" /></label>` : ''}
        ${act?.elev ? `<label>Elevation gain (${eUnit()})<input id="f-elev" type="number" name="elev" min="0" step="10" value="${esc(draft.elev)}" placeholder="optional" /></label>` : ''}
        <fieldset class="chips wide"><legend>Effort</legend>
          ${Object.entries(INTENSITY).map(([k, v]) => `<label><input type="radio" name="intensity" value="${k}" ${draft.intensity === k ? 'checked' : ''}/><span>${v.label} <small>${v.hint}</small></span></label>`).join('')}
        </fieldset>
        <label class="wide">Where<input id="f-place" name="place" list="places" maxlength="60" value="${esc(draft.place)}" placeholder="e.g. Green Lake, Discovery Park, home gym" /></label>
        <datalist id="places">${PLACES.map((p) => `<option value="${esc(p.name)}">`).join('')}<option value="Burke-Gilman Trail"><option value="Rattlesnake Ledge"><option value="Mount Si"><option value="Home gym"></datalist>
        <label class="wide">Note<input id="f-note" name="note" maxlength="140" value="${esc(draft.note)}" placeholder="What did you see?" /></label>
        <button class="btn primary wide" type="submit" ${act ? '' : 'disabled'}>${act ? `Log ${act.label.toLowerCase()}` : 'Pick an activity'}</button>
      </form>
    </section>
    <aside class="card impact-card" id="impact">${impactPanel()}</aside>
  </div>`;
}

bind.log = function () {
  view.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => { sync(); draft.type = b.dataset.act; render(); }));
  const form = $('#log-form');
  function sync() {
    const fd = new FormData(form);
    for (const k of ['when', 'minutes', 'distance', 'steps', 'elev', 'intensity', 'place', 'note']) if (fd.has(k)) draft[k] = fd.get(k);
  }
  const refresh = () => { sync(); $('#impact').innerHTML = impactPanel(); };
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    sync();
    try {
      const events = G.logActivity(state, draftInput());
      draft = freshDraft();
      tab = 'home';
      commit(events);
    } catch (err) { toast(esc(err.message), 'bad'); }
  });
  view.querySelectorAll('[data-connect],[data-sync]').forEach((b) => b.addEventListener('click', () => {
    const src = b.dataset.connect || b.dataset.sync;
    b.disabled = true;
    b.textContent = b.dataset.connect ? 'Connecting…' : 'Syncing…';
    setTimeout(() => commit(G.importActivities(state, src, fetchRecent(src, now()))), 700);
  }));
  view.querySelectorAll('[data-disc]').forEach((b) => b.addEventListener('click', () => { G.disconnect(state, b.dataset.disc); commit(); }));
};

// ---------- CLAN ----------

function clanView() {
  const clan = G.playerClan(state);
  if (!clan) return clanPickerView();
  const el = ELEMENTS[clan.element];
  const st = G.clanStatus(clan);
  const power = G.activePower(clan, now());
  const kin = G.kinStats(clan);
  const today = G.weekdayIdx(now());
  const share = (e) => (st.charged ? Math.round((st.energy[e] / st.charged) * 100) : 0);
  return `
  <section class="card clan-banner" style="--c:${el.color}">
    <div class="clan-sigil">${el.spirit.glyph}</div>
    <div class="grow">
      <div class="eyebrow">${el.name} clan · ${clan.members.length} kin · ${clan.awakenings} awakening${clan.awakenings === 1 ? '' : 's'}</div>
      <h2>${esc(clan.name)}</h2>
      <p class="motto">“${esc(clan.motto)}”</p>
    </div>
    ${power ? `<div class="power-badge" title="${esc(power.effect)}">${power.icon}<b>${esc(power.name)}</b><small>until ${fmtDay(G.fromKey(clan.power.until), { month: 'short', day: 'numeric' })}</small></div>` : ''}
  </section>

  <section class="card">
    <div class="card-head"><div><div class="eyebrow">Weekly Awakening · resets Monday · ${daysLeftInWeek()} day${daysLeftInWeek() === 1 ? '' : 's'} left</div><h2>Charge the clan spirit</h2></div>${tierPill(st)}</div>
    ${gauge(st, true)}
    <div class="row-between small"><span><b>${dist(st.charged)}</b> / ${dist(st.target)} (${dist(AWAKENING.targetKmPerMember, 0)} per member)</span><span>${Math.round(st.pct * 100)}%</span></div>
    ${clan.history[0] ? `<p class="muted small">Last week: ${Math.round(clan.history[0].pct * 100)}% charged, ${clan.history[0].bonded}/${clan.history[0].members} Bonded, ${clan.history[0].awakened ? '<b>awakened ⚡</b>' : 'did not awaken'} · ranked #${clan.history[0].rank}</p>` : ''}
    <div class="tiers">
      ${AWAKENING.tiers.map((t) => {
        const done = st.awakened || (t.id !== 'awakened' && st.pct >= t.at);
        return `<div class="tier ${done ? 'done' : ''}"><b>${done ? '✓ ' : ''}${t.name}</b><small>${t.id === 'awakened' ? `100% + ${st.bondNeeded} Bonded` : `${Math.round(t.at * 100)}%`}</small><span>${t.desc}</span></div>`;
      }).join('')}
    </div>
    <div class="energy-legend">${['earth', 'fire', 'water', 'air'].map((e) => `<span style="--c:${ELEMENTS[e].color}"><i></i>${ELEMENTS[e].name} ${dist(st.energy[e])} · ${share(e)}%</span>`).join('')}</div>
    <p class="callout">${st.awakened ? `Awakened this week with <b>${st.power.icon} ${esc(st.power.name)}</b>.` : `Leading energy decides the Power. Right now: <b>${st.power.icon} ${esc(st.power.name)}</b> (${esc(st.power.effect)}). Mix all four elements with none above 40% to awaken <b>Elemental Convergence</b>.`}</p>
  </section>

  <section class="card">
    <div class="card-head"><h2>Kin this week</h2><span class="small"><b>${st.bonded.length}</b> / ${st.bondNeeded} Bonded needed</span></div>
    <p class="muted small">A member is <b>Bonded</b> after moving on ${AWAKENING.bondDays} different days. The clan can't awaken unless ${Math.round(AWAKENING.bondShare * 100)}% of its kin are Bonded, so every member matters, not just the fastest.</p>
    <ul class="kin">
      ${kin.map((k) => `<li class="${k.member.isPlayer ? 'me' : ''}">
        <span class="kin-dot" style="background:${ELEMENTS[k.member.element].color}" title="${ELEMENTS[k.member.element].name}"></span>
        <span class="kin-name">${esc(k.member.name)}${k.member.isPlayer ? ' (you)' : ''}</span>
        ${dayDots(k.days, today)}
        <span class="kin-km">${dist(k.km)}</span>
        ${k.bonded ? '<span class="pill ok">Bonded</span>' : `<span class="pill dim">${AWAKENING.bondDays - k.days.length} day${AWAKENING.bondDays - k.days.length === 1 ? '' : 's'} to go</span>`}
      </li>`).join('')}
    </ul>
    <div class="row gap">
      <button class="btn" data-go="chat">💬 Rally in chat</button>
      <button class="btn" id="sim" title="Prototype: other members move today, then the clock moves forward one day">⏩ Simulate a day</button>
      <button class="btn" id="invite">Invite friends</button>
    </div>
    <p class="muted small">Prototype: other members are simulated. "Simulate a day" lets them move and advances the demo clock, so you can watch a week play out.</p>
  </section>

  <section class="card">
    <h2>Camp buildings</h2>
    <p class="muted small">Each Awakening raises the next building in your 3D camp.</p>
    <div class="buildings">${BUILDINGS.map((b) => `<div class="building ${clan.buildings.includes(b.id) ? 'built' : ''}"><b>${clan.buildings.includes(b.id) ? '🏛️' : '🔒'} ${b.name}</b><small>${b.desc}</small></div>`).join('')}</div>
  </section>

  <section class="card">
    <h2>Clan Powers</h2>
    <div class="powers">${Object.values(POWERS).map((p) => `<div class="power ${st.dominant === p.id ? 'lead' : ''}"><span>${p.icon}</span><div><b>${p.name}</b><small>${p.effect}</small></div></div>`).join('')}</div>
    <div class="row gap"><button class="btn ghost" id="leave">Leave clan</button></div>
  </section>`;
}

function clanPickerView() {
  const mine = state.player.element;
  const ranks = G.weeklyRanks(state);
  const sorted = [...ranks].sort((a, b) => (b.clan.element === mine) - (a.clan.element === mine));
  return `
  <section class="card">
    <h2>Find your Seattle clan</h2>
    <p class="muted">A clan charges one weekly Awakening and walks one journey together. Kin of your element are listed first, but every clan welcomes every element.</p>
    <div class="clan-list">
      ${sorted.map(({ clan: c, st }) => {
        const el = ELEMENTS[c.element];
        return `<div class="clan-row" style="--c:${el.color}">
          <span class="clan-sigil sm">${el.spirit.glyph}</span>
          <div class="grow"><b>${esc(c.name)}</b> ${c.element === mine ? '<span class="tag">your element</span>' : ''}
            <div class="muted small">“${esc(c.motto)}” · ${c.members.length} kin · ${c.awakenings} awakenings · this week ${Math.round(st.pct * 100)}%</div></div>
          <button class="btn small primary" data-join="${c.id}">Join</button>
        </div>`;
      }).join('')}
    </div>
  </section>
  <section class="card">
    <h2>Or found a new clan</h2>
    <form id="found-form" class="stack">
      <input id="clan-name" name="name" maxlength="32" placeholder="Clan name, e.g. Ballard Ridge Runners" required />
      <input id="clan-motto" name="motto" maxlength="60" placeholder="Motto (optional)" />
      <button class="btn primary" type="submit">Light the fire 🔥</button>
    </form>
  </section>`;
}

bind.clan = function () {
  view.querySelectorAll('[data-join]').forEach((b) => b.addEventListener('click', () => {
    const events = G.joinClan(state, b.dataset.join);
    commit(events);
    toast(`🔥 You joined <b>${esc(G.playerClan(state).name)}</b>. Move on ${AWAKENING.bondDays} days this week to become Bonded.`, 'good');
  }));
  $('#found-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try { commit(G.foundClan(state, { name: fd.get('name'), motto: fd.get('motto') })); toast('🔥 Your clan fire is lit. Two wanderers answered the call.', 'epic'); }
    catch (err) { toast(esc(err.message), 'bad'); }
  });
  $('#leave')?.addEventListener('click', (e) => armConfirm(e.currentTarget, 'Tap again to leave', () => { G.leaveClan(state); commit(); }));
  $('#sim')?.addEventListener('click', () => { const ev = G.simulateDay(state); commit(ev); toast(`⏩ A day passes. It's now ${fmtDay(now())}.`); });
  $('#invite')?.addEventListener('click', async () => {
    const text = `Join my clan "${G.playerClan(state).name}" on Wildbound. Move together, awaken together.`;
    try { await navigator.clipboard.writeText(text); toast('Invite text copied.'); }
    catch { toast('Invites arrive with the multiplayer backend (see roadmap).'); }
  });
};

// ---------- CHAT ----------

function chatView() {
  const clan = G.playerClan(state);
  if (!clan) return '<section class="card"><h2>Clan chat</h2><p class="muted">Join a clan to talk with your kin.</p><button class="btn primary" data-go="clan">Find a clan</button></section>';
  const st = G.clanStatus(clan);
  const msgs = state.chat[clan.id] || [];
  const rallied = state.rallyDay === G.dayKey(now());
  let lastDay = '';
  const items = msgs.map((m) => {
    const day = G.dayKey(new Date(m.ts));
    const sep = day !== lastDay ? `<li class="day-sep"><span>${fmtDay(m.ts)}</span></li>` : '';
    lastDay = day;
    if (m.kind === 'system') return `${sep}<li class="sys"><span>${esc(m.text)}</span></li>`;
    const mine = m.from?.isPlayer;
    const who = m.from ? `<span class="who" style="color:${ELEMENTS[m.from.element]?.color}">${esc(m.from.name)}</span>` : '';
    if (m.kind === 'activity') {
      const a = m.act;
      return `${sep}<li class="msg act-card ${mine ? 'mine' : ''}">${who}<div class="bubble"><span class="feed-icon" style="--c:${ELEMENTS[a.element].color}">${a.icon}</span><span><b>${a.label}</b> · ${a.minutes} min${a.place ? ` · ${esc(a.place)}` : ''}<small>+${dist(a.km)} of ${ELEMENTS[a.element].name} energy</small></span>
        <button class="cheer ${m.cheered ? 'on' : ''}" data-cheer="${m.id}" ${mine || m.cheered ? 'disabled' : ''} title="Cheer (+${G.CHEER_ESSENCE} essence)">👏 ${m.cheers || ''}</button></div><time>${fmtTime(m.ts)}</time></li>`;
    }
    return `${sep}<li class="msg ${mine ? 'mine' : ''} ${m.kind === 'rally' ? 'rally' : ''}">${mine ? '' : who}<div class="bubble">${esc(m.text)}</div><time>${fmtTime(m.ts)}</time></li>`;
  }).join('');
  return `
  <section class="card chat-card">
    <div class="chat-head">
      <div class="grow"><b>${ELEMENTS[clan.element].spirit.glyph} ${esc(clan.name)}</b><small class="muted">${clan.members.length} kin · gauge ${Math.round(st.pct * 100)}% · ${st.bonded.length}/${st.bondNeeded} Bonded</small></div>
      <button class="btn small ${rallied ? '' : 'primary'}" id="rally" ${rallied ? 'disabled' : ''} title="Once a day. Sleepy kin become much more likely to move today.">${rallied ? 'Rallied today' : '🔥 Rally the clan'}</button>
    </div>
    <ul class="chat" id="chat-list">${items || '<li class="sys"><span>No messages yet. Say hi!</span></li>'}</ul>
    <div class="quick">${['Who\'s up for a walk tonight?', 'Rainy run anyone? ☔', 'Planning a hike this weekend', 'Feeling tired today'].map((q) => `<button class="chip" data-quick="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <form id="chat-form" class="composer"><input id="chat-input" maxlength="280" placeholder="Message ${esc(clan.name)}…" autocomplete="off" /><button class="btn primary" type="submit">Send</button></form>
  </section>
  <p class="muted small center">Prototype: clanmates are simulated and reply automatically. Real-time chat comes with the backend (see roadmap).</p>`;
}

bind.chat = function () {
  const list = $('#chat-list');
  if (list) list.scrollTop = list.scrollHeight;
  const send = (text) => { if (!text.trim()) return; commit(G.postMessage(state, text)); setTimeout(() => $('#chat-input')?.focus(), 0); };
  $('#chat-form')?.addEventListener('submit', (e) => { e.preventDefault(); send($('#chat-input').value); });
  view.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => send(b.dataset.quick)));
  view.querySelectorAll('[data-cheer]').forEach((b) => b.addEventListener('click', () => commit(G.cheer(state, b.dataset.cheer))));
  $('#rally')?.addEventListener('click', () => { try { commit(G.rally(state)); } catch (err) { toast(esc(err.message), 'bad'); } });
};

// ---------- JOURNEY ----------

function routeMap(route, km, color) {
  const W = 640, H = 340, P = 46;
  const wps = route.waypoints;
  const midLat = wps.reduce((s, w) => s + w.lat, 0) / wps.length;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const xs = wps.map((w) => w.lon * kx), ys = wps.map((w) => w.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min((W - 2 * P) / (maxX - minX || 1), (H - 2 * P) / (maxY - minY || 1));
  const ox = (W - (maxX - minX) * scale) / 2, oy = (H - (maxY - minY) * scale) / 2;
  const proj = (lat, lon) => [ox + (lon * kx - minX) * scale, H - (oy + (lat - minY) * scale)];
  const pts = wps.map((w) => proj(w.lat, w.lon));
  const pos = G.routePosition(route, km);
  const [cx, cy] = proj(pos.lat, pos.lon);
  const walked = pts.filter((_, i) => wps[i].km <= km).concat([[cx, cy]]);
  const line = (arr) => arr.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
  return `
  <svg class="map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Stylised map of ${esc(route.name)}">
    <polyline points="${line(pts)}" class="route-all"/>
    <polyline points="${line(walked)}" class="route-done" style="stroke:${color}"/>
    ${pts.map(([x, y], i) => {
      const reached = wps[i].km <= km;
      const anchor = x > W * 0.62 ? 'end' : 'start';
      const dx = anchor === 'end' ? -10 : 10;
      const isNext = pos.nextIdx === i;
      return `<g class="wp ${reached ? 'reached' : ''} ${isNext ? 'next' : ''}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isNext ? 8 : 6}" style="${reached ? `fill:${color}` : ''}"/>
        <text x="${(x + dx).toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${anchor}">${i + 1}. ${esc(wps[i].name.split(' · ')[0])}</text></g>`;
    }).join('')}
    <g class="you"><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="14" style="fill:${color}" class="pulse"/><text x="${cx.toFixed(1)}" y="${(cy + 5).toFixed(1)}" text-anchor="middle">${ELEMENTS[state.player.element].spirit.glyph}</text></g>
  </svg>`;
}

function journeyView() {
  const clan = G.playerClan(state);
  if (!clan) return '<section class="card"><h2>No journey yet</h2><p class="muted">Journeys are shared by a clan. Join or found one to set out from Discovery Park.</p><button class="btn primary" data-go="clan">Find a clan</button></section>';
  const route = G.getExpedition(clan.journeyId);
  const color = ELEMENTS[clan.element].color;
  const pos = G.routePosition(route, clan.journeyKm);
  const pct = Math.round((clan.journeyKm / route.lengthKm) * 100);
  const doneIds = new Set(clan.completed.map((c) => c.routeId));
  const myKm = clan.members.find((m) => m.isPlayer)?.totalKm || 0;
  return `
  <section class="card">
    <h2>How journeys work</h2>
    <ol class="steps">
      <li><b>Move</b><span>Any activity adds trail distance. A 10-minute walk adds about ${dist(0.83)}.</span></li>
      <li><b>The clan advances</b><span>Everyone's distance moves one shared marker along a real route.</span></li>
      <li><b>Landmarks unlock</b><span>Each landmark reveals its history and geography. Finishing pays +200 essence each and starts the next journey.</span></li>
    </ol>
  </section>

  <section class="card">
    <div class="chain">${EXPEDITIONS.map((e) => `<span class="link ${doneIds.has(e.id) ? 'done' : ''} ${e.id === route.id ? 'current' : ''}"><small>${e.tier}</small>${doneIds.has(e.id) ? '✓ ' : ''}${esc(e.name)}</span>`).join('<em>›</em>')}</div>
    <div class="journey-head">
      <div class="grow"><div class="eyebrow">${esc(clan.name)} · ${route.region}</div><h2>${route.name}</h2><p class="muted">${route.blurb}</p></div>
      <div class="big-num"><b>${distNum(clan.journeyKm)}</b><span>of ${dist(route.lengthKm)}</span></div>
    </div>
    <div class="bar big"><i style="width:${pct}%"></i></div>
    ${pos.next ? `<div class="next-card" style="--c:${color}"><span class="next-num">${pos.nextIdx + 1}</span><div class="grow"><small class="eyebrow">Next landmark</small><b>${esc(pos.next.name)}</b><span class="muted small">${dist(pos.next.km - clan.journeyKm)} away · ${elev(pos.next.elev)} elevation · your total contribution ${dist(myKm)}</span></div><span class="reward">📜 Story</span></div>` : ''}
    ${routeMap(route, clan.journeyKm, color)}
  </section>

  <section class="card">
    <h2>Landmarks</h2>
    <ol class="timeline">
      ${route.waypoints.map((wp, i) => {
        const open = state.unlockedLore.includes(`${route.id}:${i}`);
        return `<li class="${open ? 'open' : 'locked'}" style="--c:${color}">
          <div class="tl-head"><b>${i + 1}. ${open ? esc(wp.name) : esc(wp.name)}</b><span class="muted small">${open ? 'Unlocked' : `${dist(Math.max(0, wp.km - clan.journeyKm))} to go`} · ${elev(wp.elev)}</span></div>
          <p>${open ? esc(wp.lore) : '🔒 Story unlocks when your clan arrives.'}</p>
        </li>`;
      }).join('')}
    </ol>
  </section>

  <section class="card">
    <h2>Seattle check-ins</h2>
    <p class="muted small">Move to a real place and check in for +60 essence. The mobile app will confirm with GPS. In this prototype, check-ins unlock once you've logged an activity today. Check in at 3 places to earn the Rain Shell.</p>
    <div class="places">${PLACES.map((p) => {
      const done = state.checkins.some((c) => c.id === p.id);
      return `<div class="place ${done ? 'done' : ''}"><span class="place-ic">${p.icon}</span><div class="grow"><b>${esc(p.name)}</b><small>${esc(p.blurb)}</small></div><button class="btn small ${done ? '' : 'primary'}" data-checkin="${p.id}" ${done ? 'disabled' : ''}>${done ? '✓ Visited' : 'Check in'}</button></div>`;
    }).join('')}</div>
  </section>`;
}

bind.journey = function () {
  view.querySelectorAll('[data-checkin]').forEach((b) => b.addEventListener('click', () => {
    try { commit(G.checkIn(state, b.dataset.checkin)); } catch (err) { toast(esc(err.message), 'bad'); }
  }));
};

// ---------- RANKS ----------

function ranksView() {
  const ranks = G.weeklyRanks(state);
  const mine = ranks.find((r) => r.clan.id === state.clanId);
  const seg = (id, label) => `<button class="${ranksTab === id ? 'active' : ''}" data-rtab="${id}">${label}</button>`;
  let body = '';
  if (ranksTab === 'clans') {
    body = `
    <p class="muted small">Score = distance per member × how many kin are Bonded. A clan where everyone moves beats one carried by a single athlete.</p>
    <div class="table-wrap"><table class="ranks">
      <thead><tr><th>#</th><th>Clan</th><th class="num hide-sm">${dUnit()}/member</th><th class="num">Bonded</th><th class="hide-sm">Status</th><th class="num">Score</th></tr></thead>
      <tbody>${ranks.map((r) => `<tr class="${r.clan.id === state.clanId ? 'me' : ''}">
        <td><b>${r.rank}</b> ${r.delta > 0 ? `<span class="up">▲${r.delta}</span>` : r.delta < 0 ? `<span class="down">▼${-r.delta}</span>` : '<span class="muted">–</span>'}</td>
        <td><span class="kin-dot" style="background:${ELEMENTS[r.clan.element].color}"></span>${esc(r.clan.name)}<small class="muted hide-sm"> · ${r.clan.members.length} kin</small></td>
        <td class="num hide-sm">${distNum(r.perMember)}</td>
        <td class="num">${Math.round(r.bondShare * 100)}%</td>
        <td class="hide-sm">${tierPill(r.st)}</td>
        <td class="num"><b>${r.score}</b></td></tr>`).join('')}</tbody>
    </table></div>`;
  } else if (ranksTab === 'kin') {
    const clan = G.playerClan(state);
    if (!clan) body = '<p class="muted">Join a clan to see your kin rankings.</p>';
    else {
      const kin = G.kinStats(clan);
      const top = (f) => [...kin].sort((a, b) => f(b) - f(a))[0];
      const tb = top((k) => k.km), sf = top((k) => k.days.length), wf = top((k) => k.types);
      const award = (icon, title, k, val, why) => `<div class="award"><span>${icon}</span><small>${title}</small><b>${esc(k.member.name)}${k.member.isPlayer ? ' (you)' : ''}</b><em>${val}</em><small class="muted">${why}</small></div>`;
      body = `
      <div class="awards">
        ${award('🏃', 'Trailblazer', tb, dist(tb.km), 'Most distance this week')}
        ${award('🔥', 'Steady Flame', sf, `${sf.days.length} days`, 'Most active days')}
        ${award('🧭', 'Wayfinder', wf, `${wf.types} activity types`, 'Most variety')}
      </div>
      <div class="table-wrap"><table class="ranks">
        <thead><tr><th>#</th><th>Kin</th><th class="hide-sm">This week</th><th class="num">${dUnit()}</th><th class="num">Types</th></tr></thead>
        <tbody>${kin.map((k, i) => `<tr class="${k.member.isPlayer ? 'me' : ''}"><td><b>${i + 1}</b></td><td><span class="kin-dot" style="background:${ELEMENTS[k.member.element].color}"></span>${esc(k.member.name)} ${k.bonded ? '<span class="pill ok">Bonded</span>' : ''}</td><td class="hide-sm">${dayDots(k.days, G.weekdayIdx(now()))}</td><td class="num">${distNum(k.km)}</td><td class="num">${k.types}</td></tr>`).join('')}</tbody>
      </table></div>`;
    }
  } else {
    const tot = { earth: 0, fire: 0, water: 0, air: 0 };
    state.clans.forEach((c) => Object.keys(tot).forEach((e) => { tot[e] += c.week.energy[e]; }));
    const max = Math.max(...Object.values(tot), 1);
    const sum = Object.values(tot).reduce((a, b) => a + b, 0) || 1;
    const lead = Object.keys(tot).reduce((a, b) => (tot[b] > tot[a] ? b : a));
    body = `
    <p class="muted small">Every activity charges its element's energy across Seattle. The leading element this week is <b style="color:${ELEMENTS[lead].color}">${ELEMENTS[lead].name}</b>.</p>
    <div class="elements-bars">${Object.keys(tot).map((e) => `<div style="--c:${ELEMENTS[e].color}"><span>${ELEMENTS[e].spirit.glyph} ${ELEMENTS[e].name}</span><span class="mbar"><i style="width:${Math.round((tot[e] / max) * 100)}%"></i></span><b>${dist(tot[e], 0)} · ${Math.round((tot[e] / sum) * 100)}%</b></div>`).join('')}</div>`;
  }
  return `
  ${mine ? `<section class="card rank-hero" style="--c:${ELEMENTS[mine.clan.element].color}">
    <div class="big-rank">#${mine.rank}<small>of ${ranks.length}</small></div>
    <div class="grow"><div class="eyebrow">Seattle · week of ${fmtDay(G.fromKey(mine.clan.week.start), { month: 'short', day: 'numeric' })}</div><h2>${esc(mine.clan.name)}</h2>
    <p class="muted small">${mine.delta > 0 ? `▲ Up ${mine.delta} from last week.` : mine.delta < 0 ? `▼ Down ${-mine.delta} from last week.` : 'Same place as last week.'} Getting one more kin Bonded is the fastest way to climb.</p></div>
  </section>` : ''}
  <section class="card">
    <div class="segmented">${seg('clans', 'Clans')}${seg('kin', 'Your kin')}${seg('elements', 'Elements')}</div>
    ${body}
  </section>`;
}

bind.ranks = function () {
  view.querySelectorAll('[data-rtab]').forEach((b) => b.addEventListener('click', () => { ranksTab = b.dataset.rtab; render(); }));
};

// ---------- JOURNAL (gear, lore, settings) ----------

function journalView() {
  const total = EXPEDITIONS.reduce((s, e) => s + e.waypoints.length, 0);
  const av = state.player.avatar || {};
  return `
  <section class="card">
    <h2>Your wanderer</h2>
    <p class="muted small">This is how you appear in the 3D camp.</p>
    <div class="swatch-row"><span>Outfit</span>${OUTFITS.map((c) => `<button class="swatch ${av.outfit === c ? 'on' : ''}" data-outfit="${c}" style="background:${c}" aria-label="Outfit colour ${c}"></button>`).join('')}</div>
    <div class="swatch-row"><span>Skin</span>${SKINS.map((c) => `<button class="swatch ${av.skin === c ? 'on' : ''}" data-skin="${c}" style="background:${c}" aria-label="Skin tone ${c}"></button>`).join('')}</div>
    <div class="row gap"><button class="btn primary" data-go="home">See me in camp</button></div>
  </section>
  <section class="card">
    <h2>Badges & gear</h2>
    <p class="muted small">Every badge unlocks a piece of gear your avatar wears in the camp, so your kin can see what you've achieved.</p>
    <div class="badges">
      ${Object.entries(BADGES).map(([id, b]) => `<div class="badge ${state.badges.includes(id) ? 'earned' : ''}"><span>${b.icon}</span><b>${b.name}</b><small>${b.desc}</small><em>${state.badges.includes(id) ? '✓ Wearing' : 'Unlocks'}: ${b.gear}</em></div>`).join('')}
    </div>
  </section>
  <section class="card">
    <h2>Lore codex <small class="muted">${state.unlockedLore.length} / ${total}</small></h2>
    ${EXPEDITIONS.map((r) => {
      const found = r.waypoints.filter((_, i) => state.unlockedLore.includes(`${r.id}:${i}`)).length;
      return `<details class="codex" ${found ? 'open' : ''}>
        <summary><b>${r.name}</b> <span class="muted small">${r.region} · ${found}/${r.waypoints.length}</span></summary>
        <ul>${r.waypoints.map((wp, i) => state.unlockedLore.includes(`${r.id}:${i}`)
          ? `<li><b>${esc(wp.name)}</b><p>${esc(wp.lore)}</p></li>`
          : '<li class="locked"><b>???</b><p class="muted">Not yet discovered.</p></li>').join('')}</ul>
      </details>`;
    }).join('')}
  </section>
  <section class="card">
    <h2>Settings</h2>
    <div class="segmented small-seg"><button class="${imperial() ? 'active' : ''}" data-units="mi">Miles · feet</button><button class="${imperial() ? '' : 'active'}" data-units="km">Kilometres · metres</button></div>
    <p class="muted small">Home: ${HOME.city} (Pacific Time). The 3D sky follows Seattle's time of day.</p>
    <button class="btn ghost" id="reset">Reset prototype data</button>
  </section>`;
}

bind.journal = function () {
  view.querySelectorAll('[data-outfit]').forEach((b) => b.addEventListener('click', () => { state.player.avatar = { ...state.player.avatar, outfit: b.dataset.outfit }; commit(); }));
  view.querySelectorAll('[data-skin]').forEach((b) => b.addEventListener('click', () => { state.player.avatar = { ...state.player.avatar, skin: b.dataset.skin }; commit(); }));
  view.querySelectorAll('[data-units]').forEach((b) => b.addEventListener('click', () => { state.settings.units = b.dataset.units; commit(); }));
  $('#reset').addEventListener('click', (e) => armConfirm(e.currentTarget, 'Tap again to erase everything', () => {
    state = store.reset(); tab = 'home'; onboardPick = null; draft = freshDraft(); render();
  }));
};

// ---------- boot ----------

const bootEvents = state.player ? G.catchUp(state) : [];
store.save(state);
render();
if (bootEvents.length) toast('While you were away, your kin kept moving.');

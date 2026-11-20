// Wildbound — UI layer (vanilla JS, no build step).
import { ELEMENTS, ACTIVITIES, INTENSITY, EXPEDITIONS, BADGES } from './data.js';
import * as G from './engine.js';
import * as store from './store.js';

const bind = {}; // per-tab event binders
let state = store.load();
let tab = 'home';
let logDraft = { type: null, minutes: 30, distanceKm: '', intensity: 'moderate', note: '' };

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtKm = (n) => (n >= 100 ? Math.round(n).toLocaleString() : (Math.round(n * 10) / 10).toLocaleString());

function commit(events = []) {
  store.save(state);
  render();
  announce(events);
}

// ---------- toasts ----------

function toast(html, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = html;
  const box = $('#toasts');
  box.appendChild(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 4800);
}

function announce(events) {
  const loud = events.filter((e) => !e.quiet && e.type !== 'lore');
  const lore = events.filter((e) => e.type === 'lore' && !e.quiet).map((e) => e.waypoint.name);
  if (lore.length) loud.push({ type: 'lore-batch', names: lore });
  const order = { epic: 0, expedition: 0, evolve: 0, 'lore-batch': 1, badge: 2, logged: 3, trial: 4 };
  loud.sort((a, b) => (order[a.type] ?? 5) - (order[b.type] ?? 5));
  const trials = loud.filter((e) => e.type === 'trial');
  if (trials.length > 1) {
    loud.splice(loud.indexOf(trials[0]), trials.length, { type: 'trial-batch', n: trials.length, total: trials.reduce((s, t) => s + t.trial.reward, 0) });
  }
  for (const e of loud.slice(0, 3)) {
    switch (e.type) {
      case 'logged': toast(`+${e.entry.essence} essence · +${fmtKm(e.entry.trailKm)} trail km${e.entry.affinity ? ' <b>(affinity ×1.5)</b>' : ''}`); break;
      case 'trial': toast(`✅ Trial complete: ${esc(e.trial.text)} <b>+${e.trial.reward}</b>`, 'good'); break;
      case 'lore-batch': toast(e.names.length === 1 ? `📜 Lore unlocked: <b>${esc(e.names[0])}</b>` : `📜 ${e.names.length} lore entries unlocked: <b>${e.names.slice(-3).map(esc).join(', ')}</b>${e.names.length > 3 ? '…' : ''}`, 'lore'); break;
      case 'trial-batch': toast(`✅ ${e.n} trials complete <b>+${e.total}</b>`, 'good'); break;
      case 'expedition': toast(`🏔️ Expedition complete: <b>${esc(e.route.name)}</b>! +200 essence. Next: ${esc(e.next.name)}`, 'epic'); break;
      case 'badge': toast(`${e.badge.icon} Badge earned: <b>${esc(e.badge.name)}</b>`, 'good'); break;
      case 'evolve': {
        const el = ELEMENTS[state.player.element];
        toast(`✨ ${el.spirit.name} evolved into <b>${el.stages[e.stage]}</b> form!`, 'epic'); break;
      }
    }
  }
}

// ---------- shell ----------

function render() {
  document.body.dataset.element = state.player?.element || 'none';
  const nav = $('#tabs');
  nav.hidden = !state.player;
  nav.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  renderChip();
  if (!state.player) { view.innerHTML = onboardingView(); bindOnboarding(); return; }
  const views = { home: homeView, log: logView, clan: clanView, expedition: expeditionView, codex: codexView, ranks: ranksView };
  view.innerHTML = views[tab]();
  bind[tab]?.();
  window.scrollTo({ top: 0 });
}

function renderChip() {
  const chip = $('#player-chip');
  if (!state.player) { chip.innerHTML = ''; return; }
  const el = ELEMENTS[state.player.element];
  const p = G.spiritProgress(G.totalEssence(state));
  chip.innerHTML = `<span class="chip-glyph">${el.spirit.glyph}</span><span><b>${esc(state.player.name)}</b><small>${el.clanTitle} · Lv ${p.level}</small></span>`;
}

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  render();
});

// ---------- onboarding ----------

let onboardPick = null;

function onboardingView() {
  return `
  <section class="hero">
    <h1>Move together.<br/>Explore the world.</h1>
    <p class="lead">We evolved walking, carrying, climbing and roaming as tribes. Wildbound turns every walk, lift, swim and match into progress for your clan on a journey along real trails, from the Inca Trail to the Appalachians. Every waypoint you reach unlocks a piece of the land's geography and history.</p>
  </section>
  <section class="card">
    <h2>1 · Choose your element</h2>
    <p class="muted">Your element spirit grows faster (×1.5 essence) when you practise its movements. Any movement counts.</p>
    <div class="element-grid">
      ${Object.values(ELEMENTS).map((el) => `
        <button class="element-card ${onboardPick === el.id ? 'picked' : ''}" data-el="${el.id}" style="--c:${el.color}">
          <div class="element-glyph">${el.spirit.glyph}</div>
          <div class="element-name">${el.name} <small>· ${el.clanTitle}</small></div>
          <div class="element-spirit">${el.spirit.name}, the ${el.spirit.kind}</div>
          <p>${el.blurb}</p>
          <div class="affinity">${el.affinity.map((a) => `<span>${ACTIVITIES[a].icon} ${ACTIVITIES[a].label}</span>`).join('')}</div>
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
    tab = 'clan';
    commit();
    toast(`${ELEMENTS[onboardPick].spirit.glyph} ${ELEMENTS[onboardPick].spirit.name} has bound to you. Now find your clan.`, 'epic');
  });
}

// ---------- home / camp ----------

function spiritCard() {
  const el = ELEMENTS[state.player.element];
  const ess = G.totalEssence(state);
  const p = G.spiritProgress(ess);
  const next = p.nextAt ? `${ess.toLocaleString()} / ${p.nextAt.toLocaleString()} essence to <b>${el.stages[p.stage + 1]}</b>` : 'Final form reached';
  return `
  <section class="card spirit" style="--c:${el.color}">
    <div class="spirit-orb stage-${p.stage}"><span>${el.spirit.glyph}</span></div>
    <div class="spirit-info">
      <div class="eyebrow">${el.name} spirit · ${el.virtue}</div>
      <h2>${el.spirit.name} <small>the ${el.stages[p.stage]}</small></h2>
      <div class="bar"><i style="width:${Math.round(p.pct * 100)}%"></i></div>
      <div class="muted small">${next}</div>
      <div class="stages">${el.stages.map((s, i) => `<span class="${i <= p.stage ? 'on' : ''}">${s}</span>`).join('<em>›</em>')}</div>
    </div>
  </section>`;
}

function homeView() {
  const trials = G.dailyTrials(state);
  const s = G.streak(state);
  const recent = state.activities.slice(0, 5);
  return `
  ${spiritCard()}
  <section class="card whisper"><span class="quote-mark">“</span>${esc(G.spiritWhisper(state))}</section>
  <section class="stats">
    <div><b>${s}</b><span>day streak</span></div>
    <div><b>${fmtKm(G.totalTrailKm(state))}</b><span>trail km</span></div>
    <div><b>${G.totalEssence(state).toLocaleString()}</b><span>essence</span></div>
    <div><b>${state.unlockedLore.length}</b><span>lore found</span></div>
  </section>
  <section class="card">
    <div class="card-head"><h2>Today's trials</h2><button class="btn small primary" data-go="log">Log movement</button></div>
    <ul class="trials">
      ${trials.map((t) => `<li class="${t.claimed ? 'done' : ''}"><span class="check">${t.claimed ? '✓' : ''}</span>${esc(t.text)}<b>+${t.reward}</b></li>`).join('')}
    </ul>
  </section>
  <section class="card">
    <h2>Recent movement</h2>
    ${recent.length ? `<ul class="feed">${recent.map(activityRow).join('')}</ul>` : `<p class="muted">Nothing yet. Even a 10-minute walk wakes your spirit.</p>`}
  </section>`;
}

function activityRow(a) {
  const act = ACTIVITIES[a.type];
  const when = new Date(a.date);
  return `<li>
    <span class="feed-icon" style="--c:${ELEMENTS[a.element].color}">${act.icon}</span>
    <span class="feed-main"><b>${act.label}</b> · ${a.minutes} min${a.distanceKm ? ` · ${a.distanceKm} km` : ''} <small>${INTENSITY[a.intensity].label}</small>
      ${a.note ? `<em>${esc(a.note)}</em>` : ''}<small class="muted">${when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</small></span>
    <span class="feed-score">+${a.essence}<small>${fmtKm(a.trailKm)} km</small></span>
  </li>`;
}

// ---------- log ----------

function logView() {
  const el = state.player.element;
  const d = logDraft;
  const act = d.type ? ACTIVITIES[d.type] : null;
  let preview = '';
  if (act) {
    const sc = G.scoreActivity(d, el);
    preview = `<div class="preview">Preview: <b>+${sc.essence} essence</b> · <b>+${fmtKm(sc.trailKm)} trail km</b> for your clan ${sc.affinity ? '<span class="tag">affinity ×1.5</span>' : ''}</div>`;
  }
  return `
  <section class="card">
    <h2>Log movement</h2>
    <p class="muted">Every kind of movement counts. Distance activities move your clan by real km. Strength, sport and yoga convert effort minutes into trail km.</p>
    <div class="activity-grid">
      ${Object.entries(ACTIVITIES).map(([id, a]) => `
        <button class="act ${d.type === id ? 'picked' : ''} ${a.element === el ? 'aff' : ''}" data-act="${id}" style="--c:${ELEMENTS[a.element].color}">
          <span>${a.icon}</span>${a.label}${a.element === el ? '<i>×1.5</i>' : ''}
        </button>`).join('')}
    </div>
    <form id="log-form" class="log-form ${act ? '' : 'disabled'}">
      <label>Minutes<input type="number" name="minutes" min="1" max="${G.MAX_MINUTES}" value="${esc(d.minutes)}" required /></label>
      ${act?.distance ? `<label>Distance (km)<input type="number" name="distanceKm" min="0" max="300" step="0.1" value="${esc(d.distanceKm)}" placeholder="optional" /></label>` : ''}
      <fieldset class="intensity"><legend>Intensity</legend>
        ${Object.entries(INTENSITY).map(([k, v]) => `<label><input type="radio" name="intensity" value="${k}" ${d.intensity === k ? 'checked' : ''}/>${v.label}</label>`).join('')}
      </fieldset>
      <label class="wide">Note<input name="note" maxlength="140" value="${esc(d.note)}" placeholder="Where did you go? What did you see?" /></label>
      ${preview}
      <button class="btn primary wide" type="submit" ${act ? '' : 'disabled'}>${act ? `Offer ${act.label.toLowerCase()} to ${ELEMENTS[el].spirit.name}` : 'Pick an activity'}</button>
    </form>
    <p class="muted small">Prototype note: entries are self-reported. The roadmap adds Apple Health, Health Connect and Strava sync.</p>
  </section>`;
}

bind.log = function () {
  view.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => { logDraft.type = b.dataset.act; render(); }));
  const form = $('#log-form');
  const sync = () => {
    const fd = new FormData(form);
    logDraft.minutes = fd.get('minutes');
    logDraft.distanceKm = fd.get('distanceKm') ?? '';
    logDraft.intensity = fd.get('intensity') || 'moderate';
    logDraft.note = fd.get('note') || '';
  };
  form.addEventListener('change', () => {
    sync();
    const p = view.querySelector('.preview');
    if (p && logDraft.type) {
      const sc = G.scoreActivity(logDraft, state.player.element);
      p.innerHTML = `Preview: <b>+${sc.essence} essence</b> · <b>+${fmtKm(sc.trailKm)} trail km</b> for your clan ${sc.affinity ? '<span class="tag">affinity ×1.5</span>' : ''}`;
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    sync();
    try {
      const events = G.logActivity(state, logDraft);
      logDraft = { type: null, minutes: 30, distanceKm: '', intensity: 'moderate', note: '' };
      tab = 'home';
      commit(events);
    } catch (err) { toast(esc(err.message), 'bad'); }
  });
};

// ---------- clan ----------

function clanView() {
  const clan = G.playerClan(state);
  if (!clan) return clanPickerView();
  const el = ELEMENTS[clan.element];
  const route = G.getExpedition(clan.expeditionId);
  const pos = G.routePosition(route, clan.progressKm);
  const pct = Math.round((clan.progressKm / route.lengthKm) * 100);
  const members = [...clan.members].sort((a, b) => b.km - a.km);
  const top = members[0]?.km || 1;
  return `
  <section class="card clan-banner" style="--c:${el.color}">
    <div class="clan-sigil">${el.spirit.glyph}</div>
    <div>
      <div class="eyebrow">${el.name} clan · ${el.clanTitle}s</div>
      <h2>${esc(clan.name)}</h2>
      <p class="motto">“${esc(clan.motto)}”</p>
    </div>
  </section>
  <section class="card">
    <div class="card-head"><h2>Clan objective</h2><button class="btn small" data-go="expedition">View map</button></div>
    <p><b>${route.name}</b> <span class="muted">· ${route.region}</span></p>
    <div class="bar big"><i style="width:${pct}%"></i></div>
    <div class="row-between small"><span>${fmtKm(clan.progressKm)} / ${fmtKm(route.lengthKm)} km</span><span>${pos.next ? `Next: <b>${esc(pos.next.name)}</b> in ${fmtKm(pos.next.km - clan.progressKm)} km` : 'Arrived!'}</span></div>
    <p class="muted small">Reward on completion: +200 essence for every member, the Summit Seeker badge, and the next expedition unlocks.</p>
    ${clan.completed.length ? `<p class="small">Completed: ${clan.completed.map((c) => G.getExpedition(c.routeId).name).map(esc).join(', ')}</p>` : ''}
  </section>
  <section class="card">
    <h2>Kin <small class="muted">(${members.length})</small></h2>
    <ul class="members">
      ${members.map((m, i) => `<li class="${m.isPlayer ? 'me' : ''}"><span class="rank">${i + 1}</span><span class="mname">${esc(m.name)}${m.isPlayer ? ' (you)' : ''}</span><span class="mbar"><i style="width:${Math.round((m.km / top) * 100)}%"></i></span><b>${fmtKm(m.km)} km</b></li>`).join('')}
    </ul>
    <div class="row gap">
      <button class="btn" id="invite">Invite friends</button>
      <button class="btn" id="sim" title="Prototype: simulate the other members' movement for one day">⏩ Simulate a day</button>
      <button class="btn ghost" id="leave">Leave clan</button>
    </div>
    <p class="muted small">Other members are simulated in this prototype, to show how shared progress feels.</p>
  </section>`;
}

function clanPickerView() {
  const mine = state.player.element;
  const clans = [...state.clans].sort((a, b) => (b.element === mine) - (a.element === mine));
  return `
  <section class="card">
    <h2>Find your clan</h2>
    <p class="muted">A clan is a group of people moving toward one shared expedition. Kin of your element are listed first, but every clan welcomes every element.</p>
    <div class="clan-list">
      ${clans.map((c) => {
        const el = ELEMENTS[c.element];
        const route = G.getExpedition(c.expeditionId);
        return `<div class="clan-row" style="--c:${el.color}">
          <span class="clan-sigil sm">${el.spirit.glyph}</span>
          <div class="grow"><b>${esc(c.name)}</b> ${c.element === mine ? '<span class="tag">your element</span>' : ''}<div class="muted small">“${esc(c.motto)}” · ${c.members.length} kin · on ${route.name}</div></div>
          <button class="btn small primary" data-join="${c.id}">Join</button>
        </div>`;
      }).join('')}
    </div>
  </section>
  <section class="card">
    <h2>…or found a new clan</h2>
    <form id="found-form" class="stack">
      <input name="name" maxlength="32" placeholder="Clan name, e.g. The Ridge Runners" required />
      <input name="motto" maxlength="60" placeholder="Motto (optional)" />
      <button class="btn primary" type="submit">Light the fire 🔥</button>
    </form>
  </section>`;
}

bind.clan = function () {
  view.querySelectorAll('[data-join]').forEach((b) => b.addEventListener('click', () => {
    const events = G.joinClan(state, b.dataset.join);
    commit(events);
    toast(`🔥 You joined <b>${esc(G.playerClan(state).name)}</b>.`, 'good');
  }));
  $('#found-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try { commit(G.foundClan(state, { name: fd.get('name'), motto: fd.get('motto') })); toast('🔥 Your clan fire is lit. Two wanderers have answered the call.', 'epic'); }
    catch (err) { toast(esc(err.message), 'bad'); }
  });
  $('#leave')?.addEventListener('click', () => { if (confirm('Leave your clan? Your personal progress stays.')) { G.leaveClan(state); commit(); } });
  $('#sim')?.addEventListener('click', () => { const ev = G.simulateDay(state); commit(ev); toast('⏩ A day passes. Your kin moved too.'); });
  $('#invite')?.addEventListener('click', async () => {
    const text = `Join my clan "${G.playerClan(state).name}" on Wildbound: move together, explore the world.`;
    try { await navigator.clipboard.writeText(`${text} ${location.href}`); toast('Invite copied to clipboard.'); }
    catch { toast('Sharing comes with the multiplayer backend (see roadmap).'); }
  });
};

// ---------- expedition ----------

function routeMap(route, km, color) {
  const W = 640, H = 360, P = 40;
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
  // walked portion
  const walked = [];
  for (let i = 0; i < wps.length; i++) { if (wps[i].km <= km) walked.push(pts[i]); }
  walked.push([cx, cy]);
  const line = (arr) => arr.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
  return `
  <svg class="map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Stylised map of ${esc(route.name)}">
    <defs><pattern id="topo" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M0 12 Q6 6 12 12 T24 12" fill="none" stroke="currentColor" stroke-opacity=".06"/></pattern></defs>
    <rect width="${W}" height="${H}" rx="14" fill="url(#topo)"/>
    <polyline points="${line(pts)}" class="route-all"/>
    <polyline points="${line(walked)}" class="route-done" style="stroke:${color}"/>
    ${pts.map(([x, y], i) => {
      const reached = wps[i].km <= km;
      const anchor = x > W * 0.7 ? 'end' : 'start';
      const dx = anchor === 'end' ? -10 : 10;
      return `<g class="wp ${reached ? 'reached' : ''}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === 0 || i === wps.length - 1 ? 7 : 5}" style="${reached ? `fill:${color}` : ''}"/>
        <text x="${(x + dx).toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="${anchor}">${esc(wps[i].name.split(' · ')[0])}</text></g>`;
    }).join('')}
    <g class="you"><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="13" style="fill:${color}" class="pulse"/><text x="${cx.toFixed(1)}" y="${(cy + 5).toFixed(1)}" text-anchor="middle">${ELEMENTS[state.player.element].spirit.glyph}</text></g>
  </svg>`;
}

function elevationProfile(route, km, color) {
  const wps = route.waypoints;
  const W = 640, H = 110, P = 8;
  const maxE = Math.max(...wps.map((w) => w.elev)), minE = Math.min(...wps.map((w) => w.elev));
  const x = (k) => P + (k / route.lengthKm) * (W - 2 * P);
  const y = (e) => H - P - ((e - minE) / (maxE - minE || 1)) * (H - 2 * P - 14);
  const d = wps.map((w, i) => `${i ? 'L' : 'M'}${x(w.km).toFixed(1)},${y(w.elev).toFixed(1)}`).join(' ');
  return `<svg class="elev" viewBox="0 0 ${W} ${H}" aria-label="Elevation profile">
    <path d="${d} L${x(route.lengthKm)},${H} L${x(0)},${H} Z" class="elev-fill"/>
    <path d="${d}" class="elev-line"/>
    <line x1="${x(km)}" x2="${x(km)}" y1="0" y2="${H}" style="stroke:${color}" class="elev-you"/>
    <text x="${W - P}" y="12" text-anchor="end">${minE.toLocaleString()}–${maxE.toLocaleString()} m</text>
  </svg>`;
}

function expeditionView() {
  const clan = G.playerClan(state);
  if (!clan) return `<section class="card"><h2>No expedition yet</h2><p class="muted">Expeditions are clan objectives. Join or found a clan to set out.</p><button class="btn primary" data-go="clan">Find a clan</button></section>`;
  const route = G.getExpedition(clan.expeditionId);
  const color = ELEMENTS[clan.element].color;
  return `
  <section class="card">
    <div class="eyebrow">${esc(clan.name)} · current expedition</div>
    <h2>${route.name} <small class="muted">${route.region} · ${fmtKm(route.lengthKm)} km</small></h2>
    <p class="muted">${route.blurb}</p>
    ${routeMap(route, clan.progressKm, color)}
    ${elevationProfile(route, clan.progressKm, color)}
  </section>
  <section class="card">
    <h2>Waypoints</h2>
    <ol class="timeline">
      ${route.waypoints.map((wp, i) => {
        const open = state.unlockedLore.includes(`${route.id}:${i}`);
        return `<li class="${open ? 'open' : 'locked'}" style="--c:${color}">
          <div class="tl-head"><b>${open ? esc(wp.name) : 'Unknown waypoint'}</b><span class="muted small">km ${fmtKm(wp.km)} · ${wp.elev.toLocaleString()} m</span></div>
          <p>${open ? esc(wp.lore) : `🔒 Your clan must travel ${fmtKm(Math.max(0, wp.km - clan.progressKm))} more km to uncover this place.`}</p>
        </li>`;
      }).join('')}
    </ol>
  </section>`;
}

// ---------- codex ----------

function codexView() {
  const total = EXPEDITIONS.reduce((s, e) => s + e.waypoints.length, 0);
  return `
  <section class="card">
    <h2>Badges</h2>
    <div class="badges">
      ${Object.entries(BADGES).map(([id, b]) => `<div class="badge ${state.badges.includes(id) ? 'earned' : ''}" title="${esc(b.desc)}"><span>${b.icon}</span><b>${b.name}</b><small>${b.desc}</small></div>`).join('')}
    </div>
  </section>
  <section class="card">
    <h2>Codex of the Land <small class="muted">${state.unlockedLore.length} / ${total}</small></h2>
    <p class="muted">Geography and history you've uncovered by moving.</p>
    ${EXPEDITIONS.map((r) => {
      const found = r.waypoints.filter((_, i) => state.unlockedLore.includes(`${r.id}:${i}`)).length;
      return `<details class="codex" ${found ? 'open' : ''}>
        <summary><b>${r.name}</b> <span class="muted small">${r.region} · ${found}/${r.waypoints.length}</span></summary>
        <ul>${r.waypoints.map((wp, i) => state.unlockedLore.includes(`${r.id}:${i}`)
          ? `<li><b>${esc(wp.name)}</b><p>${esc(wp.lore)}</p></li>`
          : `<li class="locked"><b>???</b><p class="muted">Not yet discovered.</p></li>`).join('')}</ul>
      </details>`;
    }).join('')}
  </section>
  <section class="card">
    <h2>Settings</h2>
    <button class="btn ghost" id="reset">Reset prototype data</button>
  </section>`;
}

bind.codex = function () {
  $('#reset').addEventListener('click', () => {
    if (confirm('Erase all Wildbound data in this browser?')) { state = store.reset(); tab = 'home'; onboardPick = null; render(); }
  });
};

// ---------- ranks ----------

function ranksView() {
  const clans = [...state.clans].sort((a, b) => b.totalKm - a.totalKm);
  const byEl = Object.keys(ELEMENTS).map((k) => ({ el: ELEMENTS[k], km: state.clans.filter((c) => c.element === k).reduce((s, c) => s + c.totalKm, 0) }));
  const maxEl = Math.max(...byEl.map((x) => x.km), 1);
  return `
  <section class="card">
    <h2>Balance of the Elements</h2>
    <p class="muted">Total distance moved by each element's clans. No element wins for long: the world needs all four.</p>
    <div class="elements-bars">
      ${byEl.map((x) => `<div style="--c:${x.el.color}"><span>${x.el.spirit.glyph} ${x.el.name}</span><span class="mbar"><i style="width:${Math.round((x.km / maxEl) * 100)}%"></i></span><b>${fmtKm(x.km)} km</b></div>`).join('')}
    </div>
  </section>
  <section class="card">
    <h2>Clan leaderboard</h2>
    <ul class="members">
      ${clans.map((c, i) => `<li class="${c.id === state.clanId ? 'me' : ''}" style="--c:${ELEMENTS[c.element].color}"><span class="rank">${i + 1}</span><span class="mname">${ELEMENTS[c.element].spirit.glyph} ${esc(c.name)}</span><span class="muted small">${c.completed.length} 🏔️</span><b>${fmtKm(c.totalKm)} km</b></li>`).join('')}
    </ul>
  </section>`;
}

// ---------- generic bindings ----------

view.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) { tab = go.dataset.go; render(); }
});

// ---------- boot ----------

const bootEvents = state.player ? G.catchUpSimulation(state) : [];
store.save(state);
render();
if (bootEvents.some((e) => !e.quiet && e.type !== 'badge')) toast('While you were away, your kin kept moving.');
announce(bootEvents.filter((e) => e.type === 'lore' || e.type === 'expedition'));

// Wildbound — game rules (no DOM). All mutating functions take the state object and return UI events.
import {
  ELEMENTS, ACTIVITIES, INTENSITY, EXPEDITIONS, BADGES, SEED_CLANS, AWAKENING, POWERS, BUILDINGS, PLACES, CHAT,
} from './data.js';

export const KM_PER_MI = 1.609344;
export const MAX_MINUTES = 600;
export const AFFINITY_BONUS = 1.5;
export const VERIFIED_BONUS = 1.1;
export const STAGE_THRESHOLDS = [0, 400, 1500, 4000];
export const CHEER_ESSENCE = 2;
export const CHEERS_PER_DAY = 10;
const DAY = 86400000;
const ELS = ['earth', 'fire', 'water', 'air'];
const r1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, a, b) => Math.max(a, Math.min(b, Number(n) || 0));

// ---------- time ----------

export function dayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const fromKey = (key) => new Date(`${key}T12:00:00`);
export const weekdayIdx = (date) => (new Date(date).getDay() + 6) % 7; // Mon = 0
export function weekStart(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - weekdayIdx(d));
  return dayKey(d);
}
export const addDays = (date, n) => new Date(new Date(date).getTime() + n * DAY);
// The prototype's world clock = real time + simulated days ("Simulate a day").
export const worldNow = (state) => addDays(new Date(), state.dayOffset || 0);

// ---------- state ----------

export function newState(now = new Date()) {
  const s = {
    version: 2,
    player: null,
    activities: [],
    bonusEssence: 0,
    clanId: null,
    clans: [],
    chat: {},
    unlockedLore: [],
    trialsClaimed: {},
    badges: [],
    checkins: [],
    connections: {},
    flags: {},
    cheers: { day: null, n: 0 },
    rallyDay: null,
    dayOffset: 0,
    lastRealDay: dayKey(now),
    settings: { units: 'mi' },
  };
  SEED_CLANS.forEach((c, i) => s.clans.push(seedClan(c, i, now)));
  // Give every clan a believable week so far (bots moved on the days before today).
  const rng = mulberry32(99);
  const ws = fromKey(weekStart(now));
  for (let d = new Date(ws); dayKey(d) < dayKey(now); d = addDays(d, 1)) {
    for (const clan of s.clans) botsActOnDay(s, clan, d, rng, { quiet: true });
  }
  return s;
}

function emptyWeek(start) {
  return { start, energy: { earth: 0, fire: 0, water: 0, air: 0 }, km: {}, days: {}, types: {}, tiers: [], awakened: false };
}

function seedClan(c, i, now) {
  const rng = mulberry32(1000 + i);
  const route = EXPEDITIONS[0];
  const members = c.members.map(([name, element, propensity]) => ({
    id: 'm-' + name.toLowerCase(), name, element, propensity, isPlayer: false, totalKm: r1(30 + rng() * 90),
  }));
  const buildings = BUILDINGS.slice(0, i % 3).map((b) => b.id);
  return {
    id: c.id, name: c.name, element: c.element, motto: c.motto, founded: false,
    members, journeyId: route.id, journeyKm: r1(rng() * route.lengthKm * 0.45), completed: [],
    totalKm: r1(members.reduce((a, m) => a + m.totalKm, 0)),
    week: emptyWeek(weekStart(now)), history: [], awakenings: buildings.length, buildings, power: null,
    lastRank: null,
  };
}

export function createPlayer(state, { name, element }) {
  if (!ELEMENTS[element]) throw new Error('Choose an element');
  state.player = { name: (name || '').trim().slice(0, 24) || 'Wanderer', element, createdAt: new Date().toISOString() };
  return state.player;
}

export const playerClan = (state) => state.clans.find((c) => c.id === state.clanId) || null;
export const getExpedition = (id) => EXPEDITIONS.find((e) => e.id === id) || EXPEDITIONS[0];

// ---------- scoring ----------

export function activePower(clan, now) {
  if (!clan?.power) return null;
  return dayKey(now) <= clan.power.until ? POWERS[clan.power.id] : null;
}

export function scoreActivity(input, { element, power = null } = {}) {
  const act = ACTIVITIES[input.type];
  if (!act) throw new Error(`Unknown activity: ${input.type}`);
  const minutes = Math.round(clamp(input.minutes, 0, MAX_MINUTES));
  let distanceKm = clamp(input.distanceKm, 0, 300);
  const steps = Math.round(clamp(input.steps, 0, 100000));
  if (!distanceKm && act.steps && steps) distanceKm = steps * 0.000762; // ~0.76 m per step
  const elevM = act.elev ? clamp(input.elevM, 0, 5000) : 0;
  const mult = (INTENSITY[input.intensity] || INTENSITY.moderate).mult;
  const affinity = act.element === element;
  const verified = !!input.source && input.source !== 'manual';

  let essMult = mult * (affinity ? AFFINITY_BONUS : 1) * (verified ? VERIFIED_BONUS : 1);
  let kmMult = 1;
  let boosted = false;
  if (power) {
    if (power.id === 'earth' && act.element === 'earth') { essMult *= 1.25; boosted = true; }
    if (power.id === 'water' && act.element === 'water') { essMult *= 1.25; boosted = true; }
    if (power.id === 'air') { kmMult *= 1.25; boosted = true; }
    if (power.id === 'convergence') { essMult *= 1.15; kmMult *= 1.15; boosted = true; }
  }
  const base = act.distance && distanceKm > 0 ? distanceKm * act.trailFactor : (minutes / 12) * mult;
  const trailKm = (base + elevM / 200) * kmMult;
  return {
    essence: Math.round(minutes * essMult), trailKm: r1(trailKm), affinity, verified, boosted,
    element: act.element, minutes, distanceKm: r1(distanceKm), elevM: Math.round(elevM), steps,
  };
}

export const totalEssence = (state) => state.activities.reduce((s, a) => s + a.essence, 0) + state.bonusEssence;
export const totalTrailKm = (state) => r1(state.activities.reduce((s, a) => s + a.trailKm, 0));

export function spiritProgress(essence) {
  let stage = 0;
  STAGE_THRESHOLDS.forEach((t, i) => { if (essence >= t) stage = i; });
  const curr = STAGE_THRESHOLDS[stage];
  const next = STAGE_THRESHOLDS[stage + 1];
  return {
    stage, level: 1 + Math.floor(Math.sqrt(essence / 20)), nextAt: next ?? null,
    pct: next ? Math.max(0, Math.min(1, (essence - curr) / (next - curr))) : 1,
  };
}

export function streak(state, now = worldNow(state)) {
  const days = new Set(state.activities.map((a) => dayKey(a.date)));
  const shield = activePower(playerClan(state), now)?.id === 'water';
  let gaps = shield ? 1 : 0;
  let count = 0;
  let d = new Date(now);
  if (!days.has(dayKey(d))) d = addDays(d, -1);
  for (let i = 0; i < 400; i++) {
    if (days.has(dayKey(d))) count++;
    else if (gaps > 0 && count > 0) gaps--;
    else break;
    d = addDays(d, -1);
  }
  return count;
}

// ---------- clan week & awakening ----------

function record(clan, memberId, element, km, type, date) {
  const w = clan.week;
  if (weekStart(date) !== w.start) return;
  w.energy[element] = r1(w.energy[element] + km);
  w.km[memberId] = r1((w.km[memberId] || 0) + km);
  const di = weekdayIdx(date);
  w.days[memberId] = [...new Set([...(w.days[memberId] || []), di])].sort();
  w.types[memberId] = [...new Set([...(w.types[memberId] || []), type])];
}

export function dominantElement(energy) {
  const total = ELS.reduce((s, e) => s + energy[e], 0);
  if (!total) return null;
  const top = ELS.reduce((a, b) => (energy[b] > energy[a] ? b : a));
  return energy[top] / total <= 0.4 ? 'convergence' : top;
}

export function clanStatus(clan) {
  const n = clan.members.length;
  const w = clan.week;
  const target = r1(AWAKENING.targetKmPerMember * n);
  const charged = r1(ELS.reduce((s, e) => s + w.energy[e], 0));
  const pct = Math.min(1, target ? charged / target : 0);
  const bonded = clan.members.filter((m) => (w.days[m.id] || []).length >= AWAKENING.bondDays);
  const bondNeeded = Math.ceil(n * AWAKENING.bondShare);
  const dominant = dominantElement(w.energy) || clan.element;
  let tier = null;
  for (const t of AWAKENING.tiers) {
    if (t.id === 'awakened') { if (w.awakened) tier = t; }
    else if (pct >= t.at) tier = t;
  }
  return {
    target, charged, pct, bonded, bondNeeded, bondOk: bonded.length >= bondNeeded, dominant,
    power: POWERS[dominant], energy: w.energy, tier, awakened: w.awakened, members: n,
  };
}

export function evaluateTiers(state, clan, now) {
  const events = [];
  const st = clanStatus(clan);
  const mine = clan.id === state.clanId;
  for (const t of AWAKENING.tiers.slice(0, 2)) {
    if (st.pct >= t.at && !clan.week.tiers.includes(t.id)) {
      clan.week.tiers.push(t.id);
      if (mine) {
        state.bonusEssence += t.reward;
        events.push({ type: 'tier', tier: t });
        addChat(state, clan.id, { kind: 'system', text: `The clan gauge is ${t.name}! Everyone gets +${t.reward} essence.` }, now);
      }
    }
  }
  if (st.pct >= 1 && st.bondOk && !clan.week.awakened) {
    clan.week.awakened = true;
    clan.week.tiers.push('awakened');
    clan.awakenings += 1;
    clan.power = { id: st.dominant, until: dayKey(addDays(fromKey(clan.week.start), 13)) };
    const building = BUILDINGS[clan.buildings.length];
    if (building) clan.buildings.push(building.id);
    if (mine) {
      state.bonusEssence += 150;
      if (st.bonded.some((m) => m.isPlayer)) state.flags.awakener = true;
      events.push({ type: 'awaken', power: POWERS[st.dominant], building });
      addChat(state, clan.id, { kind: 'system', text: `⚡ ${clan.name} has AWAKENED! ${POWERS[st.dominant].name} is active for two weeks: ${POWERS[st.dominant].effect}.${building ? ` A ${building.name} rises in camp.` : ''}` }, now);
    }
  }
  return events;
}

export function weeklyRanks(state) {
  return state.clans
    .map((c) => {
      const st = clanStatus(c);
      const perMember = st.charged / st.members;
      const bondShare = st.bonded.length / st.members;
      // Score rewards everyone moving: distance per member, weighted by how many members are Bonded.
      const score = Math.round(perMember * (0.5 + 0.5 * bondShare) * 10);
      return { clan: c, st, perMember: r1(perMember), bondShare, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({ ...r, rank: i + 1, delta: r.clan.lastRank ? r.clan.lastRank - (i + 1) : 0 }));
}

export function ensureWeeks(state, now = worldNow(state)) {
  const ws = weekStart(now);
  const stale = state.clans.filter((c) => c.week.start !== ws);
  if (!stale.length) return [];
  const ranks = weeklyRanks(state);
  const events = [];
  for (const c of stale) {
    const st = clanStatus(c);
    const r = ranks.find((x) => x.clan.id === c.id);
    c.lastRank = r.rank;
    c.history = [{ start: c.week.start, pct: st.pct, bonded: st.bonded.length, members: st.members, awakened: st.awakened, rank: r.rank }, ...c.history].slice(0, 8);
    if (c.id === state.clanId) {
      events.push({ type: 'week', result: c.history[0] });
      addChat(state, c.id, { kind: 'system', text: `New week! Last week: ${Math.round(st.pct * 100)}% gauge, ${st.bonded.length}/${st.members} Bonded${st.awakened ? ', AWAKENED ⚡' : ''}. Ranked #${r.rank}.` }, now);
    }
    c.week = emptyWeek(ws);
  }
  return events;
}

// ---------- journeys ----------

export function routePosition(route, km) {
  const wps = route.waypoints;
  const k = Math.max(0, Math.min(route.lengthKm, km));
  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i], b = wps[i + 1];
    if (k < b.km || (k === b.km && i === wps.length - 2 && k < route.lengthKm)) {
      const t = (k - a.km) / (b.km - a.km);
      return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t, passedIdx: i, next: b, nextIdx: i + 1 };
    }
  }
  const last = wps[wps.length - 1];
  return { lat: last.lat, lon: last.lon, passedIdx: wps.length - 1, next: null, nextIdx: null };
}

function unlockPassed(state, route, km, events, quiet = false) {
  route.waypoints.forEach((wp, idx) => {
    const key = `${route.id}:${idx}`;
    if (wp.km <= km && !state.unlockedLore.includes(key)) {
      state.unlockedLore.push(key);
      events.push({ type: 'lore', route, waypoint: wp, quiet });
    }
  });
}

export function advanceJourney(state, clan, km, now) {
  const events = [];
  const mine = clan.id === state.clanId;
  let remaining = r1(km);
  while (remaining > 0) {
    const route = getExpedition(clan.journeyId);
    const step = Math.min(route.lengthKm - clan.journeyKm, remaining);
    clan.journeyKm = r1(clan.journeyKm + step);
    remaining = r1(remaining - step);
    if (mine) unlockPassed(state, route, clan.journeyKm, events);
    if (clan.journeyKm >= route.lengthKm) {
      clan.completed.push({ routeId: route.id, date: new Date(now).toISOString() });
      const next = EXPEDITIONS[(EXPEDITIONS.findIndex((e) => e.id === route.id) + 1) % EXPEDITIONS.length];
      clan.journeyId = next.id;
      clan.journeyKm = 0;
      if (mine) {
        state.bonusEssence += 200;
        events.push({ type: 'journey', route, next });
        addChat(state, clan.id, { kind: 'system', text: `🏔️ Journey complete: ${route.name}! +200 essence each. Next up: ${next.name}.` }, now);
        unlockPassed(state, next, 0, events);
      }
    } else break;
  }
  return events;
}

// ---------- clans ----------

export function joinClan(state, clanId, now = worldNow(state)) {
  const clan = state.clans.find((c) => c.id === clanId);
  if (!clan || !state.player) return [];
  leaveClan(state);
  state.clanId = clan.id;
  clan.members.push({ id: 'me', name: state.player.name, element: state.player.element, isPlayer: true, propensity: 0, totalKm: 0 });
  const events = [];
  unlockPassed(state, getExpedition(clan.journeyId), clan.journeyKm, events, true);
  events.forEach((e) => { e.quiet = true; });
  if (!state.chat[clan.id]?.length) seedChat(state, clan, now);
  addChat(state, clan.id, { kind: 'system', text: `${state.player.name} joined ${clan.name}.` }, now);
  const greeter = clan.members.find((m) => !m.isPlayer);
  if (greeter) addChat(state, clan.id, { kind: 'msg', from: greeter, text: `Welcome, ${state.player.name}! Move on ${AWAKENING.bondDays} days this week to get Bonded. We can't awaken without you 🔥` }, now);
  return events.concat(checkBadges(state, now));
}

export function leaveClan(state) {
  const clan = playerClan(state);
  if (clan) {
    clan.members = clan.members.filter((m) => !m.isPlayer);
    for (const k of ['km', 'days', 'types']) delete clan.week[k].me;
  }
  state.clanId = null;
}

export function foundClan(state, { name, motto }, now = worldNow(state)) {
  if (!state.player) throw new Error('Create your wanderer first');
  const clean = (name || '').trim().slice(0, 32);
  if (!clean) throw new Error('Give your clan a name');
  const el = state.player.element;
  const id = 'clan-' + Math.random().toString(36).slice(2, 8);
  state.clans.push({
    id, name: clean, element: el, motto: (motto || '').trim().slice(0, 60) || ELEMENTS[el].virtue, founded: true,
    // Two wandering recruits answer the call so a new clan isn't empty in the prototype.
    members: [
      { id: 'm-wren', name: 'Wren', element: 'air', propensity: 0.6, isPlayer: false, totalKm: 0 },
      { id: 'm-osei', name: 'Osei', element: 'earth', propensity: 0.5, isPlayer: false, totalKm: 0 },
    ],
    journeyId: EXPEDITIONS[0].id, journeyKm: 0, completed: [], totalKm: 0,
    week: emptyWeek(weekStart(now)), history: [], awakenings: 0, buildings: [], power: null, lastRank: null,
  });
  return joinClan(state, id, now);
}

// ---------- logging ----------

export function logActivity(state, input, now = worldNow(state)) {
  if (!state.player) throw new Error('Create your wanderer first');
  const clan = playerClan(state);
  const date = input.date ? new Date(input.date) : new Date(now);
  const stageBefore = spiritProgress(totalEssence(state)).stage;
  const scored = scoreActivity(input, { element: state.player.element, power: activePower(clan, date) });
  if (scored.minutes <= 0) throw new Error('Add how many minutes you moved');
  const entry = {
    id: input.externalId || 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date: date.toISOString(), type: input.type, intensity: input.intensity || 'moderate',
    note: (input.note || '').slice(0, 140), place: (input.place || '').slice(0, 60), source: input.source || 'manual',
    ...scored,
  };
  state.activities.push(entry);
  state.activities.sort((a, b) => (a.date < b.date ? 1 : -1));
  const events = [{ type: 'logged', entry }];

  if (clan) {
    const me = clan.members.find((m) => m.isPlayer);
    me.totalKm = r1(me.totalKm + entry.trailKm);
    clan.totalKm = r1(clan.totalKm + entry.trailKm);
    record(clan, 'me', entry.element, entry.trailKm, entry.type, date);
    events.push(...advanceJourney(state, clan, entry.trailKm, now));
    const act = ACTIVITIES[entry.type];
    const msg = addChat(state, clan.id, { kind: 'activity', from: clan.members.find((m) => m.isPlayer), act: { icon: act.icon, label: act.label, km: entry.trailKm, minutes: entry.minutes, place: entry.place, element: entry.element } }, now);
    botReactions(state, clan, msg, now);
    events.push(...evaluateTiers(state, clan, now));
  }

  events.push(...claimTrials(state, now));
  if (spiritProgress(totalEssence(state)).stage > stageBefore) events.push({ type: 'evolve', stage: spiritProgress(totalEssence(state)).stage });
  events.push(...checkBadges(state, now));
  return events;
}

export function importActivities(state, source, inputs, now = worldNow(state)) {
  state.connections[source] = { connected: true, lastSync: new Date(now).toISOString() };
  const seen = new Set(state.activities.map((a) => a.id));
  let events = [];
  let count = 0;
  for (const inp of inputs) {
    if (seen.has(inp.externalId)) continue;
    events = events.concat(logActivity(state, { ...inp, source }, now));
    count++;
  }
  return [{ type: 'imported', source, count }, ...events.filter((e) => e.type !== 'logged')];
}

export function disconnect(state, source) { delete state.connections[source]; }

// ---------- check-ins ----------

export function checkIn(state, placeId, now = worldNow(state)) {
  const place = PLACES.find((p) => p.id === placeId);
  if (!place) throw new Error('Unknown place');
  if (state.checkins.some((c) => c.id === placeId)) throw new Error('Already checked in here');
  const today = state.activities.some((a) => dayKey(a.date) === dayKey(now));
  if (!today) throw new Error('Log an activity today first. Check-ins are for places you moved to.');
  state.checkins.push({ id: placeId, date: new Date(now).toISOString() });
  state.bonusEssence += 60;
  return [{ type: 'checkin', place }, ...checkBadges(state, now)];
}

// ---------- daily trials ----------

const TRIAL_POOL = [
  { id: 'affinity', text: 'Honour your element (an affinity activity)', reward: 50, check: (a) => a.some((x) => x.affinity) },
  { id: 'move10',   text: 'Move for at least 10 minutes',               reward: 25, check: (a) => sum(a, 'minutes') >= 10 },
  { id: 'move30',   text: 'Move for 30 minutes in total',               reward: 40, check: (a) => sum(a, 'minutes') >= 30 },
  { id: 'trail2',   text: 'Cover 2 trail miles',                        reward: 40, check: (a) => sum(a, 'trailKm') >= 2 * KM_PER_MI },
  { id: 'outside',  text: 'Get outside: walk or hike',                  reward: 40, check: (a) => a.some((x) => x.type === 'walk' || x.type === 'hike') },
  { id: 'strength', text: 'Build strength: a 20+ minute session',       reward: 50, check: (a) => a.some((x) => x.type === 'strength' && x.minutes >= 20) },
  { id: 'variety',  text: 'Try two different activity types',          reward: 50, check: (a) => new Set(a.map((x) => x.type)).size >= 2 },
  { id: 'cheer',    text: 'Cheer a clanmate in chat',                   reward: 20, check: (a, ctx) => ctx.cheers > 0 },
  { id: 'climb',    text: 'Climb 300 ft of elevation',                  reward: 45, check: (a) => sum(a, 'elevM') >= 91 },
];
const sum = (arr, k) => arr.reduce((s, x) => s + (x[k] || 0), 0);

export function dailyTrials(state, now = worldNow(state)) {
  const key = dayKey(now);
  const seed = [...key, ...(state.player?.element || '')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rng = mulberry32(seed);
  const pool = TRIAL_POOL.slice(1);
  const picks = [TRIAL_POOL[0]];
  while (picks.length < 3) picks.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  const todays = state.activities.filter((a) => dayKey(a.date) === key);
  const ctx = { cheers: state.cheers.day === key ? state.cheers.n : 0 };
  const claimed = state.trialsClaimed[key] || [];
  const double = activePower(playerClan(state), now)?.id === 'fire' ? 2 : 1;
  return picks.map((t) => ({ id: t.id, text: t.text, reward: t.reward * double, done: t.check(todays, ctx), claimed: claimed.includes(t.id) }));
}

// Which of today's trials a not-yet-logged entry would complete (for the "What this does" preview).
export function previewTrials(state, entry, now = worldNow(state)) {
  const before = dailyTrials(state, now).filter((t) => !t.claimed && !t.done).map((t) => t.id);
  state.activities.push({ ...entry, date: new Date(now).toISOString() });
  const after = dailyTrials(state, now);
  state.activities.pop();
  return after.filter((t) => before.includes(t.id) && t.done);
}

function claimTrials(state, now) {
  const key = dayKey(now);
  state.trialsClaimed[key] = state.trialsClaimed[key] || [];
  const events = [];
  for (const t of dailyTrials(state, now)) {
    if (t.done && !t.claimed) {
      state.trialsClaimed[key].push(t.id);
      state.bonusEssence += t.reward;
      events.push({ type: 'trial', trial: t });
    }
  }
  return events;
}

// ---------- chat ----------

function addChat(state, clanId, msg, now) {
  const list = (state.chat[clanId] = state.chat[clanId] || []);
  const from = msg.from ? { id: msg.from.id, name: msg.from.name, element: msg.from.element, isPlayer: !!msg.from.isPlayer } : null;
  const ts = Math.max(new Date(now).getTime(), (list[list.length - 1]?.ts || 0) + 1000);
  const m = { id: 'c' + ts.toString(36) + Math.random().toString(36).slice(2, 5), ts, kind: msg.kind, from, text: msg.text || '', act: msg.act || null, cheers: 0, cheered: false };
  list.push(m);
  if (list.length > 150) list.splice(0, list.length - 150);
  return m;
}

function fill(t, vars) { return t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ''); }

function botReactions(state, clan, msg, now) {
  const bots = clan.members.filter((m) => !m.isPlayer);
  if (!bots.length) return;
  const rng = mulberry32(msg.ts >>> 0);
  const route = getExpedition(clan.journeyId);
  const next = routePosition(route, clan.journeyKm).next;
  const n = 1 + Math.floor(rng() * Math.min(3, bots.length));
  msg.cheers += n;
  const bot = bots[Math.floor(rng() * bots.length)];
  const dist = `${r1(msg.act.km / KM_PER_MI)} mi`;
  addChat(state, clan.id, { kind: 'msg', from: bot, text: fill(pick(CHAT.cheer, rng), { name: msg.from.name, dist, landmark: next?.name || 'the finish' }) }, now);
}

function seedChat(state, clan, now) {
  const rng = mulberry32(clan.id.length * 97);
  const bots = clan.members.filter((m) => !m.isPlayer);
  const t0 = new Date(now).getTime() - 3 * 3600000;
  bots.slice(0, 3).forEach((b, i) => addChat(state, clan.id, { kind: 'msg', from: b, text: CHAT.banter[(i + Math.floor(rng() * 5)) % CHAT.banter.length] }, t0 + i * 600000));
}

export function postMessage(state, text, now = worldNow(state)) {
  const clan = playerClan(state);
  const clean = (text || '').trim().slice(0, 280);
  if (!clan || !clean) return [];
  const me = clan.members.find((m) => m.isPlayer);
  addChat(state, clan.id, { kind: 'msg', from: me, text: clean }, now);
  const bots = clan.members.filter((m) => !m.isPlayer);
  if (!bots.length) return [];
  const rng = mulberry32((Date.now() ^ clean.length) >>> 0);
  const lower = clean.toLowerCase();
  const key = ['hike', 'run', 'walk', 'rain', 'tired'].find((k) => lower.includes(k));
  const reply = key ? CHAT.reply[key] : pick(CHAT.reply.default, rng);
  addChat(state, clan.id, { kind: 'msg', from: bots[Math.floor(rng() * bots.length)], text: reply }, now);
  return [];
}

export function rally(state, now = worldNow(state)) {
  const clan = playerClan(state);
  if (!clan) throw new Error('Join a clan first');
  if (state.rallyDay === dayKey(now)) throw new Error('You already rallied today. Try again tomorrow.');
  state.rallyDay = dayKey(now);
  const me = clan.members.find((m) => m.isPlayer);
  addChat(state, clan.id, { kind: 'rally', from: me, text: '🔥 Rally! Who\'s moving today? Let\'s get everyone Bonded.' }, now);
  const rng = mulberry32(Date.now() >>> 0);
  clan.members.filter((m) => !m.isPlayer).sort((a, b) => a.propensity - b.propensity).slice(0, 2)
    .forEach((b) => addChat(state, clan.id, { kind: 'msg', from: b, text: pick(CHAT.rallyReply, rng) }, now));
  return [{ type: 'rally' }];
}

export function cheer(state, msgId, now = worldNow(state)) {
  const msg = (state.chat[state.clanId] || []).find((m) => m.id === msgId);
  if (!msg || msg.cheered || msg.from?.isPlayer) return [];
  msg.cheered = true;
  msg.cheers += 1;
  const key = dayKey(now);
  if (state.cheers.day !== key) state.cheers = { day: key, n: 0 };
  state.cheers.n += 1;
  const events = [];
  if (state.cheers.n <= CHEERS_PER_DAY) { state.bonusEssence += CHEER_ESSENCE; events.push({ type: 'cheer' }); }
  return events.concat(claimTrials(state, now));
}

// ---------- simulated clanmates ----------

const SPEED_KMH = { walk: 4.8, hike: 3.5, run: 9.5, cycle: 18, swim: 2, paddle: 6 };

function botsActOnDay(state, clan, date, rng, { quiet = false } = {}) {
  const events = [];
  const mine = clan.id === state.clanId;
  const rallied = mine && state.rallyDay === dayKey(date);
  const all = Object.keys(ACTIVITIES);
  for (const m of clan.members) {
    if (m.isPlayer) continue;
    if (rng() >= Math.min(0.95, m.propensity + (rallied ? 0.35 : 0))) continue;
    const aff = ELEMENTS[m.element].affinity;
    const type = rng() < 0.6 ? aff[Math.floor(rng() * aff.length)] : all[Math.floor(rng() * all.length)];
    const minutes = 15 + Math.round(rng() * 6) * 5; // 15–45 min: bots roughly cover their own share, not yours
    const intensity = ['light', 'moderate', 'moderate', 'vigorous'][Math.floor(rng() * 4)];
    const distanceKm = SPEED_KMH[type] ? (minutes / 60) * SPEED_KMH[type] * (0.8 + rng() * 0.4) : 0;
    const sc = scoreActivity({ type, minutes, distanceKm, intensity }, { element: m.element, power: activePower(clan, date) });
    record(clan, m.id, sc.element, sc.trailKm, type, date);
    m.totalKm = r1(m.totalKm + sc.trailKm);
    clan.totalKm = r1(clan.totalKm + sc.trailKm);
    events.push(...advanceJourney(state, clan, sc.trailKm, date));
    if (mine && !quiet) {
      const act = ACTIVITIES[type];
      addChat(state, clan.id, { kind: 'activity', from: m, act: { icon: act.icon, label: act.label, km: sc.trailKm, minutes, element: sc.element } }, date);
    }
  }
  if (mine && !quiet) {
    const st = clanStatus(clan);
    const bots = clan.members.filter((x) => !x.isPlayer);
    if (bots.length && !st.awakened && weekdayIdx(date) >= 2) {
      const sleepy = clan.members.filter((x) => (clan.week.days[x.id] || []).length < AWAKENING.bondDays).sort((a, b) => (a.isPlayer ? -1 : 0) - (b.isPlayer ? -1 : 0));
      const t = pick(CHAT.nudge, rng);
      if (!t.includes('{sleepy}') || sleepy.length) {
        addChat(state, clan.id, { kind: 'msg', from: bots[Math.floor(rng() * bots.length)], text: fill(t, {
          pct: Math.round(st.pct * 100), need: Math.max(0, st.bondNeeded - st.bonded.length) || 'no', sleepy: sleepy[0]?.name, power: st.power.name,
        }) }, date);
      }
    } else if (bots.length && rng() < 0.5) {
      addChat(state, clan.id, { kind: 'msg', from: bots[Math.floor(rng() * bots.length)], text: pick(CHAT.banter, rng) }, date);
    }
  }
  events.push(...evaluateTiers(state, clan, date));
  return events;
}

// "Simulate a day": the other members move today, then the world clock advances one day.
export function simulateDay(state) {
  const now = worldNow(state);
  const rng = mulberry32((now.getTime() / 1000) >>> 0);
  let events = [];
  for (const clan of state.clans) events = events.concat(botsActOnDay(state, clan, now, rng));
  state.dayOffset = (state.dayOffset || 0) + 1;
  events = events.concat(ensureWeeks(state, worldNow(state)));
  return events.concat(checkBadges(state));
}

// When the app opens on a later real day, let the clanmates catch up (max 3 days).
export function catchUp(state, realNow = new Date()) {
  let events = [];
  const today = dayKey(realNow);
  let d = fromKey(state.lastRealDay);
  let n = 0;
  while (dayKey(d) < today && n < 3) {
    const simDate = addDays(d, state.dayOffset || 0);
    events = events.concat(ensureWeeks(state, simDate));
    const rng = mulberry32((d.getTime() / 1000) >>> 0);
    for (const clan of state.clans) events = events.concat(botsActOnDay(state, clan, simDate, rng));
    d = addDays(d, 1);
    n++;
  }
  state.lastRealDay = today;
  return events.concat(ensureWeeks(state));
}

// ---------- badges & gear ----------

export function checkBadges(state, now = worldNow(state)) {
  const earned = [];
  const award = (id, cond) => {
    if (!state.badges.includes(id) && cond) { state.badges.push(id); earned.push({ type: 'badge', badge: { id, ...BADGES[id] } }); }
  };
  const s = streak(state, now);
  award('first_steps', state.activities.length > 0);
  award('kindred', !!state.clanId);
  award('streak3', s >= 3);
  award('streak7', s >= 7);
  award('harmony', new Set(state.activities.map((a) => a.element)).size >= 4);
  award('lorekeeper', state.unlockedLore.length >= 10);
  award('summit', !!playerClan(state)?.completed.length);
  award('awakened', spiritProgress(totalEssence(state)).stage >= 1);
  award('century', totalTrailKm(state) >= 100 * KM_PER_MI);
  award('local', state.checkins.length >= 3);
  award('awakener', !!state.flags.awakener);
  return earned;
}

export function kinStats(clan) {
  const w = clan.week;
  return clan.members.map((m) => ({
    member: m, km: w.km[m.id] || 0, days: w.days[m.id] || [], types: (w.types[m.id] || []).length,
    bonded: (w.days[m.id] || []).length >= AWAKENING.bondDays,
  })).sort((a, b) => b.km - a.km);
}

// ---------- spirit guide (rule-based; replace with an LLM later) ----------

export function spiritWhisper(state, now = worldNow(state)) {
  const el = ELEMENTS[state.player.element];
  const opener = el.voice[(new Date(now).getHours() + state.activities.length) % el.voice.length];
  const clan = playerClan(state);
  if (!clan) return `${opener} "Every spirit is stronger among kin. Join a clan, or found your own."`;
  const st = clanStatus(clan);
  const myDays = (clan.week.days.me || []).length;
  const movedToday = state.activities.some((a) => dayKey(a.date) === dayKey(now));
  if (st.awakened) return `${opener} "We are awakened. ${st.power.name} flows through the clan. Keep moving and the next building will rise next week."`;
  if (myDays < AWAKENING.bondDays && !movedToday) {
    return `${opener} "You've moved on ${myDays} of ${AWAKENING.bondDays} days this week. Even a 10-minute walk today brings you closer to being Bonded, and the clan can't awaken without its kin."`;
  }
  const leftKm = Math.max(0, st.target - st.charged);
  if (!st.bondOk) return `${opener} "${st.bondNeeded - st.bonded.length} more kin must be Bonded before we can awaken. Rally them in the chat."`;
  return `${opener} "The gauge needs ${r1(leftKm / KM_PER_MI)} more miles. Then ${st.power.name} is ours."`;
}

// ---------- utils ----------

function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { ELS };

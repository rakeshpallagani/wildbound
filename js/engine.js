// Wildbound — game rules (no DOM). Mutating functions take the state object and return UI events.
import {
  ASPECTS, ASPECT_IDS, AFFINITY, ACTIVITIES, INTENSITY, EXPEDITIONS, BADGES, SEED_CLANS, SEED_VIGILS, AWAKENING, POWERS,
  VIGIL, VIGILS, SHOP, CHAT, HOME, CLAN_LEVELS, VIGIL_MIN_LEVEL, HOST_MIN_LEVEL, SPOTS, BAND_TEMPLATES, OPEN_BANDS, GATHERING,
} from './data.js';
import { haversineM } from './geo.js';

export const KM_PER_MI = 1.609344;
export const MAX_MINUTES = 600;
export const VERIFIED_BONUS = 1.1;
export const STAGE_THRESHOLDS = [0, 400, 1500, 4000];
export const CHEER_ESSENCE = 2;
export const CHEERS_PER_DAY = 10;
const DAY = 86400000;
const r1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, a, b) => Math.max(a, Math.min(b, Number(n) || 0));
const zeroEnergy = () => Object.fromEntries(ASPECT_IDS.map((a) => [a, 0]));

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
export const worldNow = (state) => addDays(new Date(), state.dayOffset || 0);

// ---------- state ----------

export function newState(now = new Date()) {
  const s = {
    version: 4,
    gatherings: [],
    player: null,
    activities: [],
    bonusEssence: 0,
    lumens: 0,
    clanId: null,
    clans: SEED_CLANS.map((c, i) => seedClan(c, i, now)),
    vigils: Object.fromEntries(SEED_VIGILS.map(([id, holder, ward]) => [id, { holder, ward, shieldUntil: null }])),
    chat: {},
    unlockedLore: [],
    visited: [],
    trialsClaimed: {},
    badges: [],
    connections: {},
    flags: {},
    inventory: { auras: [], aura: null },
    pledge: { day: null, km: 0 },
    cheers: { day: null, n: 0 },
    rallyDay: null,
    dayOffset: 0,
    lastRealDay: dayKey(now),
    settings: { units: 'mi', mapEngine: 'builtin' },
  };
  const rng = mulberry32(99);
  for (let d = fromKey(weekStart(now)); dayKey(d) < dayKey(now); d = addDays(d, 1)) {
    for (const clan of s.clans) botsActOnDay(s, clan, d, rng, { quiet: true });
  }
  s.clans.forEach((c, i) => { c.xp = SEED_CLANS[i].xp; });
  ensureGatherings(s, now);
  return s;
}

const emptyWeek = (start) => ({ start, energy: zeroEnergy(), km: {}, days: {}, types: {}, tiers: [], awakened: false });

function seedClan(c, i, now) {
  const rng = mulberry32(1000 + i);
  const members = c.members.map(([name, aspect, propensity]) => ({
    id: 'm-' + name.toLowerCase(), name, aspect, propensity, isPlayer: false, totalKm: r1(30 + rng() * 90),
  }));
  return {
    id: c.id, name: c.name, aspect: c.aspect, motto: c.motto, founded: false, members, hub: { ...c.hub }, xp: c.xp || 0,
    journeyId: EXPEDITIONS[0].id, journeyKm: r1(rng() * EXPEDITIONS[0].lengthKm * 0.4), completed: [],
    totalKm: r1(members.reduce((a, m) => a + m.totalKm, 0)),
    week: emptyWeek(weekStart(now)), history: [], awakenings: i % 3, seals: c.seals ?? 1, power: null, lastRank: null,
    bands: seedBands(c, members, rng),
  };
}

function makeBand(clanId, [name, type, spotId, time, meetup], members = []) {
  return { id: `${clanId}-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`, name, type, spotId, time, meetup, members };
}
function seedBands(c, members, rng) {
  const idx = Math.max(0, SEED_CLANS.findIndex((x) => x.id === c.id));
  const tpl = [...BAND_TEMPLATES[c.aspect], OPEN_BANDS[idx % OPEN_BANDS.length]];
  const bands = tpl.map((t) => makeBand(c.id, t));
  members.forEach((m, i) => {
    bands[i % bands.length].members.push(m.id);
    if (rng() < 0.5) { const b = bands[Math.floor(rng() * bands.length)]; if (!b.members.includes(m.id)) b.members.push(m.id); }
  });
  return bands;
}

export function createPlayer(state, { name, primary, secondary = null }) {
  if (!ASPECTS[primary]) throw new Error('Choose your primary Aspect');
  if (secondary === primary || (secondary && !ASPECTS[secondary])) secondary = null;
  state.player = {
    name: (name || '').trim().slice(0, 24) || 'Wanderer', primary, secondary,
    pos: { ...HOME.start }, createdAt: new Date().toISOString(),
  };
  return state.player;
}
export function setAspects(state, primary, secondary) {
  if (!ASPECTS[primary]) return;
  state.player.primary = primary;
  state.player.secondary = secondary && secondary !== primary && ASPECTS[secondary] ? secondary : null;
  const me = playerClan(state)?.members.find((m) => m.isPlayer);
  if (me) me.aspect = primary;
}

export const playerClan = (state) => state.clans.find((c) => c.id === state.clanId) || null;
export const clanById = (state, id) => state.clans.find((c) => c.id === id) || null;
export function clanLevel(clan) {
  const xp = clan?.xp || 0;
  let cur = CLAN_LEVELS[0];
  for (const l of CLAN_LEVELS) if (xp >= l.xp) cur = l;
  const next = CLAN_LEVELS.find((l) => l.level === cur.level + 1) || null;
  return { ...cur, xp: Math.round(xp), next, pct: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1 };
}
export const canVigil = (clan) => clanLevel(clan).level >= VIGIL_MIN_LEVEL;
export const spotById = (id) => SPOTS.find((x) => x.id === id);
export const getExpedition = (id) => EXPEDITIONS.find((e) => e.id === id) || EXPEDITIONS[0];

// ---------- boons & powers ----------

export function activePower(clan, now) {
  if (!clan?.power) return null;
  return dayKey(now) <= clan.power.until ? POWERS[clan.power.id] : null;
}
export function heldVigils(state, clanId) {
  return VIGILS.filter((v) => state.vigils[v.id]?.holder === clanId);
}
export function boonsFor(state, clanId) {
  return new Set(heldVigils(state, clanId).map((v) => v.boon.id));
}

// ---------- scoring ----------

export function affinityMult(aspect, player) {
  if (!player) return 1;
  if (aspect === player.primary) return AFFINITY.primary;
  if (aspect === player.secondary) return AFFINITY.secondary;
  return 1;
}

export function scoreActivity(input, { player = null, power = null, boons = new Set(), date = new Date() } = {}) {
  const act = ACTIVITIES[input.type];
  if (!act) throw new Error(`Unknown activity: ${input.type}`);
  const minutes = Math.round(clamp(input.minutes, 0, MAX_MINUTES));
  let distanceKm = clamp(input.distanceKm, 0, 300);
  const steps = Math.round(clamp(input.steps, 0, 100000));
  if (!distanceKm && act.steps && steps) distanceKm = steps * 0.000762;
  const elevM = act.elev ? clamp(input.elevM, 0, 5000) : 0;
  const mult = (INTENSITY[input.intensity] || INTENSITY.moderate).mult;
  const aff = affinityMult(act.aspect, player);
  const verified = !!input.source && input.source !== 'manual';
  const a = act.aspect;

  let essMult = mult * aff * (verified ? VERIFIED_BONUS : 1);
  let kmMult = 1;
  const applied = [];
  if (power) {
    const p = power.id;
    if ((p === 'ironroot' && a === 'ironroot') || (p === 'tidecaller' && a === 'tidecaller') || (p === 'mistwalker' && a === 'mistwalker')) { essMult *= 1.25; applied.push(power.name); }
    if (p === 'galewing') { kmMult *= 1.25; applied.push(power.name); }
    if (p === 'convergence') { essMult *= 1.15; kmMult *= 1.15; applied.push(power.name); }
  }
  const boon = (id, ok, f) => { if (boons.has(id) && ok) { f(); applied.push(VIGILS.find((v) => v.boon.id === id).vigil); } };
  boon('sky', true, () => { kmMult *= 1.1; });
  boon('forge', a === 'ironroot', () => { essMult *= 1.1; });
  boon('overlook', a === 'mistwalker', () => { essMult *= 1.1; });
  boon('tidegate', a === 'tidecaller', () => { essMult *= 1.1; });
  boon('stillwater', a === 'galewing', () => { essMult *= 1.1; });
  boon('arena', a === 'emberclaw', () => { essMult *= 1.1; });
  boon('founders', true, () => { essMult *= 1.05; });
  boon('sunset', [5, 6].includes(weekdayIdx(date)), () => { essMult *= 1.15; });

  const base = act.distance && distanceKm > 0 ? distanceKm * act.trailFactor : (minutes / 12) * mult;
  return {
    essence: Math.round(minutes * essMult), trailKm: r1((base + elevM / 200) * kmMult),
    affinity: aff > 1, affinityMult: aff, verified, applied, aspect: a, minutes, distanceKm: r1(distanceKm), elevM: Math.round(elevM), steps,
  };
}

function ctxFor(state, date) {
  const clan = playerClan(state);
  return { player: state.player, power: activePower(clan, date), boons: clan ? boonsFor(state, clan.id) : new Set(), date };
}
export const scoreForPlayer = (state, input, date = worldNow(state)) => scoreActivity(input, ctxFor(state, date));

export const totalEssence = (state) => state.activities.reduce((s, a) => s + a.essence, 0) + state.bonusEssence;
export const totalTrailKm = (state) => r1(state.activities.reduce((s, a) => s + a.trailKm, 0));

export function spiritProgress(essence) {
  let stage = 0;
  STAGE_THRESHOLDS.forEach((t, i) => { if (essence >= t) stage = i; });
  const curr = STAGE_THRESHOLDS[stage], next = STAGE_THRESHOLDS[stage + 1];
  return {
    stage, level: 1 + Math.floor(Math.sqrt(essence / 20)), nextAt: next ?? null,
    pct: next ? Math.max(0, Math.min(1, (essence - curr) / (next - curr))) : 1,
  };
}

export function streak(state, now = worldNow(state)) {
  const days = new Set(state.activities.map((a) => dayKey(a.date)));
  const clan = playerClan(state);
  const shield = activePower(clan, now)?.id === 'tidecaller' || (clan && boonsFor(state, clan.id).has('lantern'));
  let gaps = shield ? 1 : 0, count = 0;
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

function record(clan, memberId, aspect, km, type, date) {
  clan.xp = r1((clan.xp || 0) + km);
  const w = clan.week;
  if (weekStart(date) !== w.start) return;
  w.energy[aspect] = r1((w.energy[aspect] || 0) + km);
  w.km[memberId] = r1((w.km[memberId] || 0) + km);
  w.days[memberId] = [...new Set([...(w.days[memberId] || []), weekdayIdx(date)])].sort();
  w.types[memberId] = [...new Set([...(w.types[memberId] || []), type])];
}

export function dominantAspect(energy) {
  const total = ASPECT_IDS.reduce((s, e) => s + (energy[e] || 0), 0);
  if (!total) return null;
  const top = ASPECT_IDS.reduce((a, b) => ((energy[b] || 0) > (energy[a] || 0) ? b : a));
  return energy[top] / total <= AWAKENING.convergenceShare ? 'convergence' : top;
}

export function clanStatus(clan) {
  const n = clan.members.length;
  const w = clan.week;
  const target = r1(AWAKENING.targetKmPerMember * n);
  const charged = r1(ASPECT_IDS.reduce((s, e) => s + (w.energy[e] || 0), 0));
  const pct = Math.min(1, target ? charged / target : 0);
  const bonded = clan.members.filter((m) => (w.days[m.id] || []).length >= AWAKENING.bondDays);
  const bondNeeded = Math.ceil(n * AWAKENING.bondShare);
  const dominant = dominantAspect(w.energy) || clan.aspect;
  let tier = null;
  for (const t of AWAKENING.tiers) {
    if (t.id === 'awakened') { if (w.awakened) tier = t; } else if (pct >= t.at) tier = t;
  }
  return { target, charged, pct, bonded, bondNeeded, bondOk: bonded.length >= bondNeeded, dominant, power: POWERS[dominant], energy: w.energy, tier, awakened: w.awakened, members: n };
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
        addChat(state, clan.id, { kind: 'system', text: `The clan gauge is ${t.name}! Everyone gets +${t.reward} XP.` }, now);
      }
    }
  }
  if (st.pct >= 1 && st.bondOk && !clan.week.awakened) {
    clan.week.awakened = true;
    clan.week.tiers.push('awakened');
    clan.awakenings += 1;
    clan.seals += AWAKENING.seals + (clanLevel(clan).level >= 4 ? 1 : 0);
    clan.xp = (clan.xp || 0) + 150;
    clan.power = { id: st.dominant, until: dayKey(addDays(fromKey(clan.week.start), 13)) };
    if (mine) {
      state.bonusEssence += 150;
      state.lumens += AWAKENING.lumens;
      if (st.bonded.some((m) => m.isPlayer)) state.flags.awakener = true;
      events.push({ type: 'awaken', power: POWERS[st.dominant] });
      addChat(state, clan.id, { kind: 'system', text: `⚡ ${clan.name} has AWAKENED! ${POWERS[st.dominant].name}: ${POWERS[st.dominant].effect}. +${AWAKENING.seals} Vigil Seals, +${AWAKENING.lumens} ✦ each, and our vigils are empowered (half decay, ×1.5 tribute) for two weeks.` }, now);
    } else {
      notifyRival(state, `${clan.name} has awakened ${POWERS[st.dominant].icon} ${POWERS[st.dominant].name}. Watch your vigils.`, now);
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
      const vigils = heldVigils(state, c.id).length;
      const score = Math.round(perMember * (0.5 + 0.5 * bondShare) * 10 + vigils * 15);
      return { clan: c, st, perMember: r1(perMember), bondShare, vigils, score };
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

export function journeyNext(route, km) {
  const idx = route.waypoints.findIndex((w) => w.km > km);
  return idx < 0 ? null : { idx, wp: route.waypoints[idx] };
}

function unlockPassed(state, route, km, events, quiet = false) {
  route.waypoints.forEach((wp, idx) => {
    const key = `${route.id}:${idx}`;
    if (wp.km <= km && !state.unlockedLore.includes(key)) {
      state.unlockedLore.push(key);
      events.push({ type: 'lore', name: wp.name, quiet });
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
        addChat(state, clan.id, { kind: 'system', text: `🏔️ Journey complete: ${route.name}! +200 XP each. Next: ${next.name}.` }, now);
        unlockPassed(state, next, 0, events);
      }
    } else break;
  }
  return events;
}

// ---------- clans ----------

export function joinClan(state, clanId, now = worldNow(state)) {
  const clan = clanById(state, clanId);
  if (!clan || !state.player) return [];
  leaveClan(state);
  state.clanId = clan.id;
  clan.members.push({ id: 'me', name: state.player.name, aspect: state.player.primary, isPlayer: true, propensity: 0, totalKm: 0 });
  const events = [];
  unlockPassed(state, getExpedition(clan.journeyId), clan.journeyKm, events, true);
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
  const id = 'clan-' + Math.random().toString(36).slice(2, 8);
  state.clans.push({
    id, hub: { name: 'Your hearth', lat: state.player.pos.lat, lon: state.player.pos.lon }, xp: 0,
    name: clean, aspect: state.player.primary, motto: (motto || '').trim().slice(0, 60) || ASPECTS[state.player.primary].motto, founded: true,
    members: [
      { id: 'm-tamsin', name: 'Tamsin', aspect: 'galewing', propensity: 0.6, isPlayer: false, totalKm: 0 },
      { id: 'm-bodhi', name: 'Bodhi', aspect: 'ironroot', propensity: 0.5, isPlayer: false, totalKm: 0 },
    ],
    bands: [],
    journeyId: EXPEDITIONS[0].id, journeyKm: 0, completed: [], totalKm: 0,
    week: emptyWeek(weekStart(now)), history: [], awakenings: 0, seals: 1, power: null, lastRank: null,
  });
  return joinClan(state, id, now);
}

// ---------- logging ----------

export function logActivity(state, input, now = worldNow(state)) {
  if (!state.player) throw new Error('Create your wanderer first');
  const clan = playerClan(state);
  const date = input.date ? new Date(input.date) : new Date(now);
  const stageBefore = spiritProgress(totalEssence(state)).stage;
  const scored = scoreActivity(input, ctxFor(state, date));
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
    record(clan, 'me', entry.aspect, entry.trailKm, entry.type, date);
    events.push(...advanceJourney(state, clan, entry.trailKm, now));
    const act = ACTIVITIES[entry.type];
    const msg = addChat(state, clan.id, { kind: 'activity', from: me, act: { icon: act.icon, label: act.label, km: entry.trailKm, minutes: entry.minutes, place: entry.place, aspect: entry.aspect } }, now);
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
  let events = [], count = 0;
  for (const inp of inputs) {
    if (seen.has(inp.externalId)) continue;
    events = events.concat(logActivity(state, { ...inp, source }, now));
    count++;
  }
  return [{ type: 'imported', source, count }, ...events.filter((e) => e.type !== 'logged')];
}
export function disconnect(state, source) { delete state.connections[source]; }

// A tracked trek from GPS (or Demo GPS): classify by average speed and log as verified.
export function classifyTrek(distanceKm, minutes) {
  const kmh = minutes > 0 ? distanceKm / (minutes / 60) : 0;
  return kmh < 7 ? 'walk' : kmh < 14 ? 'run' : 'cycle';
}
export function logTrek(state, { distanceKm, minutes, place, demo }, now = worldNow(state)) {
  if (distanceKm < 0.05) throw new Error('Too short to log. Move a little further.');
  const type = classifyTrek(distanceKm, minutes);
  return logActivity(state, { type, minutes: Math.max(1, Math.round(minutes)), distanceKm, intensity: type === 'walk' ? 'light' : 'moderate', place, source: demo ? 'demo-gps' : 'gps', note: demo ? 'Demo GPS trek' : 'GPS trek' }, now);
}

// ---------- vigils ----------

export function vigilState(state, id) {
  const site = VIGILS.find((v) => v.id === id);
  const v = state.vigils[id] || { holder: null, ward: 0, shieldUntil: null };
  return { site, ...v, holderClan: v.holder ? clanById(state, v.holder) : null };
}
export const distanceTo = (state, site) => haversineM(state.player.pos, { lat: site.lat, lon: site.lon });
export const inRange = (state, site) => distanceTo(state, site) <= VIGIL.radiusM;
export function nearestVigil(state) {
  return VIGILS.map((site) => ({ site, m: distanceTo(state, site) })).sort((a, b) => a.m - b.m)[0];
}
export function pledgeableKm(state, now = worldNow(state)) {
  const today = dayKey(now);
  const moved = state.activities.filter((a) => dayKey(a.date) === today).reduce((s, a) => s + a.trailKm, 0);
  const used = state.pledge.day === today ? state.pledge.km : 0;
  return r1(Math.max(0, moved - used));
}
function usePledge(state, km, now) {
  const today = dayKey(now);
  if (state.pledge.day !== today) state.pledge = { day: today, km: 0 };
  state.pledge.km = r1(state.pledge.km + km);
}
function wardPerKm(clan, now) {
  return VIGIL.wardPerKm * (activePower(clan, now)?.id === 'mistwalker' ? 1.25 : 1);
}
const isShielded = (v, now) => !!v.shieldUntil && dayKey(now) <= v.shieldUntil;

// Being at a vigil site unlocks its lore and counts as a visit.
export function visitIfNear(state, now = worldNow(state)) {
  const events = [];
  for (const site of VIGILS) {
    if (!inRange(state, site)) continue;
    const key = `vigil:${site.id}`;
    if (!state.unlockedLore.includes(key)) { state.unlockedLore.push(key); events.push({ type: 'lore', name: site.name }); }
    if (!state.visited.includes(site.id)) state.visited.push(site.id);
  }
  return events.concat(events.length ? checkBadges(state, now) : []);
}

function requireAction(state, id, now) {
  const clan = playerClan(state);
  if (!clan) throw new Error('Join a clan to take part in vigils');
  if (!canVigil(clan)) throw new Error(`Vigils unlock when your clan reaches Level ${VIGIL_MIN_LEVEL} (${CLAN_LEVELS[VIGIL_MIN_LEVEL - 1].name}). Keep moving together.`);
  const vs = vigilState(state, id);
  if (!inRange(state, vs.site)) throw new Error(`You need to be within ${VIGIL.radiusM} m of ${vs.site.name}. Head there first.`);
  return { clan, vs, v: state.vigils[id] };
}

export function fortify(state, id, km = null, now = worldNow(state)) {
  const { clan, vs, v } = requireAction(state, id, now);
  if (vs.holder !== clan.id) throw new Error('Your clan doesn\'t hold this vigil');
  const avail = pledgeableKm(state, now);
  const use = r1(Math.min(avail, km ?? avail));
  if (use <= 0) throw new Error('No movement left to pledge today. Log or track some first.');
  const add = Math.round(use * wardPerKm(clan, now));
  v.ward = Math.min(VIGIL.maxWard, v.ward + add);
  v.pledges = { ...(v.pledges || {}), me: (v.pledges?.me || 0) + add };
  usePledge(state, use, now);
  addChat(state, clan.id, { kind: 'system', text: `🛡️ ${state.player.name} fortified ${vs.site.vigil} at ${vs.site.name} (+${add} ward → ${v.ward}).` }, now);
  return [{ type: 'fortify', site: vs.site, add, ward: v.ward }];
}

export function siege(state, id, km = null, now = worldNow(state)) {
  const { clan, vs, v } = requireAction(state, id, now);
  if (!vs.holder) throw new Error('Nobody holds this vigil. Establish it instead.');
  if (vs.holder === clan.id) throw new Error('You can\'t siege your own vigil');
  if (isShielded(v, now)) throw new Error(`${vs.holderClan.name} shielded this vigil until tomorrow.`);
  const avail = pledgeableKm(state, now);
  const use = r1(Math.min(avail, km ?? avail));
  if (use <= 0) throw new Error('No movement left to pledge today. Log or track some first.');
  const dmg = Math.round(use * wardPerKm(clan, now));
  const before = v.ward;
  v.ward = Math.max(0, v.ward - dmg);
  usePledge(state, use, now);
  const rival = vs.holderClan;
  const events = [{ type: 'siege', site: vs.site, dmg, ward: v.ward, rival }];
  if (v.ward <= 0) {
    events.push(...fall(state, id, clan, now, Math.round(dmg - before)));
  } else {
    addChat(state, clan.id, { kind: 'system', text: `⚔️ ${state.player.name} sieged ${rival.name}'s vigil at ${vs.site.name} (−${dmg} ward, ${v.ward} left).` }, now);
  }
  return events;
}

function fall(state, id, breaker, now, overflow = 0) {
  const v = state.vigils[id];
  const site = VIGILS.find((x) => x.id === id);
  const lost = v.holder;
  const events = [];
  if (lost === state.clanId && breaker.id !== state.clanId) {
    addChat(state, state.clanId, { kind: 'system', text: `💔 ${breaker.name} broke our vigil at ${site.name}! Retake it.` }, now);
    events.push({ type: 'lost', site, by: breaker });
  }
  if (breaker.seals > 0 && canVigil(breaker)) {
    breaker.seals -= 1;
    v.holder = breaker.id;
    v.ward = VIGIL.establishWard + Math.max(0, overflow);
    v.pledges = breaker.id === state.clanId ? { me: v.ward } : {};
    v.shieldUntil = null;
    if (breaker.id === state.clanId) {
      state.flags.warden = true;
      addChat(state, breaker.id, { kind: 'system', text: `🔱 We claimed ${site.vigil} at ${site.name}! Tribute: ${site.yield} ✦ a day each, and ${site.boon.text.toLowerCase()}.` }, now);
      events.push({ type: 'claimed', site });
    }
  } else {
    v.holder = null; v.ward = 0; v.shieldUntil = null;
    if (breaker.id === state.clanId) {
      addChat(state, breaker.id, { kind: 'system', text: `${site.name} has fallen open, but we have no Vigil Seal to claim it. Awaken the clan or buy a seal.` }, now);
      events.push({ type: 'opened', site });
    }
  }
  return events.concat(checkBadges(state, now));
}

export function establish(state, id, now = worldNow(state)) {
  const { clan, vs, v } = requireAction(state, id, now);
  if (vs.holder) throw new Error(`${vs.holderClan.name} holds this vigil. Siege it first.`);
  if (clan.seals <= 0) throw new Error('Your clan has no Vigil Seals. Awaken the clan or buy one in the shop.');
  clan.seals -= 1;
  v.holder = clan.id;
  v.ward = VIGIL.establishWard;
  v.pledges = { me: VIGIL.establishWard };
  const extra = pledgeableKm(state, now);
  if (extra > 0) { v.ward = Math.min(VIGIL.maxWard, v.ward + Math.round(extra * wardPerKm(clan, now))); usePledge(state, extra, now); }
  state.flags.warden = true;
  addChat(state, clan.id, { kind: 'system', text: `🔱 ${state.player.name} established ${vs.site.vigil} at ${vs.site.name} (ward ${v.ward}).` }, now);
  return [{ type: 'claimed', site: vs.site }, ...checkBadges(state, now)];
}

// Once per day: ward decays, holders collect tribute, rival clans make their moves.
function dailyTick(state, date, rng) {
  const events = [];
  const mine = state.clanId;
  let tribute = 0;
  for (const site of VIGILS) {
    const v = state.vigils[site.id];
    if (!v?.holder) continue;
    const holder = clanById(state, v.holder);
    const empowered = !!activePower(holder, date);
    v.ward = Math.round(v.ward * (1 - VIGIL.decay * (empowered ? 0.5 : 1) * (clanLevel(holder).level >= 5 ? 0.75 : 1)));
    if (v.ward < 5) {
      if (v.holder === mine) addChat(state, mine, { kind: 'system', text: `🕯️ Our vigil at ${site.name} faded from neglect. Fortify vigils to keep them.` }, date);
      v.holder = null; v.ward = 0;
      continue;
    }
    if (v.holder === mine) {
      tribute += Math.round(site.yield * (empowered ? 1.5 : 1));
      if (site.boon.id === 'watch') state.bonusEssence += 15;
    }
  }
  if (tribute) {
    state.lumens += tribute;
    events.push({ type: 'tribute', lumens: tribute });
  }
  // rival clans
  for (const clan of state.clans) {
    if (clan.id === mine) continue;
    const energy = clan.members.reduce((s, m) => s + m.propensity, 0) / clan.members.length;
    for (const site of heldVigils(state, clan.id)) if (rng() < 0.5) state.vigils[site.id].ward = Math.min(VIGIL.maxWard, state.vigils[site.id].ward + Math.round(40 + rng() * 100));
    if (rng() < 0.3 + energy * 0.3) {
      const targets = VIGILS.filter((s) => { const v = state.vigils[s.id]; return v.holder && v.holder !== clan.id && !isShielded(v, date); });
      const theirs = targets.filter((s) => state.vigils[s.id].holder === mine);
      const pool = theirs.length && rng() < 0.3 ? theirs : targets;
      if (pool.length) {
        const site = pool[Math.floor(rng() * pool.length)];
        const v = state.vigils[site.id];
        const dmg = Math.round(50 + rng() * 100);
        const before = v.ward;
        v.ward = Math.max(0, v.ward - dmg);
        if (v.ward <= 0) events.push(...fall(state, site.id, clan, date, dmg - before));
        else if (v.holder === mine) {
          addChat(state, mine, { kind: 'system', text: `⚠️ ${clan.name} sieged our vigil at ${site.name} (ward ${before} → ${v.ward}).` }, date);
          events.push({ type: 'attacked', site, by: clan });
        }
      }
    }
    if (clan.seals > 0 && canVigil(clan) && rng() < 0.35) {
      const open = VIGILS.filter((s) => !state.vigils[s.id].holder);
      if (open.length) {
        const site = open[Math.floor(rng() * open.length)];
        clan.seals -= 1;
        state.vigils[site.id] = { holder: clan.id, ward: VIGIL.establishWard, shieldUntil: null };
        notifyRival(state, `${clan.name} raised a vigil at ${site.name}.`, date);
      }
    }
  }
  return events;
}

function notifyRival(state, text, now) {
  if (state.clanId) addChat(state, state.clanId, { kind: 'system', text: `👁️ ${text}` }, now);
}

// ---------- gatherings (clan activities happening around the city) ----------

export function ensureGatherings(state, now = worldNow(state)) {
  const today = dayKey(now);
  state.gatherings = (state.gatherings || []).filter((g) => g.day >= today);
  const rng = mulberry32((fromKey(today).getTime() / 1000 + state.gatherings.length) >>> 0);
  for (const clan of state.clans) {
    if (clan.founded || clan.remote) continue; // real clans and your own clan meet when people host
    for (const band of clan.bands || []) {
      if (state.gatherings.some((g) => g.bandId === band.id)) continue;
      const bots = clan.members.filter((m) => !m.isPlayer && band.members.includes(m.id));
      if (!bots.length) continue;
      const offset = rng() < 0.45 ? 0 : 1 + Math.floor(rng() * 5);
      const host = bots[Math.floor(rng() * bots.length)];
      const going = bots.filter(() => rng() < 0.7).map((m) => m.id);
      if (!going.includes(host.id)) going.push(host.id);
      state.gatherings.push({ id: 'g' + Math.random().toString(36).slice(2, 9), clanId: clan.id, bandId: band.id, title: band.meetup, type: band.type, spotId: band.spotId, day: dayKey(addDays(now, offset)), time: band.time, host: host.name, going, rsvp: false, attended: false });
    }
  }
  state.gatherings.sort((a, b) => (a.day + a.time < b.day + b.time ? -1 : 1));
}

// ---------- bands ----------

export const bandById = (state, id) => { for (const c of state.clans) { const b = (c.bands || []).find((x) => x.id === id); if (b) return { clan: c, band: b }; } return null; };
export const myBands = (state) => (playerClan(state)?.bands || []).filter((b) => b.members.includes('me'));

export function joinBand(state, bandId, now = worldNow(state)) {
  const found = bandById(state, bandId);
  if (!found || found.clan.id !== state.clanId) throw new Error('Join the clan first, then its bands');
  const { band, clan } = found;
  if (band.members.includes('me')) { band.members = band.members.filter((x) => x !== 'me'); return [{ type: 'band-left', band }]; }
  band.members.push('me');
  const ch = `${clan.id}/${band.id}`;
  addChat(state, ch, { kind: 'system', text: `${state.player.name} joined ${band.name}.` }, now);
  const greeter = clan.members.find((m) => band.members.includes(m.id) && !m.isPlayer);
  if (greeter && !clan.remote) addChat(state, ch, { kind: 'msg', from: greeter, text: `Welcome to ${band.name}! We usually meet ${band.time} at ${spotById(band.spotId).name}.` }, now);
  return [{ type: 'band-joined', band }];
}

export function createBand(state, { name, type, spotId, time = '18:00' }, now = worldNow(state)) {
  const clan = playerClan(state);
  if (!clan) throw new Error('Join a clan first');
  const clean = (name || '').trim().slice(0, 32);
  if (!clean) throw new Error('Name your band');
  if (!ACTIVITIES[type] || !spotById(spotId)) throw new Error('Pick an activity and a home spot');
  if ((clan.bands || []).some((b) => b.name.toLowerCase() === clean.toLowerCase())) throw new Error('That band already exists');
  const band = makeBand(clan.id, [clean, type, spotId, time, `${clean}: ${ACTIVITIES[type].label}`], ['me']);
  clan.bands = [...(clan.bands || []), band];
  addChat(state, clan.id, { kind: 'system', text: `${state.player.name} started a new band: ${clean} (${ACTIVITIES[type].label}, ${spotById(spotId).name}).` }, now);
  return [{ type: 'band-created', band }];
}

export function rsvp(state, id, now = worldNow(state)) {
  const g = state.gatherings.find((x) => x.id === id);
  if (!g) throw new Error('That gathering is over');
  g.rsvp = !g.rsvp;
  g.going = g.rsvp ? [...new Set([...g.going, 'me'])] : g.going.filter((x) => x !== 'me');
  const clan = playerClan(state);
  if (g.rsvp && clan) {
    const host = clanById(state, g.clanId);
    addChat(state, clan.id, { kind: 'system', text: `📅 ${state.player.name} is going to ${host.id === clan.id ? '' : `${host.name}'s `}${g.title} at ${spotById(g.spotId).name} (${fmtGDay(g.day, now)} ${g.time}).` }, now);
  }
  return [{ type: 'rsvp', g }];
}

export function attendGathering(state, id, now = worldNow(state)) {
  const g = state.gatherings.find((x) => x.id === id);
  if (!g) throw new Error('That gathering is over');
  if (g.attended) throw new Error('You already checked in here');
  if (g.day !== dayKey(now)) throw new Error(`This gathering is on ${fmtGDay(g.day, now)}. Come back then.`);
  const spot = spotById(g.spotId);
  if (haversineM(state.player.pos, spot) > GATHERING.radiusM) throw new Error(`Check-in opens within ${GATHERING.radiusM} m of ${spot.name}.`);
  if (!state.activities.some((a) => dayKey(a.date) === dayKey(now))) throw new Error('Move first: track a trek or log the activity, then check in.');
  g.attended = true;
  g.going = [...new Set([...g.going, 'me'])];
  state.bonusEssence += GATHERING.essence;
  state.lumens += GATHERING.lumens;
  const host = clanById(state, g.clanId);
  host.xp = (host.xp || 0) + GATHERING.clanXp;
  const mine = playerClan(state);
  if (mine && mine.id !== host.id) mine.xp = (mine.xp || 0) + GATHERING.clanXp;
  if (mine) addChat(state, mine.id, { kind: 'system', text: `🤝 ${state.player.name} showed up to ${host.id === mine.id ? 'our' : `${host.name}'s`} ${g.title} at ${spot.name}. +${GATHERING.clanXp} clan XP.` }, now);
  state.flags.gatherings = (state.flags.gatherings || 0) + 1;
  return [{ type: 'attended', g, spot }, ...checkBadges(state, now)];
}

export function hostGathering(state, { type, spotId, when = 'today', time = '18:00', bandId = '' }, now = worldNow(state)) {
  const clan = playerClan(state);
  if (!clan) throw new Error('Join a clan first');
  const lvl = clanLevel(clan);
  if (lvl.level < HOST_MIN_LEVEL) throw new Error(`Hosting unlocks at clan Level ${HOST_MIN_LEVEL} (${CLAN_LEVELS[HOST_MIN_LEVEL - 1].name}).`);
  const spot = spotById(spotId);
  if (!spot || !ACTIVITIES[type]) throw new Error('Pick an activity and a place');
  const day = dayKey(addDays(now, when === 'tomorrow' ? 1 : when === 'weekend' ? Math.max(0, 5 - weekdayIdx(now)) : 0));
  const rng = mulberry32(Date.now() >>> 0);
  const bots = clan.members.filter((m) => !m.isPlayer);
  const going = ['me', ...bots.filter(() => rng() < 0.5).map((m) => m.id)];
  const band = bandId ? (clan.bands || []).find((b) => b.id === bandId) : null;
  const g = { id: 'g' + Math.random().toString(36).slice(2, 9), clanId: clan.id, bandId: band?.id || null, title: band ? `${band.name}: ${ACTIVITIES[type].label}` : `${ACTIVITIES[type].label} at ${spot.name}`, type, spotId, day, time, host: state.player.name, going, rsvp: true, attended: false };
  state.gatherings.push(g);
  state.gatherings.sort((a, b) => (a.day + a.time < b.day + b.time ? -1 : 1));
  addChat(state, clan.id, { kind: 'rally', from: clan.members.find((m) => m.isPlayer), text: `📍 New gathering: ${g.title}, ${fmtGDay(day, now)} ${time}. Who's in?` }, now);
  bots.filter((b) => going.includes(b.id)).slice(0, 2).forEach((b) => addChat(state, clan.id, { kind: 'msg', from: b, text: pick(CHAT.rallyReply, rng) }, now));
  return [{ type: 'hosted', g }];
}

export function fmtGDay(day, now) {
  if (day === dayKey(now)) return 'today';
  if (day === dayKey(addDays(now, 1))) return 'tomorrow';
  return fromKey(day).toLocaleDateString(undefined, { weekday: 'short' });
}

// ---------- shop ----------

export function buy(state, itemId, now = worldNow(state)) {
  const item = SHOP.find((i) => i.id === itemId);
  if (!item) throw new Error('Unknown item');
  if (item.kind === 'aura' && state.inventory.auras.includes(item.id)) { state.inventory.aura = item.id; return [{ type: 'equip', item }]; }
  if (state.lumens < item.price) throw new Error(`You need ${item.price - state.lumens} more ✦`);
  const clan = playerClan(state);
  if (item.kind === 'clan' && !clan) throw new Error('Join a clan first');
  if (item.id === 'shield') {
    const held = heldVigils(state, clan.id).map((s) => ({ s, v: state.vigils[s.id] })).sort((a, b) => a.v.ward - b.v.ward);
    if (!held.length) throw new Error('Your clan holds no vigils to shield');
    held[0].v.shieldUntil = dayKey(addDays(now, 1));
    addChat(state, clan.id, { kind: 'system', text: `🛡️ ${state.player.name} shielded our vigil at ${held[0].s.name} until tomorrow.` }, now);
  }
  if (item.id === 'seal') { clan.seals += 1; addChat(state, clan.id, { kind: 'system', text: `🔱 ${state.player.name} forged a Vigil Seal for the clan.` }, now); }
  if (item.id === 'horn') { if (state.rallyDay !== dayKey(now)) throw new Error('You can still rally today for free'); state.rallyDay = null; }
  if (item.kind === 'aura') { state.inventory.auras.push(item.id); state.inventory.aura = item.id; }
  state.lumens -= item.price;
  return [{ type: 'bought', item }];
}

// ---------- daily trials ----------

const TRIAL_POOL = [
  { id: 'affinity', text: 'Honour your Aspect (a primary or secondary activity)', reward: 50, check: (a) => a.some((x) => x.affinity) },
  { id: 'move10',   text: 'Move for at least 10 minutes',   reward: 25, check: (a) => sum(a, 'minutes') >= 10 },
  { id: 'move30',   text: 'Move for 30 minutes in total',   reward: 40, check: (a) => sum(a, 'minutes') >= 30 },
  { id: 'trail2',   text: 'Cover 2 trail miles',            reward: 40, check: (a) => sum(a, 'trailKm') >= 2 * KM_PER_MI },
  { id: 'outside',  text: 'Get outside: walk or hike',      reward: 40, check: (a) => a.some((x) => x.type === 'walk' || x.type === 'hike') },
  { id: 'strength', text: 'Gym or strength: 20+ minutes',   reward: 50, check: (a) => a.some((x) => x.type === 'strength' && x.minutes >= 20) },
  { id: 'variety',  text: 'Two different Aspects today',    reward: 50, check: (a) => new Set(a.map((x) => x.aspect)).size >= 2 },
  { id: 'cheer',    text: 'Cheer a clanmate in chat',       reward: 20, check: (a, ctx) => ctx.cheers > 0 },
  { id: 'gps',      text: 'Track a trek on the map',        reward: 45, check: (a) => a.some((x) => x.source === 'gps' || x.source === 'demo-gps') },
];
const sum = (arr, k) => arr.reduce((s, x) => s + (x[k] || 0), 0);

export function dailyTrials(state, now = worldNow(state)) {
  const key = dayKey(now);
  const seed = [...key, ...(state.player?.primary || '')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rng = mulberry32(seed);
  const pool = TRIAL_POOL.slice(1);
  const picks = [TRIAL_POOL[0]];
  while (picks.length < 3) picks.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  const todays = state.activities.filter((a) => dayKey(a.date) === key);
  const ctx = { cheers: state.cheers.day === key ? state.cheers.n : 0 };
  const claimed = state.trialsClaimed[key] || [];
  const clan = playerClan(state);
  const double = activePower(clan, now)?.id === 'emberclaw' ? 2 : 1;
  const extra = clan && boonsFor(state, clan.id).has('market') ? 10 : 0;
  return picks.map((t) => ({ id: t.id, text: t.text, reward: t.reward * double + extra, done: t.check(todays, ctx), claimed: claimed.includes(t.id) }));
}

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

export function addChat(state, clanId, msg, now) {
  const list = (state.chat[clanId] = state.chat[clanId] || []);
  const from = msg.from ? { id: msg.from.id, name: msg.from.name, aspect: msg.from.aspect, isPlayer: !!msg.from.isPlayer } : null;
  const ts = Math.max(new Date(now).getTime(), (list[list.length - 1]?.ts || 0) + 1000);
  const m = { id: 'c' + ts.toString(36) + Math.random().toString(36).slice(2, 5), ts, kind: msg.kind, from, text: msg.text || '', act: msg.act || null, cheers: 0, cheered: false };
  list.push(m);
  if (list.length > 150) list.splice(0, list.length - 150);
  return m;
}
const fill = (t, vars) => t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

function botReactions(state, clan, msg, now) {
  if (clan.remote) return;
  const bots = clan.members.filter((m) => !m.isPlayer);
  if (!bots.length) return;
  const rng = mulberry32(msg.ts >>> 0);
  msg.cheers += 1 + Math.floor(rng() * Math.min(3, bots.length));
  const bot = bots[Math.floor(rng() * bots.length)];
  addChat(state, clan.id, { kind: 'msg', from: bot, text: fill(pick(CHAT.cheer, rng), { name: msg.from.name, dist: `${r1(msg.act.km / KM_PER_MI)} mi` }) }, now);
}

function seedChat(state, clan, now) {
  const rng = mulberry32(clan.id.length * 97);
  const t0 = new Date(now).getTime() - 3 * 3600000;
  clan.members.filter((m) => !m.isPlayer).slice(0, 3)
    .forEach((b, i) => addChat(state, clan.id, { kind: 'msg', from: b, text: CHAT.banter[(i + Math.floor(rng() * 5)) % CHAT.banter.length] }, t0 + i * 600000));
}

export function postMessage(state, text, now = worldNow(state), channel = null) {
  const clan = playerClan(state);
  const clean = (text || '').trim().slice(0, 280);
  if (!clan || !clean) return [];
  const ch = channel || clan.id;
  const band = ch.includes('/') ? (clan.bands || []).find((b) => `${clan.id}/${b.id}` === ch) : null;
  const msg = addChat(state, ch, { kind: 'msg', from: clan.members.find((m) => m.isPlayer), text: clean }, now);
  if (clan.remote) return [{ type: 'sent', channel: ch, msg }];
  const bots = clan.members.filter((m) => !m.isPlayer && (!band || band.members.includes(m.id)));
  if (!bots.length) return [];
  const rng = mulberry32((Date.now() ^ clean.length) >>> 0);
  const lower = clean.toLowerCase();
  const key = ['vigil', 'gym', 'hike', 'run', 'walk', 'rain', 'tired'].find((k) => lower.includes(k));
  addChat(state, ch, { kind: 'msg', from: bots[Math.floor(rng() * bots.length)], text: key ? CHAT.reply[key] : pick(CHAT.reply.default, rng) }, now);
  return [{ type: 'sent', channel: ch, msg }];
}

export function rally(state, now = worldNow(state)) {
  const clan = playerClan(state);
  if (!clan) throw new Error('Join a clan first');
  if (state.rallyDay === dayKey(now)) throw new Error('You already rallied today. A Rally Horn lets you rally again.');
  state.rallyDay = dayKey(now);
  addChat(state, clan.id, { kind: 'rally', from: clan.members.find((m) => m.isPlayer), text: '🔥 Rally! Who\'s moving today? Let\'s get everyone Bonded.' }, now);
  const rng = mulberry32(Date.now() >>> 0);
  if (!clan.remote) clan.members.filter((m) => !m.isPlayer).sort((a, b) => a.propensity - b.propensity).slice(0, 2)
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
  if (state.cheers.n <= CHEERS_PER_DAY) {
    const amt = CHEER_ESSENCE * (boonsFor(state, state.clanId).has('troll') ? 2 : 1);
    state.bonusEssence += amt;
    events.push({ type: 'cheer', amt });
  }
  return events.concat(claimTrials(state, now));
}

// ---------- simulated clanmates ----------

const SPEED_KMH = { walk: 4.8, hike: 3.5, run: 9.5, cycle: 18, swim: 2, paddle: 6 };
const ASPECT_ACTS = Object.fromEntries(ASPECT_IDS.map((a) => [a, Object.keys(ACTIVITIES).filter((k) => ACTIVITIES[k].aspect === a)]));

function botsActOnDay(state, clan, date, rng, { quiet = false } = {}) {
  const events = [];
  if (clan.remote) return events;
  const mine = clan.id === state.clanId;
  const rallied = mine && state.rallyDay === dayKey(date);
  const all = Object.keys(ACTIVITIES);
  const power = activePower(clan, date);
  const boons = boonsFor(state, clan.id);
  const going = new Set((state.gatherings || []).filter((g) => g.day === dayKey(date)).flatMap((g) => g.going));
  for (const m of clan.members) {
    if (m.isPlayer) continue;
    if (rng() >= Math.min(0.95, m.propensity + (rallied ? 0.35 : 0) + (going.has(m.id) ? 0.4 : 0))) continue;
    const aff = ASPECT_ACTS[m.aspect];
    const type = rng() < 0.6 ? aff[Math.floor(rng() * aff.length)] : all[Math.floor(rng() * all.length)];
    const minutes = 15 + Math.round(rng() * 6) * 5;
    const intensity = ['light', 'moderate', 'moderate', 'vigorous'][Math.floor(rng() * 4)];
    const distanceKm = SPEED_KMH[type] ? (minutes / 60) * SPEED_KMH[type] * (0.8 + rng() * 0.4) : 0;
    const sc = scoreActivity({ type, minutes, distanceKm, intensity }, { player: { primary: m.aspect }, power, boons, date });
    record(clan, m.id, sc.aspect, sc.trailKm, type, date);
    m.totalKm = r1(m.totalKm + sc.trailKm);
    clan.totalKm = r1(clan.totalKm + sc.trailKm);
    events.push(...advanceJourney(state, clan, sc.trailKm, date));
    if (mine && !quiet) {
      const act = ACTIVITIES[type];
      addChat(state, clan.id, { kind: 'activity', from: m, act: { icon: act.icon, label: act.label, km: sc.trailKm, minutes, aspect: sc.aspect } }, date);
    }
  }
  if (mine && !quiet) {
    const st = clanStatus(clan);
    const bots = clan.members.filter((x) => !x.isPlayer);
    if (bots.length && !st.awakened && weekdayIdx(date) >= 2) {
      const sleepy = clan.members.filter((x) => (clan.week.days[x.id] || []).length < AWAKENING.bondDays).sort((a) => (a.isPlayer ? -1 : 1));
      const t = pick(CHAT.nudge, rng);
      if (!t.includes('{sleepy}') || sleepy.length) {
        addChat(state, clan.id, { kind: 'msg', from: bots[Math.floor(rng() * bots.length)], text: fill(t, { pct: Math.round(st.pct * 100), need: Math.max(0, st.bondNeeded - st.bonded.length) || 'no', sleepy: sleepy[0]?.name, power: st.power.name }) }, date);
      }
    } else if (bots.length && rng() < 0.5) {
      addChat(state, clan.id, { kind: 'msg', from: bots[Math.floor(rng() * bots.length)], text: pick(CHAT.banter, rng) }, date);
    }
  }
  events.push(...evaluateTiers(state, clan, date));
  return events;
}

// "Simulate a day": everyone else moves today, vigils tick, then the demo clock advances one day.
export function simulateDay(state) {
  const now = worldNow(state);
  const rng = mulberry32((now.getTime() / 1000) >>> 0);
  let events = [];
  for (const clan of state.clans) events = events.concat(botsActOnDay(state, clan, now, rng));
  events = events.concat(dailyTick(state, now, rng));
  state.dayOffset = (state.dayOffset || 0) + 1;
  events = events.concat(ensureWeeks(state, worldNow(state)));
  ensureGatherings(state, worldNow(state));
  return events.concat(checkBadges(state));
}

export function catchUp(state, realNow = new Date()) {
  let events = [];
  const today = dayKey(realNow);
  let d = fromKey(state.lastRealDay), n = 0;
  while (dayKey(d) < today && n < 3) {
    const simDate = addDays(d, state.dayOffset || 0);
    events = events.concat(ensureWeeks(state, simDate));
    const rng = mulberry32((d.getTime() / 1000) >>> 0);
    for (const clan of state.clans) events = events.concat(botsActOnDay(state, clan, simDate, rng));
    events = events.concat(dailyTick(state, simDate, rng));
    d = addDays(d, 1);
    n++;
  }
  state.lastRealDay = today;
  ensureGatherings(state);
  return events.concat(ensureWeeks(state));
}

// ---------- badges ----------

export function checkBadges(state, now = worldNow(state)) {
  const earned = [];
  const award = (id, cond) => { if (!state.badges.includes(id) && cond) { state.badges.push(id); earned.push({ type: 'badge', badge: { id, ...BADGES[id] } }); } };
  const s = streak(state, now);
  award('first_steps', state.activities.length > 0);
  award('kindred', !!state.clanId);
  award('streak3', s >= 3);
  award('streak7', s >= 7);
  award('harmony', new Set(state.activities.map((a) => a.aspect)).size >= 5);
  award('lorekeeper', state.unlockedLore.length >= 10);
  award('wanderer', state.visited.length >= 3);
  award('warden', !!state.flags.warden);
  award('awakened', spiritProgress(totalEssence(state)).stage >= 1);
  award('century', totalTrailKm(state) >= 100 * KM_PER_MI);
  award('awakener', !!state.flags.awakener);
  award('gatherer', (state.flags.gatherings || 0) >= 1);
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
  const asp = ASPECTS[state.player.primary];
  const opener = asp.voice[(new Date(now).getHours() + state.activities.length) % asp.voice.length];
  const clan = playerClan(state);
  if (!clan) return `${opener} "Spirits are stronger among kin. Join a clan, or found your own."`;
  const st = clanStatus(clan);
  const myDays = (clan.week.days.me || []).length;
  const moved = state.activities.some((a) => dayKey(a.date) === dayKey(now));
  const threatened = heldVigils(state, clan.id).map((s) => ({ s, w: state.vigils[s.id].ward })).sort((a, b) => a.w - b.w)[0];
  if (threatened && threatened.w < 200) return `${opener} "Our vigil at ${threatened.s.name} is weak (ward ${threatened.w}). Bring today's miles there and fortify it."`;
  if (myDays < AWAKENING.bondDays && !moved) return `${opener} "You've moved on ${myDays} of ${AWAKENING.bondDays} days this week. Even 10 minutes today brings you closer to Bonded."`;
  if (st.awakened) return `${opener} "We are awakened. Our vigils burn brighter. Use the Seals to claim new ground."`;
  if (!st.bondOk) return `${opener} "${st.bondNeeded - st.bonded.length} more kin must be Bonded before we can awaken. Rally them."`;
  return `${opener} "The gauge needs ${r1(Math.max(0, st.target - st.charged) / KM_PER_MI)} more miles. Then ${st.power.name} is ours."`;
}

// ---------- backend helpers ----------

// Rebuild a clan's weekly gauge from activity rows (used when a real backend is connected).
export function rebuildWeek(clan, rows, now = new Date()) {
  clan.week = emptyWeek(weekStart(now));
  for (const r of rows) record(clan, r.memberId, r.aspect, Number(r.trailKm) || 0, r.type, new Date(r.date));
  clan.xp = Math.max(0, clan.xp - rows.reduce((s, r) => s + (Number(r.trailKm) || 0), 0)); // record() added xp; server xp is authoritative
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

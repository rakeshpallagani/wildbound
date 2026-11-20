// Wildbound — game rules. Pure-ish functions operating on a plain state object (no DOM).
import { ELEMENTS, ACTIVITIES, INTENSITY, EXPEDITIONS, BADGES, SEED_CLANS } from './data.js';

export const MAX_MINUTES = 600;
export const AFFINITY_BONUS = 1.5;
export const STAGE_THRESHOLDS = [0, 400, 1500, 4000]; // essence needed for each spirit form

const round1 = (n) => Math.round(n * 10) / 10;

export function dayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- state ----------

export function newState(now = new Date()) {
  return {
    version: 1,
    player: null,
    activities: [],
    bonusEssence: 0,
    clanId: null,
    clans: SEED_CLANS.map((c, i) => seedClan(c, i)),
    unlockedLore: [],
    trialsClaimed: {},
    badges: [],
    lastSimDay: dayKey(now),
    log: [],
  };
}

function seedClan(c, i) {
  // Give seeded clans some history so the world feels alive.
  const rng = mulberry32(1000 + i);
  const route = EXPEDITIONS[0];
  const members = c.members.map((name) => ({ name, km: round1(5 + rng() * 25), isPlayer: false }));
  const progressKm = round1(rng() * route.lengthKm * 0.6);
  return {
    id: c.id, name: c.name, element: c.element, motto: c.motto,
    expeditionId: route.id, progressKm,
    totalKm: round1(members.reduce((s, m) => s + m.km, 0) + 40 + rng() * 80),
    completed: [], members, founded: false,
  };
}

export function createPlayer(state, { name, element }) {
  if (!ELEMENTS[element]) throw new Error('Unknown element');
  state.player = { name: (name || 'Wanderer').trim().slice(0, 24) || 'Wanderer', element, createdAt: new Date().toISOString() };
  return state.player;
}

// ---------- scoring ----------

export function scoreActivity({ type, minutes, distanceKm = 0, intensity = 'moderate' }, playerElement) {
  const act = ACTIVITIES[type];
  if (!act) throw new Error(`Unknown activity: ${type}`);
  const mins = Math.max(0, Math.min(MAX_MINUTES, Number(minutes) || 0));
  const dist = Math.max(0, Math.min(300, Number(distanceKm) || 0));
  const mult = (INTENSITY[intensity] || INTENSITY.moderate).mult;
  const affinity = act.element === playerElement;
  const essence = Math.round(mins * mult * (affinity ? AFFINITY_BONUS : 1));
  const trailKm = act.distance && dist > 0 ? dist * act.trailFactor : (mins / 12) * mult;
  return { essence, trailKm: round1(trailKm), affinity, element: act.element, minutes: mins, distanceKm: dist };
}

export function totalEssence(state) {
  return state.activities.reduce((s, a) => s + a.essence, 0) + state.bonusEssence;
}

export function totalTrailKm(state) {
  return round1(state.activities.reduce((s, a) => s + a.trailKm, 0));
}

export function spiritProgress(essence) {
  let stage = 0;
  for (let i = 0; i < STAGE_THRESHOLDS.length; i++) if (essence >= STAGE_THRESHOLDS[i]) stage = i;
  const level = 1 + Math.floor(Math.sqrt(essence / 20));
  const curr = STAGE_THRESHOLDS[stage];
  const next = STAGE_THRESHOLDS[stage + 1];
  const pct = next ? (essence - curr) / (next - curr) : 1;
  return { stage, level, nextAt: next ?? null, pct: Math.max(0, Math.min(1, pct)) };
}

export function streak(state, now = new Date()) {
  const days = new Set(state.activities.map((a) => dayKey(a.date)));
  let count = 0;
  const d = new Date(now);
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1); // today not logged yet doesn't break the streak
  while (days.has(dayKey(d))) { count++; d.setDate(d.getDate() - 1); }
  return count;
}

// ---------- daily trials ----------

const TRIAL_POOL = [
  { id: 'move30',   text: 'Move for 30 minutes in total',          reward: 40, check: (acts) => sum(acts, 'minutes') >= 30 },
  { id: 'trail3',   text: 'Cover 3 trail km',                      reward: 40, check: (acts) => sum(acts, 'trailKm') >= 3 },
  { id: 'affinity', text: 'Honour your element (affinity activity)', reward: 50, check: (acts) => acts.some((a) => a.affinity) },
  { id: 'outside',  text: 'Get outside: walk or hike',             reward: 40, check: (acts) => acts.some((a) => a.type === 'walk' || a.type === 'hike') },
  { id: 'strength', text: 'Build strength: 20+ min session',       reward: 50, check: (acts) => acts.some((a) => a.type === 'strength' && a.minutes >= 20) },
  { id: 'variety',  text: 'Try two different activity types',      reward: 50, check: (acts) => new Set(acts.map((a) => a.type)).size >= 2 },
  { id: 'vigor',    text: 'Push it: one vigorous session',         reward: 45, check: (acts) => acts.some((a) => a.intensity === 'vigorous') },
  { id: 'mobility', text: 'Restore: 15+ min yoga or mobility',     reward: 35, check: (acts) => acts.some((a) => a.type === 'yoga' && a.minutes >= 15) },
];

function sum(arr, key) { return arr.reduce((s, x) => s + (x[key] || 0), 0); }

export function dailyTrials(state, date = new Date()) {
  const key = dayKey(date);
  const seed = [...key, ...(state.player?.element || '')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rng = mulberry32(seed);
  const pool = [...TRIAL_POOL];
  const picks = [pool.splice(2, 1)[0]]; // affinity trial is always offered
  while (picks.length < 3) picks.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  const todays = state.activities.filter((a) => dayKey(a.date) === key);
  const claimed = state.trialsClaimed[key] || [];
  return picks.map((t) => ({ id: t.id, text: t.text, reward: t.reward, done: t.check(todays), claimed: claimed.includes(t.id) }));
}

// ---------- expeditions ----------

export function getExpedition(id) { return EXPEDITIONS.find((e) => e.id === id) || EXPEDITIONS[0]; }

export function routePosition(route, km) {
  const wps = route.waypoints;
  const k = Math.max(0, Math.min(route.lengthKm, km));
  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i], b = wps[i + 1];
    if (k <= b.km) {
      const t = b.km === a.km ? 1 : (k - a.km) / (b.km - a.km);
      return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t, passedIdx: i + (t >= 1 ? 1 : 0), next: t >= 1 ? wps[i + 2] || null : b };
    }
  }
  const last = wps[wps.length - 1];
  return { lat: last.lat, lon: last.lon, passedIdx: wps.length - 1, next: null };
}

export function playerClan(state) { return state.clans.find((c) => c.id === state.clanId) || null; }

// Adds km to a clan's expedition; returns events (lore unlocks, completions) for the UI.
export function advanceClan(state, clan, km) {
  const events = [];
  let remaining = km;
  clan.totalKm = round1(clan.totalKm + km);
  while (remaining > 0) {
    const route = getExpedition(clan.expeditionId);
    const before = clan.progressKm;
    const room = route.lengthKm - before;
    const step = Math.min(room, remaining);
    clan.progressKm = round1(before + step);
    remaining = round1(remaining - step);
    if (clan.id === state.clanId) {
      route.waypoints.forEach((wp, idx) => {
        const key = `${route.id}:${idx}`;
        if (wp.km <= clan.progressKm && !state.unlockedLore.includes(key)) {
          state.unlockedLore.push(key);
          events.push({ type: 'lore', route, waypoint: wp });
        }
      });
    }
    if (clan.progressKm >= route.lengthKm) {
      clan.completed.push({ routeId: route.id, date: new Date().toISOString() });
      const next = EXPEDITIONS[(EXPEDITIONS.findIndex((e) => e.id === route.id) + 1) % EXPEDITIONS.length];
      clan.expeditionId = next.id;
      clan.progressKm = 0;
      if (clan.id === state.clanId) {
        state.bonusEssence += 200;
        events.push({ type: 'expedition', route, next });
        // starting waypoint of the new route is unlocked immediately
        const key = `${next.id}:0`;
        if (!state.unlockedLore.includes(key)) { state.unlockedLore.push(key); events.push({ type: 'lore', route: next, waypoint: next.waypoints[0] }); }
      }
    } else break;
  }
  return events;
}

export function joinClan(state, clanId) {
  const clan = state.clans.find((c) => c.id === clanId);
  if (!clan || !state.player) return [];
  leaveClan(state);
  state.clanId = clan.id;
  clan.members.push({ name: state.player.name, km: 0, isPlayer: true });
  const events = [];
  // Unlock lore for waypoints the clan has already passed.
  const route = getExpedition(clan.expeditionId);
  route.waypoints.forEach((wp, idx) => {
    const key = `${route.id}:${idx}`;
    if (wp.km <= clan.progressKm && !state.unlockedLore.includes(key)) { state.unlockedLore.push(key); events.push({ type: 'lore', route, waypoint: wp, quiet: true }); }
  });
  return events.concat(checkBadges(state));
}

export function leaveClan(state) {
  const clan = playerClan(state);
  if (clan) clan.members = clan.members.filter((m) => !m.isPlayer);
  state.clanId = null;
}

export function foundClan(state, { name, motto }) {
  if (!state.player) throw new Error('No player');
  const clean = (name || '').trim().slice(0, 32);
  if (!clean) throw new Error('Clan needs a name');
  const id = 'clan-' + Math.random().toString(36).slice(2, 8);
  const el = state.player.element;
  state.clans.push({
    id, name: clean, element: el, motto: (motto || '').trim().slice(0, 60) || ELEMENTS[el].virtue,
    expeditionId: EXPEDITIONS[0].id, progressKm: 0, totalKm: 0, completed: [], founded: true,
    // Two wandering recruits answer the call so the prototype clan isn't empty.
    members: [{ name: 'Wren', km: 0, isPlayer: false }, { name: 'Osei', km: 0, isPlayer: false }],
  });
  return joinClan(state, id);
}

// ---------- logging ----------

export function logActivity(state, input, now = new Date()) {
  if (!state.player) throw new Error('Create a player first');
  const stageBefore = spiritProgress(totalEssence(state)).stage;
  const scored = scoreActivity(input, state.player.element);
  if (scored.minutes <= 0) throw new Error('Add how many minutes you moved');
  const entry = {
    id: 'a' + now.getTime().toString(36) + Math.random().toString(36).slice(2, 5),
    date: now.toISOString(), type: input.type, intensity: input.intensity || 'moderate',
    note: (input.note || '').slice(0, 140), ...scored,
  };
  state.activities.unshift(entry);
  const events = [{ type: 'logged', entry }];

  const clan = playerClan(state);
  if (clan) {
    const me = clan.members.find((m) => m.isPlayer);
    if (me) me.km = round1(me.km + entry.trailKm);
    events.push(...advanceClan(state, clan, entry.trailKm));
  }

  // Trials: auto-claim newly completed ones.
  const key = dayKey(now);
  state.trialsClaimed[key] = state.trialsClaimed[key] || [];
  for (const t of dailyTrials(state, now)) {
    if (t.done && !t.claimed) {
      state.trialsClaimed[key].push(t.id);
      state.bonusEssence += t.reward;
      events.push({ type: 'trial', trial: t });
    }
  }
  const stageAfter = spiritProgress(totalEssence(state)).stage;
  if (stageAfter > stageBefore) events.push({ type: 'evolve', stage: stageAfter });

  events.push(...checkBadges(state, now));
  return events;
}

export function deleteActivity(state, id) {
  // Prototype: removes from personal log (essence/badges recompute); clan progress is not rolled back.
  state.activities = state.activities.filter((a) => a.id !== id);
}

// ---------- badges ----------

export function checkBadges(state, now = new Date()) {
  const has = (id) => state.badges.includes(id);
  const earned = [];
  const award = (id, cond) => { if (!has(id) && cond) { state.badges.push(id); earned.push({ type: 'badge', badge: { id, ...BADGES[id] } }); } };
  const s = streak(state, now);
  const me = playerClan(state)?.members.find((m) => m.isPlayer);
  award('first_steps', state.activities.length > 0);
  award('kindred', !!state.clanId);
  award('streak3', s >= 3);
  award('streak7', s >= 7);
  award('harmony', new Set(state.activities.map((a) => a.element)).size >= 4);
  award('lorekeeper', state.unlockedLore.length >= 10);
  award('summit', !!playerClan(state)?.completed.length);
  award('awakened', spiritProgress(totalEssence(state)).stage >= 1);
  award('century', totalTrailKm(state) >= 100 || (me && me.km >= 100));
  return earned;
}

// ---------- world simulation (stand-in for other real players) ----------

export function simulateDay(state, seed = Date.now()) {
  const rng = mulberry32(seed >>> 0);
  const events = [];
  for (const clan of state.clans) {
    let clanKm = 0;
    for (const m of clan.members) {
      if (m.isPlayer) continue;
      if (rng() < 0.2) continue; // rest day
      const km = round1(1.5 + rng() * 7);
      m.km = round1(m.km + km);
      clanKm += km;
    }
    events.push(...advanceClan(state, clan, round1(clanKm)));
  }
  return events.concat(checkBadges(state));
}

export function catchUpSimulation(state, now = new Date()) {
  const last = new Date(state.lastSimDay + 'T00:00:00');
  const today = new Date(dayKey(now) + 'T00:00:00');
  const days = Math.min(3, Math.round((today - last) / 86400000));
  let events = [];
  for (let i = 0; i < days; i++) events = events.concat(simulateDay(state, last.getTime() + i));
  state.lastSimDay = dayKey(now);
  return events;
}

// ---------- spirit guide (rule-based; swap for an LLM later) ----------

export function spiritWhisper(state, now = new Date()) {
  const el = ELEMENTS[state.player.element];
  const pick = (arr) => arr[Math.floor((now.getHours() + state.activities.length) % arr.length)];
  const opener = pick(el.voice);
  const todays = state.activities.filter((a) => dayKey(a.date) === dayKey(now));
  const clan = playerClan(state);
  if (!clan) return `${opener} "Every spirit is stronger among kin. Find a clan that shares your fire, or found your own."`;
  const route = getExpedition(clan.expeditionId);
  const pos = routePosition(route, clan.progressKm);
  const next = pos.next;
  if (!next) return `${opener} "${route.name} lies behind us. A new horizon calls."`;
  const kmLeft = round1(next.km - clan.progressKm);
  if (!todays.length) {
    return `${opener} "${clan.name} is ${kmLeft} km from ${next.name}. A 20-minute walk would carry us about ${round1(20 / 12 * 1.5)} km closer. There's a story waiting there."`;
  }
  const s = streak(state, now);
  if (s >= 3) return `${opener} "${s} days of movement. The ${el.stages[spiritProgress(totalEssence(state)).stage].toLowerCase()} within you grows. ${next.name} is ${kmLeft} km ahead."`;
  return `${opener} "Good. The clan moves because you moved. ${kmLeft} km more and ${next.name} reveals its secrets."`;
}

// ---------- utils ----------

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

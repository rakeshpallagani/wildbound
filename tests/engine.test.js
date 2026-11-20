import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../js/engine.js';
import { EXPEDITIONS, AWAKENING, POWERS } from '../js/data.js';
import { fetchRecent } from '../js/sync.js';

const WED = new Date(2026, 10, 18, 10); // Wednesday, Nov 18 2026
const fresh = (element = 'earth', now = WED) => {
  const s = G.newState(now);
  G.createPlayer(s, { name: 'Tester', element });
  return s;
};

test('a 10-minute easy walk: small but real progress', () => {
  const air = G.scoreActivity({ type: 'walk', minutes: 10, intensity: 'light' }, { element: 'air' });
  const earth = G.scoreActivity({ type: 'walk', minutes: 10, intensity: 'light' }, { element: 'earth' });
  assert.equal(earth.essence, 10);
  assert.equal(air.essence, 15); // affinity
  assert.ok(Math.abs(earth.trailKm / G.KM_PER_MI - 0.5) < 0.05, 'about half a mile');
});

test('steps convert to distance, elevation adds trail distance, sync is verified', () => {
  const s = G.scoreActivity({ type: 'walk', minutes: 40, steps: 5000 }, { element: 'air' });
  assert.equal(s.distanceKm, 3.8);
  const flat = G.scoreActivity({ type: 'hike', minutes: 120, distanceKm: 6 }, { element: 'earth' });
  const climb = G.scoreActivity({ type: 'hike', minutes: 120, distanceKm: 6, elevM: 600 }, { element: 'earth' });
  assert.equal(r(climb.trailKm - flat.trailKm), 3);
  const synced = G.scoreActivity({ type: 'run', minutes: 30, source: 'strava' }, { element: 'fire' });
  assert.equal(synced.verified, true);
  assert.equal(synced.essence, Math.round(30 * 1.5 * 1.5 * 1.1));
});

test('powers modify scoring', () => {
  const base = G.scoreActivity({ type: 'walk', minutes: 60, distanceKm: 5 }, { element: 'earth' });
  const tail = G.scoreActivity({ type: 'walk', minutes: 60, distanceKm: 5 }, { element: 'earth', power: POWERS.air });
  assert.equal(tail.trailKm, r(base.trailKm * 1.25));
  const lift = G.scoreActivity({ type: 'strength', minutes: 40 }, { element: 'earth', power: POWERS.earth });
  assert.equal(lift.essence, Math.round(40 * 1.5 * 1.5 * 1.25));
});

test('weeks start on Monday', () => {
  assert.equal(G.weekStart(WED), '2026-11-16');
  assert.equal(G.weekStart(new Date(2026, 10, 22, 23)), '2026-11-16'); // Sunday
  assert.equal(G.weekdayIdx(WED), 2);
});

test('new state seeds a believable week for every clan', () => {
  const s = fresh();
  for (const c of s.clans) {
    assert.equal(c.week.start, '2026-11-16');
    assert.ok(G.clanStatus(c).charged > 0, c.name);
  }
});

test('player activity charges the clan gauge with its element and counts toward Bonded', () => {
  const s = fresh('earth');
  G.joinClan(s, 'cascade', WED);
  const clan = G.playerClan(s);
  const before = clan.week.energy.air;
  G.logActivity(s, { type: 'walk', minutes: 30, distanceKm: 2 }, WED);
  assert.equal(r(clan.week.energy.air - before), 2);
  assert.deepEqual(clan.week.days.me, [2]);
  G.logActivity(s, { type: 'walk', minutes: 30, distanceKm: 2, date: G.addDays(WED, -1).toISOString() }, WED);
  assert.deepEqual(clan.week.days.me, [1, 2]);
  assert.ok(!G.clanStatus(clan).bonded.some((m) => m.isPlayer), 'two days is not enough');
  G.logActivity(s, { type: 'yoga', minutes: 15, date: G.addDays(WED, -2).toISOString() }, WED);
  assert.ok(G.clanStatus(clan).bonded.some((m) => m.isPlayer));
});

test('awakening needs a full gauge AND enough Bonded kin', () => {
  const s = fresh('earth');
  const clan = s.clans.find((c) => c.id === 'cascade');
  G.joinClan(s, 'cascade', WED);
  // nobody bonded, gauge overfilled
  for (const k of Object.keys(clan.week.days)) clan.week.days[k] = [];
  clan.week.energy = { earth: 500, fire: 0, water: 0, air: 0 };
  let ev = G.evaluateTiers(s, clan, WED);
  assert.ok(!clan.week.awakened);
  assert.deepEqual(ev.filter((e) => e.type === 'tier').map((e) => e.tier.id), ['kindled', 'roused']);
  // bond enough members
  const need = Math.ceil(clan.members.length * AWAKENING.bondShare);
  clan.members.slice(0, need).forEach((m) => { clan.week.days[m.id] = [0, 1, 2]; });
  const builds = clan.buildings.length;
  ev = G.evaluateTiers(s, clan, WED);
  assert.ok(clan.week.awakened);
  assert.equal(clan.power.id, 'earth');
  assert.equal(clan.power.until, '2026-11-29');
  assert.equal(clan.buildings.length, builds + 1);
  assert.ok(ev.some((e) => e.type === 'awaken'));
});

test('balanced energy awakens Elemental Convergence', () => {
  assert.equal(G.dominantElement({ earth: 10, fire: 10, water: 10, air: 10 }), 'convergence');
  assert.equal(G.dominantElement({ earth: 50, fire: 10, water: 10, air: 10 }), 'earth');
});

test('week rollover archives history and resets the gauge', () => {
  const s = fresh();
  G.joinClan(s, 'cascade', WED);
  const ev = G.ensureWeeks(s, new Date(2026, 10, 23, 9));
  const clan = G.playerClan(s);
  assert.equal(clan.week.start, '2026-11-23');
  assert.equal(clan.history.length, 1);
  assert.ok(clan.lastRank >= 1);
  assert.ok(ev.some((e) => e.type === 'week'));
});

test('simulateDay advances the demo clock and other members', () => {
  const s = fresh();
  G.joinClan(s, 'cascade');
  const before = s.clans.map((c) => c.totalKm);
  G.simulateDay(s);
  assert.equal(s.dayOffset, 1);
  assert.ok(s.clans.some((c, i) => c.totalKm > before[i]));
});

test('journey completion unlocks lore and moves to the next journey', () => {
  const s = fresh();
  G.foundClan(s, { name: 'Test Clan' }, WED);
  const clan = G.playerClan(s);
  const seattle = EXPEDITIONS[0];
  const ev = G.advanceJourney(s, clan, seattle.lengthKm + 1, WED);
  assert.ok(ev.some((e) => e.type === 'journey'));
  assert.equal(clan.journeyId, 'snoqualmie');
  seattle.waypoints.forEach((_, i) => assert.ok(s.unlockedLore.includes(`seattle:${i}`)));
});

test('journeys are well formed', () => {
  for (const r of EXPEDITIONS) {
    assert.equal(r.waypoints[0].km, 0, r.id);
    r.waypoints.forEach((w, i) => { if (i) assert.ok(w.km > r.waypoints[i - 1].km, `${r.id}: ${w.name}`); });
    assert.equal(r.lengthKm, r.waypoints.at(-1).km);
  }
  const pos = G.routePosition(EXPEDITIONS[0], 0.5);
  assert.equal(pos.next.name, 'Ballard Locks');
});

test('sync imports are idempotent', () => {
  const s = fresh();
  const items = fetchRecent('strava', WED);
  G.importActivities(s, 'strava', items, WED);
  const n = s.activities.length;
  assert.ok(n > 0);
  const ev = G.importActivities(s, 'strava', fetchRecent('strava', WED), WED);
  assert.equal(s.activities.length, n);
  assert.equal(ev[0].count, 0);
  assert.ok(s.activities.every((a) => a.verified));
});

test('chat: rally once a day, cheers pay essence and complete the cheer trial', () => {
  const s = fresh();
  G.joinClan(s, 'cascade', WED);
  G.rally(s, WED);
  assert.throws(() => G.rally(s, WED));
  G.logActivity(s, { type: 'walk', minutes: 20 }, WED);
  const botMsg = s.chat.cascade.find((m) => m.from && !m.from.isPlayer);
  const ess = G.totalEssence(s);
  G.cheer(s, botMsg.id, WED);
  assert.ok(G.totalEssence(s) >= ess + G.CHEER_ESSENCE);
  G.postMessage(s, 'anyone want to hike?', WED);
  const last = s.chat.cascade.at(-1);
  assert.match(last.text, /Rattlesnake/);
});

test('check-ins require moving today and award the Rain Shell at 3', () => {
  const s = fresh();
  assert.throws(() => G.checkIn(s, 'green-lake', WED));
  G.logActivity(s, { type: 'walk', minutes: 20 }, WED);
  G.checkIn(s, 'green-lake', WED);
  G.checkIn(s, 'kerry-park', WED);
  G.checkIn(s, 'seward-park', WED);
  assert.ok(s.badges.includes('local'));
});

test('streak tolerates an unlogged today; water power shields one gap', () => {
  const s = fresh('water');
  G.joinClan(s, 'sound', WED);
  const d = (n) => new Date(2026, 10, n, 9);
  G.logActivity(s, { type: 'swim', minutes: 20 }, d(14));
  G.logActivity(s, { type: 'swim', minutes: 20 }, d(16));
  G.logActivity(s, { type: 'swim', minutes: 20 }, d(17));
  assert.equal(G.streak(s, d(18)), 2);
  G.playerClan(s).power = { id: 'water', until: '2026-11-29' };
  assert.equal(G.streak(s, d(18)), 3);
});

test('daily trials are deterministic and include the affinity trial', () => {
  const s = fresh('fire');
  const a = G.dailyTrials(s, WED).map((t) => t.id);
  assert.deepEqual(a, G.dailyTrials(s, WED).map((t) => t.id));
  assert.ok(a.includes('affinity'));
  assert.equal(new Set(a).size, 3);
});

function r(n) { return Math.round(n * 10) / 10; }

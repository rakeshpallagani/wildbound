import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../js/engine.js';
import { EXPEDITIONS, AWAKENING, POWERS, VIGILS, VIGIL, ASPECT_IDS } from '../js/data.js';
import { fetchRecent } from '../js/sync.js';
import { haversineM, project, unproject, isWater } from '../js/geo.js';
import { mergeWorld } from '../js/backend.js';

const WED = new Date(2026, 10, 18, 10); // Wed Nov 18 2026
const r = (n) => Math.round(n * 10) / 10;
const fresh = (primary = 'ironroot', secondary = null, now = WED) => {
  const s = G.newState(now);
  G.createPlayer(s, { name: 'Tester', primary, secondary });
  return s;
};
const goTo = (s, id) => { const v = VIGILS.find((x) => x.id === id); s.player.pos = { lat: v.lat, lon: v.lon }; };

test('gym + sport player: both feed the spirit, both charge any clan', () => {
  const p = { primary: 'ironroot', secondary: 'emberclaw' };
  const gym = G.scoreActivity({ type: 'strength', minutes: 40 }, { player: p });
  const soccer = G.scoreActivity({ type: 'sport', minutes: 40 }, { player: p });
  const walk = G.scoreActivity({ type: 'walk', minutes: 40 }, { player: p });
  assert.equal(gym.essence, Math.round(40 * 1.5 * 1.5));
  assert.equal(soccer.essence, Math.round(40 * 1.5 * 1.25));
  assert.equal(walk.essence, 60);
  const s = fresh('ironroot', 'emberclaw');
  G.joinClan(s, 'rainier', WED); // a Galewing clan
  const clan = G.playerClan(s);
  const before = { ...clan.week.energy };
  G.logActivity(s, { type: 'strength', minutes: 40 }, WED);
  G.logActivity(s, { type: 'sport', minutes: 40 }, WED);
  assert.ok(clan.week.energy.ironroot > before.ironroot);
  assert.ok(clan.week.energy.emberclaw > before.emberclaw);
});

test('a 10-minute easy walk is about half a mile', () => {
  const w = G.scoreActivity({ type: 'walk', minutes: 10, intensity: 'light' }, { player: { primary: 'ironroot' } });
  assert.equal(w.essence, 10);
  assert.ok(Math.abs(w.trailKm / G.KM_PER_MI - 0.5) < 0.05);
});

test('powers and vigil boons modify scoring', () => {
  const p = { primary: 'galewing' };
  const base = G.scoreActivity({ type: 'walk', minutes: 60, distanceKm: 5 }, { player: p });
  const tail = G.scoreActivity({ type: 'walk', minutes: 60, distanceKm: 5 }, { player: p, power: POWERS.galewing });
  assert.equal(tail.trailKm, r(base.trailKm * 1.25));
  const sky = G.scoreActivity({ type: 'walk', minutes: 60, distanceKm: 5 }, { player: p, boons: new Set(['sky']) });
  assert.equal(sky.trailKm, r(base.trailKm * 1.1));
  assert.ok(sky.applied.includes('Skyspire'));
});

test('awakening needs full gauge AND Bonded quorum, and grants seals + lumens', () => {
  const s = fresh();
  G.joinClan(s, 'cascade', WED);
  const clan = G.playerClan(s);
  for (const k of Object.keys(clan.week.days)) clan.week.days[k] = [];
  clan.week.energy = { ...Object.fromEntries(ASPECT_IDS.map((a) => [a, 0])), ironroot: 500 };
  G.evaluateTiers(s, clan, WED);
  assert.ok(!clan.week.awakened);
  clan.members.slice(0, Math.ceil(clan.members.length * AWAKENING.bondShare)).forEach((m) => { clan.week.days[m.id] = [0, 1, 2]; });
  const seals = clan.seals, lum = s.lumens;
  const ev = G.evaluateTiers(s, clan, WED);
  assert.ok(clan.week.awakened);
  assert.equal(clan.power.id, 'ironroot');
  assert.equal(clan.seals, seals + AWAKENING.seals);
  assert.equal(s.lumens, lum + AWAKENING.lumens);
  assert.ok(ev.some((e) => e.type === 'awaken'));
});

test('convergence when no aspect tops 35%', () => {
  assert.equal(G.dominantAspect({ ironroot: 10, emberclaw: 10, tidecaller: 10, galewing: 10, mistwalker: 10 }), 'convergence');
  assert.equal(G.dominantAspect({ ironroot: 50, emberclaw: 10, tidecaller: 10, galewing: 10, mistwalker: 10 }), 'ironroot');
});

test('vigil actions require presence and pledgeable movement', () => {
  const s = fresh();
  G.joinClan(s, 'cascade', WED);
  s.player.pos = { lat: 47.70, lon: -122.30 }; // far away
  assert.throws(() => G.siege(s, 'space-needle', null, WED), /within/);
  goTo(s, 'space-needle');
  assert.throws(() => G.siege(s, 'space-needle', null, WED), /No movement/);
  G.logActivity(s, { type: 'walk', minutes: 60, distanceKm: 5 }, WED);
  assert.equal(G.pledgeableKm(s, WED), 5);
  const before = s.vigils['space-needle'].ward;
  G.siege(s, 'space-needle', 2, WED);
  assert.equal(s.vigils['space-needle'].ward, before - 2 * VIGIL.wardPerKm);
  assert.equal(G.pledgeableKm(s, WED), 3);
});

test('breaking a ward with a seal claims the vigil; tribute pays daily', () => {
  const s = fresh();
  G.joinClan(s, 'cascade', WED);
  const clan = G.playerClan(s);
  clan.seals = 1;
  goTo(s, 'kerry-park');
  s.vigils['kerry-park'] = { holder: 'emerald', ward: 50, shieldUntil: null };
  G.logActivity(s, { type: 'walk', minutes: 30, distanceKm: 2 }, WED);
  const ev = G.siege(s, 'kerry-park', null, WED);
  assert.ok(ev.some((e) => e.type === 'claimed'));
  assert.equal(s.vigils['kerry-park'].holder, 'cascade');
  assert.equal(clan.seals, 0);
  assert.ok(s.badges.includes('warden'));
  const lum = s.lumens;
  s.dayOffset = Math.round((WED - new Date()) / 86400000);
  G.simulateDay(s);
  assert.ok(s.lumens > lum, 'tribute collected');
});

test('establishing an open vigil uses a seal; fortify raises ward; shields block sieges', () => {
  const s = fresh();
  G.joinClan(s, 'cascade', WED);
  const clan = G.playerClan(s);
  goTo(s, 'seward-park');
  assert.equal(s.vigils['seward-park'].holder, null);
  G.establish(s, 'seward-park', WED);
  assert.equal(s.vigils['seward-park'].holder, 'cascade');
  assert.equal(clan.seals, 0);
  assert.throws(() => G.establish(s, 'fremont-troll', WED));
  G.logActivity(s, { type: 'hike', minutes: 60, distanceKm: 4 }, WED);
  const w = s.vigils['seward-park'].ward;
  G.fortify(s, 'seward-park', null, WED);
  assert.ok(s.vigils['seward-park'].ward > w);
  s.vigils['gas-works'] = { holder: 'emerald', ward: 300, shieldUntil: G.dayKey(G.addDays(WED, 1)) };
  goTo(s, 'gas-works');
  G.logActivity(s, { type: 'walk', minutes: 10 }, WED);
  assert.throws(() => G.siege(s, 'gas-works', null, WED), /shielded/);
});

test('shop: buying requires lumens; auras equip', () => {
  const s = fresh();
  G.joinClan(s, 'cascade', WED);
  assert.throws(() => G.buy(s, 'seal', WED), /more ✦/);
  s.lumens = 1000;
  const seals = G.playerClan(s).seals;
  G.buy(s, 'seal', WED);
  assert.equal(G.playerClan(s).seals, seals + 1);
  G.buy(s, 'aura-aurora', WED);
  assert.equal(s.inventory.aura, 'aura-aurora');
  assert.equal(s.lumens, 1000 - 400 - 300);
});

test('visiting a vigil site unlocks lore; 3 visits earn the Rain Shell', () => {
  const s = fresh();
  for (const id of ['space-needle', 'pike-place', 'kerry-park']) { goTo(s, id); G.visitIfNear(s, WED); }
  assert.ok(s.unlockedLore.includes('vigil:pike-place'));
  assert.ok(s.badges.includes('wanderer'));
});

test('treks classify by speed and log as verified', () => {
  assert.equal(G.classifyTrek(2, 30), 'walk');
  assert.equal(G.classifyTrek(5, 30), 'run');
  assert.equal(G.classifyTrek(12, 30), 'cycle');
  const s = fresh();
  G.logTrek(s, { distanceKm: 1.2, minutes: 15, demo: true }, WED);
  assert.equal(s.activities[0].source, 'demo-gps');
  assert.ok(s.activities[0].verified);
  assert.throws(() => G.logTrek(s, { distanceKm: 0.01, minutes: 1 }, WED));
});

test('geo: projection round-trips, distances and water tests are sane', () => {
  const p = project(47.6097, -122.3422);
  const back = unproject(p.x, p.z);
  assert.ok(Math.abs(back.lat - 47.6097) < 1e-6 && Math.abs(back.lon + 122.3422) < 1e-6);
  const m = haversineM({ lat: 47.6205, lon: -122.3493 }, { lat: 47.6097, lon: -122.3422 });
  assert.ok(m > 1200 && m < 1400, `Space Needle to Pike Place ≈ 1.3 km, got ${m}`);
  assert.ok(isWater(47.64, -122.336), 'Lake Union is water');
  assert.ok(!isWater(47.6205, -122.3493), 'Space Needle is on land');
  assert.ok(isWater(47.62, -122.26), 'Lake Washington is water');
  for (const v of VIGILS) assert.ok(!isWater(v.lat, v.lon) || v.id === 'green-lake', `${v.name} should be on land`);
});

test('week rollover, simulation, sync idempotency, chat', () => {
  const s = fresh();
  G.joinClan(s, 'cascade', WED);
  const ev = G.ensureWeeks(s, new Date(2026, 10, 23, 9));
  assert.ok(ev.some((e) => e.type === 'week'));
  G.importActivities(s, 'strava', fetchRecent('strava', WED), WED);
  const n = s.activities.length;
  G.importActivities(s, 'strava', fetchRecent('strava', WED), WED);
  assert.equal(s.activities.length, n);
  G.rally(s, WED);
  assert.throws(() => G.rally(s, WED));
  G.postMessage(s, 'gym then soccer?', WED);
  assert.match(s.chat.cascade.at(-1).text, /Ironroot/);
  const before = s.dayOffset;
  G.simulateDay(s);
  assert.equal(s.dayOffset, before + 1);
});

test('clan levels gate vigils; new clans start at Lv 1', () => {
  const s = fresh();
  G.foundClan(s, { name: 'New Clan' }, WED);
  const clan = G.playerClan(s);
  assert.equal(G.clanLevel(clan).level, 1);
  goTo(s, 'seward-park');
  assert.throws(() => G.establish(s, 'seward-park', WED), /Level 3/);
  clan.xp = 650;
  assert.equal(G.clanLevel(clan).level, 3);
  G.establish(s, 'seward-park', WED);
  assert.equal(s.vigils['seward-park'].holder, clan.id);
  const before = clan.xp;
  G.logActivity(s, { type: 'walk', minutes: 30, distanceKm: 3 }, WED);
  assert.equal(r(clan.xp - before), 3);
});

test('gatherings: seeded, RSVP, check in on the day at the spot, host at Lv 2', () => {
  const s = fresh();
  G.joinClan(s, 'cascade', WED);
  assert.ok(s.gatherings.length >= s.clans.length, 'every clan hosts');
  const g = s.gatherings.find((x) => x.clanId === 'emerald');
  G.rsvp(s, g.id, WED);
  assert.ok(g.going.includes('me'));
  g.day = G.dayKey(WED);
  const spot = G.spotById(g.spotId);
  s.player.pos = { lat: 47.70, lon: -122.30 };
  assert.throws(() => G.attendGathering(s, g.id, WED), /within/);
  s.player.pos = { lat: spot.lat, lon: spot.lon };
  assert.throws(() => G.attendGathering(s, g.id, WED), /Move first/);
  G.logActivity(s, { type: 'sport', minutes: 45 }, WED);
  const em = G.clanById(s, 'emerald').xp, mine = G.playerClan(s).xp, lum = s.lumens;
  G.attendGathering(s, g.id, WED);
  assert.ok(G.clanById(s, 'emerald').xp > em && G.playerClan(s).xp > mine && s.lumens > lum);
  assert.ok(s.badges.includes('gatherer'));
  const ev = G.hostGathering(s, { type: 'run', spotId: 'green-lake', when: 'tomorrow', time: '07:00' }, WED);
  assert.equal(ev[0].g.clanId, 'cascade');
  G.foundClan(s, { name: 'Tiny' }, WED);
  assert.throws(() => G.hostGathering(s, { type: 'run', spotId: 'green-lake' }, WED), /Level 2/);
});

test('clans have multiple bands; joining a band opens its channel; band meetups appear', () => {
  const s = fresh();
  const cascade = s.clans.find((c) => c.id === 'cascade');
  assert.ok(cascade.bands.length >= 3);
  assert.ok(s.gatherings.some((g) => g.bandId && g.clanId === 'cascade'));
  assert.throws(() => G.joinBand(s, cascade.bands[0].id, WED), /Join the clan/);
  G.joinClan(s, 'cascade', WED);
  G.joinBand(s, cascade.bands[0].id, WED);
  G.joinBand(s, cascade.bands[1].id, WED);
  assert.equal(G.myBands(s).length, 2);
  const ch = `cascade/${cascade.bands[0].id}`;
  assert.ok(s.chat[ch].length >= 1);
  const ev = G.postMessage(s, 'see you there', WED, ch);
  assert.equal(ev[0].channel, ch);
  G.createBand(s, { name: 'Lunch Lifters', type: 'strength', spotId: 'gas-works', time: '12:00' }, WED);
  assert.ok(G.myBands(s).some((b) => b.name === 'Lunch Lifters'));
  assert.throws(() => G.createBand(s, { name: 'Lunch Lifters', type: 'strength', spotId: 'gas-works' }, WED), /exists/);
});

test('backend merge: real clans, bands, gatherings and chat land in local state', () => {
  const s = fresh();
  const me = 'u1', friend = 'u2', clanId = 'c-real';
  const t = new Date();
  mergeWorld(s, {
    me, myClan: clanId,
    clans: [{ id: clanId, name: 'Real Ravens', aspect: 'emberclaw', motto: 'hi', hub_name: 'Fremont', hub_lat: 47.651, hub_lng: -122.35, xp: 300, seals: 1 }],
    members: [{ user_id: me, clan_id: clanId }, { user_id: friend, clan_id: clanId }],
    profiles: [{ id: me, name: 'Tester', primary_aspect: 'ironroot' }, { id: friend, name: 'Sam', primary_aspect: 'emberclaw' }],
    bands: [{ id: 'b1', clan_id: clanId, name: 'Sunday Soccer', focus: 'sport', spot_name: 'Magnuson', spot_lat: 47.6815, spot_lng: -122.256, usual_time: '10:00' }],
    bandMembers: [{ band_id: 'b1', user_id: friend }],
    gatherings: [{ id: 'g1', clan_id: clanId, band_id: 'b1', host_id: friend, title: 'Pickup', type: 'sport', spot_name: 'Somewhere new', lat: 47.66, lng: -122.30, starts_at: t.toISOString() }],
    rsvps: [{ gathering_id: 'g1', user_id: friend, status: 'going' }],
    activities: [{ id: 'a1', user_id: friend, clan_id: clanId, type: 'sport', aspect: 'emberclaw', trail_km: 5, occurred_at: t.toISOString() }],
    messages: [{ id: 'm1', clan_id: clanId, band_id: null, user_id: friend, kind: 'msg', body: 'hello', created_at: t.toISOString() }],
  });
  const clan = G.playerClan(s);
  assert.equal(clan.name, 'Real Ravens');
  assert.ok(clan.remote);
  assert.equal(clan.members.length, 2);
  assert.equal(clan.week.energy.emberclaw, 5);
  assert.equal(clan.xp, 300);
  assert.equal(clan.bands[0].members[0], 'u-u2');
  const g = s.gatherings.find((x) => x.id === 'g1');
  assert.equal(g.host, 'Sam');
  assert.ok(G.spotById(g.spotId), 'unknown spot gets registered');
  assert.equal(s.chat[clanId][0].from.name, 'Sam');
  const ev = G.postMessage(s, 'hi Sam', new Date(), clanId);
  assert.equal(s.chat[clanId].length, 2, 'no simulated replies in a real clan');
  assert.equal(ev[0].type, 'sent');
});

test('journeys are well formed', () => {
  for (const j of EXPEDITIONS) {
    assert.equal(j.waypoints[0].km, 0);
    j.waypoints.forEach((w, i) => { if (i) assert.ok(w.km > j.waypoints[i - 1].km, j.id); });
  }
});

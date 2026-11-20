import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../js/engine.js';
import { EXPEDITIONS } from '../js/data.js';

const fresh = (element = 'earth') => { const s = G.newState(); G.createPlayer(s, { name: 'Tester', element }); return s; };

test('affinity activities earn 1.5x essence', () => {
  const base = G.scoreActivity({ type: 'run', minutes: 40, intensity: 'moderate' }, 'earth');
  const aff = G.scoreActivity({ type: 'run', minutes: 40, intensity: 'moderate' }, 'fire');
  assert.equal(base.essence, 60);
  assert.equal(aff.essence, 90);
  assert.equal(aff.affinity, true);
});

test('distance activities use real km, effort activities convert minutes', () => {
  assert.equal(G.scoreActivity({ type: 'walk', minutes: 60, distanceKm: 5 }, 'air').trailKm, 5);
  assert.equal(G.scoreActivity({ type: 'cycle', minutes: 60, distanceKm: 20 }, 'air').trailKm, 7);
  assert.equal(G.scoreActivity({ type: 'strength', minutes: 48, intensity: 'light' }, 'earth').trailKm, 4);
});

test('inputs are clamped', () => {
  const s = G.scoreActivity({ type: 'walk', minutes: 99999, distanceKm: -3 }, 'air');
  assert.equal(s.minutes, G.MAX_MINUTES);
  assert.equal(s.distanceKm, 0);
});

test('spirit evolves through stages', () => {
  assert.equal(G.spiritProgress(0).stage, 0);
  assert.equal(G.spiritProgress(400).stage, 1);
  assert.equal(G.spiritProgress(99999).stage, 3);
  assert.equal(G.spiritProgress(99999).pct, 1);
});

test('route position interpolates between waypoints', () => {
  const inca = EXPEDITIONS[0];
  const pos = G.routePosition(inca, 9.5); // between km 7 and 12
  assert.equal(pos.next.name, 'Wayllabamba');
  assert.ok(pos.lat < inca.waypoints[1].lat && pos.lat > inca.waypoints[2].lat);
  assert.equal(G.routePosition(inca, 999).next, null);
});

test('waypoints have ascending km and end at route length', () => {
  for (const r of EXPEDITIONS) {
    r.waypoints.forEach((w, i) => { if (i) assert.ok(w.km > r.waypoints[i - 1].km, `${r.id} ${w.name}`); });
    assert.equal(r.waypoints.at(-1).km, r.lengthKm, r.id);
    assert.equal(r.waypoints[0].km, 0, r.id);
  }
});

test('logging moves the clan, unlocks lore and completes expeditions', () => {
  const s = fresh();
  G.foundClan(s, { name: 'Test Clan' });
  const clan = G.playerClan(s);
  assert.equal(clan.progressKm, 0);
  assert.ok(s.unlockedLore.includes('inca:0'));
  const events = G.logActivity(s, { type: 'hike', minutes: 300, distanceKm: 40, intensity: 'vigorous' }); // 50 trail km
  assert.ok(events.some((e) => e.type === 'expedition'));
  assert.equal(clan.expeditionId, 'ebc');
  assert.equal(clan.progressKm, 8);
  assert.ok(s.unlockedLore.includes('inca:9'));
  assert.ok(s.unlockedLore.includes('ebc:1'));
  assert.ok(s.badges.includes('summit'));
  assert.ok(s.badges.includes('first_steps'));
});

test('daily trials are deterministic, include affinity, and auto-claim', () => {
  const s = fresh('fire');
  const d = new Date('2026-11-20T10:00:00');
  const a = G.dailyTrials(s, d).map((t) => t.id);
  assert.deepEqual(a, G.dailyTrials(s, d).map((t) => t.id));
  assert.ok(a.includes('affinity'));
  assert.equal(new Set(a).size, 3);
  const events = G.logActivity(s, { type: 'run', minutes: 30, intensity: 'moderate' }, d);
  assert.ok(events.some((e) => e.type === 'trial' && e.trial.id === 'affinity'));
  assert.ok(s.bonusEssence >= 50);
});

test('streak counts consecutive days, tolerating an unlogged today', () => {
  const s = fresh();
  const day = (n) => new Date(2026, 10, n, 9);
  G.logActivity(s, { type: 'walk', minutes: 20 }, day(17));
  G.logActivity(s, { type: 'walk', minutes: 20 }, day(18));
  G.logActivity(s, { type: 'walk', minutes: 20 }, day(19));
  assert.equal(G.streak(s, day(19)), 3);
  assert.equal(G.streak(s, day(20)), 3);
  assert.equal(G.streak(s, day(21)), 0);
});

test('joining and leaving a clan keeps one player entry', () => {
  const s = fresh();
  G.joinClan(s, 'granite-paw');
  G.joinClan(s, 'riverstride');
  const players = s.clans.flatMap((c) => c.members.filter((m) => m.isPlayer));
  assert.equal(players.length, 1);
  assert.equal(G.playerClan(s).id, 'riverstride');
  G.leaveClan(s);
  assert.equal(G.playerClan(s), null);
});

test('simulation advances other clans', () => {
  const s = fresh();
  const before = s.clans.map((c) => c.totalKm);
  G.simulateDay(s, 42);
  assert.ok(s.clans.some((c, i) => c.totalKm > before[i]));
});

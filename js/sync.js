// Wildbound — activity sync sources.
// PROTOTYPE: "Connect" imports realistic sample activities so the flow can be demoed end to end.
// Production plan per source is in docs/INTEGRATIONS.md.
import { addDays, dayKey, mulberry32 } from './engine.js';

export const SOURCES = {
  strava: {
    name: 'Strava', color: '#fc4c02', glyph: 'S',
    how: 'OAuth 2.0 + activity webhooks. Needs a small backend to hold tokens.',
    platform: 'Web, iOS, Android',
  },
  apple: {
    name: 'Apple Health', color: '#ff375f', glyph: '♥',
    how: 'HealthKit, read workouts and steps. iPhone app only (no web API).',
    platform: 'iOS app',
  },
  healthconnect: {
    name: 'Health Connect', color: '#4285f4', glyph: 'H',
    how: 'Android Health Connect API, reading exercise sessions and steps.',
    platform: 'Android app',
  },
  garmin: {
    name: 'Garmin', color: '#00a3e0', glyph: 'G',
    how: 'Garmin Connect Health API (partner program), push notifications.',
    platform: 'Web, iOS, Android',
  },
};

const SAMPLES = {
  strava: [
    { type: 'run', minutes: 31, distanceKm: 4.5, elevM: 12, intensity: 'moderate', place: 'Green Lake', note: 'Morning loop' },
    { type: 'cycle', minutes: 62, distanceKm: 24, elevM: 110, intensity: 'moderate', place: 'Burke-Gilman Trail', note: 'Commute home' },
    { type: 'hike', minutes: 150, distanceKm: 6.4, elevM: 350, intensity: 'vigorous', place: 'Rattlesnake Ledge', note: '' },
  ],
  apple: [
    { type: 'walk', minutes: 42, distanceKm: 3.3, steps: 4300, intensity: 'light', place: 'Capitol Hill', note: 'Lunch walk' },
    { type: 'strength', minutes: 45, intensity: 'vigorous', place: 'Home gym', note: 'Upper body' },
    { type: 'yoga', minutes: 25, intensity: 'light', place: 'Home', note: 'Evening flow' },
  ],
  healthconnect: [
    { type: 'walk', minutes: 35, distanceKm: 2.8, steps: 3700, intensity: 'light', place: 'Ballard', note: '' },
    { type: 'hiit', minutes: 20, intensity: 'vigorous', place: 'Home', note: '' },
  ],
  garmin: [
    { type: 'run', minutes: 48, distanceKm: 8.1, elevM: 60, intensity: 'vigorous', place: 'Discovery Park', note: 'Loop trail' },
    { type: 'swim', minutes: 35, distanceKm: 1.5, intensity: 'moderate', place: 'Medgar Evers Pool', note: '' },
  ],
};

// Returns activities "found" on the source for the last few days (stable ids, so re-syncing never duplicates).
export function fetchRecent(source, now) {
  const list = SAMPLES[source] || [];
  const rng = mulberry32(source.length * 131 + Number(dayKey(now).replace(/-/g, '')));
  return list.map((s, i) => {
    const daysAgo = Math.min(2, i);
    const when = addDays(now, -daysAgo);
    when.setHours(7 + Math.floor(rng() * 11), Math.floor(rng() * 60), 0, 0);
    return { ...s, date: when.toISOString(), externalId: `${source}-${dayKey(when)}-${i}` };
  });
}

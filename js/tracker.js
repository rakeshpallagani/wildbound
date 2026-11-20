// Wildbound — trek tracking. Real GPS via the Geolocation API (works on the phone when the app is served over
// HTTPS, e.g. GitHub Pages or installed to the home screen), or "Demo GPS" points fed by tapping the map.
import { haversineM, pathKm } from './geo.js';

export function gpsSupported() { return typeof navigator !== 'undefined' && 'geolocation' in navigator; }

// One-off position request. Resolves {lat, lon, accuracy} or rejects with a readable message.
export function locateOnce(timeout = 9000) {
  return new Promise((resolve, reject) => {
    if (!gpsSupported()) { reject(new Error('This browser has no location support.')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1 ? 'Location permission was denied (or blocked by this viewer).' : 'Couldn\'t get a location fix.')),
      { enableHighAccuracy: true, timeout, maximumAge: 5000 },
    );
  });
}

export function createTracker({ onFix = () => {}, onPoints = () => {}, onError = () => {} } = {}) {
  let watchId = null;
  let points = [];
  let startedAt = 0;
  let active = false;
  let mode = 'demo';
  let lastErr = Date.now();

  function push(lat, lon, accuracy = 5) {
    if (accuracy > 60) return; // ignore poor fixes
    const p = { lat, lon, t: Date.now() };
    const last = points[points.length - 1];
    if (last && haversineM(last, p) < 3) return; // jitter filter
    points.push(p);
    onPoints(points);
  }

  return {
    get active() { return active; },
    get mode() { return mode; },
    get points() { return points; },
    get elapsedMin() { return active ? (Date.now() - startedAt) / 60000 : 0; },
    get distanceKm() { return pathKm(points); },
    // Follow the device position continuously (GPS mode), whether or not a trek is recording.
    follow() {
      if (!gpsSupported() || watchId !== null) return;
      mode = 'gps';
      watchId = navigator.geolocation.watchPosition(
        (p) => { onFix({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }); if (active) push(p.coords.latitude, p.coords.longitude, p.coords.accuracy); },
        (e) => {
          // Brief signal gaps are normal outdoors; only surface permission problems, and others at most once a minute.
          if (e.code === 1) onError('Location permission was denied. Turn it on in your phone settings to track movement.');
          else if (Date.now() - lastErr > 60000) { lastErr = Date.now(); onError('GPS signal is weak. Keep moving, it will catch up.'); }
        },
        { enableHighAccuracy: true, maximumAge: 2000 },
      );
    },
    unfollow() { if (watchId !== null) navigator.geolocation.clearWatch(watchId); watchId = null; mode = 'demo'; },
    start(from) { active = true; points = []; startedAt = Date.now(); if (from) push(from.lat, from.lon); },
    feed(lat, lon) { if (active) push(lat, lon); }, // Demo GPS points
    stop() {
      const distanceKm = pathKm(points);
      // Demo GPS walks are fast-forwarded on screen, so log them at a normal walking pace instead.
      const minutes = mode === 'demo' ? (distanceKm / 5) * 60 : (Date.now() - startedAt) / 60000;
      const out = { distanceKm, minutes, points: points.slice(), demo: mode === 'demo' };
      active = false;
      points = [];
      onPoints(points);
      return out;
    },
  };
}

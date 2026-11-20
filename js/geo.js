// Wildbound — geography helpers and a simplified Seattle basemap (lat/lon), used by the built-in 3D map.
// Shapes are hand-simplified approximations for a stylised game map, not survey data.

export const ORIGIN = { lat: 47.6205, lon: -122.3493 }; // Space Needle
export const M_PER_UNIT = 10;                          // 1 scene unit = 10 m
const K_LAT = 110540;
const K_LON = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

export function project(lat, lon) {
  return { x: ((lon - ORIGIN.lon) * K_LON) / M_PER_UNIT, z: (-(lat - ORIGIN.lat) * K_LAT) / M_PER_UNIT };
}
export function unproject(x, z) {
  return { lat: ORIGIN.lat - (z * M_PER_UNIT) / K_LAT, lon: ORIGIN.lon + (x * M_PER_UNIT) / K_LON };
}
export function haversineM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function pathKm(points) {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += haversineM(points[i - 1], points[i]);
  return m / 1000;
}
export function inRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i], [yj, xj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function ellipse(lat, lon, rLat, rLon, n = 24) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [lat + Math.sin(a) * rLat, lon + Math.cos(a) * rLon];
  });
}

export const BOUNDS = { south: 47.48, north: 47.78, west: -122.56, east: -122.17 };

export const WATER = [
  { name: 'Puget Sound', ring: [
    [47.80, -122.60], [47.80, -122.395], [47.735, -122.383], [47.70, -122.405], [47.688, -122.404], [47.677, -122.412],
    [47.668, -122.425], [47.662, -122.437], [47.655, -122.430], [47.646, -122.418], [47.637, -122.406], [47.631, -122.393],
    [47.628, -122.381], [47.623, -122.372], [47.615, -122.358], [47.609, -122.346], [47.602, -122.338], [47.594, -122.341],
    [47.585, -122.346], [47.578, -122.355], [47.585, -122.375], [47.594, -122.387], [47.588, -122.400], [47.580, -122.410],
    [47.576, -122.420], [47.565, -122.408], [47.540, -122.397], [47.50, -122.39], [47.45, -122.39], [47.45, -122.60]] },
  { name: 'Lake Union', ring: [
    [47.6478, -122.3455], [47.6470, -122.3385], [47.6440, -122.3368], [47.6440, -122.3318], [47.6470, -122.3290],
    [47.6482, -122.3265], [47.6420, -122.3255], [47.6350, -122.3305], [47.6280, -122.3370], [47.6300, -122.3420],
    [47.6400, -122.3455]] },
  { name: 'Lake Washington', ring: [
    [47.78, -122.276], [47.73, -122.272], [47.70, -122.262], [47.687, -122.251], [47.678, -122.255], [47.665, -122.272],
    [47.655, -122.285], [47.648, -122.297], [47.640, -122.284], [47.628, -122.283], [47.612, -122.284], [47.596, -122.287],
    [47.585, -122.287], [47.570, -122.275], [47.556, -122.262], [47.549, -122.249], [47.540, -122.258], [47.525, -122.262],
    [47.50, -122.255], [47.45, -122.25], [47.45, -122.15], [47.78, -122.15]] },
  { name: 'Green Lake', ring: ellipse(47.6795, -122.3290, 0.0068, 0.0058) },
];

export const ISLANDS = [
  { name: 'Mercer Island', ring: [[47.595, -122.235], [47.592, -122.212], [47.555, -122.205], [47.525, -122.215], [47.530, -122.233], [47.565, -122.240]] },
];

// Channels drawn as wide water ribbons: [widthUnits, points]
export const CHANNELS = [
  { name: 'Ship Canal', w: 7, pts: [[47.6470, -122.3440], [47.650, -122.347], [47.652, -122.355], [47.654, -122.365], [47.658, -122.377], [47.662, -122.388], [47.6655, -122.398], [47.668, -122.406], [47.672, -122.412]] },
  { name: 'Montlake Cut', w: 6, pts: [[47.6470, -122.3275], [47.649, -122.315], [47.647, -122.305], [47.648, -122.296]] },
];

export const PARKS = [
  { name: 'Discovery Park', ring: [[47.668, -122.425], [47.668, -122.400], [47.652, -122.398], [47.650, -122.418], [47.657, -122.428]] },
  { name: 'Woodland Park', ring: [[47.692, -122.340], [47.690, -122.318], [47.668, -122.336], [47.666, -122.352], [47.675, -122.352]] },
  { name: 'Volunteer Park', ring: [[47.634, -122.318], [47.634, -122.312], [47.626, -122.312], [47.626, -122.318]] },
  { name: 'Arboretum', ring: [[47.648, -122.300], [47.648, -122.292], [47.630, -122.293], [47.630, -122.300]] },
  { name: 'Seward Park', ring: [[47.558, -122.263], [47.556, -122.252], [47.548, -122.251], [47.546, -122.260]] },
  { name: 'Magnuson Park', ring: [[47.690, -122.262], [47.690, -122.250], [47.675, -122.252], [47.675, -122.262]] },
  { name: 'Golden Gardens', ring: [[47.698, -122.404], [47.698, -122.398], [47.686, -122.399], [47.686, -122.404]] },
  { name: 'Seattle Center', ring: [[47.6245, -122.3555], [47.6245, -122.3470], [47.6175, -122.3470], [47.6175, -122.3555]] },
];

export const ROADS = [
  { name: 'I-5', w: 3.2, kind: 'highway', pts: [[47.78, -122.325], [47.70, -122.322], [47.68, -122.323], [47.660, -122.322], [47.645, -122.322], [47.630, -122.326], [47.615, -122.327], [47.600, -122.321], [47.580, -122.320], [47.55, -122.310], [47.50, -122.285]] },
  { name: 'SR 99', w: 2.4, kind: 'highway', pts: [[47.78, -122.346], [47.69, -122.345], [47.66, -122.347], [47.645, -122.347], [47.625, -122.345], [47.610, -122.340], [47.595, -122.336], [47.56, -122.338]] },
  { name: 'I-90', w: 2.6, kind: 'highway', pts: [[47.595, -122.320], [47.590, -122.300], [47.590, -122.270], [47.585, -122.235], [47.585, -122.17]] },
  { name: 'SR 520', w: 2.4, kind: 'highway', pts: [[47.645, -122.322], [47.644, -122.305], [47.643, -122.280], [47.640, -122.220], [47.640, -122.17]] },
  { name: 'Burke-Gilman Trail', w: 1.2, kind: 'trail', pts: [[47.680, -122.405], [47.668, -122.388], [47.660, -122.370], [47.655, -122.355], [47.650, -122.342], [47.652, -122.330], [47.656, -122.315], [47.662, -122.300], [47.672, -122.285], [47.690, -122.272], [47.72, -122.275], [47.76, -122.28]] },
];

export const NEIGHBORHOODS = [
  ['Ballard', 47.668, -122.384], ['Fremont', 47.6545, -122.352], ['Wallingford', 47.661, -122.334], ['U District', 47.661, -122.313],
  ['Capitol Hill', 47.623, -122.319], ['Queen Anne', 47.637, -122.357], ['Downtown', 47.607, -122.335], ['SoDo', 47.58, -122.33],
  ['West Seattle', 47.57, -122.386], ['Magnolia', 47.648, -122.402], ['Beacon Hill', 47.567, -122.311], ['Northgate', 47.706, -122.326],
  ['Columbia City', 47.559, -122.286], ['Madrona', 47.613, -122.290],
];
export const WATER_LABELS = [
  ['Puget Sound', 47.66, -122.475], ['Elliott Bay', 47.603, -122.367], ['Lake Union', 47.640, -122.336], ['Lake Washington', 47.62, -122.255], ['Green Lake', 47.6795, -122.329],
];

export function isWater(lat, lon) {
  if (ISLANDS.some((i) => inRing(lat, lon, i.ring))) return false;
  return WATER.some((w) => inRing(lat, lon, w.ring));
}
export function isPark(lat, lon) { return PARKS.some((p) => inRing(lat, lon, p.ring)); }

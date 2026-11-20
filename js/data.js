// Wildbound — static game data (Seattle edition, v0.3).
// Distances are stored in km internally and displayed in miles by default.

const MI = 1.609344;
const mi = (x) => Math.round(x * MI * 10) / 10; // miles -> km
const ft = (x) => Math.round(x / 3.28084);       // feet  -> m

export const HOME = { city: 'Seattle', tz: 'America/Los_Angeles', start: { lat: 47.6236, lon: -122.3544 } };

// ---------- The five Aspects (spirit identities) ----------
// Pick a primary (×1.5 spirit growth) and an optional secondary (×1.25).
// Every activity charges its own Aspect's energy in whatever clan you're in, so nothing is wasted.

export const ASPECTS = {
  ironroot: {
    id: 'ironroot', name: 'Ironroot', motto: 'Lift the world.', color: '#9bbf5f',
    domain: 'Strength', blurb: 'Gym, lifting, climbing and calisthenics. Roots that hold up mountains.',
    spirit: { name: 'Brumm', kind: 'iron-rooted bear', glyph: '🐻' },
    stages: ['Sapling', 'Oak', 'Ironwood', 'Worldroot'],
    voice: ['Brumm rumbles softly.', 'The iron bear shifts its weight.', 'Brumm presses a paw to the ground.'],
  },
  emberclaw: {
    id: 'emberclaw', name: 'Emberclaw', motto: 'Play like wildfire.', color: '#ef7d3c',
    domain: 'Sport & intensity', blurb: 'Team sports, racket sports, HIIT, martial arts and dance. Fast, fierce, together.',
    spirit: { name: 'Ashka', kind: 'ember fox', glyph: '🦊' },
    stages: ['Spark', 'Ember', 'Blaze', 'Wildfire'],
    voice: ['Ashka flicks a burning tail.', 'The ember fox crackles.', 'Ashka paces, restless.'],
  },
  tidecaller: {
    id: 'tidecaller', name: 'Tidecaller', motto: 'Move like water.', color: '#3fb6c9',
    domain: 'Water & flow', blurb: 'Swimming, paddling, rowing, yoga and mobility. Calm power that never stops.',
    spirit: { name: 'Nerra', kind: 'tide orca', glyph: '🐋' },
    stages: ['Ripple', 'Current', 'Riptide', 'Deepsea'],
    voice: ['Nerra surfaces with a slow breath.', 'The tide orca calls through the water.', 'Nerra circles beneath you.'],
  },
  galewing: {
    id: 'galewing', name: 'Galewing', motto: 'Outrun the wind.', color: '#b8a6f2',
    domain: 'Speed & endurance', blurb: 'Running and cycling. Long miles, fast splits, open roads.',
    spirit: { name: 'Kestra', kind: 'gale kestrel', glyph: '🦅' },
    stages: ['Breeze', 'Gust', 'Gale', 'Tempest'],
    voice: ['Kestra hovers on an updraft.', 'The gale kestrel cries out.', 'Kestra circles overhead.'],
  },
  mistwalker: {
    id: 'mistwalker', name: 'Mistwalker', motto: 'Wander. Wonder.', color: '#e3c46f',
    domain: 'Trails & wandering', blurb: 'Walking and hiking. Curious feet, misty trails, and stories in every place.',
    spirit: { name: 'Tahl', kind: 'mist elk', glyph: '🦌' },
    stages: ['Wisp', 'Haze', 'Veil', 'Shroud'],
    voice: ['Tahl lifts its antlers into the fog.', 'The mist elk stamps once.', 'Tahl watches the treeline.'],
  },
};
export const ASPECT_IDS = Object.keys(ASPECTS);
export const AFFINITY = { primary: 1.5, secondary: 1.25 };

// distance: true  -> trail distance = real distance * trailFactor
// distance: false -> trail distance from effort minutes
export const ACTIVITIES = {
  walk:     { label: 'Walk',            icon: '🚶', aspect: 'mistwalker', distance: true,  trailFactor: 1,    steps: true, elev: true },
  hike:     { label: 'Hike',            icon: '🥾', aspect: 'mistwalker', distance: true,  trailFactor: 1.25, elev: true },
  run:      { label: 'Run',             icon: '🏃', aspect: 'galewing',   distance: true,  trailFactor: 1,    elev: true },
  cycle:    { label: 'Cycle',           icon: '🚴', aspect: 'galewing',   distance: true,  trailFactor: 0.35, elev: true },
  swim:     { label: 'Swim',            icon: '🏊', aspect: 'tidecaller', distance: true,  trailFactor: 4 },
  paddle:   { label: 'Paddle / Row',    icon: '🛶', aspect: 'tidecaller', distance: true,  trailFactor: 0.6 },
  yoga:     { label: 'Yoga / Mobility', icon: '🧘', aspect: 'tidecaller', distance: false },
  strength: { label: 'Gym / Strength',  icon: '🏋️', aspect: 'ironroot',   distance: false },
  climb:    { label: 'Climb',           icon: '🧗', aspect: 'ironroot',   distance: false },
  sport:    { label: 'Sport',           icon: '⚽', aspect: 'emberclaw',  distance: false },
  hiit:     { label: 'HIIT',            icon: '⚡', aspect: 'emberclaw',  distance: false },
  dance:    { label: 'Dance',           icon: '💃', aspect: 'emberclaw',  distance: false },
};

export const INTENSITY = {
  light:    { label: 'Easy',     hint: 'could sing',       mult: 1 },
  moderate: { label: 'Moderate', hint: 'could chat',       mult: 1.5 },
  vigorous: { label: 'Hard',     hint: 'only a few words', mult: 2 },
};

// ---------- Weekly Awakening ----------

export const AWAKENING = {
  targetKmPerMember: mi(8),
  bondDays: 3,
  bondShare: 0.6,
  convergenceShare: 0.35,
  tiers: [
    { id: 'kindled', name: 'Kindled', at: 1 / 3, reward: 25, desc: '+25 XP each' },
    { id: 'roused', name: 'Roused', at: 2 / 3, reward: 50, desc: '+50 XP each' },
    { id: 'awakened', name: 'Awakened', at: 1, reward: 150, desc: 'Power for 2 weeks, 2 Vigil Seals, +150 XP, +100 ✦ each' },
  ],
  seals: 2,
  lumens: 100,
};

export const POWERS = {
  ironroot:   { id: 'ironroot',   name: 'Ironbark',       icon: '🌳', effect: '+25% XP from gym, strength and climbing' },
  emberclaw:  { id: 'emberclaw',  name: 'Wildfire Rally', icon: '🔥', effect: 'Daily trial rewards are doubled' },
  tidecaller: { id: 'tidecaller', name: 'Tidal Recovery', icon: '🌊', effect: 'One rest day won\'t break streaks; +25% XP from water and yoga' },
  galewing:   { id: 'galewing',   name: 'Tailwind',       icon: '🌬️', effect: '+25% trail distance on every activity' },
  mistwalker: { id: 'mistwalker', name: 'Veilwalk',       icon: '🌫️', effect: '+25% XP from walks and hikes; vigil pledges count ×1.25' },
  convergence: { id: 'convergence', name: 'Convergence',  icon: '✴️', effect: '+15% XP and distance on everything (no Aspect above 35%)' },
};
// Every awakened Power also empowers the clan's vigils: half decay and ×1.5 tribute.

// ---------- Clan levels ----------
// Clan XP = trail km moved by members + 150 per Awakening + 20 per gathering attended.
export const CLAN_LEVELS = [
  { level: 1, name: 'Campfire',   xp: 0,    unlock: 'Clan chat, weekly Awakening, join gatherings' },
  { level: 2, name: 'Hearth',     xp: 250,  unlock: 'Host gatherings on the map' },
  { level: 3, name: 'Outpost',    xp: 600,  unlock: 'Raise and contest vigils on landmarks' },
  { level: 4, name: 'Stronghold', xp: 1200, unlock: '+1 extra Vigil Seal per Awakening' },
  { level: 5, name: 'Citadel',    xp: 2200, unlock: 'Your vigils fade 25% slower' },
];
export const VIGIL_MIN_LEVEL = 3;
export const HOST_MIN_LEVEL = 2;

// ---------- Gatherings: clan activities happening around the city ----------
export const SPOTS = [
  { id: 'gas-works', name: 'Gas Works Park', lat: 47.6456, lon: -122.3344 },
  { id: 'green-lake', name: 'Green Lake', lat: 47.6812, lon: -122.3355 },
  { id: 'magnuson', name: 'Magnuson Park fields', lat: 47.6815, lon: -122.2560 },
  { id: 'cal-anderson', name: 'Cal Anderson Park', lat: 47.6173, lon: -122.3191 },
  { id: 'volunteer-park', name: 'Volunteer Park', lat: 47.6304, lon: -122.3150 },
  { id: 'kerry-park', name: 'Kerry Park', lat: 47.6295, lon: -122.3599 },
  { id: 'west-point', name: 'Discovery Park', lat: 47.6575, lon: -122.4090 },
  { id: 'alki', name: 'Alki Beach', lat: 47.5770, lon: -122.4035 },
  { id: 'fremont', name: 'Fremont Canal', lat: 47.6505, lon: -122.3500 },
  { id: 'seward-park', name: 'Seward Park', lat: 47.5520, lon: -122.2575 },
];
// Bands: smaller groups inside a clan, each with a focus, a home spot and its own chat channel.
// [band name, activity type, spot, usual time, meetup title]
export const BAND_TEMPLATES = {
  ironroot:   [['Dawn Lifters', 'strength', 'gas-works', '07:00', 'Outdoor strength circuit'], ['Stair Climbers', 'strength', 'volunteer-park', '18:00', 'Stairs & calisthenics'], ['Wall Rats', 'climb', 'fremont', '18:30', 'Bouldering session']],
  emberclaw:  [['Sunday Strikers', 'sport', 'magnuson', '10:00', 'Pickup soccer'], ['Sweat Club', 'hiit', 'cal-anderson', '18:30', 'Bootcamp HIIT'], ['Night Movers', 'dance', 'cal-anderson', '20:00', 'Outdoor dance session']],
  tidecaller: [['Polar Plungers', 'swim', 'alki', '07:30', 'Cold-water swim'], ['Flow Circle', 'yoga', 'volunteer-park', '08:30', 'Park yoga'], ['Lake Union Paddlers', 'paddle', 'fremont', '18:00', 'Sunset paddle']],
  galewing:   [['Green Lake Pacers', 'run', 'green-lake', '07:00', 'Green Lake loop run'], ['Burke Riders', 'cycle', 'fremont', '09:00', 'Burke-Gilman ride']],
  mistwalker: [['Discovery Wanderers', 'walk', 'west-point', '09:30', 'Discovery Park loop walk'], ['Viewpoint Hunters', 'walk', 'kerry-park', '17:30', 'Viewpoints walk'], ['Forest Bathers', 'hike', 'seward-park', '10:00', 'Old-growth forest walk']],
};
// Every clan also has one cross-Aspect band, so mixed interests have a home.
export const OPEN_BANDS = [['Weekend Hikers', 'hike', 'west-point', '09:00', 'Weekend hike'], ['Lunch Walkers', 'walk', 'kerry-park', '12:15', 'Lunch walk'], ['Rec League Crew', 'sport', 'magnuson', '19:00', 'Rec league scrimmage'], ['Stroller Squad', 'walk', 'green-lake', '10:00', 'Stroller loop'], ['Sunrise Stretch', 'yoga', 'alki', '07:00', 'Beach stretch']];
export const GATHERING = { radiusM: 200, essence: 40, lumens: 15, clanXp: 20 };

// ---------- Vigils: hold real Seattle landmarks ----------
// A clan holds a vigil until a rival breaks its ward. Holding pays daily tribute (✦ Lumens) to every member
// and grants a clan-wide boon.

export const VIGIL = {
  radiusM: 150,        // how close you must be to act on a vigil
  maxWard: 1000,
  wardPerKm: 60,       // each trail km pledged adds/removes this much ward
  establishWard: 200,
  decay: 0.08,         // daily ward decay (halved while the holder's spirit is awakened)
  shieldHours: 24,
};

export const VIGILS = [
  { id: 'space-needle', name: 'Space Needle', vigil: 'Skyspire', lat: 47.6205, lon: -122.3493, yield: 40,
    boon: { id: 'sky', text: '+10% trail distance for the whole clan' },
    lore: 'Built for the 1962 World\'s Fair (the Century 21 Exposition), the 605-ft tower was the tallest structure west of the Mississippi when it opened.' },
  { id: 'pike-place', name: 'Pike Place Market', vigil: 'Market Hearth', lat: 47.6097, lon: -122.3422, yield: 35,
    boon: { id: 'market', text: 'Daily trials pay +10 extra XP' },
    lore: 'Opened in 1907, it is one of the oldest continuously operating public farmers\' markets in the United States.' },
  { id: 'gas-works', name: 'Gas Works Park', vigil: 'Iron Forge', lat: 47.6456, lon: -122.3344, yield: 30,
    boon: { id: 'forge', text: '+10% XP from gym, strength and climbing' },
    lore: 'A coal-gas plant ran here until 1956. When the park opened in 1975, its towers were kept as a monument to Seattle\'s industrial past.' },
  { id: 'kerry-park', name: 'Kerry Park', vigil: 'Overlook', lat: 47.6295, lon: -122.3599, yield: 25,
    boon: { id: 'overlook', text: '+10% XP from walks and hikes' },
    lore: 'The classic Queen Anne viewpoint: skyline, Space Needle, Elliott Bay and, when "the mountain is out", Rainier.' },
  { id: 'ballard-locks', name: 'Ballard Locks', vigil: 'Tidegate', lat: 47.6654, lon: -122.3972, yield: 30,
    boon: { id: 'tidegate', text: '+10% XP from swim, paddle and yoga' },
    lore: 'Opened in 1917, the Chittenden Locks connect Lake Washington and Lake Union to Puget Sound. Salmon climb the fish ladder in late summer.' },
  { id: 'west-point', name: 'West Point Lighthouse', vigil: 'Lantern Point', lat: 47.6619, lon: -122.4356, yield: 25,
    boon: { id: 'lantern', text: 'Streak shield: one rest day won\'t break a streak' },
    lore: 'At the tip of Discovery Park, Seattle\'s largest park (534 acres), the lighthouse has guided ships since 1881.' },
  { id: 'green-lake', name: 'Green Lake', vigil: 'Stillwater Ring', lat: 47.6800, lon: -122.3290, yield: 30,
    boon: { id: 'stillwater', text: '+10% XP from running and cycling' },
    lore: 'A 2.8-mile loop around a lake left behind by retreating ice-age glaciers. It is one of the busiest running paths in the city.' },
  { id: 'fremont-troll', name: 'Fremont Troll', vigil: 'Troll\'s Bargain', lat: 47.6510, lon: -122.3473, yield: 20,
    boon: { id: 'troll', text: 'Cheering kin pays double XP' },
    lore: 'An 18-ft concrete troll has lurked under the Aurora Bridge since 1990, crushing a real Volkswagen Beetle in its hand.' },
  { id: 'lumen-field', name: 'Lumen Field', vigil: 'Arena of Echoes', lat: 47.5952, lon: -122.3316, yield: 35,
    boon: { id: 'arena', text: '+10% XP from sport, HIIT and dance' },
    lore: 'Opened in 2002. In January 2011, the crowd\'s roar during a famous Seahawks touchdown run registered on a nearby seismometer: the "Beast Quake".' },
  { id: 'volunteer-park', name: 'Volunteer Park', vigil: 'Watchtower', lat: 47.6304, lon: -122.3150, yield: 25,
    boon: { id: 'watch', text: '+15 XP for every member each day' },
    lore: 'Landscaped to an Olmsted Brothers plan. Its 1907 water tower has one of the best free views in the city.' },
  { id: 'seward-park', name: 'Seward Park', vigil: 'Elder Grove', lat: 47.5496, lon: -122.2560, yield: 45,
    boon: { id: 'grove', text: 'The richest tribute in the city' },
    lore: 'A peninsula in Lake Washington with one of Seattle\'s largest stands of old-growth forest, some trees centuries old.' },
  { id: 'golden-gardens', name: 'Golden Gardens', vigil: 'Sunset Pyre', lat: 47.6920, lon: -122.4030, yield: 25,
    boon: { id: 'sunset', text: '+15% XP on Saturdays and Sundays' },
    lore: 'A beach on Shilshole Bay with sunsets over the Olympic Mountains and evening bonfires.' },
  { id: 'pioneer-square', name: 'Pioneer Square', vigil: 'Founders\' Ward', lat: 47.6015, lon: -122.3343, yield: 30,
    boon: { id: 'founders', text: '+5% XP on everything' },
    lore: 'Seattle\'s first downtown. After the Great Fire of 6 June 1889 the city rebuilt in brick and raised its streets, leaving the "Seattle Underground" below. The city is named for Si\'ahl, a leader of the Duwamish and Suquamish peoples.' },
];

// ---------- Lumens shop (in-game premium rewards) ----------

export const SHOP = [
  { id: 'seal', name: 'Vigil Seal', icon: '🔱', price: 400, kind: 'clan', desc: 'Lets your clan establish a vigil on an open landmark.' },
  { id: 'shield', name: 'Ward Shield', icon: '🛡️', price: 250, kind: 'clan', desc: 'Your clan\'s weakest vigil can\'t be sieged for 24 hours.' },
  { id: 'horn', name: 'Rally Horn', icon: '📯', price: 120, kind: 'use', desc: 'Rally your clan again today.' },
  { id: 'aura-aurora', name: 'Aurora Aura', icon: '🌌', price: 300, kind: 'aura', color: '#7cf2c9', desc: 'Your spirit glows with northern lights.' },
  { id: 'aura-starlit', name: 'Starlit Aura', icon: '✨', price: 300, kind: 'aura', color: '#fff2a8', desc: 'A shimmer of starlight around your spirit.' },
  { id: 'aura-obsidian', name: 'Obsidian Aura', icon: '🖤', price: 300, kind: 'aura', color: '#a173ff', desc: 'A dark violet halo.' },
  { id: 'aura-sakura', name: 'Sakura Aura', icon: '🌸', price: 300, kind: 'aura', color: '#ff9cc7', desc: 'Petal-pink light, for the Quad in spring.' },
];

// ---------- Journeys (virtual routes the clan walks together) ----------

function journey(def) {
  const last = def.waypoints[def.waypoints.length - 1];
  return { ...def, lengthKm: last.km };
}

export const EXPEDITIONS = [
  journey({
    id: 'snoqualmie', name: 'Snoqualmie Valley & Mount Si', region: 'Cascade foothills, WA', tier: 'Local',
    waypoints: [
      { name: 'Snoqualmie Falls', km: 0, elev: 130, lore: 'The river drops 268 ft. The falls are sacred to the Snoqualmie Tribe, and a hydroelectric plant has run here since 1899.' },
      { name: 'North Bend', km: mi(4), elev: 135, lore: 'A logging and railroad town at the foot of the Cascades. Many scenes of Twin Peaks (1990) were filmed around here.' },
      { name: 'Mount Si summit', km: mi(9), elev: ft(4167), lore: 'Named for homesteader Josiah "Uncle Si" Merritt. The trail climbs about 3,150 ft in 4 miles.' },
      { name: 'Rattlesnake Ledge', km: mi(16), elev: ft(2078), lore: 'Rising water in Rattlesnake Lake helped force residents to abandon the town of Moncton in 1915.' },
      { name: 'Cedar River Watershed', km: mi(20), elev: ft(1560), lore: 'This protected forest supplies about two-thirds of the drinking water for 1.5 million people in the Seattle area.' },
    ],
  }),
  journey({
    id: 'wonderland', name: 'Wonderland Trail', region: 'Mount Rainier, WA', tier: 'Local',
    waypoints: [
      { name: 'Longmire', km: 0, elev: 842, lore: 'Mount Rainier National Park, founded in 1899, was the fifth US national park.' },
      { name: 'Indian Henry\'s Hunting Ground', km: mi(6.5), elev: 1615, lore: 'Subalpine meadows named for Sotolick, a Native hunter and guide known to settlers as Indian Henry.' },
      { name: 'Mowich Lake', km: mi(34), elev: 1502, lore: 'The largest and deepest lake in the park. "Mowich" means deer in Chinook Jargon.' },
      { name: 'Carbon Glacier', km: mi(41), elev: 1067, lore: 'Its snout reaches about 3,500 ft, the lowest glacier terminus in the contiguous United States.' },
      { name: 'Sunrise', km: mi(56), elev: 1951, lore: 'At about 6,400 ft, the highest point in the park reachable by car.' },
      { name: 'Reflection Lakes', km: mi(86), elev: 1480, lore: 'Nearby Paradise recorded 1,122 inches of snow in the winter of 1971–72, then a world record.' },
      { name: 'Longmire · loop closed', km: mi(93), elev: 842, lore: 'Rainier, Tahoma or Təqʷubəʔ in Lushootseed, is the most glaciated peak in the contiguous US.' },
    ],
  }),
  journey({
    id: 'inca', name: 'The Inca Trail', region: 'Andes, Peru', tier: 'World',
    waypoints: [
      { name: 'Km 82 · Piskacucho', km: 0, elev: 2700, lore: 'The classic trail starts at kilometre 82 of the Cusco–Machu Picchu railway.' },
      { name: "Dead Woman's Pass", km: 21, elev: 4215, lore: "Warmiwañusca, 4,215 m. Each breath carries roughly 40% less oxygen than at sea level." },
      { name: 'Wiñay Wayna', km: 39, elev: 2650, lore: '"Forever young," named after an orchid that blooms here year-round.' },
      { name: 'Machu Picchu', km: 42, elev: 2430, lore: 'Built around 1450, probably for the emperor Pachacuti. A UNESCO World Heritage Site since 1983.' },
    ],
  }),
  journey({
    id: 'ebc', name: 'Everest Base Camp', region: 'Khumbu, Nepal', tier: 'World',
    waypoints: [
      { name: 'Lukla', km: 0, elev: 2860, lore: 'Tenzing–Hillary Airport has a short, sloping runway that ends at a mountainside.' },
      { name: 'Namche Bazaar', km: 19, elev: 3440, lore: 'The trading town of the Sherpa people, whose ancestors moved here from Tibet about 500 years ago.' },
      { name: 'Everest Base Camp', km: 62, elev: 5364, lore: 'Everest\'s summit rock is limestone that was once the floor of the ancient Tethys Ocean.' },
    ],
  }),
];

// ---------- Badges -> gear worn by your avatar on the map ----------

export const BADGES = {
  first_steps: { name: 'First Steps',     icon: '👣', desc: 'Log your first activity.',               gear: 'Trail Boots' },
  kindred:     { name: 'Kindred',         icon: '🔥', desc: 'Join or found a clan.',                  gear: 'Clan Cloak' },
  streak3:     { name: 'Three Suns',      icon: '☀️', desc: 'Move 3 days in a row.',                  gear: 'Sun Amulet' },
  streak7:     { name: 'Moon Cycle',      icon: '🌙', desc: 'Move 7 days in a row.',                  gear: 'Moon Circlet' },
  harmony:     { name: 'Five Winds',      icon: '✴️', desc: 'Log activities from all five Aspects.',  gear: 'Five-Aspect Aura' },
  lorekeeper:  { name: 'Lorekeeper',      icon: '📜', desc: 'Unlock 10 lore entries.',                gear: 'Lorekeeper\'s Lantern' },
  wanderer:    { name: 'Emerald Wanderer', icon: '☔', desc: 'Visit 3 vigil sites in person.',        gear: 'Rain Shell' },
  warden:      { name: 'Warden',          icon: '🔱', desc: 'Help your clan claim a vigil.',          gear: 'Warden\'s Crest' },
  awakened:    { name: 'Spirit Awakened', icon: '✨', desc: 'Evolve your spirit to its second form.', gear: 'Bigger spirit companion' },
  century:     { name: 'Hundred Miles',   icon: '🧭', desc: 'Contribute 100 trail miles.',           gear: 'Explorer\'s Pack' },
  gatherer:    { name: 'Gatherer',        icon: '🤝', desc: 'Show up to a gathering in person.',       gear: 'Gatherer\'s Scarf' },
  awakener:    { name: 'Awakener',        icon: '⚡', desc: 'Be Bonded when your clan awakens.',      gear: 'Awakener\'s Halo' },
};

// ---------- Seed clans (simulated members: [name, primary aspect, propensity]) ----------

export const SEED_CLANS = [
  { id: 'cascade', hub: { name: 'Ballard', lat: 47.6685, lon: -122.3845 }, xp: 720, name: 'Cascade Ironroots', aspect: 'ironroot', motto: 'We carry the mountain.', seals: 1, members: [
    ['Asha', 'ironroot', 0.8], ['Mateo', 'emberclaw', 0.7], ['Ingrid', 'ironroot', 0.55], ['Kofi', 'tidecaller', 0.4], ['Lin', 'mistwalker', 0.3]] },
  { id: 'emerald', hub: { name: 'Capitol Hill', lat: 47.6215, lon: -122.3200 }, xp: 980, name: 'Emerald Embers', aspect: 'emberclaw', motto: 'Burn bright in the rain.', seals: 1, members: [
    ['Ravi', 'emberclaw', 0.75], ['Sofia', 'emberclaw', 0.6], ['Jonah', 'ironroot', 0.5], ['Amara', 'galewing', 0.45], ['Yuki', 'tidecaller', 0.35]] },
  { id: 'sound', hub: { name: 'West Seattle', lat: 47.5700, lon: -122.3870 }, xp: 640, name: 'Sound Tidecallers', aspect: 'tidecaller', motto: 'Flow around every obstacle.', seals: 1, members: [
    ['Maya', 'tidecaller', 0.8], ['Tomás', 'tidecaller', 0.55], ['Elif', 'galewing', 0.5], ['Noah', 'ironroot', 0.45], ['Priya', 'emberclaw', 0.4]] },
  { id: 'rainier', hub: { name: 'Roosevelt', lat: 47.6760, lon: -122.3170 }, xp: 1300, name: 'Rainier Galewings', aspect: 'galewing', motto: 'Lighter with every mile.', seals: 1, members: [
    ['Leo', 'galewing', 0.7], ['Zara', 'galewing', 0.65], ['Kai', 'emberclaw', 0.5], ['Nadia', 'mistwalker', 0.4], ['Femi', 'ironroot', 0.35]] },
  { id: 'lantern', hub: { name: 'Queen Anne', lat: 47.6370, lon: -122.3570 }, xp: 660, name: 'Fog Lantern Society', aspect: 'mistwalker', motto: 'Every street has a story.', seals: 1, members: [
    ['Wren', 'mistwalker', 0.75], ['Osei', 'mistwalker', 0.6], ['Hana', 'tidecaller', 0.5], ['Diego', 'galewing', 0.45], ['Mira', 'ironroot', 0.35]] },
];

// Who holds what when the world begins: [vigilId, clanId | null, ward]
export const SEED_VIGILS = [
  ['space-needle', 'emerald', 560], ['pike-place', 'sound', 420], ['gas-works', 'cascade', 610], ['kerry-park', null, 0],
  ['ballard-locks', 'sound', 380], ['west-point', 'lantern', 300], ['green-lake', 'rainier', 520], ['fremont-troll', null, 0],
  ['lumen-field', 'emerald', 450], ['volunteer-park', 'lantern', 260], ['seward-park', null, 0], ['golden-gardens', 'rainier', 340],
  ['pioneer-square', 'cascade', 240],
];

// ---------- Chat lines for simulated clanmates ----------

export const CHAT = {
  cheer: ['Let\'s go {name}! 🔥', 'Nice one, {name} 👏', 'That\'s {dist} more for the gauge!', 'Every step counts 👣', '{name} with the steady work 💪'],
  banter: [
    'Light rain this morning, perfect for Green Lake.',
    'The mountain is out today! 🏔️',
    'Who wants to take Kerry Park? It\'s wide open.',
    'Burke-Gilman was packed this morning 🚴',
    'Leg day at the gym, then pickup soccer. Both count!',
    'Ferry to Bainbridge and a walk around Winslow this weekend?',
  ],
  nudge: [
    'We\'re at {pct}% of the gauge. {need} more of us need to be Bonded before Sunday.',
    '{sleepy}, a 20-minute walk today gets you closer to Bonded. We\'re so close!',
    'If we awaken we get {power} and 2 Vigil Seals. Space Needle could be ours.',
  ],
  rallyReply: ['I\'m in! Heading out after work.', 'OK OK, you convinced me 😅', 'Count me in for a walk tonight.', 'Rally heard 🔥'],
  reply: {
    hike: 'Rattlesnake Ledge if you want views without a full day.',
    run: 'Green Lake loop is 2.8 mi, and we could fortify the Stillwater vigil while we\'re there.',
    walk: 'I\'m in for a walk. Gas Works at sunset?',
    gym: 'Gym counts as Ironroot energy, sport counts as Emberclaw. Both charge our gauge.',
    vigil: 'Let\'s bring our miles to the vigil. Every km pledged is 60 ward.',
    rain: 'It\'s Seattle, rain is just extra XP 😄',
    tired: 'Even 10 easy minutes counts toward Bonded. Small is fine.',
    default: ['Love that.', 'Ha, same.', 'Agreed!', 'Let\'s make it happen this week.', '🙌'],
  },
};

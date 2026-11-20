// Wildbound — static game data (Seattle edition).
// Distances are stored in km internally and displayed in miles by default.

const MI = 1.609344;
const mi = (x) => Math.round(x * MI * 10) / 10; // miles -> km
const ft = (x) => Math.round(x / 3.28084);       // feet  -> m

export const HOME = { city: 'Seattle', tz: 'America/Los_Angeles', units: 'mi' };

export const ELEMENTS = {
  earth: {
    id: 'earth', name: 'Earth', clanTitle: 'Stoneheart', color: '#9bbf5f',
    spirit: { name: 'Brumm', kind: 'stone bear', glyph: '🐻' },
    stages: ['Pebble', 'Boulder', 'Ridge', 'Mountain'],
    virtue: 'Strength & steadfastness',
    blurb: 'Grounded and patient. Earth spirits grow through lifting, climbing and long hikes.',
    affinity: ['strength', 'hike', 'climb'],
    voice: ['Brumm rumbles softly.', 'The stone bear shifts its weight.', 'Brumm presses a paw to the ground.'],
  },
  fire: {
    id: 'fire', name: 'Fire', clanTitle: 'Emberkin', color: '#ef7d3c',
    spirit: { name: 'Ashka', kind: 'ember fox', glyph: '🦊' },
    stages: ['Spark', 'Ember', 'Blaze', 'Wildfire'],
    virtue: 'Intensity & courage',
    blurb: 'Fast and fierce. Fire spirits feed on runs, intervals and sport.',
    affinity: ['run', 'hiit', 'sport'],
    voice: ['Ashka flicks a burning tail.', 'The ember fox crackles.', 'Ashka paces, restless.'],
  },
  water: {
    id: 'water', name: 'Water', clanTitle: 'Tidebound', color: '#4fb3d9',
    spirit: { name: 'Nerra', kind: 'river otter', glyph: '🦦' },
    stages: ['Droplet', 'Stream', 'River', 'Ocean'],
    virtue: 'Flow & resilience',
    blurb: 'Adaptive and calm. Water spirits deepen through swimming, paddling and yoga.',
    affinity: ['swim', 'paddle', 'yoga'],
    voice: ['Nerra drifts in a slow circle.', 'The river otter chirps.', 'Nerra surfaces beside you.'],
  },
  air: {
    id: 'air', name: 'Air', clanTitle: 'Windwalker', color: '#c7b8f5',
    spirit: { name: 'Kestra', kind: 'sky kestrel', glyph: '🦅' },
    stages: ['Breeze', 'Gust', 'Gale', 'Tempest'],
    virtue: 'Curiosity & endurance',
    blurb: 'Light and far-ranging. Air spirits soar on walks, rides and dance.',
    affinity: ['walk', 'cycle', 'dance'],
    voice: ['Kestra hovers on an updraft.', 'The sky kestrel calls out.', 'Kestra circles overhead.'],
  },
};

// distance: true  -> trail distance = real distance * trailFactor
// distance: false -> trail distance from effort minutes
export const ACTIVITIES = {
  walk:     { label: 'Walk',            icon: '🚶', element: 'air',   distance: true,  trailFactor: 1,    steps: true, elev: true },
  hike:     { label: 'Hike',            icon: '🥾', element: 'earth', distance: true,  trailFactor: 1.25, elev: true },
  run:      { label: 'Run',             icon: '🏃', element: 'fire',  distance: true,  trailFactor: 1,    elev: true },
  cycle:    { label: 'Cycle',           icon: '🚴', element: 'air',   distance: true,  trailFactor: 0.35, elev: true },
  swim:     { label: 'Swim',            icon: '🏊', element: 'water', distance: true,  trailFactor: 4 },
  paddle:   { label: 'Paddle / Row',    icon: '🛶', element: 'water', distance: true,  trailFactor: 0.6 },
  strength: { label: 'Strength',        icon: '🏋️', element: 'earth', distance: false },
  climb:    { label: 'Climb',           icon: '🧗', element: 'earth', distance: false },
  hiit:     { label: 'HIIT',            icon: '⚡', element: 'fire',  distance: false },
  sport:    { label: 'Sport',           icon: '⚽', element: 'fire',  distance: false },
  yoga:     { label: 'Yoga / Mobility', icon: '🧘', element: 'water', distance: false },
  dance:    { label: 'Dance',           icon: '💃', element: 'air',   distance: false },
};

// Effort uses the "talk test": easy to understand, no heart-rate monitor needed.
export const INTENSITY = {
  light:    { label: 'Easy',     hint: 'could sing',        mult: 1 },
  moderate: { label: 'Moderate', hint: 'could chat',        mult: 1.5 },
  vigorous: { label: 'Hard',     hint: 'only a few words',  mult: 2 },
};

// ---------- Clan Awakening ----------

export const AWAKENING = {
  targetKmPerMember: mi(8),  // weekly gauge: 8 mi per member
  bondDays: 3,               // a member is "Bonded" after moving on 3 different days this week
  bondShare: 0.6,            // 60% of members must be Bonded to awaken
  tiers: [
    { id: 'kindled', name: 'Kindled', at: 1 / 3, reward: 25,  desc: '+25 essence for every member' },
    { id: 'roused',  name: 'Roused',  at: 2 / 3, reward: 50,  desc: '+50 essence for every member' },
    { id: 'awakened', name: 'Awakened', at: 1,   reward: 150, desc: 'Clan Power for 2 weeks, a new camp building, +150 essence' },
  ],
};

// The Power a clan awakens depends on which element's energy dominated the week.
export const POWERS = {
  earth: { id: 'earth', name: "Mountain's Endurance", icon: '⛰️', effect: '+25% essence from strength, hikes and climbs' },
  fire:  { id: 'fire',  name: 'Wildfire Rally',       icon: '🔥', effect: 'Daily trial rewards are doubled' },
  water: { id: 'water', name: 'Tidal Recovery',       icon: '🌊', effect: 'One rest day won\'t break your streak; +25% essence from swim, paddle and yoga' },
  air:   { id: 'air',   name: 'Tailwind',             icon: '🌬️', effect: '+25% trail distance on every activity' },
  convergence: { id: 'convergence', name: 'Elemental Convergence', icon: '☯️', effect: '+15% essence and trail distance on everything (when no element tops 40%)' },
};

// Each Awakening raises a new structure in the clan's 3D camp, in this order.
export const BUILDINGS = [
  { id: 'longhouse',   name: 'Cedar Longhouse',  desc: 'A gathering hall of red cedar.' },
  { id: 'watchtower',  name: 'Watchtower',       desc: 'Look out over the Sound.' },
  { id: 'stones',      name: 'Standing Stones',  desc: 'A ring that hums with element energy.' },
  { id: 'garden',      name: 'Kin Garden',       desc: 'Raised beds and berry bushes.' },
  { id: 'lighthouse',  name: 'Lighthouse',       desc: 'Guides wanderers home.' },
  { id: 'observatory', name: 'Observatory',      desc: 'For reading the stars and the weather.' },
];

// ---------- Journeys (local first, then the world) ----------

function journey(def) {
  const last = def.waypoints[def.waypoints.length - 1];
  return { ...def, lengthKm: last.km };
}

export const EXPEDITIONS = [
  journey({
    id: 'seattle', name: 'Seattle Urban Trek', region: 'Seattle, WA', tier: 'Local',
    blurb: 'From the lighthouse at Discovery Park to the city\'s birthplace at Pioneer Square.',
    waypoints: [
      { name: 'Discovery Park', km: 0, lat: 47.662, lon: -122.435, elev: 3,
        lore: 'Seattle\'s largest park (534 acres) was once the Fort Lawton army post. West Point Lighthouse has stood at its tip since 1881.' },
      { name: 'Ballard Locks', km: mi(2.5), lat: 47.665, lon: -122.397, elev: 10,
        lore: 'Opened in 1917, the Hiram M. Chittenden Locks connect Lake Washington and Lake Union to Puget Sound. Building the ship canal lowered Lake Washington by about 9 ft. Watch salmon climb the fish ladder in late summer.' },
      { name: 'Fremont Troll', km: mi(5.5), lat: 47.651, lon: -122.347, elev: 30,
        lore: 'An 18-ft concrete troll has lurked under the Aurora Bridge since 1990, crushing a real Volkswagen Beetle in its hand.' },
      { name: 'Gas Works Park', km: mi(6.5), lat: 47.646, lon: -122.334, elev: 15,
        lore: 'A coal-gas plant ran here until 1956. When the park opened in 1975, its rusting towers were kept as a monument to the city\'s industrial past.' },
      { name: 'Volunteer Park', km: mi(9.5), lat: 47.630, lon: -122.315, elev: 140,
        lore: 'Landscaped to an Olmsted Brothers plan and named for the volunteers of the Spanish–American War. The 1907 water tower has one of the best free views in the city.' },
      { name: 'Pike Place Market', km: mi(12), lat: 47.609, lon: -122.342, elev: 40,
        lore: 'Opened in 1907, it is one of the oldest continuously operating public farmers\' markets in the United States.' },
      { name: 'Pioneer Square', km: mi(12.8), lat: 47.601, lon: -122.334, elev: 5,
        lore: 'Seattle\'s first downtown. The Great Seattle Fire of 6 June 1889 burned it down, and the city rebuilt in brick and raised the streets, leaving the "Seattle Underground" below. The city is named for Si\'ahl, a leader of the Duwamish and Suquamish peoples.' },
    ],
  }),
  journey({
    id: 'snoqualmie', name: 'Snoqualmie Valley & Mount Si', region: 'Cascade foothills, WA', tier: 'Local',
    blurb: 'Waterfalls, a classic Seattle summit, and the forest that fills the city\'s taps.',
    waypoints: [
      { name: 'Snoqualmie Falls', km: 0, lat: 47.541, lon: -121.837, elev: 130,
        lore: 'The river drops 268 ft here. The falls are sacred to the Snoqualmie Tribe, and a hydroelectric plant has run at the site since 1899.' },
      { name: 'North Bend', km: mi(4), lat: 47.496, lon: -121.787, elev: 135,
        lore: 'A logging and railroad town at the foot of the Cascades. Many scenes of the TV series Twin Peaks (1990) were filmed around here.' },
      { name: 'Mount Si summit', km: mi(9), lat: 47.488, lon: -121.723, elev: ft(4167),
        lore: 'Named for homesteader Josiah "Uncle Si" Merritt. The trail climbs about 3,150 ft in 4 miles to a view over the whole Puget lowland.' },
      { name: 'Rattlesnake Ledge', km: mi(16), lat: 47.434, lon: -121.775, elev: ft(2078),
        lore: 'Below the ledge lies Rattlesnake Lake. Its rising water helped force residents to abandon the town of Moncton in 1915. Old foundations still appear when the lake runs low.' },
      { name: 'Cedar River Watershed', km: mi(20), lat: 47.400, lon: -121.720, elev: ft(1560),
        lore: 'This protected forest supplies about two-thirds of the drinking water for 1.5 million people in the Seattle area.' },
    ],
  }),
  journey({
    id: 'wonderland', name: 'Wonderland Trail', region: 'Mount Rainier, WA', tier: 'Local',
    blurb: 'The legendary 93-mile loop around Tahoma, the mountain that watches over Seattle.',
    waypoints: [
      { name: 'Longmire', km: 0, lat: 46.750, lon: -121.812, elev: 842,
        lore: 'Mount Rainier National Park, founded in 1899, was the fifth US national park. Longmire grew around James Longmire\'s mineral springs resort.' },
      { name: 'Indian Henry\'s Hunting Ground', km: mi(6.5), lat: 46.807, lon: -121.856, elev: 1615,
        lore: 'Subalpine meadows named for Sotolick, a Native hunter and guide known to settlers as Indian Henry.' },
      { name: 'Klapatche Park', km: mi(21), lat: 46.851, lon: -121.887, elev: 1676,
        lore: 'A small tarn ringed by wildflowers, known for mirror images of Rainier\'s west face.' },
      { name: 'Mowich Lake', km: mi(34), lat: 46.933, lon: -121.863, elev: 1502,
        lore: 'The largest and deepest lake in the park. "Mowich" means deer in Chinook Jargon, the old trade language of the Northwest.' },
      { name: 'Carbon Glacier', km: mi(41), lat: 46.935, lon: -121.778, elev: 1067,
        lore: 'Its snout reaches down to about 3,500 ft, the lowest-elevation glacier terminus in the contiguous United States.' },
      { name: 'Sunrise', km: mi(56), lat: 46.914, lon: -121.642, elev: 1951,
        lore: 'At about 6,400 ft, the highest point in the park you can drive to. Rainier is an active volcano. About 5,600 years ago the Osceola Mudflow swept from it all the way to the Puget Sound lowlands.' },
      { name: 'Summerland', km: mi(66), lat: 46.875, lon: -121.637, elev: 1798,
        lore: 'Meadows below Little Tahoma (11,138 ft), the mountain\'s rocky satellite peak.' },
      { name: 'Indian Bar', km: mi(70), lat: 46.838, lon: -121.630, elev: 1554,
        lore: 'The Wonderland Trail, completed in 1915, circles the mountain with about 22,000 ft of total elevation gain.' },
      { name: 'Box Canyon', km: mi(80), lat: 46.766, lon: -121.637, elev: 914,
        lore: 'The Muddy Fork of the Cowlitz River squeezes through a narrow slot canyon cut into glacier-polished rock.' },
      { name: 'Reflection Lakes', km: mi(86), lat: 46.768, lon: -121.726, elev: 1480,
        lore: 'Nearby Paradise recorded 1,122 inches of snow in the winter of 1971–72, then a world record.' },
      { name: 'Longmire · loop closed', km: mi(93), lat: 46.752, lon: -121.808, elev: 842,
        lore: 'Rainier, Tahoma or Təqʷubəʔ in Lushootseed, stands about 14,410 ft and is the most glaciated peak in the contiguous US. On clear days Seattleites say "the mountain is out."' },
    ],
  }),
  journey({
    id: 'inca', name: 'The Inca Trail', region: 'Andes, Peru', tier: 'World',
    blurb: 'Stone steps through cloud forest to the citadel of Machu Picchu.',
    waypoints: [
      { name: 'Km 82 · Piskacucho', km: 0, lat: -13.214, lon: -72.381, elev: 2700,
        lore: 'The classic trail starts at a spot named for its distance along the Cusco–Machu Picchu railway: kilometre 82. Hikers cross the Urubamba, whose waters eventually join the Amazon.' },
      { name: 'Patallacta', km: 7, lat: -13.226, lon: -72.410, elev: 2750,
        lore: 'A terraced Inca settlement that likely fed and sheltered travellers heading to Machu Picchu.' },
      { name: 'Wayllabamba', km: 12, lat: -13.247, lon: -72.425, elev: 3000,
        lore: '"Grassy plain" in Quechua, the language of the Inca, still spoken by millions in the Andes today.' },
      { name: "Dead Woman's Pass", km: 21, lat: -13.252, lon: -72.474, elev: 4215,
        lore: "Warmiwañusca, 4,215 m, the trail's highest point. Every breath here carries roughly 40% less oxygen than at sea level." },
      { name: 'Runkurakay', km: 26, lat: -13.244, lon: -72.494, elev: 3760,
        lore: 'A round stone waystation. The Inca road network, the Qhapaq Ñan, ran for about 30,000 km across what are now six countries.' },
      { name: 'Phuyupatamarca', km: 34, lat: -13.209, lon: -72.528, elev: 3650,
        lore: '"Town above the clouds." A chain of ritual baths steps down the ridge.' },
      { name: 'Wiñay Wayna', km: 39, lat: -13.192, lon: -72.534, elev: 2650,
        lore: '"Forever young," named after an orchid that blooms here year-round.' },
      { name: 'Machu Picchu', km: 42, lat: -13.163, lon: -72.545, elev: 2430,
        lore: 'Built around 1450, probably for the emperor Pachacuti. The Spanish never found it. A UNESCO World Heritage Site since 1983.' },
    ],
  }),
  journey({
    id: 'ebc', name: 'Everest Base Camp', region: 'Khumbu, Nepal', tier: 'World',
    blurb: 'Climb through Sherpa villages to the foot of the highest mountain on Earth.',
    waypoints: [
      { name: 'Lukla', km: 0, lat: 27.687, lon: 86.731, elev: 2860,
        lore: 'Tenzing–Hillary Airport has a short, sloping runway that ends at a mountainside.' },
      { name: 'Namche Bazaar', km: 19, lat: 27.805, lon: 86.714, elev: 3440,
        lore: 'The trading town of the Sherpa people, whose ancestors moved here from Tibet about 500 years ago.' },
      { name: 'Tengboche', km: 29, lat: 27.836, lon: 86.764, elev: 3867,
        lore: 'Home to the largest monastery in the Khumbu, founded in 1916.' },
      { name: 'Dingboche', km: 40, lat: 27.892, lon: 86.831, elev: 4410,
        lore: 'Trekkers follow the rule "climb high, sleep low" so their bodies can make more red blood cells.' },
      { name: 'Gorak Shep', km: 56, lat: 27.980, lon: 86.829, elev: 5164,
        lore: 'A frozen lakebed and the last teahouses before base camp.' },
      { name: 'Everest Base Camp', km: 62, lat: 28.004, lon: 86.857, elev: 5364,
        lore: 'Everest is 8,849 m tall. Tenzing Norgay and Edmund Hillary first summited on 29 May 1953. Its summit rock is limestone that was once the floor of the ancient Tethys Ocean.' },
    ],
  }),
  journey({
    id: 'camino', name: 'Camino de Santiago', region: 'Camino Francés, Spain', tier: 'World',
    blurb: 'A thousand-year-old pilgrimage across the north of Spain.',
    waypoints: [
      { name: 'Saint-Jean-Pied-de-Port', km: 0, lat: 43.163, lon: -1.238, elev: 170,
        lore: 'The traditional start. Day one climbs about 1,200 m over the Pyrenees.' },
      { name: 'Pamplona', km: 68, lat: 42.812, lon: -1.645, elev: 450,
        lore: 'Capital of the old Kingdom of Navarre. Its Roman name, Pompaelo, honours the general Pompey.' },
      { name: 'Burgos', km: 280, lat: 42.344, lon: -3.697, elev: 860,
        lore: 'Its Gothic cathedral, begun in 1221, holds the tomb of the medieval warrior El Cid.' },
      { name: 'León', km: 460, lat: 42.599, lon: -5.567, elev: 840,
        lore: 'After the high, dry Meseta, pilgrims reach León and its cathedral of medieval stained glass.' },
      { name: 'Cruz de Ferro', km: 530, lat: 42.488, lon: -6.361, elev: 1500,
        lore: 'Pilgrims leave a stone carried from home at this iron cross, a symbol of a burden set down.' },
      { name: 'Santiago de Compostela', km: 780, lat: 42.880, lon: -8.545, elev: 260,
        lore: 'Tradition says the remains of St James were found here in the 9th century. The scallop shell became the pilgrim\'s emblem.' },
    ],
  }),
];

// ---------- Seattle check-in spots (GPS in the mobile app; simulated here) ----------

export const PLACES = [
  { id: 'green-lake', name: 'Green Lake', icon: '🌳', lat: 47.680, lon: -122.328,
    blurb: 'A flat 2.8-mile loop around a lake left behind by retreating ice-age glaciers.' },
  { id: 'kerry-park', name: 'Kerry Park', icon: '🏙️', lat: 47.629, lon: -122.360,
    blurb: 'The classic Queen Anne viewpoint: skyline, Space Needle and, when the mountain is out, Rainier.' },
  { id: 'seward-park', name: 'Seward Park', icon: '🌲', lat: 47.550, lon: -122.256,
    blurb: 'A peninsula in Lake Washington with one of the city\'s largest stands of old-growth forest.' },
  { id: 'golden-gardens', name: 'Golden Gardens', icon: '🌅', lat: 47.692, lon: -122.403,
    blurb: 'A beach on Shilshole Bay with sunsets over the Olympic Mountains.' },
  { id: 'arboretum', name: 'Washington Park Arboretum', icon: '🍁', lat: 47.640, lon: -122.296,
    blurb: '230 acres along Lake Washington, run with the University of Washington. The Japanese Garden opened in 1960.' },
  { id: 'magnuson', name: 'Magnuson Park', icon: '🪁', lat: 47.682, lon: -122.254,
    blurb: 'The former Naval Air Station Sand Point, now wetlands, public art and a long lakeshore.' },
];

// ---------- Badges -> gear you wear in the 3D camp ----------

export const BADGES = {
  first_steps: { name: 'First Steps',       icon: '👣', desc: 'Log your first activity.',               gear: 'Trail Boots' },
  kindred:     { name: 'Kindred',           icon: '🔥', desc: 'Join or found a clan.',                  gear: 'Clan Cloak' },
  streak3:     { name: 'Three Suns',        icon: '☀️', desc: 'Move 3 days in a row.',                  gear: 'Sun Amulet' },
  streak7:     { name: 'Moon Cycle',        icon: '🌙', desc: 'Move 7 days in a row.',                  gear: 'Moon Circlet' },
  harmony:     { name: 'Elemental Harmony', icon: '☯️', desc: 'Log activities from all four elements.', gear: 'Four-Element Aura' },
  lorekeeper:  { name: 'Lorekeeper',        icon: '📜', desc: 'Unlock 10 lore entries.',                gear: 'Lorekeeper\'s Lantern' },
  summit:      { name: 'Summit Seeker',     icon: '🏔️', desc: 'Finish a journey with your clan.',      gear: 'Summit Banner (in camp)' },
  awakened:    { name: 'Spirit Awakened',   icon: '✨', desc: 'Evolve your spirit to its second form.', gear: 'Bigger spirit companion' },
  century:     { name: 'Hundred Miles',     icon: '🧭', desc: 'Contribute 100 trail miles.',           gear: 'Explorer\'s Pack' },
  local:       { name: 'Emerald Wanderer',  icon: '☔', desc: 'Check in at 3 Seattle spots.',          gear: 'Rain Shell' },
  awakener:    { name: 'Awakener',          icon: '⚡', desc: 'Be Bonded when your clan awakens.',      gear: 'Element Crest' },
};

// ---------- Seed clans (simulated members) ----------
// propensity = chance a member moves on a given day (some kin are "sleepy" and need rallying).

export const SEED_CLANS = [
  { id: 'cascade', name: 'Cascade Stonehearts', element: 'earth', motto: 'We carry the mountain.', members: [
    ['Asha', 'earth', 0.8], ['Mateo', 'fire', 0.7], ['Ingrid', 'earth', 0.55], ['Kofi', 'water', 0.4], ['Lin', 'air', 0.3]] },
  { id: 'emerald', name: 'Emerald Embers', element: 'fire', motto: 'Burn bright in the rain.', members: [
    ['Ravi', 'fire', 0.75], ['Sofia', 'fire', 0.6], ['Jonah', 'earth', 0.5], ['Amara', 'air', 0.45], ['Yuki', 'water', 0.35]] },
  { id: 'sound', name: 'Sound Tidebound', element: 'water', motto: 'Flow around every obstacle.', members: [
    ['Maya', 'water', 0.8], ['Tomás', 'water', 0.55], ['Elif', 'air', 0.5], ['Noah', 'earth', 0.45], ['Priya', 'fire', 0.4]] },
  { id: 'rainier', name: 'Rainier Windwalkers', element: 'air', motto: 'Lighter with every step.', members: [
    ['Leo', 'air', 0.7], ['Zara', 'air', 0.65], ['Kai', 'fire', 0.5], ['Nadia', 'water', 0.4], ['Femi', 'earth', 0.35]] },
];

// ---------- Chat lines for simulated clanmates ----------

export const CHAT = {
  cheer: ['Let\'s go {name}! 🔥', 'Nice one, {name} 👏', 'That\'s {dist} closer to {landmark}!', 'Every step counts 👣', 'Love it. The gauge is moving!', '{name} with the steady work 💪'],
  banter: [
    'Light rain this morning, perfect for Green Lake.',
    'The mountain is out today! 🏔️',
    'Anyone up for the Discovery Park loop on Saturday?',
    'Burke-Gilman was packed this morning 🚴',
    'Did Rattlesnake Ledge yesterday. Worth the climb.',
    'Stretching after a long week at the desk 🧘',
    'Ferry to Bainbridge and a walk around Winslow this weekend?',
  ],
  nudge: [
    'We\'re at {pct}% of the gauge. {need} more of us need to be Bonded before Sunday.',
    '{sleepy}, a 20-minute walk would get you Bonded. We\'re so close!',
    'If we awaken this week we\'ll get {power}. Who\'s moving today?',
  ],
  rallyReply: ['I\'m in! Heading out after work.', 'OK OK, you convinced me 😅', 'Count me in for a walk tonight.', 'Rally heard 🔥'],
  reply: {
    hike: 'Rattlesnake Ledge is a solid one if you want views without a full day.',
    run: 'Green Lake loop is 2.8 mi, flat and fast. Meet there?',
    walk: 'I\'m in for a walk. Gas Works at sunset?',
    rain: 'It\'s Seattle, rain is just extra essence 😄',
    tired: 'Even 10 easy minutes counts toward Bonded. Small is fine.',
    default: ['Love that.', 'Ha, same.', 'Agreed!', 'Let\'s make it happen this week.', '🙌'],
  },
};

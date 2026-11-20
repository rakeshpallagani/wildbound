// Wildbound — Supabase backend adapter.
// The app is offline-first: everything works locally. When a Supabase URL + anon key are configured
// (config.js or Me → Settings → Backend), this module signs you in, syncs real clans, bands, activities,
// gatherings, RSVPs and chat, and listens for live changes. Schema + security rules: supabase/schema.sql.
import { ACTIVITIES, SPOTS } from './data.js';
import * as G from './engine.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.js';
const LS_KEY = 'wildbound:backend';

export function readConfig() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { /* ignore */ }
  const file = window.WILDBOUND_CONFIG || {};
  return { url: (saved.url || file.supabaseUrl || '').trim(), key: (saved.key || file.supabaseAnonKey || '').trim() };
}
export function saveConfig({ url, key }) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ url: (url || '').trim(), key: (key || '').trim() })); } catch { /* ignore */ }
}

function loadSdk() {
  if (window.supabase?.createClient) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Couldn\'t load the Supabase client (offline, or blocked by this viewer).'));
    document.head.appendChild(s);
  });
}

export function createBackend({ onChange = () => {} } = {}) {
  let sb = null;
  let user = null;
  let status = 'offline'; // offline | connecting | signed-out | online | error
  let error = '';
  let subs = [];
  let repullTimer = null;
  const debouncedPull = () => { clearTimeout(repullTimer); repullTimer = setTimeout(() => onChange({ type: 'repull' }), 1500); };
  const need = () => { if (!sb || !user) throw new Error('Not connected to the backend'); };
  const check = ({ data, error: e }) => { if (e) throw new Error(e.message); return data; };

  const api = {
    get status() { return status; },
    get error() { return error; },
    get user() { return user; },
    get online() { return status === 'online'; },

    async connect() {
      const { url, key } = readConfig();
      if (!url || !key) { status = 'offline'; return api; }
      status = 'connecting';
      try {
        await loadSdk();
        sb = window.supabase.createClient(url, key, { auth: { persistSession: true, detectSessionInUrl: true } });
        const { data } = await sb.auth.getSession();
        user = data.session?.user || null;
        status = user ? 'online' : 'signed-out';
        sb.auth.onAuthStateChange((_evt, session) => {
          const was = user?.id;
          user = session?.user || null;
          status = user ? 'online' : 'signed-out';
          if (was !== user?.id) onChange({ type: 'auth' });
        });
      } catch (e) { status = 'error'; error = e.message; }
      return api;
    },
    async signInEmail(email) {
      check(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } }));
    },
    async verifyCode(email, token) { check(await sb.auth.verifyOtp({ email, token: String(token).trim(), type: 'email' })); },
    async signInGuest() { check(await sb.auth.signInAnonymously()); },
    async signOut() { await sb?.auth.signOut(); user = null; status = 'signed-out'; subs.forEach((c) => sb.removeChannel(c)); subs = []; },

    // ---------- writes ----------
    async saveProfile(player) {
      need();
      check(await sb.from('profiles').upsert({ id: user.id, name: player.name, primary_aspect: player.primary, secondary_aspect: player.secondary }));
    },
    async createClan(c) {
      need();
      const row = check(await sb.from('clans').insert({ name: c.name, aspect: c.aspect, motto: c.motto, hub_name: c.hub.name, hub_lat: c.hub.lat, hub_lng: c.hub.lon, created_by: user.id }).select().single());
      check(await sb.from('clan_members').upsert({ user_id: user.id, clan_id: row.id, role: 'founder' }));
      return row;
    },
    async joinClan(clanId) { need(); check(await sb.from('clan_members').upsert({ user_id: user.id, clan_id: clanId, role: 'member' })); },
    async leaveClan() { need(); check(await sb.from('clan_members').delete().eq('user_id', user.id)); },
    async createBand(clanId, band, spot) {
      need();
      const row = check(await sb.from('bands').insert({ clan_id: clanId, name: band.name, focus: band.type, spot_name: spot.name, spot_lat: spot.lat, spot_lng: spot.lon, usual_time: band.time, created_by: user.id }).select().single());
      check(await sb.from('band_members').insert({ band_id: row.id, user_id: user.id }));
      return row;
    },
    async setBand(bandId, member) {
      need();
      if (member) check(await sb.from('band_members').upsert({ band_id: bandId, user_id: user.id }));
      else check(await sb.from('band_members').delete().match({ band_id: bandId, user_id: user.id }));
    },
    async logActivity(a, clanId) {
      need();
      check(await sb.from('activities').upsert({
        id: a.id, user_id: user.id, clan_id: clanId || null, type: a.type, aspect: a.aspect, minutes: a.minutes,
        distance_km: a.distanceKm || null, elev_m: a.elevM || null, intensity: a.intensity, source: a.source,
        xp: a.essence, trail_km: a.trailKm, place: a.place || null, occurred_at: a.date,
      }));
    },
    async sendMessage(clanId, bandId, body, kind = 'msg') {
      need();
      check(await sb.from('messages').insert({ clan_id: clanId, band_id: bandId || null, user_id: user.id, body, kind }));
    },
    async hostGathering(g, spot) {
      need();
      const startsAt = new Date(`${g.day}T${g.time}:00`).toISOString();
      const row = check(await sb.from('gatherings').insert({ clan_id: g.clanId, band_id: g.bandId || null, host_id: user.id, title: g.title, type: g.type, spot_name: spot.name, lat: spot.lat, lng: spot.lon, starts_at: startsAt }).select().single());
      check(await sb.from('gathering_rsvps').upsert({ gathering_id: row.id, user_id: user.id, status: 'going' }));
      return row;
    },
    async rsvp(gatheringId, statusValue) {
      need();
      if (!statusValue) check(await sb.from('gathering_rsvps').delete().match({ gathering_id: gatheringId, user_id: user.id }));
      else check(await sb.from('gathering_rsvps').upsert({ gathering_id: gatheringId, user_id: user.id, status: statusValue, updated_at: new Date().toISOString() }));
    },

    // ---------- reads ----------
    async pullWorld() {
      need();
      const since = new Date(G.weekStart(new Date()) + 'T00:00:00').toISOString();
      const [clans, members, profiles, bands, bandMembers, gatherings, rsvps, activities] = await Promise.all([
        sb.from('clans').select('*').limit(200),
        sb.from('clan_members').select('*').limit(2000),
        sb.from('profiles').select('id,name,primary_aspect').limit(2000),
        sb.from('bands').select('*').limit(1000),
        sb.from('band_members').select('*').limit(5000),
        sb.from('gatherings').select('*').gte('starts_at', new Date(Date.now() - 6 * 3600e3).toISOString()).order('starts_at').limit(300),
        sb.from('gathering_rsvps').select('*').limit(5000),
        sb.from('activities').select('id,user_id,clan_id,type,aspect,trail_km,occurred_at').gte('occurred_at', since).limit(5000),
      ]).then((rs) => rs.map(check));
      const myClan = members.find((m) => m.user_id === user.id)?.clan_id || null;
      let messages = [];
      if (myClan) messages = check(await sb.from('messages').select('*').eq('clan_id', myClan).order('created_at', { ascending: false }).limit(200)).reverse();
      return { me: user.id, myClan, clans, members, profiles, bands, bandMembers, gatherings, rsvps, activities, messages };
    },
    subscribe(clanId) {
      subs.forEach((c) => sb.removeChannel(c));
      subs = [];
      if (!sb || !user) return;
      if (clanId) {
        subs.push(sb.channel(`clan-${clanId}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `clan_id=eq.${clanId}` }, (p) => onChange({ type: 'message', row: p.new }))
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activities', filter: `clan_id=eq.${clanId}` }, debouncedPull)
          .subscribe());
      }
      subs.push(sb.channel('city')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'gatherings' }, debouncedPull)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'gathering_rsvps' }, debouncedPull)
        .subscribe());
    },
  };
  return api;
}

// ---------- merge remote rows into the local game state ----------

function spotFor(name, lat, lon) {
  const known = SPOTS.find((s) => Math.abs(s.lat - lat) < 0.0008 && Math.abs(s.lon - lon) < 0.0008);
  if (known) return known.id;
  const id = `r-${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (!SPOTS.some((s) => s.id === id)) SPOTS.push({ id, name: name || 'Meeting point', lat, lon });
  return id;
}
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function mergeWorld(state, w) {
  const prof = Object.fromEntries(w.profiles.map((p) => [p.id, p]));
  const mid = (uid) => (uid === w.me ? 'me' : `u-${uid}`);
  const remoteClans = w.clans.map((row) => {
    const prev = state.clans.find((c) => c.id === row.id);
    const members = w.members.filter((m) => m.clan_id === row.id).map((m) => ({
      id: mid(m.user_id), userId: m.user_id, name: m.user_id === w.me ? state.player.name : prof[m.user_id]?.name || 'Wanderer',
      aspect: m.user_id === w.me ? state.player.primary : prof[m.user_id]?.primary_aspect || 'mistwalker', isPlayer: m.user_id === w.me, propensity: 0, totalKm: 0,
    }));
    const bands = w.bands.filter((b) => b.clan_id === row.id).map((b) => ({
      id: b.id, name: b.name, type: ACTIVITIES[b.focus] ? b.focus : 'walk', spotId: spotFor(b.spot_name, b.spot_lat ?? row.hub_lat, b.spot_lng ?? row.hub_lng),
      time: b.usual_time || '18:00', meetup: `${b.name}: ${ACTIVITIES[b.focus]?.label || 'Meetup'}`,
      members: w.bandMembers.filter((x) => x.band_id === b.id).map((x) => mid(x.user_id)),
    }));
    const clan = {
      ...(prev || { journeyId: 'snoqualmie', journeyKm: 0, completed: [], history: [], awakenings: 0, power: null, lastRank: null, totalKm: 0 }),
      id: row.id, name: row.name, aspect: row.aspect, motto: row.motto || '', founded: false, remote: true,
      hub: { name: row.hub_name || 'Hearth', lat: row.hub_lat, lon: row.hub_lng }, xp: Number(row.xp) || 0, seals: row.seals ?? 1, members, bands,
    };
    const rows = w.activities.filter((a) => a.clan_id === row.id).map((a) => ({ memberId: mid(a.user_id), aspect: a.aspect, trailKm: a.trail_km, type: a.type, date: a.occurred_at }));
    G.rebuildWeek(clan, rows);
    clan.xp = Number(row.xp) || 0;
    return clan;
  });
  state.clans = [...state.clans.filter((c) => !c.remote), ...remoteClans];
  state.remote = { me: w.me, at: Date.now() };
  if (w.myClan) state.clanId = w.myClan;
  else if (state.clans.find((c) => c.id === state.clanId)?.remote) state.clanId = null;

  const local = state.gatherings.filter((g) => !g.remote);
  const remoteG = w.gatherings.map((g) => {
    const d = new Date(g.starts_at);
    const rs = w.rsvps.filter((r) => r.gathering_id === g.id);
    const mine = rs.find((r) => r.user_id === w.me);
    return {
      id: g.id, remote: true, clanId: g.clan_id, bandId: g.band_id, title: g.title, type: ACTIVITIES[g.type] ? g.type : 'walk',
      spotId: spotFor(g.spot_name, g.lat, g.lng), day: G.dayKey(d), time: hhmm(d), host: prof[g.host_id]?.name || 'Someone',
      going: rs.map((r) => mid(r.user_id)), rsvp: !!mine, attended: mine?.status === 'attended',
    };
  }).filter((g) => state.clans.some((c) => c.id === g.clanId));
  state.gatherings = [...local, ...remoteG].sort((a, b) => (a.day + a.time < b.day + b.time ? -1 : 1));

  if (w.myClan) {
    const clan = state.clans.find((c) => c.id === w.myClan);
    const byChannel = {};
    for (const m of w.messages) {
      const ch = m.band_id ? `${w.myClan}/${m.band_id}` : w.myClan;
      (byChannel[ch] = byChannel[ch] || []).push(remoteMsg(m, clan, w.me));
    }
    for (const ch of Object.keys(state.chat)) if (ch.startsWith(w.myClan)) delete state.chat[ch];
    Object.assign(state.chat, byChannel);
  }
}

export function remoteMsg(m, clan, me) {
  const member = clan?.members.find((x) => x.userId === m.user_id);
  return {
    id: m.id, ts: new Date(m.created_at).getTime(), kind: m.kind === 'activity' ? 'msg' : m.kind, text: m.body, act: null, cheers: 0, cheered: false,
    from: { id: member?.id || `u-${m.user_id}`, name: member?.name || 'Wanderer', aspect: member?.aspect || 'mistwalker', isPlayer: m.user_id === me },
  };
}

// Wildbound — optional Google Photorealistic 3D map (Maps JavaScript API, "maps3d" library).
// Requires your own API key with the Maps JavaScript API and Map Tiles API enabled. Restrict the key to your
// site's HTTP referrer (e.g. https://<you>.github.io/*). The built-in map is used when no key is set.
// Note: the 3D Maps API surface has changed between versions; this adapter sets both old and new property names.

let loading = null;
function loadGoogle(key) {
  if (window.google?.maps?.importLibrary) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=beta&libraries=maps3d`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error('Couldn\'t load Google Maps (check the key, or this viewer may block it).')); };
    document.head.appendChild(s);
  });
  return loading;
}

export async function createGoogle3D(container, key, { center, onSelectVigil = () => {} }) {
  await loadGoogle(key);
  const { Map3DElement, Marker3DElement, Polyline3DElement } = await google.maps.importLibrary('maps3d');
  const map = new Map3DElement({
    center: { lat: center.lat, lng: center.lon, altitude: 0 }, range: 1800, tilt: 62, heading: 20, mode: 'HYBRID',
  });
  map.style.width = '100%';
  map.style.height = '100%';
  container.appendChild(map);

  const markers = new Map();
  const me = new Marker3DElement({ position: { lat: center.lat, lng: center.lon, altitude: 30 }, altitudeMode: 'RELATIVE_TO_GROUND', extruded: true, label: 'You' });
  map.append(me);
  const track = new Polyline3DElement({ strokeColor: '#ffd36e', strokeWidth: 8, altitudeMode: 'CLAMP_TO_GROUND' });
  map.append(track);

  return {
    setVigils(list) {
      for (const v of list) {
        let m = markers.get(v.id);
        if (!m) {
          m = new Marker3DElement({ position: { lat: v.lat, lng: v.lon, altitude: 120 }, altitudeMode: 'RELATIVE_TO_GROUND', extruded: true });
          m.addEventListener('gmp-click', () => onSelectVigil(v.id));
          markers.set(v.id, m);
          map.append(m);
        }
        m.label = v.label;
      }
    },
    setPlayer(lat, lon) { me.position = { lat, lng: lon, altitude: 30 }; },
    setTrack(points) {
      const coords = points.map((p) => ({ lat: p.lat, lng: p.lon }));
      track.coordinates = coords; // older API
      track.path = coords;        // newer API
    },
    focusOn(lat, lon) { map.center = { lat, lng: lon, altitude: 0 }; },
    destroy() { map.remove(); },
  };
}

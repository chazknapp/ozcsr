/** Main app wiring. */

// 1) Mapbox token and map init
mapboxgl.accessToken = MAPBOX_TOKEN;
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/satellite-streets-v12",
  center: START_CENTER,
  zoom: START_ZOOM
});

// 2) Geocoder (defensive if plugin fails to load)
let geocoder = null;
if (window.MapboxGeocoder) {
  geocoder = new MapboxGeocoder({
    accessToken: mapboxgl.accessToken,
    mapboxgl,
    marker: false,
    placeholder: "Search address",
    proximity: GEOCODER_PROXIMITY
  });
  const slot = document.getElementById("geocoder");
  try { slot.appendChild(geocoder.onAdd(map)); }
  catch { map.addControl(geocoder, "top-left"); }
} else {
  console.error("MapboxGeocoder plugin failed to load.");
}

// Recenter button wiring
function recenterMap() {
  try { map.fitBounds(INITIAL_BOUNDS, { padding: 40 }); }
  catch { map.flyTo({ center: START_CENTER, zoom: START_ZOOM }); }
  // clear any feeder/zone hole state
  if (selectedFeederId != null) {
    try { map.setFeatureState({ source: 'feeders-src', id: selectedFeederId }, { hole: false }); } catch(_) {}
    selectedFeederId = null;
  }
  if (selectedZoneId != null) {
    try { map.setFeatureState({ source: 'substations-src', id: selectedZoneId }, { hole: false }); } catch(_) {}
    selectedZoneId = null;
  }
}
const recenterBtn = document.getElementById('btn-recenter');
if (recenterBtn) recenterBtn.addEventListener('click', recenterMap);

// Refresh button wiring — resets UI to initial state
function resetApp() {
  // hide results, show legend
  const card = document.getElementById('result-card');
  if (card) card.hidden = true;
  const legend = document.getElementById('legend-card');
  if (legend) legend.hidden = false;

  // clear geocoder input
  const input = document.querySelector(".mapboxgl-ctrl-geocoder input[type='text']");
  if (input) { input.value = ""; input.blur(); }

  // remove address markers and compare line
  if (Array.isArray(addrMarkers)) {
    for (const m of addrMarkers) { try { m.remove(); } catch(_) {} }
    addrMarkers = [];
  }
  try { if (map.getLayer('compare-line')) map.removeLayer('compare-line'); } catch(_) {}
  try { if (map.getSource('compare-line-src')) map.removeSource('compare-line-src'); } catch(_) {}

  // clear hover and holes
  try { hoverPopup.remove(); } catch(_) {}
  try { if (map.getLayer('feeders-hover')) map.setFilter('feeders-hover', ['==', ['id'], -1]); } catch(_) {}
  if (selectedFeederId != null) {
    try { map.setFeatureState({ source: 'feeders-src', id: selectedFeederId }, { hole: false }); } catch(_) {}
    selectedFeederId = null;
  }
  if (selectedZoneId != null) {
    try { map.setFeatureState({ source: 'substations-src', id: selectedZoneId }, { hole: false }); } catch(_) {}
    selectedZoneId = null;
  }

  // clear selected grid highlight
  try { map.setFilter('grid-selected', ['==', ['get', FIELDS.gridInT.sml], '']); } catch(_) {}

  // recenter map
  recenterMap();
}
const refreshBtn = document.getElementById('btn-refresh');
if (refreshBtn) refreshBtn.addEventListener('click', resetApp);

// Zoom buttons wiring — zoom toward the last searched point if present
function zoomToPoint(delta) {
  const current = map.getZoom();
  const target = Math.max(0, Math.min(22, current + delta));
  let center = map.getCenter();
  const last = addrMarkers[addrMarkers.length - 1];
  if (last && typeof last.getLngLat === 'function') {
    try { center = last.getLngLat(); } catch(_) {}
  }
  map.easeTo({ center, zoom: target, duration: 500 });
}
const zoomInBtn = document.getElementById('btn-zoom-in');
if (zoomInBtn) zoomInBtn.addEventListener('click', () => zoomToPoint(+1));
const zoomOutBtn = document.getElementById('btn-zoom-out');
if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => zoomToPoint(-1));

// 3) State
let addrMarkers = []; // keep up to 2 markers for comparison
let data = { gridInT: null, gridOOT: null, substations: null, feeders: null, huts: null };

// Distinct colors for Zones (Substations)
const ZONE_PALETTE = [
  "#1f77b4","#ff7f0e","#2ca02c","#d62728","#9467bd",
  "#8c564b","#e377c2","#7f7f7f","#bcbd22","#17becf",
  "#393b79","#637939","#8c6d31","#843c39","#7b4173",
  "#3182bd","#e6550d","#31a354","#756bb1","#636363"
];

let zonesLineColorExpr = "#1e3a8a";
let zonesFillColorExpr = "rgba(147,197,253,0.5)";
let SUB_COLOR_MAP = new Map(); // substation name -> color hex
let selectedFeederId = null; // for the 'hole' effect on feeders
let selectedZoneId = null;   // for the 'hole' effect on zones

function buildZoneColorExpressions(fc) {
  const nameField = FIELDS.substations.name;
  const names = [...new Set((fc.features||[])
    .map(f => f.properties?.[nameField])
    .filter(Boolean))];

  SUB_COLOR_MAP = new Map();
  names.forEach((n, i) => SUB_COLOR_MAP.set(n, ZONE_PALETTE[i % ZONE_PALETTE.length]));

  const matchArgsLine = [];
  names.forEach(n => { matchArgsLine.push(n, SUB_COLOR_MAP.get(n)); });
  zonesLineColorExpr = ["match", ["get", nameField], ...matchArgsLine, "#1e3a8a"];

  const toRGBA = (hex, a=0.5) => {
    const h = hex.replace("#",""); const r=parseInt(h.slice(0,2),16);
    const g=parseInt(h.slice(2,4),16); const b=parseInt(h.slice(4,6),16);
    return `rgba(${r},${g},${b},${a})`;
  };
  const matchArgsFill = [];
  names.forEach(n => { matchArgsFill.push(n, toRGBA(SUB_COLOR_MAP.get(n), 0.5)); });
  zonesFillColorExpr = ["match", ["get", nameField], ...matchArgsFill, "rgba(147,197,253,0.5)"];

  // update legend UI
  renderLegend();
}

function renderLegend() {
  const el = document.getElementById('legend-body');
  if (!el) return;
  if (!SUB_COLOR_MAP || SUB_COLOR_MAP.size === 0) { el.textContent = 'No substation colors yet.'; return; }
  const items = [...SUB_COLOR_MAP.entries()].map(([name, color]) =>
    `<div class="legend-item"><span class="legend-swatch" style="background:${color}"></span><span>${name}</span></div>`
  ).join("");
  el.innerHTML = items;
}

// Reusable hover popup
const hoverPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, className: 'hover-pop' });

// Helper to read Feeder code robustly (handles casing/alias differences)
function getFeederCodeFromProps(props) {
  if (!props) return null;
  const candidates = [FIELDS.feeders.code, 'Feeder', 'FEEDER', 'FeederID', 'Feeder_Code', 'feeder_code', 'FeederName', 'Feeder Code'];
  for (const k of candidates) { if (k && k in props) return props[k]; }
  const lowerMap = Object.fromEntries(Object.entries(props).map(([k,v]) => [k.toLowerCase(), v]));
  return lowerMap['feeder_code'] ?? lowerMap['feeder'] ?? null;
}

// Helper to read Substation from feeder properties
function getFeederSubstationFromProps(props) {
  if (!props) return null;
  const candidates = [FIELDS.feeders.substation, 'Substation', 'substation', 'SUBSTATION'];
  for (const k of candidates) { if (k && k in props) return props[k]; }
  return null;
}

// 4) Load sources on map load
map.on("load", async () => {
  await loadGeoJSONSources();

  // Build per-zone colors once data is available
  if (data.substations && FIELDS.substations.type === "polygon") {
    buildZoneColorExpressions(data.substations);
  }

  addLayers();
  addInteractivity();

  try { map.fitBounds(INITIAL_BOUNDS, { padding: 40 }); } catch(_) {}
});

async function loadGeoJSONSources() {
  for (const key of Object.keys(SOURCES)) {
    const src = SOURCES[key];
    if (src.type !== "geojson") continue;

    try {
      const res = await fetch(src.url, { cache: "no-store" });
      if (!res.ok) throw new Error(`${src.url} -> ${res.status} ${res.statusText}`);

      const text = await res.text();
      let fc;
      try { fc = JSON.parse(text); }
      catch { throw new Error(`${src.url} is not valid JSON`); }

      if (!fc || fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) {
        throw new Error(`${src.url} is not a GeoJSON FeatureCollection`);
      }

      data[key] = fc;
      map.addSource(`${key}-src`, { type: "geojson", data: fc, generateId: (key === "feeders" || key === "substations") });
      if (key === 'feeders') {
        const sample = fc.features.find(f => f && f.properties);
        if (sample) console.log('Feeder property keys:', Object.keys(sample.properties));
      }
      console.log(`Loaded ${key} from ${src.url} (${fc.features.length} features)`);
    } catch (err) {
      console.error(`Failed to load ${key} from ${src.url}:`, err);
      alert(`Problem loading ${key}. Check the console for details.`);
    }
  }
}

function addLayers() {
  // ZONES (substations polygons): fill + outline, per-substation colors
  if (map.getSource("substations-src") && FIELDS.substations.type === "polygon") {
    map.addLayer({
      id: "zones-fill",
      type: "fill",
      source: "substations-src",
      paint: {
        "fill-color": zonesFillColorExpr,
        "fill-opacity": ["case", ["boolean", ["feature-state", "hole"], false], 0.0, 1.0]
      }
    });
    map.addLayer({
      id: "zones-line",
      type: "line",
      source: "substations-src",
      paint: { "line-color": zonesLineColorExpr, "line-width": 1.6 }
    });
  }

  // FEEDERS: filled polygons (same palette as zones) + soft yellow outline
  if (map.getSource("feeders-src")) {
    const feedersHasPolygons = !!(data.feeders && data.feeders.features && data.feeders.features.some(f => f.geometry && /Polygon/i.test(f.geometry.type)));

    if (feedersHasPolygons) {
      map.addLayer({
        id: "feeders-fill",
        type: "fill",
        source: "feeders-src",
        paint: {
          "fill-color": zonesFillColorExpr, // reuse substation color for readability
          "fill-opacity": ["case", ["boolean", ["feature-state", "hole"], false], 0.0, 0.45]
        }
      });
    }

    // outline (works for both polygon and line sources)
    map.addLayer({
      id: "feeders-line",
      type: "line",
      source: "feeders-src",
      paint: {
        "line-color": "#fff3b0",
        "line-width": 1.2,
        "line-opacity": 0.7
      },
      layout: { "line-cap": "round", "line-join": "round" }
    });

    // Hover highlight (thicker outline for the hovered feeder feature)
    map.addLayer({
      id: "feeders-hover",
      type: "line",
      source: "feeders-src",
      paint: { "line-color": "#facc15", "line-width": 3, "line-opacity": 1.0 },
      filter: ["==", ["id"], -1]
    });
  }

  // GRIDS (InT): deep yellow border, no fill + labels + selected highlight
  if (map.getSource("gridInT-src")) {
    map.addLayer({
      id: "gridInT-line",
      type: "line",
      source: "gridInT-src",
      paint: { "line-color": "#f59e0b", "line-width": 1.6 }
    });

    map.addLayer({
      id: "gridInT-labels",
      type: "symbol",
      source: "gridInT-src",
      layout: {
        "text-field": ["to-string", ["get", FIELDS.gridInT.sml]],
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10, 12, 12, 15, 16],
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"],
        "text-allow-overlap": true
      },
      paint: {
        "text-color": "#b45309",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.2
      }
    });

    map.addLayer({
      id: "grid-selected",
      type: "line",
      source: "gridInT-src",
      paint: { "line-color": "#111827", "line-width": 3 },
      filter: ["==", ["get", FIELDS.gridInT.sml], ""]
    });
  }

  // HUTS: add after feeders/grids so icons sit on top
  if (map.getSource("huts-src")) {
    addHutSquareIcon().then(() => {
      try { map.removeLayer('huts-square'); } catch(_) {}
      map.addLayer({
        id: "huts-square",
        type: "symbol",
        source: "huts-src",
        layout: {
          "icon-image": "hut-square",
          "icon-size": [
            "interpolate", ["linear"], ["zoom"],
            8, 1.2,
            9, 1.8,
            10, 2.0,
            12, 2.4,
            14, 3.0,
            16, 3.6,
            18, 4.4
          ],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true
        }
      });

      // Hut labels — show when zoomed in
      try { map.removeLayer('huts-labels'); } catch(_) {}
      map.addLayer({
        id: "huts-labels",
        type: "symbol",
        source: "huts-src",
        minzoom: 10.8,
        layout: {
          "text-field": ["to-string", ["get", FIELDS.huts.id]],
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"],
          "text-size": [
            "interpolate", ["linear"], ["zoom"],
            11, 10,
            13, 12,
            15, 14,
            17, 16
          ],
          "text-offset": [0, 1.3],
          "text-anchor": "top",
          "text-allow-overlap": true,
          "text-variable-anchor": ["top", "bottom", "left", "right"],
          "text-ignore-placement": true
        },
        paint: {
          "text-color": "#065f46",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1
        }
      });
    });
  }
}

function addInteractivity() {
  // Feeder hover should work anywhere over the polygon OR the outline.
  // Instead of per-layer handlers, use a single map-level query so feeders win over zones.
  const feederHoverLayers = [];
  if (map.getLayer("feeders-fill")) feederHoverLayers.push("feeders-fill");
  if (map.getLayer("feeders-line")) feederHoverLayers.push("feeders-line");

  if (feederHoverLayers.length) {
    map.on("mousemove", (e) => {
      const feats = map.queryRenderedFeatures(e.point, { layers: feederHoverLayers });
      if (feats && feats.length) {
        const f = feats[0];
        const code = getFeederCodeFromProps(f.properties) ?? "?";
        const sub  = getFeederSubstationFromProps(f.properties) ?? "—";
        hoverPopup.setLngLat(e.lngLat).setHTML(`Feeder_Code: ${code}<br>Substation: ${sub}`).addTo(map);
        map.getCanvas().style.cursor = "pointer";
        // highlight the exact hovered feature on the outline layer
        const id = f.id;
        if (id != null && map.getLayer("feeders-hover")) {
          map.setFilter("feeders-hover", ["==", ["id"], id]);
        }
      } else {
        // nothing under pointer
        map.getCanvas().style.cursor = "";
        hoverPopup.remove();
        if (map.getLayer("feeders-hover")) {
          map.setFilter("feeders-hover", ["==", ["id"], -1]);
        }
      }
    });
  }

  if (map.getLayer("zones-fill")) {
    map.on("mouseenter", "zones-fill", () => map.getCanvas().style.cursor = "pointer");
    map.on("mouseleave", "zones-fill", () => { map.getCanvas().style.cursor = ""; hoverPopup.remove(); });
    map.on("mousemove", "zones-fill", (e) => {
      // If a feeder is under the cursor, let feeder hover win and skip zone tooltip
      const hasFeeder = map.queryRenderedFeatures(e.point, { layers: feederHoverLayers }).length > 0;
      if (hasFeeder) return;
      const f = e.features && e.features[0];
      const name = f?.properties?.[FIELDS.substations.name] ?? "?";
      hoverPopup.setLngLat(e.lngLat).setHTML(`Substation: ${name}`).addTo(map);
    });
  }
  if (map.getLayer("gridInT-line")) {
    map.on("mouseenter", "gridInT-line", () => map.getCanvas().style.cursor = "pointer");
    map.on("mouseleave", "gridInT-line", () => { map.getCanvas().style.cursor = ""; hoverPopup.remove(); });
    map.on("mousemove", "gridInT-line", (e) => {
      const f = e.features && e.features[0];
      const code = f?.properties?.[FIELDS.gridInT.sml] ?? "?";
      hoverPopup.setLngLat(e.lngLat).setHTML(`Grid: ${code}`).addTo(map);
    });
  }
}

// 5) Helpers to punch a hole in the polygon under the address
function selectFeederHoleAt(lng, lat) {
  if (!map.getLayer('feeders-fill')) return;
  const pt = map.project([lng, lat]);
  const feats = map.queryRenderedFeatures(pt, { layers: ['feeders-fill'] });
  // clear previous
  if (selectedFeederId != null) {
    try { map.setFeatureState({ source: 'feeders-src', id: selectedFeederId }, { hole: false }); } catch(_) {}
  }
  if (feats && feats.length && feats[0].id != null) {
    selectedFeederId = feats[0].id;
    try { map.setFeatureState({ source: 'feeders-src', id: selectedFeederId }, { hole: true }); } catch(_) {}
  } else {
    selectedFeederId = null;
  }
}

function selectZoneHoleAt(lng, lat) {
  if (!map.getLayer('zones-fill')) return;
  const pt = map.project([lng, lat]);
  const feats = map.queryRenderedFeatures(pt, { layers: ['zones-fill'] });
  // clear previous
  if (selectedZoneId != null) {
    try { map.setFeatureState({ source: 'substations-src', id: selectedZoneId }, { hole: false }); } catch(_) {}
  }
  if (feats && feats.length && feats[0].id != null) {
    selectedZoneId = feats[0].id;
    try { map.setFeatureState({ source: 'substations-src', id: selectedZoneId }, { hole: true }); } catch(_) {}
  } else {
    selectedZoneId = null;
  }
}

// 6) Handle address results
if (geocoder) geocoder.on("result", (e) => {
  const place = e.result;
  if (!place || !place.center) return;
  const [lng, lat] = place.center;
  const addrPoint = turf.point([lng, lat]);

  // Marker(s): keep last two for comparison
  addAddressMarker(lng, lat);
  map.flyTo({ center: [lng, lat], zoom: 15 });

  // after render, punch holes in feeder + zone polygons under the address
  map.once('idle', () => { selectFeederHoleAt(lng, lat); selectZoneHoleAt(lng, lat); });

  // --- Lookups ---
  // Substation (Zones): polygon or nearest point depending on config
  let substationName = "—";
  let zoneHit = null;
  if (FIELDS.substations.type === "polygon") {
    zoneHit = Spatial.polygonContainingPoint(addrPoint, data.substations);
    substationName = zoneHit ? (zoneHit.properties?.[FIELDS.substations.name] ?? "—") : "—";
  } else { // point
    const { feature } = Spatial.nearestPointFeature(addrPoint, data.substations);
    substationName = feature ? (feature.properties?.[FIELDS.substations.name] ?? "—") : "—";
  }

  // Hut: nearest point (Huts: stationID)
  const hutRes = Spatial.nearestPointFeature(addrPoint, data.huts);
  const hutName = hutRes.feature ? (hutRes.feature.properties?.[FIELDS.huts.id] ?? "—") : "—";
  const hutDist = (hutRes.distanceMiles != null) ? `~${hutRes.distanceMiles.toFixed(2)} mi` : "—";

  // Feeder: nearest line or containing polygon
  let feederCode = "—", feederSubstation = "—", feederDistText = "—";
  let feederHit = null;
  if (FIELDS.feeders.type === "line") {
    const fRes = Spatial.nearestLineFeature(addrPoint, data.feeders);
    if (fRes.feature) {
      feederCode = getFeederCodeFromProps(fRes.feature.properties) ?? "—";
      feederSubstation = getFeederSubstationFromProps(fRes.feature.properties) ?? "—";
      // highlight chosen feeder on hover layer
      try {
        const idx = data.feeders.features.indexOf(fRes.feature);
        if (idx > -1 && map.getLayer('feeders-hover')) {
          map.setFilter('feeders-hover', ['==', ['id'], idx]);
        }
      } catch(_) {}
      if (typeof fRes.distanceMiles === 'number' && !Number.isNaN(fRes.distanceMiles)) {
        const isAssigned = fRes.distanceMiles <= FEEDER_ASSIGN_TOLERANCE_MI;
        feederDistText = isAssigned ? "inside / assigned" : `~${fRes.distanceMiles.toFixed(2)} mi`;
      }
    }
  } else { // polygon feeders case
    feederHit = Spatial.polygonContainingPoint(addrPoint, data.feeders);
    feederCode = feederHit ? (getFeederCodeFromProps(feederHit.properties) ?? "—") : "—";
    feederSubstation = feederHit ? (getFeederSubstationFromProps(feederHit.properties) ?? "—") : "—";
    feederDistText = feederHit ? "inside / assigned" : "—";
  }

  // Out-of-territory: if not inside a Substation zone AND not inside a Feeder area, mark OOT
  if (!zoneHit && !feederHit) {
    substationName = "This is Out of Territory";
    feederCode = "This is Out of Territory";
    feederDistText = "—";
  }

  // Grids (SML)
  const gridInTHit = Spatial.polygonContainingPoint(addrPoint, data.gridInT);
  const gridSML = gridInTHit ? (gridInTHit.properties?.[FIELDS.gridInT.sml] ?? "—") : null;

  // Update selected grid highlight layer
  try {
    if (gridInTHit) {
      const smlVal = gridInTHit.properties?.[FIELDS.gridInT.sml] ?? "";
      map.setFilter("grid-selected", ["==", ["get", FIELDS.gridInT.sml], smlVal]);
    } else {
      map.setFilter("grid-selected", ["==", ["get", FIELDS.gridInT.sml], ""]);
    }
  } catch(_) {}

  let gridOOTText = "—";
  let gridSMLText = "—";
  if (gridSML != null) {
    gridSMLText = `${gridSML}`;
    gridOOTText = "-";
  } else {
    gridSMLText = "This is OOT";
    if (data.gridOOT) {
      const nearOOT = Spatial.nearestPolygonByEdge(addrPoint, data.gridOOT);
      gridOOTText = nearOOT.feature ? `${nearOOT.feature.properties?.[FIELDS.gridInT.sml] ?? "—"}` : "—";
    } else {
      gridOOTText = "—"; // OOT layer not yet provided
    }
  }

  // Adjacent (cardinal) grids: N/S/W/E
  let neighborHtml = "";
  if (data.gridInT) {
    const dir = Spatial.directionalNeighborGrids(addrPoint, data.gridInT);
    const rows = [];
    const fmt = (tag, entry) => {
      if (!entry || !entry.feature) return `<div class="small">${tag}: —</div>`;
      const code = entry.feature.properties?.[FIELDS.gridInT.sml] ?? "?";
      const miles = (typeof entry.distanceMiles === 'number') ? entry.distanceMiles.toFixed(2) : "—";
      return `<div class="small"><b>${tag}</b>: ${code} • ${miles} mi</div>`;
    };
    rows.push(fmt('North', dir.N));
    rows.push(fmt('South', dir.S));
    rows.push(fmt('West',  dir.W));
    rows.push(fmt('East',  dir.E));
    neighborHtml = `<div class="label" style="margin-top:16px">Adjacent Grids</div>` + rows.join("");
  }

  // Update panel
  const card = document.getElementById("result-card");
  card.hidden = false;
  const legend = document.getElementById('legend-card');
  if (legend) legend.hidden = true;
  document.getElementById("addr-text").textContent = place.place_name || "—";
  document.getElementById("addr-coords").textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  document.getElementById("substation-val").textContent = substationName;
  document.getElementById("hut-val").textContent = hutName;
  document.getElementById("hut-dist").textContent = hutRes.feature ? hutDist : "—";
  document.getElementById("feeder-val").textContent = feederCode; // Feeder only (no substation here)
  document.getElementById("feeder-dist").textContent = feederDistText;
  document.getElementById("grid-sml").textContent = gridSMLText;
  document.getElementById("grid-oot").textContent = gridOOTText;

  const neighborDiv = document.getElementById("neighbor-grids");
  if (neighborHtml) { neighborDiv.hidden = false; neighborDiv.innerHTML = neighborHtml; }
  else { neighborDiv.hidden = true; neighborDiv.innerHTML = ""; }
});

// Helper: create a dark-blue square icon for huts
async function addHutSquareIcon() {
  const size = 18;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,size,size);
  ctx.fillStyle = '#1e3a8a'; // dark blue
  ctx.fillRect(2,2,size-4,size-4);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(2,2,size-4,size-4);
  const imgData = ctx.getImageData(0,0,size,size);
  const img = { width: size, height: size, data: imgData.data };
  try { map.addImage('hut-square', img, { pixelRatio: 2 }); } catch(_) {}
}

// Helper: bearing to cardinal (kept if you want directional hints elsewhere)
function bearingToCardinal(bearing) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"];
  return dirs[Math.round((((bearing % 360) + 360) % 360) / 45)];
}

// --- Multi-address compare helpers ---
function makeMarkerEl(color, labelText) {
  const el = document.createElement('div');
  el.style.width = '16px';
  el.style.height = '16px';
  el.style.borderRadius = '4px';
  el.style.background = color;
  el.style.border = '2px solid #fff';
  el.style.boxShadow = '0 1px 6px rgba(0,0,0,.3)';
  el.style.position = 'relative';
  if (labelText) {
    const badge = document.createElement('div');
    badge.textContent = labelText;
    badge.style.position = 'absolute';
    badge.style.top = '-14px';
    badge.style.left = '50%';
    badge.style.transform = 'translateX(-50%)';
    badge.style.fontSize = '11px';
    badge.style.fontWeight = '700';
    badge.style.color = '#111827';
    badge.style.textShadow = '0 1px 2px rgba(255,255,255,.8)';
    el.appendChild(badge);
  }
  return el;
}

function addAddressMarker(lng, lat) {
  const colors = ['#10b981', '#ef4444']; // 1st green, 2nd red
  const label = (addrMarkers.length === 0) ? '1' : (addrMarkers.length === 1 ? '2' : String(addrMarkers.length + 1));
  const color = colors[Math.min(addrMarkers.length, colors.length - 1)];
  const el = makeMarkerEl(color, label);
  const m = new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
  addrMarkers.push(m);
  // Keep only the last two markers for comparison
  while (addrMarkers.length > 2) {
    const removed = addrMarkers.shift();
    try { removed.remove(); } catch(_) {}
  }
  updateCompareLine();
}

function updateCompareLine() {
  const srcId = 'compare-line-src';
  const lyrId = 'compare-line';
  if (addrMarkers.length < 2) {
    try { if (map.getLayer(lyrId)) map.removeLayer(lyrId); } catch(_) {}
    try { if (map.getSource(srcId)) map.removeSource(srcId); } catch(_) {}
    return;
  }
  const p1 = addrMarkers[0].getLngLat();
  const p2 = addrMarkers[1].getLngLat();
  const geo = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[p1.lng, p1.lat], [p2.lng, p2.lat]] } }
    ]
  };
  if (!map.getSource(srcId)) {
    map.addSource(srcId, { type: 'geojson', data: geo });
    map.addLayer({ id: lyrId, type: 'line', source: srcId, paint: { 'line-color': '#111827', 'line-width': 2, 'line-dasharray': [2, 2] } });
  } else {
    map.getSource(srcId).setData(geo);
  }
}

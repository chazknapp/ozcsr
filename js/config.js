/**
 * CONFIG customized for your files & fields.
 *
 * Folder structure (relative URLs):
 *   MapBox_CSR/
 *     index.html
 *     css/styles.css
 *     js/{config.js, spatial.js, app.js}
 *     data/Grids.geojson
 *          Feeders.geojson
 *          Huts.geojson
 *          Zones.geojson
 *        ( GridOOT.geojson — optional, add later )
 */

// TODO: put your real Mapbox token here
const MAPBOX_TOKEN = "pk.eyJ1IjoiY2tuYXBwOSIsImEiOiJjbWU2MHBpcHkwanplMmxuZGoxMm9lbmpzIn0.MejfD0OR2pxYwFxJUjwrMA";

// Little Rock defaults
const START_CENTER = [-94.1574, 36.0822]; // Fayetteville lon, lat
const START_ZOOM = 9; // wider view
const GEOCODER_PROXIMITY = { longitude: START_CENTER[0], latitude: START_CENTER[1] };

// Initial bounds to cover Fayetteville (center), down to Fort Smith, nearly up to Joplin
const INITIAL_BOUNDS = [
  [-94.90, 35.45], // SW lon, lat (just above I-40 near Fort Smith)
  [-93.45, 36.82]  // NE lon, lat (just below Neosho, MO)
];

// FIELD MAPPING — match exactly to your GeoJSON
const FIELDS = {
  gridInT:     { sml: "Number_" },        // Grids: Number_ (Alias: Number)
  // gridOOT:  { code: "Number_" },       // GridOOT: Number_ (Alias: Number) — enable when GridOOT is added
  huts:        { id: "stationID", substation: "Substation" }, // Huts: stationID (Alias: Station ID)
  substations: { name: "Substation", type: "polygon" },       // Zones: Substation (polygons)
  feeders:     { code: "Feeder_Code", substation: "Substation", type: "polygon" } // set to "polygon" since your feeders behave as areas; switch back to "line" if needed later // Feeders: Feeder_Code (lines)
};

// DATA SOURCES — your file names/paths
const SOURCES = {
  gridInT:     { type: "geojson", url: "data/Grids.geojson" },
  // gridOOT:  { type: "geojson", url: "data/GridOOT.geojson" }, // uncomment when available
  substations: { type: "geojson", url: "data/Zones.geojson" },
  feeders:     { type: "geojson", url: "data/Feeders.geojson" },
  huts:        { type: "geojson", url: "data/Huts.geojson" }
};

// Optional: nearest-grid helper block
const SHOW_NEIGHBOR_GRIDS = true;
const NEIGHBOR_GRID_COUNT = 3;

// consider an address "in / assigned" to a feeder if within this many miles of the line
const FEEDER_ASSIGN_TOLERANCE_MI = 0.25;
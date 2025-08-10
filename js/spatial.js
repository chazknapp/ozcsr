/** Spatial helpers built on Turf.js. Safe to use with GeoJSON FeatureCollections. */

const Spatial = (() => {
  /** Point-in-polygon: returns the first polygon feature that contains point. */
  function polygonContainingPoint(point, polygonFC) {
    if (!polygonFC || !polygonFC.features) return null;
    for (const f of polygonFC.features) {
      try { if (turf.booleanPointInPolygon(point, f)) return f; } catch (_) {}
    }
    return null;
  }

  /** Nearest point feature to the given point. Returns {feature, distanceMiles}. */
  function nearestPointFeature(point, pointFC) {
    if (!pointFC || !pointFC.features || pointFC.features.length === 0) return { feature: null, distanceMiles: null };
    try {
      const nearest = turf.nearestPoint(point, pointFC);
      const miles = turf.distance(point, nearest, { units: "miles" });
      return { feature: nearest, distanceMiles: miles };
    } catch (_) { return { feature: null, distanceMiles: null }; }
  }

  /** Nearest line (for feeders). Returns {feature, distanceMiles}. */
  function nearestLineFeature(point, lineFC) {
    if (!lineFC || !lineFC.features || lineFC.features.length === 0) return { feature: null, distanceMiles: null };
    let best = null, bestDist = Infinity;
    for (const ln of lineFC.features) {
      try {
        const d = turf.pointToLineDistance(point, ln, { units: "miles" });
        if (Number.isFinite(d) && d < bestDist) { best = ln; bestDist = d; }
      } catch (_) {}
    }
    return { feature: best, distanceMiles: Number.isFinite(bestDist) ? bestDist : null };
  }

  /** Nearest polygon by edge (distance to polygon boundary). */
  function nearestPolygonByEdge(point, polygonFC) {
    if (!polygonFC || !polygonFC.features || polygonFC.features.length === 0) return { feature: null, distanceMiles: null };
    let best = null, bestDist = Infinity;
    for (const poly of polygonFC.features) {
      try {
        const outline = turf.polygonToLine(poly);
        const snapped = turf.nearestPointOnLine(outline, point);
        const d = turf.distance(point, snapped, { units: "miles" });
        if (d < bestDist) { best = poly; bestDist = d; }
      } catch (_) {}
    }
    return { feature: best, distanceMiles: bestDist };
  }

  /** N nearest polygons by centroid (fast helper for the scheduling hint). */
  function nearestPolygonsByCentroid(point, polygonFC, k = 3) {
    if (!polygonFC || !polygonFC.features) return [];
    const scored = [];
    for (const poly of polygonFC.features) {
      try {
        const centroid = turf.centroid(poly);
        const d = turf.distance(point, centroid, { units: "miles" });
        const brg = turf.bearing(point, centroid); // directional hint
        scored.push({ feature: poly, distanceMiles: d, bearing: brg });
      } catch (_) {}
    }
    scored.sort((a, b) => a.distanceMiles - b.distanceMiles);
    return scored.slice(0, k);
  }

  return { polygonContainingPoint, nearestPointFeature, nearestLineFeature, nearestPolygonByEdge, nearestPolygonsByCentroid };
})();
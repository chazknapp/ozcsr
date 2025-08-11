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

    /** Four directional neighbor grids relative to a point. */
  function directionalNeighborGrids(point, polygonFC) {
    if (!polygonFC || !polygonFC.features) return { N: null, S: null, E: null, W: null };

    const [lng, lat] = point.geometry.coordinates;
    const EPS = 1e-6;   // small nudge to avoid hitting current grid immediately
    const LEN = 3;      // ray length in degrees (~200 miles)

    const rays = {
      N: turf.lineString([[lng, lat + EPS], [lng, lat + LEN]]),
      S: turf.lineString([[lng, lat - EPS], [lng, lat - LEN]]),
      E: turf.lineString([[lng + EPS, lat], [lng + LEN, lat]]),
      W: turf.lineString([[lng - EPS, lat], [lng - LEN, lat]])
    };

    function firstHit(ray) {
      let bestPoly = null, bestMiles = Infinity;
      for (const poly of polygonFC.features) {
        try {
          if (turf.booleanPointInPolygon(point, poly)) continue; // skip current grid
          const outline = turf.polygonToLine(poly);
          const inter = turf.lineIntersect(ray, outline);
          if (!inter || !inter.features || inter.features.length === 0) continue;
          for (const ip of inter.features) {
            const d = turf.distance(point, ip, { units: 'miles' });
            if (Number.isFinite(d) && d < bestMiles) { bestPoly = poly; bestMiles = d; }
          }
        } catch(_) {}
      }
      return bestPoly ? { feature: bestPoly, distanceMiles: bestMiles } : null;
    }

    const result = {
      N: firstHit(rays.N),
      S: firstHit(rays.S),
      E: firstHit(rays.E),
      W: firstHit(rays.W)
    };

    // Fallbacks: if a ray hit nothing (gaps), choose nearest edge among grids in that half-plane
    function fallback(dirKey, predicate) {
      if (result[dirKey]) return;
      let bestPoly = null, bestMiles = Infinity;
      for (const poly of polygonFC.features) {
        try {
          if (turf.booleanPointInPolygon(point, poly)) continue;
          const c = turf.centroid(poly).geometry.coordinates; // [lon, lat]
          if (!predicate(c)) continue;
          const outline = turf.polygonToLine(poly);
          const snapped = turf.nearestPointOnLine(outline, point);
          const d = turf.distance(point, snapped, { units: 'miles' });
          if (Number.isFinite(d) && d < bestMiles) { bestPoly = poly; bestMiles = d; }
        } catch(_) {}
      }
      if (bestPoly) result[dirKey] = { feature: bestPoly, distanceMiles: bestMiles };
    }

    fallback('N', (c) => c[1] > lat + EPS);
    fallback('S', (c) => c[1] < lat - EPS);
    fallback('E', (c) => c[0] > lng + EPS);
    fallback('W', (c) => c[0] < lng - EPS);

    return result;
  }

  return { polygonContainingPoint, nearestPointFeature, nearestLineFeature, nearestPolygonByEdge, nearestPolygonsByCentroid, directionalNeighborGrids };
})();
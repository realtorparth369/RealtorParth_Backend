// cma.js
import { getAccessToken } from "../auth.js"; // <-- PATH CORRECTION APPLIED: Assuming same directory
// import haversineDistance from "haversine-distance"; // not needed, function is inline

// -----------------------------
// CONFIG / CONSTANTS
// -----------------------------
const MIN_COMPS = 5;
const RECENT_DAYS = 180;
const GLA_BAND = 0.15;        // ±15%
const AGE_BAND_YEARS = 10;    // ±10 years
const OUTLIER_Z = 2.0;        // z-score threshold
const TIME_ADJ_CAP = 0.10;    // cap time adj to ±10%
const MOI_SELLER_THRESHOLD = 3;
const MOI_BALANCED_THRESHOLD = 6;
const MOI_ADJUSTMENT_PCT = 0.05; // 5%

// Feature adjustment base rates (tune locally / market-derived, numeric values in CAD)
const ADJ = {
  per_sqft_glA: 125,           // $ per sqft for above-grade living area
  per_sqft_basement_finished: 50,
  per_bedroom: 10000,
  per_bathroom: 5000,
  garage_attached: 25000,
  garage_detached: 15000,
  suite_legal: 15000,
  suite_illegal: 5000,
  condition_per_level: 10000,  // condition is 1..5
  lot_per_sqft: 2.5,           // $ per lot sqft difference
  upgrades: { // common upgrades
    kitchen: 15000,
    bathroom: 10000,
    flooring: 5000,
    windows: 5000,
    roof: 7000
  },
  // caps on adjustments to avoid huge swings
  cap_total_adjustment_pct: 0.20 // 20% of comp price max absolute adjustments
};

// weighting scheme (sum contributions then normalized)
const WEIGHT_COMPONENTS = {
  size: 0.4,
  age: 0.2,
  location: 0.3,
  recency: 0.1
};

// -----------------------------
// UTILITIES
// -----------------------------
function daysBetween(d1, d2 = new Date()) {
  if (!d1) return Infinity;
  return Math.round(Math.abs((new Date(d2) - new Date(d1)) / (24*60*60*1000)));
}

function sameCommunity(a,b){ return (a && b && a.toLowerCase() === b.toLowerCase()); }

// simple haversine wrapper (expects {lat,lon} pairs)
function distanceKm(p1, p2) {
  // Note: Lat/Lon are now being fetched, so this function should return actual distance
  if (!p1 || !p2 || p1.lat==null || p2.lat==null) return Infinity;
  const a = {latitude: p1.lat, longitude: p1.lon};
  const b = {latitude: p2.lat, longitude: p2.lon};
  // implement haversine quickly:
  const R = 6371;
  const toRad = (v) => v * Math.PI/180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude), lat2 = toRad(b.latitude);
  const hav = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  const c = 2*Math.atan2(Math.sqrt(hav), Math.sqrt(1-hav));
  return R*c;
}

// compute mean & std
function mean(arr){ if (!arr.length) return 0; return arr.reduce((s,v)=>s+v,0)/arr.length;}
function std(arr){
  const m = mean(arr);
  const sq = arr.map(v => (v-m)**2);
  return Math.sqrt(mean(sq));
}

// clamp helper
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

// -----------------------------
// 1) MARKET SEGMENTATION
// -----------------------------
export function segmentMarket(subject, listings) {
  // primary: same community
  const primary = listings.filter(l =>
      sameCommunity(l.community, subject.community) &&
      (l.propertyType && l.propertyType.toLowerCase()) === subject.propertyType
  );

  if (primary.length >= MIN_COMPS) return primary;

  // Fallback if less than MIN_COMPS: Radius filtering
  const loc = subject.location;
  const within1km = listings.filter(l => 
    (l.propertyType && l.propertyType.toLowerCase()) === subject.propertyType && 
    distanceKm(l.location, loc) <= 1
  );

  if ((primary.length + within1km.length) >= MIN_COMPS) return [...primary, ...within1km];
  
  // Tertiary: within 3km
  const within3km = listings.filter(l => 
    (l.propertyType && l.propertyType.toLowerCase()) === subject.propertyType && 
    distanceKm(l.location, loc) <= 3
  );

  return [...primary, ...within1km, ...within3km];
}

// -----------------------------
// 2) SELECT COMPARABLES
// -----------------------------
export function selectComparables(subject, candidates) {
  const now = new Date();
  const glaMin = subject.gla * (1 - GLA_BAND);
  const glaMax = subject.gla * (1 + GLA_BAND);
  const yearMin = subject.yearBuilt - AGE_BAND_YEARS;
  const yearMax = subject.yearBuilt + AGE_BAND_YEARS;

  const comps = candidates.filter(c => {
    // CRITICAL FIX: Include "sold" and "closed" in accepted statuses
    const status = (c.status || "").toLowerCase();
    // Accept sold ("sold" or "closed") OR pending/active for context
    if (!["sold", "closed", "pending", "active"].includes(status)) return false; 
    
    // We only want CLOSED (Sold) and PENDING for valuation
    if (status !== "closed" && status !== "sold" && status !== "pending") return false;

    // recency for sold/closed must be ≤ RECENT_DAYS
    if (status === "closed" || status === "sold") {
      const days = daysBetween(c.sale_date, now);
      if (days > RECENT_DAYS) return false;
    } else {
      // pending: allow if listed within RECENT_DAYS
      const days = daysBetween(c.list_date || c.sale_date || now, now);
      if (days > RECENT_DAYS) return false;
    }

    // GLA band
    if (!c.GLA || c.GLA < glaMin || c.GLA > glaMax) return false;

    // age band
    if (!c.year_built || c.year_built < yearMin || c.year_built > yearMax) return false;

    // must have price for valuation 
    if (c.price == null || c.price <= 0) return false;
    
    return true;
  });

  return comps;
}

// -----------------------------
// 3) CLEAN DATA
// -----------------------------
export function cleanData(comps) {
  // remove non-arm's length and "as-is" by flags if present
  let cleaned = comps.filter(c => {
    const tx = (c.transaction_type || "").toLowerCase();
    if (["family", "transfer", "foreclosure"].includes(tx)) return false;
    if ((c.notes || "").toLowerCase().includes("as-is")) return false;
    return true;
  });

  // remove price outliers via z-score on price per sqft
  const pps = cleaned.map(c => c.price / Math.max(1, c.GLA));
  const m = mean(pps), s = std(pps);
  if (s === 0) return cleaned;

  cleaned = cleaned.filter((c, idx) => {
    const z = Math.abs(( (c.price / Math.max(1,c.GLA)) - m)/s);
    return z <= OUTLIER_Z;
  });

  return cleaned;
}

// -----------------------------
// 4) TIME ADJUSTMENT
// -----------------------------
export function applyTimeAdjustment(comp, subjectMonthYYYYMM, HPI) {
  // comp.sale_month expected in 'YYYY-MM' format
  const compDate = comp.sale_date || comp.list_date;
  const compMonth = compDate ? new Date(compDate).toISOString().slice(0,7) : null;
  const city = comp.city || "Calgary";
  const propType = comp.propertyType;

  const compIndex = (HPI[city] && HPI[city][propType] && HPI[city][propType][compMonth]) ? HPI[city][propType][compMonth] : null;
  const subjIndex = (HPI[city] && HPI[city][propType] && HPI[city][propType][subjectMonthYYYYMM]) ? HPI[city][propType][subjectMonthYYYYMM] : null;

  if (!compIndex || !subjIndex) {
    // If no index available, return comp.price unchanged (caller may log missing index)
    return {adjustedPrice: comp.price, timeAdjPct: 0};
  }

  const rawAdjFactor = subjIndex / compIndex;
  // cap adjustment pct
  const rawAdjPct = rawAdjFactor - 1;
  const cappedAdjPct = clamp(rawAdjPct, -TIME_ADJ_CAP, TIME_ADJ_CAP);
  const adjustedPrice = comp.price * (1 + cappedAdjPct);

  return {adjustedPrice, timeAdjPct: cappedAdjPct};
}

// -----------------------------
// 5) FEATURE ADJUSTMENTS
// -----------------------------
export function computeFeatureAdjustment(comp, subject) {
  const adjDetails = {};
  const compPrice = comp.price;

  // 1) GLA difference (above-grade living)
  const glaDiff = subject.gla - comp.GLA;
  const glaAdj = glaDiff * ADJ.per_sqft_glA; // symmetrical
  adjDetails.GLA = Math.round(glaAdj);

  // 2) Basement finished sqft: Placeholder logic simplified as DDF data is complex here
  const hasSubjBasement = subject.basementFinished || false;
  const hasCompBasement = comp.basementFinished || false;
  const basementAdj = (hasSubjBasement && !hasCompBasement) ? ADJ.per_sqft_basement_finished * 1000 : // Placeholder 1000 sqft
                       (!hasSubjBasement && hasCompBasement) ? -ADJ.per_sqft_basement_finished * 1000 : 0;
  adjDetails.basement = basementAdj;

  // 3) Bedrooms
  const bedDiff = (subject.beds || 0) - (comp.bedrooms || 0);
  const bedAdj = bedDiff * ADJ.per_bedroom;
  adjDetails.bedrooms = bedAdj;

  // 4) Bathrooms
  const bathDiff = (subject.baths || 0) - (comp.bathrooms || 0);
  const bathAdj = bathDiff * ADJ.per_bathroom;
  adjDetails.bathrooms = bathAdj;

  // 5) Garage
  const garageAdj = (() => {
    const map = { "attached double": ADJ.garage_attached*2, attached: ADJ.garage_attached, detached: ADJ.garage_detached, none: 0 };
    const subjG = (subject.garageType || "none").toLowerCase();
    const compG = (comp.garageType || "none").toLowerCase();
    return (map[subjG] || 0) - (map[compG] || 0);
  })();
  adjDetails.garage = garageAdj;

  // 6) Suite legality (Assuming subject has 'suite_status' field)
  const suiteVal = (s) => { if (!s) return 0; s = s.toLowerCase(); if (s==="legal") return ADJ.suite_legal; if (s==="illegal") return ADJ.suite_illegal; return 0; }
  const suiteAdj = suiteVal(subject.suite_status) - suiteVal(comp.suite_status);
  adjDetails.suite = suiteAdj;

  // 7) Condition: subject.condition (1..5) minus comp.condition
  const condMap = { "poor": 1, "fair": 2, "average": 3, "good": 4, "excellent": 5 };
  const subjCond = condMap[(subject.condition || "").toLowerCase()] || 3;
  const compCond = condMap[(comp.condition || "").toLowerCase()] || 3;
  const condAdj = (subjCond - compCond) * ADJ.condition_per_level;
  adjDetails.condition = condAdj;

  // 8) Lot size difference (sqft) - Assumes comp.lot_size is the normalized field for lot size
  const lotDiff = (subject.lotSize || 0) - (comp.lot_size || 0);
  const lotAdj = Math.round(lotDiff * ADJ.lot_per_sqft);
  adjDetails.lot = lotAdj;
  
  // 9) Upgrades - simplified placeholder
  // NOTE: This requires subject/comp to have an array of upgrade keywords like ["kitchen", "windows"]
  let upgradesAdj = 0;
  (subject.upgrades || []).forEach(u => {
    const k = u.toLowerCase();
    const val = ADJ.upgrades[k] || 0;
    if (!((comp.upgrades || []).map(x=>x.toLowerCase()).includes(k))) upgradesAdj += val;
  });
  adjDetails.upgrades = upgradesAdj;


  // Sum adjustments
  const totalAdjustment = Object.values(adjDetails).reduce((s,v)=>s+v, 0);

  // cap total adjustment magnitude to avoid excessive changes (relative to comp price)
  const cap = Math.abs(compPrice * ADJ.cap_total_adjustment_pct);
  const cappedTotalAdjustment = clamp(totalAdjustment, -cap, cap);

  return { totalAdjustment: Math.round(cappedTotalAdjustment), adjDetails, rawTotalAdjustment: Math.round(totalAdjustment) };
}

// -----------------------------
// 6) WEIGHTING / SIMILARITY
// -----------------------------
export function computeWeight(comp, subject) {
  // Size similarity: 1 - abs(GLA diff)/subject.GLA, clipped [0,1]
  const sizeSim = clamp(1 - Math.abs((comp.GLA - subject.gla) / Math.max(1,subject.gla)), 0, 1);

  // Age similarity: 1 - abs(year diff)/AGE_BAND_YEARS, clipped [0,1]
  const ageSim = clamp(1 - Math.abs((comp.year_built - subject.yearBuilt) / AGE_BAND_YEARS), 0, 1);

  // Location: exact community = 1.0; using calculated distance now that Lat/Lon are available
  let locSim = 0.4;
  if (sameCommunity(comp.community, subject.community)) locSim = 1.0;
  else {
    const d = distanceKm(comp.location, subject.location); 
    if (d <= 1) locSim = 0.85;
    else if (d <= 3) locSim = 0.65;
    else locSim = 0.4;
  }

  // Recency: for sold comps use 1 - (days/RECENT_DAYS) clipped [0,1]; for pending use same with list_date
  const days = daysBetween(comp.sale_date || comp.list_date, new Date());
  const recSim = clamp(1 - (days / RECENT_DAYS), 0, 1);

  // Weighted sum
  const rawScore =
    WEIGHT_COMPONENTS.size * sizeSim +
    WEIGHT_COMPONENTS.age * ageSim +
    WEIGHT_COMPONENTS.location * locSim +
    WEIGHT_COMPONENTS.recency * recSim;

  // rawScore now in [0,1] approximately. Return as weight factor (to be normalized by caller)
  return { rawScore, comps: {sizeSim, ageSim, locSim, recSim} };
}

// -----------------------------
// 7) RECONCILE / VALUATION
// -----------------------------
export function reconcileValue(processedComps, marketAdjustmentPct=0) {
  // processedComps: [{ MLS_ID, adjustedPrice, weight (rawScore normalized later) } ...]
  // First normalize weights so sum=1
  const rawScores = processedComps.map(c => c.rawScore || c.weight || 1);
  const totalRaw = rawScores.reduce((s,v)=>s+v,0) || 1;
  processedComps.forEach((c, idx) => {
    c.normalizedWeight = rawScores[idx] / totalRaw;
  });

  // Weighted average adjustedPrice
  const weightedAvg = processedComps.reduce((s,c) => s + (c.adjustedPrice * c.normalizedWeight), 0);

  // apply marketAdjustmentPct (e.g., +0.03 for seller market)
  const adjustedForMarket = weightedAvg * (1 + marketAdjustmentPct);

  const low = Math.round(adjustedForMarket * 0.90);
  const mid = Math.round(adjustedForMarket);
  const high = Math.round(adjustedForMarket * 1.10);

  // recommended_list_price: prefer high if seller market, mid if balanced, slight under high if active comps priced high
  const recommended = Math.round(adjustedForMarket * (marketAdjustmentPct > 0 ? 1.02 : 1.0));

  return { low, mid, high, recommended, weightedAvg: Math.round(weightedAvg) };
}

// -----------------------------
// 8) MARKET ABSORPTION / MOI
// -----------------------------
export function computeMOI(listings, cityFilter=null) {
  // listings is entire listing list for area (not only comps)
  const now = new Date();

  // active in last 30 days
  const active30 = listings.filter(l => (l.status || "").toLowerCase() === "active" && daysBetween(l.list_date || l.modified_date || now, now) <= 30 && (!cityFilter || l.city === cityFilter));

  // sold (closed) in last 90 days -> get average monthly sold = sold_count / 3
  // Check for both "sold" and "closed"
  const actualSold90 = listings.filter(l => 
    ((l.status || "").toLowerCase() === "sold" || (l.status || "").toLowerCase() === "closed") && 
    daysBetween(l.sale_date, now) <= 90 && 
    (!cityFilter || l.city === cityFilter)
  );
  
  const avgMonthlySold = (actualSold90.length / 3) || 0.01; // avoid division by zero

  const MOI = active30.length / avgMonthlySold;

  // market type & pct adjustment
  let marketType = "Balanced", marketAdj = 0;
  if (MOI < MOI_SELLER_THRESHOLD) { marketType = "Seller"; marketAdj = MOI_ADJUSTMENT_PCT; }
  else if (MOI <= MOI_BALANCED_THRESHOLD) { marketType = "Balanced"; marketAdj = 0; }
  else { marketType = "Buyer"; marketAdj = -MOI_ADJUSTMENT_PCT; }

  return { MOI: Number(MOI.toFixed(2)), marketType, marketAdj, active30: active30.length, avgMonthlySold: Number(avgMonthlySold.toFixed(2)) };
}

// -----------------------------
// 9) FULL PIPELINE: `runCMA`
// -----------------------------
export async function runCMA({ subject, allListings, HPI, subjectMonthYYYYMM }) {
  // allListings: full normalized listing list (must include closed,pending,active).

  // 1) market segmentation -> candidate pool
  const candidates = segmentMarket(subject, allListings);

  // 2) select comparables (only closed/pending matching filters)
  let comps = selectComparables(subject, candidates);

  // 3) clean data
  comps = cleanData(comps);

  // Fallback: if not enough comps, you need to re-fetch with a broader query.
  // Since we can't re-fetch here, we'll log a warning.
  if (comps.length < MIN_COMPS) {
    console.warn(`⚠️ Warning: Only ${comps.length} comps found. Minimum is ${MIN_COMPS}. CMA result may be unreliable.`);
  }

  // 4) compute MOI on allListings
  const marketContext = computeMOI(allListings, subject.city);

  // 5) For each comp, time adjust & feature adjust & compute weight
  const processed = comps.map(c => {
    const { adjustedPrice: timeAdjPrice, timeAdjPct } = applyTimeAdjustment(c, subjectMonthYYYYMM, HPI);
    const { totalAdjustment, adjDetails, rawTotalAdjustment } = computeFeatureAdjustment(c, subject);

    // final adjusted price = timeAdjPrice + totalFeatureAdj
    const adjustedPrice = Math.round(timeAdjPrice + totalAdjustment);

    const { rawScore, comps: simComps } = computeWeight(c, subject);

    return {
      MLS_ID: c.MLS_ID,
      comp: c,
      sale_price: c.price,
      sale_date: c.sale_date,
      timeAdjPct,
      timeAdjPrice: Math.round(timeAdjPrice),
      rawFeatureAdjustment: rawTotalAdjustment,
      totalFeatureAdjustment: totalAdjustment,
      adjDetails,
      adjustedPrice,
      rawScore,
      simComps
    };
  });

  // 6) remove any comps with missing adjustedPrice or negative weirdness
  const validProcessed = processed.filter(p => Number.isFinite(p.adjustedPrice) && p.adjustedPrice > 1000);

  // 7) reconcile value
  const valuation = reconcileValue(validProcessed, marketContext.marketAdj);

  // 8) prepare JSON output
  const compsUsed = validProcessed.map(p => ({
    MLS_ID: p.MLS_ID,
    sale_price: p.sale_price,
    sale_date: p.sale_date,
    timeAdjPct: p.timeAdjPct,
    timeAdjPrice: p.timeAdjPrice,
    totalFeatureAdjustment: p.totalFeatureAdjustment,
    adjustedPrice: p.adjustedPrice,
    rawScore: p.rawScore,
    normalizedWeight: p.normalizedWeight || null,
    adjDetails: p.adjDetails
  }));

  const output = {
    subject,
    comps_used: compsUsed,
    valuation,
    market_context: marketContext,
    metadata: {
      recency_days_limit: RECENT_DAYS,
      gla_band_pct: GLA_BAND,
      age_band_years: AGE_BAND_YEARS
    }
  };

  return output;
}
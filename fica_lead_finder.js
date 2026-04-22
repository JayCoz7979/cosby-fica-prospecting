/**
 * fica_lead_finder.js
 * Uses Google Maps Places API to find hospitality/food-service businesses
 * with tipped employees that qualify for the FICA Tip Credit (Section 45B).
 * Schedule: 8:00 AM UTC daily via Railway cron.
 *
 * NOTE: OUTREACH_ENABLED does NOT block lead finding.
 * It only controls outreach agents (email, calls, SMS).
 * The finder always runs to build the lead pipeline.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!GOOGLE_MAPS_API_KEY) {
  console.error('[finder] GOOGLE_MAPS_API_KEY is required');
  process.exit(1);
}

// Primary targets: businesses with tipped employees (FICA Tip Credit eligible)
const TARGET_SEARCHES = [
  { type: 'restaurant',    keyword: 'full service restaurant',  city: 'Birmingham',   state: 'Alabama',     industry: 'full-service restaurant' },
  { type: 'restaurant',    keyword: 'full service restaurant',  city: 'Nashville',    state: 'Tennessee',   industry: 'full-service restaurant' },
  { type: 'restaurant',    keyword: 'full service restaurant',  city: 'Atlanta',      state: 'Georgia',     industry: 'full-service restaurant' },
  { type: 'restaurant',    keyword: 'full service restaurant',  city: 'Jackson',      state: 'Mississippi', industry: 'full-service restaurant' },
  { type: 'bar',           keyword: 'bar nightclub',            city: 'Huntsville',   state: 'Alabama',     industry: 'bar and nightclub'       },
  { type: 'bar',           keyword: 'bar nightclub',            city: 'Memphis',      state: 'Tennessee',   industry: 'bar and nightclub'       },
  { type: 'bar',           keyword: 'bar nightclub',            city: 'Savannah',     state: 'Georgia',     industry: 'bar and nightclub'       },
  { type: 'bar',           keyword: 'bar nightclub',            city: 'Biloxi',       state: 'Mississippi', industry: 'bar and nightclub'       },
  { type: 'lodging',       keyword: 'hotel resort',             city: 'Montgomery',   state: 'Alabama',     industry: 'hotel and resort'        },
  { type: 'lodging',       keyword: 'hotel resort',             city: 'Knoxville',    state: 'Tennessee',   industry: 'hotel and resort'        },
  { type: 'lodging',       keyword: 'hotel resort',             city: 'Augusta',      state: 'Georgia',     industry: 'hotel and resort'        },
  { type: 'lodging',       keyword: 'hotel resort',             city: 'Gulfport',     state: 'Mississippi', industry: 'hotel and resort'        },
  { type: 'meal_catering', keyword: 'catering company',         city: 'Tuscaloosa',   state: 'Alabama',     industry: 'catering company'        },
  { type: 'meal_catering', keyword: 'catering company',         city: 'Chattanooga',  state: 'Tennessee',   industry: 'catering company'        },
  { type: 'cafe',          keyword: 'coffee shop cafe',         city: 'Auburn',       state: 'Alabama',     industry: 'coffee shop and cafe'    },
  { type: 'cafe',          keyword: 'coffee shop cafe',         city: 'Murfreesboro', state: 'Tennessee',   industry: 'coffee shop and cafe'    },
  { type: 'restaurant',    keyword: 'full service restaurant',  city: 'Mobile',       state: 'Alabama',     industry: 'full-service restaurant' },
  { type: 'restaurant',    keyword: 'full service restaurant',  city: 'Clarksville',  state: 'Tennessee',   industry: 'full-service restaurant' },
  { type: 'bar',           keyword: 'bar nightclub',            city: 'Macon',        state: 'Georgia',     industry: 'bar and nightclub'       },
  { type: 'lodging',       keyword: 'hotel resort',             city: 'Hattiesburg',  state: 'Mississippi', industry: 'hotel and resort'        },
];

// ─── Geocode city to lat/lng ───────────────────────────────────────────────
async function geocodeCity(city, state) {
  const query = encodeURIComponent(`${city}, ${state}`);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${GOOGLE_MAPS_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' || !data.results.length) {
    throw new Error(`Geocode failed for ${city}, ${state}: ${data.status}`);
  }
  return data.results[0].geometry.location; // { lat, lng }
}

// ─── Search Places API ─────────────────────────────────────────────────────
async function searchPlaces(target) {
  console.log(`[finder] Searching: ${target.industry} in ${target.city}, ${target.state}`);

  const location = await geocodeCity(target.city, target.state);
  const query = encodeURIComponent(`${target.keyword} ${target.city} ${target.state}`);
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&location=${location.lat},${location.lng}&radius=30000&type=${target.type}&key=${GOOGLE_MAPS_API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Places API error: ${data.status} — ${data.error_message || ''}`);
  }

  const places = data.results || [];
  console.log(`[finder] Found ${places.length} places for ${target.industry}/${target.city}`);
  return places;
}

// ─── Get Place Details (phone, website) ───────────────────────────────────
async function getPlaceDetails(placeId) {
  const fields = 'name,formatted_phone_number,website,formatted_address,business_status';
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${GOOGLE_MAPS_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK') return null;
  return data.result;
}

// ─── Upsert Leads to Supabase ──────────────────────────────────────────────
async function upsertLeads(places, target) {
  if (!places.length) return 0;

  let saved = 0;
  let skipped = 0;

  for (const place of places.slice(0, 10)) {
    // Skip permanently closed
    if (place.business_status === 'CLOSED_PERMANENTLY') {
      skipped++;
      continue;
    }

    // Check for duplicates
    const { data: existing } = await supabase
      .from('fica_leads')
      .select('id')
      .eq('business_name', place.name)
      .eq('city', target.city)
      .eq('state', target.state)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    // Get phone and website from place details
    let phone = null;
    let website = null;
    try {
      const details = await getPlaceDetails(place.place_id);
      if (details) {
        phone = details.formatted_phone_number || null;
        website = details.website || null;
      }
    } catch (err) {
      console.log(`[finder] Could not get details for ${place.name}:`, err.message);
    }

    const { error } = await supabase.from('fica_leads').insert({
      business_name:  place.name,
      industry:       target.industry,
      city:           target.city,
      state:          target.state,
      phone:          phone,
      email:          null, // enriched separately by email enrichment agent
      website_url:    website,
      contact_name:   null,
      fica_score:     0,
      outreach_stage: 'new',
      source:         'google_maps',
    });

    if (error) {
      console.error(`[finder] Insert error for "${place.name}":`, error.message);
    } else {
      saved++;
      console.log(`[finder] Saved: ${place.name} (${target.city}, ${target.state}) | Phone: ${phone || 'none'} | Website: ${website || 'none'}`);
    }

    // Small delay to avoid rate limiting on details API
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`[finder] Saved ${saved} new, skipped ${skipped} (duplicates/closed)`);
  return saved;
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function run() {
  console.log('[finder] Starting fica_lead_finder (Google Maps) — ' + new Date().toISOString());

  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const target    = TARGET_SEARCHES[dayOfYear % TARGET_SEARCHES.length];

  console.log(`[finder] Today's target: ${target.industry} in ${target.city}, ${target.state}`);

  let places = [];
  try {
    places = await searchPlaces(target);
  } catch (err) {
    console.error('[finder] Error searching places:', err.message);
    process.exit(1);
  }

  const totalSaved = await upsertLeads(places, target);
  console.log(`[finder] Run complete — found ${places.length} places, saved ${totalSaved} new leads`);
}

run().catch((err) => {
  console.error('[finder] Fatal error:', err);
  process.exit(1);
});

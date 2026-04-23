/**
 * lead_finder_agent.js
 * Uses Google Maps Places API to find local businesses for B2B prospecting.
 * Replaces Claude web_search with Google Maps for lower cost and better data quality.
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
  console.error('Lead Finder: GOOGLE_MAPS_API_KEY is required');
  process.exit(1);
}

// Daily rotating targets — high-value industries for AI/website/automation offers
const TARGET_SEARCHES = [
  { type: 'dentist',              keyword: 'dental office',          city: 'Huntsville',   state: 'AL', industry: 'dental'           },
  { type: 'dentist',              keyword: 'dental office',          city: 'Birmingham',   state: 'AL', industry: 'dental'           },
  { type: 'general_contractor',   keyword: 'general contractor',     city: 'Huntsville',   state: 'AL', industry: 'contractor'       },
  { type: 'general_contractor',   keyword: 'general contractor',     city: 'Nashville',    state: 'TN', industry: 'contractor'       },
  { type: 'plumber',              keyword: 'plumbing company',       city: 'Huntsville',   state: 'AL', industry: 'plumbing'         },
  { type: 'electrician',          keyword: 'electrician',            city: 'Birmingham',   state: 'AL', industry: 'electrical'       },
  { type: 'roofing_contractor',   keyword: 'roofing company',        city: 'Huntsville',   state: 'AL', industry: 'roofing'          },
  { type: 'roofing_contractor',   keyword: 'roofing company',        city: 'Nashville',    state: 'TN', industry: 'roofing'          },
  { type: 'lawyer',               keyword: 'law firm attorney',      city: 'Huntsville',   state: 'AL', industry: 'legal'            },
  { type: 'lawyer',               keyword: 'law firm attorney',      city: 'Birmingham',   state: 'AL', industry: 'legal'            },
  { type: 'insurance_agency',     keyword: 'insurance agency',       city: 'Huntsville',   state: 'AL', industry: 'insurance'        },
  { type: 'real_estate_agency',   keyword: 'real estate agency',     city: 'Huntsville',   state: 'AL', industry: 'real estate'      },
  { type: 'real_estate_agency',   keyword: 'real estate agency',     city: 'Nashville',    state: 'TN', industry: 'real estate'      },
  { type: 'car_repair',           keyword: 'auto repair shop',       city: 'Huntsville',   state: 'AL', industry: 'auto repair'      },
  { type: 'car_repair',           keyword: 'auto repair shop',       city: 'Birmingham',   state: 'AL', industry: 'auto repair'      },
  { type: 'beauty_salon',         keyword: 'hair salon beauty',      city: 'Huntsville',   state: 'AL', industry: 'beauty salon'     },
  { type: 'spa',                  keyword: 'med spa wellness',       city: 'Nashville',    state: 'TN', industry: 'med spa'          },
  { type: 'gym',                  keyword: 'gym fitness center',     city: 'Huntsville',   state: 'AL', industry: 'fitness'          },
  { type: 'accounting',           keyword: 'accounting firm CPA',    city: 'Huntsville',   state: 'AL', industry: 'accounting'       },
  { type: 'moving_company',       keyword: 'moving company',         city: 'Huntsville',   state: 'AL', industry: 'moving'           },
  { type: 'pest_control',         keyword: 'pest control',           city: 'Birmingham',   state: 'AL', industry: 'pest control'     },
  { type: 'landscaper',           keyword: 'landscaping lawn care',  city: 'Huntsville',   state: 'AL', industry: 'landscaping'      },
  { type: 'hvac_contractor',      keyword: 'HVAC heating cooling',   city: 'Huntsville',   state: 'AL', industry: 'HVAC'             },
  { type: 'hvac_contractor',      keyword: 'HVAC heating cooling',   city: 'Nashville',    state: 'TN', industry: 'HVAC'             },
  { type: 'veterinary_care',      keyword: 'veterinary clinic',      city: 'Huntsville',   state: 'AL', industry: 'veterinary'       },
  { type: 'florist',              keyword: 'florist flower shop',    city: 'Birmingham',   state: 'AL', industry: 'florist'          },
  { type: 'photographer',         keyword: 'photography studio',     city: 'Nashville',    state: 'TN', industry: 'photography'      },
  { type: 'storage',              keyword: 'self storage facility',  city: 'Huntsville',   state: 'AL', industry: 'storage'          },
];

// High-value industries get priority website/AI offers
const HIGH_VALUE_INDUSTRIES = ['dental', 'legal', 'HVAC', 'contractor', 'roofing', 'med spa', 'accounting'];

// ─── Geocode city ──────────────────────────────────────────────────────────
async function geocodeCity(city, state) {
  const query = encodeURIComponent(`${city}, ${state}`);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${GOOGLE_MAPS_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' || !data.results.length) {
    throw new Error(`Geocode failed for ${city}, ${state}: ${data.status}`);
  }
  return data.results[0].geometry.location;
}

// ─── Search Places ─────────────────────────────────────────────────────────
async function searchPlaces(target) {
  console.log(`Lead Finder: Searching ${target.industry} in ${target.city}, ${target.state}`);

  const location = await geocodeCity(target.city, target.state);
  const query = encodeURIComponent(`${target.keyword} ${target.city} ${target.state}`);
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&location=${location.lat},${location.lng}&radius=30000&type=${target.type}&key=${GOOGLE_MAPS_API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Places API error: ${data.status} — ${data.error_message || ''}`);
  }

  const places = data.results || [];
  console.log(`Lead Finder: Found ${places.length} places`);
  return places;
}

// ─── Get Place Details ─────────────────────────────────────────────────────
async function getPlaceDetails(placeId) {
  const fields = 'name,formatted_phone_number,website,formatted_address,business_status';
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${GOOGLE_MAPS_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK') return null;
  return data.result;
}

// ─── Determine offer type ──────────────────────────────────────────────────
function getOfferType(industry, hasWebsite) {
  if (!hasWebsite) return 'website';
  if (HIGH_VALUE_INDUSTRIES.includes(industry)) return 'ai_assistant';
  return 'website_redesign';
}

// ─── Upsert Leads ──────────────────────────────────────────────────────────
async function upsertLeads(places, target) {
  if (!places.length) return 0;

  let saved = 0;
  let skipped = 0;

  for (const place of places.slice(0, 10)) {
    if (place.business_status === 'CLOSED_PERMANENTLY') {
      skipped++;
      continue;
    }

    // Check duplicates
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('business_name', place.name)
      .eq('city', target.city)
      .eq('state', target.state)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    // Get details
    let phone = null;
    let website = null;
    try {
      const details = await getPlaceDetails(place.place_id);
      if (details) {
        phone = details.formatted_phone_number || null;
        website = details.website || null;
      }
    } catch (err) {
      console.log(`Lead Finder: Could not get details for ${place.name}`);
    }

    const hasWebsite = !!website;
    const websiteQuality = hasWebsite ? 'unknown' : 'none';
    const offerType = getOfferType(target.industry, hasWebsite);

    // Pain score: no website = +3, high value industry = +2, has phone = +1
    let painScore = 1;
    if (!hasWebsite) painScore += 3;
    if (HIGH_VALUE_INDUSTRIES.includes(target.industry)) painScore += 2;
    if (phone) painScore += 1;
    painScore = Math.min(painScore, 10);

    const { error } = await supabase.from('leads').insert({
      business_name:   place.name,
      industry:        target.industry,
      city:            target.city,
      state:           target.state,
      phone:           phone,
      email:           null,
      website_url:     website,
      has_website:     hasWebsite,
      website_quality: websiteQuality,
      pain_score:      painScore,
      offer_type:      offerType,
      outreach_stage:  'new',
      source:          'google_maps',
    });

    if (error) {
      console.error(`Lead Finder: Insert error for "${place.name}": ${error.message}`);
    } else {
      saved++;
      console.log(`Lead Finder: Saved: ${place.name} | Score: ${painScore} | Offer: ${offerType} | Phone: ${phone || 'none'}`);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`Lead Finder: Saved ${saved} new, skipped ${skipped} (duplicates/closed)`);
  return saved;
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function findLeads() {
  console.log('Cosby AI Solutions - Lead Finder Agent (Google Maps)');
  console.log('=====================================================');

  // NOTE: OUTREACH_ENABLED does NOT block lead finding.
  // Only outreach agents (email, calls) check this flag.

  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const target = TARGET_SEARCHES[dayOfYear % TARGET_SEARCHES.length];

  console.log(`Lead Finder: Today's target: ${target.industry} in ${target.city}, ${target.state}`);

  let places = [];
  try {
    places = await searchPlaces(target);
  } catch (err) {
    console.error('Lead Finder: Error searching places:', err.message);
    process.exit(1);
  }

  const totalSaved = await upsertLeads(places, target);

  console.log('=====================================================');
  console.log(`Lead Finder: Done. Found ${places.length} places, saved ${totalSaved} new leads.`);
}

findLeads().catch(console.error);

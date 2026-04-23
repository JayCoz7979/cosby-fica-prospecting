/**
 * fica_lead_finder.js
 * Uses Google Maps Places API to find hospitality/food-service businesses
 * with tipped employees that qualify for the FICA Tip Credit (Section 45B).
 * Schedule: 8:00 AM UTC daily via Railway cron.
 *
 * Targets are stored in Supabase fica_search_targets table.
 * Super Bee manages and optimizes the target list weekly.
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

// ─── Get today's target from Supabase ─────────────────────────────────────
async function getTodaysTarget() {
  // Pull active targets ordered by priority then least recently run
  const { data: targets, error } = await supabase
    .from('fica_search_targets')
    .select('*')
    .eq('active', true)
    .order('priority', { ascending: true })
    .order('last_run_at', { ascending: true, nullsFirst: true })
    .limit(1);

  if (error) throw new Error(`Failed to fetch targets: ${error.message}`);
  if (!targets || targets.length === 0) throw new Error('No active targets found in fica_search_targets');

  return targets[0];
}

// ─── Update target stats after run ────────────────────────────────────────
async function updateTargetStats(targetId, leadsFound) {
  await supabase
    .from('fica_search_targets')
    .update({
      last_run_at: new Date().toISOString(),
      leads_found: supabase.rpc ? undefined : undefined, // incremented below
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetId);

  // Increment leads_found
  await supabase.rpc('increment_fica_target_leads', {
    target_id: targetId,
    increment_by: leadsFound,
  }).catch(() => {
    // RPC may not exist yet — update directly
    supabase.from('fica_search_targets')
      .update({ last_run_at: new Date().toISOString() })
      .eq('id', targetId);
  });
}

// ─── Geocode city to lat/lng ───────────────────────────────────────────────
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

// ─── Search Places API ─────────────────────────────────────────────────────
async function searchPlaces(target) {
  console.log(`[finder] Searching: ${target.industry} in ${target.city}, ${target.state}${target.email_only ? ' (email only)' : ''}`);

  const location = await geocodeCity(target.city, target.state);
  const query = encodeURIComponent(`${target.keyword} ${target.city} ${target.state}`);
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&location=${location.lat},${location.lng}&radius=30000&type=${target.place_type}&key=${GOOGLE_MAPS_API_KEY}`;

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
    if (place.business_status === 'CLOSED_PERMANENTLY') {
      skipped++;
      continue;
    }

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
      email:          null,
      website_url:    website,
      contact_name:   null,
      fica_score:     0,
      outreach_stage: target.email_only ? 'call_restricted' : 'new',
      source:         'google_maps',
    });

    if (error) {
      console.error(`[finder] Insert error for "${place.name}":`, error.message);
    } else {
      saved++;
      console.log(`[finder] Saved: ${place.name} (${target.city}, ${target.state}) | Phone: ${phone || 'none'} | Website: ${website || 'none'}${target.email_only ? ' | EMAIL ONLY' : ''}`);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`[finder] Saved ${saved} new, skipped ${skipped} (duplicates/closed)`);
  return saved;
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function run() {
  console.log('[finder] Starting fica_lead_finder (Google Maps + Supabase targets) — ' + new Date().toISOString());

  // Get today's target from Supabase
  let target;
  try {
    target = await getTodaysTarget();
    console.log(`[finder] Today's target: ${target.industry} in ${target.city}, ${target.state} (priority: ${target.priority})`);
  } catch (err) {
    console.error('[finder] Failed to get target:', err.message);
    process.exit(1);
  }

  let places = [];
  try {
    places = await searchPlaces(target);
  } catch (err) {
    console.error('[finder] Error searching places:', err.message);
    process.exit(1);
  }

  const totalSaved = await upsertLeads(places, target);

  // Update last_run_at on the target
  await supabase
    .from('fica_search_targets')
    .update({
      last_run_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', target.id);

  // Increment leads_found
  await supabase
    .from('fica_search_targets')
    .update({ leads_found: (target.leads_found || 0) + totalSaved })
    .eq('id', target.id);

  console.log(`[finder] Run complete — found ${places.length} places, saved ${totalSaved} new leads`);
  console.log(`[finder] Target stats updated for: ${target.city}, ${target.state}`);
}

run().catch((err) => {
  console.error('[finder] Fatal error:', err);
  process.exit(1);
});

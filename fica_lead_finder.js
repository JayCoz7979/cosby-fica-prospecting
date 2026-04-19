/**
 * fica_lead_finder.js
 * Uses Claude with web_search to find hospitality/food-service businesses
 * with tipped employees that likely qualify for the FICA Tip Credit (Section 45B).
 * Schedule: 8:00 AM UTC daily via Railway cron.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OUTREACH_ENABLED  = process.env.OUTREACH_ENABLED;

// Primary targets: businesses with tipped employees (FICA Tip Credit eligible)
const TARGET_SEARCHES = [
  { industry: 'full-service restaurant', state: 'Alabama',     city: 'Birmingham'   },
  { industry: 'full-service restaurant', state: 'Tennessee',   city: 'Nashville'    },
  { industry: 'full-service restaurant', state: 'Georgia',     city: 'Atlanta'      },
  { industry: 'full-service restaurant', state: 'Mississippi', city: 'Jackson'      },
  { industry: 'bar and nightclub',       state: 'Alabama',     city: 'Huntsville'   },
  { industry: 'bar and nightclub',       state: 'Tennessee',   city: 'Memphis'      },
  { industry: 'bar and nightclub',       state: 'Georgia',     city: 'Savannah'     },
  { industry: 'bar and nightclub',       state: 'Mississippi', city: 'Biloxi'       },
  { industry: 'hotel and resort',        state: 'Alabama',     city: 'Montgomery'   },
  { industry: 'hotel and resort',        state: 'Tennessee',   city: 'Knoxville'    },
  { industry: 'hotel and resort',        state: 'Georgia',     city: 'Augusta'      },
  { industry: 'hotel and resort',        state: 'Mississippi', city: 'Gulfport'     },
  { industry: 'catering company',        state: 'Alabama',     city: 'Tuscaloosa'   },
  { industry: 'catering company',        state: 'Tennessee',   city: 'Chattanooga'  },
  { industry: 'coffee shop and cafe',    state: 'Alabama',     city: 'Auburn'       },
  { industry: 'coffee shop and cafe',    state: 'Tennessee',   city: 'Murfreesboro' },
  { industry: 'full-service restaurant', state: 'Alabama',     city: 'Mobile'       },
  { industry: 'full-service restaurant', state: 'Tennessee',   city: 'Clarksville'  },
  { industry: 'bar and nightclub',       state: 'Georgia',     city: 'Macon'        },
  { industry: 'hotel and resort',        state: 'Mississippi', city: 'Hattiesburg'  },
];

async function searchLeads(target) {
  console.log(`[finder] Searching: ${target.industry} in ${target.city}, ${target.state}`);

  const prompt = `You are a B2B lead researcher finding hospitality and food-service businesses that have tipped employees and likely qualify for the FICA Tip Credit (Section 45B tax credit).

Use web_search to find REAL ${target.industry} businesses in ${target.city}, ${target.state} with 10-500 employees that are currently operating.

Search for:
- "${target.industry} ${target.city} ${target.state}"
- "${target.industry} owner ${target.city} ${target.state} contact"
- "${target.industry} ${target.city} ${target.state} employees"

Return ONLY a JSON array, no other text:
[{
  "business_name": "",
  "industry": "${target.industry}",
  "city": "${target.city}",
  "state": "${target.state}",
  "phone": "",
  "email": "",
  "website_url": "",
  "employee_count": "",
  "founded_year": "",
  "contact_name": "",
  "source": ""
}]

Rules:
- Only real, verifiable businesses that are currently operating
- Must be in the hospitality/food-service industry with employees who receive tips
- Include any phone/email/contact info you can find
- Min 3, max 10 results
- If you cannot verify a field, leave it as empty string ""`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error('Claude API error: ' + err);
  }

  const data = await response.json();

  let fullText = '';
  for (const block of data.content) {
    if (block.type === 'text') fullText += block.text;
  }

  let leads = [];
  try {
    const jsonMatch = fullText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array found in response');
    leads = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error(`[finder] Failed to parse response for ${target.city}:`, err.message);
    console.error('[finder] Raw response snippet:', fullText.slice(0, 300));
    return [];
  }

  console.log(`[finder] Found ${leads.length} leads for ${target.industry}/${target.city}`);
  return leads;
}

async function upsertLeads(leads) {
  if (!leads.length) return 0;

  let saved   = 0;
  let skipped = 0;

  for (const lead of leads) {
    if (!lead.business_name) {
      skipped++;
      continue;
    }

    const { data: existing } = await supabase
      .from('fica_leads')
      .select('id')
      .eq('business_name', lead.business_name)
      .eq('city', lead.city || '')
      .eq('state', lead.state || '')
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const { error } = await supabase.from('fica_leads').insert({
      business_name:  lead.business_name,
      industry:       lead.industry || null,
      city:           lead.city || null,
      state:          lead.state || null,
      phone:          lead.phone || null,
      email:          lead.email || null,
      website_url:    lead.website_url || null,
      employee_count: lead.employee_count || null,
      founded_year:   lead.founded_year || null,
      contact_name:   lead.contact_name || null,
      fica_score:     0,
      outreach_stage: 'new',
      source:         lead.source || 'claude_web_search',
    });

    if (error) {
      console.error(`[finder] Insert error for "${lead.business_name}":`, error.message);
    } else {
      saved++;
      console.log(`[finder] Saved: ${lead.business_name} (${lead.city}, ${lead.state})`);
    }
  }

  console.log(`[finder] Saved ${saved} new, skipped ${skipped} (duplicates or invalid)`);
  return saved;
}

async function run() {
  console.log('[finder] Starting fica_lead_finder — ' + new Date().toISOString());

  if (OUTREACH_ENABLED !== 'true') {
    console.log('[finder] OUTREACH_ENABLED is not "true" — skipping lead finder.');
    process.exit(0);
  }

  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const target    = TARGET_SEARCHES[dayOfYear % TARGET_SEARCHES.length];

  console.log(`[finder] Today's target: ${target.industry} in ${target.city}, ${target.state}`);

  let leads = [];
  try {
    leads = await searchLeads(target);
  } catch (err) {
    console.error('[finder] Error searching leads:', err.message);
  }

  const totalSaved = await upsertLeads(leads);
  console.log(`[finder] Run complete — found ${leads.length} total, saved ${totalSaved} new leads`);
}

run().catch((err) => {
  console.error('[finder] Fatal error:', err);
  process.exit(1);
});

/**
 * fica-scorer service
 * Scores FICA Tip Credit leads 1-10 based on employee count, industry, and contact info.
 * Schedule: 8:15 AM UTC daily via Railway cron.
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   OUTREACH_ENABLED=true
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const OUTREACH_ENABLED = process.env.OUTREACH_ENABLED;

const INDUSTRY_SCORES = {
  'full-service restaurant': 4,
  'restaurant':              4,
  'bar and nightclub':       4,
  'bar':                     4,
  'nightclub':               4,
  'hotel and resort':        3,
  'hotel':                   3,
  'resort':                  3,
  'catering company':        3,
  'catering':                3,
  'coffee shop and cafe':    2,
  'coffee shop':             2,
  'cafe':                    2,
  'hospitality':             2,
};

function scoreEmployeeCount(str) {
  if (!str) return 0;
  const nums = str.replace(/,/g, '').match(/\d+/g);
  if (!nums) return 0;
  const count = Math.max(...nums.map(Number));
  if (count >= 200) return 4;
  if (count >= 100) return 3;
  if (count >= 50)  return 2;
  if (count >= 10)  return 1;
  return 0;
}

function scoreIndustry(industry) {
  if (!industry) return 1;
  const norm = industry.toLowerCase().trim();
  if (INDUSTRY_SCORES[norm] !== undefined) return INDUSTRY_SCORES[norm];
  for (const [key, score] of Object.entries(INDUSTRY_SCORES)) {
    if (norm.includes(key) || key.includes(norm)) return score;
  }
  return 1;
}

function scoreContact(lead) {
  let score = 0;
  if (lead.phone && lead.phone.trim().length >= 7) score++;
  if (lead.email && lead.email.includes('@'))       score++;
  return score;
}

function calculateScore(lead) {
  const total = scoreEmployeeCount(lead.employee_count) + scoreIndustry(lead.industry) + scoreContact(lead);
  return Math.min(10, Math.max(1, total));
}

async function run() {
  console.log('[scorer] Starting — ' + new Date().toISOString());

  if (OUTREACH_ENABLED !== 'true') {
    console.log('[scorer] OUTREACH_ENABLED is not "true" — exiting.');
    process.exit(0);
  }

  const { data: leads, error } = await supabase
    .from('fica_leads')
    .select('*')
    .eq('fica_score', 0)
    .eq('outreach_stage', 'new');

  if (error) {
    console.error('[scorer] Failed to fetch unscored leads:', error.message);
    process.exit(1);
  }

  if (!leads || leads.length === 0) {
    console.log('[scorer] No unscored leads — done');
    process.exit(0);
  }

  console.log(`[scorer] Scoring ${leads.length} leads`);
  let scored = 0;

  for (const lead of leads) {
    const score = calculateScore(lead);
    const { error: updateErr } = await supabase
      .from('fica_leads')
      .update({ fica_score: score })
      .eq('id', lead.id);

    if (updateErr) {
      console.error(`[scorer] Update error for "${lead.business_name}":`, updateErr.message);
    } else {
      scored++;
      console.log(`[scorer] ${lead.business_name} → ${score}/10`);
    }
  }

  console.log(`[scorer] Complete — scored ${scored} leads`);
}

run().catch((err) => {
  console.error('[scorer] Fatal error:', err);
  process.exit(1);
});

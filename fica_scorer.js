/**
 * fica_scorer.js
 * Scores FICA Tip Credit leads 1-10 based on:
 *   - Employee count (more tipped employees = larger credit)
 *   - Industry (tip-heavy industries score highest)
 *   - Has phone (+1)
 *   - Has email (+1)
 * Schedule: 8:15 AM UTC daily via Railway cron.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Industries ranked by volume of tipped employees — directly impacts credit size
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

function scoreEmployeeCount(employeeCountStr) {
  if (!employeeCountStr) return 0;

  const raw     = employeeCountStr.replace(/,/g, '').toLowerCase();
  const numbers = raw.match(/\d+/g);
  if (!numbers || numbers.length === 0) return 0;

  const count = Math.max(...numbers.map(Number));

  // More employees = more tipped workers = larger FICA Tip Credit
  if (count >= 200) return 4;
  if (count >= 100) return 3;
  if (count >= 50)  return 2;
  if (count >= 10)  return 1;
  return 0;
}

function scoreIndustry(industry) {
  if (!industry) return 1;
  const normalized = industry.toLowerCase().trim();

  // Exact match first
  if (INDUSTRY_SCORES[normalized] !== undefined) return INDUSTRY_SCORES[normalized];

  // Partial match
  for (const [key, score] of Object.entries(INDUSTRY_SCORES)) {
    if (normalized.includes(key) || key.includes(normalized)) return score;
  }

  return 1;
}

function scoreContactInfo(lead) {
  let score = 0;
  if (lead.phone && lead.phone.trim().length >= 7) score += 1;
  if (lead.email && lead.email.includes('@'))       score += 1;
  return score;
}

function calculateScore(lead) {
  const employeeScore = scoreEmployeeCount(lead.employee_count);
  const industryScore = scoreIndustry(lead.industry);
  const contactScore  = scoreContactInfo(lead);

  const total = employeeScore + industryScore + contactScore;
  return Math.min(10, Math.max(1, total));
}

async function scoreUnscored() {
  const { data: leads, error } = await supabase
    .from('fica_leads')
    .select('*')
    .eq('fica_score', 0)
    .eq('outreach_stage', 'new');

  if (error) {
    throw new Error(`Failed to fetch unscored leads: ${error.message}`);
  }

  if (!leads || leads.length === 0) {
    console.log('[scorer] No unscored leads found');
    return 0;
  }

  console.log(`[scorer] Scoring ${leads.length} unscored leads`);
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
      console.log(
        `[scorer] ${lead.business_name} → score ${score}/10` +
        ` (emp: ${lead.employee_count || 'N/A'}, industry: ${lead.industry || 'N/A'})`
      );
    }
  }

  console.log(`[scorer] Scored ${scored} leads`);
  return scored;
}

async function run() {
  console.log('[scorer] Starting fica_scorer — ' + new Date().toISOString());

  try {
    const scored = await scoreUnscored();
    console.log(`[scorer] Complete — scored ${scored} leads`);
  } catch (err) {
    console.error('[scorer] Fatal error:', err.message);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('[scorer] Unhandled error:', err);
  process.exit(1);
});

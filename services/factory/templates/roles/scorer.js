/**
 * {PROJECT_NAME} - Scorer Service
 * Scores/rates leads on quality and fit
 *
 * Schedule: Daily at 8:15 AM UTC (configurable via railway.toml)
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   SCORER_ENABLED (true/false kill-switch)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SCORER_ENABLED = process.env.SCORER_ENABLED !== 'false';
const TABLE_NAME = '{PROJECT_SLUG}_leads';
const SCORE_RULES = {
  industry: { restaurant: 4, bar: 4, hotel: 3, cafe: 2, other: 1 },
  employees: { '200+': 4, '100+': 3, '50+': 2, '<50': 1 },
  contact: { phone_and_email: 2, phone_or_email: 1, none: 0 }
};

async function runScorer() {
  console.log('[{SERVICE_NAME}] Starting scorer — ' + new Date().toISOString());

  if (!SCORER_ENABLED) {
    console.log('[{SERVICE_NAME}] Scorer disabled');
    process.exit(0);
  }

  try {
    // Fetch unscored leads
    const { data: leads, error } = await supabase
      .from(TABLE_NAME)
      .select()
      .eq('fica_score', 0)
      .eq('outreach_stage', 'new')
      .limit(100);

    if (error) throw error;

    let scoredCount = 0;

    for (const lead of leads) {
      const score = calculateScore(lead);

      const { error: updateError } = await supabase
        .from(TABLE_NAME)
        .update({ fica_score: score })
        .eq('id', lead.id);

      if (updateError) {
        console.error('[{SERVICE_NAME}] Update error:', updateError);
        continue;
      }

      scoredCount++;
    }

    console.log('[{SERVICE_NAME}] Scored ' + scoredCount + ' leads');
    console.log('[{SERVICE_NAME}] Complete');

  } catch (err) {
    console.error('[{SERVICE_NAME}] Error:', err.message);
    process.exit(1);
  }
}

function calculateScore(lead) {
  let score = 0;

  // Industry score
  const industryScore = SCORE_RULES.industry[lead.industry?.toLowerCase()] || 1;
  score += industryScore;

  // Employee count score
  const empCount = lead.employee_count || 0;
  let empScore = 1;
  if (empCount >= 200) empScore = 4;
  else if (empCount >= 100) empScore = 3;
  else if (empCount >= 50) empScore = 2;
  score += empScore;

  // Contact info bonus
  const hasPhone = !!lead.phone;
  const hasEmail = !!lead.email;
  if (hasPhone && hasEmail) score += 2;
  else if (hasPhone || hasEmail) score += 1;

  // Cap at 10
  return Math.min(score, 10);
}

runScorer().catch(err => {
  console.error('[{SERVICE_NAME}] Fatal error:', err);
  process.exit(1);
});

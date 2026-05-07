/**
 * scorer_agent.js — Cosby AI Solutions B2B Lead Scorer
 *
 * Agentic architecture:
 * - Uses Claude to score each lead instead of static rules
 * - Analyzes website quality, industry value, phone presence, location
 * - Assigns offer type and detailed pain points
 * - Batches leads for efficiency (10 at a time via Claude)
 * - Telegram summary on completion
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const supabase  = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.COSBY_AI_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
const OUTREACH_ENABLED   = process.env.OUTREACH_ENABLED === 'true';

const BATCH_SIZE   = 15;  // leads scored per Claude call
const MAX_RETRIES  = 3;
const RETRY_BASE   = 2000;

// ─── Helpers ──────────────────────────────────────────────────────────────

async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' }),
    });
  } catch (err) {
    console.error('[scorer] Telegram error:', err.message);
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Score a batch of leads with Claude ───────────────────────────────────

async function scoreBatch(leads, attempt = 1) {
  const leadList = leads.map((l, i) =>
    `${i + 1}. ${l.business_name} | ${l.industry} | ${l.city}, ${l.state} | ` +
    `Phone: ${l.phone || 'none'} | Website: ${l.website_url || 'NONE'} | ` +
    `Website quality: ${l.website_quality || 'unknown'}`
  ).join('\n');

  const prompt = `You are a B2B sales scoring agent for Cosby AI Solutions. We sell websites, AI assistants, and automation to local businesses.

Score each of these ${leads.length} leads. For each lead assign:

pain_score: 1-10
  10 = no website + high-value industry + has phone
  7-9 = outdated/poor website + valuable industry
  4-6 = decent website but needs AI/automation
  1-3 = strong digital presence, low urgency

offer_type:
  "website" = no website
  "website_redesign" = has website but poor/outdated
  "ai_assistant" = decent site, needs AI chatbot or booking
  "full_package" = needs website + AI + automation

HIGH VALUE industries (score higher): dental, medical, law, contractor, roofing, plumbing, hvac, auto repair, real estate, insurance, landscaping, pest control

LEADS:
${leadList}

Return ONLY a JSON array with exactly ${leads.length} objects in the same order:
[{"pain_score": 7, "offer_type": "website", "notes": "one sentence sales insight"}, ...]

No markdown, no explanation. Start with [ end with ].`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content.find(b => b.type === 'text')?.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array in response');
    const results = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(results) || results.length !== leads.length) {
      throw new Error(`Expected ${leads.length} results, got ${results?.length}`);
    }
    return results;
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_BASE * Math.pow(2, attempt - 1));
      return scoreBatch(leads, attempt + 1);
    }
    throw err;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('[scorer] Starting scorer_agent (agentic) — ' + new Date().toISOString());

  if (!OUTREACH_ENABLED) {
    console.log('[scorer] Note: OUTREACH_ENABLED is false — scorer still runs.');
  }

  // Fetch unscored leads
  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .or('pain_score.is.null,pain_score.eq.0')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('[scorer] DB error:', error.message);
    await sendTelegram(`🚨 *B2B Scorer* — DB error: ${error.message}`);
    return;
  }

  if (!leads || leads.length === 0) {
    console.log('[scorer] No unscored leads.');
    return;
  }

  console.log(`[scorer] Scoring ${leads.length} leads in batches of ${BATCH_SIZE}`);

  let updated = 0;
  let highPriority = 0;

  // Process in batches
  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    console.log(`[scorer] Batch ${Math.floor(i / BATCH_SIZE) + 1}: scoring ${batch.length} leads`);

    let scores;
    try {
      scores = await scoreBatch(batch);
    } catch (err) {
      console.error(`[scorer] Batch scoring failed: ${err.message}`);
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      const lead  = batch[j];
      const score = scores[j];

      if (!score) continue;

      const painScore = Math.max(1, Math.min(10, parseInt(score.pain_score) || 3));
      const offerType = score.offer_type || 'ai_assistant';
      const notes     = score.notes || null;

      const { error: updateError } = await supabase
        .from('leads')
        .update({
          pain_score:  painScore,
          offer_type:  offerType,
          notes:       notes,
          updated_at:  new Date().toISOString(),
        })
        .eq('id', lead.id);

      if (!updateError) {
        updated++;
        if (painScore >= 7) highPriority++;
        console.log(`[scorer] ✅ ${lead.business_name} → Score: ${painScore} | ${offerType}`);
      }
    }

    await sleep(1000);
  }

  // Fetch top 10 for Telegram report
  const { data: topLeads } = await supabase
    .from('leads')
    .select('business_name, industry, city, state, pain_score, offer_type, phone')
    .gte('pain_score', 1)
    .eq('outreach_stage', 'new')
    .order('pain_score', { ascending: false })
    .limit(10);

  const topList = (topLeads || [])
    .map((l, i) => `${i + 1}. *${l.business_name}* (${l.city}, ${l.state}) — Score: ${l.pain_score} | ${l.offer_type}`)
    .join('\n');

  console.log(`[scorer] Complete — scored: ${updated}, high priority: ${highPriority}`);

  await sendTelegram(
    `🎯 *B2B Scorer Complete*\n\n` +
    `📋 Scored: ${updated}\n` +
    `🔥 High Priority (7+): ${highPriority}\n\n` +
    (topList ? `*Top 10 Leads:*\n${topList}` : '')
  );
}

main().catch(async (err) => {
  console.error('[scorer] Fatal:', err);
  await sendTelegram(`🚨 *B2B Scorer CRASHED*\n\`${err.message}\``);
  process.exit(1);
});

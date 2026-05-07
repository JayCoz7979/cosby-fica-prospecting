/**
 * fica_email_enrichment.js
 * Agentic email finder for FICA Tip Credit leads.
 * 4-strategy waterfall: website → directory → social → pattern
 * Replaces Hunter.io — no limits, no cost.
 * Schedule: runs daily via Railway cron after fica_lead_finder.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { realtime: { transport: ws } }
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.FICA_ALERTS_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
const BATCH_SIZE         = 20;

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
    console.error('[fica-email] Telegram error:', err.message);
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractDomain(websiteUrl) {
  try {
    const url = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
    return url.hostname.replace('www.', '');
  } catch {
    return null;
  }
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const regex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  if (!regex.test(email)) return false;
  const junk = ['example.com', 'test.com', 'email.com', 'domain.com', 'yourcompany.com', 'gmail.com', 'yahoo.com', 'hotmail.com'];
  const domain = email.split('@')[1];
  if (junk.includes(domain)) return false;
  return true;
}

// ─── Strategy 1: Website scrape via Claude + web search ───────────────────

async function strategyWebsite(lead) {
  if (!lead.website_url) return null;
  const domain = extractDomain(lead.website_url);
  if (!domain) return null;

  const prompt = `You are an email research specialist. Find the real contact email for this business.

Business: ${lead.business_name}
Industry: ${lead.industry}
Location: ${lead.city}, ${lead.state}
Website: ${lead.website_url}
Domain: ${domain}

Search their website for a contact email. Check: contact page, about page, footer, staff directory.
Also check for any email addresses on the domain ${domain}.

Return ONLY valid JSON:
{
  "email": "found@email.com or null",
  "confidence": "high|medium|low",
  "source": "where you found it"
}

Return ONLY JSON. No explanation.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    });

    let text = '';
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
    }
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    const result = JSON.parse(match[0]);
    return isValidEmail(result.email) ? { ...result, strategy: 'website' } : null;
  } catch (err) {
    console.warn(`[fica-email] Strategy 1 failed for ${lead.business_name}:`, err.message);
    return null;
  }
}

// ─── Strategy 2: Directory search (Yelp, Google Business, BBB) ───────────

async function strategyDirectory(lead) {
  const prompt = `You are an email research specialist. Find the contact email for this business using online directories.

Business: ${lead.business_name}
Industry: ${lead.industry}
Location: ${lead.city}, ${lead.state}
Phone: ${lead.phone || 'unknown'}

Search these sources:
1. Yelp listing for ${lead.business_name} in ${lead.city}, ${lead.state}
2. Google Business Profile
3. BBB (Better Business Bureau)
4. Any local directory listing

Return ONLY valid JSON:
{
  "email": "found@email.com or null",
  "confidence": "high|medium|low",
  "source": "where you found it"
}

Return ONLY JSON. No explanation.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    });

    let text = '';
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
    }
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    const result = JSON.parse(match[0]);
    return isValidEmail(result.email) ? { ...result, strategy: 'directory' } : null;
  } catch (err) {
    console.warn(`[fica-email] Strategy 2 failed for ${lead.business_name}:`, err.message);
    return null;
  }
}

// ─── Strategy 3: Social media search ──────────────────────────────────────

async function strategySocial(lead) {
  const prompt = `You are an email research specialist. Find the contact email for this business using social media.

Business: ${lead.business_name}
Industry: ${lead.industry}
Location: ${lead.city}, ${lead.state}

Search:
1. Facebook business page for ${lead.business_name} in ${lead.city}
2. Instagram bio or contact info
3. LinkedIn company page
4. Any social media mention of their email

Return ONLY valid JSON:
{
  "email": "found@email.com or null",
  "confidence": "high|medium|low",
  "source": "where you found it"
}

Return ONLY JSON. No explanation.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    });

    let text = '';
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
    }
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    const result = JSON.parse(match[0]);
    return isValidEmail(result.email) ? { ...result, strategy: 'social' } : null;
  } catch (err) {
    console.warn(`[fica-email] Strategy 3 failed for ${lead.business_name}:`, err.message);
    return null;
  }
}

// ─── Strategy 4: Pattern generation + validation ──────────────────────────

async function strategyPattern(lead) {
  if (!lead.website_url) return null;
  const domain = extractDomain(lead.website_url);
  if (!domain) return null;

  const prompt = `You are an email research specialist. Generate and validate likely email addresses for this business.

Business: ${lead.business_name}
Domain: ${domain}
Industry: ${lead.industry}
Location: ${lead.city}, ${lead.state}

Common patterns to try: info@, contact@, hello@, manager@, owner@, admin@
Search the web to verify which of these patterns actually exists and receives mail for domain ${domain}.

Return ONLY valid JSON:
{
  "email": "most likely valid email or null",
  "confidence": "high|medium|low",
  "source": "pattern validation"
}

Return ONLY JSON. No explanation.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    });

    let text = '';
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
    }
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    const result = JSON.parse(match[0]);
    return isValidEmail(result.email) ? { ...result, strategy: 'pattern' } : null;
  } catch (err) {
    console.warn(`[fica-email] Strategy 4 failed for ${lead.business_name}:`, err.message);
    return null;
  }
}

// ─── Run all 4 strategies in waterfall ────────────────────────────────────

async function findEmail(lead) {
  const strategies = [strategyWebsite, strategyDirectory, strategySocial, strategyPattern];
  const names = ['website', 'directory', 'social', 'pattern'];

  for (let i = 0; i < strategies.length; i++) {
    const result = await strategies[i](lead);
    if (result && result.email) {
      console.log(`[fica-email] ✅ ${lead.business_name} → ${result.email} (${names[i]}, ${result.confidence})`);
      return result;
    }
    await sleep(1000);
  }

  console.log(`[fica-email] ❌ No email found for ${lead.business_name}`);
  return null;
}

// ─── Save result to Supabase ───────────────────────────────────────────────

async function saveEmail(lead, result) {
  const notes = `Email found via ${result.strategy} — confidence: ${result.confidence} — source: ${result.source}`;
  const { error } = await supabase
    .from('fica_leads')
    .update({
      email:      result.email,
      notes:      notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id);

  if (error) console.error(`[fica-email] Supabase update error for ${lead.business_name}:`, error.message);
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('[fica-email] Starting fica_email_enrichment — ' + new Date().toISOString());
  const start = Date.now();

  const { data: leads, error } = await supabase
    .from('fica_leads')
    .select('*')
    .is('email', null)
    .in('outreach_stage', ['new', 'call_restricted'])
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    await sendTelegram(`🚨 *FICA Email Enrichment* — DB error: ${error.message}`);
    return;
  }

  if (!leads || leads.length === 0) {
    console.log('[fica-email] No leads need email enrichment.');
    await sendTelegram('📧 *FICA Email Enrichment* — No leads need enrichment today.');
    return;
  }

  console.log(`[fica-email] Processing ${leads.length} leads...`);

  let found = 0, notFound = 0;
  const strategyCount = { website: 0, directory: 0, social: 0, pattern: 0 };

  for (const lead of leads) {
    const result = await findEmail(lead);

    if (result && result.email) {
      found++;
      strategyCount[result.strategy] = (strategyCount[result.strategy] || 0) + 1;
      await saveEmail(lead, result);
    } else {
      notFound++;
    }

    await sleep(2000);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  await sendTelegram(
    `📧 *FICA Email Enrichment Complete* (${elapsed}s)\n\n` +
    `Leads Processed: ${leads.length}\n` +
    `✅ Emails Found: ${found}\n` +
    `❌ Not Found: ${notFound}\n\n` +
    `*By Strategy:*\n` +
    `🌐 Website: ${strategyCount.website || 0}\n` +
    `📋 Directory: ${strategyCount.directory || 0}\n` +
    `📱 Social: ${strategyCount.social || 0}\n` +
    `🔠 Pattern: ${strategyCount.pattern || 0}\n\n` +
    `_${found} FICA leads ready for outreach_`
  );

  console.log(`[fica-email] Complete — Found: ${found}, Not found: ${notFound}`);
}

main().catch(async (err) => {
  console.error('[fica-email] Fatal:', err);
  await sendTelegram(`🚨 *FICA Email Enrichment CRASHED*\n\n${err.message}`);
  process.exit(1);
});

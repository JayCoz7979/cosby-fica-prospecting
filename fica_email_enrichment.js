/**
 * fica_email_enrichment.js
 * Enriches fica_leads with email addresses using Hunter.io domain search.
 * Runs after the lead finder to populate emails before outreach.
 * Schedule: 8:15 AM UTC daily via Railway cron.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
const MAX_PER_RUN = 50;

if (!HUNTER_API_KEY) {
  console.error('[enrichment] HUNTER_API_KEY is required');
  process.exit(1);
}

// ─── Extract domain from URL ───────────────────────────────────────────────
function extractDomain(url) {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// ─── Hunter.io domain search ───────────────────────────────────────────────
async function findEmailByDomain(domain) {
  const url = `https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${HUNTER_API_KEY}&limit=5`;
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok || data.errors) {
    throw new Error(data.errors?.[0]?.details || 'Hunter API error');
  }

  const emails = data.data?.emails || [];
  if (!emails.length) return null;

  // Prefer decision maker emails
  const priority = ['owner', 'ceo', 'founder', 'president', 'director', 'manager', 'gm'];
  for (const role of priority) {
    const match = emails.find(e =>
      e.position?.toLowerCase().includes(role) ||
      e.type === 'personal'
    );
    if (match) return match.value;
  }

  // Fall back to first verified email
  const verified = emails.find(e => e.confidence >= 70);
  return verified?.value || emails[0]?.value || null;
}

// ─── Hunter.io email finder (by name + domain) ────────────────────────────
async function findEmailByName(firstName, lastName, domain) {
  if (!firstName || !lastName) return null;
  const url = `https://api.hunter.io/v2/email-finder?domain=${domain}&first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&api_key=${HUNTER_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || data.errors) return null;
  const email = data.data?.email;
  const score = data.data?.score || 0;
  return score >= 50 ? email : null;
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function run() {
  console.log('[enrichment] Starting fica_email_enrichment — ' + new Date().toISOString());

  // Fetch leads with no email but with a website URL
  const { data: leads, error } = await supabase
    .from('fica_leads')
    .select('id, business_name, website_url, contact_name, city, state')
    .is('email', null)
    .not('website_url', 'is', null)
    .neq('website_url', '')
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN);

  if (error) {
    console.error('[enrichment] Failed to fetch leads:', error.message);
    process.exit(1);
  }

  if (!leads || leads.length === 0) {
    console.log('[enrichment] No leads pending email enrichment');
    process.exit(0);
  }

  console.log(`[enrichment] Processing ${leads.length} leads`);

  let enriched = 0;
  let failed = 0;
  let noEmail = 0;

  for (const lead of leads) {
    const domain = extractDomain(lead.website_url);

    if (!domain) {
      console.log(`[enrichment] No domain for: ${lead.business_name} — skipping`);
      noEmail++;
      continue;
    }

    console.log(`[enrichment] Looking up: ${lead.business_name} (${domain})`);

    let email = null;

    try {
      // Try domain search first
      email = await findEmailByDomain(domain);

      // If contact name exists, try name-based lookup
      if (!email && lead.contact_name) {
        const parts = lead.contact_name.trim().split(' ');
        if (parts.length >= 2) {
          email = await findEmailByName(parts[0], parts.slice(1).join(' '), domain);
        }
      }
    } catch (err) {
      console.error(`[enrichment] Hunter error for ${domain}:`, err.message);
      failed++;
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    if (email) {
      const { error: updateErr } = await supabase
        .from('fica_leads')
        .update({ email })
        .eq('id', lead.id);

      if (updateErr) {
        console.error(`[enrichment] Update error for "${lead.business_name}":`, updateErr.message);
        failed++;
      } else {
        enriched++;
        console.log(`[enrichment] ✅ ${lead.business_name} → ${email}`);
      }
    } else {
      noEmail++;
      console.log(`[enrichment] No email found for: ${lead.business_name}`);
    }

    // Respect Hunter rate limits
    await new Promise(r => setTimeout(r, 1200));
  }

  console.log(`[enrichment] Done — enriched: ${enriched}, no email found: ${noEmail}, failed: ${failed}`);
}

run().catch((err) => {
  console.error('[enrichment] Fatal error:', err);
  process.exit(1);
});

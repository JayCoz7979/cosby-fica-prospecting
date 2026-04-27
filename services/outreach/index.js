/**
 * fica-outreach service
 * Sends personalized cold emails via Resend explaining the FICA Tip Credit.
 * Also handles email-only outreach for leads in call-restricted states.
 * Schedule: 8:30 AM UTC daily via Railway cron.
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   ANTHROPIC_API_KEY
 *   RESEND_API_KEY
 *   OUTREACH_ENABLED=true
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY;
const RESEND_API_KEY     = process.env.RESEND_API_KEY;
const OUTREACH_ENABLED   = process.env.OUTREACH_ENABLED;
const FROM_EMAIL         = 'info@cosbyaisolutions.com';
const SCORE_THRESHOLD    = 4;
const MAX_EMAILS_PER_RUN = 20;

const CALL_RESTRICTED_STATES = new Set([
  'IN', 'WY', 'WI', 'MT', 'AK', 'GA', 'FL', 'OK', 'WA', 'MD',
]);

const STATE_ABBREVS = {
  'Alabama': 'AL', 'Tennessee': 'TN', 'Georgia': 'GA', 'Mississippi': 'MS',
};

function getStateAbbrev(s) {
  if (!s) return null;
  const u = s.trim().toUpperCase();
  return u.length === 2 ? u : (STATE_ABBREVS[s] || u);
}

function isCallRestricted(state) {
  const abbrev = getStateAbbrev(state);
  return abbrev ? CALL_RESTRICTED_STATES.has(abbrev) : false;
}

async function generateEmail(lead, restricted) {
  const ctaLine = restricted
    ? "Reply to this email and we'll send over a quick eligibility summary at no charge."
    : "Reply to this email or call us for a free 15-minute eligibility review — no obligation.";

  const prompt = `You are writing a personalized cold outreach email for a hospitality business owner about the FICA Tip Credit (Section 45B of the U.S. Tax Code).

Business Details:
- Business Name: ${lead.business_name}
- Industry: ${lead.industry || 'hospitality business'}
- City/State: ${lead.city || ''}, ${lead.state || ''}
- Approximate Employees: ${lead.employee_count || 'several'}
- Contact Name: ${lead.contact_name || 'Business Owner'}

Key facts about the FICA Tip Credit:
- Dollar-for-dollar federal tax credit (not a deduction — directly reduces IRS liability)
- Section 45B of the U.S. Tax Code
- Employers who pay FICA taxes on employee tips above minimum wage qualify
- Credit equals up to 7.65% of qualifying tip income
- Most business owners don't know they qualify or have never claimed it
- Zero upfront cost — only paid when client receives their credit
- CPAs handle all paperwork and IRS filings

Write a short, professional cold email (150-200 words) that:
1. Opens referencing their specific business type
2. Explains there is a federal tax credit many ${lead.industry || 'hospitality'} owners miss
3. Briefly explains the credit and approximate value
4. Emphasizes zero upfront cost
5. Uses this CTA: "${ctaLine}"
6. Sounds human and credible, not spammy
7. Signed: Jason Cosby, Cosby AI Solutions

Return ONLY valid JSON:
{"subject": "Short subject line", "body": "Full email body (use \\n for line breaks)"}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error('Claude API error: ' + await res.text());
  const data = await res.json();
  const raw  = data.content[0].text.trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in response');
  return JSON.parse(match[0]);
}

async function sendEmail({ to, subject, body }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, text: body }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(`Resend error: ${result.message || JSON.stringify(result)}`);
  return result.id;
}

async function logOutreach({ leadId, email, subject, body, resendId, status, errorMessage, sequenceStep }) {
  const { error } = await supabase.from('fica_outreach_log').insert({
    lead_id:       leadId,
    email,
    subject,
    body,
    resend_id:     resendId || null,
    status,
    error_message: errorMessage || null,
    sent_at:       new Date().toISOString(),
    sequence_step: sequenceStep || 1,
    attempt_count: 1,
  });
  if (error) console.error('[outreach] Log error:', error.message);
}

async function run() {
  console.log('[outreach] Starting — ' + new Date().toISOString());

  if (OUTREACH_ENABLED !== 'true') {
    console.log('[outreach] OUTREACH_ENABLED is not "true" — exiting.');
    process.exit(0);
  }

  if (!RESEND_API_KEY) {
    console.error('[outreach] RESEND_API_KEY not set');
    process.exit(1);
  }

  const { data: leads, error } = await supabase
    .from('fica_leads')
    .select('*')
    .gte('fica_score', SCORE_THRESHOLD)
    .in('outreach_stage', ['new', 'call_restricted'])
    .not('email', 'is', null)
    .neq('email', '')
    .order('fica_score', { ascending: false })
    .limit(MAX_EMAILS_PER_RUN);

  if (error) { console.error('[outreach] Fetch error:', error.message); process.exit(1); }
  if (!leads || leads.length === 0) { console.log('[outreach] No leads to email — done'); process.exit(0); }

  console.log(`[outreach] Processing ${leads.length} leads`);
  let sent = 0, failed = 0;

  for (const lead of leads) {
    const restricted = isCallRestricted(lead.state);
    let emailData = null, resendId = null, status = 'sent', errorMsg = null;

    try {
      emailData = await generateEmail(lead, restricted);
      resendId  = await sendEmail({ to: lead.email, subject: emailData.subject, body: emailData.body });
      console.log(`[outreach] Sent to ${lead.email}`);
      sent++;
    } catch (err) {
      console.error(`[outreach] Failed for "${lead.business_name}":`, err.message);
      status = 'failed'; errorMsg = err.message; failed++;
    }

    await logOutreach({
      leadId: lead.id, email: lead.email,
      subject: emailData?.subject || '', body: emailData?.body || '',
      resendId, status, errorMessage: errorMsg,
      sequenceStep: (lead.followup_step || 0) + 1,
    });

    const nextStage = status === 'sent' ? (restricted ? 'emailed_restricted' : 'emailed') : lead.outreach_stage;
    await supabase.from('fica_leads').update({
      outreach_stage:    nextStage,
      last_contacted_at: new Date().toISOString(),
      followup_step:     (lead.followup_step || 0) + 1,
    }).eq('id', lead.id);

    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`[outreach] Complete — sent: ${sent}, failed: ${failed}`);
}

run().catch(err => { console.error('[outreach] Fatal:', err); process.exit(1); });

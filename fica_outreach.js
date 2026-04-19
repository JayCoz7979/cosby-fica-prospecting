/**
 * fica_outreach.js
 * Sends personalized cold emails via Resend explaining the FICA Tip Credit (Section 45B).
 * Also handles email outreach for leads in states where cold calls are restricted.
 * Tracks outreach in fica_outreach_log table.
 * Schedule: 8:30 AM UTC daily via Railway cron.
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

// States where outbound cold calls are restricted — these leads get email-only outreach
const CALL_RESTRICTED_STATES = new Set([
  'IN', 'WY', 'WI', 'MT', 'AK', 'GA', 'FL', 'OK', 'WA', 'MD',
]);

const STATE_ABBREVS = {
  'Alabama':     'AL',
  'Tennessee':   'TN',
  'Georgia':     'GA',
  'Mississippi': 'MS',
};

function getStateAbbrev(stateName) {
  if (!stateName) return null;
  const upper = stateName.trim().toUpperCase();
  if (upper.length === 2) return upper;
  return STATE_ABBREVS[stateName] || upper;
}

function isCallRestricted(stateName) {
  const abbrev = getStateAbbrev(stateName);
  return abbrev ? CALL_RESTRICTED_STATES.has(abbrev) : false;
}

async function generateEmail(lead, isCallRestrictedLead) {
  const employeeRange = lead.employee_count || 'several';
  const industry      = lead.industry || 'hospitality business';
  const contactName   = lead.contact_name || 'Business Owner';

  const ctaLine = isCallRestrictedLead
    ? 'Reply to this email and we\'ll send over a quick eligibility summary at no charge.'
    : 'Reply to this email or call us for a free 15-minute eligibility review — no obligation.';

  const prompt = `You are writing a personalized cold outreach email for a hospitality business owner about the FICA Tip Credit (Section 45B of the U.S. Tax Code).

Business Details:
- Business Name: ${lead.business_name}
- Industry: ${industry}
- City/State: ${lead.city || ''}, ${lead.state || ''}
- Approximate Employees: ${employeeRange}
- Contact Name: ${contactName}

Key facts about the FICA Tip Credit to include accurately:
- It is a DOLLAR-FOR-DOLLAR federal tax credit (not a deduction — it directly reduces what you owe the IRS)
- It is based on Section 45B of the U.S. Tax Code
- Employers who pay FICA taxes (Social Security + Medicare) on employee tips above minimum wage qualify
- Any business in hospitality/food service with tipped employees is likely eligible
- Credit equals up to 7.65% of qualifying tip income — a restaurant with 20 tipped employees can see $20,000+ per year
- Most business owners don't know they qualify or have never claimed it
- Zero upfront cost — we only get paid when you receive your credit
- CPAs handle all paperwork and IRS filings

Write a short, professional cold email (150-200 words) that:
1. Opens with a direct line referencing their specific business type or industry
2. Gets straight to the point: there is a federal tax credit many ${industry} owners miss every year
3. Briefly explains what it is and approximately how much they could receive
4. Emphasizes zero upfront cost — they only pay when they get their credit
5. Uses this CTA: "${ctaLine}"
6. Sounds human, credible, and direct — not spammy or over-hyped
7. Signed from: Jason Cosby, Cosby AI Solutions

Return ONLY valid JSON in this exact format:
{
  "subject": "Short subject line (under 60 chars, no all-caps, no dollar signs in subject)",
  "body": "Full email body (use \\n for line breaks)"
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
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

  if (!response.ok) {
    const err = await response.text();
    throw new Error('Claude API error: ' + err);
  }

  const data     = await response.json();
  const rawText  = data.content[0].text.trim();
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in email generation response');

  return JSON.parse(jsonMatch[0]);
}

async function sendEmail({ to, subject, body }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject,
      text: body,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(`Resend error: ${result.message || JSON.stringify(result)}`);
  }

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

  if (error) {
    console.error('[outreach] Failed to log outreach:', error.message);
  }
}

async function processLeads() {
  // Fetch new leads with an email address and score above threshold
  // Also pick up call-restricted leads that haven't been emailed yet
  const { data: leads, error } = await supabase
    .from('fica_leads')
    .select('*')
    .gte('fica_score', SCORE_THRESHOLD)
    .in('outreach_stage', ['new', 'call_restricted'])
    .not('email', 'is', null)
    .neq('email', '')
    .order('fica_score', { ascending: false })
    .limit(MAX_EMAILS_PER_RUN);

  if (error) throw new Error(`Failed to fetch leads: ${error.message}`);

  if (!leads || leads.length === 0) {
    console.log('[outreach] No leads pending email outreach');
    return { sent: 0, failed: 0 };
  }

  console.log(`[outreach] Processing ${leads.length} leads (score >= ${SCORE_THRESHOLD})`);

  let sent   = 0;
  let failed = 0;

  for (const lead of leads) {
    const restricted = isCallRestricted(lead.state);
    console.log(
      `[outreach] Generating email for: ${lead.business_name}` +
      ` (score: ${lead.fica_score}${restricted ? ', call-restricted state' : ''})`
    );

    let emailData = null;
    let resendId  = null;
    let status    = 'sent';
    let errorMsg  = null;

    try {
      emailData = await generateEmail(lead, restricted);
      console.log(`[outreach] Subject: ${emailData.subject}`);

      resendId = await sendEmail({
        to:      lead.email,
        subject: emailData.subject,
        body:    emailData.body,
      });

      console.log(`[outreach] Sent to ${lead.email} — Resend ID: ${resendId}`);
      sent++;
    } catch (err) {
      console.error(`[outreach] Failed to email "${lead.business_name}":`, err.message);
      status   = 'failed';
      errorMsg = err.message;
      failed++;
    }

    await logOutreach({
      leadId:       lead.id,
      email:        lead.email,
      subject:      emailData?.subject || '',
      body:         emailData?.body || '',
      resendId,
      status,
      errorMessage: errorMsg,
      sequenceStep: (lead.followup_step || 0) + 1,
    });

    const nextStage = status === 'sent'
      ? (restricted ? 'emailed_restricted' : 'emailed')
      : lead.outreach_stage;

    const { error: updateErr } = await supabase
      .from('fica_leads')
      .update({
        outreach_stage:    nextStage,
        last_contacted_at: new Date().toISOString(),
        followup_step:     (lead.followup_step || 0) + 1,
      })
      .eq('id', lead.id);

    if (updateErr) {
      console.error(`[outreach] Failed to update stage for "${lead.business_name}":`, updateErr.message);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`[outreach] Complete — sent: ${sent}, failed: ${failed}`);
  return { sent, failed };
}

async function run() {
  console.log('[outreach] Starting fica_outreach — ' + new Date().toISOString());

  if (OUTREACH_ENABLED !== 'true') {
    console.log('[outreach] OUTREACH_ENABLED is not "true" — skipping email outreach.');
    process.exit(0);
  }

  if (!RESEND_API_KEY) {
    console.error('[outreach] RESEND_API_KEY is not set');
    process.exit(1);
  }

  try {
    const { sent, failed } = await processLeads();
    console.log(`[outreach] Finished — ${sent} emails sent, ${failed} failed`);
  } catch (err) {
    console.error('[outreach] Fatal error:', err.message);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('[outreach] Unhandled error:', err);
  process.exit(1);
});

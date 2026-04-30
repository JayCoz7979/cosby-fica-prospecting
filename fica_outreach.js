/**
 * fica_outreach.js
 * Sends personalized cold emails via Resend explaining the FICA Tip Credit (Section 45B).
 * Outreach is on behalf of TCP Assistance (tcpadvisors.com) partnering with LenCred.
 * Schedule: 8:30 AM UTC daily via Railway cron.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY;
const RESEND_API_KEY     = process.env.RESEND_API_KEY;
const FROM_EMAIL         = process.env.FROM_EMAIL || 'info@cosbyaisolutions.com';
const SCORE_THRESHOLD    = 4;
const MAX_EMAILS_PER_RUN = 20;

// States where outbound cold calls are restricted — email-only outreach
const CALL_RESTRICTED_STATES = new Set([
  'IN', 'WY', 'WI', 'MT', 'AK', 'GA', 'FL', 'OK', 'WA', 'MD',
]);

const STATE_ABBREVS = {
  'Alabama':        'AL',
  'Tennessee':      'TN',
  'Georgia':        'GA',
  'Mississippi':    'MS',
  'Florida':        'FL',
  'Texas':          'TX',
  'North Carolina': 'NC',
  'South Carolina': 'SC',
  'Louisiana':      'LA',
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
  const industry      = lead.industry || 'hospitality business';
  const contactName   = lead.contact_name || 'Business Owner';
  const employeeRange = lead.employee_count || 'several';

  const ctaLine = isCallRestrictedLead
    ? 'Reply to this email to claim your free eligibility assessment — we\'ll send over a full breakdown of what you qualify for at no charge.'
    : 'Reply to this email to claim your free eligibility assessment, or visit tcpadvisors.com to get started today.';

  const prompt = `You are writing a personalized cold outreach email on behalf of TCP Assistance (tcpadvisors.com), partnering with LenCred, about the FICA Tip Credit (Section 45B of the U.S. Tax Code).

Business Details:
- Business Name: ${lead.business_name}
- Industry: ${industry}
- City/State: ${lead.city || ''}, ${lead.state || ''}
- Approximate Employees: ${employeeRange}
- Contact Name: ${contactName}

Key facts to include accurately:
- The FICA Tip Credit is a DOLLAR-FOR-DOLLAR federal tax credit (not a deduction)
- Based on Section 45B of the U.S. Tax Code
- Employers who pay FICA taxes on employee tips above minimum wage qualify
- Any hospitality/food service business with tipped employees likely qualifies
- Credit equals up to 7.65% of qualifying tip income — a restaurant with 20 tipped employees can see $20,000-$80,000+ per year
- Most business owners have never claimed it or don't know they qualify
- Credits can be claimed going BACK 3 YEARS — every month you wait is money left on the table
- LenCred handles ALL the legwork — eligibility review, documentation, IRS filing
- TCP Assistance coordinates the entire process on your behalf
- ZERO upfront cost — you only pay when you receive your credit
- Free eligibility assessment available at tcpadvisors.com

Write a short, professional cold email (150-200 words) that:
1. Opens with a direct line referencing their specific business type
2. Gets straight to the point — there is a federal tax credit most ${industry} owners miss every year
3. Emphasizes the dollar amount they could be leaving on the table
4. Stresses the 3-year lookback — the longer they wait the more they lose
5. Explains that LenCred handles everything — they just collect their check
6. Emphasizes zero upfront cost
7. Stresses why using TCP Assistance is the smart choice — we specialize exclusively in this credit and most CPAs don't prioritize it
8. Uses this CTA: "${ctaLine}"
9. Sounds human, credible, and urgent — not spammy
10. Signed: Jay | TCPAdvisors.com

Return ONLY valid JSON:
{
  "subject": "Short subject line (under 60 chars, no all-caps, no dollar signs)",
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
    console.log(`[outreach] Generating email for: ${lead.business_name} (score: ${lead.fica_score}${restricted ? ', call-restricted' : ''})`);

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

    await supabase
      .from('fica_leads')
      .update({
        outreach_stage:    nextStage,
        last_contacted_at: new Date().toISOString(),
        followup_step:     (lead.followup_step || 0) + 1,
      })
      .eq('id', lead.id);

    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`[outreach] Complete — sent: ${sent}, failed: ${failed}`);
  return { sent, failed };
}

async function run() {
  console.log('[outreach] Starting fica_outreach — ' + new Date().toISOString());

  if (!RESEND_API_KEY) {
    console.error('[outreach] RESEND_API_KEY is not set');
    process.exit(1);
  }

  if (!ANTHROPIC_API_KEY) {
    console.error('[outreach] ANTHROPIC_API_KEY is not set');
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

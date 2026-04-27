/**
 * fica-vapi service
 * Triggers outbound VAPI calls for high-scoring FICA Tip Credit leads.
 * Leads in call-restricted states are routed to email (call_restricted stage).
 * 3 no-answers → 90-day re-engagement. Permanently stop on not_interested.
 * Schedule: 9:00 AM UTC daily via Railway cron.
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   VAPI_API_KEY
 *   FICA_VAPI_ASSISTANT_ID
 *   OUTREACH_ENABLED=true
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const VAPI_API_KEY           = process.env.VAPI_API_KEY;
const FICA_VAPI_ASSISTANT_ID = process.env.FICA_VAPI_ASSISTANT_ID;
const VAPI_PHONE_NUMBER_ID   = 'a7b56219-b4b2-4e56-89d5-8ecfdf6866de';
const OUTREACH_ENABLED       = process.env.OUTREACH_ENABLED;
// Post-call results are written directly to fica_leads via the VAPI webhook
// endpoint at /api/webhooks/vapi — no Zapier required.

const SCORE_THRESHOLD   = 6;
const MAX_CALLS_PER_DAY = 10;
const MAX_CALL_ATTEMPTS = 3;
const REENGAGE_DAYS     = 90;

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

function formatPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

async function routeToEmail(lead) {
  console.log(`[vapi] ${lead.state} restricted — routing ${lead.business_name} to email`);
  const { error } = await supabase.from('fica_leads').update({ outreach_stage: 'call_restricted' }).eq('id', lead.id);
  if (error) console.error('[vapi] routeToEmail error:', error.message);
}

async function triggerVapiCall(lead) {
  const phone = formatPhone(lead.phone);
  if (!phone) throw new Error(`Invalid phone: ${lead.phone}`);

  const res = await fetch('https://api.vapi.ai/call/phone', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${VAPI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assistantId:   FICA_VAPI_ASSISTANT_ID,
      phoneNumberId: VAPI_PHONE_NUMBER_ID,
      customer: { number: phone, name: lead.contact_name || lead.business_name },
      assistantOverrides: {
        variableValues: {
          business_name:  lead.business_name,
          contact_name:   lead.contact_name || 'there',
          industry:       lead.industry || 'restaurant',
          city:           lead.city || '',
          state:          lead.state || '',
          employee_count: lead.employee_count || 'your',
        },
      },
    }),
  });

  const result = await res.json();
  if (!res.ok) throw new Error(`VAPI error: ${result.message || JSON.stringify(result)}`);
  return result.id;
}


async function run() {
  console.log('[vapi] Starting — ' + new Date().toISOString());

  if (OUTREACH_ENABLED !== 'true') {
    console.log('[vapi] OUTREACH_ENABLED is not "true" — exiting.');
    process.exit(0);
  }
  if (!VAPI_API_KEY) { console.error('[vapi] VAPI_API_KEY not set'); process.exit(1); }
  if (!FICA_VAPI_ASSISTANT_ID) { console.error('[vapi] FICA_VAPI_ASSISTANT_ID not set'); process.exit(1); }

  const now = new Date().toISOString();
  const { data: leads, error } = await supabase
    .from('fica_leads')
    .select('*')
    .gte('fica_score', SCORE_THRESHOLD)
    .not('phone', 'is', null)
    .neq('phone', '')
    .not('outreach_stage', 'in', '("not_interested","disqualified","called_success","call_restricted","emailed_restricted")')
    .or(`outreach_stage.eq.new,outreach_stage.eq.emailed,and(outreach_stage.eq.reengagement,next_retry_at.lte.${now})`)
    .order('fica_score', { ascending: false })
    .limit(MAX_CALLS_PER_DAY + 20);

  if (error) { console.error('[vapi] Fetch error:', error.message); process.exit(1); }
  if (!leads || leads.length === 0) { console.log('[vapi] No leads eligible for calls today — done'); process.exit(0); }

  console.log(`[vapi] ${leads.length} leads fetched`);
  let called = 0, routed = 0, skipped = 0, failed = 0;

  for (const lead of leads) {
    if (called >= MAX_CALLS_PER_DAY) { console.log('[vapi] Daily call limit reached'); break; }

    if (isCallRestricted(lead.state)) {
      await routeToEmail(lead);
      routed++;
      continue;
    }

    const attempts = lead.call_attempt_count || 0;
    if (attempts >= MAX_CALL_ATTEMPTS && lead.outreach_stage !== 'reengagement') {
      const retryDate = new Date(Date.now() + REENGAGE_DAYS * 86400000).toISOString();
      await supabase.from('fica_leads').update({ outreach_stage: 'reengagement', next_retry_at: retryDate }).eq('id', lead.id);
      skipped++;
      continue;
    }

    let callId = null, status = 'call_initiated', errorMsg = null;
    try {
      callId = await triggerVapiCall(lead);
      console.log(`[vapi] Called ${lead.business_name} — ID: ${callId}`);
      await supabase.from('fica_leads').update({
        outreach_stage:     'call_initiated',
        last_contacted_at:  new Date().toISOString(),
        call_attempt_count: attempts + 1,
      }).eq('id', lead.id);
      called++;
    } catch (err) {
      console.error(`[vapi] Failed "${lead.business_name}":`, err.message);
      status = 'call_failed'; errorMsg = err.message; failed++;
    }

    await supabase.from('fica_outreach_log').insert({
      lead_id: lead.id, status, last_call_id: callId || null,
      error_message: errorMsg || null, sent_at: new Date().toISOString(), attempt_count: 1,
    });
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`[vapi] Complete — called: ${called}, routed: ${routed}, skipped: ${skipped}, failed: ${failed}`);
}

run().catch(err => { console.error('[vapi] Fatal:', err); process.exit(1); });

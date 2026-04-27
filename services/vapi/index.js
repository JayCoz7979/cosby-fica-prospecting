/**
 * fica-vapi service (ElevenLabs Conversational AI)
 * Triggers outbound ElevenLabs calls for high-scoring FICA Tip Credit leads.
 * Call-restricted states → routed to email. 3 no-answers → 90-day re-engagement.
 * Schedule: 9:00 AM UTC daily via Railway cron.
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, ELEVENLABS_PHONE_NUMBER_ID
 *   OUTREACH_ENABLED=true
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ELEVENLABS_API_KEY         = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_AGENT_ID        = process.env.ELEVENLABS_AGENT_ID;
const ELEVENLABS_PHONE_NUMBER_ID = process.env.ELEVENLABS_PHONE_NUMBER_ID;
const OUTREACH_ENABLED           = process.env.OUTREACH_ENABLED;
// Post-call results written to fica_leads via Supabase Edge Function: elevenlabs-webhook

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

async function triggerCall(lead) {
  const phone = formatPhone(lead.phone);
  if (!phone) throw new Error(`Invalid phone: ${lead.phone}`);

  const res = await fetch('https://api.elevenlabs.io/v1/convai/conversations/outbound_call', {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_id:              ELEVENLABS_AGENT_ID,
      agent_phone_number_id: ELEVENLABS_PHONE_NUMBER_ID,
      to_number:             phone,
      conversation_initiation_client_data: {
        dynamic_variables: {
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
  if (!res.ok) throw new Error(`ElevenLabs error: ${result.detail || JSON.stringify(result)}`);
  return result.conversation_id;
}

async function run() {
  console.log('[vapi] Starting — ' + new Date().toISOString());

  if (OUTREACH_ENABLED !== 'true') {
    console.log('[vapi] OUTREACH_ENABLED is not "true" — exiting.');
    process.exit(0);
  }
  if (!ELEVENLABS_API_KEY)         { console.error('[vapi] ELEVENLABS_API_KEY not set');         process.exit(1); }
  if (!ELEVENLABS_AGENT_ID)        { console.error('[vapi] ELEVENLABS_AGENT_ID not set');        process.exit(1); }
  if (!ELEVENLABS_PHONE_NUMBER_ID) { console.error('[vapi] ELEVENLABS_PHONE_NUMBER_ID not set'); process.exit(1); }

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
  if (!leads || leads.length === 0) { console.log('[vapi] No eligible leads today'); process.exit(0); }

  let called = 0, routed = 0, skipped = 0, failed = 0;

  for (const lead of leads) {
    if (called >= MAX_CALLS_PER_DAY) { console.log('[vapi] Daily limit reached'); break; }

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
      callId = await triggerCall(lead);
      console.log(`[vapi] Called ${lead.business_name} — conversation_id: ${callId}`);
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

/**
 * fica_vapi.js
 * Triggers outbound ElevenLabs Conversational AI calls for high-scoring FICA leads.
 * Leads in call-restricted states are routed to email outreach instead of skipped.
 * Handles 90-day re-engagement after 3 no-answer calls.
 * Permanently stops on mark_not_interested.
 * Schedule: 9:00 AM UTC daily via Railway cron.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ELEVENLABS_API_KEY      = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_AGENT_ID     = process.env.ELEVENLABS_AGENT_ID;
const ELEVENLABS_PHONE_NUMBER_ID = process.env.ELEVENLABS_PHONE_NUMBER_ID;
const ZAPIER_WEBHOOK_URL      = 'https://hooks.zapier.com/hooks/catch/26341455/ujd6pv3/';
const OUTREACH_ENABLED       = process.env.OUTREACH_ENABLED;

const SCORE_THRESHOLD   = 6;
const MAX_CALLS_PER_DAY = 10;
const MAX_CALL_ATTEMPTS = 3;
const REENGAGE_DAYS     = 90;

// States where outbound cold calls are restricted by state/jurisdiction law.
// Leads in these states are routed to email outreach (fica_outreach.js) instead.
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

function formatPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

async function routeToEmail(lead) {
  console.log(`[vapi] ${lead.state} is call-restricted — routing ${lead.business_name} to email outreach`);

  const { error } = await supabase
    .from('fica_leads')
    .update({ outreach_stage: 'call_restricted' })
    .eq('id', lead.id);

  if (error) {
    console.error(`[vapi] Failed to set call_restricted stage for "${lead.business_name}":`, error.message);
  } else {
    console.log(`[vapi] ${lead.business_name} → stage set to "call_restricted" (email outreach will pick up)`);
  }
}

async function triggerCall(lead) {
  const phone = formatPhone(lead.phone);
  if (!phone) {
    throw new Error(`Invalid phone number: ${lead.phone}`);
  }

  console.log(`[vapi] Calling ${lead.business_name} at ${phone}`);

  const response = await fetch('https://api.elevenlabs.io/v1/convai/conversations/outbound_call', {
    method: 'POST',
    headers: {
      'xi-api-key':   ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
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

  const result = await response.json();

  if (!response.ok) {
    throw new Error(`ElevenLabs error: ${result.detail || JSON.stringify(result)}`);
  }

  return result.conversation_id;
}

async function sendZapierWebhook(lead, callId, status) {
  try {
    const response = await fetch(ZAPIER_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event:         'fica_call_triggered',
        call_id:       callId,
        status,
        lead_id:       lead.id,
        business_name: lead.business_name,
        phone:         lead.phone,
        state:         lead.state,
        fica_score:    lead.fica_score,
        industry:      lead.industry,
        timestamp:     new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      console.error('[vapi] Zapier webhook failed:', response.status);
    } else {
      console.log(`[vapi] Zapier webhook sent for call ${callId}`);
    }
  } catch (err) {
    console.error('[vapi] Zapier webhook error:', err.message);
  }
}

async function logCall({ leadId, callId, status, errorMessage }) {
  const { error } = await supabase.from('fica_outreach_log').insert({
    lead_id:       leadId,
    status,
    last_call_id:  callId || null,
    error_message: errorMessage || null,
    sent_at:       new Date().toISOString(),
    attempt_count: 1,
  });

  if (error) {
    console.error('[vapi] Failed to log call:', error.message);
  }
}

async function processCallLeads() {
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
    .limit(MAX_CALLS_PER_DAY + 20); // fetch extra to account for restricted-state routing

  if (error) throw new Error(`Failed to fetch call leads: ${error.message}`);

  if (!leads || leads.length === 0) {
    console.log('[vapi] No leads eligible for calls today');
    return { called: 0, routed: 0, skipped: 0, failed: 0 };
  }

  console.log(`[vapi] ${leads.length} leads fetched — processing`);

  let called  = 0;
  let routed  = 0; // routed to email due to state restriction
  let skipped = 0;
  let failed  = 0;

  for (const lead of leads) {
    if (called >= MAX_CALLS_PER_DAY) {
      console.log(`[vapi] Reached daily call limit of ${MAX_CALLS_PER_DAY}`);
      break;
    }

    // Route call-restricted states to email instead of skipping
    if (isCallRestricted(lead.state)) {
      await routeToEmail(lead);
      routed++;
      continue;
    }

    // Check max call attempts — move to 90-day re-engagement
    const attempts = lead.call_attempt_count || 0;
    if (attempts >= MAX_CALL_ATTEMPTS && lead.outreach_stage !== 'reengagement') {
      console.log(
        `[vapi] ${lead.business_name} hit ${MAX_CALL_ATTEMPTS} no-answers` +
        ` — scheduling ${REENGAGE_DAYS}-day re-engagement`
      );
      const retryDate = new Date(Date.now() + REENGAGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await supabase
        .from('fica_leads')
        .update({ outreach_stage: 'reengagement', next_retry_at: retryDate })
        .eq('id', lead.id);
      skipped++;
      continue;
    }

    let callId   = null;
    let status   = 'call_initiated';
    let errorMsg = null;

    try {
      callId = await triggerCall(lead);
      console.log(`[vapi] Call initiated for ${lead.business_name} — call ID: ${callId}`);

      await supabase
        .from('fica_leads')
        .update({
          outreach_stage:     'call_initiated',
          last_contacted_at:  new Date().toISOString(),
          call_attempt_count: attempts + 1,
        })
        .eq('id', lead.id);

      called++;
    } catch (err) {
      console.error(`[vapi] Failed to call "${lead.business_name}":`, err.message);
      status   = 'call_failed';
      errorMsg = err.message;
      failed++;
    }

    await logCall({ leadId: lead.id, callId, status, errorMessage: errorMsg });
    await sendZapierWebhook(lead, callId, status);

    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log(`[vapi] Complete — called: ${called}, routed to email: ${routed}, skipped: ${skipped}, failed: ${failed}`);
  return { called, routed, skipped, failed };
}

async function run() {
  console.log('[vapi] Starting fica_vapi — ' + new Date().toISOString());

  if (OUTREACH_ENABLED !== 'true') {
    console.log('[vapi] OUTREACH_ENABLED is not "true" — skipping VAPI calls.');
    process.exit(0);
  }

  if (!ELEVENLABS_API_KEY) {
    console.error('[vapi] ELEVENLABS_API_KEY is not set');
    process.exit(1);
  }

  if (!ELEVENLABS_AGENT_ID) {
    console.error('[vapi] ELEVENLABS_AGENT_ID is not set');
    process.exit(1);
  }

  if (!ELEVENLABS_PHONE_NUMBER_ID) {
    console.error('[vapi] ELEVENLABS_PHONE_NUMBER_ID is not set');
    process.exit(1);
  }

  try {
    const { called, routed, skipped, failed } = await processCallLeads();
    console.log(`[vapi] Finished — ${called} calls triggered, ${routed} routed to email, ${skipped} re-engaged, ${failed} failed`);
  } catch (err) {
    console.error('[vapi] Fatal error:', err.message);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('[vapi] Unhandled error:', err);
  process.exit(1);
});

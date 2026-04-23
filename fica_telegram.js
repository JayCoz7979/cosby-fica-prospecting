/**
 * fica_telegram.js
 * Sends a daily summary to the FICA Alerts Telegram group with:
 *   - New leads found today
 *   - Emails sent today
 *   - Calls triggered today
 *   - Leads routed to email due to state restrictions
 *   - Top 5 leads by fica_score
 * Schedule: 9:30 AM UTC daily via Railway cron.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_API       = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function sendTelegramMessage(text) {
  const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id:                  TELEGRAM_CHAT_ID,
      text,
      parse_mode:               'HTML',
      disable_web_page_preview: true,
    }),
  });

  const result = await response.json();
  if (!result.ok) {
    throw new Error(`Telegram API error: ${result.description}`);
  }
  return result;
}

async function getNewLeadsToday() {
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('fica_leads')
    .select('id, business_name, industry, city, state, fica_score')
    .gte('created_at', since.toISOString());

  if (error) {
    console.error('[telegram] Error fetching new leads:', error.message);
    return [];
  }
  return data || [];
}

async function getEmailsSentToday() {
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('fica_outreach_log')
    .select('id, status')
    .gte('sent_at', since.toISOString())
    .not('resend_id', 'is', null);

  if (error) {
    console.error('[telegram] Error fetching emails:', error.message);
    return [];
  }
  return data || [];
}

async function getCallsToday() {
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('fica_outreach_log')
    .select('id, status, last_call_id')
    .gte('sent_at', since.toISOString())
    .not('last_call_id', 'is', null);

  if (error) {
    console.error('[telegram] Error fetching calls:', error.message);
    return [];
  }
  return data || [];
}

async function getRestrictedStateLeads() {
  const { data, error } = await supabase
    .from('fica_leads')
    .select('id, business_name, state')
    .in('outreach_stage', ['call_restricted', 'emailed_restricted']);

  if (error) {
    console.error('[telegram] Error fetching restricted leads:', error.message);
    return [];
  }
  return data || [];
}

async function getTop5Leads() {
  const { data, error } = await supabase
    .from('fica_leads')
    .select('business_name, industry, city, state, fica_score, employee_count, outreach_stage, email, phone')
    .gte('fica_score', 1)
    .not('outreach_stage', 'in', '("not_interested","disqualified")')
    .order('fica_score', { ascending: false })
    .limit(5);

  if (error) {
    console.error('[telegram] Error fetching top leads:', error.message);
    return [];
  }
  return data || [];
}

async function sendDailySummary() {
  console.log('[telegram] Gathering daily stats...');

  const [newLeads, emailsSent, callsToday, restrictedLeads, top5] = await Promise.all([
    getNewLeadsToday(),
    getEmailsSentToday(),
    getCallsToday(),
    getRestrictedStateLeads(),
    getTop5Leads(),
  ]);

  const successfulEmails = emailsSent.filter((e) => e.status === 'sent').length;
  const successfulCalls  = callsToday.filter((c) => c.status === 'call_initiated').length;

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  let msg = `<b>💼 FICA Tip Credit — Daily Prospecting Report</b>\n`;
  msg += `<i>${today}</i>\n\n`;

  msg += `<b>Today's Activity</b>\n`;
  msg += `• New leads found: <b>${newLeads.length}</b>\n`;
  msg += `• Emails sent: <b>${successfulEmails}</b>`;
  if (emailsSent.length > successfulEmails) msg += ` (${emailsSent.length - successfulEmails} failed)`;
  msg += `\n`;
  msg += `• Calls triggered: <b>${successfulCalls}</b>`;
  if (callsToday.length > successfulCalls) msg += ` (${callsToday.length - successfulCalls} failed)`;
  msg += `\n`;
  if (restrictedLeads.length > 0) {
    msg += `• Routed to email (state law): <b>${restrictedLeads.length}</b>\n`;
  }
  msg += `\n`;

  if (newLeads.length > 0) {
    msg += `<b>New Leads Today</b>\n`;
    for (const lead of newLeads.slice(0, 5)) {
      msg += `• ${lead.business_name} (${lead.city || ''}, ${lead.state || ''}) — score: ${lead.fica_score}\n`;
    }
    if (newLeads.length > 5) msg += `<i>...and ${newLeads.length - 5} more</i>\n`;
    msg += '\n';
  }

  if (top5.length > 0) {
    msg += `<b>Top 5 Leads by Score</b>\n`;
    for (const lead of top5) {
      const hasPhone = lead.phone ? '📞' : '';
      const hasEmail = lead.email ? '📧' : '';
      const restricted = ['call_restricted', 'emailed_restricted'].includes(lead.outreach_stage) ? ' 🚫📞' : '';
      msg += `<b>${lead.business_name}</b> ${hasPhone}${hasEmail}${restricted}\n`;
      msg += `  📍 ${lead.city || ''}, ${lead.state || ''} | 🍽 ${lead.industry || 'N/A'}\n`;
      msg += `  👥 ${lead.employee_count || 'N/A'} employees | ⭐ Score: ${lead.fica_score}/10\n`;
      msg += `  Stage: ${lead.outreach_stage || 'new'}\n`;
    }
    msg += '\n';
  }

  msg += `<i>FICA Tip Credit (Sec. 45B) — up to 7.65% of tip income, $0 upfront</i>\n`;
  msg += `<i>Pipeline: finder 8AM → scorer 8:15AM → email 8:30AM → calls 9AM UTC</i>`;

  await sendTelegramMessage(msg);
  console.log('[telegram] Daily summary sent successfully');
}

async function run() {
  console.log('[telegram] Starting fica_telegram — ' + new Date().toISOString());

  if (!TELEGRAM_BOT_TOKEN) {
    console.error('[telegram] TELEGRAM_BOT_TOKEN is not set');
    process.exit(1);
  }

  if (!TELEGRAM_CHAT_ID) {
    console.error('[telegram] TELEGRAM_CHAT_ID is not set');
    process.exit(1);
  }

  console.log(`[telegram] Sending to chat: ${TELEGRAM_CHAT_ID}`);

  try {
    await sendDailySummary();
    console.log('[telegram] Complete');
  } catch (err) {
    console.error('[telegram] Fatal error:', err.message);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('[telegram] Unhandled error:', err);
  process.exit(1);
});

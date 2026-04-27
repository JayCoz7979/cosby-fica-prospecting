/**
 * fica-telegram service
 * Sends a daily summary to Telegram with lead/email/call stats and top 5 leads.
 * Schedule: 9:30 AM UTC daily via Railway cron.
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   TELEGRAM_BOT_TOKEN
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = '1296640696';
const TELEGRAM_API       = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function sendTelegramMessage(text) {
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  const result = await res.json();
  if (!result.ok) throw new Error(`Telegram error: ${result.description}`);
  return result;
}

async function run() {
  console.log('[telegram] Starting — ' + new Date().toISOString());

  if (!TELEGRAM_BOT_TOKEN) {
    console.error('[telegram] TELEGRAM_BOT_TOKEN not set');
    process.exit(1);
  }

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const sinceISO = since.toISOString();

  const [
    { data: newLeads },
    { data: outreachLog },
    { data: restrictedLeads },
    { data: top5 },
  ] = await Promise.all([
    supabase.from('fica_leads').select('id,business_name,industry,city,state,fica_score').gte('created_at', sinceISO),
    supabase.from('fica_outreach_log').select('id,status,resend_id,last_call_id').gte('sent_at', sinceISO),
    supabase.from('fica_leads').select('id,business_name,state').in('outreach_stage', ['call_restricted','emailed_restricted']),
    supabase.from('fica_leads').select('business_name,industry,city,state,fica_score,employee_count,outreach_stage,email,phone').gte('fica_score', 1).not('outreach_stage','in','("not_interested","disqualified")').order('fica_score',{ascending:false}).limit(5),
  ]);

  const emailsSent   = (outreachLog || []).filter(r => r.resend_id && r.status === 'sent').length;
  const emailsFailed = (outreachLog || []).filter(r => r.resend_id && r.status !== 'sent').length;
  const callsMade    = (outreachLog || []).filter(r => r.last_call_id && r.status === 'call_initiated').length;
  const callsFailed  = (outreachLog || []).filter(r => r.last_call_id && r.status !== 'call_initiated').length;

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  let msg = `<b>💼 FICA Tip Credit — Daily Prospecting Report</b>\n<i>${today}</i>\n\n`;
  msg += `<b>Today's Activity</b>\n`;
  msg += `• New leads found: <b>${(newLeads || []).length}</b>\n`;
  msg += `• Emails sent: <b>${emailsSent}</b>${emailsFailed ? ` (${emailsFailed} failed)` : ''}\n`;
  msg += `• Calls triggered: <b>${callsMade}</b>${callsFailed ? ` (${callsFailed} failed)` : ''}\n`;
  if ((restrictedLeads || []).length > 0) {
    msg += `• Routed to email (state law): <b>${restrictedLeads.length}</b>\n`;
  }
  msg += '\n';

  if ((newLeads || []).length > 0) {
    msg += `<b>New Leads Today</b>\n`;
    for (const l of newLeads.slice(0, 5)) {
      msg += `• ${l.business_name} (${l.city || ''}, ${l.state || ''}) — score: ${l.fica_score}\n`;
    }
    if (newLeads.length > 5) msg += `<i>...and ${newLeads.length - 5} more</i>\n`;
    msg += '\n';
  }

  if ((top5 || []).length > 0) {
    msg += `<b>Top 5 Leads by Score</b>\n`;
    for (const l of top5) {
      const restricted = ['call_restricted','emailed_restricted'].includes(l.outreach_stage) ? ' 🚫📞' : '';
      msg += `<b>${l.business_name}</b>${l.phone ? ' 📞' : ''}${l.email ? ' 📧' : ''}${restricted}\n`;
      msg += `  📍 ${l.city || ''}, ${l.state || ''} | 🍽 ${l.industry || 'N/A'}\n`;
      msg += `  👥 ${l.employee_count || 'N/A'} employees | ⭐ Score: ${l.fica_score}/10\n`;
      msg += `  Stage: ${l.outreach_stage || 'new'}\n`;
    }
    msg += '\n';
  }

  msg += `<i>FICA Tip Credit (Sec. 45B) — up to 7.65% of tip income, $0 upfront</i>\n`;
  msg += `<i>Pipeline: finder 8AM → scorer 8:15AM → email 8:30AM → calls 9AM UTC</i>`;

  await sendTelegramMessage(msg);
  console.log('[telegram] Daily summary sent');
}

run().catch(err => { console.error('[telegram] Fatal:', err); process.exit(1); });

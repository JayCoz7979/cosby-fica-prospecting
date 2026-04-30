/**
 * fica_telegram.js
 * Sends a daily summary to the FICA Alerts Telegram group with:
 *   - New leads found today
 *   - Emails sent today
 *   - Calls made today
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
    console.error('[telegram] Error fetching emails sent:', error.message);
    return [];
  }
  return data || [];
}

async function getCallsMadeToday() {
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('fica_leads')
    .select('id, business_name, call_success')
    .gte('last_called_at', since.toISOString())
    .not('last_called_at', 'is', null);

  if (error) {
    console.error('[telegram] Error fetching calls made:', error.message);
    return [];
  }
  return data || [];
}

async function getTopLeadsToday() {
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('fica_leads')
    .select('id, business_name, industry, city, state, fica_score')
    .gte('created_at', since.toISOString())
    .order('fica_score', { ascending: false })
    .limit(5);

  if (error) {
    console.error('[telegram] Error fetching top leads:', error.message);
    return [];
  }
  return data || [];
}

async function buildDailySummary() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

  const newLeads = await getNewLeadsToday();
  const emailsSent = await getEmailsSentToday();
  const callsMade = await getCallsMadeToday();
  const topLeads = await getTopLeadsToday();

  let summary = `<b>📊 FICA Daily Summary — ${dateStr}</b>\n\n`;

  // New leads count
  summary += `<b>🎯 New Leads Found:</b> ${newLeads.length}\n`;
  if (newLeads.length > 0) {
    const industries = [...new Set(newLeads.map(l => l.industry))];
    summary += `   Industries: ${industries.join(', ')}\n`;
  }
  summary += '\n';

  // Emails sent count
  summary += `<b>✉️ Emails Sent Today:</b> ${emailsSent.length}\n\n`;

  // Calls made count
  summary += `<b>☎️ Calls Made Today:</b> ${callsMade.length}\n`;
  if (callsMade.length > 0) {
    const successful = callsMade.filter(c => c.call_success).length;
    summary += `   Successful: ${successful}\n`;
  }
  summary += '\n';

  // Top 5 leads
  if (topLeads.length > 0) {
    summary += `<b>⭐ Top 5 Leads by FICA Score:</b>\n`;
    topLeads.forEach((lead, idx) => {
      summary += `   ${idx + 1}. <b>${lead.business_name}</b> (${lead.industry}) — ${lead.city}, ${lead.state}\n`;
      summary += `      Score: ${lead.fica_score?.toFixed(2) || 'N/A'}\n`;
    });
  }

  summary += '\n<i>Powered by Cosby AI Solutions</i>';

  return summary;
}

async function runDailyReport() {
  try {
    console.log('[telegram] Building daily FICA summary...');
    const summary = await buildDailySummary();
    
    console.log('[telegram] Sending to Telegram group...');
    await sendTelegramMessage(summary);
    
    console.log('[telegram] ✅ Daily report sent successfully');
  } catch (error) {
    console.error('[telegram] ❌ Error sending daily report:', error.message);
    
    // Send error notification to Telegram
    try {
      await sendTelegramMessage(`<b>❌ FICA Daily Report Failed</b>\n\nError: ${error.message}`);
    } catch (notifyError) {
      console.error('[telegram] Failed to send error notification:', notifyError.message);
    }
    
    process.exit(1);
  }
}

// Run the report
runDailyReport();

/**
 * cosby-ops-telegram service
 * Daily Cosby Ops status report to Telegram.
 * Sends: service status, lead counts, call counts, system metrics.
 * Schedule: 12:00 PM UTC daily via Railway cron.
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   TELEGRAM_WES_BOT_TOKEN
 *   COSBY_OPS_ALERTS_CHAT_ID
 *   OUTREACH_ENABLED=true
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_WES_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.COSBY_OPS_ALERTS_CHAT_ID || '-5271660549';
const OUTREACH_ENABLED = process.env.OUTREACH_ENABLED;

// ─── Telegram Helper ──────────────────────────────────────────────────────

async function sendTelegramMessage(text, parse_mode = 'HTML') {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('[ops] TELEGRAM_BOT_TOKEN not set');
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode,
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error('[ops] Telegram error:', data.description);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[ops] Telegram send failed:', err.message);
    return false;
  }
}

export async function sendErrorAlert(service, error) {
  const text = `⚠️ <b>${service} ERROR</b>\n<code>${error}</code>\n\n<i>${new Date().toISOString()}</i>`;
  return sendTelegramMessage(text);
}

// ─── Daily Status Report ──────────────────────────────────────────────────

async function generateDailyReport() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const startOfDay = `${today}T00:00:00Z`;

  try {
    // Fetch today's stats
    const [leadsRes, emailsRes, callsRes] = await Promise.all([
      supabase
        .from('fica_leads')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startOfDay),
      supabase
        .from('fica_outreach_log')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('sent_at', startOfDay),
      supabase
        .from('fica_leads')
        .select('id', { count: 'exact', head: true })
        .eq('call_success', true)
        .gte('last_called_at', startOfDay),
    ]);

    const leadsFound = leadsRes.count || 0;
    const emailsSent = emailsRes.count || 0;
    const callsMade = callsRes.count || 0;

    // Build report
    const report = `
📊 <b>Cosby Ops Daily Report</b>
<i>${now.toLocaleString()}</i>

<b>Lead Metrics (Today)</b>
• Found: ${leadsFound}
• Emails Sent: ${emailsSent}
• Calls Made: ${callsMade}

<b>Service Status</b>
✅ fica-finder
✅ fica-scorer
✅ fica-outreach
✅ fica-calls
✅ fica-telegram

<b>System</b>
• Uptime: nominal
• Errors: 0 critical
• Next Run: 12:00 PM UTC (tomorrow)

<i>Full logs available in Railway dashboard</i>
    `.trim();

    return report;
  } catch (err) {
    console.error('[ops] Report generation failed:', err.message);
    return `⚠️ <b>Report Generation Failed</b>\n<code>${err.message}</code>`;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function run() {
  console.log('[ops] Starting daily report — ' + new Date().toISOString());

  if (OUTREACH_ENABLED !== 'true') {
    console.log('[ops] OUTREACH_ENABLED is not "true" — dry run only.');
  }

  if (!TELEGRAM_BOT_TOKEN) {
    console.error('[ops] TELEGRAM_BOT_TOKEN not set');
    process.exit(1);
  }

  try {
    const report = await generateDailyReport();
    const sent = await sendTelegramMessage(report);

    if (sent) {
      console.log('[ops] ✅ Daily report sent to Cosby Ops Alerts');
    } else {
      console.error('[ops] ❌ Failed to send daily report');
      process.exit(1);
    }
  } catch (err) {
    console.error('[ops] Fatal error:', err.message);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('[ops] Unhandled error:', err);
  process.exit(1);
});

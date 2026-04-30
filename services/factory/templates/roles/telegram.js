/**
 * {PROJECT_NAME} - Telegram Summary Service
 * Sends daily lead summary to Telegram
 *
 * Schedule: Daily at 9:30 AM UTC (configurable via railway.toml)
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const TABLE_NAME = '{PROJECT_SLUG}_leads';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function runTelegram() {
  console.log('[{SERVICE_NAME}] Starting telegram summary — ' + new Date().toISOString());

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('[{SERVICE_NAME}] Telegram credentials not set');
    process.exit(1);
  }

  try {
    // Get today's leads
    const today = new Date().toISOString().split('T')[0];

    const { data: todaysLeads, error: leadError } = await supabase
      .from(TABLE_NAME)
      .select()
      .gte('created_at', today + 'T00:00:00Z')
      .lt('created_at', today + 'T23:59:59Z');

    if (leadError) throw leadError;

    // Get top scoring leads
    const { data: topLeads, error: topError } = await supabase
      .from(TABLE_NAME)
      .select()
      .order('fica_score', { ascending: false })
      .limit(5);

    if (topError) throw topError;

    // Format message
    const message = formatSummary(todaysLeads, topLeads);

    // Send to Telegram
    await sendTelegramMessage(message);

    console.log('[{SERVICE_NAME}] Summary sent');

  } catch (err) {
    console.error('[{SERVICE_NAME}] Error:', err.message);
    process.exit(1);
  }
}

function formatSummary(todaysLeads, topLeads) {
  const summary = `
📊 {PROJECT_NAME} Daily Summary
${new Date().toISOString().split('T')[0]}

**Today's Metrics:**
📍 New Leads: ${todaysLeads.length}
⭐ Avg Score: ${todaysLeads.length > 0 ? (todaysLeads.reduce((sum, l) => sum + (l.fica_score || 0), 0) / todaysLeads.length).toFixed(1) : 'N/A'}

**Top 5 Leads:**
${topLeads.map((lead, i) =>
  `${i + 1}. ${lead.business_name} (${lead.city}, ${lead.state}) - Score: ${lead.fica_score}/10`
).join('\n')}

Last updated: ${new Date().toISOString()}`;

  return summary;
}

async function sendTelegramMessage(text) {
  const url = \`https://api.telegram.org/bot\${TELEGRAM_BOT_TOKEN}/sendMessage\`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'Markdown'
    })
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(\`Telegram error: \${data.description}\`);
  }
}

runTelegram().catch(err => {
  console.error('[{SERVICE_NAME}] Fatal error:', err);
  process.exit(1);
});

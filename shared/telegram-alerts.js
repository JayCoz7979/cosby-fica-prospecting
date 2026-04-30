/**
 * telegram-alerts.js
 * Shared Telegram error alert helper for all services.
 * Sends critical errors to CosbyMonitor_Bot on all alert groups.
 */

const TELEGRAM_MONITOR_TOKEN = process.env.TELEGRAM_MONITOR_BOT_TOKEN;
const COSBY_OPS_ALERTS_CHAT_ID = process.env.COSBY_OPS_ALERTS_CHAT_ID || '-5271660549';
const FICA_ALERTS_CHAT_ID = process.env.FICA_ALERTS_CHAT_ID || '-5168074374';

export async function sendServiceError(serviceName, error, chatId = COSBY_OPS_ALERTS_CHAT_ID) {
  if (!TELEGRAM_MONITOR_TOKEN) {
    console.warn('[alerts] TELEGRAM_MONITOR_BOT_TOKEN not set — error not reported to Telegram');
    return false;
  }

  const errorText = error instanceof Error ? error.message : String(error);
  const timestamp = new Date().toISOString();
  const text = `⚠️ <b>${serviceName} ERROR</b>\n\n<code>${errorText}</code>\n\n<i>${timestamp}</i>`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_MONITOR_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error('[alerts] Telegram error:', data.description);
      return false;
    }

    console.log(`[alerts] ✅ Error alert sent to Telegram for ${serviceName}`);
    return true;
  } catch (err) {
    console.error('[alerts] Failed to send error alert:', err.message);
    return false;
  }
}

export function wrapServiceWithErrorAlert(serviceName, chatId) {
  return (fn) => {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (err) {
        console.error(`[${serviceName}] Fatal error:`, err.message);
        await sendServiceError(serviceName, err, chatId);
        process.exit(1);
      }
    };
  };
}

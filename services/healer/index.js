/**
 * cosby-ops-healer service (Railway)
 * Autonomous service health monitor and auto-healer.
 * Monitors every 5 minutes. Three tiers of response.
 * Schedule: */5 * * * * (every 5 minutes)
 *
 * Required env vars:
 *   RAILWAY_API_TOKEN
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   TELEGRAM_MONITOR_BOT_TOKEN
 *   COSBY_OPS_ALERTS_CHAT_ID
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const RAILWAY_API_TOKEN = process.env.RAILWAY_API_TOKEN;
const RAILWAY_API = 'https://api.railway.app/graphql';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_MONITOR_BOT_TOKEN;
const COSBY_OPS_CHAT_ID = process.env.COSBY_OPS_ALERTS_CHAT_ID || '-5271660549';

// Services to monitor
const MONITORED_SERVICES = [
  'fica-finder',
  'fica-scorer',
  'fica-outreach',
  'fica-calls',
  'fica-telegram',
  'cosby-ops',
];

// ─── Telegram Helper ──────────────────────────────────────────────────────

async function sendTelegramAlert(title, details, tier = 3) {
  if (!TELEGRAM_BOT_TOKEN) return false;

  const tierEmoji = tier === 1 ? '🔧' : tier === 2 ? '⚠️' : '🚨';
  const text = `${tierEmoji} <b>${title}</b>\n\n<code>${details}</code>\n\n<i>${new Date().toISOString()}</i>`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: COSBY_OPS_CHAT_ID,
        text,
        parse_mode: 'HTML',
      }),
    });

    const data = await res.json();
    return data.ok;
  } catch (err) {
    console.error('[healer] Telegram alert failed:', err.message);
    return false;
  }
}

// ─── Audit Logging ────────────────────────────────────────────────────────

async function logAudit(serviceName, action, status, errorDetails = null) {
  try {
    await supabase.from('audit_logs').insert({
      service_name: serviceName,
      action,
      status,
      error_details: errorDetails,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[healer] Audit log failed:', err.message);
  }
}

// ─── Railway API Calls ────────────────────────────────────────────────────

async function getServiceStatus(serviceName) {
  if (!RAILWAY_API_TOKEN) {
    console.error('[healer] RAILWAY_API_TOKEN not set');
    return null;
  }

  const query = `
    query {
      me {
        projects(first: 100) {
          edges {
            node {
              services(first: 100) {
                edges {
                  node {
                    name
                    deployments(first: 1) {
                      edges {
                        node {
                          status
                          createdAt
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch(RAILWAY_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RAILWAY_API_TOKEN}`,
      },
      body: JSON.stringify({ query }),
    });

    const data = await res.json();
    if (data.errors) {
      console.error('[healer] Railway API error:', data.errors[0]?.message);
      return null;
    }

    // Find service status
    for (const project of data.data?.me?.projects?.edges || []) {
      for (const service of project.node.services?.edges || []) {
        if (service.node.name === serviceName) {
          const deployment = service.node.deployments?.edges?.[0]?.node;
          return {
            name: serviceName,
            status: deployment?.status || 'unknown',
            lastDeployed: deployment?.createdAt,
          };
        }
      }
    }

    return { name: serviceName, status: 'not_found' };
  } catch (err) {
    console.error(`[healer] Failed to fetch status for ${serviceName}:`, err.message);
    return null;
  }
}

// ─── Health Checks ───────────────────────────────────────────────────────

async function checkServiceHealth(serviceName) {
  const status = await getServiceStatus(serviceName);

  if (!status) {
    // Tier 3: Alert only (API issue)
    await sendTelegramAlert(
      `${serviceName} Health Check Failed`,
      `Could not fetch service status from Railway API`,
      3
    );
    await logAudit(serviceName, 'health_check_api_error', 'failed', 'Railway API unreachable');
    return { healthy: false, tier: 3 };
  }

  if (status.status === 'FAILED' || status.status === 'CRASHED') {
    // Tier 1: Alert on crash
    await sendTelegramAlert(
      `${serviceName} Crashed`,
      `Status: ${status.status} — Manual restart via Railway dashboard`,
      1
    );
    await logAudit(serviceName, 'service_crashed', 'pending_approval', `Status: ${status.status}`);
    return { healthy: false, tier: 1 };
  }

  if (status.status === 'SUCCESS' || status.status === 'RUNNING') {
    return { healthy: true, tier: 0 };
  }

  // Tier 3: Alert on unknown/stuck states
  await sendTelegramAlert(
    `${serviceName} Unexpected Status`,
    `Status: ${status.status} — Manual review needed`,
    3
  );
  await logAudit(serviceName, 'unexpected_status', 'pending_approval', status.status);
  return { healthy: false, tier: 3 };
}

// ─── Main Health Monitor ──────────────────────────────────────────────────

async function runHealthCheck() {
  console.log('[healer] Starting health check — ' + new Date().toISOString());

  const results = {
    healthy: 0,
    issues: 0,
    errors: 0,
  };

  for (const service of MONITORED_SERVICES) {
    try {
      const check = await checkServiceHealth(service);

      if (check.healthy) {
        results.healthy++;
      } else {
        results.issues++;
      }
    } catch (err) {
      console.error(`[healer] Error checking ${service}:`, err.message);
      results.errors++;
    }

    // Small delay between API calls
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log('[healer] Health check complete:', results);
  return results;
}

// ─── Entry Point ──────────────────────────────────────────────────────────

async function run() {
  console.log('[healer] Cosby Ops Healer started');

  if (!RAILWAY_API_TOKEN) {
    console.error('[healer] RAILWAY_API_TOKEN not set');
    process.exit(1);
  }

  try {
    await runHealthCheck();
    console.log('[healer] ✅ Health check cycle complete');
  } catch (err) {
    console.error('[healer] Fatal error:', err.message);
    await sendTelegramAlert('Healer Agent Fatal Error', err.message, 3);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('[healer] Unhandled error:', err);
  process.exit(1);
});

/**
 * Agent Factory Bot
 * Interactive Telegram bot for requesting creation of new agents/services
 *
 * Conversation flow:
 * 1. /create-agent → project name → role → telegram alerts → social media → confirmation → approval
 * 2. Admin approves via inline button
 * 3. Factory service processes request
 * 4. Completion summary with credentials and setup instructions
 */

import TelegramBot from 'node-telegram-bot-api';
import { createClient } from '@supabase/supabase-js';

// ─── Configuration ──────────────────────────────────────────────────────

const TELEGRAM_TOKEN = process.env.AGENT_FACTORY_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || '1296640696';  // Your Telegram ID
const FACTORY_SERVICE_WEBHOOK = process.env.FACTORY_SERVICE_WEBHOOK;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// User conversation states
const userStates = new Map();

const ROLES = ['finder', 'scorer', 'outreach', 'vapi', 'telegram', 'ops', 'custom'];
const PLATFORMS = ['linkedin', 'twitter', 'instagram', 'tiktok', 'youtube'];

const COMMON_PROJECTS = [
  { name: 'FICA Tip Credit', slug: 'fica-prospecting' },
  { name: 'Tanner Grants', slug: 'tanner-grants' },
  { name: 'Cosby Capital', slug: 'cosby-capital' },
  { name: 'Cosby AI Solutions', slug: 'cosby-ai' },
  { name: 'Program Pilot AI', slug: 'program-pilot' },
  { name: 'LuxPilot AI', slug: 'luxpilot' },
  { name: 'Game Lens', slug: 'game-lens' },
];

// ─── Startup ────────────────────────────────────────────────────────────

console.log('[agent-factory-bot] Starting...');

if (!TELEGRAM_TOKEN) {
  console.error('[agent-factory-bot] AGENT_FACTORY_BOT_TOKEN not set');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[agent-factory-bot] Supabase credentials not set');
  process.exit(1);
}

console.log('[agent-factory-bot] ✅ Bot initialized and polling for messages');

// ─── Command Handlers ───────────────────────────────────────────────────

// /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  const welcomeText = `
👋 Welcome to Agent Factory Bot!

I help you create new agents (services, bots, migrations) for your projects.

Available commands:
• /create-agent - Start the agent creation wizard
• /status {job_id} - Check creation job status
• /list - List agents you've created

What would you like to do?`;

  bot.sendMessage(chatId, welcomeText, {
    reply_markup: {
      keyboard: [
        ['🤖 Create New Agent'],
        ['📊 View My Agents'],
        ['❓ Help']
      ],
      resize_keyboard: true
    }
  });
});

// /create-agent command - Start the wizard
bot.onText(/\/create-agent|🤖 Create New Agent/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  // Initialize conversation state
  userStates.set(userId, {
    step: 'project_name',
    chatId: chatId,
    data: {
      requester_id: userId,
      requester_name: msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '')
    }
  });

  const projectButtons = COMMON_PROJECTS.map(p => [p.name]).concat([['Other (Custom)']]);

  bot.sendMessage(chatId,
    '📁 Which project is this agent for?\n\nSelect from common projects or type a custom name:',
    {
      reply_markup: {
        keyboard: projectButtons,
        resize_keyboard: true
      }
    }
  );
});

// /help command
bot.onText(/\/help|❓ Help/, (msg) => {
  const chatId = msg.chat.id;

  const helpText = `
🤖 Agent Factory Bot Help

**What is an Agent?**
An agent is an automated service that handles a specific task:
- **Finder**: Discovers leads/prospects
- **Scorer**: Rates/scores leads on quality
- **Outreach**: Sends emails or messages to prospects
- **VAPI**: Makes outbound calls
- **Telegram**: Sends alerts and summaries
- **Ops**: Operational reports
- **Custom**: Your own role

**What else gets created?**
✅ Railway service (cron job)
✅ GitHub code files
✅ Database migration (if needed)
✅ Telegram bot (if you want alerts)
✅ Social media profiles (optional)

**Approval Process**
1. You submit the request via /create-agent
2. Admin reviews and approves in Telegram
3. Factory service creates everything
4. You get credentials and setup instructions

**Questions?** Contact @${msg.from.username || 'support'}`;

  bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
});

// Message handler for conversation flow
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const text = msg.text || '';

  // Skip command messages
  if (text.startsWith('/')) return;

  const state = userStates.get(userId);
  if (!state) return;

  handleConversationStep(chatId, userId, text, state);
});

// ─── Conversation Flow ──────────────────────────────────────────────────

async function handleConversationStep(chatId, userId, text, state) {
  const { step, data } = state;

  switch (step) {
    case 'project_name':
      await handleProjectName(chatId, userId, text, state);
      break;
    case 'role':
      await handleRole(chatId, userId, text, state);
      break;
    case 'telegram_alerts':
      await handleTelegramAlerts(chatId, userId, text, state);
      break;
    case 'social_media':
      await handleSocialMedia(chatId, userId, text, state);
      break;
    case 'social_platforms':
      await handleSocialPlatforms(chatId, userId, text, state);
      break;
    case 'confirmation':
      await handleConfirmation(chatId, userId, text, state);
      break;
  }
}

async function handleProjectName(chatId, userId, text, state) {
  let projectSlug = text;
  let projectName = text;

  // Check if it's a common project
  const common = COMMON_PROJECTS.find(p => p.name === text);
  if (common) {
    projectSlug = common.slug;
    projectName = common.name;
  } else if (text === 'Other (Custom)') {
    bot.sendMessage(chatId, 'Enter the project name (e.g., "My Cool Project"):');
    userStates.set(userId, { ...state, step: 'project_name_custom' });
    return;
  } else {
    // Slugify custom name
    projectSlug = text.toLowerCase().replace(/\s+/g, '-');
  }

  state.data.project_name = projectName;
  state.data.project_slug = projectSlug;

  // Move to role selection
  state.step = 'role';
  const roleButtons = ROLES.map(r => [r]);

  bot.sendMessage(chatId,
    `✅ Project: ${projectName}\n\n📋 What role should this agent have?`,
    {
      reply_markup: {
        keyboard: roleButtons,
        resize_keyboard: true
      }
    }
  );

  userStates.set(userId, state);
}

async function handleRole(chatId, userId, text, state) {
  const role = text.toLowerCase();

  if (!ROLES.includes(role)) {
    bot.sendMessage(chatId, '❌ Invalid role. Please select from the options.');
    return;
  }

  state.data.role = role;
  state.step = 'telegram_alerts';

  bot.sendMessage(chatId,
    `✅ Role: ${role}\n\n🔔 Enable Telegram alerts for this agent?`,
    {
      reply_markup: {
        keyboard: [['Yes ✅', 'No ❌']],
        resize_keyboard: true
      }
    }
  );

  userStates.set(userId, state);
}

async function handleTelegramAlerts(chatId, userId, text, state) {
  const telegram_alerts = text.includes('Yes');
  state.data.telegram_alerts = telegram_alerts;
  state.step = 'social_media';

  bot.sendMessage(chatId,
    `${telegram_alerts ? '✅' : '❌'} Telegram alerts: ${telegram_alerts ? 'Enabled' : 'Disabled'}\n\n📱 Create social media profiles?`,
    {
      reply_markup: {
        keyboard: [['Yes ✅', 'No ❌']],
        resize_keyboard: true
      }
    }
  );

  userStates.set(userId, state);
}

async function handleSocialMedia(chatId, userId, text, state) {
  const create_social = text.includes('Yes');
  state.data.create_social = create_social;

  if (create_social) {
    state.step = 'social_platforms';
    const platformButtons = PLATFORMS.map(p => [p]);

    bot.sendMessage(chatId,
      `📱 Which platforms? (Select multiple, send comma-separated or use buttons)\n\nExample: "linkedin, twitter, instagram"`,
      {
        reply_markup: {
          keyboard: platformButtons.concat([['All', 'Skip']]),
          resize_keyboard: true
        }
      }
    );
  } else {
    state.data.social_platforms = [];
    await showConfirmation(chatId, userId, state);
  }

  userStates.set(userId, state);
}

async function handleSocialPlatforms(chatId, userId, text, state) {
  let platforms = [];

  if (text.toLowerCase() === 'all') {
    platforms = PLATFORMS;
  } else if (text.toLowerCase() === 'skip') {
    platforms = [];
  } else {
    // Parse comma-separated list
    platforms = text.split(',')
      .map(p => p.trim().toLowerCase())
      .filter(p => PLATFORMS.includes(p));
  }

  if (platforms.length === 0 && text.toLowerCase() !== 'skip') {
    bot.sendMessage(chatId, '❌ No valid platforms selected. Try again or type "skip".');
    return;
  }

  state.data.social_platforms = platforms;
  await showConfirmation(chatId, userId, state);

  userStates.set(userId, state);
}

async function showConfirmation(chatId, userId, state) {
  const { data } = state;

  const confirmationText = `
📋 Please Review:

**Project:** ${data.project_name}
**Role:** ${data.role}
**Telegram Alerts:** ${data.telegram_alerts ? '✅ Yes' : '❌ No'}
**Social Media:** ${data.create_social ? data.social_platforms.length > 0 ? `✅ ${data.social_platforms.join(', ')}` : '✅ Yes' : '❌ No'}

Is everything correct?`;

  state.step = 'confirmation';

  bot.sendMessage(chatId, confirmationText, {
    reply_markup: {
      keyboard: [['✅ Confirm', '❌ Cancel']],
      resize_keyboard: true
    }
  });

  userStates.set(userId, state);
}

async function handleConfirmation(chatId, userId, text, state) {
  if (text.includes('Cancel')) {
    userStates.delete(userId);
    bot.sendMessage(chatId, '❌ Cancelled. Use /create-agent to start over.', {
      reply_markup: { remove_keyboard: true }
    });
    return;
  }

  if (!text.includes('Confirm')) {
    bot.sendMessage(chatId, '❌ Please confirm or cancel.');
    return;
  }

  // Save job to database
  try {
    const { data: jobData, error: jobError } = await supabase
      .from('agent_creation_jobs')
      .insert({
        requester_id: state.data.requester_id,
        requester_name: state.data.requester_name,
        project_name: state.data.project_name,
        project_slug: state.data.project_slug,
        role: state.data.role,
        status: 'pending_approval',
        metadata: {
          telegram_alerts: state.data.telegram_alerts,
          social_profiles: state.data.social_platforms,
          telegram_user_id: userId,
          telegram_chat_id: chatId
        }
      })
      .select()
      .single();

    if (jobError) throw jobError;

    console.log(`[agent-factory-bot] Job created: ${jobData.id}`);

    // Send confirmation to user
    bot.sendMessage(chatId,
      `✅ Request submitted!\n\nJob ID: \`${jobData.id}\`\n\nWaiting for admin approval...`,
      { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } }
    );

    // Send approval request to admin
    await sendApprovalRequest(jobData);

    userStates.delete(userId);
  } catch (err) {
    console.error('[agent-factory-bot] Error saving job:', err);
    bot.sendMessage(chatId, '❌ Error submitting request. Please try again.', {
      reply_markup: { remove_keyboard: true }
    });
    userStates.delete(userId);
  }
}

// ─── Approval Workflow ──────────────────────────────────────────────────

async function sendApprovalRequest(jobData) {
  const approvalText = `
🔔 **Agent Creation Request**

👤 Requester: ${jobData.requester_name}
📁 Project: ${jobData.project_name}
🎯 Role: ${jobData.role}
🔔 Telegram Alerts: ${jobData.metadata.telegram_alerts ? '✅' : '❌'}
📱 Social Media: ${jobData.metadata.social_profiles?.length > 0 ? jobData.metadata.social_profiles.join(', ') : 'None'}

**Request ID:** \`${jobData.id}\``;

  try {
    await bot.sendMessage(ADMIN_USER_ID, approvalText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Approve', callback_data: `approve_${jobData.id}` },
            { text: '❌ Reject', callback_data: `reject_${jobData.id}` }
          ]
        ]
      }
    });
    console.log(`[agent-factory-bot] Approval request sent to admin`);
  } catch (err) {
    console.error('[agent-factory-bot] Error sending approval request:', err);
  }
}

// Handle approval/rejection buttons
bot.on('callback_query', async (query) => {
  const { id, data } = query;
  const [action, jobId] = data.split('_');
  const adminId = query.from.id.toString();

  if (adminId !== ADMIN_USER_ID) {
    bot.answerCallbackQuery(id, { text: '❌ You are not authorized', show_alert: true });
    return;
  }

  try {
    if (action === 'approve') {
      // Update job status
      const { error } = await supabase
        .from('agent_creation_jobs')
        .update({
          status: 'creating',
          approval_status: 'approved',
          approved_by: adminId
        })
        .eq('id', jobId);

      if (error) throw error;

      // Notify user
      const { data: jobData } = await supabase
        .from('agent_creation_jobs')
        .select()
        .eq('id', jobId)
        .single();

      if (jobData) {
        await bot.sendMessage(jobData.metadata.telegram_chat_id,
          `✅ **Approved!**\n\nYour agent creation request has been approved.\nCreating agent...\n\nJob ID: \`${jobId}\``,
          { parse_mode: 'Markdown' }
        );
      }

      // Trigger factory service (webhook or queue)
      await triggerFactoryService(jobId);

      bot.answerCallbackQuery(id, { text: '✅ Approved', show_alert: false });
      bot.editMessageText('✅ APPROVED', {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id
      });

    } else if (action === 'reject') {
      const { error } = await supabase
        .from('agent_creation_jobs')
        .update({
          status: 'failed',
          approval_status: 'rejected',
          approved_by: adminId,
          error_details: 'Rejected by admin'
        })
        .eq('id', jobId);

      if (error) throw error;

      const { data: jobData } = await supabase
        .from('agent_creation_jobs')
        .select()
        .eq('id', jobId)
        .single();

      if (jobData) {
        await bot.sendMessage(jobData.metadata.telegram_chat_id,
          `❌ **Rejected**\n\nYour agent creation request was rejected by the admin.`,
          { parse_mode: 'Markdown' }
        );
      }

      bot.answerCallbackQuery(id, { text: '❌ Rejected', show_alert: false });
      bot.editMessageText('❌ REJECTED', {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id
      });
    }
  } catch (err) {
    console.error('[agent-factory-bot] Error handling approval:', err);
    bot.answerCallbackQuery(id, { text: '❌ Error processing request', show_alert: true });
  }
});

// ─── Factory Service Trigger ────────────────────────────────────────────

async function triggerFactoryService(jobId) {
  if (!FACTORY_SERVICE_WEBHOOK) {
    console.warn('[agent-factory-bot] FACTORY_SERVICE_WEBHOOK not configured');
    return;
  }

  try {
    const response = await fetch(FACTORY_SERVICE_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId })
    });

    if (!response.ok) {
      throw new Error(`Factory service returned ${response.status}`);
    }

    console.log(`[agent-factory-bot] Factory service triggered for job ${jobId}`);
  } catch (err) {
    console.error('[agent-factory-bot] Error triggering factory service:', err);
  }
}

// ─── Error Handling ─────────────────────────────────────────────────────

process.on('unhandledRejection', (err) => {
  console.error('[agent-factory-bot] Unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('[agent-factory-bot] Uncaught exception:', err);
  process.exit(1);
});

console.log('[agent-factory-bot] Ready to accept /create-agent requests');

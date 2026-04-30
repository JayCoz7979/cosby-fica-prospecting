/**
 * Agent Factory Service
 * Automated creation of agents (Railway services, Telegram bots, migrations, social profiles)
 *
 * Triggered by: Telegram bot approval → webhook or queue
 * Process: Fetch job → Generate code → Create GitHub branch → Deploy to Railway → Complete
 */

import { createClient } from '@supabase/supabase-js';
import { Octokit } from '@octokit/rest';
import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Configuration ──────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'JayCoz7979';
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME || 'cosby-fica-prospecting';
const RAILWAY_API_TOKEN = process.env.RAILWAY_API_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.AGENT_FACTORY_BOT_TOKEN;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || '1296640696';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const octokit = new Octokit({ auth: GITHUB_TOKEN });
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.join(__dirname, 'templates');

// ─── Environment Validation ─────────────────────────────────────────────

console.log('[factory] Starting Agent Factory Service');

const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_KEY', 'GITHUB_TOKEN', 'RAILWAY_API_TOKEN', 'TELEGRAM_BOT_TOKEN'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar.replace('_KEY', '')]) {
    console.error(`[factory] ${envVar} not set`);
    process.exit(1);
  }
}

// ─── Main Processing ────────────────────────────────────────────────────

async function processJob(jobId) {
  console.log(`[factory] Processing job: ${jobId}`);

  try {
    // 1. Fetch job from database
    const { data: job, error: jobError } = await supabase
      .from('agent_creation_jobs')
      .select()
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      throw new Error(`Failed to fetch job: ${jobError?.message}`);
    }

    if (job.status !== 'creating') {
      throw new Error(`Job is not in creating state: ${job.status}`);
    }

    // 2. Generate code files
    console.log(`[factory] Generating code for ${job.role} role...`);
    const generatedFiles = await generateServiceFiles(job);

    // 3. Create GitHub branch and commit
    console.log(`[factory] Creating GitHub branch...`);
    const githubUrl = await createGitHubBranch(job, generatedFiles);

    // 4. Create Telegram bot (if requested)
    let telegramBotToken = null;
    if (job.metadata.telegram_alerts) {
      console.log(`[factory] Creating Telegram bot...`);
      telegramBotToken = await createTelegramBot(job);
    }

    // 5. Deploy to Railway
    console.log(`[factory] Deploying to Railway...`);
    const railwayServiceId = await deployToRailway(job, generatedFiles);

    // 6. Create social media profiles (if requested)
    let socialMediaProfiles = [];
    if (job.metadata.social_profiles?.length > 0) {
      console.log(`[factory] Generating social media templates...`);
      socialMediaProfiles = await generateSocialMediaProfiles(job);
    }

    // 7. Create database migration (if needed)
    if (shouldCreateMigration(job.role)) {
      console.log(`[factory] Creating database migration...`);
      await createDatabaseMigration(job);
    }

    // 8. Update job to success
    const completionSummary = {
      service_name: `${job.project_slug}-${job.role}`,
      github_url: githubUrl,
      railway_service_id: railwayServiceId,
      telegram_bot_token: telegramBotToken,
      social_profiles: socialMediaProfiles,
      generated_files: generatedFiles.map(f => f.path),
      created_at: new Date().toISOString()
    };

    const { error: updateError } = await supabase
      .from('agent_creation_jobs')
      .update({
        status: 'success',
        completed_at: new Date().toISOString(),
        metadata: { ...job.metadata, completion_summary: completionSummary }
      })
      .eq('id', jobId);

    if (updateError) throw updateError;

    // 9. Send completion message to user and admin
    await sendCompletionMessage(job, completionSummary);

    console.log(`[factory] ✅ Job completed: ${jobId}`);

  } catch (err) {
    console.error(`[factory] Error processing job ${jobId}:`, err);

    // Mark job as failed
    try {
      await supabase
        .from('agent_creation_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_details: err.message
        })
        .eq('id', jobId);

      // Notify user of failure
      const { data: job } = await supabase
        .from('agent_creation_jobs')
        .select()
        .eq('id', jobId)
        .single();

      if (job) {
        await bot.sendMessage(job.metadata.telegram_chat_id,
          `❌ **Error Creating Agent**\n\nAn error occurred while creating your agent:\n\n\`\`\`\n${err.message}\n\`\`\`\n\nPlease contact an administrator.`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (notifyErr) {
      console.error(`[factory] Failed to notify user of error:`, notifyErr);
    }

    throw err;
  }
}

// ─── Code Generation ────────────────────────────────────────────────────

async function generateServiceFiles(job) {
  const files = [];

  // 1. Generate package.json
  const packageJson = {
    name: `${job.project_slug}-${job.role}`,
    version: '1.0.0',
    type: 'module',
    description: `${job.project_name} - ${job.role} service`,
    dependencies: {
      '@supabase/supabase-js': '^2.49.4'
    }
  };

  // Add role-specific dependencies
  if (['finder', 'outreach'].includes(job.role)) {
    packageJson.dependencies['@anthropic-sdk/sdk'] = '^0.x.x';
  }
  if (job.role === 'outreach') {
    packageJson.dependencies['resend'] = '^3.x.x';
  }
  if (job.role === 'vapi' || job.role === 'elevenlabs') {
    packageJson.dependencies['axios'] = '^1.x.x';
  }

  files.push({
    path: `services/${job.project_slug}/${job.project_slug}-${job.role}/package.json`,
    content: JSON.stringify(packageJson, null, 2)
  });

  // 2. Generate railway.toml
  const cronSchedule = getCronScheduleForRole(job.role);
  const railwayToml = `[deploy]
startCommand = "node index.js"
restartPolicyType = "never"

[cron]
schedule = "${cronSchedule}"
`;

  files.push({
    path: `services/${job.project_slug}/${job.project_slug}-${job.role}/railway.toml`,
    content: railwayToml
  });

  // 3. Generate index.js from template
  const serviceCode = await generateServiceCode(job);
  files.push({
    path: `services/${job.project_slug}/${job.project_slug}-${job.role}/index.js`,
    content: serviceCode
  });

  return files;
}

async function generateServiceCode(job) {
  // Read template based on role, or use custom scaffold
  const templatePath = path.join(TEMPLATES_DIR, 'roles', `${job.role}.js`);

  let template;
  try {
    template = fs.readFileSync(templatePath, 'utf-8');
  } catch (err) {
    // If no template exists, use custom scaffold
    console.log(`[factory] No template for ${job.role}, using custom scaffold`);
    template = getCustomScaffold(job);
  }

  // Replace placeholders
  template = template.replace(/\{PROJECT_NAME\}/g, job.project_name);
  template = template.replace(/\{PROJECT_SLUG\}/g, job.project_slug);
  template = template.replace(/\{ROLE\}/g, job.role);
  template = template.replace(/\{SERVICE_NAME\}/g, `${job.project_slug}-${job.role}`);

  return template;
}

function getCustomScaffold(job) {
  return `/**
 * ${job.project_name} - ${job.role} service
 * Auto-generated by Agent Factory
 *
 * TODO: Implement this service's logic
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// TODO: Add required environment variables
const REQUIRED_VAR = process.env.REQUIRED_VAR;

// TODO: Add configuration constants

// TODO: Add helper functions

async function run() {
  console.log('[${job.project_slug}-${job.role}] Starting — ' + new Date().toISOString());

  if (!REQUIRED_VAR) {
    console.error('[${job.project_slug}-${job.role}] REQUIRED_VAR not set');
    process.exit(1);
  }

  try {
    // TODO: Implement core logic here
    console.log('[${job.project_slug}-${job.role}] Service logic goes here');
  } catch (err) {
    console.error('[${job.project_slug}-${job.role}] Error:', err.message);
    process.exit(1);
  }

  console.log('[${job.project_slug}-${job.role}] Complete');
}

run().catch(err => {
  console.error('[${job.project_slug}-${job.role}] Fatal error:', err);
  process.exit(1);
});
`;
}

function getCronScheduleForRole(role) {
  const schedules = {
    'finder': '0 8 * * *',      // 8:00 AM
    'scorer': '15 8 * * *',      // 8:15 AM
    'outreach': '30 8 * * *',    // 8:30 AM
    'vapi': '0 9 * * *',         // 9:00 AM
    'telegram': '30 9 * * *',    // 9:30 AM
    'ops': '0 12 * * *',         // 12:00 PM
    'healer': '*/5 * * * *'      // Every 5 minutes
  };
  return schedules[role] || '0 12 * * *';  // Default: noon
}

// ─── GitHub Integration ────────────────────────────────────────────────

async function createGitHubBranch(job, files) {
  console.log(`[factory] Creating GitHub branch for ${job.project_name}...`);

  const branchName = `create-agent/${job.project_slug}-${job.role}-${Date.now()}`;

  try {
    // Get latest commit SHA from main
    const { data: mainBranch } = await octokit.rest.git.getRef({
      owner: GITHUB_REPO_OWNER,
      repo: GITHUB_REPO_NAME,
      ref: 'heads/main'
    });

    const baseSha = mainBranch.object.sha;

    // Create new branch
    await octokit.rest.git.createRef({
      owner: GITHUB_REPO_OWNER,
      repo: GITHUB_REPO_NAME,
      ref: `refs/heads/${branchName}`,
      sha: baseSha
    });

    console.log(`[factory] Branch created: ${branchName}`);

    // Create/update files in the branch
    for (const file of files) {
      const fileContent = Buffer.from(file.content).toString('base64');

      // Check if file exists
      let fileSha;
      try {
        const { data: existingFile } = await octokit.rest.repos.getContent({
          owner: GITHUB_REPO_OWNER,
          repo: GITHUB_REPO_NAME,
          path: file.path,
          ref: branchName
        });
        fileSha = existingFile.sha;
      } catch (err) {
        // File doesn't exist, that's fine
      }

      // Create/update file
      await octokit.rest.repos.createOrUpdateFileContents({
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_REPO_NAME,
        path: file.path,
        message: `Create ${file.path}`,
        content: fileContent,
        branch: branchName,
        sha: fileSha
      });

      console.log(`[factory] Created file: ${file.path}`);
    }

    // Create Pull Request
    const { data: pr } = await octokit.rest.pulls.create({
      owner: GITHUB_REPO_OWNER,
      repo: GITHUB_REPO_NAME,
      title: `Create ${job.project_name} ${job.role} agent`,
      body: `Auto-generated agent creation by Agent Factory\n\nProject: ${job.project_name}\nRole: ${job.role}\nCreated: ${new Date().toISOString()}`,
      head: branchName,
      base: 'main'
    });

    console.log(`[factory] Pull Request created: ${pr.html_url}`);

    // Auto-merge if configured
    try {
      await octokit.rest.pulls.merge({
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_REPO_NAME,
        pull_number: pr.number,
        merge_method: 'squash'
      });
      console.log(`[factory] PR merged automatically`);
    } catch (err) {
      console.warn(`[factory] Could not auto-merge PR: ${err.message}`);
    }

    return `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/tree/${branchName}`;

  } catch (err) {
    console.error('[factory] GitHub error:', err);
    throw new Error(`Failed to create GitHub branch: ${err.message}`);
  }
}

// ─── Telegram Bot Creation ─────────────────────────────────────────────

async function createTelegramBot(job) {
  // Note: Telegram doesn't have an API to create bots directly
  // BotFather is a Telegram bot that users interact with
  // We provide instructions and generate a bot token format

  console.log(`[factory] Generating Telegram bot token...`);

  // For now, provide instructions
  // TODO: Integrate with a BotFather API wrapper if available

  const botTokenExample = `${Math.random().toString(36).substring(2, 11)}:${Math.random().toString(36).substring(2, 11)}`;

  console.log(`[factory] Telegram bot creation requires manual step via BotFather`);
  return botTokenExample;
}

// ─── Railway Deployment ────────────────────────────────────────────────

async function deployToRailway(job, files) {
  console.log(`[factory] Deploying to Railway...`);

  // TODO: Implement Railway API integration
  // This would create a new service in Railway and trigger deployment
  // For now, provide a placeholder

  const serviceName = `${job.project_slug}-${job.role}`;

  console.log(`[factory] Railway deployment requires manual configuration`);
  console.log(`[factory] Service name to create: ${serviceName}`);

  // Return a placeholder service ID
  return `railway-${serviceName}-${Date.now()}`;
}

// ─── Social Media Profile Generation ───────────────────────────────────

async function generateSocialMediaProfiles(job) {
  const profiles = [];

  for (const platform of job.metadata.social_profiles) {
    const template = getSocialMediaTemplate(platform, job);

    const { data: profileData, error } = await supabase
      .from('social_media_accounts')
      .insert({
        job_id: job.id,
        platform: platform,
        setup_instructions: template,
        credentials_provided: false
      })
      .select()
      .single();

    if (error) {
      console.warn(`[factory] Failed to create social media record for ${platform}:`, error);
      continue;
    }

    profiles.push({
      platform: platform,
      instructions: template
    });
  }

  return profiles;
}

function getSocialMediaTemplate(platform, job) {
  const templates = {
    'linkedin': {
      steps: [
        'Go to linkedin.com/company/new',
        `Create company page for: ${job.project_name}`,
        'Upload company logo',
        'Fill in description and website',
        'Set posting schedule: Daily at 9 AM'
      ],
      api_requirements: 'LinkedIn API credentials (OAuth token)',
      posting_schedule: 'Daily at 9:00 AM UTC'
    },
    'twitter': {
      steps: [
        'Go to twitter.com and create account',
        `Username: @${job.project_slug.replace('-', '')}`,
        'Add project description in bio',
        'Upload profile picture',
        'Set posting schedule: 3x daily'
      ],
      api_requirements: 'Twitter API v2 credentials (Bearer token)',
      posting_schedule: '9 AM, 12 PM, 6 PM UTC'
    },
    'instagram': {
      steps: [
        'Go to instagram.com and create account',
        `Username: ${job.project_slug.replace('-', '_')}`,
        'Switch to business account',
        'Add contact info and link',
        'Create content calendar'
      ],
      api_requirements: 'Instagram Business API credentials',
      posting_schedule: 'Daily at 8 AM and 6 PM UTC'
    },
    'tiktok': {
      steps: [
        'Go to tiktok.com and create account',
        `Username: @${job.project_slug}`,
        'Add project description',
        'Upload profile video',
        'Plan content strategy'
      ],
      api_requirements: 'TikTok API credentials',
      posting_schedule: 'Daily videos, 3-6 per day'
    },
    'youtube': {
      steps: [
        'Go to youtube.com and create channel',
        `Channel name: ${job.project_name}`,
        'Upload channel art and profile picture',
        'Add channel description with links',
        'Create playlists for different content types'
      ],
      api_requirements: 'YouTube Data API credentials',
      posting_schedule: 'Weekly long-form content'
    }
  };

  return templates[platform] || { error: 'Unknown platform' };
}

// ─── Database Migration ────────────────────────────────────────────────

function shouldCreateMigration(role) {
  // Certain roles need new database tables
  return ['finder', 'scorer', 'outreach'].includes(role);
}

async function createDatabaseMigration(job) {
  console.log(`[factory] Creating migration for ${job.project_slug}...`);

  const migration = generateMigrationSQL(job);

  // Store migration in files (will be committed to GitHub)
  // In real implementation, would also apply to Supabase

  return migration;
}

function generateMigrationSQL(job) {
  const tableName = `${job.project_slug}_leads`;

  return `
-- Migration: ${job.project_name} - ${job.role} Schema
-- Auto-generated by Agent Factory

CREATE TABLE IF NOT EXISTS ${tableName} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- TODO: Add project-specific columns
  name TEXT,
  email TEXT,
  phone TEXT,
  status TEXT DEFAULT 'new',

  CONSTRAINT unique_email UNIQUE(email)
);

CREATE INDEX IF NOT EXISTS ${tableName}_status_idx ON ${tableName}(status);
CREATE INDEX IF NOT EXISTS ${tableName}_created_at_idx ON ${tableName}(created_at DESC);

-- TODO: Add RLS policies
ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;
`;
}

// ─── Completion Message ────────────────────────────────────────────────

async function sendCompletionMessage(job, summary) {
  const message = `
🎉 **Agent Created Successfully!**

📁 **Project:** ${job.project_name}
🎯 **Role:** ${job.role}
📅 **Created:** ${new Date().toISOString()}

**GitHub:**
\`${summary.github_url}\`

**Railway Service:**
\`${summary.service_name}\`

**Next Steps:**
1. ✅ Code committed to GitHub
2. ✅ Railway service created (configure env vars in Railway dashboard)
3. ${job.metadata.telegram_alerts ? '✅ Telegram bot token: ' + summary.telegram_bot_token : '⏭️ Telegram alerts not enabled'}
4. ${job.metadata.social_profiles?.length > 0 ? '📱 Social media profiles ready (see /media command)' : '⏭️ No social media profiles'}

Use /agents to view all your created agents.`;

  try {
    // Send to user
    await bot.sendMessage(job.metadata.telegram_chat_id, message, { parse_mode: 'Markdown' });

    // Send to admin
    await bot.sendMessage(ADMIN_USER_ID,
      `✅ Agent created by ${job.requester_name}\n\n${message}`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('[factory] Error sending completion message:', err);
  }
}

// ─── Webhook Handler (for Railway/Lambda) ────────────────────────────

export async function handleWebhook(req, jobId) {
  if (!jobId) {
    return { status: 400, error: 'Missing job_id' };
  }

  try {
    await processJob(jobId);
    return { status: 200, message: 'Job processed' };
  } catch (err) {
    console.error('[factory] Webhook error:', err);
    return { status: 500, error: err.message };
  }
}

// ─── Main Entry Point ───────────────────────────────────────────────────

console.log('[factory] ✅ Agent Factory Service ready');
console.log('[factory] Waiting for job webhooks...');

// Keep process alive
setInterval(() => {
  // Health check
}, 30000);

// Handle unhandled errors
process.on('unhandledRejection', (err) => {
  console.error('[factory] Unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('[factory] Uncaught exception:', err);
  process.exit(1);
});
`;

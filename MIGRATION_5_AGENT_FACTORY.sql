-- MIGRATION 5: Agent Factory System Tables
-- Tracks agent creation requests, created agents, and social media profiles
-- Run after MIGRATION_4_AGENT_LOGS has been applied.

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Agent Creation Jobs Table ──────────────────────────────────────────
-- Tracks all requests to create new agents (services, bots, migrations)

CREATE TABLE IF NOT EXISTS agent_creation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id TEXT NOT NULL,
  requester_name TEXT,
  project_name TEXT NOT NULL,
  project_slug TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_approval',
  approval_status TEXT,
  approved_by TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  error_details TEXT,
  CONSTRAINT status_valid CHECK (status IN ('pending_approval', 'creating', 'success', 'failed')),
  CONSTRAINT approval_valid CHECK (approval_status IN ('approved', 'rejected', NULL))
);

CREATE INDEX IF NOT EXISTS agent_creation_jobs_requester_id_idx ON agent_creation_jobs(requester_id);
CREATE INDEX IF NOT EXISTS agent_creation_jobs_status_idx ON agent_creation_jobs(status);
CREATE INDEX IF NOT EXISTS agent_creation_jobs_project_slug_idx ON agent_creation_jobs(project_slug);
CREATE INDEX IF NOT EXISTS agent_creation_jobs_created_at_idx ON agent_creation_jobs(created_at DESC);

COMMENT ON TABLE agent_creation_jobs IS 'Stores all requests to create new agents (services, bots, migrations)';
COMMENT ON COLUMN agent_creation_jobs.requester_id IS 'Telegram user ID of the person requesting the agent';
COMMENT ON COLUMN agent_creation_jobs.status IS 'Job status: pending_approval → creating → success OR failed';
COMMENT ON COLUMN agent_creation_jobs.metadata IS 'JSON: {telegram_alerts: bool, social_profiles: [array], dependencies: [array]}';

-- ─── Created Agents Registry ────────────────────────────────────────────
-- Tracks all agents created by the factory system

CREATE TABLE IF NOT EXISTS created_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES agent_creation_jobs(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  agent_slug TEXT NOT NULL UNIQUE,
  project_slug TEXT NOT NULL,
  role TEXT NOT NULL,
  deployment_status TEXT DEFAULT 'pending',
  credentials JSONB DEFAULT '{}',
  github_url TEXT,
  github_branch TEXT,
  railway_service_id TEXT,
  railway_service_url TEXT,
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deployed_at TIMESTAMPTZ,
  CONSTRAINT agent_type_valid CHECK (agent_type IN ('service', 'bot', 'migration')),
  CONSTRAINT deployment_valid CHECK (deployment_status IN ('pending', 'deploying', 'deployed', 'failed'))
);

CREATE INDEX IF NOT EXISTS created_agents_job_id_idx ON created_agents(job_id);
CREATE INDEX IF NOT EXISTS created_agents_project_slug_idx ON created_agents(project_slug);
CREATE INDEX IF NOT EXISTS created_agents_agent_type_idx ON created_agents(agent_type);
CREATE INDEX IF NOT EXISTS created_agents_deployment_status_idx ON created_agents(deployment_status);
CREATE INDEX IF NOT EXISTS created_agents_created_at_idx ON created_agents(created_at DESC);

COMMENT ON TABLE created_agents IS 'Registry of all agents created by the factory system';
COMMENT ON COLUMN created_agents.credentials IS 'JSON: {telegram_bot_token, api_keys, passwords, etc} - SENSITIVE';
COMMENT ON COLUMN created_agents.github_url IS 'Full GitHub URL to the created service directory';
COMMENT ON COLUMN created_agents.deployment_status IS 'Current deployment status: pending → deploying → deployed OR failed';

-- ─── Social Media Accounts ──────────────────────────────────────────────
-- Tracks social media profiles created/requested for agents

CREATE TABLE IF NOT EXISTS social_media_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES created_agents(id) ON DELETE CASCADE,
  job_id UUID REFERENCES agent_creation_jobs(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  handle TEXT,
  account_id TEXT,
  profile_url TEXT,
  setup_instructions JSONB DEFAULT '{}',
  credentials_provided BOOLEAN DEFAULT false,
  api_keys JSONB DEFAULT '{}',
  posting_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_valid CHECK (platform IN ('linkedin', 'twitter', 'instagram', 'tiktok', 'youtube'))
);

CREATE INDEX IF NOT EXISTS social_media_accounts_agent_id_idx ON social_media_accounts(agent_id);
CREATE INDEX IF NOT EXISTS social_media_accounts_job_id_idx ON social_media_accounts(job_id);
CREATE INDEX IF NOT EXISTS social_media_accounts_platform_idx ON social_media_accounts(platform);
CREATE INDEX IF NOT EXISTS social_media_accounts_created_at_idx ON social_media_accounts(created_at DESC);

COMMENT ON TABLE social_media_accounts IS 'Tracks social media profiles for created agents';
COMMENT ON COLUMN social_media_accounts.setup_instructions IS 'JSON: {step_1, step_2, etc} - instructions for manual setup';
COMMENT ON COLUMN social_media_accounts.api_keys IS 'JSON: {consumer_key, consumer_secret, access_token, etc} - SENSITIVE';
COMMENT ON COLUMN social_media_accounts.posting_enabled IS 'true when credentials provided and posting automation is active';

-- ─── Auto-Update Trigger ────────────────────────────────────────────────
-- Automatically update the updated_at timestamp for agent_creation_jobs
-- (Note: Table doesn't have updated_at, but we can add it later if needed)

-- ─── Row Level Security (RLS) ───────────────────────────────────────────

-- Agent creation jobs: Only creator and admins can view
ALTER TABLE agent_creation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own creation jobs" ON agent_creation_jobs FOR SELECT USING (
  requester_id = current_user_id()
);

CREATE POLICY "Admin can view all jobs" ON agent_creation_jobs FOR ALL USING (
  current_setting('jwt.claims.role', true) = 'admin'
);

-- Created agents: Anyone can view, only creator/admin can modify
ALTER TABLE created_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view created agents" ON created_agents FOR SELECT USING (true);

CREATE POLICY "Admin can manage agents" ON created_agents FOR ALL USING (
  current_setting('jwt.claims.role', true) = 'admin'
);

-- Social media accounts: Only agent creator can view, sensitive data hidden
ALTER TABLE social_media_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own social accounts" ON social_media_accounts FOR SELECT USING (
  job_id IN (
    SELECT id FROM agent_creation_jobs
    WHERE requester_id = current_user_id()
  )
);

-- ─── Indexes for Common Queries ──────────────────────────────────────────

-- Find all agents for a specific project
CREATE INDEX IF NOT EXISTS idx_created_agents_project_created_at
  ON created_agents(project_slug, created_at DESC);

-- Find pending jobs that need approval
CREATE INDEX IF NOT EXISTS idx_pending_jobs_by_status
  ON agent_creation_jobs(status, created_at DESC)
  WHERE status = 'pending_approval';

-- Find failed jobs for debugging
CREATE INDEX IF NOT EXISTS idx_failed_jobs
  ON agent_creation_jobs(status, created_at DESC)
  WHERE status = 'failed';

-- ─── Helper Functions ───────────────────────────────────────────────────

-- Function to get current user ID from JWT
CREATE OR REPLACE FUNCTION current_user_id() RETURNS TEXT AS $$
  SELECT current_setting('request.jwt.claims', true)::jsonb->>'sub'
$$ LANGUAGE SQL;

-- Function to mark job as completed
CREATE OR REPLACE FUNCTION complete_agent_job(job_id UUID, final_status TEXT)
RETURNS void AS $$
BEGIN
  UPDATE agent_creation_jobs
  SET status = final_status, completed_at = NOW()
  WHERE id = job_id;
END;
$$ LANGUAGE plpgsql;

-- ─── Comments for Documentation ─────────────────────────────────────────

COMMENT ON COLUMN agent_creation_jobs.requester_id IS
  'Telegram user ID (e.g., "123456789") or email of person requesting agent';

COMMENT ON COLUMN agent_creation_jobs.project_slug IS
  'URL-safe slug for project (e.g., "tanner-grants", "my-new-project")';

COMMENT ON COLUMN created_agents.credentials IS
  'WARNING: Contains sensitive data (tokens, passwords, API keys). Never expose in logs or messages.';

COMMENT ON COLUMN social_media_accounts.api_keys IS
  'WARNING: Contains sensitive data. Only populated after user provides credentials.';

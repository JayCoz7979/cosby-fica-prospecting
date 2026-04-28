-- MIGRATION 3: Agent Execution Logs
-- Tracks all agent runs for debugging and monitoring

CREATE TABLE IF NOT EXISTS agent_run_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  agent_name           TEXT NOT NULL,
  service_name         TEXT,
  status               TEXT NOT NULL DEFAULT 'pending',
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  duration_ms          INT8,
  input_data           JSONB,
  output_data          JSONB,
  error_message        TEXT,
  logs                 TEXT,
  next_run_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_run_logs_agent_name_idx     ON agent_run_logs (agent_name);
CREATE INDEX IF NOT EXISTS agent_run_logs_status_idx         ON agent_run_logs (status);
CREATE INDEX IF NOT EXISTS agent_run_logs_created_at_idx     ON agent_run_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS agent_run_logs_completed_at_idx   ON agent_run_logs (completed_at DESC);

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id              UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action                TEXT NOT NULL,
  resource_type        TEXT,
  resource_id          TEXT,
  changes              JSONB,
  ip_address           INET,
  user_agent           TEXT
);

CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx        ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx         ON audit_logs (action);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx     ON audit_logs (created_at DESC);

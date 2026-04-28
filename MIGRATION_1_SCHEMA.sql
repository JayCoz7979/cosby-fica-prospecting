-- MIGRATION 1: FICA Prospecting Base Schema
-- Creates fica_leads and fica_outreach_log tables with all indexes and triggers

CREATE TABLE IF NOT EXISTS fica_leads (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  business_name        TEXT,
  industry             TEXT,
  city                 TEXT,
  state                TEXT,
  phone                TEXT,
  email                TEXT,
  website_url          TEXT,
  employee_count       TEXT,
  founded_year         TEXT,
  contact_name         TEXT,
  fica_score           INT4 DEFAULT 0,
  outreach_stage       TEXT NOT NULL DEFAULT 'new',
  last_contacted_at    TIMESTAMPTZ,
  followup_step        INT4 DEFAULT 0,
  call_attempt_count   INT4 DEFAULT 0,
  next_retry_at        TIMESTAMPTZ,
  notes                TEXT,
  source               TEXT,
  -- Call result columns (for ElevenLabs)
  outcome              TEXT,
  call_success         BOOLEAN,
  sentiment            TEXT,
  lead_status          TEXT,
  lead_qualified       BOOLEAN,
  call_summary         TEXT,
  last_called_at       TIMESTAMPTZ,
  call_duration        INTEGER
);

CREATE INDEX IF NOT EXISTS fica_leads_fica_score_idx       ON fica_leads (fica_score DESC);
CREATE INDEX IF NOT EXISTS fica_leads_outreach_stage_idx   ON fica_leads (outreach_stage);
CREATE INDEX IF NOT EXISTS fica_leads_state_idx            ON fica_leads (state);
CREATE INDEX IF NOT EXISTS fica_leads_created_at_idx       ON fica_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS fica_leads_next_retry_at_idx    ON fica_leads (next_retry_at);
CREATE INDEX IF NOT EXISTS fica_leads_last_called_at_idx   ON fica_leads (last_called_at DESC);
CREATE INDEX IF NOT EXISTS fica_leads_lead_qualified_idx   ON fica_leads (lead_qualified);
CREATE INDEX IF NOT EXISTS fica_leads_lead_status_idx      ON fica_leads (lead_status);

CREATE OR REPLACE FUNCTION fica_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fica_leads_set_updated_at ON fica_leads;
CREATE TRIGGER fica_leads_set_updated_at
  BEFORE UPDATE ON fica_leads
  FOR EACH ROW EXECUTE FUNCTION fica_set_updated_at();

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS fica_outreach_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  lead_id          UUID REFERENCES fica_leads(id) ON DELETE CASCADE,
  email            TEXT,
  subject          TEXT,
  body             TEXT,
  resend_id        TEXT,
  status           TEXT NOT NULL DEFAULT 'sent',
  error_message    TEXT,
  sent_at          TIMESTAMPTZ,
  sequence_step    INT4,
  attempt_count    INT4 DEFAULT 0,
  last_call_id     TEXT,
  next_retry_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS fica_outreach_log_lead_id_idx   ON fica_outreach_log (lead_id);
CREATE INDEX IF NOT EXISTS fica_outreach_log_status_idx    ON fica_outreach_log (status);
CREATE INDEX IF NOT EXISTS fica_outreach_log_sent_at_idx   ON fica_outreach_log (sent_at DESC);

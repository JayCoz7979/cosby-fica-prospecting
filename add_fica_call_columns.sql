-- Migration: Add VAPI call-result columns to fica_leads
-- Run after migration.sql (the base schema).
-- All columns use ADD COLUMN IF NOT EXISTS — safe to re-run.

ALTER TABLE fica_leads
  ADD COLUMN IF NOT EXISTS outcome        TEXT,         -- raw VAPI call outcome (e.g. 'answered', 'no_answer', 'voicemail', 'busy')
  ADD COLUMN IF NOT EXISTS call_success   BOOLEAN,      -- true if call connected and prospect engaged positively
  ADD COLUMN IF NOT EXISTS sentiment      TEXT,         -- AI-assessed sentiment: 'positive' | 'neutral' | 'negative'
  ADD COLUMN IF NOT EXISTS lead_status    TEXT,         -- current lifecycle status: 'open' | 'contacted' | 'qualified' | 'closed_won' | 'closed_lost'
  ADD COLUMN IF NOT EXISTS lead_qualified BOOLEAN,      -- true if prospect confirmed eligibility for FICA Tip Credit
  ADD COLUMN IF NOT EXISTS call_summary   TEXT,         -- VAPI post-call AI summary / transcript notes
  ADD COLUMN IF NOT EXISTS last_called_at TIMESTAMPTZ,  -- timestamp of most recent phone call attempt (distinct from last_contacted_at which includes emails)
  ADD COLUMN IF NOT EXISTS call_duration  INTEGER;      -- call duration in seconds (from VAPI webhook)

-- Index on last_called_at for re-engagement queries
CREATE INDEX IF NOT EXISTS fica_leads_last_called_at_idx  ON fica_leads (last_called_at DESC);

-- Index on lead_qualified for reporting dashboards
CREATE INDEX IF NOT EXISTS fica_leads_lead_qualified_idx  ON fica_leads (lead_qualified);

-- Index on lead_status for pipeline queries
CREATE INDEX IF NOT EXISTS fica_leads_lead_status_idx     ON fica_leads (lead_status);

COMMENT ON COLUMN fica_leads.outcome        IS 'Raw VAPI call outcome: answered | no_answer | voicemail | busy | failed';
COMMENT ON COLUMN fica_leads.call_success   IS 'True when call connected and prospect engaged positively';
COMMENT ON COLUMN fica_leads.sentiment      IS 'AI-assessed call sentiment: positive | neutral | negative';
COMMENT ON COLUMN fica_leads.lead_status    IS 'Pipeline status: open | contacted | qualified | closed_won | closed_lost';
COMMENT ON COLUMN fica_leads.lead_qualified IS 'True when prospect confirmed as FICA Tip Credit eligible';
COMMENT ON COLUMN fica_leads.call_summary   IS 'VAPI post-call AI-generated summary or transcript notes';
COMMENT ON COLUMN fica_leads.last_called_at IS 'Timestamp of most recent phone call attempt';
COMMENT ON COLUMN fica_leads.call_duration  IS 'Call duration in seconds (populated via VAPI webhook)';

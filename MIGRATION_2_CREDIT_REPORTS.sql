-- MIGRATION 2: Cosby Capital Credit Reports Schema
-- Creates tables for credit report uploads, analysis, and profiles

CREATE TABLE IF NOT EXISTS profiles (
  id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  email                TEXT UNIQUE,
  business_name        TEXT,
  full_name            TEXT,
  phone                TEXT,
  avatar_url           TEXT,
  fundability_score    INT4,
  subscription_tier    TEXT DEFAULT 'free'
);

CREATE INDEX IF NOT EXISTS profiles_email_idx       ON profiles (email);
CREATE INDEX IF NOT EXISTS profiles_fundability_idx ON profiles (fundability_score);

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS credit_reports (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id              UUID REFERENCES profiles(id) ON DELETE CASCADE,
  file_url             TEXT,
  file_type            TEXT,
  file_size            INT8,
  status               TEXT NOT NULL DEFAULT 'pending',
  analysis             TEXT,
  grade                TEXT,
  score                INT4,
  error_message        TEXT
);

CREATE INDEX IF NOT EXISTS credit_reports_user_id_idx    ON credit_reports (user_id);
CREATE INDEX IF NOT EXISTS credit_reports_status_idx     ON credit_reports (status);
CREATE INDEX IF NOT EXISTS credit_reports_created_at_idx ON credit_reports (created_at DESC);

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS storage_buckets (
  id                   TEXT PRIMARY KEY,
  name                 TEXT UNIQUE NOT NULL,
  owner                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  public               BOOLEAN DEFAULT FALSE,
  file_size_limit      BIGINT,
  allowed_mime_types   TEXT[],
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure 'documents' bucket exists
INSERT INTO storage_buckets (id, name, public)
VALUES ('documents', 'documents', FALSE)
ON CONFLICT (id) DO NOTHING;

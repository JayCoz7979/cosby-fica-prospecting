-- Cosby FICA Prospecting Schema
-- Run this in your Supabase SQL editor
--
-- outreach_stage values:
--   new               → just found, not yet contacted
--   emailed           → cold email sent
--   call_restricted   → state law prohibits cold calls; routed to email outreach
--   emailed_restricted→ email sent to a call-restricted lead
--   call_initiated    → VAPI call triggered
--   called_success    → call connected, interested
--   reengagement      → 3 no-answers; retry after 90 days
--   not_interested    → permanently opted out
--   disqualified      → does not qualify for FICA Tip Credit

create table if not exists fica_leads (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  business_name        text,
  industry             text,
  city                 text,
  state                text,
  phone                text,
  email                text,
  website_url          text,
  employee_count       text,
  founded_year         text,
  contact_name         text,
  fica_score           int4 default 0,
  outreach_stage       text not null default 'new',
  last_contacted_at    timestamptz,
  followup_step        int4 default 0,
  call_attempt_count   int4 default 0,
  next_retry_at        timestamptz,
  notes                text,
  source               text
);

create index if not exists fica_leads_fica_score_idx      on fica_leads (fica_score desc);
create index if not exists fica_leads_outreach_stage_idx  on fica_leads (outreach_stage);
create index if not exists fica_leads_state_idx           on fica_leads (state);
create index if not exists fica_leads_created_at_idx      on fica_leads (created_at desc);
create index if not exists fica_leads_next_retry_at_idx   on fica_leads (next_retry_at);

create or replace function fica_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists fica_leads_set_updated_at on fica_leads;
create trigger fica_leads_set_updated_at
  before update on fica_leads
  for each row execute function fica_set_updated_at();

-- -------------------------------------------------------

create table if not exists fica_outreach_log (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  lead_id          uuid references fica_leads(id) on delete cascade,
  email            text,
  subject          text,
  body             text,
  resend_id        text,
  status           text not null default 'sent',
  error_message    text,
  sent_at          timestamptz,
  sequence_step    int4,
  attempt_count    int4 default 0,
  last_call_id     text,
  next_retry_at    timestamptz
);

create index if not exists fica_outreach_log_lead_id_idx  on fica_outreach_log (lead_id);
create index if not exists fica_outreach_log_status_idx   on fica_outreach_log (status);
create index if not exists fica_outreach_log_sent_at_idx  on fica_outreach_log (sent_at desc);

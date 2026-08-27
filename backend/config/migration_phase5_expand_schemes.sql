-- Migration: Expanded Scheme Journey Fields & Chat Quality Feedback
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS disbursement_process TEXT;
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS implementing_agency TEXT;
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS application_steps JSONB DEFAULT '[]'::jsonb;
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS deadline_type VARCHAR(50) DEFAULT 'rolling'; -- 'rolling', 'fixed_annual', 'unknown'
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS application_window TEXT DEFAULT 'Open Year-Round (Rolling Application)';
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS tracking_portal_url TEXT;
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS helpline_info TEXT;

-- Add feedback columns to chat_logs
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS feedback_rating INT; -- 1 (thumbs up), -1 (thumbs down)
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS feedback_comment TEXT;
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS active_scheme_id VARCHAR(100);

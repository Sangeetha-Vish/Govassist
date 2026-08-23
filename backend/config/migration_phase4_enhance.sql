-- Migration: Add validation_results, rejection_reason, admin_notes to documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS validation_results JSONB DEFAULT '{}'::jsonb;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS admin_notes TEXT;

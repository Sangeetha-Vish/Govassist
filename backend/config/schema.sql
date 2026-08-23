-- Database Schema & Index Validation for GovAssist AI Phase 1

-- 1. Profiles Table Constraints & Indexing
CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255),
  category VARCHAR(100),
  age INT CHECK (age >= 0 AND age <= 120),
  education VARCHAR(100),
  field_of_study VARCHAR(100),
  family_income NUMERIC(12, 2) CHECK (family_income >= 0),
  location VARCHAR(100),
  employment_status VARCHAR(100),
  work_experience_years INT CHECK (work_experience_years >= 0),
  goal TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing profiles for lookups
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- 2. Schemes Table Performance Indexes (B-tree on relational columns used in filtering)
CREATE INDEX IF NOT EXISTS idx_schemes_recommendation_eligible ON schemes(is_recommendation_eligible) WHERE is_recommendation_eligible = true;
CREATE INDEX IF NOT EXISTS idx_schemes_category ON schemes(category);
CREATE INDEX IF NOT EXISTS idx_schemes_location_scope ON schemes(location_scope);
CREATE INDEX IF NOT EXISTS idx_schemes_min_max_age ON schemes(min_age, max_age);
CREATE INDEX IF NOT EXISTS idx_schemes_max_income ON schemes(max_family_income);

-- 3. Recommendations Table
CREATE TABLE IF NOT EXISTS recommendations (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  scheme_id VARCHAR(100) NOT NULL,
  fit_score INT NOT NULL CHECK (fit_score >= 0 AND fit_score <= 100),
  rank INT NOT NULL CHECK (rank >= 1),
  explanation VARCHAR(4000),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_recommendations_user FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_recommendations_scheme FOREIGN KEY (scheme_id) REFERENCES schemes(scheme_id) ON DELETE CASCADE,
  CONSTRAINT unique_user_scheme UNIQUE (user_id, scheme_id)
);

CREATE INDEX IF NOT EXISTS idx_recommendations_user_id ON recommendations(user_id);

-- 4. Documents Table (Phase 4: Secure Document Storage & Verification)
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  document_type VARCHAR(100) NOT NULL,
  file_path TEXT NOT NULL,
  verification_status VARCHAR(50) DEFAULT 'pending', -- 'verified', 'manual_review_required', 'rejected_forged', 'rejected', 'pending'
  extracted_data JSONB DEFAULT '{}'::jsonb,
  validation_results JSONB DEFAULT '{}'::jsonb,
  rejection_reason TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_documents_user FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);

-- Apply Row Level Security (RLS) to documents table
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents" 
ON documents FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents" 
ON documents FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents" 
ON documents FOR UPDATE 
USING (auth.uid() = user_id);

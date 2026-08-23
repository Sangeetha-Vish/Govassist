-- Migration Phase 5: Chat Logs & RAG Conversation Persistence
CREATE TABLE IF NOT EXISTS chat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID, -- NULL for guest sessions
  session_id VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL, -- 'user', 'assistant', 'system'
  message TEXT NOT NULL,
  sources JSONB DEFAULT '[]'::jsonb,
  is_personalized BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_chat_logs_user FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_logs_session_id ON chat_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_user_id ON chat_logs(user_id);

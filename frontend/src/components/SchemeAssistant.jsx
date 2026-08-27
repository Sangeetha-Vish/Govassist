import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './SchemeAssistant.css';

const INITIAL_PROMPTS = [
  'Am I eligible for a scholarship?',
  'What startup subsidies exist in Tamil Nadu?',
  'How does MUDRA loan assistance work?',
  'What documents do I need for AABCS?',
];

const SCHEME_CONTEXT_PROMPTS = [
  'How do I apply for this?',
  "When's the deadline?",
  'Help me fill this form (income & documents)',
  'How do I track my application status?',
];

export default function SchemeAssistant({ profile }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [activeScheme, setActiveScheme] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [feedbackSent, setFeedbackSent] = useState({});

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Initialize Session ID
  useEffect(() => {
    let storedSession = localStorage.getItem('govassist_chat_session');
    if (!storedSession) {
      storedSession = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      localStorage.setItem('govassist_chat_session', storedSession);
    }
    setSessionId(storedSession);

    // Fetch conversation history
    const loadHistory = async () => {
      try {
        const headers = {};
        if (user?.id) headers['x-user-id'] = user.id;

        const res = await fetch(`http://localhost:5000/api/chat/history?sessionId=${storedSession}`, { headers });
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setMessages(
            json.data.map((m) => ({
              id: m.id || Math.random().toString(),
              role: m.role,
              text: m.message,
              sources: m.sources || [],
              isPersonalized: m.is_personalized || false,
              feedbackRating: m.feedback_rating || null,
            }))
          );
        }
      } catch (err) {
        console.warn('Could not load chat history:', err);
      }
    };

    loadHistory();
  }, [user?.id]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming, isOpen]);

  // Auto-focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isStreaming) return;

    setInputValue('');
    setErrorMessage(null);

    const userMessageId = `user_${Date.now()}`;
    const assistantMessageId = `assistant_${Date.now()}`;

    const updatedMessages = [
      ...messages,
      { id: userMessageId, role: 'user', text, sources: [], isPersonalized: false },
      { id: assistantMessageId, role: 'assistant', text: '', sources: [], isPersonalized: false, isLive: true },
    ];
    setMessages(updatedMessages);
    setIsStreaming(true);

    try {
      abortControllerRef.current = new AbortController();

      const headers = { 'Content-Type': 'application/json' };
      if (user?.id) headers['x-user-id'] = user.id;

      const response = await fetch('http://localhost:5000/api/chat/stream', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: text,
          sessionId,
          profile: profile || null,
          activeScheme: activeScheme || null,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let assistantText = '';
      let sources = [];
      let isPersonalized = false;
      let returnedActiveScheme = activeScheme;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (!dataStr) continue;

            try {
              const event = JSON.parse(dataStr);

              if (event.type === 'token') {
                assistantText += event.text;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId ? { ...msg, text: assistantText } : msg
                  )
                );
              } else if (event.type === 'done') {
                sources = event.sources || [];
                isPersonalized = event.isPersonalized || false;
                if (event.activeScheme) {
                  returnedActiveScheme = event.activeScheme;
                  setActiveScheme(event.activeScheme);
                }
              } else if (event.type === 'error') {
                setErrorMessage(event.message || 'Assistant temporarily unavailable.');
              }
            } catch (e) {
              console.error('Error parsing SSE chunk:', e);
            }
          }
        }
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, text: assistantText, sources, isPersonalized, isLive: false }
            : msg
        )
      );
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Chat error:', err);
        setErrorMessage('Unable to connect to assistant. Please try again.');
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  text: "I'm having trouble retrieving verified records right now. Please explore schemes directly in [Scheme Finder](/finder).",
                  isLive: false,
                }
              : msg
          )
        );
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const handleFeedback = async (messageId, rating) => {
    try {
      setFeedbackSent((prev) => ({ ...prev, [messageId]: rating }));
      const headers = { 'Content-Type': 'application/json' };
      if (user?.id) headers['x-user-id'] = user.id;

      await fetch('http://localhost:5000/api/chat/feedback', {
        method: 'POST',
        headers,
        body: JSON.stringify({ messageId, rating }),
      });
    } catch (err) {
      console.warn('Feedback submit failed:', err);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Clear all conversation messages in this session?')) return;
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (user?.id) headers['x-user-id'] = user.id;

      await fetch('http://localhost:5000/api/chat/history', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ sessionId }),
      });
      setMessages([]);
      setActiveScheme(null);
      setErrorMessage(null);
    } catch (err) {
      console.error('Error clearing history:', err);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Safe Markdown Parsing
  const renderFormattedMessage = (text) => {
    if (!text) return null;
    const lines = text.split('\n');

    return lines.map((line, idx) => {
      if (line.startsWith('### ')) {
        return <h4 key={idx} className="chat-msg-h4">{renderInlineMarkdown(line.replace('### ', ''))}</h4>;
      }
      if (line.startsWith('## ')) {
        return <h3 key={idx} className="chat-msg-h3">{renderInlineMarkdown(line.replace('## ', ''))}</h3>;
      }
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        return (
          <div key={idx} className="chat-bullet-row">
            <span className="chat-bullet-dot">•</span>
            <span>{renderInlineMarkdown(line.replace(/^[-*]\s+/, ''))}</span>
          </div>
        );
      }
      if (/^\d+\.\s+/.test(line.trim())) {
        const num = line.trim().match(/^(\d+\.)\s+/)[1];
        return (
          <div key={idx} className="chat-bullet-row">
            <span className="chat-num-dot">{num}</span>
            <span>{renderInlineMarkdown(line.trim().replace(/^\d+\.\s+/, ''))}</span>
          </div>
        );
      }
      if (!line.trim()) {
        return <div key={idx} className="chat-line-gap"></div>;
      }
      return <p key={idx} className="chat-msg-p">{renderInlineMarkdown(line)}</p>;
    });
  };

  const renderInlineMarkdown = (str) => {
    const tokens = str.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g);

    return tokens.map((token, i) => {
      if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
        const linkText = token.substring(1, token.indexOf(']('));
        const url = token.substring(token.indexOf('](') + 2, token.length - 1);
        const isInternal = url.startsWith('/');

        return (
          <a
            key={i}
            href={url}
            target={isInternal ? '_self' : '_blank'}
            rel="noopener noreferrer"
            className="chat-inline-link"
            onClick={(e) => {
              if (isInternal) {
                e.preventDefault();
                navigate(url);
                setIsOpen(false);
              }
            }}
          >
            {linkText} ↗
          </a>
        );
      }

      if (token.startsWith('**') && token.endsWith('**')) {
        return <strong key={i} className="chat-inline-strong">{token.slice(2, -2)}</strong>;
      }

      return token;
    });
  };

  const currentChips = activeScheme ? SCHEME_CONTEXT_PROMPTS : INITIAL_PROMPTS;

  return (
    <div className="gov-chat-container">
      {/* Floating Action Button */}
      <button
        type="button"
        className={`gov-chat-floating-btn ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close Scheme Assistant' : 'Open Scheme Assistant'}
        title="GovAssist Scheme Assistant"
      >
        <span className="floating-btn-icon">{isOpen ? '✕' : '💬'}</span>
        {!isOpen && <span className="floating-btn-badge">AI</span>}
      </button>

      {/* Chat Window Modal */}
      {isOpen && (
        <div className="gov-chat-window animate-chat-slide" role="dialog" aria-label="GovAssist Scheme Assistant">
          {/* Header */}
          <div className="gov-chat-header">
            <div className="chat-header-brand">
              <div className="chat-avatar-mark">G</div>
              <div className="chat-header-text">
                <h3 className="chat-title-serif">Scheme Assistant</h3>
                <span className="chat-subtitle-status">
                  <span className="live-status-dot"></span>
                  Grounded on 95 Verified Schemes
                </span>
              </div>
            </div>

            <div className="chat-header-actions">
              {messages.length > 0 && (
                <button
                  type="button"
                  className="chat-clear-btn"
                  onClick={handleClearHistory}
                  title="Clear conversation history"
                >
                  🗑️
                </button>
              )}
              <button
                type="button"
                className="chat-close-btn"
                onClick={() => setIsOpen(false)}
                aria-label="Close chat"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Active Scheme Context Pill */}
          {activeScheme && (
            <div className="active-scheme-context-bar">
              <span className="context-kicker">✦ IN FOCUS:</span>
              <span className="context-scheme-name">{activeScheme.scheme_name}</span>
              <button
                type="button"
                className="clear-context-btn"
                onClick={() => setActiveScheme(null)}
                title="Reset scheme focus"
              >
                ✕
              </button>
            </div>
          )}

          {/* Guest Mode Banner */}
          {!user && (
            <div className="chat-guest-banner">
              <span>💡 Sign in to get answers tailored to your age, income & documents.</span>
              <button
                type="button"
                className="chat-signin-link"
                onClick={() => { setIsOpen(false); navigate('/onboarding/snapshot'); }}
              >
                Sign in →
              </button>
            </div>
          )}

          {/* Messages Scroll Area */}
          <div className="gov-chat-messages-area" aria-live="polite">
            {/* Empty State Greetings */}
            {messages.length === 0 && (
              <div className="chat-empty-intro">
                <div className="intro-icon">🏛️</div>
                <h4 className="intro-heading">How can I help you today?</h4>
                <p className="intro-sub">
                  Ask me about eligibility, how schemes work, deadlines, form-filling advice, or application status tracking.
                </p>

                <div className="chat-example-prompts">
                  <span className="example-kicker">TRY ASKING:</span>
                  <div className="prompt-chips-grid">
                    {INITIAL_PROMPTS.map((promptText, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="prompt-chip-btn"
                        onClick={() => handleSendMessage(promptText)}
                      >
                        {promptText}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Conversation Messages */}
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              const currentRating = feedbackSent[msg.id] || msg.feedbackRating;

              return (
                <div key={msg.id} className={`chat-message-row ${isUser ? 'user-row' : 'assistant-row'}`}>
                  {!isUser && (
                    <div className="bot-avatar-badge" title="GovAssist AI">G</div>
                  )}

                  <div className={`chat-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}`}>
                    {/* Personalized / Verified Badge */}
                    {!isUser && msg.isPersonalized && (
                      <div className="personalized-pill-tag">
                        <span>🛡️</span>
                        <span>Tailored to your profile snapshot</span>
                      </div>
                    )}

                    {/* Message Body */}
                    <div className="chat-bubble-content">
                      {isUser ? msg.text : renderFormattedMessage(msg.text)}
                    </div>

                    {/* Streaming Cursor Dot */}
                    {!isUser && msg.isLive && (
                      <span className="streaming-cursor-dot"></span>
                    )}

                    {/* Source Citations */}
                    {!isUser && msg.sources?.length > 0 && (
                      <div className="chat-sources-box">
                        <span className="sources-kicker">VERIFIED SOURCES:</span>
                        <div className="sources-chips-list">
                          {msg.sources.map((src, sIdx) => (
                            <a
                              key={sIdx}
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="source-chip-link"
                            >
                              📄 {src.scheme_name} ↗
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Quality Feedback (Thumbs Up / Down) */}
                    {!isUser && !msg.isLive && msg.text && (
                      <div className="chat-feedback-row">
                        <span className="feedback-label">Was this helpful?</span>
                        <button
                          type="button"
                          className={`feedback-btn ${currentRating === 1 ? 'active-up' : ''}`}
                          onClick={() => handleFeedback(msg.id, 1)}
                          title="Good, accurate response"
                        >
                          👍
                        </button>
                        <button
                          type="button"
                          className={`feedback-btn ${currentRating === -1 ? 'active-down' : ''}`}
                          onClick={() => handleFeedback(msg.id, -1)}
                          title="Needs improvement"
                        >
                          👎
                        </button>
                        {currentRating && (
                          <span className="feedback-thank-you">Thanks for your feedback!</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {errorMessage && (
              <div className="chat-error-toast">
                <span>⚠️</span>
                <span>{errorMessage}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Contextual Quick-Action Chips */}
          {messages.length > 0 && !isStreaming && (
            <div className="chat-context-chips-bar">
              {currentChips.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="context-chip-pill"
                  onClick={() => handleSendMessage(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {/* Input Footer Area */}
          <div className="gov-chat-input-footer">
            <div className="chat-input-wrapper">
              <input
                ref={inputRef}
                type="text"
                className="chat-text-input"
                placeholder={activeScheme ? `Ask about ${activeScheme.scheme_name}...` : 'Ask about schemes, eligibility, deadlines...'}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
                aria-label="Message Scheme Assistant"
              />

              <button
                type="button"
                className="chat-send-btn"
                onClick={() => handleSendMessage()}
                disabled={!inputValue.trim() || isStreaming}
                aria-label="Send message"
              >
                {isStreaming ? <span className="send-spinner"></span> : '↑'}
              </button>
            </div>
            <div className="chat-disclaimer-text">
              Grounded on 95 verified official schemes. Never fabricates criteria.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

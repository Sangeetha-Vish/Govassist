import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './LandingPage.css';

export default function LandingPage({ onStartRecommendation, onExploreSchemes }) {
  const navigate = useNavigate();
  const { user, hasCompletedProfile } = useAuth();

  const handleStart = () => {
    if (onStartRecommendation && typeof onStartRecommendation === 'function') {
      try {
        const res = onStartRecommendation();
        if (res !== undefined) return;
      } catch { /* fallback */ }
    }
    if (user && hasCompletedProfile) {
      navigate('/dashboard');
    } else {
      navigate('/onboarding/snapshot');
    }
  };

  const handleBrowse = () => {
    if (onExploreSchemes && typeof onExploreSchemes === 'function') {
      try {
        const res = onExploreSchemes();
        if (res !== undefined) return;
      } catch { /* fallback */ }
    }
    navigate('/finder');
  };

  return (
    <div className="editorial-landing">
      {/* ─── HERO SECTION ─── */}
      <section className="editorial-hero">
        <div className="editorial-hero-grid">
          {/* Left Column: Headline & Value Proposition */}
          <div className="hero-left-content">
            <div className="kicker-label hero-kicker">
              <span>—</span>
              <span>A clearer way to find support</span>
            </div>

            <h1 className="hero-main-title">
              Find the help <br />
              <span className="serif-italic-accent">meant for you.</span>
            </h1>

            <p className="hero-description">
              Answer a few simple questions. GovAssist finds government schemes you may qualify for and shows you exactly why.
            </p>

            <div className="hero-actions-row">
              <button
                type="button"
                className="btn btn-primary btn-lg hero-cta-btn"
                onClick={handleStart}
              >
                <span>Find schemes for me</span>
                <span className="btn-arrow-icon">→</span>
              </button>

              <button
                type="button"
                className="hero-browse-link"
                onClick={handleBrowse}
              >
                <span>Browse schemes</span>
                <span className="browse-chevron">›</span>
              </button>
            </div>

            {/* Trust Badges */}
            <div className="hero-trust-row">
              <div className="trust-item">
                <div className="trust-icon-circle">✓</div>
                <div className="trust-text">
                  <strong>Official sources</strong>
                  <span>We link to the original department</span>
                </div>
              </div>

              <div className="trust-item">
                <div className="trust-icon-circle">⏱</div>
                <div className="trust-text">
                  <strong>About 5 minutes</strong>
                  <span>Save and return anytime</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Floating Interactive Snapshot Preview */}
          <div className="hero-right-visual">
            <div className="snapshot-card-wrapper">
              {/* Floating Top Badge */}
              <div className="floating-match-pill">
                <span className="pill-check">✓</span>
                <span>Matched to your profile</span>
              </div>

              {/* Main Snapshot Card */}
              <div className="snapshot-preview-card">
                <div className="snapshot-card-header">
                  <span className="snapshot-kicker">Your eligibility snapshot</span>
                  <span className="snapshot-live-badge">LIVE</span>
                </div>

                <div className="snapshot-counter-row">
                  <span className="snapshot-big-number">12</span>
                  <span className="snapshot-counter-label">schemes found</span>
                </div>

                {/* Progress Bar Segment */}
                <div className="snapshot-progress-container">
                  <div className="snapshot-progress-bar">
                    <div className="progress-seg-green" style={{ width: '35%' }}></div>
                    <div className="progress-seg-amber" style={{ width: '65%' }}></div>
                  </div>
                  <div className="snapshot-legend-row">
                    <div className="legend-item">
                      <span className="dot dot-green"></span>
                      <span>4 likely matches</span>
                    </div>
                    <div className="legend-item">
                      <span className="dot dot-amber"></span>
                      <span>8 possible</span>
                    </div>
                  </div>
                </div>

                {/* Criteria Rows */}
                <div className="snapshot-criteria-list">
                  <div className="criteria-row">
                    <div className="criteria-left">
                      <span className="criteria-icon">⚡</span>
                      <div className="criteria-info">
                        <span className="criteria-label">Age</span>
                        <span className="criteria-value">28 years</span>
                      </div>
                    </div>
                    <span className="criteria-check">✓</span>
                  </div>

                  <div className="criteria-row">
                    <div className="criteria-left">
                      <span className="criteria-icon">🏠</span>
                      <div className="criteria-info">
                        <span className="criteria-label">Location</span>
                        <span className="criteria-value">Tamil Nadu</span>
                      </div>
                    </div>
                    <span className="criteria-check">✓</span>
                  </div>

                  <div className="criteria-row actionable" onClick={handleStart}>
                    <div className="criteria-left">
                      <span className="criteria-icon">₹</span>
                      <div className="criteria-info">
                        <span className="criteria-label">Income</span>
                        <span className="criteria-value muted">Not added yet</span>
                      </div>
                    </div>
                    <span className="criteria-chevron">›</span>
                  </div>
                </div>

                {/* Highlight Callout Box */}
                <div className="snapshot-unlock-banner" onClick={handleStart}>
                  <span className="unlock-sparkle">✨</span>
                  <span>Add your income to unlock <strong>6 more schemes</strong></span>
                </div>
              </div>

              {/* Floating Bottom Trust Pill */}
              <div className="floating-privacy-pill">
                <span className="privacy-icon">🛡️</span>
                <span>Your data stays yours</span>
              </div>

              {/* Background Watermark Stamp */}
              <div className="snapshot-bg-stamp">
                <span>EST. 2025</span>
                <span>TRUSTED DISCOVERY</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS SECTION ─── */}
      <section className="editorial-how-it-works">
        <div className="how-it-works-container">
          <div className="how-header-col">
            <div className="kicker-label">HOW IT WORKS</div>
            <h2 className="how-main-title">
              From questions <br />
              <span className="serif-italic-accent">to clarity.</span>
            </h2>
          </div>

          <div className="how-steps-grid">
            <div className="how-step-card">
              <span className="step-num">01</span>
              <h3 className="step-title">Tell us about yourself</h3>
              <p className="step-desc">No jargon. Just one clear question at a time.</p>
            </div>

            <div className="how-step-card">
              <span className="step-num">02</span>
              <h3 className="step-title">See your matches grow</h3>
              <p className="step-desc">Every answer updates your results instantly.</p>
            </div>

            <div className="how-step-card">
              <span className="step-num">03</span>
              <h3 className="step-title">Take the next step</h3>
              <p className="step-desc">Understand the why, then apply officially.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

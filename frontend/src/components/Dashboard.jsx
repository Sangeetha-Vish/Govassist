import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';

export default function Dashboard({
  profile,
  recommendations = [],
  loading = false,
  error = null,
  onRefreshRecommendations,
  onNavigateToFinder,
  onNavigateToProfile,
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [userDocs, setUserDocs] = useState([]);
  const [savedSchemes, setSavedSchemes] = useState({});
  const [selectedScheme, setSelectedScheme] = useState(null);

  // Fetch verified user documents
  useEffect(() => {
    const fetchDocs = async () => {
      if (!user) return;
      try {
        const { data, error: docErr } = await supabase
          .from('documents')
          .select('*')
          .eq('user_id', user.id);
        if (docErr) throw docErr;
        setUserDocs(data || []);
      } catch (err) {
        console.error('Error fetching documents in dashboard:', err);
      }
    };
    fetchDocs();
  }, [user?.id]);

  const verifiedDocsCount = userDocs.filter(d => d.verification_status === 'verified').length;

  // Compute profile completeness percentage
  const completeness = useMemo(() => {
    if (!profile) return 72;
    let score = 40;
    if (profile.age) score += 15;
    if (profile.education) score += 15;
    if (profile.family_income) score += 15;
    if (profile.location) score += 5;
    if (verifiedDocsCount > 0) score += 10;
    return Math.min(100, score);
  }, [profile, verifiedDocsCount]);

  // Greeting based on current time
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  // Formatted date in uppercase (e.g. MONDAY, 16 JUNE 2025)
  const formattedDate = useMemo(() => {
    const now = new Date();
    const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    return now.toLocaleDateString('en-GB', options).toUpperCase();
  }, []);

  const rawName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Citizen';
  const userName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  // Likely (score >= 70) vs Possible (score < 70)
  const likelyMatches = recommendations.filter(r => (r.fit_score || 0) >= 70);
  const possibleMatches = recommendations.filter(r => (r.fit_score || 0) < 70);
  const topMatches = recommendations.slice(0, 4);

  const toggleSave = (schemeId, e) => {
    e.stopPropagation();
    setSavedSchemes(prev => ({
      ...prev,
      [schemeId]: !prev[schemeId]
    }));
  };

  const savedCount = Object.values(savedSchemes).filter(Boolean).length;

  const getCategoryIcon = (category, schemeName = '') => {
    const cat = String(category || '').toLowerCase();
    const name = String(schemeName || '').toLowerCase();
    if (cat.includes('house') || name.includes('awas') || name.includes('housing')) return '🏠';
    if (cat.includes('business') || cat.includes('startup') || name.includes('mudra') || name.includes('msme')) return '↗';
    if (cat.includes('student') || cat.includes('education') || name.includes('scholarship') || name.includes('aicte')) return '✦';
    if (cat.includes('social') || cat.includes('pension')) return '⭕';
    if (cat.includes('farmer') || cat.includes('agri')) return '🌾';
    return '🏛️';
  };

  const getCategoryName = (category, schemeName = '') => {
    const cat = String(category || '').toLowerCase();
    const name = String(schemeName || '').toLowerCase();
    if (cat.includes('house') || name.includes('awas')) return 'HOUSING';
    if (cat.includes('business') || cat.includes('startup') || name.includes('mudra')) return 'BUSINESS';
    if (cat.includes('student') || cat.includes('education') || name.includes('scholarship')) return 'STUDENT';
    return (category || 'GOVERNMENT').toUpperCase();
  };

  const cleanBenefitDisplay = (benefitVal) => {
    if (!benefitVal) return 'Support assistance available';
    let text = String(benefitVal).trim();
    return text;
  };

  return (
    <div className="editorial-dashboard">
      <div className="dashboard-main-container">
        
        {/* ─── TOP HEADER ROW ─── */}
        <header className="dashboard-top-header">
          <div className="top-header-left">
            <h1 className="dashboard-welcome-heading">
              {greeting}, <span className="serif-italic-accent">{userName}.</span>
            </h1>
            <p className="dashboard-welcome-sub">
              Your eligibility picture is taking shape.
            </p>
          </div>

          <div className="top-header-right">
            <button
              type="button"
              className="btn btn-primary continue-journey-btn"
              onClick={() => navigate('/finder')}
            >
              <span>Continue journey</span>
              <span className="btn-arrow-icon">→</span>
            </button>
          </div>
        </header>

        {/* ─── WARM & LIGHT PROFILE COMPLETENESS BANNER (NO HEAVY RED BG) ─── */}
        <section className="profile-completeness-banner-warm">
          <div className="completeness-gauge-wrapper">
            <div className="completeness-circular-gauge">
              <svg viewBox="0 0 36 36" className="gauge-svg">
                <path
                  className="gauge-bg-warm"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="gauge-progress-warm"
                  strokeDasharray={`${completeness}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="gauge-text-overlay-warm">
                <span className="gauge-val">{completeness}</span>
                <span className="gauge-pct">%</span>
              </div>
            </div>
          </div>

          <div className="completeness-content">
            <div className="completeness-kicker-warm">PROFILE COMPLETENESS</div>
            <h2 className="completeness-title-warm">
              {completeness >= 90
                ? 'Your profile snapshot is fully verified!'
                : "You're 3 answers away from a fuller picture"}
            </h2>
            <p className="completeness-sub-warm">
              {completeness >= 90
                ? 'All eligible schemes are tailored with highest confidence.'
                : 'Adding income and category could unlock up to 6 more schemes.'}
            </p>
          </div>

          <div className="completeness-action">
            <button
              type="button"
              className="complete-profile-btn-warm"
              onClick={() => navigate('/profile', { state: { defaultTab: 'snapshot' } })}
            >
              <span>Complete profile</span>
              <span className="btn-arrow-icon">→</span>
            </button>
          </div>
        </section>

        {/* ─── TWO-COLUMN CONTENT GRID ─── */}
        <div className="dashboard-content-grid">
          
          {/* ─── LEFT COLUMN (TOP MATCHES & ACTIONS) ─── */}
          <div className="dashboard-left-col">
            <div className="matches-section-header">
              <div>
                <div className="kicker-label">YOUR TOP MATCHES</div>
                <h2 className="matches-serif-title">Start with these</h2>
              </div>
              <button
                type="button"
                className="see-all-link"
                onClick={() => navigate('/finder')}
              >
                <span>See all {recommendations.length || 15}</span>
                <span className="btn-arrow-icon">→</span>
              </button>
            </div>

            {loading ? (
              <div className="schemes-loading-state card">
                <div className="spinner-large"></div>
                <p>Calculating personalized scheme recommendations...</p>
              </div>
            ) : recommendations.length === 0 ? (
              <div className="schemes-empty-state card">
                <p>No matches calculated yet. Complete your profile to view schemes.</p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => navigate('/profile')}
                >
                  Complete Snapshot
                </button>
              </div>
            ) : (
              <div className="schemes-cards-grid">
                {topMatches.map((scheme) => {
                  const isSaved = !!savedSchemes[scheme.scheme_id];
                  const fitScore = scheme.fit_score || 85;
                  const isLikely = fitScore >= 70;
                  const benefitText = cleanBenefitDisplay(scheme.benefit_value || scheme.benefit_amount);
                  const categoryName = getCategoryName(scheme.category, scheme.scheme_name);

                  return (
                    <div
                      key={scheme.scheme_id}
                      className="clean-editorial-scheme-card"
                      onClick={() => setSelectedScheme(scheme)}
                    >
                      {/* Top Row: Category Icon + Tag + Bookmark */}
                      <div className="clean-card-header">
                        <div className="clean-card-badge-box">
                          <span className="clean-card-icon">
                            {getCategoryIcon(scheme.category, scheme.scheme_name)}
                          </span>
                          <span className="clean-card-cat-name">{categoryName}</span>
                        </div>
                        <button
                          type="button"
                          className={`clean-bookmark-btn ${isSaved ? 'saved' : ''}`}
                          onClick={(e) => toggleSave(scheme.scheme_id, e)}
                          title={isSaved ? 'Remove Bookmark' : 'Save Scheme'}
                        >
                          <span className="clean-bookmark-icon">🔖</span>
                        </button>
                      </div>

                      {/* Title */}
                      <h3 className="clean-card-title">{scheme.scheme_name}</h3>

                      {/* Benefit Section (Neat & Clean typography, no clutter) */}
                      <div className="clean-benefit-box">
                        <span className="clean-benefit-kicker">BENEFIT</span>
                        <div className="clean-benefit-text" title={benefitText}>
                          {benefitText}
                        </div>
                      </div>

                      {/* Status & Confidence Meter Row */}
                      <div className="clean-card-status-row">
                        <div className="clean-status-pill">
                          <span className={`status-dot ${isLikely ? 'dot-green' : 'dot-amber'}`}></span>
                          <span className="status-label">{isLikely ? 'Likely match' : 'Possible match'}</span>
                        </div>

                        <div className="clean-confidence-meter">
                          <div className="meter-ring-badge">
                            <svg viewBox="0 0 36 36" className="ring-meter-svg">
                              <path
                                className="ring-meter-bg"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              />
                              <path
                                className="ring-meter-fill"
                                strokeDasharray={`${fitScore}, 100`}
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              />
                            </svg>
                            <span className="meter-val-text">{fitScore}</span>
                          </div>
                          <span className="confidence-text">match confidence</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Next Recommended Action Banner */}
            <div
              className="recommended-action-card"
              onClick={() => navigate('/profile', { state: { defaultTab: 'doc_check' } })}
            >
              <div className="rec-action-icon-box">
                <span className="rec-action-icon">📂</span>
              </div>
              <div className="rec-action-content">
                <div className="kicker-label">NEXT RECOMMENDED ACTION</div>
                <h3 className="rec-action-title">Have an income document?</h3>
                <p className="rec-action-sub">
                  Verify it optionally to increase confidence in your matches.
                </p>
              </div>
              <div className="rec-action-btn-box">
                <button type="button" className="rec-action-link-btn">
                  <span>Review documents</span>
                  <span className="btn-arrow-icon">→</span>
                </button>
              </div>
            </div>
          </div>

          {/* ─── RIGHT COLUMN (STICKY AT A GLANCE & TRUST) ─── */}
          <aside className="dashboard-right-sidebar">
            {/* AT A GLANCE Card */}
            <div className="at-a-glance-card card">
              <div className="glance-header">
                <span className="glance-kicker">AT A GLANCE</span>
                <span className="glance-info-icon" title="Summary of matching government schemes">?</span>
              </div>

              <div className="glance-items-list">
                <div className="glance-item-row">
                  <div className="glance-item-info">
                    <span className="glance-label">Likely matches</span>
                    <div className="glance-status-tag">
                      <span className="status-dot dot-green"></span>
                      <span>Strong fit</span>
                    </div>
                  </div>
                  <span className="glance-count-number">{likelyMatches.length || 4}</span>
                </div>

                <div className="glance-item-row">
                  <div className="glance-item-info">
                    <span className="glance-label">Possible matches</span>
                    <div className="glance-status-tag">
                      <span className="status-dot dot-amber"></span>
                      <span>Need more info</span>
                    </div>
                  </div>
                  <span className="glance-count-number">{possibleMatches.length || 8}</span>
                </div>

                <div className="glance-item-row no-border">
                  <div className="glance-item-info">
                    <span className="glance-label">Saved schemes</span>
                    <button
                      type="button"
                      className="view-saved-link"
                      onClick={() => navigate('/finder')}
                    >
                      <span>View saved</span>
                      <span className="btn-arrow-icon">→</span>
                    </button>
                  </div>
                  <span className="glance-count-number">{savedCount || 2}</span>
                </div>
              </div>
            </div>

            {/* Transparent by Default Card */}
            <div className="trust-callout-card">
              <div className="trust-callout-title">
                <span className="trust-callout-icon">🛡️</span>
                <span>Transparent by default</span>
              </div>
              <p className="trust-callout-body">
                We separate what you told us from what a document confirms.
              </p>
              <button
                type="button"
                className="trust-details-link"
                onClick={() => navigate('/profile', { state: { defaultTab: 'doc_check' } })}
              >
                See verification details
              </button>
            </div>
          </aside>
        </div>

        {/* ─── MODAL DETAIL VIEW ─── */}
        {selectedScheme && (
          <div className="editorial-modal-backdrop" onClick={() => setSelectedScheme(null)}>
            <div className="editorial-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-top-bar">
                <span className="kicker-label">{selectedScheme.category?.toUpperCase() || 'SCHEME'}</span>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setSelectedScheme(null)}
                >
                  ✕
                </button>
              </div>

              <h2 className="modal-scheme-title">{selectedScheme.scheme_name}</h2>

              <div className="modal-benefit-banner">
                <div className="kicker-label">BENEFIT SUMMARY</div>
                <div className="modal-benefit-highlight">
                  {selectedScheme.benefit_value || selectedScheme.benefit_amount || 'Assistance provided under scheme guidelines.'}
                </div>
              </div>

              {selectedScheme.explanation && (
                <div className="modal-explanation-section">
                  <h4 className="modal-section-heading">Eligibility Breakdown</h4>
                  {selectedScheme.explanation.why_qualified?.length > 0 && (
                    <ul className="modal-criteria-list qualified">
                      {selectedScheme.explanation.why_qualified.map((item, idx) => (
                        <li key={idx}>✓ {item}</li>
                      ))}
                    </ul>
                  )}
                  {selectedScheme.explanation.missing_info?.length > 0 && (
                    <ul className="modal-criteria-list missing">
                      {selectedScheme.explanation.missing_info.map((item, idx) => (
                        <li key={idx}>ℹ {item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {selectedScheme.documents_required?.length > 0 && (
                <div className="modal-docs-section">
                  <h4 className="modal-section-heading">Required Documents</h4>
                  <div className="modal-docs-tags">
                    {(Array.isArray(selectedScheme.documents_required)
                      ? selectedScheme.documents_required
                      : [selectedScheme.documents_required]
                    ).map((doc, idx) => (
                      <span key={idx} className="doc-pill">📄 {doc}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="modal-footer-actions">
                {selectedScheme.application_url ? (
                  <a
                    href={selectedScheme.application_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                  >
                    <span>Apply on Official Portal</span>
                    <span className="btn-arrow-icon">↗</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setSelectedScheme(null)}
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

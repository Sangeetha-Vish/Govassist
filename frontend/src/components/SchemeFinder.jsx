import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './SchemeFinder.css';

export default function SchemeFinder({ profile }) {
  const navigate = useNavigate();
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search & Filter state
  const [search, setSearch] = useState('');
  // 3 Core Categories: 'all' | 'education' (Student) | 'startup' (Startup & Business) | 'job_seeker' (Career / Job Seekers)
  const [activeCategory, setActiveCategory] = useState('all');
  const [locationFilter, setLocationFilter] = useState(profile?.location ? 'Tamil Nadu' : 'all');
  const [sortBy, setSortBy] = useState('relevance');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'compact'
  const [savedSchemes, setSavedSchemes] = useState({});
  const [selectedSchemeModal, setSelectedSchemeModal] = useState(null);

  // Comparison drawer state
  const [selectedForCompare, setSelectedForCompare] = useState([]);

  const fetchSchemes = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('http://localhost:5000/api/schemes');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Failed to load schemes');
      
      // De-duplicate schemes by unique scheme_id / normalized scheme_name
      const rawList = data.data || [];
      const seen = new Set();
      const uniqueList = [];
      for (const s of rawList) {
        const key = (s.scheme_id || s.scheme_name || '').trim().toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          uniqueList.push(s);
        }
      }
      setSchemes(uniqueList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchemes();
  }, []);

  const toggleSave = (schemeId, e) => {
    e?.stopPropagation();
    setSavedSchemes(prev => ({
      ...prev,
      [schemeId]: !prev[schemeId]
    }));
  };

  const toggleCompare = (scheme, e) => {
    e?.stopPropagation();
    if (selectedForCompare.some((s) => s.scheme_id === scheme.scheme_id)) {
      setSelectedForCompare(selectedForCompare.filter((s) => s.scheme_id !== scheme.scheme_id));
    } else {
      if (selectedForCompare.length >= 3) {
        alert('You can compare up to 3 schemes at a time.');
        return;
      }
      setSelectedForCompare([...selectedForCompare, scheme]);
    }
  };

  const getCategoryIcon = (category, schemeName = '') => {
    const cat = String(category || '').toLowerCase();
    const name = String(schemeName || '').toLowerCase();
    if (cat.includes('startup') || cat.includes('business') || name.includes('mudra') || name.includes('msme') || name.includes('champions')) return '↗';
    if (cat.includes('student') || cat.includes('education') || name.includes('scholarship') || name.includes('fellowship') || name.includes('pragati') || name.includes('aicte')) return '✦';
    if (cat.includes('graduate') || cat.includes('job') || cat.includes('employment') || cat.includes('unemployed') || cat.includes('career') || name.includes('training') || name.includes('fellowship')) return '💼';
    if (cat.includes('house') || name.includes('awas') || name.includes('housing')) return '🏠';
    return '🏛️';
  };

  const getCategoryBadgeLabel = (category) => {
    const cat = String(category || '').toLowerCase();
    if (cat.includes('startup') || cat.includes('business')) return 'STARTUP';
    if (cat.includes('student') || cat.includes('education')) return 'EDUCATION';
    if (cat.includes('graduate') || cat.includes('job') || cat.includes('employment') || cat.includes('unemployed')) return 'CAREER & JOB SEEKER';
    return 'SCHEME';
  };

  // Helper to compute clean benefit text
  const cleanBenefitText = (text) => {
    if (!text) return 'Financial assistance and support grants';
    return String(text).trim();
  };

  // Helper to compute dynamic fit score and relevance bullets
  const enrichScheme = (scheme) => {
    let score = 84;
    const cat = String(scheme.category || '').toLowerCase();
    const bullets = [];

    if (profile?.location && (scheme.location_scope === 'tamil_nadu' || scheme.location_scope === 'pan_india')) {
      bullets.push(`${profile.location} resident`);
      score += 4;
    } else {
      bullets.push('Indian citizen');
    }

    if (scheme.max_family_income) {
      bullets.push(`Annual income ≤ ₹${(Number(scheme.max_family_income) / 100000).toFixed(0)} lakh`);
      if (profile?.family_income && Number(profile.family_income) <= Number(scheme.max_family_income)) {
        score += 4;
      }
    } else {
      bullets.push('No family income cap');
    }

    if (scheme.education_min) {
      bullets.push(`Requires ${scheme.education_min}`);
    } else {
      bullets.push('Open education qualification');
    }

    if (profile?.category && cat.includes(profile.category.toLowerCase())) {
      score += 4;
    }

    const fit_score = Math.min(100, Math.max(50, score));
    return {
      ...scheme,
      fit_score,
      why_relevant: bullets.slice(0, 2),
    };
  };

  // Filter schemes based on 3 supported categories: Education, Startup, Job Seeker
  const filteredSchemes = useMemo(() => {
    return schemes
      .map(enrichScheme)
      .filter((s) => {
        const matchesSearch =
          !search ||
          s.scheme_name?.toLowerCase().includes(search.toLowerCase()) ||
          s.category?.toLowerCase().includes(search.toLowerCase()) ||
          s.benefit_value?.toLowerCase().includes(search.toLowerCase());

        let matchesCat = true;
        if (activeCategory !== 'all') {
          const catLower = String(s.category || '').toLowerCase();
          const nameLower = String(s.scheme_name || '').toLowerCase();
          
          if (activeCategory === 'education') {
            matchesCat = catLower.includes('student') || catLower.includes('education') || nameLower.includes('scholarship') || nameLower.includes('fellowship') || nameLower.includes('aicte') || nameLower.includes('pragati');
          } else if (activeCategory === 'startup') {
            matchesCat = catLower.includes('startup') || catLower.includes('business') || nameLower.includes('mudra') || nameLower.includes('msme') || nameLower.includes('champions') || nameLower.includes('aabcs');
          } else if (activeCategory === 'job_seeker') {
            matchesCat = catLower.includes('graduate') || catLower.includes('job') || catLower.includes('employment') || catLower.includes('unemployed') || catLower.includes('career') || nameLower.includes('training') || nameLower.includes('skill');
          }
        }

        let matchesLoc = true;
        if (locationFilter !== 'all') {
          matchesLoc = s.location_scope === 'pan_india' || (s.location_scope === 'tamil_nadu' && locationFilter.toLowerCase().includes('tamil nadu'));
        }

        return matchesSearch && matchesCat && matchesLoc;
      })
      .sort((a, b) => {
        if (sortBy === 'relevance') return b.fit_score - a.fit_score;
        if (sortBy === 'name') return a.scheme_name.localeCompare(b.scheme_name);
        return 0;
      });
  }, [schemes, search, activeCategory, locationFilter, sortBy, profile]);

  const likelyCount = filteredSchemes.filter(s => s.fit_score >= 70).length;
  const possibleCount = filteredSchemes.filter(s => s.fit_score < 70).length;
  const savedCount = Object.values(savedSchemes).filter(Boolean).length;

  return (
    <div className="editorial-finder-page">
      <div className="finder-main-container">

        {/* ─── TOP PAGE HEADER (SCREENSHOT 3) ─── */}
        <header className="finder-top-header">
          <div className="finder-header-left">
            <div className="kicker-label">SCHEME FINDER</div>
            <h1 className="finder-serif-heading">Find support that fits.</h1>
            <p className="finder-sub-description">
              Explore official schemes, then see how they relate to your profile.
            </p>
          </div>

          <div className="finder-view-toggle">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid View"
            >
              田
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'compact' ? 'active' : ''}`}
              onClick={() => setViewMode('compact')}
              title="List View"
            >
              ≡
            </button>
          </div>
        </header>

        {/* ─── SEARCH BAR & 3 CORE CATEGORY PILLS (REQUIREMENT 1) ─── */}
        <div className="finder-filter-bar-container">
          <div className="finder-search-row">
            <div className="finder-search-input-box">
              <span className="search-glass-icon">🔍</span>
              <input
                type="text"
                className="finder-search-field"
                placeholder="Search schemes, benefits or departments"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button type="button" className="clear-search-btn" onClick={() => setSearch('')}>✕</button>
              )}
            </div>

            <div className="category-pills-scroll">
              <button
                type="button"
                className={`category-filter-pill ${activeCategory === 'all' ? 'active' : ''}`}
                onClick={() => setActiveCategory('all')}
              >
                All schemes
              </button>
              <button
                type="button"
                className={`category-filter-pill ${activeCategory === 'education' ? 'active' : ''}`}
                onClick={() => setActiveCategory('education')}
              >
                Education
              </button>
              <button
                type="button"
                className={`category-filter-pill ${activeCategory === 'startup' ? 'active' : ''}`}
                onClick={() => setActiveCategory('startup')}
              >
                Startup & Business
              </button>
              <button
                type="button"
                className={`category-filter-pill ${activeCategory === 'job_seeker' ? 'active' : ''}`}
                onClick={() => setActiveCategory('job_seeker')}
              >
                Career & Job Seekers
              </button>
            </div>
          </div>

          {/* Subheader: Count & Sort */}
          <div className="finder-subheader-row">
            <div className="results-count-text">
              <strong>{filteredSchemes.length} schemes</strong> based on your current profile
            </div>

            <div className="sort-dropdown-box">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="finder-sort-select"
              >
                <option value="relevance">Most relevant ⌵</option>
                <option value="name">Scheme Name A–Z</option>
              </select>
            </div>
          </div>
        </div>

        {/* ─── TWO-COLUMN CONTENT GRID (SCREENSHOT 2 TARGET CARD DESIGN) ─── */}
        <div className="finder-content-grid">
          
          {/* ─── LEFT COLUMN: Schemes Cards ─── */}
          <div className="finder-schemes-col">
            {loading ? (
              <div className="finder-loading-box card">
                <div className="spinner-large"></div>
                <p>Loading verified schemes...</p>
              </div>
            ) : filteredSchemes.length === 0 ? (
              <div className="finder-empty-box card">
                <span className="empty-icon">🔍</span>
                <h3>No Schemes Found</h3>
                <p>Try clearing your search filters to explore all available government schemes.</p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => { setSearch(''); setActiveCategory('all'); setLocationFilter('all'); }}
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              <div className={viewMode === 'grid' ? 'editorial-finder-cards-grid' : 'editorial-finder-compact-list'}>
                {filteredSchemes.map((scheme) => {
                  const isSaved = !!savedSchemes[scheme.scheme_id];
                  const isCompared = selectedForCompare.some((s) => s.scheme_id === scheme.scheme_id);
                  const isLikely = scheme.fit_score >= 70;
                  const categoryBadge = getCategoryBadgeLabel(scheme.category);
                  const benefitText = cleanBenefitText(scheme.benefit_value || scheme.benefit_amount);

                  return (
                    <div
                      key={scheme.scheme_id}
                      className={`clean-editorial-scheme-card ${isCompared ? 'compared-active' : ''}`}
                      onClick={() => setSelectedSchemeModal(scheme)}
                    >
                      {/* 1. Header: Icon + Category Tag + Bookmark (Screenshot 2) */}
                      <div className="clean-card-header">
                        <div className="clean-card-badge-box">
                          <span className="clean-card-icon">
                            {getCategoryIcon(scheme.category, scheme.scheme_name)}
                          </span>
                          <span className="clean-card-cat-name">{categoryBadge}</span>
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

                      {/* 2. Scheme Title (Tight, clean margin - No empty space) */}
                      <h3 className="clean-card-title">{scheme.scheme_name}</h3>

                      {/* 3. Benefit Section (Refined typography - Not overpowering) */}
                      <div className="clean-benefit-box">
                        <span className="clean-benefit-kicker">BENEFIT</span>
                        <div className="clean-benefit-text" title={benefitText}>
                          {benefitText}
                        </div>
                      </div>

                      {/* 4. Status Pill & Match Confidence Meter (Screenshot 2) */}
                      <div className="clean-card-status-row">
                        <div className="clean-status-pill">
                          <span className={`status-dot ${isLikely ? 'dot-green' : 'dot-amber'}`}></span>
                          <span className="status-label">
                            {isLikely ? 'Likely match' : 'Possible match'}
                          </span>
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
                                strokeDasharray={`${scheme.fit_score}, 100`}
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              />
                            </svg>
                            <span className="meter-val-text">{scheme.fit_score}</span>
                          </div>
                          <span className="confidence-text">match confidence</span>
                        </div>
                      </div>

                      {/* 5. Why this looks relevant (Screenshot 2) */}
                      <div className="clean-why-relevant-box">
                        <div className="why-kicker">Why this looks relevant</div>
                        <div className="why-bullets-list">
                          {scheme.why_relevant.map((bullet, idx) => (
                            <div key={idx} className="why-bullet-item">
                              <span className="bullet-check">✓</span>
                              <span>{bullet}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 6. Card Action Buttons (Screenshot 2) */}
                      <div className="clean-card-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="clean-view-details-btn"
                          onClick={() => setSelectedSchemeModal(scheme)}
                        >
                          <span>View details</span>
                          <span className="btn-arrow-icon">→</span>
                        </button>

                        <button
                          type="button"
                          className={`clean-compare-btn ${isCompared ? 'active' : ''}`}
                          onClick={(e) => toggleCompare(scheme, e)}
                        >
                          <span>⚖️</span>
                          <span>{isCompared ? 'In Compare' : 'Compare'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ─── RIGHT COLUMN: STICKY "YOUR FILTERS" SIDEBAR (REQUIREMENT 4) ─── */}
          <aside className="finder-sticky-sidebar">
            {/* Filter Summary Card */}
            <div className="your-filters-card card">
              <div className="your-filters-kicker">YOUR FILTERS</div>

              <div className="filter-summary-section">
                <div className="filter-sum-label">Profile matched</div>
                <div className="filter-sum-val">{likelyCount} likely · {possibleCount} possible</div>
              </div>

              <div className="filter-summary-section">
                <div className="filter-sum-label">Location</div>
                <div className="active-filter-pill-tag">
                  <span>{locationFilter === 'all' ? 'All Locations' : locationFilter}</span>
                  {locationFilter !== 'all' && (
                    <button
                      type="button"
                      className="remove-filter-x"
                      onClick={() => setLocationFilter('all')}
                      title="Clear location filter"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {savedCount > 0 && (
                <div className="filter-summary-section saved-counter-row">
                  <div className="filter-sum-label">Saved for later</div>
                  <div className="filter-sum-val">{savedCount} schemes bookmarked</div>
                </div>
              )}
            </div>

            {/* Tip Box */}
            <div className="finder-tip-card">
              <div className="tip-header-row">
                <span className="tip-sparkle">✨</span>
                <span className="tip-title">Tip</span>
              </div>
              <p className="tip-body-text">
                Add your income in your profile to make these matches more precise.
              </p>
              <button
                type="button"
                className="tip-update-link"
                onClick={() => navigate('/profile', { state: { defaultTab: 'snapshot' } })}
              >
                <span>Update profile</span>
                <span className="btn-arrow-icon">→</span>
              </button>
            </div>
          </aside>
        </div>

        {/* ─── MODAL DETAIL VIEW ─── */}
        {selectedSchemeModal && (
          <div className="editorial-modal-backdrop" onClick={() => setSelectedSchemeModal(null)}>
            <div className="editorial-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-top-bar">
                <span className="kicker-label">{selectedSchemeModal.category?.toUpperCase() || 'SCHEME'}</span>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setSelectedSchemeModal(null)}
                >
                  ✕
                </button>
              </div>

              <h2 className="modal-scheme-title">{selectedSchemeModal.scheme_name}</h2>

              <div className="modal-benefit-banner">
                <div className="kicker-label">BENEFIT SUMMARY</div>
                <div className="modal-benefit-highlight">
                  {selectedSchemeModal.benefit_value || selectedSchemeModal.benefit_amount || 'Assistance provided under official guidelines.'}
                </div>
              </div>

              <div className="modal-criteria-grid-box">
                <div className="modal-criteria-item">
                  <span className="criteria-kicker">Location Scope</span>
                  <strong>{selectedSchemeModal.location_scope?.replace(/_/g, ' ').toUpperCase() || 'PAN INDIA'}</strong>
                </div>
                <div className="modal-criteria-item">
                  <span className="criteria-kicker">Age Boundary</span>
                  <strong>{selectedSchemeModal.min_age || selectedSchemeModal.max_age ? `${selectedSchemeModal.min_age || 0} to ${selectedSchemeModal.max_age || '∞'} yrs` : 'Any Age'}</strong>
                </div>
                <div className="modal-criteria-item">
                  <span className="criteria-kicker">Education Requirement</span>
                  <strong>{selectedSchemeModal.education_min || 'None Specified'}</strong>
                </div>
                <div className="modal-criteria-item">
                  <span className="criteria-kicker">Income Ceiling</span>
                  <strong>{selectedSchemeModal.max_family_income ? `≤ ₹${Number(selectedSchemeModal.max_family_income).toLocaleString('en-IN')}` : 'No Cap'}</strong>
                </div>
              </div>

              {selectedSchemeModal.documents_required?.length > 0 && (
                <div className="modal-docs-section">
                  <h4 className="modal-section-heading">Required Documents</h4>
                  <div className="modal-docs-tags">
                    {(Array.isArray(selectedSchemeModal.documents_required)
                      ? selectedSchemeModal.documents_required
                      : [selectedSchemeModal.documents_required]
                    ).map((doc, idx) => (
                      <span key={idx} className="doc-pill">📄 {doc}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="modal-footer-actions">
                {selectedSchemeModal.application_url ? (
                  <a
                    href={selectedSchemeModal.application_url}
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
                    onClick={() => setSelectedSchemeModal(null)}
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── SIDE-BY-SIDE COMPARISON DRAWER ─── */}
        {selectedForCompare.length > 0 && (
          <div className="finder-compare-drawer card animate-slide-up">
            <div className="compare-drawer-header">
              <div className="compare-drawer-title">
                <span className="scale-icon">⚖️</span>
                <h4>Comparing {selectedForCompare.length} Schemes Side-by-Side</h4>
              </div>
              <button
                type="button"
                className="clear-compare-btn"
                onClick={() => setSelectedForCompare([])}
              >
                Clear Comparison ✕
              </button>
            </div>

            <div className="compare-columns-grid">
              {selectedForCompare.map((s) => (
                <div key={s.scheme_id} className="compare-col-box">
                  <div className="compare-col-top">
                    <h5>{s.scheme_name}</h5>
                    <span className="cat-pill-small">{s.category}</span>
                  </div>
                  <div className="compare-col-rows">
                    <div className="compare-metric">
                      <span className="metric-label">Estimated Benefit</span>
                      <strong className="metric-val">{s.benefit_value || 'Assistance'}</strong>
                    </div>
                    <div className="compare-metric">
                      <span className="metric-label">Location Scope</span>
                      <span>{s.location_scope?.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="compare-metric">
                      <span className="metric-label">Income Cap</span>
                      <span>{s.max_family_income ? `≤ ₹${Number(s.max_family_income).toLocaleString('en-IN')}` : 'No Cap'}</span>
                    </div>
                    <div className="compare-metric">
                      <span className="metric-label">Education</span>
                      <span>{s.education_min || 'Open'}</span>
                    </div>
                  </div>
                  {s.application_url && (
                    <a
                      href={s.application_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-primary btn-sm btn-block-link"
                    >
                      Apply Officially ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

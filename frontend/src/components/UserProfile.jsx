import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import './UserProfile.css';

const DOCUMENT_TYPES = [
  { value: 'pan', label: 'PAN Card' },
  { value: 'aadhaar', label: 'Aadhaar Card' },
  { value: 'voter_id', label: 'Voter ID' },
  { value: 'income_certificate', label: 'Income Certificate' },
  { value: 'marksheet_10', label: '10th Marksheet' },
  { value: 'marksheet_12', label: '12th Marksheet' },
  { value: 'diploma', label: 'Diploma Certificate' },
  { value: 'degree', label: 'Degree Certificate' },
];

const PROCESSING_STAGES = [
  "Uploading your document...",
  "Reading document structure & text...",
  "Verifying official security & authenticity markers...",
  "Extracting relevant fields & income details...",
  "Syncing verified data with your profile...",
  "Finalizing match score readiness boost..."
];

function getDocLabel(value) {
  return DOCUMENT_TYPES.find(d => d.value === value)?.label || value?.replace(/_/g, ' ') || 'Document';
}

export default function UserProfile({ onUpdateProfile, onComplete }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);

  // Tab: 'doc_check' (Documents) or 'snapshot' (Your Snapshot)
  const [activeTab, setActiveTab] = useState(location.state?.defaultTab || 'doc_check');

  const [formData, setFormData] = useState({
    category: 'student',
    age: '',
    education: '',
    family_income: '',
    location: 'Tamil Nadu',
    employment_status: 'student',
    goal: '',
  });

  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [statusMsg, setStatusMsg] = useState(null);
  const [errors, setErrors] = useState({});

  // Document Upload & OCR State
  const [selectedFile, setSelectedFile] = useState(null);
  const [documentType, setDocumentType] = useState('income_certificate');
  const [ocrStatus, setOcrStatus] = useState('idle'); // idle | processing | verified | review | rejected | error
  const [processingStage, setProcessingStage] = useState(0);
  const [verificationResult, setVerificationResult] = useState(null);
  const [verifiedFields, setVerifiedFields] = useState({});
  const [userMessage, setUserMessage] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // User Documents Vault
  const [userDocuments, setUserDocuments] = useState([]);
  const [loadingUserDocs, setLoadingUserDocs] = useState(false);
  const [expandedDocId, setExpandedDocId] = useState(null);

  useEffect(() => {
    if (location.state?.defaultTab) {
      setActiveTab(location.state.defaultTab);
    }
  }, [location.state]);

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setFormData({
          category: data.category || 'student',
          age: data.age || '',
          education: data.education || '',
          family_income: data.family_income || '',
          location: data.location || 'Tamil Nadu',
          employment_status: data.employment_status || 'student',
          goal: data.goal || '',
        });
        if (onUpdateProfile) onUpdateProfile(data);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setFetching(false);
    }
  }, [user?.id, onUpdateProfile]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const fetchUserDocuments = useCallback(async () => {
    if (!user) return;
    setLoadingUserDocs(true);
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setUserDocuments(data || []);
    } catch (err) {
      console.error('Error fetching user documents:', err);
    } finally {
      setLoadingUserDocs(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchUserDocuments();
  }, [fetchUserDocuments]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (errors[e.target.name]) {
      setErrors({ ...errors, [e.target.name]: null });
    }
  };

  const handleSnapshotSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);

    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          category: formData.category,
          age: parseInt(formData.age) || 0,
          education: formData.education,
          family_income: parseInt(formData.family_income) || 0,
          location: formData.location,
          employment_status: formData.employment_status,
          goal: formData.goal,
        });

      if (error) throw error;

      setStatusMsg({ type: 'success', text: 'Profile updated and synced with matching engine!' });
      if (onUpdateProfile) onUpdateProfile(formData);
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setOcrStatus('idle');
      setVerificationResult(null);
      setUserMessage('');
    }
  };

  const triggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleVerifyDocument = async () => {
    if (!selectedFile || !documentType) return;

    setIsVerifying(true);
    setOcrStatus('processing');
    setProcessingStage(0);

    const stageInterval = setInterval(() => {
      setProcessingStage((prev) => (prev < PROCESSING_STAGES.length - 1 ? prev + 1 : prev));
    }, 900);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const uploadData = new FormData();
      uploadData.append('document', selectedFile);
      uploadData.append('documentType', documentType);
      uploadData.append('document_type', documentType);
      uploadData.append('userId', user?.id || '');
      uploadData.append('user_id', user?.id || '');

      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('http://localhost:5000/api/documents/verify', {
        method: 'POST',
        headers,
        body: uploadData,
      });

      clearInterval(stageInterval);
      const result = await response.json();

      if (!response.ok) {
        setOcrStatus('rejected');
        setUserMessage(result.error?.message || 'Verification could not be completed.');
        return;
      }

      const doc = result.data;
      const status = doc?.verification_status;

      setVerificationResult({
        status,
        extracted_data: doc?.extracted_data || {},
        userMessage: result.userMessage,
      });

      if (status === 'verified') {
        setOcrStatus('verified');
        setUserMessage(result.userMessage || 'Document verified successfully and synced!');
        fetchUserDocuments();
        fetchProfile();
      } else if (status === 'manual_review_required') {
        setOcrStatus('review');
        setUserMessage(result.userMessage || 'Document sent for review.');
        fetchUserDocuments();
      } else {
        setOcrStatus('rejected');
        setUserMessage(result.userMessage || 'Document could not be verified.');
        fetchUserDocuments();
      }
    } catch (err) {
      clearInterval(stageInterval);
      setOcrStatus('error');
      setUserMessage('Error uploading document. Please check your connection.');
    } finally {
      setIsVerifying(false);
    }
  };

  const verifiedCount = userDocuments.filter((d) => d.verification_status === 'verified').length;

  return (
    <div className="editorial-doc-center">
      <div className="doc-center-container">
        
        {/* ─── TAB NAVIGATION BAR ─── */}
        <div className="doc-center-tab-nav">
          <button
            type="button"
            className={`center-tab-btn ${activeTab === 'doc_check' ? 'active' : ''}`}
            onClick={() => setActiveTab('doc_check')}
          >
            <span>Documents & Vault</span>
            {verifiedCount > 0 && <span className="tab-pill-badge">{verifiedCount} verified</span>}
          </button>
          <button
            type="button"
            className={`center-tab-btn ${activeTab === 'snapshot' ? 'active' : ''}`}
            onClick={() => setActiveTab('snapshot')}
          >
            <span>Your Snapshot</span>
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════
            VIEW 1: DOCUMENT CENTER (SCREENSHOT 3 TARGET)
            ═══════════════════════════════════════════════════════ */}
        {activeTab === 'doc_check' && (
          <div className="doc-check-view">
            {/* Top Header */}
            <header className="doc-center-header">
              <div className="doc-header-left">
                <div className="kicker-label">DOCUMENT CENTER</div>
                <h1 className="doc-serif-heading">Proof, on your terms.</h1>
                <p className="doc-sub-description">
                  Documents are optional. They can improve confidence, but never block your journey.
                </p>
              </div>

              <div className="doc-header-right">
                <button
                  type="button"
                  className="btn btn-primary upload-doc-cta-btn"
                  onClick={triggerFileUpload}
                >
                  <span className="upload-btn-icon">☁️↑</span>
                  <span>Upload document</span>
                </button>
              </div>
            </header>

            {/* Main Two-Column Grid */}
            <div className="doc-center-grid">
              
              {/* ─── LEFT COLUMN: Upload Dropzone & Document List ─── */}
              <div className="doc-center-left-col">
                
                {/* Large Upload Dropzone Card */}
                <div className="editorial-dropzone-card">
                  <div className="dropzone-top-icon">
                    <span className="cloud-icon">☁️↑</span>
                  </div>

                  <h2 className="dropzone-title">
                    Upload / <span className="serif-italic-accent">verify a document</span>
                  </h2>
                  <p className="dropzone-specs">PDF, JPG or PNG · Up to 10 MB</p>

                  <div className="dropzone-type-select-row">
                    <label className="type-select-label" htmlFor="doc-type-picker">Type:</label>
                    <select
                      id="doc-type-picker"
                      value={documentType}
                      onChange={(e) => setDocumentType(e.target.value)}
                      className="doc-type-dropdown"
                    >
                      {DOCUMENT_TYPES.map((dt) => (
                        <option key={dt.value} value={dt.value}>{dt.label}</option>
                      ))}
                    </select>
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden-file-input"
                    accept=".pdf,application/pdf,image/jpeg,image/png"
                    onChange={handleFileSelect}
                  />

                  <div className="dropzone-action-row">
                    <button
                      type="button"
                      className="choose-file-btn"
                      onClick={triggerFileUpload}
                    >
                      <span>Choose a file</span>
                      <span className="btn-arrow-icon">→</span>
                    </button>
                  </div>

                  {selectedFile && (
                    <div className="selected-file-banner">
                      <div className="file-pill">
                        <span>📄</span>
                        <strong>{selectedFile.name}</strong>
                        <span>({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm verify-now-btn"
                        onClick={handleVerifyDocument}
                        disabled={isVerifying}
                      >
                        {isVerifying ? 'Verifying...' : 'Verify Now ➔'}
                      </button>
                    </div>
                  )}

                  {/* Processing Status Feedback */}
                  {ocrStatus === 'processing' && (
                    <div className="ocr-processing-box">
                      <div className="spinner-large"></div>
                      <h4>Analyzing Document Authenticity</h4>
                      <p className="stage-text">{PROCESSING_STAGES[processingStage]}</p>
                    </div>
                  )}

                  {/* Verified Outcome Feedback */}
                  {ocrStatus === 'verified' && (
                    <div className="ocr-outcome-alert success">
                      <span className="outcome-icon">✓</span>
                      <div>
                        <strong>Document Verified & Synced!</strong>
                        <p>{userMessage || 'Your credentials were authenticated and added to your readiness score.'}</p>
                      </div>
                    </div>
                  )}

                  {/* Rejected Feedback */}
                  {ocrStatus === 'rejected' && (
                    <div className="ocr-outcome-alert error">
                      <span className="outcome-icon">⚠️</span>
                      <div>
                        <strong>Verification Needs Attention</strong>
                        <p>{userMessage || 'Document could not be verified automatically.'}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Verified Document Vault Section */}
                <div className="doc-vault-section">
                  <div className="vault-header-row">
                    <div>
                      <div className="kicker-label">VERIFIED DOCUMENT VAULT</div>
                      <h2 className="vault-serif-title">Your documents</h2>
                    </div>
                    <span className="vault-count-label">{userDocuments.length} documents</span>
                  </div>

                  {loadingUserDocs ? (
                    <div className="vault-loading-card card">
                      <div className="spinner-large"></div>
                      <p>Loading your documents...</p>
                    </div>
                  ) : userDocuments.length === 0 ? (
                    <div className="vault-empty-box card">
                      <p>No documents uploaded yet. Choose a file above to add verified credentials.</p>
                    </div>
                  ) : (
                    <div className="vault-cards-list">
                      {userDocuments.map((doc) => {
                        const isVerified = doc.verification_status === 'verified';
                        const isReview = doc.verification_status === 'manual_review_required';
                        const isExpanded = expandedDocId === doc.id;
                        const extracted = doc.extracted_data || {};
                        const dateFormatted = new Date(doc.created_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        });

                        return (
                          <div
                            key={doc.id}
                            className={`editorial-doc-row-card ${isExpanded ? 'expanded' : ''}`}
                            onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}
                          >
                            <div className="doc-row-main">
                              <div className="doc-row-left">
                                <div className={`doc-type-icon-box ${isVerified ? 'verified-tint' : 'review-tint'}`}>
                                  <span>📄</span>
                                </div>
                                <div className="doc-row-titles">
                                  <strong className="doc-name">{getDocLabel(doc.document_type)}</strong>
                                  <span className="doc-sub-date">
                                    Uploaded {dateFormatted} · {isVerified ? 'Valid for scheme matching' : 'Pending verification'}
                                  </span>
                                </div>
                              </div>

                              <div className="doc-row-right">
                                {isVerified ? (
                                  <div className="status-badge-verified">
                                    <span className="status-dot dot-green"></span>
                                    <span>Verified</span>
                                    <span className="expand-chevron">{isExpanded ? '⌃' : '⌵'}</span>
                                  </div>
                                ) : isReview ? (
                                  <div className="review-action-group" onClick={(e) => e.stopPropagation()}>
                                    <span className="status-dot dot-amber"></span>
                                    <span className="status-amber-text">Needs review</span>
                                    <button
                                      type="button"
                                      className="review-btn"
                                      onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}
                                    >
                                      Review →
                                    </button>
                                  </div>
                                ) : (
                                  <div className="status-badge-rejected">
                                    <span className="status-dot dot-red"></span>
                                    <span>Needs attention</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Collapsible Metadata Details */}
                            {isExpanded && (
                              <div className="doc-expanded-details" onClick={(e) => e.stopPropagation()}>
                                {extracted && Object.keys(extracted).length > 0 ? (
                                  <div className="extracted-fields-grid">
                                    {Object.entries(extracted).map(([k, v]) => (
                                      v && k !== 'flag' && (
                                        <div key={k} className="extracted-chip">
                                          <span className="chip-key">{k.replace(/_/g, ' ')}:</span>
                                          <span className="chip-val">
                                            {typeof v === 'number' ? `₹${v.toLocaleString('en-IN')}` : String(v)}
                                          </span>
                                        </div>
                                      )
                                    ))}
                                  </div>
                                ) : (
                                  <p className="no-meta-text">Verified document attached to profile snapshot.</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* ─── RIGHT COLUMN: Trust & Privacy Card (Screenshot 3) ─── */}
              <aside className="doc-center-right-col">
                <div className="doc-privacy-trust-card">
                  <div className="privacy-trust-icon-box">
                    <span className="shield-icon">🛡️</span>
                  </div>
                  <h3 className="privacy-trust-title">Your documents stay yours.</h3>
                  <p className="privacy-trust-desc">
                    We use documents only to verify information you choose to share. You can delete them at any time.
                  </p>
                  <a href="#privacy" className="privacy-promise-link">
                    <span>Read our privacy promise</span>
                    <span className="btn-arrow-icon">→</span>
                  </a>
                </div>
              </aside>

            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            VIEW 2: YOUR SNAPSHOT PROFILE EDIT VIEW
            ═══════════════════════════════════════════════════════ */}
        {activeTab === 'snapshot' && (
          <div className="snapshot-edit-view">
            <header className="snapshot-header">
              <div className="kicker-label">CITIZEN PROFILE</div>
              <h1 className="doc-serif-heading">
                Your profile, <span className="serif-italic-accent">in focus.</span>
              </h1>
              <p className="doc-sub-description">
                This data powers your match score. Update your details to discover precision schemes.
              </p>
            </header>

            {statusMsg && (
              <div className={`editorial-alert ${statusMsg.type === 'success' ? 'alert-success' : 'alert-error'}`}>
                <span>{statusMsg.type === 'success' ? '✓' : '⚠️'}</span>
                <div>{statusMsg.text}</div>
              </div>
            )}

            <form onSubmit={handleSnapshotSubmit} className="snapshot-editorial-form">
              {/* Group 1: Personal Demographics */}
              <div className="form-editorial-card card">
                <div className="form-card-header">
                  <span className="card-num-badge">01</span>
                  <div>
                    <h3 className="card-header-title">Personal Demographics</h3>
                    <p className="card-header-sub">Age and resident location for hard eligibility boundaries</p>
                  </div>
                </div>

                <div className="form-grid-2col">
                  <div className="form-group">
                    <label className="form-label" htmlFor="cat-select">Citizen Category *</label>
                    <select
                      id="cat-select"
                      name="category"
                      value={formData.category}
                      onChange={handleChange}
                      className="form-control"
                    >
                      <option value="student">Student</option>
                      <option value="graduate">Graduate / Professional</option>
                      <option value="startup">Startup Founder / Entrepreneur</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="age-input">Current Age *</label>
                    <input
                      id="age-input"
                      type="number"
                      name="age"
                      value={formData.age}
                      onChange={handleChange}
                      className="form-control"
                      placeholder="e.g. 22"
                      min="1"
                      max="120"
                    />
                  </div>

                  <div className="form-group full-width">
                    <label className="form-label" htmlFor="loc-input">Location / State</label>
                    <input
                      id="loc-input"
                      type="text"
                      name="location"
                      value={formData.location}
                      onChange={handleChange}
                      className="form-control"
                      placeholder="e.g. Tamil Nadu"
                    />
                  </div>
                </div>
              </div>

              {/* Group 2: Education & Career */}
              <div className="form-editorial-card card">
                <div className="form-card-header">
                  <span className="card-num-badge">02</span>
                  <div>
                    <h3 className="card-header-title">Education & Career Milestone</h3>
                    <p className="card-header-sub">Highest qualification tier and vocational status</p>
                  </div>
                </div>

                <div className="form-grid-2col">
                  <div className="form-group">
                    <label className="form-label" htmlFor="edu-input">Highest Education Qualification *</label>
                    <input
                      id="edu-input"
                      type="text"
                      name="education"
                      value={formData.education}
                      onChange={handleChange}
                      className="form-control"
                      placeholder="e.g. B.E, 12th, Diploma, B.Sc"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="emp-input">Employment Status</label>
                    <input
                      id="emp-input"
                      type="text"
                      name="employment_status"
                      value={formData.employment_status}
                      onChange={handleChange}
                      className="form-control"
                      placeholder="e.g. student, job seeker, self-employed"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="inc-input">Annual Family Income (₹)</label>
                    <input
                      id="inc-input"
                      type="number"
                      name="family_income"
                      value={formData.family_income}
                      onChange={handleChange}
                      className="form-control"
                      placeholder="e.g. 150000"
                      min="0"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="goal-input">Primary Objective</label>
                    <input
                      id="goal-input"
                      type="text"
                      name="goal"
                      value={formData.goal}
                      onChange={handleChange}
                      className="form-control"
                      placeholder="e.g. Higher education scholarship, business loan"
                    />
                  </div>
                </div>
              </div>

              <div className="snapshot-form-submit-row">
                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  disabled={saving}
                >
                  <span>{saving ? 'Saving...' : 'Save & Update Matches'}</span>
                  <span className="btn-arrow-icon">→</span>
                </button>
              </div>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}

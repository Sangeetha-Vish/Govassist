import { useState } from 'react';
import './OnboardingModal.css';

export default function OnboardingModal({
  isOpen,
  onClose,
  initialProfile,
  onSubmitProfile,
  onContinueToAuth,
  initialStep = 1,
}) {
  const [step, setStep] = useState(initialStep); // 1: Vibe Check, 2: Results, 3: Auth

  const [formData, setFormData] = useState({
    category: initialProfile?.category || 'student',
    age: initialProfile?.age || '',
    education: initialProfile?.education || '',
    family_income: initialProfile?.family_income || '',
    location: initialProfile?.location || 'Tamil Nadu',
    employment_status: initialProfile?.employment_status || 'student',
    goal: initialProfile?.goal || '',
  });

  const [authData, setAuthData] = useState({
    method: 'email',
    phone: '',
    email: '',
    password: '',
    otp: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [topRecs, setTopRecs] = useState(null);

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAuthChange = (e) => {
    setAuthData({ ...authData, [e.target.name]: e.target.value });
  };

  const handleVibeCheck = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:5000/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Failed to fetch recommendations');

      const recList = data.data || [];
      setTopRecs(recList.slice(0, 3));
      setStep(2); // Move to results
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAuthSubmit = (e) => {
    e.preventDefault();
    if (authData.method === 'phone' && authData.otp !== '123456') {
      setError('Enter the demo OTP 123456 to continue.');
      return;
    }
    setError(null);
    // Simulate auth & preserve data
    onSubmitProfile({ ...formData, email: authData.method === 'email' ? authData.email : '' }, topRecs || []);
    onContinueToAuth();
  };

  return (
    <div className="modal-overlay">
      <div className={`modal-card onboarding-card ${step === 3 ? 'auth-step' : ''}`}>
        
        {step !== 3 && (
          <div className="modal-header">
            <div>
              <h3>{step === 1 ? 'Run Vibe Check' : 'Your Picks Are Ready!'}</h3>
              <p className="card-desc">
                {step === 1 ? 'Step 1: Enter your criteria to see if you qualify.' : 'Step 2: Review your top matches.'}
              </p>
            </div>
            <button type="button" className="close-btn" onClick={onClose}>✕</button>
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleVibeCheck} className="gov-form" style={{ padding: '1.5rem' }}>
            {error && (
              <div className="alert alert-danger mb-3">
                <span>⚠️</span> <span>{error}</span>
              </div>
            )}

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Category *</label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="form-control"
                  required
                >
                  <option value="student">Student</option>
                  <option value="graduate">Graduate</option>
                  <option value="startup">Startup / Entrepreneur</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Age</label>
                <input
                  type="number"
                  name="age"
                  value={formData.age}
                  onChange={handleChange}
                  className="form-control"
                  placeholder="e.g. 21"
                  min="0"
                  max="120"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Education Level</label>
                <input
                  type="text"
                  name="education"
                  value={formData.education}
                  onChange={handleChange}
                  className="form-control"
                  placeholder="e.g. B.E / 12th / Diploma"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Annual Family Income (₹)</label>
                <input
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
                <label className="form-label">Location / State</label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  className="form-control"
                  placeholder="e.g. Tamil Nadu"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Employment Status</label>
                <input
                  type="text"
                  name="employment_status"
                  value={formData.employment_status}
                  onChange={handleChange}
                  className="form-control"
                  placeholder="e.g. student / unemployed"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Primary Goal / Requirement</label>
              <input
                type="text"
                name="goal"
                value={formData.goal}
                onChange={handleChange}
                className="form-control"
                placeholder="e.g. Higher education scholarship, skill development training"
              />
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <><span className="spinner"></span> Evaluating...</> : 'Generate Your Picks'}
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="onboarding-results" style={{ padding: '1.5rem' }}>
            <div className="alert alert-success">
              <span>🎉</span>
              <div>
                <strong>We found some matches!</strong> Here are your top picks based on your snapshot.
              </div>
            </div>

            <div className="top-recs-list">
              {topRecs && topRecs.length > 0 ? (
                topRecs.map((rec) => (
                  <div key={rec.scheme_id} className="card top-rec-card">
                    <div className="rec-badge-row">
                      <span className="rank-badge">Rank #{rec.rank}</span>
                      <span className="score-val" style={{ color: 'var(--ga-mint-dark)', fontWeight: 800 }}>
                        {rec.fit_score}% Match Meter
                      </span>
                    </div>
                    <h4 className="rec-title">{rec.scheme_name}</h4>
                    <p className="rec-benefit">
                      🎁 <strong>Benefit:</strong> {rec.benefit_value || rec.benefit_type || 'Financial assistance'}
                    </p>
                    {rec.explanation?.why_qualified?.[0] && (
                      <p className="rec-reason">✓ {rec.explanation.why_qualified[0]}</p>
                    )}
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <p>Not a Match... Yet. Try tuning your snapshot.</p>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>
                Tune Your Snapshot
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>
                Save Profile & Create Account ➔
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="auth-split">
            <div className="auth-brand-pane">
              <h2>GovAssist AI</h2>
              <p>Save your profile, track your applications, and verify your documents to boost your Match Meter score.</p>
              
              <div style={{ marginTop: '2rem' }}>
                <div className="stat-item" style={{ marginBottom: '1rem' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 800 }}>{topRecs?.length || 0}</span>
                  <span style={{ display: 'block', opacity: 0.8, fontSize: '0.9rem' }}>Schemes Waiting For You</span>
                </div>
              </div>
            </div>

            <div className="auth-form-pane">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
                 <button type="button" className="close-btn" onClick={onClose}>✕</button>
              </div>

              <h3 style={{ marginBottom: '0.4rem', color: 'var(--ga-slate-deep)' }}>Sign in or Create Account</h3>
              <p className="card-desc" style={{ marginBottom: '1.25rem' }}>Choose how you want to access your GovAssist profile.</p>

              <div className="auth-method-toggle" role="group" aria-label="Sign in method">
                <button type="button" className={authData.method === 'email' ? 'active' : ''} onClick={() => setAuthData({ ...authData, method: 'email', otp: '' })}>Email</button>
                <button type="button" className={authData.method === 'phone' ? 'active' : ''} onClick={() => setAuthData({ ...authData, method: 'phone', otp: '' })}>Phone + OTP</button>
              </div>

              {error && <div className="alert alert-danger mb-3" role="alert"><span>⚠️</span> <span>{error}</span></div>}
              
              <form onSubmit={handleAuthSubmit} className="gov-form">
                {authData.method === 'email' ? <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="auth-email">Email address</label>
                    <input id="auth-email" type="email" name="email" value={authData.email} onChange={handleAuthChange} className="form-control" placeholder="you@example.com" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="auth-password">Password</label>
                    <input id="auth-password" type="password" name="password" value={authData.password} onChange={handleAuthChange} className="form-control" placeholder="Enter your password" minLength="6" required />
                  </div>
                </> : <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="auth-phone">Phone number</label>
                    <input id="auth-phone" type="tel" name="phone" value={authData.phone} onChange={handleAuthChange} className="form-control" placeholder="+91 98765 43210" pattern="[+]?[0-9 ()-]{10,}" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="auth-otp">One-time password</label>
                    <input id="auth-otp" type="text" name="otp" value={authData.otp} onChange={handleAuthChange} className="form-control" placeholder="Use 123456 for demo" inputMode="numeric" pattern="[0-9]{6}" required />
                  </div>
                </>}

                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
                  Continue to Your Snapshot ➔
                </button>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import './OnboardingModal.css';

export default function Onboarding() {
  const { user, completeProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(user ? 1 : 3); // 3: Auth Split, 1: Snapshot Form, 2: Doc Check

  const [formData, setFormData] = useState({
    category: 'student',
    age: '',
    education: '',
    family_income: '',
    location: 'Tamil Nadu',
    employment_status: 'student',
    goal: '',
  });

  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authData, setAuthData] = useState({
    fullName: '',
    email: '',
    password: '',
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAuthChange = (e) => {
    setAuthData({ ...authData, [e.target.name]: e.target.value });
  };

  const validateAuth = () => {
    const newErrors = {};
    if (authMode === 'register' && !authData.fullName.trim()) {
      newErrors.fullName = 'Full Name is required.';
    }
    if (!authData.email.trim()) {
      newErrors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authData.email)) {
      newErrors.email = 'Please enter a valid email address.';
    }
    if (!authData.password.trim()) {
      newErrors.password = 'Password is required.';
    } else if (authData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (!validateAuth()) return;
    
    setLoading(true);
    setErrors({});
    
    try {
      if (authMode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email: authData.email,
          password: authData.password,
          options: {
            data: {
              full_name: authData.fullName,
            }
          }
        });
        if (error) throw error;
        
        if (data?.user && !data.session) {
          throw new Error('registration_success_confirm_email');
        }
        setStep(1); // Proceed to snapshot
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authData.email,
          password: authData.password,
        });
        if (error) throw error;

        // Check if profile exists
        const { data: profileData } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('user_id', data.user.id)
          .single();

        if (profileData) {
          completeProfile();
          navigate('/dashboard');
        } else {
          setStep(1); // Needs to fill snapshot
        }
      }
    } catch (err) {
      let errorMessage = err.message;
      if (err.status === 429) {
        errorMessage = 'Too many requests. Please wait a moment and try again.';
      } else if (err.message === 'User already registered') {
        errorMessage = 'An account with this email already exists. Please sign in.';
      } else if (err.message === 'Invalid login credentials') {
        errorMessage = 'Invalid email or password.';
      } else if (err.message === 'registration_success_confirm_email') {
        errorMessage = 'Account created! Please check your email to confirm before signing in.';
      }
      setErrors({ auth: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const validateSnapshot = () => {
    const newErrors = {};
    if (!formData.category) newErrors.category = 'Category is required.';
    if (!formData.age) newErrors.age = 'Age is required.';
    if (!formData.education) newErrors.education = 'Education is required.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSnapshotSubmit = async (e) => {
    e.preventDefault();
    if (!validateSnapshot()) return;
    
    setLoading(true);
    setErrors({});
    
    try {
      const activeUser = user || (await supabase.auth.getUser()).data.user;
      if (!activeUser) throw new Error('No authenticated user session found.');

      const { error } = await supabase
        .from('profiles')
        .upsert({
          user_id: activeUser.id,
          category: formData.category,
          age: parseInt(formData.age),
          education: formData.education,
          family_income: parseInt(formData.family_income) || 0,
          location: formData.location,
          employment_status: formData.employment_status,
          goal: formData.goal
        });
        
      if (error) throw error;
      
      completeProfile();
      navigate('/dashboard');
    } catch (err) {
      setErrors({ snapshot: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="editorial-auth-page">
      {/* ─── STEP 3: AUTH HERO SPLIT (SCREENSHOT 1) ─── */}
      {step === 3 && (
        <div className="auth-hero-split-container">
          {/* Left Column: Editorial Value Proposition */}
          <div className="auth-hero-left">
            <div className="kicker-label auth-kicker">WELCOME TO GOVASSIST</div>

            <h1 className="auth-hero-heading">
              Keep your <br />
              progress. <br />
              <span className="serif-italic-accent">Keep your <br />privacy.</span>
            </h1>

            <p className="auth-hero-subtitle">
              Sign in to save your eligibility journey and come back whenever you're ready.
            </p>

            <div className="auth-trust-badge">
              <div className="trust-shield-icon">🛡️</div>
              <div className="trust-shield-content">
                <strong>Private by design</strong>
                <span>We don't sell your data or make approval decisions.</span>
              </div>
            </div>
          </div>

          {/* Right Column: Clean White Sign-in Card */}
          <div className="auth-hero-right">
            <div className="auth-card-surface">
              <h2 className="auth-card-title">
                {authMode === 'login' ? 'Sign in to continue' : 'Create your account'}
              </h2>
              <p className="auth-card-sub">
                {authMode === 'login' ? 'Pick up exactly where you left off.' : 'Start discovering your eligible schemes.'}
              </p>

              {errors.auth && (
                <div className="editorial-alert alert-error">
                  <span>⚠️</span>
                  <span>{errors.auth}</span>
                </div>
              )}

              <form onSubmit={handleAuthSubmit} className="editorial-auth-form" noValidate>
                {authMode === 'register' && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="fullName">Full Name</label>
                    <input
                      id="fullName"
                      type="text"
                      name="fullName"
                      value={authData.fullName}
                      onChange={handleAuthChange}
                      className={`form-control ${errors.fullName ? 'input-error' : ''}`}
                      placeholder="e.g. Arun Kumar"
                    />
                    {errors.fullName && <div className="form-field-error">{errors.fullName}</div>}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" htmlFor="email">Email address</label>
                  <input
                    id="email"
                    type="email"
                    name="email"
                    value={authData.email}
                    onChange={handleAuthChange}
                    className={`form-control ${errors.email ? 'input-error' : ''}`}
                    placeholder="you@example.com"
                  />
                  {errors.email && <div className="form-field-error">{errors.email}</div>}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    name="password"
                    value={authData.password}
                    onChange={handleAuthChange}
                    className={`form-control ${errors.password ? 'input-error' : ''}`}
                    placeholder="••••••••"
                  />
                  {errors.password && <div className="form-field-error">{errors.password}</div>}
                </div>

                <button
                  type="submit"
                  className="btn btn-primary auth-submit-btn"
                  disabled={loading}
                >
                  <span>{loading ? 'Signing in...' : (authMode === 'login' ? 'Sign in' : 'Create account')}</span>
                  <span className="btn-arrow-icon">→</span>
                </button>
              </form>

              <div className="auth-card-footer">
                {authMode === 'login' ? (
                  <p>
                    New to GovAssist?{' '}
                    <button
                      type="button"
                      className="auth-mode-link"
                      onClick={() => { setAuthMode('register'); setErrors({}); }}
                    >
                      Create an account
                    </button>
                  </p>
                ) : (
                  <p>
                    Already have an account?{' '}
                    <button
                      type="button"
                      className="auth-mode-link"
                      onClick={() => { setAuthMode('login'); setErrors({}); }}
                    >
                      Sign in
                    </button>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── STEP 1: SNAPSHOT ELIGIBILITY FORM ─── */}
      {step === 1 && (
        <div className="snapshot-form-container">
          <div className="snapshot-form-card">
            <div className="form-header">
              <div className="kicker-label">STEP 1 OF 2</div>
              <h2 className="form-serif-title">
                Your eligibility <span className="serif-italic-accent">snapshot.</span>
              </h2>
              <p className="form-sub-desc">
                Provide your basic profile details so we can calculate exact scheme matches.
              </p>
            </div>

            {errors.snapshot && (
              <div className="editorial-alert alert-error">
                <span>⚠️</span>
                <span>{errors.snapshot}</span>
              </div>
            )}

            <form onSubmit={handleSnapshotSubmit} className="editorial-form" noValidate>
              <div className="form-grid-2col">
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    className={`form-control ${errors.category ? 'input-error' : ''}`}
                  >
                    <option value="student">Student</option>
                    <option value="graduate">Graduate / Job Seeker</option>
                    <option value="startup">Startup / Entrepreneur</option>
                  </select>
                  {errors.category && <div className="form-field-error">{errors.category}</div>}
                </div>

                <div className="form-group">
                  <label className="form-label">Age *</label>
                  <input
                    type="number"
                    name="age"
                    value={formData.age}
                    onChange={handleChange}
                    className={`form-control ${errors.age ? 'input-error' : ''}`}
                    placeholder="e.g. 21"
                    min="1"
                    max="120"
                  />
                  {errors.age && <div className="form-field-error">{errors.age}</div>}
                </div>

                <div className="form-group">
                  <label className="form-label">Education Qualification *</label>
                  <input
                    type="text"
                    name="education"
                    value={formData.education}
                    onChange={handleChange}
                    className={`form-control ${errors.education ? 'input-error' : ''}`}
                    placeholder="e.g. B.Tech, 12th, Graduate"
                  />
                  {errors.education && <div className="form-field-error">{errors.education}</div>}
                </div>

                <div className="form-group">
                  <label className="form-label">Annual Family Income (₹)</label>
                  <input
                    type="number"
                    name="family_income"
                    value={formData.family_income}
                    onChange={handleChange}
                    className="form-control"
                    placeholder="e.g. 200000"
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
                    placeholder="e.g. student, unemployed, self-employed"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Primary Goal or Assistance Needed</label>
                <input
                  type="text"
                  name="goal"
                  value={formData.goal}
                  onChange={handleChange}
                  className="form-control"
                  placeholder="e.g. Higher education scholarship, business capital, skill training"
                />
              </div>

              <div className="snapshot-form-actions">
                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  disabled={loading}
                >
                  <span>{loading ? 'Matching Schemes...' : 'Find My Matches'}</span>
                  <span className="btn-arrow-icon">→</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import './Header.css';

export default function Header() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const [lang, setLang] = useState('ta'); // 'ta' for தமிழ், 'en' for English
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleLanguage = () => {
    setLang(prev => (prev === 'ta' ? 'en' : 'ta'));
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setMobileMenuOpen(false);
      navigate('/');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const handleNavClick = () => {
    setMobileMenuOpen(false);
  };

  return (
    <header className="gov-header">
      <div className="gov-header-container">
        {/* Brand Logo */}
        <Link to="/" className="gov-brand" onClick={handleNavClick}>
          <div className="gov-brand-icon">G</div>
          <span className="gov-brand-name">GovAssist AI</span>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="gov-nav desktop-only">
          <Link
            to="/finder"
            className={`nav-link ${currentPath === '/finder' ? 'active' : ''}`}
          >
            Find schemes
          </Link>
          <Link
            to="/dashboard"
            className={`nav-link ${currentPath === '/dashboard' ? 'active' : ''}`}
          >
            My dashboard
          </Link>
          <Link
            to="/profile"
            state={{ defaultTab: 'doc_check' }}
            className={`nav-link ${currentPath === '/profile' ? 'active' : ''}`}
          >
            Documents
          </Link>
        </nav>

        {/* Right Actions: Language Switcher & Auth & Hamburger */}
        <div className="gov-header-actions">
          <button 
            type="button" 
            className="lang-switcher-btn"
            onClick={toggleLanguage}
            title="Switch Language"
          >
            <span className="lang-label">{lang === 'ta' ? 'தமிழ்' : 'English'}</span>
            <span className="lang-icon">🌐</span>
          </button>

          {user ? (
            <div className="user-profile-menu desktop-only">
              <button 
                type="button"
                className="user-nav-avatar-btn"
                onClick={() => navigate('/profile')}
                title="View Profile"
              >
                <span className="user-initial">
                  {user.user_metadata?.full_name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'U'}
                </span>
                <span className="user-nav-name">
                  {user.user_metadata?.full_name?.split(' ')[0] || user.email?.split('@')[0]}
                </span>
              </button>
              <button
                type="button"
                className="header-signout-btn"
                onClick={handleSignOut}
                title="Sign out"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="header-signin-link desktop-only"
              onClick={() => navigate('/onboarding/snapshot')}
            >
              Sign in
            </button>
          )}

          {/* Mobile Hamburger Toggle */}
          <button
            type="button"
            className="mobile-hamburger-btn mobile-only"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="mobile-nav-drawer mobile-only">
          <Link
            to="/finder"
            className={`mobile-nav-link ${currentPath === '/finder' ? 'active' : ''}`}
            onClick={handleNavClick}
          >
            Find schemes
          </Link>
          <Link
            to="/dashboard"
            className={`mobile-nav-link ${currentPath === '/dashboard' ? 'active' : ''}`}
            onClick={handleNavClick}
          >
            My dashboard
          </Link>
          <Link
            to="/profile"
            state={{ defaultTab: 'doc_check' }}
            className={`mobile-nav-link ${currentPath === '/profile' ? 'active' : ''}`}
            onClick={handleNavClick}
          >
            Documents
          </Link>
          <div className="mobile-drawer-divider"></div>
          {user ? (
            <div className="mobile-user-row">
              <button
                type="button"
                className="mobile-profile-btn"
                onClick={() => { handleNavClick(); navigate('/profile'); }}
              >
                👤 View Profile ({user.user_metadata?.full_name || user.email?.split('@')[0]})
              </button>
              <button
                type="button"
                className="mobile-signout-btn"
                onClick={handleSignOut}
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm mobile-signin-btn"
              onClick={() => { handleNavClick(); navigate('/onboarding/snapshot'); }}
            >
              Sign in
            </button>
          )}
        </div>
      )}
    </header>
  );
}

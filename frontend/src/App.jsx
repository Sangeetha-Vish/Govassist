import { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { supabase } from './supabaseClient';
import './App.css';

import Header from './components/Header.jsx';
import LandingPage from './components/LandingPage.jsx';
import Onboarding from './components/Onboarding.jsx';
import Dashboard from './components/Dashboard.jsx';
import SchemeFinder from './components/SchemeFinder.jsx';
import UserProfile from './components/UserProfile.jsx';
import SchemeAssistant from './components/SchemeAssistant.jsx';

// Main Layout with Header, Global Scheme Assistant, and Footer
const MainLayout = ({ profile }) => {
  return (
    <div className="gov-app">
      <Header />
      <main className="gov-main-container">
        <Outlet />
      </main>
      <SchemeAssistant profile={profile} />
      <footer className="editorial-footer">
        <div className="editorial-footer-container">
          <div className="footer-left">
            <div className="gov-brand-icon-sm">G</div>
            <span className="footer-brand-name">GovAssist AI</span>
          </div>
          <p className="footer-center">Official information, made easier to understand.</p>
          <div className="footer-right">
            <span className="footer-shield-icon">🛡️</span>
            <span>Privacy-first by design</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

// Route Guard for Protected Routes
const ProtectedRoute = ({ children }) => {
  const { user, hasCompletedProfile, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="app-loading-screen">
        <div className="spinner-large"></div>
        <p>Loading your citizen session...</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/onboarding/snapshot" replace />;
  if (!hasCompletedProfile) return <Navigate to="/onboarding/snapshot" replace />;
  
  return children;
};

// Route Guard for Onboarding (If already completed, bypass)
const OnboardingRoute = ({ children }) => {
  const { user, hasCompletedProfile, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="app-loading-screen">
        <div className="spinner-large"></div>
        <p>Loading your citizen session...</p>
      </div>
    );
  }
  if (user && hasCompletedProfile) return <Navigate to="/dashboard" replace />;
  
  return children;
};

function AppRoutes() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  
  // App-level state for recommendations and profile
  const [profile, setProfile] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [recError, setRecError] = useState(null);
  const prevProfileRef = useRef('');
  const isFetchingRef = useRef(false);

  // Fetch initial profile from Supabase
  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();
        if (data && !error) {
          setProfile(data);
        }
      } catch (err) {
        console.error('Error fetching initial profile:', err);
      }
    };
    loadProfile();
  }, [user?.id]);

  const fetchRecommendations = useCallback(async (profileData = {}) => {
    const merged = { ...profile, ...profileData };
    const profileStr = JSON.stringify(merged);
    
    if (isFetchingRef.current) return [];
    if (prevProfileRef.current === profileStr && recommendations.length > 0) {
      return recommendations;
    }
    
    isFetchingRef.current = true;
    prevProfileRef.current = profileStr;
    setLoadingRecs(true);
    setRecError(null);

    try {
      const response = await fetch('http://localhost:5000/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Failed to fetch recommendations');
      setRecommendations(data.data || []);
      return data.data || [];
    } catch (err) {
      setRecError(err.message);
      return [];
    } finally {
      setLoadingRecs(false);
      isFetchingRef.current = false;
    }
  }, [profile, recommendations]);

  // Initial recommendation fetch when profile is available
  useEffect(() => {
    if (profile && user && recommendations.length === 0) {
      fetchRecommendations(profile);
    }
  }, [profile, user, fetchRecommendations, recommendations.length]);

  const handleProfileUpdated = (newProfile) => {
    setProfile(newProfile);
    fetchRecommendations(newProfile);
  };

  if (loading) {
    return (
      <div className="app-loading-screen">
        <div className="spinner-large"></div>
        <p>Connecting to GovAssist AI...</p>
      </div>
    );
  }

  return (
    <Routes>
      {/* Isolated Onboarding Flow */}
      <Route 
        path="/onboarding/snapshot" 
        element={
          <OnboardingRoute>
            <Onboarding />
          </OnboardingRoute>
        } 
      />

      {/* Main Application Routes */}
      <Route element={<MainLayout profile={profile} />}>
        <Route 
          path="/" 
          element={
            <LandingPage 
              onStartRecommendation={() => navigate('/onboarding/snapshot')} 
              onExploreSchemes={() => navigate('/finder')} 
              recommendations={recommendations} 
            />
          } 
        />
        
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard 
                profile={profile}
                recommendations={recommendations}
                loading={loadingRecs}
                error={recError}
                onRefreshRecommendations={() => fetchRecommendations(profile || {})} 
                onNavigateToFinder={() => navigate('/finder')}
                onNavigateToProfile={(tab) => navigate('/profile', { state: { defaultTab: tab || 'snapshot' } })}
              />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/finder" 
          element={
            <ProtectedRoute>
              <SchemeFinder profile={profile} />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/profile" 
          element={
            <ProtectedRoute>
              <UserProfile 
                onUpdateProfile={handleProfileUpdated}
                onComplete={() => navigate('/dashboard')}
              />
            </ProtectedRoute>
          } 
        />
      </Route>
      
      {/* Redirect any unknown route to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}

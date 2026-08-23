/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [hasCompletedProfile, setHasCompletedProfile] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkProfileCompletion = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('user_id', userId)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error);
      }
      setHasCompletedProfile(!!data);
    } catch (err) {
      console.error('Error checking profile completion:', err);
    }
  }, []);

  useEffect(() => {
    // Fetch initial session
    const initializeAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await checkProfileCompletion(session.user.id);
      }
      setLoading(false);
    };

    initializeAuth();

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          await checkProfileCompletion(newSession.user.id);
        } else {
          setHasCompletedProfile(false);
        }
        setLoading(false);
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [checkProfileCompletion]);

  const completeProfile = () => {
    setHasCompletedProfile(true);
  };

  return (
    <AuthContext.Provider value={{ user, session, hasCompletedProfile, loading, completeProfile }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

import { useCallback, useEffect, useMemo, useState } from 'react';
import { checkAdminAccess } from '../services/adminAccess.js';
import { isSupabaseConfigured, supabase } from '../services/supabase.js';
import { AuthContext } from './authContextValue.js';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(() => !isSupabaseConfigured || !supabase ? false : true);
  const [error, setError] = useState(() =>
    !isSupabaseConfigured || !supabase
      ? 'Supabase is not configured. Add the public Supabase environment variables and restart the app.'
      : null
  );

  const applySession = useCallback(async (session) => {
    if (!session?.user || !supabase) {
      setUser(null);
      setIsAdmin(false);
      setLoading(false);
      return false;
    }

    try {
      const adminAccess = await checkAdminAccess(supabase, session.user.id);

      setUser(session.user);
      setIsAdmin(Boolean(adminAccess));
      setError(adminAccess ? null : 'This account is signed in but is not an active Tellora administrator.');
      setLoading(false);
      return Boolean(adminAccess);
    } catch (adminCheckError) {
      setUser(session.user);
      setIsAdmin(false);
      setError(adminCheckError.message || 'Unable to verify admin access.');
      setLoading(false);
      return false;
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      return undefined;
    }

    let active = true;

    void (async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;
      if (sessionError) {
        setError(sessionError.message);
        setLoading(false);
        return;
      }
      await applySession(data.session);
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      // Run Supabase calls outside the auth callback to avoid blocking its internal lock.
      window.setTimeout(() => {
        if (active) void applySession(session);
      }, 0);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [applySession]);

  const login = useCallback(async (email, password) => {
    if (!supabase) {
      const configurationError = new Error(
        'Supabase is not configured. Add the public Supabase environment variables and restart the app.'
      );
      setError(configurationError.message);
      throw configurationError;
    }

    setError(null);
    setLoading(true);
    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (loginError) throw loginError;

      const hasAccess = await applySession(data.session);
      if (!hasAccess) {
        await supabase.auth.signOut();
        const accessError = new Error('This account is not authorized to use the Tellora admin dashboard.');
        setError(accessError.message);
        throw accessError;
      }

      return data.user;
    } catch (loginFailure) {
      const message = loginFailure.message || 'Unable to sign in.';
      setError(message);
      setUser(null);
      setIsAdmin(false);
      setLoading(false);
      throw loginFailure;
    }
  }, [applySession]);

  const logout = useCallback(async () => {
    if (supabase) {
      const { error: logoutError } = await supabase.auth.signOut();
      if (logoutError) throw logoutError;
    }

    setUser(null);
    setIsAdmin(false);
    setError(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAdmin,
      loading,
      error,
      login,
      logout,
      isAuthenticated: Boolean(user && isAdmin),
    }),
    [user, isAdmin, loading, error, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

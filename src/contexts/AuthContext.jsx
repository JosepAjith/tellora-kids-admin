import { createContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, hasFirebaseConfig } from '../services/firebase.js';
import { DEMO_EMAIL, DEMO_PASSWORD, getDemoAuthResult } from '../services/demoAuth.js';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!auth || !hasFirebaseConfig) {
      setLoading(false);
      return undefined;
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      setError(null);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email, password) => {
    const demoUser = getDemoAuthResult(email, password);

    if (demoUser) {
      setError(null);
      setUser(demoUser);
      return demoUser;
    }

    if (!auth || !hasFirebaseConfig) {
      const fallbackMessage = `Firebase is not configured yet. Try using ${DEMO_EMAIL} with ${DEMO_PASSWORD} for the demo login.`;
      setError(fallbackMessage);
      throw new Error(fallbackMessage);
    }

    setError(null);
    try {
      return await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      const message = err.message || 'Unable to sign in.';
      const friendlyMessage = message.includes('invalid-credential')
        ? 'Firebase rejected the login credentials. Check the email/password, and make sure Authentication is enabled for Email/Password in Firebase Console for the same project.'
        : message;
      setError(friendlyMessage);
      throw err;
    }
  };

  const logout = async () => {
    if (!auth || !hasFirebaseConfig) {
      return;
    }

    await signOut(auth);
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      login,
      logout,
      isAuthenticated: Boolean(user),
    }),
    [user, loading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

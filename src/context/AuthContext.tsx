import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, googleSignIn, initAuth, logout, getAccessToken } from '../lib/firebase';

interface AuthContextValue {
  user: User | null;
  idToken: string | null;
  accessToken: string | null;
  needsDriveAuth: boolean;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  getFreshIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  idToken: null,
  accessToken: null,
  needsDriveAuth: true,
  loading: true,
  authError: null,
  signInWithGoogle: async () => {},
  signOutUser: async () => {},
  getFreshIdToken: async () => null,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [needsDriveAuth, setNeedsDriveAuth] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubInit = initAuth(
      (authedUser, token) => {
        setUser(authedUser);
        setAccessToken(token);
        setNeedsDriveAuth(false);
      },
      () => {
        setAccessToken(null);
        setNeedsDriveAuth(true);
      }
    );

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          setIdToken(token);
          const cachedDriveToken = await getAccessToken();
          if (cachedDriveToken) {
            setAccessToken(cachedDriveToken);
            setNeedsDriveAuth(false);
          }
          // Synchronize authenticated user profile with backend
          await fetch('/api/auth/me', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          }).catch(() => {});
        } catch (err) {
          console.error('Failed to retrieve ID token:', err);
          setIdToken(null);
        }
      } else {
        setIdToken(null);
        setAccessToken(null);
        setNeedsDriveAuth(true);
      }
      setLoading(false);
    });

    return () => {
      unsubInit();
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        setNeedsDriveAuth(false);
        const token = await result.user.getIdToken();
        setIdToken(token);
      }
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setAuthError(err?.message || 'Sign-in failed');
      }
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    try {
      await logout();
      setIdToken(null);
      setAccessToken(null);
      setNeedsDriveAuth(true);
    } catch (err: any) {
      setAuthError(err?.message || 'Sign-out failed');
    }
  }, []);

  const getFreshIdToken = useCallback(async (): Promise<string | null> => {
    if (!auth.currentUser) return null;
    try {
      const token = await auth.currentUser.getIdToken();
      setIdToken(token);
      return token;
    } catch {
      return idToken;
    }
  }, [idToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        idToken,
        accessToken,
        needsDriveAuth,
        loading,
        authError,
        signInWithGoogle,
        signOutUser,
        getFreshIdToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);


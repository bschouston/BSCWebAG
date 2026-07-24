"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase/client";

export type FantasyUserProfile = {
  uid: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  isFantasyUser?: boolean;
  isFantasyAdmin?: boolean;
  fantasyAuthType?: "google" | "password";
  fantasyDisabled?: boolean;
};

interface AuthContextType {
  user: User | null;
  profile: FantasyUserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function isFantasyAdminProfile(profile: FantasyUserProfile | null | undefined): boolean {
  return (
    profile?.isFantasyAdmin === true &&
    profile?.fantasyAuthType === "password" &&
    profile?.fantasyDisabled !== true
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<FantasyUserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (u: User | null) => {
    if (!u) {
      setProfile(null);
      return;
    }
    try {
      const snap = await getDoc(doc(db, "users", u.uid));
      setProfile(snap.exists() ? ({ uid: u.uid, ...(snap.data() as object) } as FantasyUserProfile) : null);
    } catch {
      setProfile(null);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      await loadProfile(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signOut = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (token) {
        await fetch("/api/auth/fantasy-logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // still sign out
    }
    await firebaseSignOut(auth);
  };

  const refreshProfile = async () => {
    await loadProfile(auth.currentUser);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

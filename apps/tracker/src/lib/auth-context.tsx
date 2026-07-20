"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase/client";

type Role = "MEMBER" | "ADMIN" | "SUPER_ADMIN" | "TRACKER";

export type UserProfile = {
  uid: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role: Role;
  isTrackerAdmin?: boolean;
  isTrackerDevice?: boolean;
  isGoogleTracker?: boolean;
};

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
});

/**
 * Sports / settings: only tablet TRACKER accounts marked isTrackerAdmin.
 * Platform ADMIN and Google/public trackers do not get Sports in the tracker app.
 */
export function profileCanManageTrackerSports(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.isGoogleTracker === true) return false;
  return (
    profile.role === "TRACKER" &&
    profile.isTrackerDevice === true &&
    profile.isTrackerAdmin === true
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const snap = await getDoc(doc(db, "users", u.uid));
          setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
        } catch {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signOut = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (token) {
        await fetch("/api/auth/tracker-logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // Still sign out of Firebase even if the session flag update fails.
    }
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

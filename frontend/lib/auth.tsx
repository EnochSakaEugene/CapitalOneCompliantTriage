"use client";
// Login state for the whole app. The signed session token is kept in localStorage
// for this prototype (production: httpOnly cookie + SSO).
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Role } from "./access";
import { API_URL, TOKEN_KEY } from "./api";

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: Role;
  role_label: string;
  last_login_at: string | null;
  password_changed_at: string | null;
}

interface AuthState {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  ready: false,
  login: async () => {},
  logout: async () => {},
  changePassword: async () => {},
});

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

async function call<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = readToken();
    if (!token) {
      setReady(true);
      return;
    }
    call<User>("/auth/me", {}, token)
      .then(setUser)
      .catch(() => writeToken(null))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const onExpired = () => {
      writeToken(null);
      setUser(null);
    };
    window.addEventListener("triageiq:unauthorized", onExpired);
    return () => window.removeEventListener("triageiq:unauthorized", onExpired);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await call<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    writeToken(r.token);
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    const token = readToken();
    try {
      if (token) await call("/auth/logout", { method: "POST" }, token);
    } catch {}
    writeToken(null);
    setUser(null);
  }, []);

  const changePassword = useCallback(async (current: string, next: string) => {
    const r = await call<{ token: string; user: User }>(
      "/auth/change-password",
      { method: "POST", body: JSON.stringify({ current_password: current, new_password: next }) },
      readToken(),
    );
    writeToken(r.token);
    setUser(r.user);
  }, []);

  return <AuthContext.Provider value={{ user, ready, login, logout, changePassword }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

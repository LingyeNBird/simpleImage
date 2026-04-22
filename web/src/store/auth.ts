"use client";

import localforage from "localforage";

export const AUTH_KEY_STORAGE_KEY = "chatgpt2api_auth_key";
export const PUBLIC_AUTH_PATHS = ["/login", "/register", "/admin/login"] as const;

export type AuthRole = "admin" | "user";

export type StoredAuthSession = {
  role: AuthRole;
  token: string;
  username?: string;
  email?: string;
};

const authStorage = localforage.createInstance({
  name: "chatgpt2api",
  storeName: "auth",
});

function normalizeAuthToken(value: unknown) {
  return String(value || "").trim();
}

function normalizeAuthRole(value: unknown): AuthRole | null {
  return value === "admin" || value === "user" ? value : null;
}

function normalizeSession(value: unknown): StoredAuthSession | null {
  if (typeof value === "string") {
    const legacyAuthKey = normalizeAuthToken(value);
    return legacyAuthKey ? { role: "admin", token: legacyAuthKey } : null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }

  const draft = value as Partial<StoredAuthSession> & { authKey?: string };
  const token = normalizeAuthToken(draft.token ?? draft.authKey);
  if (!token) {
    return null;
  }

  return {
    role: normalizeAuthRole(draft.role) ?? "admin",
    token,
    username: typeof draft.username === "string" ? draft.username.trim() : undefined,
    email: typeof draft.email === "string" ? draft.email.trim() : undefined,
  };
}

export function getRoleHomePath(role: AuthRole) {
  return role === "admin" ? "/accounts" : "/image";
}

export function getRoleLoginPath(role: AuthRole) {
  return role === "admin" ? "/admin/login" : "/login";
}

export function isPublicAuthPath(pathname: string) {
  const normalizedPath = String(pathname || "").trim();
  return PUBLIC_AUTH_PATHS.some((path) => normalizedPath.startsWith(path));
}

export async function getStoredAuthKey() {
  const session = await getStoredAuthSession();
  return session?.token || "";
}

export async function setStoredAuthKey(authKey: string) {
  const normalizedAuthKey = String(authKey || "").trim();
  if (!normalizedAuthKey) {
    await clearStoredAuthKey();
    return;
  }
  await setStoredAuthSession({
    role: "admin",
    token: normalizedAuthKey,
  });
}

export async function getStoredAuthSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const value = await authStorage.getItem<unknown>(AUTH_KEY_STORAGE_KEY);
  return normalizeSession(value);
}

export async function setStoredAuthSession(session: StoredAuthSession | null) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeSession(session);
  if (!normalized) {
    await clearStoredAuthSession();
    return;
  }

  await authStorage.setItem(AUTH_KEY_STORAGE_KEY, normalized);
}

export async function clearStoredAuthKey() {
  await clearStoredAuthSession();
}

export async function clearStoredAuthSession() {
  if (typeof window === "undefined") {
    return;
  }
  await authStorage.removeItem(AUTH_KEY_STORAGE_KEY);
}

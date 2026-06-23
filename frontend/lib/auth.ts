"use client";

export type StoredUser = {
  id?: number;
  email?: string;
  nombre?: string;
  rol?: string;
  role?: string | null;
  [key: string]: unknown;
};

const TOKEN_KEY = "authToken";
const REFRESH_TOKEN_KEY = "refreshToken";
const USER_KEY = "authUser";
const REMEMBER_KEY = "rememberSession";

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
}

export function getStoredToken() {
  return getStorage()?.getItem(TOKEN_KEY) ?? null;
}

export function getStoredRefreshToken() {
  return getStorage()?.getItem(REFRESH_TOKEN_KEY) ?? null;
}

export function getStoredUser(): StoredUser | null {
  const raw = getStorage()?.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function clearSession() {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(TOKEN_KEY);
  storage.removeItem(REFRESH_TOKEN_KEY);
  storage.removeItem(USER_KEY);
  storage.removeItem(REMEMBER_KEY);
}

import { Platform } from "react-native";

// On a phone, set EXPO_PUBLIC_API_URL to your computer's address, e.g. http://192.168.1.20:3000
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export type Features = {
  marketplace: boolean;
  payouts: boolean;
  incidentReports: boolean;
  glassesCapture: boolean;
};

export type PickedFile = { uri: string; mimeType: string; name: string };

export async function api<T = any>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: T }> {
  const res = await fetch(`${API_URL}${path}`, init);
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export function json(method: string, data: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(data) };
}

// React Native and the browser attach files to a form differently.
export async function appendFile(form: FormData, field: string, file: PickedFile) {
  if (Platform.OS === "web") {
    const blob = await fetch(file.uri).then((r) => r.blob());
    form.append(field, blob, file.name);
  } else {
    form.append(field, { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  }
}

// Remembers the anonymous account in the browser. On a phone, a new account
// is made each launch until real sign-in is added.
export async function getUserId(): Promise<string> {
  const store = Platform.OS === "web" && typeof localStorage !== "undefined" ? localStorage : undefined;
  const saved = store?.getItem("aiweb.userId");
  if (saved) {
    const check = await api(`/users/${saved}/balance`);
    if (check.ok) return saved;
  }
  const { body } = await api<{ id: string }>("/users", { method: "POST" });
  store?.setItem("aiweb.userId", body.id);
  return body.id;
}

export function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

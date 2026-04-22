import { httpRequest } from "@/lib/request";

export type AccountType = "Free" | "Plus" | "Pro" | "Team";
export type AccountStatus = "正常" | "限流" | "异常" | "禁用";
export type ImageModel = "gpt-image-1" | "gpt-image-2";
export type AuthRole = "admin" | "user";

export type CurrentIdentity = {
  role: AuthRole;
  id?: string;
  username?: string;
  quota?: number;
};

export type AdminUser = {
  id: string;
  username: string;
  quota: number;
  created_at?: string;
  updated_at?: string;
};

type AuthResponse = {
  ok: boolean;
  role: AuthRole;
  token?: string;
  user?: {
    id?: string;
    username?: string;
    quota?: number;
  };
  version?: string;
};

export type Account = {
  id: string;
  access_token: string;
  type: AccountType;
  status: AccountStatus;
  quota: number;
  email?: string | null;
  user_id?: string | null;
  limits_progress?: Array<{
    feature_name?: string;
    remaining?: number;
    reset_after?: string;
  }>;
  default_model_slug?: string | null;
  restoreAt?: string | null;
  success: number;
  fail: number;
  lastUsedAt: string | null;
};

type AccountListResponse = {
  items: Account[];
};

type AccountMutationResponse = {
  items: Account[];
  added?: number;
  skipped?: number;
  removed?: number;
  refreshed?: number;
  errors?: Array<{ access_token: string; error: string }>;
};

type AccountRefreshResponse = {
  items: Account[];
  refreshed: number;
  errors: Array<{ access_token: string; error: string }>;
};

type AccountUpdateResponse = {
  item: Account;
  items: Account[];
};

export async function login(authKey: string) {
  return loginAdmin(authKey);
}

export async function loginAdmin(authKey: string) {
  const normalizedAuthKey = String(authKey || "").trim();
  return httpRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: {},
    headers: {
      Authorization: `Bearer ${normalizedAuthKey}`,
    },
    redirectOnUnauthorized: false,
  });
}

export async function registerUser(payload: {
  username: string;
  password: string;
}) {
  return httpRequest<AuthResponse>("/auth/register", {
    method: "POST",
    body: payload,
    redirectOnUnauthorized: false,
  });
}

export async function loginUser(payload: { username: string; password: string }) {
  return httpRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: payload,
    redirectOnUnauthorized: false,
  });
}

export async function fetchCurrentIdentity() {
  const data = await httpRequest<{
    role: AuthRole;
    version?: string;
    user?: {
      id?: string;
      username?: string;
      quota?: number;
    };
  }>("/auth/me", {
    redirectOnUnauthorized: false,
  });

  if (data.role === "admin") {
    return { role: "admin" } satisfies CurrentIdentity;
  }

  return {
    role: "user",
    id: data.user?.id,
    username: data.user?.username,
    quota: data.user?.quota,
  } satisfies CurrentIdentity;
}

export async function redeemUserQuota(keys: string[]) {
  return httpRequest<{
    redeemed: number;
    amount: number;
    redeemed_keys: string[];
    invalid_keys: string[];
    used_keys: string[];
    user?: { id?: string; username?: string; quota?: number };
  }>("/auth/redeem", {
    method: "POST",
    body: { keys },
  });
}

export async function fetchAdminUsers() {
  return httpRequest<{ items: AdminUser[] }>("/api/users");
}

export async function createAdminUser(payload: {
  username: string;
  password: string;
  quota?: number;
}) {
  return httpRequest<{ item: AdminUser; items: AdminUser[] }>("/api/users", {
    method: "POST",
    body: payload,
  });
}

export async function deleteAdminUser(userId: string) {
  return httpRequest<{ items: AdminUser[] }>(`/api/users/${userId}`, {
    method: "DELETE",
  });
}

export async function updateAdminUserQuota(userId: string, quota: number) {
  return httpRequest<{ item: AdminUser; items: AdminUser[] }>(`/api/users/${userId}/quota`, {
    method: "POST",
    body: {
      quota,
    },
  });
}

export async function generateAdminRedeemKeys(payload: {
  amount: number;
  quantity: number;
}) {
  return httpRequest<{ items: Array<{ key: string; amount: number }> }>("/api/redeem-keys/generate", {
    method: "POST",
    body: payload,
  });
}

export async function fetchAccounts() {
  return httpRequest<AccountListResponse>("/api/accounts");
}

export async function createAccounts(tokens: string[]) {
  return httpRequest<AccountMutationResponse>("/api/accounts", {
    method: "POST",
    body: { tokens },
  });
}

export async function deleteAccounts(tokens: string[]) {
  return httpRequest<AccountMutationResponse>("/api/accounts", {
    method: "DELETE",
    body: { tokens },
  });
}

export async function refreshAccounts(accessTokens: string[]) {
  return httpRequest<AccountRefreshResponse>("/api/accounts/refresh", {
    method: "POST",
    body: { access_tokens: accessTokens },
  });
}

export async function updateAccount(
  accessToken: string,
  updates: {
    type?: AccountType;
    status?: AccountStatus;
    quota?: number;
  },
) {
  return httpRequest<AccountUpdateResponse>("/api/accounts/update", {
    method: "POST",
    body: {
      access_token: accessToken,
      ...updates,
    },
  });
}

export async function generateImage(prompt: string, model: ImageModel = "gpt-image-1") {
  return httpRequest<{ created: number; data: Array<{ b64_json: string; revised_prompt?: string }> }>(
    "/v1/images/generations",
    {
      method: "POST",
      body: {
        prompt,
        model,
        n: 1,
        response_format: "b64_json",
      },
    },
  );
}

export async function editImage(files: File | File[], prompt: string, model: ImageModel = "gpt-image-1") {
  const formData = new FormData();
  const uploadFiles = Array.isArray(files) ? files : [files];

  uploadFiles.forEach((file) => {
    formData.append("image", file);
  });
  formData.append("prompt", prompt);
  formData.append("model", model);
  formData.append("n", "1");

  return httpRequest<{ created: number; data: Array<{ b64_json: string; revised_prompt?: string }> }>(
    "/v1/images/edits",
    {
      method: "POST",
      body: formData,
    },
  );
}

// ── CPA (CLIProxyAPI) ──────────────────────────────────────────────

export type CPAPool = {
  id: string;
  name: string;
  base_url: string;
  import_job?: CPAImportJob | null;
};

export type CPARemoteFile = {
  name: string;
  email: string;
};

export type CPAImportJob = {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed";
  created_at: string;
  updated_at: string;
  total: number;
  completed: number;
  added: number;
  skipped: number;
  refreshed: number;
  failed: number;
  errors: Array<{ name: string; error: string }>;
};

export async function fetchCPAPools() {
  return httpRequest<{ pools: CPAPool[] }>("/api/cpa/pools");
}

export async function createCPAPool(pool: { name: string; base_url: string; secret_key: string }) {
  return httpRequest<{ pool: CPAPool; pools: CPAPool[] }>("/api/cpa/pools", {
    method: "POST",
    body: pool,
  });
}

export async function updateCPAPool(
  poolId: string,
  updates: { name?: string; base_url?: string; secret_key?: string },
) {
  return httpRequest<{ pool: CPAPool; pools: CPAPool[] }>(`/api/cpa/pools/${poolId}`, {
    method: "POST",
    body: updates,
  });
}

export async function deleteCPAPool(poolId: string) {
  return httpRequest<{ pools: CPAPool[] }>(`/api/cpa/pools/${poolId}`, {
    method: "DELETE",
  });
}

export async function fetchCPAPoolFiles(poolId: string) {
  return httpRequest<{ pool_id: string; files: CPARemoteFile[] }>(`/api/cpa/pools/${poolId}/files`);
}

export async function startCPAImport(poolId: string, names: string[]) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/cpa/pools/${poolId}/import`, {
    method: "POST",
    body: { names },
  });
}

export async function fetchCPAPoolImportJob(poolId: string) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/cpa/pools/${poolId}/import`);
}

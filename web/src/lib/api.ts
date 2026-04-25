import { httpRequest } from "@/lib/request";
import type {
  ImageResponseCanvas,
  ImageResponseQuality,
  ImageResponseResolution,
  ImageUpstreamEndpoint,
} from "@/lib/image-generation-options";

export type AccountType = "Free" | "Plus" | "ProLite" | "Pro" | "Team";
export type AccountStatus = "正常" | "限流" | "异常" | "禁用";
export type ImageModel = "auto" | "gpt-image-1" | "gpt-image-2";
export type AuthRole = "admin" | "user";
export type ImageDeliveryMode = "direct" | "image_bed";

export type CurrentIdentity = {
  role: AuthRole;
  id?: string;
  username?: string;
  quota?: number;
  allow_direct_mode?: boolean;
  allow_image_bed_mode?: boolean;
  image_delivery_modes?: ImageDeliveryMode[];
};

export type AdminUser = {
  id: string;
  username: string;
  quota: number;
  allow_direct_mode: boolean;
  allow_image_bed_mode: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CosConfig = {
  Region: string;
  SecretId: string;
  SecretKey: string;
  Bucket: string;
};

export type ImageJob = {
  id: string;
  conversation_id: string;
  conversation_title: string;
  prompt: string;
  mode: "generate" | "edit";
  model: ImageModel;
  count: number;
  size?: string;
  upstream_endpoint?: ImageUpstreamEndpoint;
  response_canvas?: ImageResponseCanvas;
  response_resolution?: ImageResponseResolution;
  response_quality?: ImageResponseQuality;
  status: "queued" | "running" | "success" | "error";
  delivery_mode: "image_bed";
  created_at: string;
  updated_at: string;
  error?: string | null;
  result_images: Array<{ id: string; url: string; storage: "image_bed"; object_key?: string; url_expires_at?: string }>;
  reference_images: Array<{ name: string; type: string }>;
};

export type AdminRedeemKey = {
  key: string;
  amount: number;
  redeemed: boolean;
  redeemed_by?: string | null;
  created_at?: string | null;
  redeemed_at?: string | null;
};

export type PromptLibraryItem = {
  id: string;
  title: string;
  prompt: string;
  tags: string[];
  owner_role: AuthRole;
  owner_id: string;
  owner_name: string;
  created_at: string;
  updated_at: string;
  can_edit: boolean;
  can_delete: boolean;
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
  imageQuotaUnknown?: boolean;
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

export type SettingsConfig = {
  proxy: string;
  base_url?: string;
  "auth-key"?: string;
  refresh_account_interval_minute?: number | string;
  image_bed_cleanup_days?: number | string;
  register_user_allow_direct_mode?: boolean;
  register_user_allow_image_bed_mode?: boolean;
  [key: string]: unknown;
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
    image_delivery_modes?: ImageDeliveryMode[];
    user?: {
      id?: string;
      username?: string;
      quota?: number;
      allow_direct_mode?: boolean;
      allow_image_bed_mode?: boolean;
    };
  }>("/auth/me", {
    redirectOnUnauthorized: false,
  });

  if (data.role === "admin") {
    return { role: "admin", image_delivery_modes: data.image_delivery_modes || ["direct"] } satisfies CurrentIdentity;
  }

  return {
    role: "user",
    id: data.user?.id,
    username: data.user?.username,
    quota: data.user?.quota,
    allow_direct_mode: data.user?.allow_direct_mode,
    allow_image_bed_mode: data.user?.allow_image_bed_mode,
    image_delivery_modes: data.image_delivery_modes || ["direct"],
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
  allow_direct_mode?: boolean;
  allow_image_bed_mode?: boolean;
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

export async function updateAdminUserImageModes(
  userId: string,
  payload: { allow_direct_mode: boolean; allow_image_bed_mode: boolean },
) {
  return httpRequest<{ item: AdminUser; items: AdminUser[] }>(`/api/users/${userId}/image-modes`, {
    method: "POST",
    body: payload,
  });
}

export async function fetchAdminRedeemKeys() {
  return httpRequest<{ items: AdminRedeemKey[] }>("/api/redeem-keys");
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

export async function generateImage(
  prompt: string,
  model?: ImageModel,
  size: string = "1:1",
  deliveryMode: ImageDeliveryMode = "direct",
  upstreamEndpoint: ImageUpstreamEndpoint = "conversation",
  responseCanvas: ImageResponseCanvas = "auto",
  responseResolution: ImageResponseResolution = "auto",
  responseQuality: ImageResponseQuality = "auto",
) {
  return httpRequest<{ created: number; data: Array<{ b64_json?: string; url?: string; object_key?: string; url_expires_at?: string; revised_prompt?: string; storage?: string }> }>(
    "/v1/images/generations",
    {
      method: "POST",
      body: {
        prompt,
        ...(model ? { model } : {}),
        size,
        n: 1,
        response_format: "b64_json",
        delivery_mode: deliveryMode,
        upstream_endpoint: upstreamEndpoint,
        response_canvas: responseCanvas,
        response_resolution: responseResolution,
        response_quality: responseQuality,
      },
    },
  );
}

export async function editImage(
  files: File | File[],
  prompt: string,
  model?: ImageModel,
  size: string = "1:1",
  deliveryMode: ImageDeliveryMode = "direct",
  upstreamEndpoint: ImageUpstreamEndpoint = "conversation",
  responseCanvas: ImageResponseCanvas = "auto",
  responseResolution: ImageResponseResolution = "auto",
  responseQuality: ImageResponseQuality = "auto",
) {
  const formData = new FormData();
  const uploadFiles = Array.isArray(files) ? files : [files];

  uploadFiles.forEach((file) => {
    formData.append("image", file);
  });
  formData.append("prompt", prompt);
  if (model) {
    formData.append("model", model);
  }
  formData.append("size", size);
  formData.append("n", "1");
  formData.append("delivery_mode", deliveryMode);
  formData.append("upstream_endpoint", upstreamEndpoint);
  formData.append("response_canvas", responseCanvas);
  formData.append("response_resolution", responseResolution);
  formData.append("response_quality", responseQuality);

  return httpRequest<{ created: number; data: Array<{ b64_json?: string; url?: string; object_key?: string; url_expires_at?: string; revised_prompt?: string; storage?: string }> }>(
    "/v1/images/edits",
    {
      method: "POST",
      body: formData,
    },
  );
}

export async function fetchSettingsConfig() {
  return httpRequest<{ config: SettingsConfig }>("/api/settings");
}

export async function updateSettingsConfig(settings: SettingsConfig) {
  return httpRequest<{ config: SettingsConfig }>("/api/settings", {
    method: "POST",
    body: settings,
  });
}

export async function fetchCosConfig() {
  return httpRequest<{ config: CosConfig; ready: boolean; project_image_count: number }>("/api/cos-config");
}

export async function updateCosConfig(config: CosConfig) {
  return httpRequest<{ config: CosConfig; ready: boolean }>("/api/cos-config", {
    method: "POST",
    body: config,
  });
}

export async function testCosConfig() {
  return httpRequest<{ result: { ok: boolean; bucket: string; prefix: string; sample_count: number; project_image_count: number } }>(
    "/api/cos-config/test",
    {
      method: "POST",
      body: {},
    },
  );
}

export async function fetchImageJobs() {
  return httpRequest<{ items: ImageJob[] }>("/api/image-jobs");
}

export async function fetchImagePromptLibrary(params?: { search?: string; mine?: boolean }) {
  const query = new URLSearchParams();
  if (params?.search?.trim()) {
    query.set("search", params.search.trim());
  }
  if (params?.mine) {
    query.set("mine", "true");
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return httpRequest<{ items: PromptLibraryItem[] }>(`/api/image-prompts${suffix}`);
}

export async function createImagePrompt(payload: { title?: string; prompt: string; tags: string[] }) {
  return httpRequest<{ item: PromptLibraryItem }>("/api/image-prompts", {
    method: "POST",
    body: payload,
  });
}

export async function updateImagePrompt(promptId: string, payload: { title?: string; prompt: string; tags: string[] }) {
  return httpRequest<{ item: PromptLibraryItem }>(`/api/image-prompts/${promptId}`, {
    method: "POST",
    body: payload,
  });
}

export async function deleteImagePrompt(promptId: string) {
  return httpRequest<{ ok: boolean }>(`/api/image-prompts/${promptId}`, {
    method: "DELETE",
  });
}

export async function createImageJob(payload: {
  prompt: string;
  conversationId: string;
  conversationTitle: string;
  mode: "generate" | "edit";
  imageCount: number;
  imageSize?: string;
  upstreamEndpoint?: ImageUpstreamEndpoint;
  responseCanvas?: ImageResponseCanvas;
  responseResolution?: ImageResponseResolution;
  responseQuality?: ImageResponseQuality;
  model?: ImageModel;
  files?: File[];
}) {
  const formData = new FormData();
  formData.append("prompt", payload.prompt);
  formData.append("conversation_id", payload.conversationId);
  formData.append("conversation_title", payload.conversationTitle);
  formData.append("mode", payload.mode);
  formData.append("model", payload.model || "auto");
  formData.append("n", String(payload.imageCount));
  formData.append("size", payload.imageSize || "1:1");
  formData.append("upstream_endpoint", payload.upstreamEndpoint || "conversation");
  formData.append("response_canvas", payload.responseCanvas || "auto");
  formData.append("response_resolution", payload.responseResolution || "auto");
  formData.append("response_quality", payload.responseQuality || "auto");
  formData.append("delivery_mode", "image_bed");
  for (const file of payload.files || []) {
    formData.append("image", file);
  }
  return httpRequest<{ item: ImageJob; user?: { id?: string; username?: string; quota?: number } }>("/api/image-jobs", {
    method: "POST",
    body: formData,
  });
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

// ── Sub2API ────────────────────────────────────────────────────────

export type Sub2APIServer = {
  id: string;
  name: string;
  base_url: string;
  email: string;
  has_api_key: boolean;
  group_id: string;
  import_job?: CPAImportJob | null;
};

export type Sub2APIRemoteAccount = {
  id: string;
  name: string;
  email: string;
  plan_type: string;
  status: string;
  expires_at: string;
  has_refresh_token: boolean;
};

export type Sub2APIRemoteGroup = {
  id: string;
  name: string;
  description: string;
  platform: string;
  status: string;
  account_count: number;
  active_account_count: number;
};

export async function fetchSub2APIServers() {
  return httpRequest<{ servers: Sub2APIServer[] }>("/api/sub2api/servers");
}

export async function createSub2APIServer(server: {
  name: string;
  base_url: string;
  email: string;
  password: string;
  api_key: string;
  group_id: string;
}) {
  return httpRequest<{ server: Sub2APIServer; servers: Sub2APIServer[] }>("/api/sub2api/servers", {
    method: "POST",
    body: server,
  });
}

export async function updateSub2APIServer(
  serverId: string,
  updates: {
    name?: string;
    base_url?: string;
    email?: string;
    password?: string;
    api_key?: string;
    group_id?: string;
  },
) {
  return httpRequest<{ server: Sub2APIServer; servers: Sub2APIServer[] }>(`/api/sub2api/servers/${serverId}`, {
    method: "POST",
    body: updates,
  });
}

export async function fetchSub2APIServerGroups(serverId: string) {
  return httpRequest<{ server_id: string; groups: Sub2APIRemoteGroup[] }>(
    `/api/sub2api/servers/${serverId}/groups`,
  );
}

export async function deleteSub2APIServer(serverId: string) {
  return httpRequest<{ servers: Sub2APIServer[] }>(`/api/sub2api/servers/${serverId}`, {
    method: "DELETE",
  });
}

export async function fetchSub2APIServerAccounts(serverId: string) {
  return httpRequest<{ server_id: string; accounts: Sub2APIRemoteAccount[] }>(
    `/api/sub2api/servers/${serverId}/accounts`,
  );
}

export async function startSub2APIImport(serverId: string, accountIds: string[]) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/sub2api/servers/${serverId}/import`, {
    method: "POST",
    body: { account_ids: accountIds },
  });
}

export async function fetchSub2APIImportJob(serverId: string) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/sub2api/servers/${serverId}/import`);
}

// ── Upstream proxy ────────────────────────────────────────────────

export type ProxySettings = {
  enabled: boolean;
  url: string;
};

export type ProxyTestResult = {
  ok: boolean;
  status: number;
  latency_ms: number;
  error: string | null;
};

export async function fetchProxy() {
  return httpRequest<{ proxy: ProxySettings }>("/api/proxy");
}

export async function updateProxy(updates: { enabled?: boolean; url?: string }) {
  return httpRequest<{ proxy: ProxySettings }>("/api/proxy", {
    method: "POST",
    body: updates,
  });
}

export async function testProxy(url?: string) {
  return httpRequest<{ result: ProxyTestResult }>("/api/proxy/test", {
    method: "POST",
    body: { url: url ?? "" },
  });
}

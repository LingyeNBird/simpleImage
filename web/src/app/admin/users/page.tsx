"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LoaderCircle, Plus, RefreshCw, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  createAdminUser,
  deleteAdminUser,
  fetchAdminUsers,
  fetchSettingsConfig,
  updateAdminUserImageModes,
  updateAdminUserQuota,
  updateSettingsConfig,
  type AdminUser,
  type SettingsConfig,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { getStoredAuthSession } from "@/store/auth";

function formatQuota(value: number) {
  return String(Math.max(0, Number(value) || 0));
}

export default function AdminUsersPage() {
  const router = useRouter();
  const didLoadRef = useRef(false);

  const [guardReady, setGuardReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [quota, setQuota] = useState("0");
  const [isCreating, setIsCreating] = useState(false);
  const [allowDirectMode, setAllowDirectMode] = useState(true);
  const [allowImageBedMode, setAllowImageBedMode] = useState(true);
  const [allowViewImageFailureLog, setAllowViewImageFailureLog] = useState(false);

  const [editingQuotaUserId, setEditingQuotaUserId] = useState<string | null>(null);
  const [editingModesUserId, setEditingModesUserId] = useState<string | null>(null);
  const [quotaDrafts, setQuotaDrafts] = useState<Record<string, string>>({});
  const [modeDrafts, setModeDrafts] = useState<Record<string, { allow_direct_mode: boolean; allow_image_bed_mode: boolean; allow_view_image_failure_log: boolean }>>({});
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [registerDefaultModes, setRegisterDefaultModes] = useState({
    allow_direct_mode: true,
    allow_image_bed_mode: true,
  });
  const [cpaImageBaseUrl, setCpaImageBaseUrl] = useState("");
  const [cpaImageApiKey, setCpaImageApiKey] = useState("");
  const [isSavingRegisterDefaults, setIsSavingRegisterDefaults] = useState(false);
  const [isSavingCpaConfig, setIsSavingCpaConfig] = useState(false);

  const userCount = users.length;
  const totalQuota = useMemo(
    () => users.reduce((sum, user) => sum + Math.max(0, Number(user.quota) || 0), 0),
    [users],
  );

  const loadUsers = async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
    }
    try {
      const [usersData, settingsData] = await Promise.all([fetchAdminUsers(), fetchSettingsConfig()]);
      setUsers(usersData.items);
      setQuotaDrafts(
        Object.fromEntries(usersData.items.map((item) => [item.id, formatQuota(item.quota)])),
      );
      setModeDrafts(
        Object.fromEntries(
          usersData.items.map((item) => [item.id, { allow_direct_mode: item.allow_direct_mode, allow_image_bed_mode: item.allow_image_bed_mode, allow_view_image_failure_log: item.allow_view_image_failure_log }]),
        ),
      );
      setRegisterDefaultModes({
        allow_direct_mode: settingsData.config.register_user_allow_direct_mode !== false,
        allow_image_bed_mode: settingsData.config.register_user_allow_image_bed_mode !== false,
      });
      setCpaImageBaseUrl(typeof settingsData.config.cpa_image_base_url === "string" ? settingsData.config.cpa_image_base_url : "");
      setCpaImageApiKey(typeof settingsData.config.cpa_image_api_key === "string" ? settingsData.config.cpa_image_api_key : "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载用户失败";
      toast.error(message);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  };

  const handleSaveCpaConfig = async () => {
    const normalizedBaseUrl = cpaImageBaseUrl.trim().replace(/\/$/, "");
    const normalizedApiKey = cpaImageApiKey.trim();
    if (!normalizedBaseUrl || !normalizedApiKey) {
      toast.error("请填写 CPA 端点地址和 API key");
      return;
    }

    setIsSavingCpaConfig(true);
    try {
      const nextConfig: SettingsConfig = {
        ...(await fetchSettingsConfig()).config,
        cpa_image_base_url: normalizedBaseUrl,
        cpa_image_api_key: normalizedApiKey,
      };
      await updateSettingsConfig(nextConfig);
      setCpaImageBaseUrl(normalizedBaseUrl);
      setCpaImageApiKey(normalizedApiKey);
      toast.success("CPA 图片端点配置已保存");
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存 CPA 图片端点配置失败";
      toast.error(message);
    } finally {
      setIsSavingCpaConfig(false);
    }
  };

  const handleSaveRegisterDefaults = async () => {
    if (!registerDefaultModes.allow_direct_mode && !registerDefaultModes.allow_image_bed_mode) {
      toast.error("普通用户注册默认权限至少启用一种图片模式");
      return;
    }

    setIsSavingRegisterDefaults(true);
    try {
      const nextConfig: SettingsConfig = {
        ...(await fetchSettingsConfig()).config,
        register_user_allow_direct_mode: registerDefaultModes.allow_direct_mode,
        register_user_allow_image_bed_mode: registerDefaultModes.allow_image_bed_mode,
      };
      await updateSettingsConfig(nextConfig);
      toast.success("普通用户注册默认图片模式已保存");
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存普通用户注册默认权限失败";
      toast.error(message);
    } finally {
      setIsSavingRegisterDefaults(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const validateRole = async () => {
      const session = await getStoredAuthSession();
      if (cancelled) {
        return;
      }

      if (!session) {
        router.replace("/admin/login");
        return;
      }

      if (session.role !== "admin") {
        router.replace("/image");
        return;
      }

      setGuardReady(true);
    };

    void validateRole();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!guardReady) {
      return;
    }
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadUsers();
  }, [guardReady]);

  const handleCreateUser = async () => {
    const normalizedUsername = username.trim();
    const normalizedPassword = password.trim();
    if (!normalizedUsername || !normalizedPassword) {
      toast.error("请输入用户名和密码");
      return;
    }
    if (!allowDirectMode && !allowImageBedMode) {
      toast.error("至少启用一种图片模式");
      return;
    }

    setIsCreating(true);
    try {
      const data = await createAdminUser({
        username: normalizedUsername,
        password: normalizedPassword,
        quota: Math.max(0, Number(quota) || 0),
        allow_direct_mode: allowDirectMode,
        allow_image_bed_mode: allowImageBedMode,
        allow_view_image_failure_log: allowViewImageFailureLog,
      });
      setUsers(data.items);
      setQuotaDrafts(
        Object.fromEntries(data.items.map((item) => [item.id, formatQuota(item.quota)])),
      );
      setModeDrafts(
        Object.fromEntries(
          data.items.map((item) => [item.id, { allow_direct_mode: item.allow_direct_mode, allow_image_bed_mode: item.allow_image_bed_mode, allow_view_image_failure_log: item.allow_view_image_failure_log }]),
        ),
      );
      setUsername("");
      setPassword("");
      setQuota("0");
      setAllowDirectMode(true);
      setAllowImageBedMode(true);
      setAllowViewImageFailureLog(false);
      toast.success("用户已创建");
    } catch (error) {
      const message = error instanceof Error ? error.message : "创建用户失败";
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    setDeletingUserId(user.id);
    try {
      const data = await deleteAdminUser(user.id);
      setUsers(data.items);
      setQuotaDrafts(
        Object.fromEntries(data.items.map((item) => [item.id, formatQuota(item.quota)])),
      );
      setModeDrafts(
        Object.fromEntries(
          data.items.map((item) => [item.id, { allow_direct_mode: item.allow_direct_mode, allow_image_bed_mode: item.allow_image_bed_mode, allow_view_image_failure_log: item.allow_view_image_failure_log }]),
        ),
      );
      toast.success("用户已删除");
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除用户失败";
      toast.error(message);
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleUpdateQuota = async (user: AdminUser) => {
    setEditingQuotaUserId(user.id);
    try {
      const nextQuota = Math.max(0, Number(quotaDrafts[user.id] || user.quota || 0));
      const data = await updateAdminUserQuota(user.id, nextQuota);
      setUsers(data.items);
      setQuotaDrafts(
        Object.fromEntries(data.items.map((item) => [item.id, formatQuota(item.quota)])),
      );
      toast.success("额度已更新");
    } catch (error) {
      const message = error instanceof Error ? error.message : "更新额度失败";
      toast.error(message);
    } finally {
      setEditingQuotaUserId(null);
    }
  };

  const handleUpdateModes = async (user: AdminUser) => {
    setEditingModesUserId(user.id);
    try {
        const draft = modeDrafts[user.id] ?? {
          allow_direct_mode: user.allow_direct_mode,
          allow_image_bed_mode: user.allow_image_bed_mode,
          allow_view_image_failure_log: user.allow_view_image_failure_log,
        };
      if (!draft.allow_direct_mode && !draft.allow_image_bed_mode) {
        toast.error("至少启用一种图片模式");
        return;
      }
      const data = await updateAdminUserImageModes(user.id, draft);
      setUsers(data.items);
      setModeDrafts(
        Object.fromEntries(
          data.items.map((item) => [item.id, { allow_direct_mode: item.allow_direct_mode, allow_image_bed_mode: item.allow_image_bed_mode, allow_view_image_failure_log: item.allow_view_image_failure_log }]),
        ),
      );
      toast.success("图片模式权限已更新");
    } catch (error) {
      const message = error instanceof Error ? error.message : "更新图片模式失败";
      toast.error(message);
    } finally {
      setEditingModesUserId(null);
    }
  };

  if (!guardReady) {
    return null;
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">Admin</div>
          <h1 className="text-2xl font-semibold tracking-tight">用户管理</h1>
        </div>
        <Button
          variant="outline"
          className="h-10 rounded-xl border-stone-200 bg-white/85 px-4 text-stone-700 hover:bg-white"
          onClick={() => void loadUsers()}
          disabled={isLoading}
        >
          <RefreshCw className={cn("size-4", isLoading ? "animate-spin" : "")} />
          刷新
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between text-xs text-stone-400">
              <span>用户总数</span>
              <UserRound className="size-4" />
            </div>
            <div className="text-3xl font-semibold tracking-tight text-stone-900">{userCount}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between text-xs text-stone-400">
              <span>总额度</span>
              <KeyRound className="size-4" />
            </div>
            <div className="text-3xl font-semibold tracking-tight text-sky-600">{totalQuota}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
          <CardContent className="p-4">
            <div className="mb-3 text-xs text-stone-400">兑换码管理</div>
            <div className="text-sm font-medium text-stone-700">请前往独立页面生成与查看</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">普通用户注册默认图片模式</h2>
                <p className="mt-1 text-sm text-stone-500">影响普通用户通过 /register 自助注册后默认拥有的直传 / 图床权限，不影响下方管理员手动创建用户。</p>
              </div>
              <Badge variant="secondary" className="rounded-md bg-stone-100 text-stone-700">
                Register Default
              </Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                <Checkbox
                  checked={registerDefaultModes.allow_direct_mode}
                  onCheckedChange={(checked) =>
                    setRegisterDefaultModes((prev) => ({
                      ...prev,
                      allow_direct_mode: Boolean(checked),
                    }))
                  }
                />
                <span>普通用户注册后默认允许直传模式</span>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                <Checkbox
                  checked={registerDefaultModes.allow_image_bed_mode}
                  onCheckedChange={(checked) =>
                    setRegisterDefaultModes((prev) => ({
                      ...prev,
                      allow_image_bed_mode: Boolean(checked),
                    }))
                  }
                />
                <span>普通用户注册后默认允许图床模式</span>
              </label>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-stone-500">至少启用一种；两个都选表示新注册普通用户同时拥有直传与图床权限。</p>
              <Button
                variant="outline"
                className="h-10 rounded-xl border-stone-200 bg-white px-4 text-stone-700"
                onClick={() => void handleSaveRegisterDefaults()}
                disabled={isSavingRegisterDefaults}
              >
                {isSavingRegisterDefaults ? <LoaderCircle className="size-4 animate-spin" /> : null}
                保存注册默认权限
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">CPA 图片端点</h2>
                <p className="mt-1 text-sm text-stone-500">为 “CPA /v1/images” 上游配置基础地址与 API key。保存后，图片页选择该上游端点时会走 CPA 的 `/v1/images/generations` 与 `/v1/images/edits`。</p>
              </div>
              <Badge variant="secondary" className="rounded-md bg-stone-100 text-stone-700">
                CPA Upstream
              </Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                value={cpaImageBaseUrl}
                onChange={(event) => setCpaImageBaseUrl(event.target.value)}
                placeholder="https://your-cpa.example.com"
                className="h-11 rounded-xl border-stone-200 bg-white"
              />
              <Input
                type="password"
                value={cpaImageApiKey}
                onChange={(event) => setCpaImageApiKey(event.target.value)}
                placeholder="CPA API key"
                className="h-11 rounded-xl border-stone-200 bg-white"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-stone-500">建议填写服务根地址即可，系统会自动拼接 `/v1/images/generations` 与 `/v1/images/edits`。</p>
              <Button
                variant="outline"
                className="h-10 rounded-xl border-stone-200 bg-white px-4 text-stone-700"
                onClick={() => void handleSaveCpaConfig()}
                disabled={isSavingCpaConfig}
              >
                {isSavingCpaConfig ? <LoaderCircle className="size-4 animate-spin" /> : null}
                保存 CPA 配置
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">创建用户</h2>
              <Badge variant="secondary" className="rounded-md bg-stone-100 text-stone-700">
                Admin Only
              </Badge>
            </div>
             <div className="grid gap-3 sm:grid-cols-2">
              <Input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="用户名"
                className="h-11 rounded-xl border-stone-200 bg-white"
              />
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="密码"
                className="h-11 rounded-xl border-stone-200 bg-white"
              />
               <Input
                 type="number"
                min="0"
                value={quota}
                onChange={(event) => setQuota(event.target.value)}
                placeholder="初始额度"
                 className="h-11 rounded-xl border-stone-200 bg-white"
               />
               <label className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                 <Checkbox checked={allowDirectMode} onCheckedChange={(checked) => setAllowDirectMode(Boolean(checked))} />
                 <span>允许直传模式</span>
               </label>
                <label className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
                  <Checkbox checked={allowImageBedMode} onCheckedChange={(checked) => setAllowImageBedMode(Boolean(checked))} />
                  <span>允许图床模式</span>
                </label>
                <label className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 sm:col-span-2">
                  <Checkbox checked={allowViewImageFailureLog} onCheckedChange={(checked) => setAllowViewImageFailureLog(Boolean(checked))} />
                  <span>允许查看生图失败日志</span>
                </label>
              </div>
            <Button
              className="h-10 rounded-xl bg-stone-950 px-4 text-white hover:bg-stone-800"
              onClick={() => void handleCreateUser()}
              disabled={isCreating}
            >
              {isCreating ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
              创建用户
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-2xl border-white/80 bg-white/90 shadow-sm">
        <CardContent className="space-y-0 p-0">
          <div className="border-b border-stone-100 px-4 py-3">
            <h2 className="text-lg font-semibold tracking-tight">用户列表</h2>
          </div>

          <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead className="border-b border-stone-100 text-[11px] text-stone-400 uppercase tracking-[0.18em]">
                  <tr>
                    <th className="px-4 py-3">用户名</th>
                    <th className="w-44 px-4 py-3">额度</th>
                    <th className="w-80 px-4 py-3">图片权限</th>
                    <th className="w-40 px-4 py-3">操作</th>
                  </tr>
                </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-stone-100/80 text-sm text-stone-600 hover:bg-stone-50/70">
                    <td className="px-4 py-3 font-medium text-stone-800">{user.username}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          value={quotaDrafts[user.id] ?? formatQuota(user.quota)}
                          onChange={(event) =>
                            setQuotaDrafts((prev) => ({
                              ...prev,
                              [user.id]: event.target.value,
                            }))
                          }
                          className="h-9 w-24 rounded-lg border-stone-200 bg-white px-3"
                        />
                        <Button
                          variant="outline"
                          className="h-9 rounded-lg border-stone-200 bg-white px-3 text-stone-700"
                          onClick={() => void handleUpdateQuota(user)}
                          disabled={editingQuotaUserId === user.id}
                        >
                          {editingQuotaUserId === user.id ? <LoaderCircle className="size-4 animate-spin" /> : null}
                          保存
                        </Button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-sm text-stone-700">
                          <Checkbox
                            checked={(modeDrafts[user.id] ?? user).allow_direct_mode}
                            onCheckedChange={(checked) =>
                              setModeDrafts((prev) => ({
                                ...prev,
                                [user.id]: {
                                  allow_direct_mode: Boolean(checked),
                                  allow_image_bed_mode: (prev[user.id] ?? user).allow_image_bed_mode,
                                  allow_view_image_failure_log: (prev[user.id] ?? user).allow_view_image_failure_log,
                                },
                              }))
                            }
                          />
                          直传
                        </label>
                        <label className="flex items-center gap-2 text-sm text-stone-700">
                          <Checkbox
                            checked={(modeDrafts[user.id] ?? user).allow_image_bed_mode}
                            onCheckedChange={(checked) =>
                              setModeDrafts((prev) => ({
                                ...prev,
                                [user.id]: {
                                  allow_direct_mode: (prev[user.id] ?? user).allow_direct_mode,
                                  allow_image_bed_mode: Boolean(checked),
                                  allow_view_image_failure_log: (prev[user.id] ?? user).allow_view_image_failure_log,
                                },
                              }))
                            }
                          />
                          图床
                        </label>
                        <label className="flex items-center gap-2 text-sm text-stone-700">
                          <Checkbox
                            checked={(modeDrafts[user.id] ?? user).allow_view_image_failure_log}
                            onCheckedChange={(checked) =>
                              setModeDrafts((prev) => ({
                                ...prev,
                                [user.id]: {
                                  allow_direct_mode: (prev[user.id] ?? user).allow_direct_mode,
                                  allow_image_bed_mode: (prev[user.id] ?? user).allow_image_bed_mode,
                                  allow_view_image_failure_log: Boolean(checked),
                                },
                              }))
                            }
                          />
                          失败日志
                        </label>
                        <Button
                          variant="outline"
                          className="h-9 rounded-lg border-stone-200 bg-white px-3 text-stone-700"
                          onClick={() => void handleUpdateModes(user)}
                          disabled={editingModesUserId === user.id}
                        >
                          {editingModesUserId === user.id ? <LoaderCircle className="size-4 animate-spin" /> : null}
                          保存模式
                        </Button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        className="h-9 rounded-lg px-3 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                        onClick={() => void handleDeleteUser(user)}
                        disabled={deletingUserId === user.id}
                      >
                        {deletingUserId === user.id ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                        删除
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!isLoading && users.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-stone-500">暂无用户，先在上方创建一个用户。</div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

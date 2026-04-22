"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, LoaderCircle, Plus, RefreshCw, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createAdminUser,
  deleteAdminUser,
  fetchAdminUsers,
  generateAdminRedeemKeys,
  updateAdminUserQuota,
  type AdminUser,
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

  const [editingQuotaUserId, setEditingQuotaUserId] = useState<string | null>(null);
  const [quotaDrafts, setQuotaDrafts] = useState<Record<string, string>>({});
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const [redeemAmount, setRedeemAmount] = useState("10");
  const [redeemQuantity, setRedeemQuantity] = useState("1");
  const [isGeneratingKeys, setIsGeneratingKeys] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<string[]>([]);

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
      const data = await fetchAdminUsers();
      setUsers(data.items);
      setQuotaDrafts(
        Object.fromEntries(data.items.map((item) => [item.id, formatQuota(item.quota)])),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载用户失败";
      toast.error(message);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
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

    setIsCreating(true);
    try {
      const data = await createAdminUser({
        username: normalizedUsername,
        password: normalizedPassword,
        quota: Math.max(0, Number(quota) || 0),
      });
      setUsers(data.items);
      setQuotaDrafts(
        Object.fromEntries(data.items.map((item) => [item.id, formatQuota(item.quota)])),
      );
      setUsername("");
      setPassword("");
      setQuota("0");
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

  const handleGenerateKeys = async () => {
    const parsedAmount = Math.max(1, Number(redeemAmount) || 1);
    const parsedQuantity = Math.max(1, Math.min(100, Number(redeemQuantity) || 1));

    setIsGeneratingKeys(true);
    try {
      const data = await generateAdminRedeemKeys({
        amount: parsedAmount,
        quantity: parsedQuantity,
      });
      setGeneratedKeys(data.items.map((item) => item.key));
      toast.success(`已生成 ${data.items.length} 个兑换码`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成兑换码失败";
      toast.error(message);
    } finally {
      setIsGeneratingKeys(false);
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
            <div className="mb-3 text-xs text-stone-400">最近生成兑换码</div>
            <div className="text-sm font-medium text-stone-700">{generatedKeys.length > 0 ? `${generatedKeys.length} 个` : "暂无"}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
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

        <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
          <CardContent className="space-y-4 p-6">
            <h2 className="text-lg font-semibold tracking-tight">兑换码生成</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                type="number"
                min="1"
                value={redeemAmount}
                onChange={(event) => setRedeemAmount(event.target.value)}
                placeholder="每个兑换码额度"
                className="h-11 rounded-xl border-stone-200 bg-white"
              />
              <Input
                type="number"
                min="1"
                max="100"
                value={redeemQuantity}
                onChange={(event) => setRedeemQuantity(event.target.value)}
                placeholder="生成数量"
                className="h-11 rounded-xl border-stone-200 bg-white"
              />
            </div>
            <Button
              variant="outline"
              className="h-10 rounded-xl border-stone-200 bg-white px-4 text-stone-700"
              onClick={() => void handleGenerateKeys()}
              disabled={isGeneratingKeys}
            >
              {isGeneratingKeys ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              生成兑换码
            </Button>
            <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-3">
              <div className="flex items-center justify-between text-xs text-stone-500">
                <span>结果</span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-stone-500 transition hover:text-stone-900"
                  onClick={() => {
                    if (generatedKeys.length === 0) {
                      return;
                    }
                    void navigator.clipboard.writeText(`${generatedKeys.join("\n")}\n`);
                    toast.success("兑换码已复制");
                  }}
                >
                  <Copy className="size-3.5" />
                  复制
                </button>
              </div>
              <textarea
                value={generatedKeys.join("\n")}
                readOnly
                className="min-h-[120px] w-full resize-y rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-700 outline-none"
                placeholder="生成后显示在这里"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-2xl border-white/80 bg-white/90 shadow-sm">
        <CardContent className="space-y-0 p-0">
          <div className="border-b border-stone-100 px-4 py-3">
            <h2 className="text-lg font-semibold tracking-tight">用户列表</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left">
              <thead className="border-b border-stone-100 text-[11px] text-stone-400 uppercase tracking-[0.18em]">
                <tr>
                  <th className="px-4 py-3">用户名</th>
                  <th className="w-44 px-4 py-3">额度</th>
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

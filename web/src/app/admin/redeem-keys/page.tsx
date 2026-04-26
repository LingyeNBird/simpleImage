"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { copyTextToClipboard } from "@/lib/clipboard";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  fetchAdminRedeemKeys,
  generateAdminRedeemKeys,
  type AdminRedeemKey,
} from "@/lib/api";
import { getStoredAuthSession } from "@/store/auth";

function formatUserLabel(value?: string | null) {
  return value ? value : "—";
}

export default function AdminRedeemKeysPage() {
  const router = useRouter();
  const didLoadRef = useRef(false);

  const [guardReady, setGuardReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingKeys, setIsGeneratingKeys] = useState(false);
  const [redeemKeys, setRedeemKeys] = useState<AdminRedeemKey[]>([]);
  const [redeemAmount, setRedeemAmount] = useState("10");
  const [redeemQuantity, setRedeemQuantity] = useState("1");
  const [generatedKeys, setGeneratedKeys] = useState<string[]>([]);

  const loadRedeemKeys = async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
    }
    try {
      const data = await fetchAdminRedeemKeys();
      setRedeemKeys(data.items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载兑换码失败";
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
    void loadRedeemKeys();
  }, [guardReady]);

  const handleGenerateKeys = async () => {
    const parsedAmount = Math.max(1, Number(redeemAmount) || 1);
    const parsedQuantity = Math.max(1, Math.min(100, Number(redeemQuantity) || 1));

    setIsGeneratingKeys(true);
    try {
      const data = await generateAdminRedeemKeys({
        amount: parsedAmount,
        quantity: parsedQuantity,
      });
      const nextGeneratedKeys = data.items.map((item) => item.key);
      setGeneratedKeys(nextGeneratedKeys);
      await loadRedeemKeys(true);
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
          <h1 className="text-2xl font-semibold tracking-tight">兑换码管理</h1>
        </div>
        <Button
          variant="outline"
          className="h-10 rounded-xl border-stone-200 bg-white/85 px-4 text-stone-700 hover:bg-white"
          onClick={() => void loadRedeemKeys()}
          disabled={isLoading}
        >
          <RefreshCw className={cn("size-4", isLoading ? "animate-spin" : "")}/>
          刷新
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">生成兑换码</h2>
              <Badge variant="secondary" className="rounded-md bg-stone-100 text-stone-700">
                Admin Only
              </Badge>
            </div>
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
                     void copyTextToClipboard(`${generatedKeys.join("\n")}\n`)
                       .then(() => {
                         toast.success("兑换码已复制");
                       })
                       .catch(() => {
                         toast.error("复制兑换码失败");
                       });
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

        <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
          <CardContent className="grid gap-3 p-6 sm:grid-cols-3">
            <div>
              <div className="mb-2 text-xs text-stone-400">兑换码总数</div>
              <div className="text-2xl font-semibold tracking-tight text-stone-900">{redeemKeys.length}</div>
            </div>
            <div>
              <div className="mb-2 text-xs text-stone-400">未核销</div>
              <div className="text-2xl font-semibold tracking-tight text-emerald-600">
                {redeemKeys.filter((item) => !item.redeemed).length}
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs text-stone-400">已核销</div>
              <div className="text-2xl font-semibold tracking-tight text-stone-700">
                {redeemKeys.filter((item) => item.redeemed).length}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-2xl border-white/80 bg-white/90 shadow-sm">
        <CardContent className="space-y-0 p-0">
          <div className="border-b border-stone-100 px-4 py-3">
            <h2 className="text-lg font-semibold tracking-tight">兑换码列表</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left">
              <thead className="border-b border-stone-100 text-[11px] text-stone-400 uppercase tracking-[0.18em]">
                <tr>
                  <th className="px-4 py-3">兑换码</th>
                  <th className="w-28 px-4 py-3">额度</th>
                  <th className="w-32 px-4 py-3">是否核销</th>
                  <th className="w-48 px-4 py-3">使用用户</th>
                  <th className="w-44 px-4 py-3">生成时间</th>
                  <th className="w-44 px-4 py-3">核销时间</th>
                </tr>
              </thead>
              <tbody>
                {redeemKeys.map((item) => (
                  <tr key={item.key} className="border-b border-stone-100/80 text-sm text-stone-600 hover:bg-stone-50/70">
                    <td className="px-4 py-3 font-mono text-xs text-stone-800">{item.key}</td>
                    <td className="px-4 py-3 font-medium text-sky-700">{item.amount}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={item.redeemed ? "secondary" : "success"}
                        className={cn("rounded-md", item.redeemed ? "bg-stone-100 text-stone-700" : "")}
                      >
                        {item.redeemed ? "已核销" : "未核销"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{formatUserLabel(item.redeemed_by)}</td>
                    <td className="px-4 py-3 text-stone-500">{item.created_at || "—"}</td>
                    <td className="px-4 py-3 text-stone-500">{item.redeemed_at || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!isLoading && redeemKeys.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-stone-500">暂无兑换码，先在上方生成一批。</div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

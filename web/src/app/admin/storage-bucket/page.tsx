"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, LoaderCircle, RefreshCw, Save, Wifi } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchCosConfig, testCosConfig, updateCosConfig, type CosConfig } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getStoredAuthSession } from "@/store/auth";

const EMPTY_CONFIG: CosConfig = {
  Region: "",
  SecretId: "",
  SecretKey: "",
  Bucket: "",
};

export default function AdminStorageBucketPage() {
  const router = useRouter();
  const didLoadRef = useRef(false);

  const [guardReady, setGuardReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [config, setConfig] = useState<CosConfig>(EMPTY_CONFIG);
  const [projectImageCount, setProjectImageCount] = useState(0);
  const [testMessage, setTestMessage] = useState("");

  const loadConfig = async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
    }
    try {
      const data = await fetchCosConfig();
      setConfig(data.config);
      setProjectImageCount(data.project_image_count);
      if (!silent) {
        setTestMessage("");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取存储桶配置失败");
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
    if (!guardReady || didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadConfig();
  }, [guardReady]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const data = await updateCosConfig(config);
      setConfig(data.config);
      toast.success("存储桶配置已保存到本地 cos_config.json");
      await loadConfig(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存存储桶配置失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const data = await testCosConfig();
      setProjectImageCount(data.result.project_image_count);
      setTestMessage(`连接成功，前缀 ${data.result.prefix} 下当前共有 ${data.result.project_image_count} 张本项目图片。`);
      toast.success("存储桶连接正常");
    } catch (error) {
      const message = error instanceof Error ? error.message : "测试存储桶失败";
      setTestMessage(message);
      toast.error(message);
    } finally {
      setIsTesting(false);
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
          <h1 className="text-2xl font-semibold tracking-tight">存储桶配置</h1>
        </div>
        <Button
          variant="outline"
          className="h-10 rounded-xl border-stone-200 bg-white/85 px-4 text-stone-700 hover:bg-white"
          onClick={() => void loadConfig()}
          disabled={isLoading}
        >
          <RefreshCw className={cn("size-4", isLoading ? "animate-spin" : "") } />
          重新读取 cos_config
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between text-xs text-stone-400">
              <span>本项目图床图片数</span>
              <Database className="size-4" />
            </div>
            <div className="text-3xl font-semibold tracking-tight text-stone-900">{projectImageCount}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between text-xs text-stone-400">
              <span>测试状态</span>
              <Wifi className="size-4" />
            </div>
            <div className="text-sm leading-6 text-stone-700">{testMessage || "尚未测试"}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
        <CardContent className="space-y-4 p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <LoaderCircle className="size-5 animate-spin text-stone-400" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm text-stone-700">Region</label>
                  <Input value={config.Region} onChange={(event) => setConfig((prev) => ({ ...prev, Region: event.target.value }))} className="h-10 rounded-xl border-stone-200 bg-white" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-stone-700">Bucket</label>
                  <Input value={config.Bucket} onChange={(event) => setConfig((prev) => ({ ...prev, Bucket: event.target.value }))} className="h-10 rounded-xl border-stone-200 bg-white" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-stone-700">SecretId</label>
                  <Input value={config.SecretId} onChange={(event) => setConfig((prev) => ({ ...prev, SecretId: event.target.value }))} className="h-10 rounded-xl border-stone-200 bg-white" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-stone-700">SecretKey</label>
                  <Input type="password" value={config.SecretKey} onChange={(event) => setConfig((prev) => ({ ...prev, SecretKey: event.target.value }))} className="h-10 rounded-xl border-stone-200 bg-white" />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button className="h-10 rounded-xl bg-stone-950 px-5 text-white hover:bg-stone-800" onClick={() => void handleSave()} disabled={isSaving}>
                  {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                  保存到本地
                </Button>
                <Button variant="outline" className="h-10 rounded-xl border-stone-200 bg-white px-5 text-stone-700" onClick={() => void handleTest()} disabled={isTesting}>
                  {isTesting ? <LoaderCircle className="size-4 animate-spin" /> : <Wifi className="size-4" />}
                  测试链接
                </Button>
                <Button variant="outline" className="h-10 rounded-xl border-stone-200 bg-white px-5 text-stone-700" onClick={() => void loadConfig()} disabled={isLoading}>
                  <RefreshCw className="size-4" />
                  刷新读取
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

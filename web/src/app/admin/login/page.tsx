"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { loginAdmin } from "@/lib/api";
import { setStoredAuthSession } from "@/store/auth";

export default function AdminLoginPage() {
  const router = useRouter();
  const [authKey, setAuthKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    const normalizedAuthKey = authKey.trim();
    if (!normalizedAuthKey) {
      toast.error("请输入管理员密钥");
      return;
    }

    setIsSubmitting(true);
    try {
      await loginAdmin(normalizedAuthKey);
      await setStoredAuthSession({
        role: "admin",
        token: normalizedAuthKey,
      });
      router.replace("/accounts");
    } catch (error) {
      const message = error instanceof Error ? error.message : "登录失败";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-[calc(100vh-1rem)] w-full place-items-center px-4 py-6">
      <Card className="w-full max-w-[505px] rounded-[30px] border-white/80 bg-white/95 shadow-[0_28px_90px_rgba(28,25,23,0.10)]">
        <CardContent className="space-y-7 p-6 sm:p-8">
          <div className="space-y-4 text-center">
            <div className="mx-auto inline-flex size-14 items-center justify-center rounded-[18px] bg-stone-950 text-white shadow-sm">
              <LockKeyhole className="size-5" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-stone-950">管理员入口</h1>
              <p className="text-sm leading-6 text-stone-500">输入管理员密钥以访问号池、设置和用户管理页面。</p>
            </div>
          </div>

          <div className="space-y-3">
            <label htmlFor="admin-auth-key" className="block text-sm font-medium text-stone-700">
              管理员密钥
            </label>
            <Input
              id="admin-auth-key"
              type="password"
              value={authKey}
              onChange={(event) => setAuthKey(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleLogin();
                }
              }}
              placeholder="请输入密钥"
              className="h-13 rounded-2xl border-stone-200 bg-white px-4"
            />
          </div>

          <div className="flex items-center justify-between text-sm text-stone-500">
            <Link href="/login" className="transition hover:text-stone-900">
              用户登录
            </Link>
            <Link href="/register" className="transition hover:text-stone-900">
              用户注册
            </Link>
          </div>

          <Button
            className="h-13 w-full rounded-2xl bg-stone-950 text-white hover:bg-stone-800"
            onClick={() => void handleLogin()}
            disabled={isSubmitting}
          >
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
            登录
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

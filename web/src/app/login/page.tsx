"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { loginUser } from "@/lib/api";
import { setStoredAuthSession } from "@/store/auth";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password.trim()) {
      toast.error("请输入用户名和密码");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await loginUser({
        username: normalizedUsername,
        password,
      });
      await setStoredAuthSession({
        role: "user",
        token: data.token || "",
        username: data.user?.username || normalizedUsername,
      });
      router.replace("/image");
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
              <UserRound className="size-5" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-stone-950">欢迎回来</h1>
              <p className="text-sm leading-6 text-stone-500">使用用户账号登录后进入图片生成页面。</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-3">
              <label htmlFor="username" className="block text-sm font-medium text-stone-700">
                用户名
              </label>
              <Input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="请输入用户名"
                className="h-13 rounded-2xl border-stone-200 bg-white px-4"
              />
            </div>
            <div className="space-y-3">
              <label htmlFor="password" className="block text-sm font-medium text-stone-700">
                密码
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleLogin();
                  }
                }}
                placeholder="请输入密码"
                className="h-13 rounded-2xl border-stone-200 bg-white px-4"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Input
              readOnly
              value="没有账号？先注册；管理员请走管理员入口"
              className="pointer-events-none h-11 rounded-xl border-stone-100 bg-stone-50 px-4 text-xs text-stone-500"
            />
            <div className="flex items-center justify-between text-sm">
              <Link href="/register" className="text-stone-600 transition hover:text-stone-900">
                去注册
              </Link>
              <Link href="/admin/login" className="text-stone-500 transition hover:text-stone-900">
                管理员登录
              </Link>
            </div>
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

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { registerUser } from "@/lib/api";
import { setStoredAuthSession } from "@/store/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRegister = async () => {
    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password.trim()) {
      toast.error("请输入用户名和密码");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await registerUser({
        username: normalizedUsername,
        password,
      });
      await setStoredAuthSession({
        role: "user",
        token: data.token,
        username: data.user?.username || normalizedUsername,
      });
      toast.success("注册成功");
      router.replace("/image");
    } catch (error) {
      const message = error instanceof Error ? error.message : "注册失败";
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
              <UserRoundPlus className="size-5" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-stone-950">创建账号</h1>
              <p className="text-sm leading-6 text-stone-500">注册后即可直接使用图片页面与额度兑换功能。</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-3">
              <label htmlFor="register-username" className="block text-sm font-medium text-stone-700">
                用户名
              </label>
              <Input
                id="register-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="请输入用户名"
                className="h-13 rounded-2xl border-stone-200 bg-white px-4"
              />
            </div>
            <div className="space-y-3">
              <label htmlFor="register-password" className="block text-sm font-medium text-stone-700">
                密码
              </label>
              <Input
                id="register-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="请输入密码"
                className="h-13 rounded-2xl border-stone-200 bg-white px-4"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-sm text-stone-500">
            <Link href="/login" className="transition hover:text-stone-900">
              已有账号？去登录
            </Link>
            <Link href="/admin/login" className="transition hover:text-stone-900">
              管理员登录
            </Link>
          </div>

          <Button
            className="h-13 w-full rounded-2xl bg-stone-950 text-white hover:bg-stone-800"
            onClick={() => void handleRegister()}
            disabled={isSubmitting}
          >
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
            注册并继续
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

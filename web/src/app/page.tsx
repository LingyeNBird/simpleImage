"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { getRoleHomePath, getStoredAuthSession } from "@/store/auth";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const resolveHome = async () => {
      const session = await getStoredAuthSession();
      if (cancelled) {
        return;
      }

      if (!session) {
        router.replace("/login");
        return;
      }

      router.replace(getRoleHomePath(session.role));
    };

    void resolveHome();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}

"use client";

import {
  finalizeOAuthCallbackSession,
  getRoleRedirectFromServer,
  waitForCurrentUser,
} from "@/services/authService";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Completing Google sign-in...");
  
  useEffect(() => {
    let active = true;

    async function completeAuth() {
      const params = new URLSearchParams(window.location.search);
      const userId = params.get("userId");
      const secret = params.get("secret");

      if (!userId || !secret) {
        if (!active) return;
        setMessage("OAuth callback is missing credentials. Redirecting to login...");
        router.replace("/login?error=oauth-callback-missing-credentials");
        return;
      }

      try {
        await finalizeOAuthCallbackSession(userId, secret);
      } catch {
        if (!active) return;
        setMessage("Session could not be established. Redirecting to login...");
        router.replace("/login");
        return;
      }

      const user = await waitForCurrentUser({ attempts: 15, delayMs: 300 });

      if (!active) return;

      if (!user) {
        setMessage("Session could not be established. Redirecting to login...");
        router.replace("/login");
        return;
      }

      const redirectTo = await getRoleRedirectFromServer();

      if (!active) return;

      router.replace(redirectTo || "/onboarding");
    }

    completeAuth();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#fdf2e9",
        color: "#4a2c2a",
        fontFamily: "Georgia, serif",
      }}
    >
      <p>{message}</p>
    </main>
  );
}

"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.replace(params.get("next") || "/");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong.");
    }
  }

  return (
    <div className="app-shell relative min-h-screen flex items-center justify-center bg-neutral-950 px-4">
      <div className="absolute right-5 top-5">
        <ThemeToggle compact />
      </div>
      <form
        onSubmit={handleSubmit}
        className="modal-surface w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-7 shadow-xl"
      >
        <img src="/logo.webp" alt="Zaviri" className="brand-mark h-11 w-11 mx-auto mb-5" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f2426a] mb-2 text-center">Workspace access</p>
        <h1 className="workspace-title text-xl font-semibold text-white mb-1 text-center">Zaviri Outreach</h1>
        <p className="workspace-subtitle text-sm text-neutral-400 mb-6 text-center">Sign in to continue to the agency workspace.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="control-field w-full min-h-[42px] mb-3"
        />
        {error && <p className="text-rose-400 text-sm mb-3">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="primary-button w-full min-h-[42px]"
        >
          {loading ? "Checking..." : "Enter"}
        </button>
      </form>
    </div>
  );
}

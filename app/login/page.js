"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-xl p-8 shadow-xl"
      >
        <img src="/logo.webp" alt="Logo" className="h-12 w-12 rounded mx-auto mb-4" />
        <h1 className="text-xl font-semibold text-white mb-1 text-center">Zaviri Outreach</h1>
        <p className="text-sm text-neutral-400 mb-6 text-center">Enter the shared password to continue.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#f01546] mb-3"
        />
        {error && <p className="text-rose-400 text-sm mb-3">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-[#f01546] hover:bg-[#f2426a] disabled:opacity-50 text-white font-medium py-2 transition"
        >
          {loading ? "Checking..." : "Enter"}
        </button>
      </form>
    </div>
  );
}

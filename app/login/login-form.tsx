"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [mounted, setMounted] = useState(false);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signupRole, setSignupRole] = useState<"cashier" | "admin" | "customer">("cashier");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="mt-6 rounded-lg border border-gray-800 bg-[#0d0d0d] px-3 py-4 text-sm text-gray-500">
        Loading login form...
      </div>
    );
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (mode === "signin") {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message || "Login failed");
        setLoading(false);
        return;
      }

      router.replace("/auth/redirect");
      router.refresh();
      setLoading(false);
      return;
    }

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        full_name: fullName || null,
        role: signupRole,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data?.error || "Sign up failed");
      setLoading(false);
      return;
    }

    setMessage("Signup request sent. Tunggu admin approve dulu.");
    setSignupRole("cashier");
    setFullName("");
    setEmail("");
    setMode("signup");
    setLoading(false);
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setError(null);
            setMessage(null);
          }}
          className={`rounded-lg py-2 text-sm font-medium ${
            mode === "signin"
              ? "bg-[#7F1D1D] text-white"
              : "bg-[#1b1b1b] text-gray-300"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setError(null);
            setMessage(null);
          }}
          className={`rounded-lg py-2 text-sm font-medium ${
            mode === "signup"
              ? "bg-[#7F1D1D] text-white"
              : "bg-[#1b1b1b] text-gray-300"
          }`}
        >
          Sign up
        </button>
      </div>

      {mode === "signup" ? (
        <>
          <div>
            <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-gray-300">
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-lg border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none transition focus:border-[#7F1D1D]"
            />
          </div>

          <div>
            <label htmlFor="role" className="mb-1 block text-sm font-medium text-gray-300">
              Account role
            </label>
            <select
              id="role"
              value={signupRole}
              onChange={e => setSignupRole(e.target.value as "cashier" | "admin")}
              className="w-full rounded-lg border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none transition focus:border-[#7F1D1D]"
            >
              <option value="cashier">Cashier</option>
              <option value="admin">Admin</option>
              <option value="customer">Customer</option>
            </select>
          </div>
        </>
      ) : null}

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-300">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="cashier@coffee.com"
          className="w-full rounded-lg border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none transition focus:border-[#7F1D1D]"
        />
      </div>

      {mode === "signin" ? (
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-300">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none transition focus:border-[#7F1D1D]"
          />
        </div>
      ) : (
        <p className="rounded-lg border border-gray-800 bg-[#0d0d0d] px-3 py-2 text-xs text-gray-400">
          Akaun akan aktif selepas admin approve. Invite link akan dihantar ke email.
        </p>
      )}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {message ? <p className="text-sm text-green-400">{message}</p> : null}

      <button
        type="submit"
        disabled={loading}
        className="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-[#7F1D1D] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-70"
      >
        {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Submit request"}
      </button>
    </form>
  );
}

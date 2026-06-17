"use client";

// Sign in (design README §9). Phone OTP via the existing /api/public/otp/*
// endpoints (the loyalty system's WhatsApp OTP). On verify, the server sets the
// phone_otp cookie that gates redeem/check-in. Google OAuth is not wired for
// customers yet (guests order without auth) — surfaced honestly.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrder, normalizeMyPhone, localPhone } from "../order-provider";

export default function SignInPage() {
  const router = useRouter();
  const { contact, setContact } = useOrder();
  const [phone, setPhone] = useState(localPhone(contact.phone));
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [next, setNext] = useState("/rewards");

  useEffect(() => {
    try {
      const n = new URLSearchParams(window.location.search).get("next");
      if (n) setNext(n);
    } catch {}
  }, []);

  const canonical = normalizeMyPhone(phone);

  async function requestCode() {
    if (phone.replace(/\D/g, "").length < 8) { setErr("No telefon tidak sah"); return; }
    setBusy(true); setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/public/otp/request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: canonical }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Gagal hantar kod");
      setStage("code");
      setMsg("Kod dihantar ke WhatsApp anda.");
    } catch (e) { setErr(e instanceof Error ? e.message : "Ralat"); }
    finally { setBusy(false); }
  }

  async function verify() {
    if (code.trim().length < 4) { setErr("Masukkan kod"); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/public/otp/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: canonical, code: code.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Kod salah");
      setContact({ name: contact.name, phone: canonical });
      router.push(next);
    } catch (e) { setErr(e instanceof Error ? e.message : "Ralat"); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-cream">
      <div className="safe-top flex flex-none items-center gap-3.5 px-5 pb-3.5 pt-5">
        <button onClick={() => router.back()} className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border border-hairline bg-card text-[18px] text-espresso active:scale-95" aria-label="Back">←</button>
      </div>

      <div className="flex flex-1 flex-col px-6 pt-6">
        <div className="font-display text-[22px] font-bold tracking-wordmark text-maroon">LOKA</div>
        <h1 className="mt-6 font-display text-[24px] font-semibold leading-tight tracking-[-.01em] text-espresso">Sign in to collect points.</h1>
        <p className="mt-2 font-sans text-[14px] leading-relaxed text-muted">Every RM 1 = 1 point. We&apos;ll text a one-time code.</p>

        {stage === "phone" ? (
          <div className="mt-7">
            <div className="flex items-center rounded-[14px] border border-hairline bg-card focus-within:border-maroon">
              <span className="pl-4 pr-2 font-sans text-[15px] text-muted">🇲🇾 +60</span>
              <input
                autoFocus value={phone}
                onChange={e => setPhone(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric" placeholder="12 345 6789"
                className="w-full bg-transparent py-3.5 pr-4 font-sans text-[15px] text-espresso outline-none placeholder:text-muted-2"
              />
            </div>
            <button onClick={() => void requestCode()} disabled={busy} className="mt-3 w-full rounded-[14px] bg-maroon py-3.5 font-sans text-[15px] font-semibold text-cream active:scale-[.99] disabled:opacity-60">
              {busy ? "…" : "Continue"}
            </button>

            <div className="my-5 flex items-center gap-3 text-muted-2">
              <div className="h-px flex-1 bg-hairline" /><span className="font-sans text-[12px]">or</span><div className="h-px flex-1 bg-hairline" />
            </div>
            <button onClick={() => setErr("Google sign-in akan datang — guna telefon dulu.")} className="w-full rounded-[14px] border border-hairline bg-card py-3.5 font-sans text-[15px] font-semibold text-espresso active:scale-[.99]">
              Continue with Google
            </button>
          </div>
        ) : (
          <div className="mt-7">
            <p className="font-sans text-[13px] text-muted">Code sent to +{canonical}</p>
            <input
              autoFocus value={code}
              onChange={e => setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
              inputMode="numeric" placeholder="------"
              className="mt-2 w-full rounded-[14px] border border-hairline bg-card py-3.5 text-center font-display text-[22px] font-semibold tracking-[0.3em] text-espresso outline-none placeholder:text-muted-2 focus:border-maroon"
            />
            <button onClick={() => void verify()} disabled={busy} className="mt-3 w-full rounded-[14px] bg-maroon py-3.5 font-sans text-[15px] font-semibold text-cream active:scale-[.99] disabled:opacity-60">
              {busy ? "Mengesahkan…" : "Verify & continue"}
            </button>
            <button onClick={() => void requestCode()} disabled={busy} className="mt-2 w-full py-2 font-sans text-[13px] font-semibold text-maroon disabled:opacity-40">Resend code</button>
          </div>
        )}

        {msg && <p className="mt-3 text-center font-sans text-[13px] text-leaf">{msg}</p>}
        {err && <p className="mt-3 text-center font-sans text-[13px] text-melon">{err}</p>}

        <p className="mt-auto py-6 text-center font-sans text-[11px] text-muted-2">By continuing you agree to Loka&apos;s Terms &amp; Privacy.</p>
      </div>
    </div>
  );
}

"use client";

// Sign in (design README §9).
//
//   • Continue with Google  → Supabase OAuth → /auth/callback. Returning
//     customers land back here at ?stage=sync with the loyalty phone session
//     already minted — no code. First-timers land at ?stage=link and verify
//     their phone ONCE (WhatsApp OTP), after which Google alone is enough.
//   • Phone OTP             → the existing /api/public/otp/* flow (guests).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrder, normalizeMyPhone, localPhone } from "../order-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Stage = "phone" | "code" | "link" | "sync";

function safeNext(raw: string | null) {
  const v = String(raw || "").trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("://")) return "/rewards";
  return v;
}

export default function SignInPage() {
  const router = useRouter();
  const { contact, setContact } = useOrder();
  const [phone, setPhone] = useState(localPhone(contact.phone));
  const [stage, setStage] = useState<Stage>("phone");
  const [linking, setLinking] = useState(false); // OTP is being used to bind a Google account
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [next, setNext] = useState("/rewards");

  // Read ?next / ?stage / ?error once.
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      setNext(safeNext(sp.get("next")));
      const e = sp.get("error");
      if (e) setErr(e);
      const s = sp.get("stage");
      if (s === "sync") setStage("sync");
      else if (s === "link") { setStage("link"); setLinking(true); }
    } catch {}
  }, []);

  // stage=sync: the server already minted the phone session from the Google
  // account — pull name/phone into local contact and continue.
  useEffect(() => {
    if (stage !== "sync") return;
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/public/me", { cache: "no-store" });
        const d = await res.json();
        if (!live) return;
        if (d?.signed_in && d.phone) {
          setContact({ name: contact.name || d.name || "", phone: String(d.phone) });
          router.replace(next);
          return;
        }
        if (d?.signed_in && d.needs_phone) {
          setStage("link");
          setLinking(true);
          return;
        }
        setStage("phone");
        setErr("Sesi Google tidak dijumpai. Cuba lagi.");
      } catch {
        if (live) { setStage("phone"); setErr("Tiada sambungan."); }
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, next]);

  const canonical = normalizeMyPhone(phone);

  async function google() {
    setBusy(true); setErr(null); setMsg(null);
    try {
      // Where to go after the callback. Kept in a short-lived cookie instead of
      // a ?next= query param so `redirectTo` matches the Supabase allow-list
      // exactly (query strings break exact matching).
      document.cookie = `loka_oauth_next=${encodeURIComponent(next)}; path=/; max-age=600; samesite=lax`;
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
      // Browser is navigating to Google now.
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Google sign-in gagal");
      setBusy(false);
    }
  }

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

      let name = contact.name;
      if (linking) {
        // Bind the verified phone to the Google account (one time only).
        const link = await fetch("/api/customer/link-phone", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: canonical }),
        });
        const ld = await link.json().catch(() => ({}));
        if (!link.ok) throw new Error(ld.error || "Gagal sambungkan nombor ke akaun Google");
        name = name || String(ld?.customer?.name || "");
      }
      setContact({ name, phone: canonical });
      router.replace(next);
    } catch (e) { setErr(e instanceof Error ? e.message : "Ralat"); }
    finally { setBusy(false); }
  }

  const title = linking
    ? "Sambungkan nombor telefon anda."
    : "Sign in to collect points.";
  const subtitle = linking
    ? "Sekali sahaja — selepas ini, Google dah cukup untuk log masuk."
    : "Every RM 1 = 1 point. Google, or a one-time WhatsApp code.";

  return (
    <div className="flex min-h-[100dvh] flex-col bg-cream">
      <div className="safe-top flex flex-none items-center gap-3.5 px-5 pb-3.5 pt-5">
        <button onClick={() => router.back()} className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border border-hairline bg-card text-[18px] text-espresso active:scale-95" aria-label="Back">←</button>
      </div>

      <div className="flex flex-1 flex-col px-6 pt-6">
        <div className="font-display text-[22px] font-bold tracking-wordmark text-maroon">LOKA</div>
        <h1 className="mt-6 font-display text-[24px] font-semibold leading-tight tracking-[-.01em] text-espresso">{title}</h1>
        <p className="mt-2 font-sans text-[14px] leading-relaxed text-muted">{subtitle}</p>

        {stage === "sync" ? (
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-hairline border-t-maroon" />
            <p className="font-sans text-[13px] text-muted">Menyambung akaun Google anda…</p>
          </div>
        ) : stage === "phone" || stage === "link" ? (
          <div className="mt-7">
            {!linking && (
              <>
                <button
                  onClick={() => void google()}
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-3 rounded-[14px] border border-hairline bg-card py-3.5 font-sans text-[15px] font-semibold text-espresso active:scale-[.99] disabled:opacity-60"
                >
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  {busy ? "Membuka Google…" : "Continue with Google"}
                </button>

                <div className="my-5 flex items-center gap-3 text-muted-2">
                  <div className="h-px flex-1 bg-hairline" /><span className="font-sans text-[12px]">or use your phone</span><div className="h-px flex-1 bg-hairline" />
                </div>
              </>
            )}

            <div className="flex items-center rounded-[14px] border border-hairline bg-card focus-within:border-maroon">
              <span className="pl-4 pr-2 font-sans text-[15px] text-muted">🇲🇾 +60</span>
              <input
                autoFocus={linking} value={phone}
                onChange={e => setPhone(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric" placeholder="12 345 6789"
                className="w-full bg-transparent py-3.5 pr-4 font-sans text-[15px] text-espresso outline-none placeholder:text-muted-2"
              />
            </div>
            <button onClick={() => void requestCode()} disabled={busy} className="mt-3 w-full rounded-[14px] bg-maroon py-3.5 font-sans text-[15px] font-semibold text-cream active:scale-[.99] disabled:opacity-60">
              {busy ? "…" : linking ? "Hantar kod WhatsApp" : "Continue"}
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
              {busy ? "Mengesahkan…" : linking ? "Sahkan & sambungkan" : "Verify & continue"}
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

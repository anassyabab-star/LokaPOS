"use client";

import { usePos } from "../pos-context";
import { useState, useEffect, useRef } from "react";

type ClockProfile = { hourly_rate: number; employment_type: string; is_active: boolean } | null;
type ClockinRecord = { id: string; clock_in_at: string } | null;

function useDuration(clockInAt: string | null) {
  const [mins, setMins] = useState(0);
  useEffect(() => {
    if (!clockInAt) { setMins(0); return; }
    const tick = () => setMins(Math.floor((Date.now() - new Date(clockInAt).getTime()) / 60000));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [clockInAt]);
  return mins;
}

function ClockInSection() {
  const [profile, setProfile] = useState<ClockProfile>(null);
  const [clockin, setClockin] = useState<ClockinRecord>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState("");
  const durationMins = useDuration(clockin?.clock_in_at ?? null);

  // Smart clock — selfie capture (wajib) + GPS
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"clockin" | "clockout">("clockin");
  const [camError, setCamError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pos/clockin", { cache: "no-store" })
      .then(r => r.json())
      .then(d => { setProfile(d.profile); setClockin(d.clockin); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }
  useEffect(() => stopCamera, []); // stop tracks on unmount

  async function openCamera(action: "clockin" | "clockout") {
    setPendingAction(action);
    setSelfie(null);
    setCamError(null);
    setCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
      streamRef.current = stream;
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      }, 100);
    } catch {
      setCamError("Gagal buka kamera. Benarkan akses kamera dalam tetapan browser.");
    }
  }

  function closeCamera() {
    stopCamera();
    setCameraOpen(false);
    setSelfie(null);
    setCamError(null);
  }

  function captureSelfie() {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setSelfie(canvas.toDataURL("image/jpeg", 0.7));
    stopCamera();
  }

  async function confirmClock() {
    if (!selfie) return;
    setSubmitting(true);
    try {
      let location = "";
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }));
        location = `${pos.coords.latitude},${pos.coords.longitude}`;
      } catch { /* teruskan tanpa lokasi */ }

      const res = await fetch("/api/pos/clockin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: pendingAction,
          selfie,
          location: location || undefined,
          notes: pendingAction === "clockout" ? notes.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data?.error || "Gagal"); return; }
      if (pendingAction === "clockin") setClockin(data.clockin);
      else { setClockin(null); setNotes(""); }
      closeCamera();
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="px-4 py-3 text-sm text-gray-400">Memuatkan...</div>;
  if (!profile || !profile.is_active) return null;

  const hrs = Math.floor(durationMins / 60);
  const mns = durationMins % 60;
  const durationLabel = clockin
    ? hrs > 0 ? `${hrs}j ${mns}m` : `${mns}m`
    : null;

  return (
    <>
      <div className="mx-4 my-3 rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Kehadiran
        </div>
        {clockin ? (
          <div className="px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500">Clocked in sejak</div>
                <div className="text-sm font-semibold text-gray-900">
                  {new Date(clockin.clock_in_at).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" })}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">Tempoh</div>
                <div className="text-sm font-bold text-green-700">{durationLabel}</div>
              </div>
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Nota (pilihan) — cth: tugas hari ini..."
              rows={2}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-gray-400 focus:outline-none resize-none"
            />
            <button
              onClick={() => openCamera("clockout")}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#7F1D1D] py-3 text-sm font-semibold text-white disabled:opacity-50 active:bg-[#6B1818]"
            >
              <CameraIcon /> Clock Out dengan Selfie
            </button>
          </div>
        ) : (
          <div className="px-4 py-3">
            <button
              onClick={() => openCamera("clockin")}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white disabled:opacity-50 active:bg-green-700"
            >
              <CameraIcon /> Clock In dengan Selfie
            </button>
          </div>
        )}
      </div>

      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
          <canvas ref={canvasRef} className="hidden" />
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <span className="text-sm font-semibold">
              {pendingAction === "clockin" ? "Selfie · Clock In" : "Selfie · Clock Out"}
            </span>
            <button onClick={closeCamera} className="text-sm text-white/70">Tutup</button>
          </div>
          <div className="flex flex-1 items-center justify-center px-4">
            {camError ? (
              <p className="max-w-xs text-center text-sm text-white/80">{camError}</p>
            ) : selfie ? (
              <img src={selfie} alt="Selfie" className="max-h-[60vh] w-auto rounded-2xl object-contain" />
            ) : (
              <video ref={videoRef} autoPlay playsInline muted className="max-h-[60vh] w-auto rounded-2xl bg-black object-contain" />
            )}
          </div>
          <div className="px-4 pb-8 pt-4">
            {camError ? (
              <button onClick={closeCamera} className="w-full rounded-xl bg-white/10 py-3 text-sm font-semibold text-white">Tutup</button>
            ) : selfie ? (
              <div className="flex gap-3">
                <button
                  onClick={() => openCamera(pendingAction)}
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-white/10 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Ambil Semula
                </button>
                <button
                  onClick={() => void confirmClock()}
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? "..." : pendingAction === "clockin" ? "Sahkan Masuk" : "Sahkan Keluar"}
                </button>
              </div>
            ) : (
              <button onClick={captureSelfie} className="w-full rounded-xl bg-white py-4 text-base font-bold text-gray-900 active:bg-gray-100">
                Tangkap Gambar
              </button>
            )}
            <p className="mt-3 text-center text-[11px] text-white/50">Lokasi GPS akan direkodkan secara automatik</p>
          </div>
        </div>
      )}
    </>
  );
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

export default function MoreTab() {
  const s = usePos();

  return (
    <div className="flex-1 overflow-y-auto pb-20">
      <div className="px-4 pb-2 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">More</h1>
        <p className="text-sm text-gray-500">Loka POS v2.1</p>
      </div>
      <ClockInSection />
      <div className="mx-4 my-3 rounded-xl bg-[#7F1D1D]/5 border border-[#7F1D1D]/10 px-4 py-3">
        <div className="text-xs text-gray-500">Shift</div>
        <div className="text-sm font-medium">{s.currentShift ? `Aktif · RM${s.expectedCashLive.toFixed(2)} tunai` : "Tutup"}</div>
      </div>
      <button onClick={() => s.setOverlay("products")} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left text-sm font-medium text-gray-900">Products / Items <span className="text-gray-400">›</span></button>
      <button onClick={() => s.setShowQrScanner(true)} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left text-sm font-medium text-gray-900">
        <span className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#7F1D1D]/10">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7F1D1D" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="3" height="3" /><path d="M21 14h-3v3h3M21 21h-3m3 0v-3" /></svg>
          </span>
          Scan QR
        </span>
        <span className="text-gray-400">›</span>
      </button>
      {s.currentShift ? (
        <>
          <button onClick={() => s.setShowPaidOutModal(true)} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left text-sm font-medium text-gray-900">Paid Out <span className="text-gray-400">›</span></button>
          <button onClick={() => { s.setCountedCash(s.expectedCashLive.toFixed(2)); s.setShowCloseShiftModal(true); }} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left text-sm font-medium text-gray-900">Tutup Shift <span className="text-gray-400">›</span></button>
        </>
      ) : (
        <button onClick={() => s.setShowOpenShiftModal(true)} className="flex w-full items-center justify-between border-b border-gray-200 px-4 py-4 text-left text-sm font-medium text-gray-900">Buka Shift <span className="text-gray-400">›</span></button>
      )}
      <a href="/sop" className="flex items-center justify-between border-b border-gray-200 px-4 py-4 text-left text-sm font-medium text-gray-900">
        <span className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-sm">☕</span>
          Barista SOP
        </span>
        <span className="text-gray-400">›</span>
      </a>
      <a href="/dashboard" className="flex items-center justify-between border-b border-gray-200 px-4 py-4 text-sm font-medium text-gray-400">Admin Panel <span>›</span></a>
      <a href="/kds" target="_blank" className="flex items-center justify-between border-b border-gray-200 px-4 py-4 text-sm font-medium text-gray-900">
        <span className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-sm">🍳</span>
          Kitchen Display (KDS)
        </span>
        <span className="text-gray-400">›</span>
      </a>
      <div className="mx-4 my-3 rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Print Settings</div>
        <label className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Auto Print Receipt</span>
          <input type="checkbox" checked={s.autoPrintEnabled} onChange={e => s.setAutoPrintEnabled(e.target.checked)} className="h-4 w-4 accent-[#7F1D1D]" />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Auto Print Cup Label</span>
          <input type="checkbox" checked={s.autoPrintLabel} onChange={e => s.setAutoPrintLabel(e.target.checked)} className="h-4 w-4 accent-[#7F1D1D]" />
        </label>
        <div className="text-[11px] text-gray-400">Label auto-print buka popup untuk setiap item. Guna sticker 50×30mm.</div>
        <div className="pt-1 border-t border-gray-200 space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Printer IP (LAN/WiFi)</div>
          <input
            type="text"
            inputMode="decimal"
            placeholder="cth: 192.168.1.100"
            value={s.printerIp}
            onChange={e => s.setPrinterIp(e.target.value.trim())}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#7F1D1D] focus:outline-none"
          />
          <div className="text-[11px] text-gray-400">
            {s.printerIp
              ? "Print terus ke printer via IP — tiada popup diperlukan."
              : "Kosongkan untuk print via browser (popup). Isi IP untuk print terus ke printer 80mm."}
          </div>
        </div>
      </div>
      <button onClick={() => s.setShowSignOutConfirm(true)} className="px-4 py-4 text-left text-sm font-medium text-[#7F1D1D]">Sign out</button>
    </div>
  );
}

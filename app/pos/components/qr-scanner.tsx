"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type QrScannerProps = {
  onScan: (orderId: string) => void;
  onClose: () => void;
};

type BarcodeDetectorType = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
};

type WindowWithBarcodeDetector = Window & typeof globalThis & {
  BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorType;
};

export default function QrScanner({ onScan, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const hasScannedRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  // Detect iOS
  const isIOS = typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);

  const extractOrderId = useCallback((data: string): string | null => {
    try {
      const url = new URL(data);
      const orderId = url.searchParams.get("order");
      if (orderId) return orderId;
    } catch {
      // not a URL
    }
    const uuidMatch = data.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    if (uuidMatch) return uuidMatch[0];
    return null;
  }, []);

  const handleDetected = useCallback((rawValue: string) => {
    if (hasScannedRef.current) return;
    const orderId = extractOrderId(rawValue);
    if (!orderId) return;
    hasScannedRef.current = true;
    if (navigator.vibrate) navigator.vibrate(100);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    onScan(orderId);
  }, [extractOrderId, onScan]);

  useEffect(() => {
    let mounted = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Check torch support (Android Chrome only, not iOS)
        if (!isIOS) {
          const videoTrack = stream.getVideoTracks()[0];
          const capabilities = videoTrack?.getCapabilities?.() as { torch?: boolean } | undefined;
          if (capabilities?.torch) setTorchSupported(true);
        }

        if (mounted) setLoading(false);

        // Try native BarcodeDetector first
        const win = window as WindowWithBarcodeDetector;
        if (win.BarcodeDetector) {
          const detector = new win.BarcodeDetector({ formats: ["qr_code"] });
          const scan = async () => {
            if (!mounted || hasScannedRef.current) return;
            if (videoRef.current && videoRef.current.readyState === 4) {
              try {
                const codes = await detector.detect(videoRef.current);
                if (codes.length > 0) {
                  handleDetected(codes[0].rawValue);
                  return;
                }
              } catch {
                // continue
              }
            }
            rafRef.current = requestAnimationFrame(scan);
          };
          rafRef.current = requestAnimationFrame(scan);
        } else {
          // Fallback: html5-qrcode for iOS
          await loadHtml5QrcodeAndScan(mounted);
        }
      } catch (err: unknown) {
        if (!mounted) return;
        setLoading(false);
        const e = err as { name?: string };
        if (e?.name === "NotAllowedError") {
          setError("Kamera tidak dibenarkan. Beri kebenaran kamera dalam settings browser.");
        } else if (e?.name === "NotFoundError") {
          setError("Tiada kamera dijumpai pada peranti ini.");
        } else {
          setError("Gagal membuka kamera. Cuba reload halaman.");
        }
      }
    }

    async function loadHtml5QrcodeAndScan(isMounted: boolean) {
      type WinWithLib = Window & typeof globalThis & {
        Html5Qrcode?: new (id: string) => {
          start: (
            camera: { facingMode: string },
            config: { fps: number; qrbox: { width: number; height: number } },
            onSuccess: (text: string) => void,
            onFailure: () => void
          ) => Promise<void>;
          stop: () => Promise<void>;
          clear: () => void;
        };
      };
      const win = window as WinWithLib;
      if (!win.Html5Qrcode) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js";
          s.onload = () => resolve();
          s.onerror = () => reject();
          document.head.appendChild(s);
        });
      }
      if (!isMounted || !win.Html5Qrcode) return;

      if (videoRef.current) videoRef.current.style.display = "none";

      let isStarted = false;
      const scanner = new win.Html5Qrcode("qr-reader-fallback");

      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (text: string) => {
            handleDetected(text);
            isStarted = false;
            scanner.stop().catch(() => {});
          },
          () => {}
        );
        isStarted = true;
        if (isMounted) setLoading(false);
      } catch {
        if (isMounted) setError("Gagal membuka kamera. Cuba reload halaman.");
      }

      (streamRef as unknown as { _html5Cleanup?: () => void })._html5Cleanup = () => {
        if (isStarted) scanner.stop().catch(() => {}).finally(() => scanner.clear());
        else scanner.clear();
      };
    }

    void startCamera();

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      const cleanup = (streamRef as unknown as { _html5Cleanup?: () => void })._html5Cleanup;
      if (cleanup) cleanup();
    };
  }, [handleDetected, isIOS]);

  async function toggleTorch() {
    if (!torchSupported) return;
    try {
      const videoTrack = streamRef.current?.getVideoTracks()[0];
      if (!videoTrack) return;
      await videoTrack.applyConstraints({
        advanced: [{ torch: !torchOn } as MediaTrackConstraintSet],
      });
      setTorchOn(!torchOn);
    } catch {
      // silent
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="relative z-10 flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-sm">
        <button
          onClick={onClose}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 active:bg-white/20 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M15 5L5 15M5 5l10 10" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-white">Scan Cup Label</span>
        {torchSupported && !isIOS ? (
          <button
            onClick={toggleTorch}
            className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors ${
              torchOn ? "bg-yellow-400/30" : "bg-white/10"
            } active:bg-white/20`}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M10 2v1m0 14v1m8-8h-1M3 10H2m14.07-5.07-.71.71M4.64 15.36l-.71.71m12.14 0-.71-.71M4.64 4.64l-.71-.71"
                stroke={torchOn ? "#FBBF24" : "white"}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx="10" cy="10" r="3" stroke={torchOn ? "#FBBF24" : "white"} strokeWidth="1.5" />
            </svg>
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="text-sm text-white/60">Membuka kamera...</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black px-8">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-sm text-white/80 text-center leading-relaxed">{error}</p>
            <button
              onClick={onClose}
              className="mt-2 rounded-lg bg-white/10 px-6 py-2.5 text-sm font-medium text-white active:bg-white/20"
            >
              Kembali
            </button>
          </div>
        )}

        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />

        <div
          id="qr-reader-fallback"
          className="absolute inset-0 w-full h-full [&>video]:!w-full [&>video]:!h-full [&>video]:!object-cover"
        />

        {!error && !loading && (
          <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative w-56 h-56">
              <div className="absolute inset-0" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.4)" }} />
              <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-white rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-white rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-white rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-white rounded-br-lg" />
              <div className="absolute left-2 right-2 h-0.5 bg-[#7F1D1D] animate-scan-line rounded-full shadow-[0_0_8px_rgba(127,29,29,0.6)]" />
            </div>
            <div className="absolute bottom-24 left-0 right-0 text-center">
              <p className="text-sm text-white/70">Arahkan kamera ke QR code pada cup label</p>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scan-line {
          0%, 100% { top: 8px; opacity: 0.3; }
          50% { top: calc(100% - 10px); opacity: 1; }
        }
        .animate-scan-line { animation: scan-line 2.5s ease-in-out infinite; }
        #qr-reader-fallback__dashboard,
        #qr-reader-fallback__status_span,
        #qr-reader-fallback__header_message,
        #qr-reader-fallback > div:last-child { display: none !important; }
        #qr-reader-fallback { border: none !important; background: transparent !important; }
        #qr-reader-fallback video { border-radius: 0 !important; }
      `}</style>
    </div>
  );
}

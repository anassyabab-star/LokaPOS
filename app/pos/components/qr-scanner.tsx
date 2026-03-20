"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// Type for the html5-qrcode library loaded from CDN
type Html5QrcodeScanner = {
  start: (
    camera: { facingMode: string },
    config: { fps: number; qrbox: { width: number; height: number }; aspectRatio: number; disableFlip: boolean },
    onSuccess: (decodedText: string) => void,
    onFailure: () => void
  ) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
  getRunningTrackCameraCapabilities?: () => {
    torchFeature?: () => {
      isSupported?: () => boolean;
      enable: () => Promise<void>;
      disable: () => Promise<void>;
    };
  };
};

type WindowWithHtml5Qrcode = Window & typeof globalThis & {
  Html5Qrcode: new (elementId: string) => Html5QrcodeScanner;
};

type QrScannerProps = {
  onScan: (orderId: string) => void;
  onClose: () => void;
};

/**
 * Built-in QR scanner for POS app.
 * Uses html5-qrcode loaded from CDN to avoid adding npm dependency.
 * Scans QR codes from cup labels and extracts order ID.
 * Expected QR format: https://pos.lokacafe.my/pos?order=<uuid>
 */
export default function QrScanner({ onScan, onClose }: QrScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const hasScannedRef = useRef(false);

  // Extract order ID from QR data
  const extractOrderId = useCallback((data: string): string | null => {
    // Try URL format: .../pos?order=<uuid>
    try {
      const url = new URL(data);
      const orderId = url.searchParams.get("order");
      if (orderId) return orderId;
    } catch {
      // Not a URL — might be raw UUID
    }
    // Try raw UUID format
    const uuidMatch = data.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    if (uuidMatch) return uuidMatch[0];
    return null;
  }, []);

  useEffect(() => {
    let html5QrCode: Html5QrcodeScanner | null = null;
    let mounted = true;
    let isStarted = false;

    async function initScanner() {
      // Dynamically load html5-qrcode from CDN
      if (!(window as WindowWithHtml5Qrcode).Html5Qrcode) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src =
            "https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Gagal load scanner library"));
          document.head.appendChild(script);
        });
      }

      if (!mounted) return;

      const Html5Qrcode = (window as WindowWithHtml5Qrcode).Html5Qrcode;
      html5QrCode = new Html5Qrcode("qr-reader");
      scannerRef.current = html5QrCode;

      try {
        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 220, height: 220 },
            aspectRatio: 1,
            disableFlip: false,
          },
          (decodedText: string) => {
            if (hasScannedRef.current) return;
            const orderId = extractOrderId(decodedText);
            if (orderId) {
              hasScannedRef.current = true;
              isStarted = false;
              // Vibrate for haptic feedback
              if (navigator.vibrate) navigator.vibrate(100);
              // Stop scanner then callback
              void html5QrCode
                ?.stop()
                .catch(() => {})
                .finally(() => {
                  onScan(orderId);
                });
            }
          },
          () => {
            // QR code not detected in this frame — ignore
          }
        );
        isStarted = true;
        if (mounted) setLoading(false);
      } catch (err: unknown) {
        if (!mounted) return;
        setLoading(false);
        const error = err as { name?: string; message?: string };
        if (
          error?.name === "NotAllowedError" ||
          error?.message?.includes("NotAllowed")
        ) {
          setError("Kamera tidak dibenarkan. Sila beri kebenaran kamera dalam browser settings.");
        } else if (
          error?.name === "NotFoundError" ||
          error?.message?.includes("NotFound")
        ) {
          setError("Tiada kamera dijumpai pada peranti ini.");
        } else {
          setError(error?.message || "Gagal memulakan kamera.");
        }
      }
    }

    initScanner();

    return () => {
      mounted = false;
      if (html5QrCode && isStarted) {
        html5QrCode.stop().catch(() => {}).finally(() => {
          html5QrCode?.clear();
        });
      } else if (html5QrCode) {
        html5QrCode.clear();
      }
    };
  }, [extractOrderId, onScan]);

  // Toggle torch/flashlight
  async function toggleTorch() {
    try {
      const scanner = scannerRef.current;
      if (!scanner) return;
      const track = scanner
        .getRunningTrackCameraCapabilities?.()
        ?.torchFeature?.();
      if (track?.isSupported?.()) {
        if (torchOn) {
          await track.disable();
        } else {
          await track.enable();
        }
        setTorchOn(!torchOn);
      }
    } catch {
      // Torch not supported on this device
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      {/* Header */}
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
            <circle
              cx="10"
              cy="10"
              r="3"
              stroke={torchOn ? "#FBBF24" : "white"}
              strokeWidth="1.5"
            />
          </svg>
        </button>
      </div>

      {/* Camera viewfinder */}
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

        {/* QR reader container */}
        <div
          id="qr-reader"
          ref={containerRef}
          className="w-full h-full [&>video]:!w-full [&>video]:!h-full [&>video]:!object-cover"
          style={{ minHeight: "300px" }}
        />

        {/* Scanning frame overlay */}
        {!error && !loading && (
          <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
            {/* Dimmed corners */}
            <div className="absolute inset-0 bg-black/40" />
            {/* Clear center hole */}
            <div className="relative w-56 h-56">
              <div
                className="absolute inset-0"
                style={{
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.4)",
                }}
              />
              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-white rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-white rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-white rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-white rounded-br-lg" />
              {/* Scanning line animation */}
              <div className="absolute left-2 right-2 h-0.5 bg-[#7F1D1D] animate-scan-line rounded-full shadow-[0_0_8px_rgba(127,29,29,0.6)]" />
            </div>
            {/* Hint text */}
            <div className="absolute bottom-24 left-0 right-0 text-center">
              <p className="text-sm text-white/70">
                Arahkan kamera ke QR code pada cup label
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Scanning line animation keyframes */}
      <style>{`
        @keyframes scan-line {
          0%, 100% { top: 8px; opacity: 0.3; }
          50% { top: calc(100% - 10px); opacity: 1; }
        }
        .animate-scan-line {
          animation: scan-line 2.5s ease-in-out infinite;
        }
        /* Hide html5-qrcode default UI elements */
        #qr-reader__dashboard,
        #qr-reader__status_span,
        #qr-reader__header_message,
        #qr-reader > div:last-child {
          display: none !important;
        }
        #qr-reader {
          border: none !important;
          background: transparent !important;
        }
        #qr-reader video {
          border-radius: 0 !important;
        }
      `}</style>
    </div>
  );
}

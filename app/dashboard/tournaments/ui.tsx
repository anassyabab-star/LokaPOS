"use client";

import { useState, type ReactNode } from "react";

// Small admin primitives for the tournament pages (Tailwind; the dashboard's
// .theme-scope remaps gray/white utilities for light & dark).

export const inputCls =
  "w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20";
export const labelCls = "block text-xs font-semibold text-gray-600";
export const btnPrimary = "rounded-xl bg-[#7F1D1D] px-4 py-2 text-sm font-bold text-white hover:bg-[#6B1818] disabled:opacity-50";
export const btnGhost = "rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 disabled:opacity-50";
export const cardCls = "rounded-2xl border border-gray-100 bg-white p-4 shadow-sm";

const MYT = 8 * 60 * 60 * 1000;
/** ISO → value for <input type="datetime-local">, in Malaysia time. */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + MYT).toISOString().slice(0, 16);
}
/** <input type="datetime-local"> value (Malaysia time) → ISO. */
export function fromLocalInput(v: string) {
  return v ? new Date(`${v}:00+08:00`).toISOString() : null;
}

export async function api<T = Record<string, unknown>>(url: string, method = "GET", body?: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const res = await fetch(url, {
    method,
    cache: "no-store",
    headers: body !== undefined && !(body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="inline-flex items-center gap-2.5 disabled:opacity-50"
      aria-pressed={on}
    >
      <span className={`relative inline-block h-6 w-11 rounded-full transition ${on ? "bg-[#7F1D1D]" : "bg-gray-300"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
      {label && <span className="text-sm font-medium text-gray-700">{label}</span>}
    </button>
  );
}

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-xl leading-none text-gray-400" aria-label="Close">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-gray-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Bottom-sheet confirmation — never browser confirm(). */
export function ConfirmSheet({ open, title, message, confirmLabel = "Padam", danger = true, busy, onConfirm, onClose, children }: {
  open: boolean; title: string; message?: string; confirmLabel?: string; danger?: boolean; busy?: boolean;
  onConfirm: () => void; onClose: () => void; children?: ReactNode;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className={`${btnGhost} flex-1`}>Batal</button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${danger ? "bg-red-600 hover:bg-red-700" : "bg-[#7F1D1D] hover:bg-[#6B1818]"}`}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      }
    >
      {message && <p className="text-sm text-gray-600">{message}</p>}
      {children}
    </Sheet>
  );
}

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "green" | "amber" | "red" | "blue" | "maroon" }) {
  const map = {
    gray: "bg-gray-100 text-gray-500",
    green: "bg-green-100 text-green-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    blue: "bg-sky-100 text-sky-700",
    maroon: "bg-[#7F1D1D]/10 text-[#7F1D1D]",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${map[tone]}`}>{children}</span>;
}

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const r = await api<{ url: string }>("/api/admin/tournaments/upload", "POST", form);
  if (!r.ok) throw new Error(r.data.error || "Upload failed");
  return r.data.url;
}

export function ImageField({ label, value, onChange }: { label: string; value: string | null | undefined; onChange: (url: string | null) => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <span className={labelCls}>{label}</span>
      <div className="mt-1 flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-14 w-14 rounded-xl border border-gray-100 object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-gray-200 text-gray-400">—</div>
        )}
        <label className="cursor-pointer text-xs font-semibold text-[#7F1D1D]">
          {busy ? "Uploading…" : "Upload"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async e => {
              const f = e.target.files?.[0];
              if (!f) return;
              setErr(null); setBusy(true);
              try { onChange(await uploadImage(f)); } catch (x) { setErr(x instanceof Error ? x.message : "Upload failed"); } finally { setBusy(false); }
            }}
          />
        </label>
        {value && <button type="button" onClick={() => onChange(null)} className="text-xs text-gray-400">Buang</button>}
      </div>
      {err && <p className="mt-1 text-xs text-red-500">{err}</p>}
    </div>
  );
}

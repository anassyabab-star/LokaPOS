"use client";

import { ReactNode } from "react";

/* ━━━━━━━━━━━━━━━ Base Modal Shell ━━━━━━━━━━━━━━━ */
export function ModalShell({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md animate-slide-up rounded-t-2xl bg-white px-5 pb-6 pt-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle on mobile */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
        {children}
      </div>
    </div>
  );
}

export function ModalTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-lg font-semibold text-gray-900">{children}</h3>;
}

export function ModalSubtitle({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-sm text-gray-500">{children}</p>;
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex gap-3">{children}</div>;
}

export function ModalBtnSecondary({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100"
    >
      {children}
    </button>
  );
}

export function ModalBtnPrimary({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50 ${
        danger ? "bg-red-600 hover:bg-red-700" : "bg-[#7F1D1D] hover:bg-[#6B1818]"
      }`}
    >
      {children}
    </button>
  );
}

export function ModalInput({
  type = "text",
  value,
  onChange,
  placeholder,
}: {
  type?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20"
    />
  );
}

export function ModalTextArea({
  value,
  onChange,
  placeholder,
  rows = 2,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-[#7F1D1D] focus:ring-1 focus:ring-[#7F1D1D]/20"
    />
  );
}

export function InfoCard({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
      {children}
    </div>
  );
}

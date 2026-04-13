/**
 * Shared dashboard UI primitives.
 * All use --d-* CSS variables so they work in both light and dark mode.
 */

import React from "react";

/* ── Layout ─────────────────────────────────────────── */
export function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--d-bg)",
        padding: "28px 28px 40px",
        color: "var(--d-text-1)",
      }}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 24,
      }}
    >
      <div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--d-text-1)",
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h1>
        {desc && (
          <p style={{ fontSize: 13, color: "var(--d-text-3)", marginTop: 4 }}>
            {desc}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

/* ── Cards ───────────────────────────────────────────── */
export function Card({
  children,
  style = {},
  className = "",
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        background: "var(--d-surface)",
        border: "1px solid var(--d-border)",
        borderRadius: 14,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 16,
      }}
    >
      <div>
        <p
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--d-text-1)",
          }}
        >
          {title}
        </p>
        {desc && (
          <p style={{ fontSize: 12, color: "var(--d-text-3)", marginTop: 3 }}>
            {desc}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

/* ── Stats ───────────────────────────────────────────── */
export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card style={{ padding: "14px 16px" }}>
      <p
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: "var(--d-text-3)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: accent ?? "var(--d-text-1)",
          marginTop: 6,
          lineHeight: 1,
        }}
      >
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: 11, color: "var(--d-text-3)", marginTop: 4 }}>
          {sub}
        </p>
      )}
    </Card>
  );
}

export function MiniStat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        background: "var(--d-surface-hover)",
        border: "1px solid var(--d-border-soft)",
      }}
    >
      <p
        style={{
          fontSize: 10,
          color: "var(--d-text-3)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--d-text-1)",
          marginTop: 3,
        }}
      >
        {value}
      </p>
    </div>
  );
}

/* ── Buttons ─────────────────────────────────────────── */
export function PrimaryBtn({
  onClick,
  children,
  disabled,
  type = "button",
  style = {},
}: {
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  style?: React.CSSProperties;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "8px 18px",
        borderRadius: 9,
        fontSize: 13,
        fontWeight: 600,
        color: "#fff",
        background: disabled ? "var(--d-text-3)" : "var(--d-accent)",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "opacity 0.15s",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function GhostBtn({
  onClick,
  children,
  disabled,
  type = "button",
  style = {},
}: {
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  style?: React.CSSProperties;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "7px 14px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 500,
        color: "var(--d-text-2)",
        background: "transparent",
        border: "1px solid var(--d-border)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.15s",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ── Form controls ───────────────────────────────────── */
export function DInput(
  props: React.InputHTMLAttributes<HTMLInputElement>
) {
  const { style, ...rest } = props;
  return (
    <input
      {...rest}
      style={{
        width: "100%",
        padding: "9px 12px",
        borderRadius: 8,
        fontSize: 13,
        color: "var(--d-text-1)",
        background: "var(--d-input-bg)",
        border: "1px solid var(--d-border)",
        outline: "none",
        boxSizing: "border-box",
        ...style,
      }}
    />
  );
}

export function DSelect(
  props: React.SelectHTMLAttributes<HTMLSelectElement>
) {
  const { style, children, ...rest } = props;
  return (
    <select
      {...rest}
      style={{
        width: "100%",
        padding: "9px 12px",
        borderRadius: 8,
        fontSize: 13,
        color: "var(--d-text-1)",
        background: "var(--d-input-bg)",
        border: "1px solid var(--d-border)",
        outline: "none",
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </select>
  );
}

export function DTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  const { style, ...rest } = props;
  return (
    <textarea
      {...rest}
      style={{
        width: "100%",
        padding: "9px 12px",
        borderRadius: 8,
        fontSize: 13,
        color: "var(--d-text-1)",
        background: "var(--d-input-bg)",
        border: "1px solid var(--d-border)",
        outline: "none",
        resize: "vertical",
        boxSizing: "border-box",
        fontFamily: "inherit",
        ...style,
      }}
    />
  );
}

/* ── Alerts ──────────────────────────────────────────── */
export function Alert({
  type,
  children,
}: {
  type: "error" | "success" | "info" | "warning";
  children: React.ReactNode;
}) {
  const colors = {
    error:   { color: "var(--d-error)",   bg: "var(--d-error-soft)",   border: "var(--d-error)" },
    success: { color: "var(--d-success)", bg: "var(--d-success-soft)", border: "var(--d-success)" },
    info:    { color: "var(--d-info)",    bg: "var(--d-info-soft)",    border: "var(--d-info)" },
    warning: { color: "var(--d-warning)", bg: "var(--d-warning-soft)", border: "var(--d-warning)" },
  }[type];
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        fontSize: 13,
        color: colors.color,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
      }}
    >
      {children}
    </div>
  );
}

/* ── Badge ───────────────────────────────────────────── */
export function Badge({
  children,
  color,
  bg,
}: {
  children: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        color,
        background: bg,
      }}
    >
      {children}
    </span>
  );
}

/* ── Skeleton loader ─────────────────────────────────── */
export function Skeleton({ height = 80 }: { height?: number }) {
  return (
    <div
      style={{
        height,
        borderRadius: 12,
        background: "var(--d-surface)",
        border: "1px solid var(--d-border)",
        opacity: 0.6,
        animation: "pulse 1.5s ease-in-out infinite",
      }}
    />
  );
}

/* ── Empty state ─────────────────────────────────────── */
export function Empty({
  title,
  desc,
}: {
  title: string;
  desc?: string;
}) {
  return (
    <Card style={{ padding: "40px 20px", textAlign: "center" }}>
      <p style={{ fontSize: 14, color: "var(--d-text-2)", fontWeight: 500 }}>
        {title}
      </p>
      {desc && (
        <p style={{ fontSize: 12, color: "var(--d-text-3)", marginTop: 4 }}>
          {desc}
        </p>
      )}
    </Card>
  );
}

/* ── Error screen ────────────────────────────────────── */
export function ErrorScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 24,
      }}
    >
      <p style={{ fontSize: 13, color: "var(--d-error)" }}>{message}</p>
      {onRetry && (
        <GhostBtn onClick={onRetry}>Cuba semula</GhostBtn>
      )}
    </div>
  );
}

/* ── Section divider label ───────────────────────────── */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: "var(--d-text-3)",
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        marginBottom: 10,
      }}
    >
      {children}
    </p>
  );
}

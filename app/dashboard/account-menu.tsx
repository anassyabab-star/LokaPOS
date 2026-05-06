"use client";

import ThemeToggle from "@/components/theme-toggle";
import { useState } from "react";

export default function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen(p => !p)}
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            color: "var(--d-text-2)",
            background: open ? "var(--d-surface-hover)" : "transparent",
            border: "1px solid var(--d-border)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            transition: "background 0.15s",
          }}
        >
          <span>Account</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {open && (
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 10,
                background: "transparent",
                border: "none",
                cursor: "default",
              }}
              aria-label="Close menu"
            />
            <div
              style={{
                position: "absolute",
                bottom: "calc(100% + 6px)",
                left: 0,
                right: 0,
                zIndex: 20,
                background: "var(--d-surface)",
                border: "1px solid var(--d-border)",
                borderRadius: 12,
                padding: 8,
                boxShadow: "var(--d-shadow-md)",
              }}
            >
              <div style={{ padding: "2px 4px 6px", borderBottom: "1px solid var(--d-border)", marginBottom: 4 }}>
                <ThemeToggle className="w-full text-left" />
              </div>
              <a
                href="/pos"
                onClick={() => setOpen(false)}
                style={{
                  display: "block",
                  padding: "7px 10px",
                  borderRadius: 7,
                  fontSize: 13,
                  color: "var(--d-text-2)",
                  textDecoration: "none",
                  transition: "background 0.1s",
                }}
              >
                Open POS
              </a>
              <button
                type="button"
                onClick={() => { setOpen(false); setConfirmOpen(true); }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "7px 10px",
                  borderRadius: 7,
                  fontSize: 13,
                  color: "var(--d-error)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  transition: "background 0.1s",
                }}
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>

      {confirmOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            background: "rgba(0,0,0,0.5)",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 380,
              background: "var(--d-surface)",
              border: "1px solid var(--d-border)",
              borderRadius: 18,
              padding: 20,
              boxShadow: "var(--d-shadow-md)",
              marginBottom: 8,
            }}
          >
            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--d-text-1)" }}>
              Sign out account?
            </p>
            <p style={{ fontSize: 13, color: "var(--d-text-3)", marginTop: 6 }}>
              Anda akan keluar dari Admin Console pada peranti ini.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  borderRadius: 9,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--d-text-2)",
                  background: "transparent",
                  border: "1px solid var(--d-border)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <a
                href="/auth/logout?next=/staff/login"
                style={{
                  flex: 1,
                  padding: "9px 0",
                  borderRadius: 9,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#fff",
                  background: "var(--d-accent)",
                  textAlign: "center",
                  textDecoration: "none",
                  display: "block",
                }}
              >
                Yes, Sign out
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

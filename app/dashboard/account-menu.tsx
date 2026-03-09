"use client";

import { useState } from "react";

export default function AccountMenu() {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <details className="relative">
        <summary className="list-none cursor-pointer rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500 hover:text-white">
          Account
        </summary>
        <div className="absolute right-0 z-20 mt-2 w-44 rounded-lg border border-gray-800 bg-[#111] p-1.5 shadow-xl">
          <a
            href="/pos"
            className="block rounded-md px-3 py-2 text-sm text-gray-200 hover:bg-[#1b1b1b]"
          >
            Open POS
          </a>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="block w-full rounded-md px-3 py-2 text-left text-sm text-red-300 hover:bg-[#1b1b1b]"
          >
            Sign out
          </button>
        </div>
      </details>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 md:items-center">
          <div className="w-full max-w-sm rounded-xl border border-gray-800 bg-[#111] p-4 text-gray-200 shadow-xl">
            <h3 className="text-base font-semibold">Sign out account?</h3>
            <p className="mt-1 text-sm text-gray-400">
              Anda akan keluar dari Admin Console pada peranti ini.
            </p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex-1 rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-[#1b1b1b]"
              >
                Cancel
              </button>
              <a
                href="/auth/logout?next=/login"
                className="flex-1 rounded-md bg-[#7F1D1D] px-3 py-2 text-center text-sm font-medium text-white hover:opacity-95"
              >
                Yes, Sign out
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

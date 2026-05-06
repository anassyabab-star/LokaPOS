"use client";

import { useTheme } from "@/components/theme-provider";

type ThemeToggleProps = {
  className?: string;
};

export default function ThemeToggle({ className = "" }: ThemeToggleProps) {
  const { theme, toggleTheme, mounted } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={[
        "rounded-md border border-gray-700 px-3 py-1.5 text-xs transition",
        "text-gray-300 hover:border-gray-500",
        className,
      ].join(" ")}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={mounted ? `Switch to ${isDark ? "Light" : "Dark"} mode` : "Theme"}
    >
      {mounted ? (isDark ? "Light Mode" : "Dark Mode") : "Theme"}
    </button>
  );
}

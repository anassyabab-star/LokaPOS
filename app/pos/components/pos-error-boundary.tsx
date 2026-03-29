"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

export class PosErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("POS Error Boundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-4xl">
            ⚠️
          </div>
          <h1 className="mt-5 text-xl font-bold text-gray-900">
            Ralat POS
          </h1>
          <p className="mt-2 max-w-sm text-sm text-gray-500">
            Sesuatu tak kena berlaku. Sila reload halaman ini.
          </p>
          {this.state.error && (
            <pre className="mt-4 max-w-md overflow-auto rounded-lg bg-gray-100 p-3 text-left text-xs text-gray-600">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            className="mt-6 rounded-full bg-[#7F1D1D] px-8 py-3 text-sm font-semibold text-white active:bg-[#6B1818]"
          >
            Reload POS
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

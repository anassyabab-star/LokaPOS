"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ExpenseRow = {
  id: string;
  expense_date: string;
  amount: number;
  category:
    | "inventory"
    | "equipment"
    | "utilities"
    | "rent"
    | "salary"
    | "maintenance"
    | "marketing"
    | "other";
  description: string;
  vendor_name: string | null;
  payment_method: "cash_drawer" | "bank_transfer" | "card" | "online" | "other";
  invoice_number: string | null;
  invoice_url: string | null;
  invoice_file_name: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  created_by_name: string | null;
  created_by_email: string | null;
};

type Summary = {
  month: string;
  total_records: number;
  month_expenses_total: number;
  month_paid_out_total: number;
  month_total_outflow: number;
  by_category: Record<string, number>;
};

const CATEGORY_OPTIONS = [
  { value: "inventory", label: "Inventory / Ingredients" },
  { value: "equipment", label: "Equipment" },
  { value: "utilities", label: "Utilities" },
  { value: "rent", label: "Rent" },
  { value: "salary", label: "Salary" },
  { value: "maintenance", label: "Maintenance" },
  { value: "marketing", label: "Marketing" },
  { value: "other", label: "Other" },
] as const;

const PAYMENT_OPTIONS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "card", label: "Card" },
  { value: "online", label: "Online" },
  { value: "cash_drawer", label: "Cash Drawer (careful: avoid double count with Paid Out)" },
  { value: "other", label: "Other" },
] as const;

const EMPTY_SUMMARY: Summary = {
  month: "",
  total_records: 0,
  month_expenses_total: 0,
  month_paid_out_total: 0,
  month_total_outflow: 0,
  by_category: {},
};

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function currentDate() {
  return new Date().toISOString().slice(0, 10);
}

function categoryLabel(value: string) {
  return CATEGORY_OPTIONS.find(item => item.value === value)?.label || value;
}

function paymentLabel(value: string) {
  return PAYMENT_OPTIONS.find(item => item.value === value)?.label || value;
}

function detectInvoiceType(row: ExpenseRow) {
  const source = `${String(row.invoice_file_name || "")} ${String(row.invoice_url || "")}`.toLowerCase();
  if (source.includes(".pdf")) return "pdf";
  if (/\.(jpg|jpeg|png|webp|gif|heic|heif)\b/.test(source)) return "image";
  return "unknown";
}

export default function ExpensesPage() {
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [month, setMonth] = useState(currentMonth());
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");

  const [expenseDate, setExpenseDate] = useState(currentDate());
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("inventory");
  const [description, setDescription] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceUrl, setInvoiceUrl] = useState("");
  const [invoiceFileName, setInvoiceFileName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [showAddExpenseForm, setShowAddExpenseForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("month", month);
      params.set("category", categoryFilter);
      params.set("payment_method", paymentFilter);
      if (q.trim()) params.set("q", q.trim());

      const res = await fetch(`/api/admin/expenses?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load expenses");

      setRows((data.expenses || []) as ExpenseRow[]);
      setSummary((data.summary || EMPTY_SUMMARY) as Summary);
    } catch (e) {
      setRows([]);
      setSummary(EMPTY_SUMMARY);
      setError(e instanceof Error ? e.message : "Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, month, paymentFilter, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const categorySummary = useMemo(() => {
    return Object.entries(summary.by_category || {}).sort((a, b) => b[1] - a[1]);
  }, [summary.by_category]);

  async function uploadInvoice() {
    if (!invoiceFile) {
      setError("Choose invoice image/PDF first");
      return;
    }

    setUploadingInvoice(true);
    setError(null);
    setInfo(null);
    try {
      const form = new FormData();
      form.append("file", invoiceFile);

      const res = await fetch("/api/admin/expenses/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to upload invoice");

      setInvoiceUrl(String(data.file_url || ""));
      setInvoiceFileName(String(data.file_name || invoiceFile.name));
      setInfo("Invoice uploaded to Supabase Storage.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload invoice");
    } finally {
      setUploadingInvoice(false);
    }
  }

  async function submitExpense() {
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/admin/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expense_date: expenseDate,
          amount: Number(amount || 0),
          category,
          description,
          vendor_name: vendorName || null,
          payment_method: paymentMethod,
          invoice_number: invoiceNumber || null,
          invoice_url: invoiceUrl || null,
          invoice_file_name: invoiceFileName || null,
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save expense");

      setAmount("");
      setDescription("");
      setVendorName("");
      setInvoiceNumber("");
      setInvoiceUrl("");
      setInvoiceFileName("");
      setNotes("");
      setInvoiceFile(null);
      setInfo("Expense saved.");
      setShowAddExpenseForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save expense");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-black p-4 text-gray-200 md:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Expenses</h1>
        <p className="mt-1 text-sm text-gray-400">
          Rekod semua belian/peralatan kedai + bukti invoice untuk semak outflow bulanan.
        </p>
      </div>

      <div className="-mx-1 mb-4 flex snap-x gap-3 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
        <Stat label={`Expenses (${summary.month || month})`} value={`RM ${summary.month_expenses_total.toFixed(2)}`} />
        <Stat label={`Paid Out (${summary.month || month})`} value={`RM ${summary.month_paid_out_total.toFixed(2)}`} color="text-amber-300" />
        <Stat label="Total Outflow (Month)" value={`RM ${summary.month_total_outflow.toFixed(2)}`} color="text-red-300" />
        <Stat label="Records" value={summary.total_records} />
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-red-900 bg-red-950/20 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {info ? (
        <div className="mb-4 rounded-md border border-green-900 bg-green-950/20 px-3 py-2 text-sm text-green-300">
          {info}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-800 bg-[#111] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Add Expense</h2>
              <p className="mt-1 text-xs text-gray-500">Isi perbelanjaan untuk kiraan P/L.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddExpenseForm(prev => !prev)}
              className="rounded-md border border-gray-700 bg-black px-3 py-2 text-xs text-gray-200 hover:border-gray-500"
            >
              {showAddExpenseForm ? "Close" : "New Expense"}
            </button>
          </div>

          {showAddExpenseForm ? (
            <>
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                <input
                  type="date"
                  value={expenseDate}
                  onChange={e => setExpenseDate(e.target.value)}
                  className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm outline-none focus:border-[#7F1D1D]"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="Amount (RM)"
                  className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm outline-none focus:border-[#7F1D1D]"
                />
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm outline-none focus:border-[#7F1D1D]"
                >
                  {CATEGORY_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm outline-none focus:border-[#7F1D1D]"
                >
                  {PAYMENT_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  value={vendorName}
                  onChange={e => setVendorName(e.target.value)}
                  placeholder="Vendor / Shop name"
                  className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm outline-none focus:border-[#7F1D1D]"
                />
                <input
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                  placeholder="Invoice number"
                  className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm outline-none focus:border-[#7F1D1D]"
                />
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Description"
                  className="md:col-span-2 rounded-md border border-gray-700 bg-black px-3 py-2 text-sm outline-none focus:border-[#7F1D1D]"
                />
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  rows={2}
                  className="md:col-span-2 rounded-md border border-gray-700 bg-black px-3 py-2 text-sm outline-none focus:border-[#7F1D1D]"
                />
              </div>

              <div className="mt-3 rounded-lg border border-gray-800 bg-black/30 p-3">
                <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Invoice Upload</p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={e => setInvoiceFile(e.target.files?.[0] || null)}
                    className="rounded-md border border-gray-700 bg-black px-3 py-2 text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void uploadInvoice()}
                    disabled={uploadingInvoice || !invoiceFile}
                    className="rounded-md border border-gray-700 bg-black px-3 py-2 text-xs text-gray-200 hover:border-gray-500 disabled:opacity-60"
                  >
                    {uploadingInvoice ? "Uploading..." : "Upload Invoice"}
                  </button>
                </div>

                <input
                  value={invoiceUrl}
                  onChange={e => setInvoiceUrl(e.target.value)}
                  placeholder="Or paste invoice URL manually"
                  className="mt-2 w-full rounded-md border border-gray-700 bg-black px-3 py-2 text-sm outline-none focus:border-[#7F1D1D]"
                />

                {invoiceFileName ? (
                  <p className="mt-2 text-xs text-green-300">Uploaded: {invoiceFileName}</p>
                ) : null}

                {invoiceUrl ? (
                  <a
                    href={invoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-blue-300 hover:underline"
                  >
                    Open invoice link
                  </a>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => void submitExpense()}
                disabled={submitting}
                className="mt-3 rounded-md bg-[#7F1D1D] px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60"
              >
                {submitting ? "Saving..." : "Save Expense"}
              </button>
            </>
          ) : (
            <div className="mt-3 rounded-md border border-gray-800 bg-black/30 px-3 py-3 text-xs text-gray-400">
              Form tersembunyi. Tekan <span className="text-gray-200">New Expense</span> bila ada pembelian.
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-800 bg-[#111] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Monthly Breakdown</h2>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500"
            >
              Refresh
            </button>
          </div>

          <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm outline-none focus:border-[#7F1D1D]"
            />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search description/vendor"
              className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm outline-none focus:border-[#7F1D1D]"
            />
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm outline-none focus:border-[#7F1D1D]"
            >
              <option value="all">All category</option>
              {CATEGORY_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={paymentFilter}
              onChange={e => setPaymentFilter(e.target.value)}
              className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm outline-none focus:border-[#7F1D1D]"
            >
              <option value="all">All payment</option>
              {PAYMENT_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-lg border border-gray-800 bg-black/30 p-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">By Category</p>
            {categorySummary.length === 0 ? (
              <p className="text-xs text-gray-500">No category data.</p>
            ) : (
              <div className="space-y-2">
                {categorySummary.map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">{categoryLabel(key)}</span>
                    <span className="font-medium text-white">RM {Number(value || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-gray-800 bg-[#111] p-4">
        <h2 className="text-lg font-semibold text-white">Expense Records</h2>

        {loading ? (
          <div className="mt-3 rounded-md border border-gray-800 bg-black/30 px-3 py-4 text-sm text-gray-400">
            Loading expenses...
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-3 rounded-md border border-gray-800 bg-black/30 px-3 py-4 text-sm text-gray-400">
            No expense records for selected filter.
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {rows.map(row => (
              <div key={row.id} className="rounded-lg border border-gray-800 bg-black/30 p-3">
                {(() => {
                  const invoiceType = detectInvoiceType(row);

                  return (
                    <>
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{row.description}</p>
                    <p className="text-xs text-gray-400">
                      {row.expense_date} • {categoryLabel(row.category)} • {paymentLabel(row.payment_method)}
                    </p>
                    {row.vendor_name ? (
                      <p className="text-xs text-gray-500">Vendor: {row.vendor_name}</p>
                    ) : null}
                    {row.invoice_number ? (
                      <p className="text-xs text-gray-500">Invoice: {row.invoice_number}</p>
                    ) : null}
                    <p className="text-xs text-gray-500">
                      By: {row.created_by_name || "-"}{" "}
                      {row.created_by_email ? `(${row.created_by_email})` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Amount</p>
                    <p className="text-lg font-semibold text-red-300">RM {Number(row.amount || 0).toFixed(2)}</p>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[130px_1fr]">
                  <div className="h-24 overflow-hidden rounded-md border border-gray-800 bg-black">
                    {row.invoice_url ? (
                      invoiceType === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.invoice_url}
                          alt={row.invoice_file_name || "Invoice preview"}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : invoiceType === "pdf" ? (
                        <iframe
                          src={`${row.invoice_url}#toolbar=0&navpanes=0&scrollbar=0`}
                          title={`Invoice PDF ${row.id}`}
                          className="h-full w-full"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-gray-500">
                          Preview not available
                        </div>
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-gray-600">
                        No invoice proof
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-start gap-3 text-xs">
                    {row.invoice_url ? (
                      <a
                        href={row.invoice_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-300 hover:underline"
                      >
                        Open invoice proof
                      </a>
                    ) : (
                      <span className="text-gray-600">No invoice link</span>
                    )}
                    {row.invoice_file_name ? <span className="text-gray-500">{row.invoice_file_name}</span> : null}
                  </div>
                </div>

                {row.notes ? (
                  <p className="mt-2 rounded-md border border-gray-800 bg-[#111] px-2 py-1.5 text-xs text-gray-400">
                    {row.notes}
                  </p>
                ) : null}
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  color = "text-white",
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className="min-w-[170px] rounded-xl border border-gray-800 bg-[#111] p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

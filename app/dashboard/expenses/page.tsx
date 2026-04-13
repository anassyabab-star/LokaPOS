"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ExpenseRow = {
  id: string;
  expense_date: string;
  amount: number;
  category: "inventory" | "equipment" | "utilities" | "rent" | "salary" | "maintenance" | "marketing" | "other";
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
  month: "", total_records: 0, month_expenses_total: 0,
  month_paid_out_total: 0, month_total_outflow: 0, by_category: {},
};

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function currentDate() { return new Date().toISOString().slice(0, 10); }

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

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  fontSize: 13,
  color: "var(--d-text-1)",
  background: "var(--d-input-bg)",
  border: "1px solid var(--d-border)",
  outline: "none",
  boxSizing: "border-box",
};

function MiniStatCard({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div style={{ minWidth: 160, background: "var(--d-surface)", border: "1px solid var(--d-border)", borderRadius: 12, padding: "12px 14px" }}>
      <p style={{ fontSize: 10, fontWeight: 500, color: "var(--d-text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 700, color: accent ?? "var(--d-text-1)", marginTop: 4, lineHeight: 1 }}>{value}</p>
    </div>
  );
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
    setLoading(true); setError(null);
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
      setRows([]); setSummary(EMPTY_SUMMARY);
      setError(e instanceof Error ? e.message : "Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, month, paymentFilter, q]);

  useEffect(() => { void load(); }, [load]);

  const categorySummary = useMemo(() => {
    return Object.entries(summary.by_category || {}).sort((a, b) => b[1] - a[1]);
  }, [summary.by_category]);

  async function uploadInvoice() {
    if (!invoiceFile) { setError("Choose invoice image/PDF first"); return; }
    setUploadingInvoice(true); setError(null); setInfo(null);
    try {
      const form = new FormData();
      form.append("file", invoiceFile);
      const res = await fetch("/api/admin/expenses/upload", { method: "POST", body: form });
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
    setSubmitting(true); setError(null); setInfo(null);
    try {
      const res = await fetch("/api/admin/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expense_date: expenseDate, amount: Number(amount || 0), category, description,
          vendor_name: vendorName || null, payment_method: paymentMethod,
          invoice_number: invoiceNumber || null, invoice_url: invoiceUrl || null,
          invoice_file_name: invoiceFileName || null, notes: notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save expense");
      setAmount(""); setDescription(""); setVendorName(""); setInvoiceNumber("");
      setInvoiceUrl(""); setInvoiceFileName(""); setNotes(""); setInvoiceFile(null);
      setInfo("Expense saved."); setShowAddExpenseForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save expense");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--d-bg)", padding: "28px 28px 40px", color: "var(--d-text-1)" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Expenses</h1>
        <p style={{ fontSize: 13, color: "var(--d-text-3)", marginTop: 4 }}>
          Rekod semua belian/peralatan kedai + bukti invoice untuk semak outflow bulanan.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <MiniStatCard label={`Expenses (${summary.month || month})`} value={`RM ${summary.month_expenses_total.toFixed(2)}`} />
        <MiniStatCard label={`Paid Out (${summary.month || month})`} value={`RM ${summary.month_paid_out_total.toFixed(2)}`} accent="var(--d-warning)" />
        <MiniStatCard label="Total Outflow (Month)" value={`RM ${summary.month_total_outflow.toFixed(2)}`} accent="var(--d-error)" />
        <MiniStatCard label="Records" value={summary.total_records} />
      </div>

      {error && (
        <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, fontSize: 13, color: "var(--d-error)", background: "var(--d-error-soft)", border: "1px solid var(--d-error)" }}>
          {error}
        </div>
      )}
      {info && (
        <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, fontSize: 13, color: "var(--d-success)", background: "var(--d-success-soft)", border: "1px solid var(--d-success)" }}>
          {info}
        </div>
      )}

      {/* Two-column layout: Add Expense + Monthly Breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Add Expense */}
        <div style={{ background: "var(--d-surface)", border: "1px solid var(--d-border)", borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: showAddExpenseForm ? 14 : 0 }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700 }}>Add Expense</p>
              <p style={{ fontSize: 12, color: "var(--d-text-3)", marginTop: 3 }}>Isi perbelanjaan untuk kiraan P/L.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddExpenseForm(prev => !prev)}
              style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, color: "var(--d-text-2)", background: "transparent", border: "1px solid var(--d-border)", cursor: "pointer", whiteSpace: "nowrap" }}
            >
              {showAddExpenseForm ? "Close" : "New Expense"}
            </button>
          </div>

          {showAddExpenseForm ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} style={inputStyle} />
                <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (RM)" style={inputStyle} />
                <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
                  {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={inputStyle}>
                  {PAYMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="Vendor / Shop name" style={inputStyle} />
                <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="Invoice number" style={inputStyle} />
                <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" style={{ ...inputStyle, gridColumn: "span 2" }} />
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2}
                  style={{ ...inputStyle, gridColumn: "span 2", resize: "vertical", fontFamily: "inherit" }} />
              </div>

              {/* Invoice upload */}
              <div style={{ background: "var(--d-surface-hover)", border: "1px solid var(--d-border-soft)", borderRadius: 10, padding: "12px 14px", marginTop: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: "var(--d-text-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Invoice Upload</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                  <input type="file" accept="image/*,application/pdf" onChange={e => setInvoiceFile(e.target.files?.[0] || null)} style={{ ...inputStyle, fontSize: 12 }} />
                  <button
                    type="button"
                    onClick={() => void uploadInvoice()}
                    disabled={uploadingInvoice || !invoiceFile}
                    style={{ padding: "9px 14px", borderRadius: 8, fontSize: 12, color: "var(--d-text-2)", background: "transparent", border: "1px solid var(--d-border)", cursor: "pointer", opacity: uploadingInvoice || !invoiceFile ? 0.6 : 1, whiteSpace: "nowrap" }}
                  >
                    {uploadingInvoice ? "Uploading..." : "Upload"}
                  </button>
                </div>
                <input value={invoiceUrl} onChange={e => setInvoiceUrl(e.target.value)} placeholder="Or paste invoice URL manually" style={{ ...inputStyle, marginTop: 8 }} />
                {invoiceFileName && <p style={{ marginTop: 6, fontSize: 12, color: "var(--d-success)" }}>Uploaded: {invoiceFileName}</p>}
                {invoiceUrl && <a href={invoiceUrl} target="_blank" rel="noreferrer" style={{ marginTop: 4, display: "inline-block", fontSize: 12, color: "var(--d-info)" }}>Open invoice link</a>}
              </div>

              <button
                type="button"
                onClick={() => void submitExpense()}
                disabled={submitting}
                style={{ marginTop: 12, padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#fff", background: "var(--d-accent)", border: "none", cursor: "pointer", opacity: submitting ? 0.6 : 1 }}
              >
                {submitting ? "Saving..." : "Save Expense"}
              </button>
            </>
          ) : (
            <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, border: "1px solid var(--d-border-soft)", background: "var(--d-surface-hover)", fontSize: 12, color: "var(--d-text-3)" }}>
              Form tersembunyi. Tekan <span style={{ color: "var(--d-text-1)" }}>New Expense</span> bila ada pembelian.
            </div>
          )}
        </div>

        {/* Monthly Breakdown */}
        <div style={{ background: "var(--d-surface)", border: "1px solid var(--d-border)", borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <p style={{ fontSize: 15, fontWeight: 700 }}>Monthly Breakdown</p>
            <button type="button" onClick={() => void load()} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, color: "var(--d-text-2)", background: "transparent", border: "1px solid var(--d-border)", cursor: "pointer" }}>
              Refresh
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={inputStyle} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search description/vendor" style={inputStyle} />
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={inputStyle}>
              <option value="all">All category</option>
              {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} style={inputStyle}>
              <option value="all">All payment</option>
              {PAYMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div style={{ background: "var(--d-surface-hover)", border: "1px solid var(--d-border-soft)", borderRadius: 10, padding: "12px 14px" }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: "var(--d-text-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>By Category</p>
            {categorySummary.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--d-text-3)" }}>No category data.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {categorySummary.map(([key, value]) => (
                  <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                    <span style={{ color: "var(--d-text-2)" }}>{categoryLabel(key)}</span>
                    <span style={{ fontWeight: 600, color: "var(--d-text-1)" }}>RM {Number(value || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expense Records */}
      <div style={{ background: "var(--d-surface)", border: "1px solid var(--d-border)", borderRadius: 14, padding: "16px 18px" }}>
        <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Expense Records</p>

        {loading ? (
          <div style={{ padding: "16px 0", fontSize: 13, color: "var(--d-text-3)" }}>Loading expenses...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: "20px 0", textAlign: "center", fontSize: 14, color: "var(--d-text-2)" }}>No expense records for selected filter.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map(row => {
              const invoiceType = detectInvoiceType(row);
              return (
                <div key={row.id} style={{ background: "var(--d-surface-hover)", border: "1px solid var(--d-border-soft)", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: "var(--d-text-1)" }}>{row.description}</p>
                      <p style={{ fontSize: 12, color: "var(--d-text-3)", marginTop: 3 }}>
                        {row.expense_date} · {categoryLabel(row.category)} · {paymentLabel(row.payment_method)}
                      </p>
                      {row.vendor_name && <p style={{ fontSize: 12, color: "var(--d-text-3)" }}>Vendor: {row.vendor_name}</p>}
                      {row.invoice_number && <p style={{ fontSize: 12, color: "var(--d-text-3)" }}>Invoice: {row.invoice_number}</p>}
                      <p style={{ fontSize: 12, color: "var(--d-text-3)" }}>
                        By: {row.created_by_name || "—"} {row.created_by_email ? `(${row.created_by_email})` : ""}
                      </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: 11, color: "var(--d-text-3)" }}>Amount</p>
                      <p style={{ fontSize: 18, fontWeight: 700, color: "var(--d-error)" }}>RM {Number(row.amount || 0).toFixed(2)}</p>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 10, marginTop: 10 }}>
                    <div style={{ height: 96, overflow: "hidden", borderRadius: 8, border: "1px solid var(--d-border)", background: "var(--d-surface)" }}>
                      {row.invoice_url ? (
                        invoiceType === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={row.invoice_url} alt={row.invoice_file_name || "Invoice"} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : invoiceType === "pdf" ? (
                          <iframe src={`${row.invoice_url}#toolbar=0&navpanes=0&scrollbar=0`} title={`Invoice PDF ${row.id}`} style={{ width: "100%", height: "100%", border: "none" }} />
                        ) : (
                          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--d-text-3)", textAlign: "center", padding: 8 }}>
                            Preview not available
                          </div>
                        )
                      ) : (
                        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--d-text-3)", textAlign: "center", padding: 8 }}>
                          No invoice proof
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 8, fontSize: 12 }}>
                      {row.invoice_url ? (
                        <a href={row.invoice_url} target="_blank" rel="noreferrer" style={{ color: "var(--d-info)" }}>Open invoice proof</a>
                      ) : (
                        <span style={{ color: "var(--d-text-3)" }}>No invoice link</span>
                      )}
                      {row.invoice_file_name && <span style={{ color: "var(--d-text-3)" }}>{row.invoice_file_name}</span>}
                    </div>
                  </div>

                  {row.notes && (
                    <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--d-border)", background: "var(--d-surface)", fontSize: 12, color: "var(--d-text-3)" }}>
                      {row.notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

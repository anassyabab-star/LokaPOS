"use client";

import { useEffect, useState } from "react";

/* ── Types ─────────────────────────────────────── */
type ClockRecord = {
  id: string;
  clock_in_at: string;
  clock_out_at: string;
  duration_minutes: number;
  notes: string | null;
  hours: number;
  salary: number;
};

type StaffRow = {
  user_id: string;
  name: string;
  email: string | null;
  hourly_rate: number;
  records: ClockRecord[];
  total_minutes: number;
  total_hours: number;
  total_salary: number;
};

type Profile = {
  user_id: string;
  name: string;
  email: string | null;
  hourly_rate: number;
  employment_type: string;
  is_active: boolean;
};

type StaffWithoutProfile = { user_id: string; name: string; email: string | null };

/* ── Helpers ────────────────────────────────────── */
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ms-MY", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur",
  });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ms-MY", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur",
  });
}
function fmtHours(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}j ${m}m` : `${m}m`;
}
function getMYTWeek() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }));
  const day = now.getDay(); // 0=Sun
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const mon = new Date(now); mon.setDate(now.getDate() + diffToMon);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(mon), to: fmt(sun) };
}
function getMYTMonth() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }));
  const y = now.getFullYear(); const m = now.getMonth();
  const from = new Date(y, m, 1).toISOString().slice(0, 10);
  const to = new Date(y, m + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

const card: React.CSSProperties = {
  background: "var(--d-surface)", border: "1px solid var(--d-border)",
  borderRadius: 12, padding: "16px 20px",
};
const inputStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, fontSize: 13,
  color: "var(--d-text-1)", background: "var(--d-input-bg)",
  border: "1px solid var(--d-border)", outline: "none", width: "100%",
};

/* ── Staff Profile Modal ────────────────────────── */
function ProfileModal({
  target,
  onClose,
  onSaved,
}: {
  target: (Profile & { isNew?: boolean }) | (StaffWithoutProfile & { isNew: true });
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = (target as { isNew?: boolean }).isNew === true;
  const existing = isNew ? null : (target as Profile);
  const [rate, setRate] = useState(existing ? String(existing.hourly_rate) : "");
  const [active, setActive] = useState(existing ? existing.is_active : true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    const r = Number(rate);
    if (!Number.isFinite(r) || r < 0) { setErr("Kadar tidak valid"); return; }
    setSaving(true); setErr(null);
    try {
      const res = await fetch("/api/admin/staff-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: target.user_id, hourly_rate: r, employment_type: "parttime", is_active: active }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data?.error || "Gagal simpan"); return; }
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "var(--d-surface)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400, border: "1px solid var(--d-border)" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--d-text-1)", marginBottom: 4 }}>
          {isNew ? "Tambah Profil" : "Edit Profil"}
        </div>
        <div style={{ fontSize: 13, color: "var(--d-text-2)", marginBottom: 20 }}>{target.name}</div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: "var(--d-text-2)", display: "block", marginBottom: 6 }}>Kadar sejam (RM)</label>
          <input
            type="number"
            min="0"
            step="0.50"
            value={rate}
            onChange={e => setRate(e.target.value)}
            placeholder="cth: 8.00"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <input type="checkbox" id="active-chk" checked={active} onChange={e => setActive(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--d-accent)" }} />
          <label htmlFor="active-chk" style={{ fontSize: 13, color: "var(--d-text-1)" }}>Aktif (boleh clock in)</label>
        </div>

        {err && <div style={{ fontSize: 12, color: "var(--d-error)", marginBottom: 12 }}>{err}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid var(--d-border)", background: "transparent", color: "var(--d-text-2)", fontSize: 13, cursor: "pointer" }}>
            Batal
          </button>
          <button onClick={() => void save()} disabled={saving} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: "var(--d-accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────── */
export default function TimesheetsPage() {
  // Date filter
  const week = getMYTWeek();
  const [dateFrom, setDateFrom] = useState(week.from);
  const [dateTo, setDateTo] = useState(week.to);
  const [selectedUser, setSelectedUser] = useState("");

  // Timesheet data
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  // Staff profiles
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [staffWithoutProfile, setStaffWithoutProfile] = useState<StaffWithoutProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [modalTarget, setModalTarget] = useState<Profile | StaffWithoutProfile | null>(null);

  function loadTimesheets() {
    setLoading(true);
    const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    if (selectedUser) params.set("user_id", selectedUser);
    fetch(`/api/admin/timesheets?${params}`, { cache: "no-store" })
      .then(r => r.json())
      .then(d => { setStaff(d.staff || []); setGrandTotal(d.grand_total_salary || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  function loadProfiles() {
    setProfilesLoading(true);
    fetch("/api/admin/staff-profiles", { cache: "no-store" })
      .then(r => r.json())
      .then(d => { setProfiles(d.profiles || []); setStaffWithoutProfile(d.staffWithoutProfile || []); })
      .catch(() => {})
      .finally(() => setProfilesLoading(false));
  }

  useEffect(() => { loadTimesheets(); }, [dateFrom, dateTo, selectedUser]);
  useEffect(() => { loadProfiles(); }, []);

  const allPartTime = profiles.filter(p => p.employment_type === "parttime");

  return (
    <div style={{ padding: "24px 0" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--d-text-1)", margin: 0 }}>Timesheet</h1>
        <p style={{ fontSize: 13, color: "var(--d-text-2)", marginTop: 4 }}>Rekod kehadiran & pengiraan gaji staf paruh masa</p>
      </div>

      {/* Quick range buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { label: "Minggu ini", fn: getMYTWeek },
          { label: "Bulan ini", fn: getMYTMonth },
        ].map(({ label, fn }) => (
          <button key={label} onClick={() => { const r = fn(); setDateFrom(r.from); setDateTo(r.to); }}
            style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500, border: "1px solid var(--d-border)", background: "var(--d-surface)", color: "var(--d-text-2)", cursor: "pointer" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ ...inputStyle, width: "auto", flex: "1 1 140px" }} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ ...inputStyle, width: "auto", flex: "1 1 140px" }} />
        <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}
          style={{ ...inputStyle, width: "auto", flex: "1 1 180px" }}>
          <option value="">Semua staf</option>
          {allPartTime.map(p => (
            <option key={p.user_id} value={p.user_id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Summary card */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        <div style={{ ...card, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "var(--d-text-3)", textTransform: "uppercase", letterSpacing: 1 }}>Staf aktif</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--d-text-1)", marginTop: 4 }}>{staff.length}</div>
        </div>
        <div style={{ ...card, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "var(--d-text-3)", textTransform: "uppercase", letterSpacing: 1 }}>Jumlah Jam</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--d-text-1)", marginTop: 4 }}>
            {(staff.reduce((s, x) => s + x.total_minutes, 0) / 60).toFixed(1)}j
          </div>
        </div>
        <div style={{ ...card, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "var(--d-text-3)", textTransform: "uppercase", letterSpacing: 1 }}>Jumlah Gaji</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--d-accent)", marginTop: 4 }}>RM {grandTotal.toFixed(2)}</div>
        </div>
      </div>

      {/* Timesheet table */}
      <div style={{ ...card, marginBottom: 32, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--d-border)", fontSize: 13, fontWeight: 600, color: "var(--d-text-1)" }}>
          Rekod Kehadiran
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--d-text-3)", fontSize: 13 }}>Memuatkan...</div>
        ) : staff.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--d-text-3)", fontSize: 13 }}>Tiada rekod dalam tempoh ini.</div>
        ) : (
          staff.map(s => (
            <div key={s.user_id} style={{ borderBottom: "1px solid var(--d-border)" }}>
              {/* Staff header row */}
              <button
                onClick={() => setExpandedUser(expandedUser === s.user_id ? null : s.user_id)}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--d-accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "var(--d-accent)", flexShrink: 0 }}>
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--d-text-1)" }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: "var(--d-text-3)" }}>RM{s.hourly_rate.toFixed(2)}/jam · {s.records.length} sesi</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, color: "var(--d-text-3)" }}>{fmtHours(s.total_minutes)}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--d-accent)" }}>RM {s.total_salary.toFixed(2)}</div>
                  </div>
                  <span style={{ color: "var(--d-text-3)", fontSize: 12 }}>{expandedUser === s.user_id ? "▲" : "▼"}</span>
                </div>
              </button>

              {/* Expanded records */}
              {expandedUser === s.user_id && (
                <div style={{ background: "var(--d-surface-hover)", borderTop: "1px solid var(--d-border)" }}>
                  {/* Table header */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 80px 80px", gap: 8, padding: "8px 20px", fontSize: 11, color: "var(--d-text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    <span>Tarikh</span><span>Masuk</span><span>Keluar</span><span style={{ textAlign: "right" }}>Jam</span><span style={{ textAlign: "right" }}>Gaji</span>
                  </div>
                  {s.records.map(r => (
                    <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 80px 80px", gap: 8, padding: "10px 20px", borderTop: "1px solid var(--d-border-soft)", alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--d-text-2)" }}>{fmtDate(r.clock_in_at)}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--d-text-1)" }}>{fmtTime(r.clock_in_at)}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--d-text-1)" }}>{fmtTime(r.clock_out_at)}</span>
                      <span style={{ fontSize: 12, color: "var(--d-text-2)", textAlign: "right" }}>{fmtHours(r.duration_minutes)}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--d-accent)", textAlign: "right" }}>RM {r.salary.toFixed(2)}</span>
                    </div>
                  ))}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 80px 80px", gap: 8, padding: "10px 20px", borderTop: "1px solid var(--d-border)", background: "var(--d-accent-soft)" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--d-text-1)", gridColumn: "1/4" }}>Jumlah</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--d-text-1)", textAlign: "right" }}>{fmtHours(s.total_minutes)}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--d-accent)", textAlign: "right" }}>RM {s.total_salary.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Staff Profiles section */}
      <div style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--d-text-1)", margin: 0 }}>Kadar Gaji Staf</h2>
          <p style={{ fontSize: 12, color: "var(--d-text-3)", marginTop: 2 }}>Set kadar perjam untuk staf paruh masa</p>
        </div>
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {profilesLoading ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--d-text-3)", fontSize: 13 }}>Memuatkan...</div>
        ) : (
          <>
            {profiles.map(p => (
              <div key={p.user_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--d-border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--d-accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "var(--d-accent)" }}>
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--d-text-1)" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "var(--d-text-3)" }}>{p.email}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--d-text-1)" }}>RM {Number(p.hourly_rate).toFixed(2)}/j</div>
                    <div style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, display: "inline-block", background: p.is_active ? "var(--d-success-soft)" : "var(--d-surface-hover)", color: p.is_active ? "var(--d-success)" : "var(--d-text-3)" }}>
                      {p.is_active ? "Aktif" : "Tidak aktif"}
                    </div>
                  </div>
                  <button onClick={() => setModalTarget(p)}
                    style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "1px solid var(--d-border)", background: "var(--d-surface-hover)", color: "var(--d-text-2)", cursor: "pointer" }}>
                    Edit
                  </button>
                </div>
              </div>
            ))}

            {staffWithoutProfile.map(u => (
              <div key={u.user_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--d-border)", opacity: 0.6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--d-surface-hover)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "var(--d-text-3)" }}>
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--d-text-1)" }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: "var(--d-text-3)" }}>Tiada profil</div>
                  </div>
                </div>
                <button onClick={() => setModalTarget({ ...u, isNew: true } as StaffWithoutProfile & { isNew: true })}
                  style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "none", background: "var(--d-accent)", color: "#fff", cursor: "pointer" }}>
                  + Tambah
                </button>
              </div>
            ))}

            {profiles.length === 0 && staffWithoutProfile.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: "var(--d-text-3)", fontSize: 13 }}>Tiada staf dalam sistem.</div>
            )}
          </>
        )}
      </div>

      {/* Profile modal */}
      {modalTarget && (
        <ProfileModal
          target={modalTarget as Profile & { isNew?: boolean }}
          onClose={() => setModalTarget(null)}
          onSaved={() => { setModalTarget(null); loadProfiles(); loadTimesheets(); }}
        />
      )}
    </div>
  );
}

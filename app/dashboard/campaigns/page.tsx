"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CampaignChannel = "whatsapp" | "email" | "multi";
type CampaignSegment = "active_30d" | "inactive_60d" | "birthday_month" | "manual";

type CampaignRow = {
  id: string;
  name: string;
  channel: CampaignChannel;
  segment_type: CampaignSegment;
  message_template: string;
  status: "draft" | "scheduled" | "running" | "sent" | "cancelled";
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  counts: {
    queued: number;
    sent: number;
    failed: number;
    skipped: number;
    total: number;
  };
};

type PreviewResponse = {
  segment_type: CampaignSegment;
  channel: CampaignChannel;
  considered_customers: number;
  matched_customers: number;
  eligible_recipients: number;
  by_channel: { whatsapp: number; email: number };
  preview: Array<{
    customer_id: string;
    customer_name: string;
    channel: "whatsapp" | "email";
    destination: string;
  }>;
};

type MurpatiStatus = {
  configured: boolean;
  base_url: string;
  has_api_key: boolean;
  has_session_id: boolean;
  session_id: string | null;
  session_status: string | null;
  error: string | null;
};

type IntegrationCategory = "messaging" | "payment" | "email" | "system" | "storage";

type IntegrationStatusCheck = { key: string; label: string; ok: boolean };

type IntegrationStatusRow = {
  id: string;
  name: string;
  category: IntegrationCategory;
  configured: boolean;
  healthy: boolean;
  status: string;
  checks: IntegrationStatusCheck[];
  hint?: string | null;
};

type IntegrationsStatusResponse = {
  generated_at: string;
  payment_provider_active: "toyyibpay" | "billplz";
  integrations: IntegrationStatusRow[];
};

const SEGMENT_OPTIONS: Array<{ value: CampaignSegment; label: string }> = [
  { value: "active_30d", label: "Active customer (30 days)" },
  { value: "inactive_60d", label: "Inactive customer (60 days)" },
  { value: "birthday_month", label: "Birthday month" },
];

const CHANNEL_OPTIONS: Array<{ value: CampaignChannel; label: string }> = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "multi", label: "WhatsApp + Email" },
];

function formatSegment(v: CampaignSegment) {
  if (v === "active_30d") return "Active 30D";
  if (v === "inactive_60d") return "Inactive 60D";
  if (v === "birthday_month") return "Birthday Month";
  return "Manual";
}

function statusBadge(s: CampaignRow["status"]) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    draft:     { label: "Draft",     color: "var(--d-warning)", bg: "var(--d-warning-soft)" },
    scheduled: { label: "Scheduled", color: "var(--d-info)",    bg: "var(--d-info-soft)" },
    running:   { label: "Running",   color: "var(--d-info)",    bg: "var(--d-info-soft)" },
    sent:      { label: "Sent",      color: "var(--d-success)", bg: "var(--d-success-soft)" },
    cancelled: { label: "Cancelled", color: "var(--d-text-3)",  bg: "var(--d-surface-hover)" },
  };
  return map[s] ?? map.draft;
}

/* ── Shared UI primitives ─────────────────────────────── */
function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
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

function SectionHeader({ title, desc, action }: { title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
      <div>
        <p style={{ fontSize: 15, fontWeight: 700, color: "var(--d-text-1)" }}>{title}</p>
        {desc && <p style={{ fontSize: 12, color: "var(--d-text-3)", marginTop: 3 }}>{desc}</p>}
      </div>
      {action}
    </div>
  );
}

function GhostBtn({ onClick, children, disabled }: { onClick?: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "6px 14px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 500,
        color: "var(--d-text-2)",
        background: "transparent",
        border: "1px solid var(--d-border)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.15s",
      }}
    >
      {children}
    </button>
  );
}

function PrimaryBtn({ onClick, children, disabled }: { onClick?: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "7px 16px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        color: "#fff",
        background: disabled ? "var(--d-text-3)" : "var(--d-accent)",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.15s",
      }}
    >
      {children}
    </button>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
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
        ...props.style,
      }}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
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
        ...props.style,
      }}
    />
  );
}

function Alert({ type, children }: { type: "error" | "success" | "info"; children: React.ReactNode }) {
  const colors = {
    error:   { color: "var(--d-error)",   bg: "var(--d-error-soft)",   border: "var(--d-error)" },
    success: { color: "var(--d-success)", bg: "var(--d-success-soft)", border: "var(--d-success)" },
    info:    { color: "var(--d-info)",    bg: "var(--d-info-soft)",    border: "var(--d-info)" },
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
        opacity: 0.9,
      }}
    >
      {children}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <Card style={{ padding: "14px 16px" }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: "var(--d-text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 700, color: color ?? "var(--d-text-1)", marginTop: 6, lineHeight: 1 }}>{value}</p>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        background: "var(--d-surface-hover)",
        border: "1px solid var(--d-border-soft)",
      }}
    >
      <p style={{ fontSize: 10, color: "var(--d-text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ fontSize: 15, fontWeight: 600, color: "var(--d-text-1)", marginTop: 3 }}>{value}</p>
    </div>
  );
}

/* ── Main component ───────────────────────────────────── */
export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [channel, setChannel] = useState<CampaignChannel>("whatsapp");
  const [segmentType, setSegmentType] = useState<CampaignSegment>("active_30d");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);

  const [queueLoadingById, setQueueLoadingById] = useState<Record<string, boolean>>({});
  const [sendLoadingById, setSendLoadingById] = useState<Record<string, boolean>>({});

  const [murpatiStatus, setMurpatiStatus] = useState<MurpatiStatus | null>(null);
  const [murpatiLoading, setMurpatiLoading] = useState(true);
  const [testTo, setTestTo] = useState("");
  const [testMessage, setTestMessage] = useState("Hi {{name}}, this is test message from Loka POS.");
  const [testLoading, setTestLoading] = useState(false);

  const [integrations, setIntegrations] = useState<IntegrationsStatusResponse | null>(null);
  const [integrationsLoading, setIntegrationsLoading] = useState(true);
  const [integrationsError, setIntegrationsError] = useState<string | null>(null);
  const [expandedIntegrationId, setExpandedIntegrationId] = useState<string | null>(null);

  const [showNewForm, setShowNewForm] = useState(false);

  const summary = useMemo(() => campaigns.reduce(
    (acc, c) => {
      acc.total += 1;
      if (c.status === "draft") acc.draft += 1;
      if (c.status === "running") acc.running += 1;
      if (c.status === "sent") acc.sent += 1;
      acc.queuedRecipients += Number(c.counts?.queued || 0);
      return acc;
    },
    { total: 0, draft: 0, running: 0, sent: 0, queuedRecipients: 0 }
  ), [campaigns]);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/campaigns", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load campaigns");
      setCampaigns((data.campaigns || []) as CampaignRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load campaigns");
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMurpatiStatus = useCallback(async () => {
    setMurpatiLoading(true);
    try {
      const res = await fetch("/api/admin/campaigns/murpati/status", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed");
      setMurpatiStatus(data as MurpatiStatus);
    } catch (e) {
      setMurpatiStatus({
        configured: false,
        base_url: "https://api.murpati.com",
        has_api_key: false,
        has_session_id: false,
        session_id: null,
        session_status: null,
        error: e instanceof Error ? e.message : "Failed to load Murpati status",
      });
    } finally {
      setMurpatiLoading(false);
    }
  }, []);

  const loadIntegrationsStatus = useCallback(async () => {
    setIntegrationsLoading(true);
    setIntegrationsError(null);
    try {
      const res = await fetch("/api/admin/integrations/status", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed");
      setIntegrations(data as IntegrationsStatusResponse);
    } catch (e) {
      setIntegrations(null);
      setIntegrationsError(e instanceof Error ? e.message : "Failed to load integrations status");
    } finally {
      setIntegrationsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
    void loadMurpatiStatus();
    void loadIntegrationsStatus();
  }, [loadCampaigns, loadIntegrationsStatus, loadMurpatiStatus]);

  async function handlePreview() {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewData(null);
    try {
      const params = new URLSearchParams({ channel, segment_type: segmentType, limit: "40" });
      const res = await fetch(`/api/admin/campaigns/preview?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to preview segment");
      setPreviewData(data as PreviewResponse);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Failed");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleCreateCampaign() {
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, channel, segment_type: segmentType, message_template: messageTemplate, scheduled_at: scheduledAt || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create campaign");
      setName(""); setMessageTemplate(""); setScheduledAt("");
      setInfo("Campaign created successfully.");
      setShowNewForm(false);
      await loadCampaigns();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create campaign");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQueueRecipients(campaignId: string) {
    setQueueLoadingById(prev => ({ ...prev, [campaignId]: true }));
    setError(null); setInfo(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/queue`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to queue recipients");
      setInfo(`Queue updated: ${Number(data.newly_queued || 0)} newly queued, ${Number(data.already_queued || 0)} already queued.`);
      await loadCampaigns();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to queue recipients");
    } finally {
      setQueueLoadingById(prev => ({ ...prev, [campaignId]: false }));
    }
  }

  async function handleSendCampaign(campaignId: string) {
    setSendLoadingById(prev => ({ ...prev, [campaignId]: true }));
    setError(null); setInfo(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to send campaign");
      setInfo(`Sent: ${Number(data.sent || 0)} messages, ${Number(data.remaining_queued || 0)} remaining.`);
      await loadCampaigns();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send campaign");
    } finally {
      setSendLoadingById(prev => ({ ...prev, [campaignId]: false }));
    }
  }

  async function handleTestSend() {
    setTestLoading(true);
    setError(null); setInfo(null);
    try {
      const res = await fetch("/api/admin/campaigns/murpati/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo, message: testMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Test send failed");
      setInfo(`Test message sent. ID: ${data.message_id || "-"}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test send failed");
    } finally {
      setTestLoading(false);
    }
  }

  /* ── Render ─────────────────────────────────────────── */
  return (
    <div style={{ padding: "28px 28px 40px", maxWidth: 900 }}>

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--d-text-1)", letterSpacing: "-0.02em" }}>Campaigns</h1>
          <p style={{ fontSize: 13, color: "var(--d-text-3)", marginTop: 4 }}>
            Queue CRM recipients, then send WhatsApp in controlled batches via Murpati.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewForm(p => !p)}
          style={{
            padding: "9px 18px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
            background: "var(--d-accent)",
            border: "none",
            cursor: "pointer",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          + New Campaign
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <StatCard label="Total Campaigns" value={summary.total} />
        <StatCard label="Draft" value={summary.draft} color="var(--d-warning)" />
        <StatCard label="Running" value={summary.running} color="var(--d-info)" />
        <StatCard label="Queued Recipients" value={summary.queuedRecipients} color="var(--d-success)" />
      </div>

      {/* Alerts */}
      {error && <div style={{ marginBottom: 16 }}><Alert type="error">{error}</Alert></div>}
      {info  && <div style={{ marginBottom: 16 }}><Alert type="success">{info}</Alert></div>}

      {/* New Campaign Form */}
      {showNewForm && (
        <Card style={{ padding: 20, marginBottom: 20 }}>
          <SectionHeader title="New Campaign" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Campaign name"
            />
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
            />
            <Select value={channel} onChange={e => setChannel(e.target.value as CampaignChannel)}>
              {CHANNEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <Select value={segmentType} onChange={e => setSegmentType(e.target.value as CampaignSegment)}>
              {SEGMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <textarea
            value={messageTemplate}
            onChange={e => setMessageTemplate(e.target.value)}
            placeholder="Message template — supports {{name}}, {{first_name}}, {{phone}}"
            rows={4}
            style={{
              width: "100%",
              marginTop: 10,
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
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <GhostBtn onClick={() => void handlePreview()} disabled={previewLoading}>
              {previewLoading ? "Previewing..." : "Preview Segment"}
            </GhostBtn>
            <PrimaryBtn onClick={() => void handleCreateCampaign()} disabled={submitting}>
              {submitting ? "Saving..." : "Create Campaign"}
            </PrimaryBtn>
            <div style={{ flex: 1 }} />
            <GhostBtn onClick={() => setShowNewForm(false)}>Cancel</GhostBtn>
          </div>

          {previewError && <div style={{ marginTop: 12 }}><Alert type="error">{previewError}</Alert></div>}

          {previewData && (
            <div
              style={{
                marginTop: 14,
                padding: 14,
                borderRadius: 10,
                background: "var(--d-surface-hover)",
                border: "1px solid var(--d-border-soft)",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 10 }}>
                <MiniStat label="Checked" value={previewData.considered_customers} />
                <MiniStat label="Segment Match" value={previewData.matched_customers} />
                <MiniStat label="Eligible" value={previewData.eligible_recipients} />
                <MiniStat label="WA / Email" value={`${previewData.by_channel.whatsapp} / ${previewData.by_channel.email}`} />
              </div>
              <div
                style={{
                  maxHeight: 180,
                  overflowY: "auto",
                  borderRadius: 8,
                  border: "1px solid var(--d-border)",
                  background: "var(--d-surface)",
                }}
              >
                {previewData.preview.length === 0 ? (
                  <p style={{ padding: "12px 14px", fontSize: 12, color: "var(--d-text-3)" }}>
                    No recipients in this segment.
                  </p>
                ) : (
                  previewData.preview.map(row => (
                    <div
                      key={`${row.customer_id}-${row.channel}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 12px",
                        borderBottom: "1px solid var(--d-border-soft)",
                        fontSize: 12,
                      }}
                    >
                      <span style={{ flex: 1, color: "var(--d-text-1)", fontWeight: 500 }}>{row.customer_name}</span>
                      <span style={{ color: "var(--d-text-3)" }}>{row.destination}</span>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 20,
                          fontSize: 10,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          background: "var(--d-accent-soft)",
                          color: "var(--d-accent)",
                        }}
                      >
                        {row.channel}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Campaign List */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--d-text-2)" }}>
            {loading ? "Loading..." : `${campaigns.length} campaign${campaigns.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2].map(i => (
              <div key={i} style={{ height: 100, borderRadius: 14, background: "var(--d-surface)", border: "1px solid var(--d-border)", opacity: 0.5 }} />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <Card style={{ padding: "40px 20px", textAlign: "center" }}>
            <p style={{ fontSize: 14, color: "var(--d-text-3)" }}>No campaigns yet.</p>
            <p style={{ fontSize: 12, color: "var(--d-text-3)", marginTop: 4 }}>Click &ldquo;+ New Campaign&rdquo; to get started.</p>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {campaigns.map(campaign => {
              const badge = statusBadge(campaign.status);
              return (
                <Card key={campaign.id} style={{ padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "var(--d-text-1)" }}>{campaign.name}</p>
                        <span
                          style={{
                            padding: "2px 10px",
                            borderRadius: 20,
                            fontSize: 11,
                            fontWeight: 600,
                            color: badge.color,
                            background: badge.bg,
                          }}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: "var(--d-text-3)", marginTop: 4 }}>
                        {formatSegment(campaign.segment_type)} · {campaign.channel.toUpperCase()}
                        {campaign.scheduled_at
                          ? ` · Scheduled ${new Date(campaign.scheduled_at).toLocaleString()}`
                          : ""}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--d-text-3)", marginTop: 2 }}>
                        Created {new Date(campaign.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                      <GhostBtn
                        onClick={() => void handleQueueRecipients(campaign.id)}
                        disabled={Boolean(queueLoadingById[campaign.id])}
                      >
                        {queueLoadingById[campaign.id] ? "Queueing..." : "Queue"}
                      </GhostBtn>
                      <PrimaryBtn
                        onClick={() => void handleSendCampaign(campaign.id)}
                        disabled={Boolean(sendLoadingById[campaign.id])}
                      >
                        {sendLoadingById[campaign.id] ? "Sending..." : "Send Batch"}
                      </PrimaryBtn>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 14 }}>
                    <MiniStat label="Total" value={campaign.counts.total} />
                    <MiniStat label="Queued" value={campaign.counts.queued} />
                    <MiniStat label="Sent" value={campaign.counts.sent} />
                    <MiniStat label="Failed" value={campaign.counts.failed} />
                    <MiniStat label="Skipped" value={campaign.counts.skipped} />
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "var(--d-surface-hover)",
                      fontSize: 12,
                      color: "var(--d-text-3)",
                      fontStyle: "italic",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {campaign.message_template}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Integrations Settings */}
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <SectionHeader
          title="Integrations"
          desc="Monitor active providers and API readiness."
          action={
            <GhostBtn onClick={() => void loadIntegrationsStatus()} disabled={integrationsLoading}>
              {integrationsLoading ? "Checking..." : "Refresh"}
            </GhostBtn>
          }
        />

        {integrationsError ? (
          <Alert type="error">{integrationsError}</Alert>
        ) : (
          <>
            {integrations && (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "var(--d-accent-soft)",
                  fontSize: 12,
                  color: "var(--d-text-2)",
                  marginBottom: 12,
                }}
              >
                Active payment provider:{" "}
                <strong style={{ color: "var(--d-text-1)", textTransform: "uppercase" }}>
                  {integrations.payment_provider_active || "—"}
                </strong>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {integrationsLoading
                ? [1, 2, 3].map(i => (
                    <div key={i} style={{ height: 48, borderRadius: 10, background: "var(--d-surface-hover)", opacity: 0.6 }} />
                  ))
                : (integrations?.integrations || []).map(intg => (
                    <div
                      key={intg.id}
                      style={{
                        borderRadius: 10,
                        border: "1px solid var(--d-border)",
                        overflow: "hidden",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedIntegrationId(p => p === intg.id ? null : intg.id)}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          padding: "11px 14px",
                          background: "var(--d-surface-hover)",
                          border: "none",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--d-text-1)" }}>{intg.name}</p>
                          <p style={{ fontSize: 11, color: "var(--d-text-3)", marginTop: 1, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            {intg.category} · {intg.status}
                          </p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            style={{
                              padding: "3px 10px",
                              borderRadius: 20,
                              fontSize: 10,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              color: intg.healthy ? "var(--d-success)" : intg.configured ? "var(--d-warning)" : "var(--d-text-3)",
                              background: intg.healthy ? "var(--d-success-soft)" : intg.configured ? "var(--d-warning-soft)" : "var(--d-surface-hover)",
                            }}
                          >
                            {intg.healthy ? "Healthy" : intg.configured ? "Partial" : "Missing"}
                          </span>
                          <span style={{ fontSize: 10, color: "var(--d-text-3)" }}>
                            {expandedIntegrationId === intg.id ? "▲" : "▼"}
                          </span>
                        </div>
                      </button>

                      {expandedIntegrationId === intg.id && (
                        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--d-border)" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {intg.checks.map(check => (
                              <div
                                key={`${intg.id}-${check.key}`}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "6px 10px",
                                  borderRadius: 6,
                                  background: "var(--d-surface-hover)",
                                  fontSize: 12,
                                }}
                              >
                                <span style={{ color: "var(--d-text-2)" }}>{check.label}</span>
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: check.ok ? "var(--d-success)" : "var(--d-error)",
                                  }}
                                >
                                  {check.ok ? "OK" : "Missing"}
                                </span>
                              </div>
                            ))}
                          </div>
                          {intg.hint && (
                            <p style={{ marginTop: 8, fontSize: 11, color: "var(--d-warning)" }}>{intg.hint}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
            </div>
          </>
        )}
      </Card>

      {/* Murpati Connection */}
      <Card style={{ padding: 20 }}>
        <SectionHeader
          title="Murpati Connection"
          desc="Test WhatsApp gateway connectivity."
          action={
            <GhostBtn onClick={() => void loadMurpatiStatus()} disabled={murpatiLoading}>
              {murpatiLoading ? "Checking..." : "Refresh"}
            </GhostBtn>
          }
        />

        {murpatiLoading ? (
          <p style={{ fontSize: 13, color: "var(--d-text-3)" }}>Checking Murpati status...</p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
              <MiniStat label="Configured" value={murpatiStatus?.configured ? "Yes" : "No"} />
              <MiniStat label="Session" value={murpatiStatus?.session_status || "Unknown"} />
              <MiniStat label="Base URL" value={murpatiStatus?.base_url || "—"} />
            </div>
            {murpatiStatus?.error && (
              <div style={{ marginBottom: 12 }}>
                <Alert type="error">{murpatiStatus.error}</Alert>
              </div>
            )}
          </>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 8 }}>
          <Input
            value={testTo}
            onChange={e => setTestTo(e.target.value)}
            placeholder="e.g. 60123456789"
          />
          <Input
            value={testMessage}
            onChange={e => setTestMessage(e.target.value)}
            placeholder="Test message"
          />
          <PrimaryBtn onClick={() => void handleTestSend()} disabled={testLoading}>
            {testLoading ? "Sending..." : "Test Send"}
          </PrimaryBtn>
        </div>
      </Card>
    </div>
  );
}

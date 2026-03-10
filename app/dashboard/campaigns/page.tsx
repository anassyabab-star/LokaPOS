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
  by_channel: {
    whatsapp: number;
    email: number;
  };
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

type IntegrationCategory = "messaging" | "payment" | "email" | "system";

type IntegrationStatusCheck = {
  key: string;
  label: string;
  ok: boolean;
};

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

function formatSegment(value: CampaignSegment) {
  if (value === "active_30d") return "Active 30D";
  if (value === "inactive_60d") return "Inactive 60D";
  if (value === "birthday_month") return "Birthday Month";
  return "Manual";
}

function formatStatus(value: CampaignRow["status"]) {
  if (value === "draft") return "Draft";
  if (value === "scheduled") return "Scheduled";
  if (value === "running") return "Running";
  if (value === "sent") return "Sent";
  return "Cancelled";
}

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

  const summary = useMemo(() => {
    return campaigns.reduce(
      (acc, campaign) => {
        acc.total += 1;
        if (campaign.status === "draft") acc.draft += 1;
        if (campaign.status === "running") acc.running += 1;
        if (campaign.status === "sent") acc.sent += 1;
        acc.queuedRecipients += Number(campaign.counts?.queued || 0);
        return acc;
      },
      { total: 0, draft: 0, running: 0, sent: 0, queuedRecipients: 0 }
    );
  }, [campaigns]);

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
      if (!res.ok) throw new Error(data?.error || "Failed to load Murpati status");
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
      if (!res.ok) throw new Error(data?.error || "Failed to load integrations status");
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
      const params = new URLSearchParams({
        channel,
        segment_type: segmentType,
        limit: "40",
      });
      const res = await fetch(`/api/admin/campaigns/preview?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to preview segment");
      setPreviewData(data as PreviewResponse);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Failed to preview segment");
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
        body: JSON.stringify({
          name,
          channel,
          segment_type: segmentType,
          message_template: messageTemplate,
          scheduled_at: scheduledAt || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create campaign");

      setName("");
      setMessageTemplate("");
      setScheduledAt("");
      setInfo("Campaign created.");
      await loadCampaigns();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create campaign");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQueueRecipients(campaignId: string) {
    setQueueLoadingById(prev => ({ ...prev, [campaignId]: true }));
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/queue`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to queue recipients");
      setInfo(
        `Queue updated: ${Number(data.newly_queued || 0)} newly queued, ${Number(
          data.already_queued || 0
        )} already queued.`
      );
      await loadCampaigns();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to queue recipients");
    } finally {
      setQueueLoadingById(prev => ({ ...prev, [campaignId]: false }));
    }
  }

  async function handleSendCampaign(campaignId: string) {
    setSendLoadingById(prev => ({ ...prev, [campaignId]: true }));
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to send campaign");
      setInfo(
        `Send batch done: processed ${Number(data.processed || 0)}, sent ${Number(
          data.sent || 0
        )}, failed ${Number(data.failed || 0)}, remaining ${Number(data.remaining_queued || 0)}.`
      );
      await loadCampaigns();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send campaign");
    } finally {
      setSendLoadingById(prev => ({ ...prev, [campaignId]: false }));
    }
  }

  async function handleTestSend() {
    setTestLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/admin/campaigns/murpati/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: testTo,
          message: testMessage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Test send failed");
      setInfo(`Test message sent successfully. Message ID: ${data.message_id || "-"}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test send failed");
    } finally {
      setTestLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black p-4 text-gray-200 md:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Campaigns</h1>
        <p className="mt-1 text-sm text-gray-400">
          Queue CRM recipients, then send WhatsApp in controlled batches via Murpati.
        </p>
      </div>

      <div className="-mx-1 mb-4 flex snap-x gap-3 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
        <Stat label="Total Campaigns" value={summary.total} />
        <Stat label="Draft" value={summary.draft} color="text-yellow-300" />
        <Stat label="Running" value={summary.running} color="text-blue-300" />
        <Stat label="Queued Recipients" value={summary.queuedRecipients} color="text-green-300" />
      </div>

      <div className="mb-4 rounded-xl border border-gray-800 bg-[#111] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Integrations Settings</h2>
            <p className="mt-1 text-xs text-gray-400">
              Monitor active provider and API readiness without exposing secrets.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadIntegrationsStatus()}
            className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500"
          >
            Refresh
          </button>
        </div>

        {integrationsLoading ? (
          <p className="mt-3 text-sm text-gray-400">Checking integrations...</p>
        ) : integrationsError ? (
          <div className="mt-3 rounded-md border border-red-900 bg-red-950/20 px-3 py-2 text-xs text-red-300">
            {integrationsError}
          </div>
        ) : (
          <>
            <div className="mt-3 rounded-md border border-gray-800 bg-black/40 px-3 py-2 text-xs text-gray-300">
              Active payment provider:{" "}
              <span className="font-semibold uppercase text-white">
                {integrations?.payment_provider_active || "-"}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {(integrations?.integrations || []).map(integration => (
                <div key={integration.id} className="rounded-md border border-gray-800 bg-black/30">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedIntegrationId(prev => (prev === integration.id ? null : integration.id))
                    }
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                    aria-expanded={expandedIntegrationId === integration.id}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{integration.name}</p>
                      <p className="mt-0.5 truncate text-[11px] uppercase tracking-wide text-gray-500">
                        {integration.category} • {integration.status}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          integration.healthy
                            ? "bg-green-900/40 text-green-300"
                            : integration.configured
                              ? "bg-yellow-900/40 text-yellow-300"
                              : "bg-gray-800 text-gray-300"
                        }`}
                      >
                        {integration.healthy ? "Healthy" : integration.configured ? "Partial" : "Missing"}
                      </span>
                      <span className="text-xs text-gray-400">
                        {expandedIntegrationId === integration.id ? "▲" : "▼"}
                      </span>
                    </div>
                  </button>

                  {expandedIntegrationId === integration.id ? (
                    <div className="border-t border-gray-800 px-3 pb-3 pt-2">
                      <div className="grid grid-cols-1 gap-1">
                        {integration.checks.map(check => (
                          <div
                            key={`${integration.id}-${check.key}`}
                            className="flex items-center justify-between rounded border border-gray-800 bg-[#0f0f0f] px-2 py-1 text-[11px]"
                          >
                            <span className="text-gray-400">{check.label}</span>
                            <span className={check.ok ? "text-green-300" : "text-red-300"}>
                              {check.ok ? "OK" : "Missing"}
                            </span>
                          </div>
                        ))}
                      </div>

                      {integration.hint ? (
                        <p className="mt-2 text-[11px] text-amber-300">{integration.hint}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mb-4 rounded-xl border border-gray-800 bg-[#111] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Murpati Connection</h2>
          <button
            type="button"
            onClick={() => void loadMurpatiStatus()}
            className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500"
          >
            Refresh
          </button>
        </div>

        {murpatiLoading ? (
          <p className="mt-2 text-sm text-gray-400">Checking Murpati status...</p>
        ) : (
          <div className="mt-2 space-y-2 text-sm">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <Mini label="Configured" value={murpatiStatus?.configured ? "Yes" : "No"} />
              <Mini label="Session Status" value={murpatiStatus?.session_status || "Unknown"} />
              <Mini label="Base URL" value={murpatiStatus?.base_url || "-"} />
            </div>
            {murpatiStatus?.error ? (
              <div className="rounded-md border border-red-900 bg-red-950/20 px-3 py-2 text-xs text-red-300">
                {murpatiStatus.error}
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_auto]">
          <input
            value={testTo}
            onChange={e => setTestTo(e.target.value)}
            placeholder="Test number (example 60123456789)"
            className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
          />
          <input
            value={testMessage}
            onChange={e => setTestMessage(e.target.value)}
            placeholder="Test message"
            className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
          />
          <button
            type="button"
            onClick={() => void handleTestSend()}
            disabled={testLoading}
            className="rounded-md bg-[#7F1D1D] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {testLoading ? "Sending..." : "Test Send"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-800 bg-[#111] p-4">
        <h2 className="text-base font-semibold">New Campaign</h2>

        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Campaign name"
            className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
          />

          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={e => setScheduledAt(e.target.value)}
            className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
          />

          <select
            value={channel}
            onChange={e => setChannel(e.target.value as CampaignChannel)}
            className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
          >
            {CHANNEL_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={segmentType}
            onChange={e => setSegmentType(e.target.value as CampaignSegment)}
            className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
          >
            {SEGMENT_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <textarea
          value={messageTemplate}
          onChange={e => setMessageTemplate(e.target.value)}
          placeholder="Message template. Supports {{name}}, {{first_name}}, {{phone}}"
          rows={4}
          className="mt-2 w-full rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
        />

        <div className="mt-2 flex flex-col gap-2 md:flex-row">
          <button
            type="button"
            onClick={() => void handlePreview()}
            disabled={previewLoading}
            className="rounded-md border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:border-gray-500 disabled:opacity-60"
          >
            {previewLoading ? "Previewing..." : "Preview Segment"}
          </button>
          <button
            type="button"
            onClick={() => void handleCreateCampaign()}
            disabled={submitting}
            className="rounded-md bg-[#7F1D1D] px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Create Campaign"}
          </button>
        </div>

        {previewError ? (
          <div className="mt-3 rounded-md border border-red-900 bg-red-950/20 px-3 py-2 text-sm text-red-300">
            {previewError}
          </div>
        ) : null}

        {previewData ? (
          <div className="mt-3 rounded-md border border-gray-800 bg-black/40 p-3 text-sm">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Mini label="Customers Checked" value={previewData.considered_customers} />
              <Mini label="Segment Match" value={previewData.matched_customers} />
              <Mini label="Eligible Recipients" value={previewData.eligible_recipients} />
              <Mini
                label="Split"
                value={`WA ${previewData.by_channel.whatsapp} / Email ${previewData.by_channel.email}`}
              />
            </div>
            <div className="mt-3 max-h-44 space-y-1 overflow-auto rounded-md border border-gray-800 bg-[#111] p-2">
              {previewData.preview.length === 0 ? (
                <p className="text-xs text-gray-500">No recipients in this segment.</p>
              ) : (
                previewData.preview.map(row => (
                  <div
                    key={`${row.customer_id}-${row.channel}`}
                    className="flex items-center justify-between gap-3 rounded border border-gray-800 px-2 py-1 text-xs"
                  >
                    <span className="truncate">{row.customer_name}</span>
                    <span className="truncate text-gray-400">{row.destination}</span>
                    <span className="rounded-full bg-gray-800 px-2 py-0.5 uppercase text-[10px]">
                      {row.channel}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-red-900 bg-red-950/20 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {info ? (
        <div className="mt-4 rounded-md border border-green-900 bg-green-950/20 px-3 py-2 text-sm text-green-300">
          {info}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="rounded-xl border border-gray-800 bg-[#111] px-3 py-5 text-sm text-gray-400">
            Loading campaigns...
          </div>
        ) : null}

        {!loading && campaigns.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-[#111] px-3 py-5 text-sm text-gray-400">
            No campaigns yet.
          </div>
        ) : null}

        {!loading &&
          campaigns.map(campaign => (
            <div key={campaign.id} className="rounded-xl border border-gray-800 bg-[#111] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{campaign.name}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {formatSegment(campaign.segment_type)} • {campaign.channel.toUpperCase()}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Created {new Date(campaign.created_at).toLocaleString()}
                    {campaign.scheduled_at
                      ? ` • Schedule ${new Date(campaign.scheduled_at).toLocaleString()}`
                      : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-gray-800 px-2 py-1 text-xs">
                    {formatStatus(campaign.status)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleQueueRecipients(campaign.id)}
                    disabled={Boolean(queueLoadingById[campaign.id])}
                    className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-200 disabled:opacity-60"
                  >
                    {queueLoadingById[campaign.id] ? "Queueing..." : "Queue Recipients"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSendCampaign(campaign.id)}
                    disabled={Boolean(sendLoadingById[campaign.id])}
                    className="rounded-md bg-[#7F1D1D] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                  >
                    {sendLoadingById[campaign.id] ? "Sending..." : "Send WhatsApp Batch"}
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
                <Mini label="Total" value={campaign.counts.total} />
                <Mini label="Queued" value={campaign.counts.queued} />
                <Mini label="Sent" value={campaign.counts.sent} />
                <Mini label="Failed" value={campaign.counts.failed} />
                <Mini label="Skipped" value={campaign.counts.skipped} />
              </div>

              <div className="mt-3 rounded-md border border-gray-800 bg-black/40 px-3 py-2 text-xs text-gray-300">
                {campaign.message_template}
              </div>
            </div>
          ))}
      </div>
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
    <div className="min-w-[155px] rounded-xl border border-gray-800 bg-[#111] p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-gray-800 bg-black/40 p-2 text-xs">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="mt-1 font-medium text-gray-200">{value}</p>
    </div>
  );
}

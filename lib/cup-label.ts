// ━━━ Cup Label Sticker Builder ━━━
// Generates HTML for thermal label printer (50x30mm sticker)
// Uses Google Charts API for reliable QR code generation

export type CupLabelItem = {
  name: string;
  variant_name?: string | null;
  addon_names?: string[];
  sugar_level?: string | null;
  qty: number;
  item_index: number;
  total_items: number;
};

export type CupLabelPayload = {
  receiptNumber: string;
  customerName?: string | null;
  createdAt: string;
  orderId: string;
  item: CupLabelItem;
  siteUrl?: string;
  autoPrint?: boolean;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function qrImageUrl(data: string, size = 200) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&format=svg`;
}

const LABEL_STYLES = `
  :root { color-scheme: light; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background: #fff; color: #111; }
  .label { width: 50mm; height: 30mm; padding: 1.5mm 2mm; display: flex; gap: 1.5mm; overflow: hidden; page-break-inside: avoid; }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; }
  .order-line { display: flex; align-items: center; gap: 1.5mm; }
  .order-num { font-size: 8pt; font-weight: 800; letter-spacing: -0.3px; }
  .item-badge { font-size: 5.5pt; font-weight: 600; background: #111; color: #fff; border-radius: 2px; padding: 0.3mm 1mm; }
  .drink { font-size: 7.5pt; font-weight: 700; line-height: 1.2; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .addons { font-size: 5.5pt; color: #7F1D1D; font-weight: 600; line-height: 1.2; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .sugar { font-size: 6pt; font-weight: 700; background: #f5f5f5; border: 0.5px solid #ddd; border-radius: 2px; padding: 0.3mm 1.2mm; display: inline-block; }
  .bottom { display: flex; align-items: center; justify-content: space-between; gap: 1mm; }
  .customer { font-size: 6pt; font-weight: 600; color: #333; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 22mm; }
  .time { font-size: 5pt; color: #888; white-space: nowrap; }
  .qr-area { width: 14mm; height: 14mm; flex-shrink: 0; display: flex; align-items: center; justify-content: center; align-self: center; }
  .qr-area img { width: 14mm; height: 14mm; image-rendering: pixelated; }
  @media print { @page { size: 50mm 30mm; margin: 0; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

function buildLabelBlock(opts: {
  receiptNumber: string;
  drinkName: string;
  addons: string;
  sugar: string;
  customer: string;
  timeLabel: string;
  itemLabel: string;
  qrUrl: string;
}) {
  return `<div class="label">
  <div class="info">
    <div>
      <div class="order-line">
        <span class="order-num">#${escapeHtml(opts.receiptNumber)}</span>
        ${opts.itemLabel ? `<span class="item-badge">${escapeHtml(opts.itemLabel)}</span>` : ""}
      </div>
      <div class="drink">${escapeHtml(opts.drinkName)}</div>
      ${opts.addons ? `<div class="addons">${escapeHtml(opts.addons)}</div>` : ""}
    </div>
    <div>
      ${opts.sugar ? `<div style="margin-bottom:0.5mm"><span class="sugar">${escapeHtml(opts.sugar)}</span></div>` : ""}
      <div class="bottom">
        <span class="customer">${escapeHtml(opts.customer)}</span>
        <span class="time">${escapeHtml(opts.timeLabel)}</span>
      </div>
    </div>
  </div>
  <div class="qr-area"><img src="${opts.qrUrl}" alt="QR" /></div>
</div>`;
}

export function buildCupLabelHtml(payload: CupLabelPayload) {
  const { receiptNumber, customerName, createdAt, orderId, item } = payload;

  const time = new Date(createdAt);
  const timeLabel = Number.isNaN(time.getTime())
    ? ""
    : time.toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" });

  const drinkName = item.variant_name
    ? `${item.name} (${item.variant_name})`
    : item.name;
  const addons = item.addon_names?.length ? `+ ${item.addon_names.join(", ")}` : "";
  const sugar = item.sugar_level || "";
  const customer = customerName || "Walk-in";
  const itemLabel = item.total_items > 1 ? `${item.item_index}/${item.total_items}` : "";

  const qrData = payload.siteUrl
    ? `${payload.siteUrl}/pos?order=${orderId}`
    : orderId;

  const autoPrintScript = payload.autoPrint
    ? `<script>window.addEventListener("load",()=>{window.print();window.onafterprint=()=>window.close();});</script>`
    : "";

  const labelHtml = buildLabelBlock({
    receiptNumber, drinkName, addons, sugar, customer, timeLabel, itemLabel,
    qrUrl: qrImageUrl(qrData),
  });

  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cup Label ${escapeHtml(receiptNumber)}</title>
<style>${LABEL_STYLES}</style>
</head><body>
${labelHtml}
${autoPrintScript}
</body></html>`;
}

// Build multiple labels for one order (1 label PER CUP)
// e.g. Teh Tarik x2 = 2 separate sticker labels
export function buildAllCupLabelsHtml(payload: {
  receiptNumber: string;
  customerName?: string | null;
  createdAt: string;
  orderId: string;
  items: Array<{
    name: string;
    variant_name?: string | null;
    addon_names?: string[];
    sugar_level?: string | null;
    qty: number;
  }>;
  siteUrl?: string;
  autoPrint?: boolean;
}) {
  // Expand items by qty: Teh Tarik x2 -> 2 separate entries
  const expandedItems: Array<{
    name: string;
    variant_name?: string | null;
    addon_names?: string[];
    sugar_level?: string | null;
  }> = [];
  for (const item of payload.items) {
    const count = Math.max(1, Math.floor(item.qty));
    for (let i = 0; i < count; i++) {
      expandedItems.push({
        name: item.name,
        variant_name: item.variant_name,
        addon_names: item.addon_names,
        sugar_level: item.sugar_level,
      });
    }
  }

  const totalCups = expandedItems.length;
  const qrData = payload.siteUrl
    ? `${payload.siteUrl}/pos?order=${payload.orderId}`
    : payload.orderId;
  const qrUrl = qrImageUrl(qrData);

  const time = new Date(payload.createdAt);
  const timeLabel = Number.isNaN(time.getTime())
    ? ""
    : time.toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" });
  const customer = payload.customerName || "Walk-in";

  const labelsHtml = expandedItems
    .map((item, idx) => {
      const drinkName = item.variant_name
        ? `${item.name} (${item.variant_name})`
        : item.name;
      const addons = item.addon_names?.length ? `+ ${item.addon_names.join(", ")}` : "";
      const sugar = item.sugar_level || "";
      const itemLabel = totalCups > 1 ? `${idx + 1}/${totalCups}` : "";

      return buildLabelBlock({
        receiptNumber: payload.receiptNumber,
        drinkName, addons, sugar, customer, timeLabel, itemLabel, qrUrl,
      });
    })
    .join('\n<div style="page-break-after:always"></div>\n');

  const autoPrintScript = payload.autoPrint
    ? `<script>window.addEventListener("load",()=>{window.print();window.onafterprint=()=>window.close();});</script>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cup Labels ${escapeHtml(payload.receiptNumber)}</title>
<style>${LABEL_STYLES}</style>
</head><body>
${labelsHtml}
${autoPrintScript}
</body></html>`;
}

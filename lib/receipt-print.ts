export type ReceiptItemLine = {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

export type ReceiptPayload = {
  receiptNumber: string;
  /** Short daily Order ID ("042") — printed large so staff/customer match it fast. */
  shortNumber?: string | null;
  createdAt: string;
  customerName?: string | null;
  paymentMethod?: string | null;
  /** "dine_in" | "take_away" */
  orderType?: string | null;
  tableNumber?: string | null;
  buzzerNumber?: string | null;
  subtotal?: number | null;
  discount?: number | null;
  total: number;
  items: ReceiptItemLine[];
  autoPrint?: boolean;
};

/** "Dine In · Meja 7" / "Take Away · Buzzer 12" / "Take Away" / "" */
export function receiptTargetLine(p: { orderType?: string | null; tableNumber?: string | null; buzzerNumber?: string | null }) {
  const type = String(p.orderType || "").toLowerCase();
  const typeLabel = type === "dine_in" ? "Dine In" : type === "take_away" ? "Take Away" : "";
  const where = p.tableNumber ? `Meja ${p.tableNumber}` : p.buzzerNumber ? `Buzzer ${p.buzzerNumber}` : "";
  return [typeLabel, where].filter(Boolean).join(" · ");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(value: number) {
  return `RM ${Number(value || 0).toFixed(2)}`;
}

export function buildReceiptHtml(payload: ReceiptPayload) {
  const createdAt = new Date(payload.createdAt);
  const createdAtLabel = Number.isNaN(createdAt.getTime())
    ? payload.createdAt
    : createdAt.toLocaleString();

  const lines = payload.items
    .map(item => {
      const safeName = escapeHtml(item.name);
      return `
        <div class="line">
          <div class="name">${safeName}</div>
          <div class="meta">${item.qty} x ${formatCurrency(item.unitPrice)}</div>
          <div class="total">${formatCurrency(item.lineTotal)}</div>
        </div>
      `;
    })
    .join("");

  const subtotalRow =
    typeof payload.subtotal === "number"
      ? `<div class="row"><span>Subtotal</span><span>${formatCurrency(payload.subtotal)}</span></div>`
      : "";
  const discountRow =
    typeof payload.discount === "number" && payload.discount > 0
      ? `<div class="row"><span>Discount</span><span>- ${formatCurrency(payload.discount)}</span></div>`
      : "";
  const customerRow = payload.customerName
    ? `<div class="muted">Customer: ${escapeHtml(payload.customerName)}</div>`
    : "";
  const paymentRow = payload.paymentMethod
    ? `<div class="muted">Payment: ${escapeHtml(payload.paymentMethod.toUpperCase())}</div>`
    : "";
  const targetLine = receiptTargetLine(payload);
  const targetRow = targetLine ? `<div class="target">${escapeHtml(targetLine)}</div>` : "";
  const shortRow = payload.shortNumber
    ? `<div class="order-id">Order #${escapeHtml(String(payload.shortNumber))}</div>`
    : "";
  const autoPrintScript = payload.autoPrint
    ? `<script>window.addEventListener("load",()=>{window.print();window.onafterprint=()=>window.close();});</script>`
    : "";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Receipt ${escapeHtml(payload.receiptNumber)}</title>
    <style>
      :root { color-scheme: light; }
      body { margin: 0; padding: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #fff; }
      .receipt { width: 80mm; margin: 0 auto; padding: 8px; color: #111; font-size: 11px; line-height: 1.35; }
      .center { text-align: center; }
      .title { font-weight: 700; font-size: 14px; margin-bottom: 2px; }
      .order-id { font-weight: 800; font-size: 18px; margin: 2px 0; letter-spacing: 0.02em; }
      .target { font-weight: 700; font-size: 12px; margin-top: 2px; }
      .muted { color: #555; font-size: 10px; }
      .section { margin-top: 8px; }
      .line { border-bottom: 1px dashed #ddd; padding: 6px 0; }
      .name { font-weight: 600; }
      .meta { color: #555; font-size: 10px; }
      .total { font-weight: 700; }
      .row { display: flex; justify-content: space-between; margin-top: 3px; }
      .grand { font-size: 13px; font-weight: 700; margin-top: 5px; border-top: 1px dashed #ccc; padding-top: 6px; }
      .footer { margin-top: 10px; text-align: center; font-size: 10px; color: #666; }
      @media print {
        @page { size: 80mm auto; margin: 0; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>
  </head>
  <body>
    <div class="receipt">
      <div class="center">
        <div class="title">Loka POS</div>
        ${shortRow}
        <div>Receipt #${escapeHtml(payload.receiptNumber)}</div>
        <div class="muted">${escapeHtml(createdAtLabel)}</div>
        ${targetRow}
        ${customerRow}
        ${paymentRow}
      </div>

      <div class="section">${lines}</div>

      <div class="section">
        ${subtotalRow}
        ${discountRow}
        <div class="row grand"><span>Total</span><span>${formatCurrency(payload.total)}</span></div>
      </div>

      <div class="footer">Thank you. Please come again.</div>
    </div>
    ${autoPrintScript}
  </body>
</html>`;
}

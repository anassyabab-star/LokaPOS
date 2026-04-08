/**
 * Minimal ESC/POS command builder for 80mm thermal printers.
 * No external dependencies — pure Node.js Buffer.
 */

// ESC/POS command constants
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export function buildEscPosReceipt(payload: {
  shopName: string;
  receiptNumber: string;
  createdAt: string;
  customerName?: string | null;
  paymentMethod?: string | null;
  items: { name: string; qty: number; unitPrice: number; lineTotal: number }[];
  subtotal?: number | null;
  discount?: number | null;
  total: number;
}): Buffer {
  const chunks: Buffer[] = [];

  function push(...bytes: number[]) {
    chunks.push(Buffer.from(bytes));
  }
  function text(str: string) {
    chunks.push(Buffer.from(str, "utf8"));
  }
  function line(str = "") {
    text(str);
    push(LF);
  }
  function centerOn() {
    push(ESC, 0x61, 0x01);
  }
  function leftOn() {
    push(ESC, 0x61, 0x00);
  }
  function boldOn() {
    push(ESC, 0x45, 0x01);
  }
  function boldOff() {
    push(ESC, 0x45, 0x00);
  }
  function doubleSizeOn() {
    push(GS, 0x21, 0x11); // double width + double height
  }
  function doubleSizeOff() {
    push(GS, 0x21, 0x00);
  }
  function cut() {
    push(GS, 0x56, 0x01); // half cut
  }
  function divider() {
    line("------------------------------------------------");
  }
  function rm(val: number) {
    return `RM ${Number(val || 0).toFixed(2)}`;
  }
  function pad(left: string, right: string, width = 48) {
    const gap = width - left.length - right.length;
    return left + " ".repeat(Math.max(1, gap)) + right;
  }

  // Initialize printer
  push(ESC, 0x40);

  // Shop name
  centerOn();
  doubleSizeOn();
  boldOn();
  line(payload.shopName);
  doubleSizeOff();
  boldOff();

  // Receipt number & date
  line(`Receipt #${payload.receiptNumber}`);
  const dt = new Date(payload.createdAt);
  const dtLabel = isNaN(dt.getTime())
    ? payload.createdAt
    : dt.toLocaleString("en-MY", { hour12: false });
  line(dtLabel);
  if (payload.customerName) line(`Customer: ${payload.customerName}`);
  if (payload.paymentMethod) line(`Payment: ${payload.paymentMethod.toUpperCase()}`);

  leftOn();
  divider();

  // Items
  for (const item of payload.items) {
    boldOn();
    line(item.name.slice(0, 48));
    boldOff();
    line(pad(`  ${item.qty} x ${rm(item.unitPrice)}`, rm(item.lineTotal)));
  }

  divider();

  // Totals
  if (typeof payload.subtotal === "number") {
    line(pad("Subtotal", rm(payload.subtotal)));
  }
  if (typeof payload.discount === "number" && payload.discount > 0) {
    line(pad("Discount", `- ${rm(payload.discount)}`));
  }
  boldOn();
  doubleSizeOn();
  centerOn();
  line();
  line(`TOTAL: ${rm(payload.total)}`);
  doubleSizeOff();
  boldOff();

  leftOn();
  divider();

  // Footer
  centerOn();
  line("Thank you! Please come again.");
  line();
  line();
  line();

  // Cut
  cut();

  return Buffer.concat(chunks);
}

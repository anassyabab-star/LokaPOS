// ============================================================================
// One canonical shape for Malaysian phone numbers.
//
// Before this, each entry point normalised differently: the QR ordering app
// wrote "60XXXXXXXXX" (order-provider.normalizeMyPhone) while the POS, OTP and
// import paths wrote "0XXXXXXXXX". The same person therefore got two
// `customers` rows, splitting their loyalty points and order history — which
// is exactly what happened to three numbers before this was fixed.
//
// Canonical form is the LOCAL one, "0XXXXXXXXX", because 215 of the 218
// numbers already stored use it and it is what staff type at the counter.
// Conversion to the "60XXXXXXXXX" that WhatsApp wants happens at the send
// boundary (lib/whatsapp.normalizeWhatsAppTo), not in storage.
//
// Client-safe: no Node imports, so the ordering app can use it too.
// ============================================================================

/** Digits of the national significant number, e.g. "123456789". No prefix. */
function nationalDigits(input: string): string {
  let d = String(input || "").replace(/[^\d]/g, "");
  if (d.startsWith("60")) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  return d;
}

/**
 * The form every table stores: "0XXXXXXXXX".
 * Returns "" when there are no digits at all, so callers can reject early.
 */
export function canonicalPhone(input: string | null | undefined): string {
  const d = nationalDigits(String(input || ""));
  return d ? `0${d}` : "";
}

/** True when this looks like a usable Malaysian number (9-11 national digits). */
export function isPlausiblePhone(input: string | null | undefined): boolean {
  const d = nationalDigits(String(input || ""));
  return d.length >= 8 && d.length <= 11;
}

/**
 * Every shape the same number may already be stored as, canonical first.
 * Lookups must use this until the backfill migration has run everywhere,
 * otherwise a customer created before the fix becomes invisible.
 */
export function phoneVariants(input: string | null | undefined): string[] {
  const d = nationalDigits(String(input || ""));
  if (!d) return [];
  return [`0${d}`, `60${d}`, `+60${d}`, d];
}

/** Local part for a "+60" prefixed input box: "0123456789" → "123456789". */
export function localPhoneDigits(input: string | null | undefined): string {
  return nationalDigits(String(input || ""));
}

/** What the WhatsApp Graph API wants in `to`: "60XXXXXXXXX". */
export function whatsappPhone(input: string | null | undefined): string {
  const d = nationalDigits(String(input || ""));
  return d ? `60${d}` : "";
}

import { NextResponse } from "next/server";
import { requireCustomerApi } from "@/lib/customer-api-auth";
import {
  customerApiError,
  loadCustomerLoyalty,
  resolveOrCreateCustomerForUser,
} from "@/lib/customer-api";

export async function GET() {
  const auth = await requireCustomerApi();
  if (!auth.ok) return auth.response;

  try {
    const customer = await resolveOrCreateCustomerForUser(auth.user, {
      allowCreate: true,
    });

    if (!customer) {
      return customerApiError(404, "Customer profile not found", "NOT_FOUND");
    }

    const loyalty = await loadCustomerLoyalty(customer.id);

    return NextResponse.json(loyalty);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load loyalty";
    return customerApiError(500, message, "INTERNAL_ERROR");
  }
}


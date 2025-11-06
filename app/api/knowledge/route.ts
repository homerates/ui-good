// app/api/knowledge/route.ts
import { NextResponse } from "next/server";
// Use a RELATIVE import to avoid any alias issues during build.
import {
  taxRateForZip,
  loanLimitsForZip,
  productById,
  listProducts,
  listAcronyms,
} from "../../../lib/knowledge";

export const dynamic = "force-static";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const zip = searchParams.get("zip") || undefined;
  const product = searchParams.get("product") || undefined;

  const payload: Record<string, unknown> = {
    status: "ok",
    datasets: ["taxes", "loanLimits", "products", "acronyms"],
  };

  if (zip) {
    payload.zip = zip;
    payload.taxRate = taxRateForZip(zip) ?? null;
    payload.loanLimits = loanLimitsForZip(zip) ?? null;
  }

  if (product) {
    payload.product = product;
    payload.productInfo = productById(product) ?? null;
  }

  if (!zip && !product) {
    payload.products = listProducts();
    payload.acronyms = listAcronyms();
  }

  return NextResponse.json(payload, { status: 200 });
}

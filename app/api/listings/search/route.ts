import { NextResponse } from "next/server";

type Listing = {
  id: string;
  address: string;
  price: number;
  zip?: string;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const zip = (searchParams.get("zip") ?? "").trim();

  // TODO: wire to real listings provider later.
  const results: Listing[] = [];

  return NextResponse.json({
    meta: { path: "listings", tag: "listings-v0", at: new Date().toISOString() },
    query: { q, zip },
    results,
  });
}

import { NextResponse } from "next/server";
export async function POST(req: Request) {
  const { q, zip } = await req.json().catch(() => ({}));
  const list = [
    { id:"L1", address:"123 Maple St", price: 985000, beds:3, baths:2, sqft:1620, url:"#"},
    { id:"L2", address:"456 Oak Ave", price: 1125000, beds:4, baths:3, sqft:2100, url:"#"},
    { id:"L3", address:"789 Pine Ct", price: 1299000, beds:4, baths:3, sqft:2380, url:"#"},
    { id:"L4", address:"22 Brentwood Dr", price: 1475000, beds:4, baths:3, sqft:2550, url:"#"},
    { id:"L5", address:"9 Canyon View", price: 995000, beds:3, baths:2, sqft:1750, url:"#"}
  ];
  return NextResponse.json(list);
}

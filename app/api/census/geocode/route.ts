import { NextRequest, NextResponse } from 'next/server';
import { geocodeAddress, GeocoderError } from '@/censusGeocoder';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let address: string;
  try {
    const body = await req.json();
    address = typeof body?.address === 'string' ? body.address.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!address) {
    return NextResponse.json({ error: 'address is required' }, { status: 400 });
  }

  try {
    const result = await geocodeAddress(address);
    if (!result) {
      return NextResponse.json({ matched: false }, { status: 200 });
    }
    return NextResponse.json({ matched: true, ...result });
  } catch (err) {
    if (err instanceof GeocoderError) {
      return NextResponse.json({ error: (err as GeocoderError).message }, { status: 502 });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

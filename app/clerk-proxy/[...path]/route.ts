import { NextRequest, NextResponse } from 'next/server';

const CLERK_API = 'https://clerk.homerates.ai';
const SKIP_HEADERS = new Set(['host', 'connection', 'transfer-encoding', 'keep-alive']);

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
    const target = new URL(`${CLERK_API}/${path.join('/')}`);
    target.search = req.nextUrl.search;

    const headers = new Headers();
    req.headers.forEach((v, k) => {
        if (!SKIP_HEADERS.has(k.toLowerCase())) headers.set(k, v);
    });
    headers.set('host', 'clerk.homerates.ai');

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const upstream = await fetch(target.toString(), {
        method: req.method,
        headers,
        body: hasBody ? req.body : undefined,
        // @ts-ignore — required for streaming request bodies in Node
        duplex: hasBody ? 'half' : undefined,
    });

    const resHeaders = new Headers();
    upstream.headers.forEach((v, k) => {
        if (!SKIP_HEADERS.has(k.toLowerCase())) resHeaders.set(k, v);
    });

    return new NextResponse(upstream.body, { status: upstream.status, headers: resHeaders });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    return proxy(req, (await params).path);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    return proxy(req, (await params).path);
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    return proxy(req, (await params).path);
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    return proxy(req, (await params).path);
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    return proxy(req, (await params).path);
}

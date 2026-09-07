// app/api/mcp/property-intelligence/route.ts
//
// HomeRates Intelligence Gateway V1, Phase G — the FIRST external invocation
// route this codebase has ever had. Read this file's own header before
// touching it: it is deliberately a thin JSON-RPC 2.0 / MCP protocol
// envelope around ONE unmodified Gateway call. It contains no auth logic,
// no rate-limit logic, no output-shaping logic, and no reference to
// lib/propertyIntelligence.ts or any live provider. Every real decision is
// made by lib/gateway/intelligenceGateway.ts's getPropertyIntelligence(),
// completely unchanged since Phase A-F.
//
// TRANSPORT -- see docs/HOMERATES_EXTERNAL_ADAPTER_V1.md section 3 for the
// full reasoning. Summary: the official @modelcontextprotocol/server v2 SDK
// requires zod@^4.2.0 as a peer dependency; this repo pins zod@3.23.8
// throughout (including lib/gateway/outputSchema.ts). Rather than force a
// repo-wide zod major-version upgrade -- or run two incompatible zod majors
// side by side -- purely to satisfy an OPTIONAL SDK convenience feature that
// a single {address: string} input doesn't need, this route hand-implements
// the MCP wire protocol directly. No new npm dependency was added.
//
// PROTOCOL REVISION -- 2026-07-28, verified directly against the
// authoritative spec (modelcontextprotocol.io/specification/2026-07-28),
// not assumed from memory. This revision removed the connection-scoped
// `initialize` handshake and protocol-level sessions entirely: MCP is now
// fully stateless, and every request carries its own protocol version and
// client capabilities in the JSON-RPC body's `_meta` object, mirrored into
// three HTTP headers (MCP-Protocol-Version, Mcp-Method, Mcp-Name) that
// intermediaries can inspect without parsing the body. There is no
// `server/discover` method in the real spec -- verified across the base
// protocol, transports, and Streamable HTTP pages, none of which mention
// it. Tool discovery is (and remains) `tools/list`.
//
// LEGACY HANDSHAKE -- kept as a narrow, clearly-isolated fallback, not the
// primary flow. Real-world MCP client behavior as of this session could not
// be confirmed either way from first-party OpenAI documentation (the Apps
// SDK help-center article returned 403 to an automated fetch during
// research); OpenAI's own Agents SDK depends on a Python `mcp` package range
// spanning both the legacy and current major versions, implying real
// clients may still speak either era. Per the spec's own documented
// backward-compatibility model (a modern-aware client tries a modern
// request first and only falls back to `initialize` on an unrecognized
// failure shape), keeping this tiny, harmless shim costs nothing and
// protects a private pilot against exactly that uncertainty -- it is
// checked for and handled BEFORE any modern-only validation runs, so a
// legacy client (which would send neither MCP-Protocol-Version nor
// Mcp-Method) is never incorrectly rejected for missing headers it was
// never supposed to send.
//
// AUTH -- reuses the existing Phase C partner credential model unchanged.
// This route extracts `Authorization: Bearer <key>` and passes the raw
// string straight through to getPropertyIntelligence() as apiKeyHeader --
// byte-for-byte the same parameter Phase C-F already validated end-to-end.
// This file does not know what a valid key looks like; only
// lib/gateway/auth.ts's authenticateRequest() (called inside the Gateway)
// does. Only tools/call is auth-gated (via that Gateway call); initialize
// and tools/list answer with static protocol/tool metadata only -- zero
// property data, zero proprietary information -- so no credential check
// gates them.
//
// NO SESSIONS -- no Mcp-Session-Id is ever minted, read, or expected,
// matching this revision's removal of protocol-level sessions.
//
// NO CORS HEADERS -- deliberate. This route is for server-to-server
// invocation by an AI platform's own backend, never a browser.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getPropertyIntelligence } from '../../../../lib/gateway/intelligenceGateway';

const TOOL_NAME = 'get_property_intelligence';
const SUPPORTED_PROTOCOL_VERSION = '2026-07-28';
const SERVER_INFO = { name: 'homerates-property-intelligence', version: '1.0.0' };

const TOOL_DESCRIPTION =
  "Use this tool when a user asks about a specific residential property and would benefit from current " +
  "HomeRates.ai intelligence about the property's value context, financing context, ownership costs, " +
  'market/location context, or property-centered decision drivers. Do not use it for generic mortgage ' +
  'education or general housing questions that do not involve a specific property. This tool does not ' +
  'provide underwriting approval, a mortgage offer, an appraisal, a guaranteed market value, or financial ' +
  'advice -- all figures are educational estimates for one specific address.';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    address: {
      type: 'string',
      description: 'A US postal address for a residential property, e.g. "123 Main St, Anytown, CA 90001".',
    },
  },
  required: ['address'],
  additionalProperties: false,
} as const;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown> & { _meta?: Record<string, unknown> };
}

function jsonRpcResult(id: string | number | null | undefined, result: unknown, status = 200) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, result }, { status });
}

function jsonRpcError(id: string | number | null | undefined, code: number, message: string, status: number, data?: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } }, { status });
}

function extractBearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

// requestIp is trusted transport metadata derived from proxy headers, never
// from client-supplied JSON -- the same convention lib/gateway/rateLimit.ts
// already documents for a future adapter/transport layer.
function extractRequestIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || '0.0.0.0';
}

// Modern per-request validation (spec section "Request Metadata" /
// "Server Validation"). Returns an error Response to send, or null if the
// request is valid and dispatch should proceed. `requireName`: whether
// Mcp-Name / params.name agreement is required for this method (true for
// tools/call, false for tools/list).
function validateModernRequest(req: NextRequest, body: JsonRpcRequest, requireName: boolean): NextResponse | null {
  const { id, method, params } = body;

  const headerProtocolVersion = req.headers.get('mcp-protocol-version');
  const headerMethod = req.headers.get('mcp-method');
  const headerName = req.headers.get('mcp-name');

  const meta = params?._meta as Record<string, unknown> | undefined;
  const bodyProtocolVersion = meta?.['io.modelcontextprotocol/protocolVersion'];
  const bodyClientCapabilities = meta?.['io.modelcontextprotocol/clientCapabilities'];

  // Required standard headers missing/malformed -> HeaderMismatch (-32020), 400.
  if (!headerProtocolVersion) {
    return jsonRpcError(id, -32020, 'Missing required header: MCP-Protocol-Version', 400);
  }
  if (!headerMethod) {
    return jsonRpcError(id, -32020, 'Missing required header: Mcp-Method', 400);
  }
  if (headerMethod !== method) {
    return jsonRpcError(id, -32020, `Header mismatch: Mcp-Method header value '${headerMethod}' does not match body value '${method}'`, 400);
  }
  if (requireName) {
    const bodyName = params?.name;
    if (!headerName) {
      return jsonRpcError(id, -32020, 'Missing required header: Mcp-Name', 400);
    }
    if (headerName !== bodyName) {
      return jsonRpcError(id, -32020, `Header mismatch: Mcp-Name header value '${headerName}' does not match body value '${String(bodyName)}'`, 400);
    }
  }

  // Required body _meta fields (per-request protocol fields) -- absence is
  // a malformed request (-32602 Invalid params, 400), distinct from a
  // header/body mismatch.
  if (bodyProtocolVersion === undefined) {
    return jsonRpcError(id, -32602, 'Missing required _meta field: io.modelcontextprotocol/protocolVersion', 400);
  }
  if (bodyClientCapabilities === undefined) {
    return jsonRpcError(id, -32602, 'Missing required _meta field: io.modelcontextprotocol/clientCapabilities', 400);
  }

  // Header must match body (source of truth is the body; the header is a
  // mirror an intermediary can inspect without parsing it).
  if (headerProtocolVersion !== bodyProtocolVersion) {
    return jsonRpcError(id, -32020, `Header mismatch: MCP-Protocol-Version header value '${headerProtocolVersion}' does not match body value '${String(bodyProtocolVersion)}'`, 400);
  }

  // Unsupported version -- distinct error/code from a header/body mismatch.
  if (bodyProtocolVersion !== SUPPORTED_PROTOCOL_VERSION) {
    return jsonRpcError(id, -32022, `Unsupported protocol version: ${String(bodyProtocolVersion)}`, 400, { supported: [SUPPORTED_PROTOCOL_VERSION] });
  }

  return null;
}

function withServerMeta(result: Record<string, unknown>) {
  return { ...result, _meta: { 'io.modelcontextprotocol/serverInfo': SERVER_INFO } };
}

export async function POST(req: NextRequest) {
  // Origin validation (DNS-rebinding guard, spec "Security & Endpoint").
  // This deployment is a normal internet-facing HTTPS API (not a
  // localhost-bound dev server), and the realistic caller is a server-to-
  // server request from an AI platform's own backend, which typically
  // carries no Origin header at all -- the DNS-rebinding threat model this
  // guards against is specific to a browser-originated request reaching a
  // server bound to localhost. If an Origin header IS present, it is
  // required to at least be a well-formed origin; there is no fixed
  // allowlist for a private pilot with an as-yet-unknown caller origin.
  const origin = req.headers.get('origin');
  if (origin) {
    try { new URL(origin); } catch {
      return new NextResponse(null, { status: 403 });
    }
  }

  let body: JsonRpcRequest;
  try {
    body = await req.json();
  } catch {
    return jsonRpcError(null, -32700, 'Parse error', 400);
  }

  if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return jsonRpcError(body?.id, -32600, 'Invalid Request', 400);
  }

  const { id, method, params } = body;
  const isNotification = !('id' in body);

  // ---- LEGACY HANDSHAKE SHIM (see file header) -- checked first, before
  // any modern-only validation, since a legacy client sends none of the
  // modern headers/meta fields. Not the primary flow. ----
  if (method === 'notifications/initialized') {
    return new NextResponse(null, { status: 202 });
  }
  if (method === 'initialize') {
    return jsonRpcResult(id, {
      protocolVersion: (params?.protocolVersion as string | undefined) ?? '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
  }

  // ---- MODERN PROTOCOL (2026-07-28), stateless, per-request metadata ----
  if (method === 'tools/list') {
    const invalid = validateModernRequest(req, body, false);
    if (invalid) return invalid;
    return jsonRpcResult(id, withServerMeta({
      resultType: 'complete',
      tools: [{ name: TOOL_NAME, description: TOOL_DESCRIPTION, inputSchema: INPUT_SCHEMA }],
    }));
  }

  if (method === 'tools/call') {
    const invalid = validateModernRequest(req, body, true);
    if (invalid) return invalid;

    const toolName = params?.name;
    if (toolName !== TOOL_NAME) {
      return jsonRpcResult(id, withServerMeta({
        resultType: 'complete',
        content: [{ type: 'text', text: `Unknown tool: ${String(toolName)}` }],
        isError: true,
      }));
    }

    // No address validation here -- passed straight through unchanged.
    // getPropertyIntelligence() already validates length/emptiness itself
    // (INVALID_REQUEST) and this route must not reimplement business
    // validation the Gateway already owns.
    const args = params?.arguments as { address?: unknown } | undefined;
    const address = typeof args?.address === 'string' ? args.address : '';

    const apiKeyHeader = extractBearerToken(req);
    const requestIp = extractRequestIp(req);

    const result = await getPropertyIntelligence({ address }, apiKeyHeader, requestIp);

    if (result.ok) {
      return jsonRpcResult(id, withServerMeta({
        resultType: 'complete',
        content: [{ type: 'text', text: JSON.stringify(result.data) }],
        isError: false,
      }));
    }
    // Every Gateway rejection (SERVICE_DISABLED/UNAUTHORIZED/FORBIDDEN/
    // RATE_LIMITED/INVALID_REQUEST/INTERNAL_ERROR) maps uniformly -- no new
    // business-status meaning invented, per instruction section 10.
    return jsonRpcResult(id, withServerMeta({
      resultType: 'complete',
      content: [{ type: 'text', text: `${result.error}: ${result.message}` }],
      isError: true,
    }));
  }

  // Unknown method -- per spec, HTTP 404 (not 200) + JSON-RPC -32601. A
  // notification naming an unknown method still gets no body (202) per
  // JSON-RPC notification semantics, checked first.
  if (isNotification) return new NextResponse(null, { status: 202 });
  return jsonRpcError(id, -32601, `Method not found: ${method}`, 404);
}

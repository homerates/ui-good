// lib/gateway/credentials.ts
//
// Credential issuance/verification/revocation for HomeRates Intelligence
// Gateway partners. Never persists a plaintext key -- only a prefix (public
// lookup identifier) and a hash. The plaintext key is returned exactly once,
// at issuance, and never again.
//
// Hashing choice, deliberate: this is NOT a password. A HomeRates Gateway key
// secret is 256 bits of crypto.randomBytes output -- already far beyond any
// realistic brute-force budget. Slow/salted password-hashing algorithms
// (bcrypt/scrypt/argon2) exist specifically to slow down guessing LOW-entropy
// human-chosen secrets; applying that mechanically here would add real
// latency to every Gateway request for zero actual security benefit against a
// secret with this much entropy. A single fast cryptographic hash (SHA-256)
// is the correct, standard approach for high-entropy API keys (the same
// reasoning GitHub/Stripe-style token schemes use). No new dependency needed --
// Node's built-in crypto module only.
//
// Key format: hrg_<12-hex-char prefix>_<64-hex-char secret> -- e.g.
// hrg_a1b2c3d4e5f6_9f8e7d6c5b4a.... The prefix is the public, non-secret DB
// lookup key (key_prefix column); everything after the second underscore is
// the actual secret, only ever compared as a hash.

import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { getSupabase } from '../supabaseServer';

const KEY_LABEL = 'hrg'; // HomeRates Gateway -- recognizable prefix so a malformed/
                         // non-HomeRates key is rejected before any DB work happens.
const PREFIX_BYTES = 6;  // -> 12 hex chars. Public, stored in the clear as key_prefix;
                          // exists purely as a fast, non-secret DB lookup key.
const SECRET_BYTES = 32; // -> 64 hex chars, 256 bits of real entropy. This part is secret.

const KEY_FORMAT = new RegExp(`^${KEY_LABEL}_([0-9a-f]{${PREFIX_BYTES * 2}})_([0-9a-f]{${SECRET_BYTES * 2}})$`);

export const ALLOWED_GATEWAY_SCOPES = ['property_intelligence:read'] as const;
export type GatewayScope = (typeof ALLOWED_GATEWAY_SCOPES)[number];

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export async function issueCredential(
  partnerId: string,
  scopes: string[] = ['property_intelligence:read'],
): Promise<{ plaintextKey: string; prefix: string }> {
  if (scopes.length === 0) throw new Error('At least one scope is required.');
  const invalid = scopes.filter((s) => !(ALLOWED_GATEWAY_SCOPES as readonly string[]).includes(s));
  if (invalid.length > 0) {
    throw new Error(`Invalid scope(s): ${invalid.join(', ')}. Allowed: ${ALLOWED_GATEWAY_SCOPES.join(', ')}`);
  }

  const sb = getSupabase();
  if (!sb) throw new Error('Supabase unavailable.');

  const { data: partner } = await sb.from('gateway_partners').select('id, status').eq('id', partnerId).maybeSingle();
  if (!partner) throw new Error('Partner not found.');
  // 'pending' is allowed deliberately -- issuing a partner's first credential
  // is a normal part of onboarding a brand-new partner in this admin flow.
  if (partner.status === 'suspended' || partner.status === 'cancelled') {
    throw new Error(`Partner is ${partner.status}; credentials cannot be issued.`);
  }

  const prefix = randomBytes(PREFIX_BYTES).toString('hex');
  const secret = randomBytes(SECRET_BYTES).toString('hex');
  const plaintextKey = `${KEY_LABEL}_${prefix}_${secret}`;
  const keyHash = sha256Hex(plaintextKey);

  const { error } = await sb.from('gateway_credentials').insert({
    partner_id: partnerId,
    key_prefix: prefix,
    key_hash: keyHash,
    scopes,
    status: 'active',
  });
  // key_prefix is UNIQUE at the DB level; a collision on 48 bits of random
  // prefix space for an admin-issued, small credential count is astronomically
  // unlikely -- not retried, surfaced as a real (if practically never-seen) error.
  if (error) throw new Error(`Failed to store credential: ${error.message}`);

  return { plaintextKey, prefix };
}

export async function verifyCredential(
  plaintextKey: string,
): Promise<{ credentialId: string; partnerId: string; scopes: string[] } | null> {
  const match = KEY_FORMAT.exec((plaintextKey ?? '').trim());
  if (!match) return null; // malformed -- rejected with zero DB work
  const [, prefix] = match;

  const sb = getSupabase();
  if (!sb) return null;

  const { data: cred } = await sb
    .from('gateway_credentials')
    .select('id, partner_id, key_hash, scopes, status, expires_at')
    .eq('key_prefix', prefix)
    .maybeSingle();
  if (!cred) return null; // unknown prefix

  const suppliedHashBuf = Buffer.from(sha256Hex(plaintextKey), 'hex');
  const storedHashBuf = Buffer.from(cred.key_hash, 'hex');
  // Constant-time comparison of the two hash digests -- crypto.timingSafeEqual
  // requires equal-length buffers (both are always 32 bytes for SHA-256, but
  // guard the length check first since timingSafeEqual throws, rather than
  // returning false, on a length mismatch).
  if (storedHashBuf.length !== suppliedHashBuf.length || !timingSafeEqual(storedHashBuf, suppliedHashBuf)) {
    return null; // invalid secret
  }

  if (cred.status !== 'active') return null; // revoked or disabled
  if (cred.expires_at && new Date(cred.expires_at).getTime() < Date.now()) return null; // expired

  // Best-effort only -- a failed last_used_at write must never affect an
  // otherwise-successful authentication decision, which has already been made
  // by this point.
  try {
    await sb.from('gateway_credentials').update({ last_used_at: new Date().toISOString() }).eq('id', cred.id);
  } catch {
    /* best-effort */
  }

  return { credentialId: cred.id, partnerId: cred.partner_id, scopes: (cred.scopes as string[]) ?? [] };
}

export async function revokeCredential(credentialId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase unavailable.');

  const { data: existing } = await sb.from('gateway_credentials').select('status').eq('id', credentialId).maybeSingle();
  if (!existing) throw new Error('Credential not found.');
  if (existing.status === 'revoked') return; // idempotent

  const { error } = await sb
    .from('gateway_credentials')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', credentialId);
  if (error) throw new Error(`Failed to revoke credential: ${error.message}`);
}

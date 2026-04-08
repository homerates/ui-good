// app/api/admin/stats/route.ts
// GET — dashboard stats for the admin panel

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/adminAuth";
import { getSupabase } from "../../../../lib/supabaseServer";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const [
    totalResult,
    claimedResult,
    selfResult,
    recentClaimsResult,
    countyResult,
    typeResult,
    recentActivityResult,
    flaggedResult,
  ] = await Promise.all([
    // Total listings
    sb.from("pro_directory").select("id", { count: "exact", head: true }),
    // Claimed listings
    sb.from("pro_directory").select("id", { count: "exact", head: true })
      .not("claimed_by", "is", null),
    // Self-registered (not seeded from DRE/NMLS)
    sb.from("pro_directory").select("id", { count: "exact", head: true })
      .eq("source", "self"),
    // Last 10 claims with pro details
    sb.from("pro_directory")
      .select("id, name, pro_type, city, source, source_id, claimed_at, license_status")
      .not("claimed_by", "is", null)
      .order("claimed_at", { ascending: false })
      .limit(10),
    // Top 10 counties by listing count
    sb.from("pro_directory")
      .select("city, state")
      .not("city", "is", null)
      .limit(5000),
    // Count by pro_type
    sb.from("pro_directory").select("pro_type"),
    // Recent admin activity
    sb.from("admin_activity_log")
      .select("id, created_at, action, target_name, notes")
      .order("created_at", { ascending: false })
      .limit(20),
    // Flagged listings
    sb.from("pro_directory").select("id", { count: "exact", head: true })
      .eq("license_status", "Flagged"),
  ]);

  // Aggregate county counts from city data (limited sample)
  const cityCounts: Record<string, number> = {};
  for (const row of (countyResult.data ?? [])) {
    const c = row.city ?? "Unknown";
    cityCounts[c] = (cityCounts[c] ?? 0) + 1;
  }
  const topCities = Object.entries(cityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([city, count]) => ({ city, count }));

  // Count by type
  const typeCounts: Record<string, number> = {};
  for (const row of (typeResult.data ?? [])) {
    const t = row.pro_type ?? "unknown";
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  }

  return NextResponse.json({
    totals: {
      all:      totalResult.count ?? 0,
      claimed:  claimedResult.count ?? 0,
      unclaimed: (totalResult.count ?? 0) - (claimedResult.count ?? 0),
      self:     selfResult.count ?? 0,
      flagged:  flaggedResult.count ?? 0,
    },
    byType: typeCounts,
    topCities,
    recentClaims: recentClaimsResult.data ?? [],
    recentActivity: recentActivityResult.data ?? [],
  });
}

// app/professionals/[id]/layout.tsx
// Server component — exports generateMetadata so the client page gets OG tags
// without needing to convert the complex client component to a server component

import type { Metadata } from "next";
import { getSupabase } from "../../../lib/supabaseServer";

const PRO_TYPE_LABEL: Record<string, string> = {
  lo:           "Loan Officer",
  lo_company:   "Mortgage Company",
  agent:        "Real Estate Agent",
  agent_broker: "Real Estate Broker",
};

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const sb = getSupabase();

  const fallback: Metadata = {
    title: "Professional Profile — HomeRates.ai",
    description: "View professional mortgage and real estate profiles on HomeRates.ai.",
  };

  if (!sb) return fallback;

  const { data } = await sb
    .from("pro_directory")
    .select("name, company_name, city, state, pro_type, bio, photo_url, license_status")
    .eq("id", id)
    .maybeSingle();

  if (!data) return fallback;

  const typeLabel = PRO_TYPE_LABEL[data.pro_type] ?? "Professional";
  const location  = [data.city, data.state].filter(Boolean).join(", ");
  const company   = data.company_name ? ` · ${data.company_name}` : "";

  const title = `${data.name} — ${typeLabel}${company} | HomeRates.ai`;
  const description = data.bio
    ? data.bio.slice(0, 160)
    : `${data.name} is a ${typeLabel}${location ? ` in ${location}` : ""}${company}. View profile and connect on HomeRates.ai.`;

  const imageUrl = data.photo_url
    ?? "https://chat.homerates.ai/assets/og-default.png";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://chat.homerates.ai/professionals/${id}`,
      siteName: "HomeRates.ai",
      images: [{ url: imageUrl, width: 400, height: 400, alt: data.name }],
      type: "profile",
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function ProfessionalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

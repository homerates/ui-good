// app/api/share/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

const SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase =
    SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
        ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false },
        })
        : null;

function generateSlug(length = 7): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let slug = "";
    for (let i = 0; i < length; i++) {
        slug += chars[Math.floor(Math.random() * chars.length)];
    }
    return slug;
}

async function sendShareEmail(toEmail: string, shareUrl: string, senderName?: string): Promise<void> {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) {
        console.error('[Share Email] RESEND_API_KEY not configured');
        throw new Error('RESEND_API_KEY not configured');
    }

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'onboarding@resend.dev',
                to: [toEmail],
                subject: `${senderName || 'Someone'} shared a conversation with you`,
                html: `
                    <h2>You've been invited to view a conversation</h2>
                    <p>${senderName || 'A colleague'} thought you'd find this helpful.</p>
                    <p><a href="${shareUrl}" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Conversation</a></p>
                    <p style="color: #666; font-size: 14px;">This link allows you to view and continue the conversation. You can ask follow-up questions even without an account.</p>
                `,
            }),
        });

        if (!res.ok) {
            const error = await res.text();
            console.error('[Share Email] Resend API error:', error);
            throw new Error(`Failed to send email: ${error}`);
        }

        const result = await res.json();
        console.log('[Share Email] Sent successfully:', result);
    } catch (err: any) {
        console.error('[Share Email] Error:', err.message);
        throw err;
    }
}

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();
        const body = await req.json();
        const { messages, email } = body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json({ error: "messages array required" }, { status: 400 });
        }

        if (!supabase) {
            return NextResponse.json({ error: "Database not configured" }, { status: 500 });
        }

        // Generate a unique slug
        let slug = generateSlug();
        let attempts = 0;

        while (attempts < 5) {
            const { data: existing } = await supabase
                .from("shared_threads")
                .select("slug")
                .eq("slug", slug)
                .maybeSingle();

            if (!existing) break;
            slug = generateSlug();
            attempts++;
        }

        // Save full thread to shared_threads table
        const { error: insertErr } = await supabase
            .from("shared_threads")
            .insert({
                slug,
                clerk_user_id: userId || "anon",
                messages,
                created_at: new Date().toISOString(),
            });

        if (insertErr) {
            console.error("[Share] Insert error:", insertErr.message);
            return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
        }

        const base = process.env.NEXT_PUBLIC_APP_BASE_URL || "https://chat.homerates.ai";
        const shareUrl = `${base}/s/${slug}`;

        console.log("[Share] Created:", shareUrl, "by:", userId || "anon", "messages:", messages.length);

        // If email provided, send it
        if (email && typeof email === 'string' && email.includes('@')) {
            try {
                await sendShareEmail(email, shareUrl, userId || undefined);
                console.log("[Share] Email sent to:", email);
            } catch (emailErr: any) {
                console.error("[Share] Email error:", emailErr.message);
                // Don't fail the whole request if email fails
                return NextResponse.json({
                    ok: true,
                    url: shareUrl,
                    slug,
                    emailSent: false,
                    emailError: emailErr.message
                });
            }
        }

        return NextResponse.json({ ok: true, url: shareUrl, slug, emailSent: !!email });

    } catch (err: any) {
        console.error("[Share] Error:", err?.message || err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

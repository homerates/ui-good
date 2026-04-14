// app/api/share/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import { emailShell } from "../../../lib/sendEmail";

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

async function sendLoNotification(loEmail: string, borrowerName: string, preview: string, shareUrl: string): Promise<void> {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) return;

    await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: 'HomeRates.ai <digest@homerates.ai>',
            to: [loEmail],
            subject: `${borrowerName} just shared a mortgage analysis`,
            html: emailShell(`
                <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">Shared Analysis</p>
                <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#f0f4ff;line-height:1.2;">${borrowerName} shared a conversation</p>
                ${preview ? `<div style="background:#141b28;border-left:3px solid #00e87a;border-radius:0 8px 8px 0;padding:14px 16px;margin:0 0 24px;font-size:14px;color:#b0c4b8;line-height:1.6;font-style:italic;">"${preview}"</div>` : '<div style="margin-bottom:24px;"></div>'}
                <a href="${shareUrl}" style="display:inline-block;background:#00e87a;color:#07100f;font-weight:700;font-size:15px;padding:14px 28px;border-radius:999px;text-decoration:none;">View Conversation →</a>
            `, "HomeRates.ai · Your borrower shared this thread."),
        }),
    });
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
                from: 'HomeRates.ai <noreply@homerates.ai>',
                to: [toEmail],
                subject: `${senderName || 'Someone'} shared a conversation with you`,
                html: emailShell(`
                    <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">Shared Conversation</p>
                    <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#f0f4ff;line-height:1.2;">You've been invited to view a conversation</p>
                    <p style="margin:0 0 24px;font-size:15px;color:#7a9e8a;"><strong style="color:#e8f5ee;">${senderName || 'A colleague'}</strong> thought you'd find this helpful.</p>
                    <a href="${shareUrl}" style="display:inline-block;background:#00e87a;color:#07100f;font-weight:700;font-size:15px;padding:14px 28px;border-radius:999px;text-decoration:none;">View Conversation →</a>
                    <p style="margin:24px 0 0;font-size:13px;color:#7a9e8a;">This link allows you to view and continue the conversation. You can ask follow-up questions even without an account.</p>
                `, "HomeRates.ai · homerates.ai"),
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
                return NextResponse.json({
                    ok: true, url: shareUrl, slug,
                    emailSent: false, emailError: emailErr.message
                });
            }
        }

        // ── LO notification — if sharer is a borrower, ping their LO ──────────
        if (userId) {
            try {
                // Find borrower record by Clerk user id (stored as external_ref)
                const { data: borrower } = await supabase!
                    .from("borrowers")
                    .select("id, name, loan_officer_id")
                    .eq("external_ref", userId)
                    .maybeSingle();

                if (borrower?.loan_officer_id) {
                    const { data: lo } = await supabase!
                        .from("loan_officers")
                        .select("email")
                        .eq("id", borrower.loan_officer_id)
                        .maybeSingle();

                    if (lo?.email) {
                        // Extract first user question from the thread
                        const firstQ = (messages as any[]).find((m: any) => m.role === 'user')?.content ?? '';
                        const preview = firstQ.length > 120 ? firstQ.slice(0, 120) + '…' : firstQ;
                        const borrowerName = borrower.name ?? 'Your borrower';

                        await sendLoNotification(lo.email, borrowerName, preview, shareUrl);
                        console.log("[Share] LO notified:", lo.email);
                    }
                }
            } catch (loErr: any) {
                // Don't fail the share if LO notification fails
                console.warn("[Share] LO notification error:", loErr.message);
            }
        }

        return NextResponse.json({ ok: true, url: shareUrl, slug, emailSent: !!email });

    } catch (err: any) {
        console.error("[Share] Error:", err?.message || err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

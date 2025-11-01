import NextAuth, { type NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
// import { prisma } from "@/lib/prisma";
// import { compare } from "bcryptjs"; // <- removed for now
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const authOptions: NextAuthOptions = {
    providers: [
        Credentials({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials.password) return null;

                // TEMP DEV STUB: accept any email with password "test123"
                if (credentials.password === "test123") {
                    return {
                        id: "dev-user",
                        name: "Dev User",
                        email: String(credentials.email),
                    };
                }
                return null;
            },
        }),
    ],
    session: { strategy: "jwt" as const }, // literal type fixes TS error
    pages: {
        signIn: "/login",
    },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };

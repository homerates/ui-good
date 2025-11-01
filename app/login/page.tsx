import NextAuth, { type NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
// import { prisma } from "@/lib/prisma";
// import { compare } from "bcryptjs"; // <-- remove for now

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

                // --- TEMP DEV STUB (no DB yet) ---
                // Replace with Prisma + bcrypt compare() later
                if (credentials.password === "test123") {
                    return {
                        id: "dev-user",
                        name: "Dev User",
                        email: credentials.email as string,
                    };
                }
                return null;
            },
        }),
    ],
    session: { strategy: "jwt" as const }, // <- ensure literal type
    pages: {
        signIn: "/login",
    },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };

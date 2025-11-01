// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
// import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";

export const authOptions = {
    providers: [
        Credentials({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials.password) return null;

                // --- REAL DB (uncomment when Prisma is wired) ---
                // const user = await prisma.user.findUnique({ where: { email: credentials.email }});
                // if (!user) return null;
                // const ok = await compare(credentials.password, user.password);
                // if (!ok) return null;
                // return { id: user.id, name: user.name ?? "", email: user.email };

                // --- TEMP DEV STUB (no DB yet) ---
                if (credentials.password === "test123") {
                    return { id: "dev-user", name: "Dev User", email: credentials.email };
                }
                return null;
            },
        }),
    ],
    session: { strategy: "jwt" },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };

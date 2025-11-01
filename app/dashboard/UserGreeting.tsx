"use client";
import { useUser } from "@clerk/nextjs";

export default function UserGreeting() {
    const { user } = useUser();
    if (!user) return null;
    return (
        <p style={{ color: "#4b5563", marginBottom: 16 }}>
            Hello again, {user.firstName ?? "there"}.
        </p>
    );
}

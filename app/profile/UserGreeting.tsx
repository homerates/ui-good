"use client";

import { UserButton } from "@clerk/nextjs";

export default function UserGreeting() {
    return (
        <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">Welcome</span>
            <UserButton />
        </div>
    );
}

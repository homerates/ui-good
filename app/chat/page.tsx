// ==== REPLACE ENTIRE FILE: app/chat/page.tsx ====
import { redirect } from "next/navigation";

export default function ChatAlias() {
    // /chat should point to the real chat that's currently on /
    redirect("/");
}

// app/(pro)/layout.tsx
// Pro route-group shell — Stage 2. Mode is fixed by the group, not a runtime prop.
// See ARCHITECTURE_DECISIONS.md AD-6.
import AppShell from "../components/AppShell";

export default function ProLayout({ children }: { children: React.ReactNode }) {
  return <AppShell mode="pro">{children}</AppShell>;
}

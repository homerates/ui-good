// app/(consumer)/layout.tsx
// Consumer route-group shell — Stage 2. Mode is fixed by the group, not a runtime prop.
// See ARCHITECTURE_DECISIONS.md AD-6.
import AppShell from "../components/AppShell";

export default function ConsumerLayout({ children }: { children: React.ReactNode }) {
  return <AppShell mode="consumer">{children}</AppShell>;
}

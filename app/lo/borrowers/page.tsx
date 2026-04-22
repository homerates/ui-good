// app/lo/borrowers/page.tsx — redirects to /pro/clients for backwards compatibility
import { redirect } from "next/navigation";
export default function LoBorrowersRedirect() {
  redirect("/pro/clients");
}

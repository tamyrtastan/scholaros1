import { PublicShell } from "@/components/site";
import { getCurrentUser } from "@/core/auth/session";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // Public pages must survive an auth outage: show the signed-out header instead of failing.
  const user = await getCurrentUser().catch(() => null);
  return <PublicShell signedIn={!!user}>{children}</PublicShell>;
}

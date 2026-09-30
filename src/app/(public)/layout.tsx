import { PublicShell } from "@/components/site";
import { getCurrentUser } from "@/core/auth/session";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell signedIn={!!(await getCurrentUser())}>{children}</PublicShell>;
}

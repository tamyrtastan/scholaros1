import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PaperFix AI — peer-review comments into a revision plan", template: "%s · PaperFix AI" },
  description: "Upload your manuscript and peer-review comments. PaperFix maps every comment to your paper, identifies missing information, proposes revisions, and prepares a structured response to reviewers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

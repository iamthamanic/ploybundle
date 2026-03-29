import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRUD SaaS - localdev",
  description: "Standard SaaS application with CRUD operations, user management, and background processing.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

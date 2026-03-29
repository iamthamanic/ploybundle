import type { Metadata } from "next";
import "./globals.css";
import { CredentialsOnboardingModal } from "@/components/credentials-onboarding-modal";
import { HubSidebar } from "@/components/hub-sidebar";
import { loadBoard } from "@/lib/load-board";

function formatProjectLabel(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function hubTitleFromBoard(board: Awaited<ReturnType<typeof loadBoard>>): string {
  const d = board.displayName?.trim();
  return (d && d.length > 0 ? d : formatProjectLabel(board.projectName)) + " — Project hub";
}

export async function generateMetadata(): Promise<Metadata> {
  const board = await loadBoard();
  return {
    title: hubTitleFromBoard(board),
    description: "Ploybundle control plane: area status, whitelisted stack actions, and provider consoles (advanced) for Directus, Windmill, storage, and deploy.",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const board = await loadBoard();
  const accent = board.theme.primaryColor || "#10b981";
  return (
    <html lang="en" data-theme="dark">
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: ":root { --p: " + accent + "; --pf: " + accent + "; }",
          }}
        />
      </head>
      <body data-theme="dark" className="min-h-screen bg-transparent text-slate-100">
        <CredentialsOnboardingModal />
        <div className="flex min-h-screen">
          <HubSidebar board={board} />
          <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-transparent">{children}</div>
        </div>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthNav from "@/components/auth/AuthNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Resume Matcher",
  description: "Match resumes against job requirements",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background font-sans antialiased`}>
        <header className="w-full border-b bg-background/50">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" className="font-semibold">Resume Matcher</a>
            <nav>
              <AuthNav />
            </nav>
          </div>
        </header>
        <main className="max-w-6xl mx-auto p-6">{children}</main>
      </body>
    </html>
  );
}


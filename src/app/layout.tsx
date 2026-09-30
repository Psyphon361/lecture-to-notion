import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { themeInitScript } from "@/lib/theme";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lecture to Notes",
  description: "Turn a lecture PowerPoint into a structured draft of study notes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <header className="flex justify-end px-6 py-2">
          <ThemeToggle />
        </header>
        {children}
      </body>
    </html>
  );
}

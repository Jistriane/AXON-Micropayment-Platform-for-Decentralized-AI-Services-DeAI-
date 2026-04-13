import type { Metadata } from "next";
import { Space_Grotesk, Sora } from "next/font/google";
import "./globals.css";

const titleFont = Sora({ subsets: ["latin"], variable: "--font-title" });
const bodyFont = Space_Grotesk({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "AXON | Decentralized AI Payments",
  description: "Decentralized marketplace for AI consumption with micropayments",
  other: {
    google: "notranslate"
  },
  icons: {
    icon: "/Logo.png",
    apple: "/Logo.png"
  },
  openGraph: {
    title: "AXON | Decentralized AI Payments",
    description: "Decentralized marketplace for AI consumption with micropayments",
    images: ["/Logo.png"]
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" translate="no" className="notranslate" suppressHydrationWarning>
      <body className={`${titleFont.variable} ${bodyFont.variable} notranslate`}>{children}</body>
    </html>
  );
}

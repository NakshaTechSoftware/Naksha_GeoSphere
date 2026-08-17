import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { ConsentGate } from "@/components/auth/ConsentGate";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Naksha GeoSphere | The Geospatial Data Marketplace",
  description:
    "Explore, preview, purchase, and securely download premium geospatial data for any selected area of interest.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/favicon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Naksha GeoSphere | The Geospatial Data Marketplace",
    description:
      "Explore, preview, purchase, and securely download premium geospatial data for any selected area of interest.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Naksha GeoSphere | The Geospatial Data Marketplace",
    description:
      "Explore, preview, purchase, and securely download premium geospatial data for any selected area of interest.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} min-h-screen bg-polar-pearl font-sans text-obsidian-graphite antialiased`}>
        {children}
        {/* First-open consent for the mobile app (GPS + voice). Renders nothing on
            the web and nothing after the user has accepted once. */}
        <ConsentGate />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";

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
      </body>
    </html>
  );
}

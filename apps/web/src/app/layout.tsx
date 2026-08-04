import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Naksha GeoSphere — The Geospatial Data Marketplace",
  description:
    "Naksha GeoSphere is a geospatial data marketplace for discovering, previewing, and purchasing raster, vector, and point-cloud datasets.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-cloud-mist font-sans text-spatial-navy antialiased">
        {children}
      </body>
    </html>
  );
}

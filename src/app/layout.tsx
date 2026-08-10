import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TripPilot AI",
    template: "%s · TripPilot AI",
  },
  description:
    "Plan a trip end to end — flights, hotels, meals, activities, and every walk, subway ride and rideshare in between.",
  applicationName: "TripPilot AI",
};

export const viewport: Viewport = {
  themeColor: "#0d1b24",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}

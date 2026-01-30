import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Volleyball Tracker",
  description: "Volleyball stats tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen text-gray-900">
        {children}
      </body>
    </html>
  );
}

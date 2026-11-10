import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trace · Engineering Decision Agent",
  description:
    "From engineering conversations to decisions, owned work and a clear next step.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

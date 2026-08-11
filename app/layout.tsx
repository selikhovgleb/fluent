import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL || "http://localhost:3000"),
  title: "Fluent — Your everyday English coach",
  description: "Improve real work messages and remember useful English vocabulary.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Fluent — Your everyday English coach",
    description: "Improve real work messages and remember useful English vocabulary.",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Fluent English coach" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

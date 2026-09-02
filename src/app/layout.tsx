import type { Metadata, Viewport } from "next";
import { Rubik_Mono_One } from "next/font/google";

import "./globals.css";

const display = Rubik_Mono_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "E o narga?", template: "%s · E o narga?" },
  description: "Ranking de rolês do Centro. Interno. Zoeira.",
  applicationName: "E o narga?",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "E o narga?" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0e1110",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${display.variable} dark h-full antialiased`}>
      <body className="bg-background text-foreground flex min-h-full flex-col">{children}</body>
    </html>
  );
}

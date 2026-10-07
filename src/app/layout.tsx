import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";

export const metadata: Metadata = {
  title: { default: "Revolution Imper Gestão 360", template: "%s | Revolution Imper" },
  description: "Controle total da sua operação.",
  applicationName: "Revolution Imper Gestão 360",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Revolution 360", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0e2a3b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

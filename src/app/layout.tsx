import type { Metadata, Viewport } from "next";
import { Press_Start_2P } from "next/font/google";
import SWRegister from "@/components/SWRegister";
import "./globals.css";

const pixelFont = Press_Start_2P({
  variable: "--font-pixel",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Git Attack",
  description: "Aprendé Git desde cero estilo arcade: commits, ramas y merges en una oficina 8-bit, con un repositorio simulado.",
  // Todavía en revisión: que no salga en buscadores hasta darlo por terminado.
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Git Attack",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${pixelFont.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <SWRegister />
      </body>
    </html>
  );
}

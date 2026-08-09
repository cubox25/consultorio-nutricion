import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Literata } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const display = Literata({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Consultorio de Nutrición",
    template: "%s | Consultorio de Nutrición",
  },
  description:
    "Consultorio de nutrición profesional. Reservas online, seguimiento personalizado y atención en dos consultorios.",
  openGraph: {
    title: "Consultorio de Nutrición",
    description:
      "Nutrición profesional con reserva de turnos online y seguimiento personalizado.",
    locale: "es_AR",
    type: "website",
    url: siteUrl,
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${display.variable} ${body.variable} h-full`}>
      <body className="min-h-full antialiased">
        {children}
        <Toaster
          richColors
          position="top-right"
          closeButton
          toastOptions={{
            style: {
              borderRadius: "1rem",
              border: "1px solid var(--border)",
            },
          }}
        />
      </body>
    </html>
  );
}

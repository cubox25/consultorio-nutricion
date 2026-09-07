import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Pamela Guerrero | Licenciada en Nutrición",
    template: "%s | Pamela Guerrero",
  },
  description:
    "Consultorio de nutrición profesional. Educación nutricional, antropometría y seguimiento cercano.",
  openGraph: {
    title: "Pamela Guerrero | Licenciada en Nutrición",
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
    <html lang="es" className={`${poppins.variable} h-full`}>
      <body className="min-h-full font-sans antialiased">
        {children}
        <Toaster
          richColors
          position="top-right"
          closeButton
          toastOptions={{
            style: {
              borderRadius: "1rem",
              border: "1px solid var(--border)",
              fontFamily: "var(--font-body), Poppins, sans-serif",
            },
          }}
        />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { CookieBanner } from "@/components/cookie-banner";
import "./globals.css";

// Self-hosted (34 KB variable woff2) — no Google Fonts request at build or
// runtime, which matters on weak connections and for offline-ish reliability.
const gabarito = localFont({
  src: "./fonts/Gabarito-Variable.woff2",
  variable: "--font-sans",
  weight: "400 900",
});

export const metadata: Metadata = {
  title: "CTJCC Marikina",
  description: "Come To Jesus Community Church of Marikina — Youth & YA Attendance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${gabarito.variable} font-sans antialiased`}>
        {children}
        <CookieBanner />
        <Toaster
          position="top-center"
          richColors
          closeButton
          theme="light"
          toastOptions={{
            classNames: {
              toast: "glass",
            },
          }}
        />
      </body>
    </html>
  );
}

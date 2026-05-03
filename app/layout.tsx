import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { CookieBanner } from "@/components/cookie-banner";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <CookieBanner />
        <Toaster
          position="top-center"
          richColors
          closeButton
          theme="dark"
          toastOptions={{
            classNames: {
              toast: "glass !border-white/[0.08]",
            },
          }}
        />
      </body>
    </html>
  );
}

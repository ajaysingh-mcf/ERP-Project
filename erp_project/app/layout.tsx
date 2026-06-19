import type { Metadata } from "next";
import { Geist, Geist_Mono, Roboto, Merriweather } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/auth";
import ClientLayout from "@/components/ClientLayout";

const merriweatherHeading = Merriweather({ subsets: ["latin"], variable: "--font-heading" });
const roboto = Roboto({ subsets: ["latin"], variable: "--font-sans" });
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ERP System",
  description: "Enterprise Resource Planning System",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user
    ? { name: session.user.name, email: session.user.email }
    : undefined;

  return (
    <html
      lang="en"
      className={cn(
        "h-full antialiased",
        geistSans.variable,
        geistMono.variable,
        roboto.variable,
        merriweatherHeading.variable,
        "font-sans"
      )}
    >
      <body className="h-full">
        <ClientLayout user={user}>{children}</ClientLayout>
      </body>
    </html>
  );
}

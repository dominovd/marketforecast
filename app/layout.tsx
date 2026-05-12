import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "MarketForecast — AI-Powered Price Analysis",
  description: "Data-driven price analysis for crypto and commodities. AI-generated market scenarios. Not financial advice.",
  verification: {
    google: "TbbwdzDQV28NH5Lx5wIlFV-TvPMtzptHA0_5LbpqXbc",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Fraunces, Poppins } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "The Visibility Session · Digital Savvy Studios",
  description:
    "A ₦250,000 brand review we give free to 8 founders a month. We look you up the way a serious buyer would, then show you in 30 minutes what's winning them over and what's quietly sending them elsewhere.",
};

export const viewport: Viewport = {
  themeColor: "#212121",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${poppins.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}

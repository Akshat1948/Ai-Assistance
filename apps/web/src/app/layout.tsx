import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Aether - Personal AI Assistant",
  description: "A premium, memory-enabled multi-modal personal AI assistant powered by Claude.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full bg-[#0a0b10] text-gray-100 antialiased">
      <body className={`${inter.className} h-full overflow-hidden`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}


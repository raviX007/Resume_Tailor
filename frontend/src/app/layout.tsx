import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Resume Tailor",
  description: "Generate JD-tailored PDF resumes using LLM + LaTeX",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Resume Tailor",
    description: "AI-powered resume tailoring — match any job description in seconds",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 text-gray-800 antialiased`}>
        {children}
      </body>
    </html>
  );
}

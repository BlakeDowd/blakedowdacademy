import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ConditionalNavbar from "@/components/ConditionalNavbar";
import { StatsProvider } from "@/contexts/StatsContext";
import { AuthProvider } from "@/contexts/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Golf App",
  description: "Your personal golf training companion",
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
        <ErrorBoundary>
          <AuthProvider>
            <StatsProvider>
              {/* Global Click-Through: Wrap children in z-0 div to ensure navbar is on top */}
              <div className="relative z-0">
                {children}
              </div>
            </StatsProvider>
          </AuthProvider>
          {/* Layout Clean-up: Temporarily remove StatsProvider and AuthProvider wrappers around ConditionalNavbar to see if a provider is crashing */}
          {/* Force Interactive: Ensure ConditionalNavbar has pointerEvents: auto and high z-index to override any crashed components */}
          <div style={{ pointerEvents: 'auto', zIndex: 99999 }}>
            <ConditionalNavbar />
          </div>
        </ErrorBoundary>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ConditionalNavbar from "@/components/ConditionalNavbar";
import { StatsProvider } from "@/contexts/StatsContext";
import { AuthProvider } from "@/contexts/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProfileGuard from "@/components/ProfileGuard";

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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased relative`}
      >
        <ErrorBoundary>
          <AuthProvider>
            <ProfileGuard>
              <StatsProvider>
                <div className="h-screen w-full flex justify-center bg-gray-100 overflow-hidden" style={{ overflowX: 'clip' }}>
                  <div className="h-full w-full max-w-md flex flex-col bg-gray-50 shadow-2xl relative border-x border-gray-200">
                    <main className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-clip pb-14" style={{ overflowX: 'clip' }}>
                      {children}
                    </main>
                    <footer className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50">
                      <ConditionalNavbar />
                    </footer>
                  </div>
                </div>
              </StatsProvider>
            </ProfileGuard>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}

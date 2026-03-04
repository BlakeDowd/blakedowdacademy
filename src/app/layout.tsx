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
        {/* Cache Buster: Add this at the very top of the body to physically wipe the 'poisoned' session every time the page loads */}
        <script dangerouslySetInnerHTML={{ __html: 'localStorage.clear(); sessionStorage.clear();' }} />
        <ErrorBoundary>
          <AuthProvider>
            <ProfileGuard>
              <StatsProvider>
                <div className="h-screen w-full flex justify-center bg-gray-100 overflow-hidden" style={{ overflowX: 'clip' }}>
                  <div className="h-full w-full max-w-md flex flex-col bg-gray-50 shadow-2xl relative border-x border-gray-200">
                    <main className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-clip" style={{ overflowX: 'clip' }}>
                      {children}
                    </main>
                    <footer className="shrink-0 w-full z-50">
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

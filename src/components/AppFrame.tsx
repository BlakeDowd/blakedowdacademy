"use client";

import { usePathname } from "next/navigation";
import ConditionalNavbar from "./ConditionalNavbar";

export default function AppFrame({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLibrary = pathname === "/library";

  return (
    <div
      className="h-screen w-full flex justify-center bg-gray-100 overflow-hidden"
      style={{ overflowX: "clip" }}
    >
      <div
        className="h-full w-full max-w-md flex flex-col bg-gray-50 shadow-2xl relative border-x border-gray-200 transition-all"
      >
        <main
          className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-clip pb-36"
          style={{ overflowX: "clip" }}
        >
          {children}
        </main>
        <footer className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50">
          <ConditionalNavbar />
        </footer>
      </div>
    </div>
  );
}

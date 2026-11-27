import type { Metadata } from "next";
import { Outfit } from "next/font/google";

const outfit = Outfit({ subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Book a lesson · Blake Dowd Golf",
  description: "Book a golf lesson at Stonecutters Ridge Golf Club. Pay with Square.",
};

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return <div className={outfit.className}>{children}</div>;
}

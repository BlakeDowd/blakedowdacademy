import type { ReactNode } from "react";
import Link from "next/link";

export function BookShell({
  title,
  lede,
  backHref,
  children,
}: {
  title: string;
  lede?: string;
  backHref?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f7f8f7] text-[#121816] [&_h1]:normal-case [&_h2]:normal-case [&_h3]:normal-case">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <a href="https://blakedowdgolf.com.au/" className="text-sm font-semibold tracking-tight">
            Blake Dowd Golf
          </a>
          <a href="tel:+61421409662" className="text-sm text-[#5d6b64]">
            0421 409 662
          </a>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-5 py-8 pb-24">
        {backHref ? (
          <Link href={backHref} className="text-sm font-medium text-[#5d6b64]">
            All lessons
          </Link>
        ) : null}
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">{title}</h1>
        {lede ? <p className="mt-3 max-w-xl text-lg text-[#5d6b64]">{lede}</p> : null}
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}

export function BookButton({
  children,
  type = "button",
  disabled,
  onClick,
}: {
  children: ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#e57025] px-5 py-2.5 text-sm font-semibold text-[#1a140f] disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export const bookFieldClass =
  "mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-base outline-none focus:border-[#e57025]";

import type { Metadata } from "next";
import { PricingCards } from "@/components/pricing";

export const metadata: Metadata = { title: "Pricing" };

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-3xl font-semibold sm:text-4xl">Simple pricing for one revision or many</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Start free. Pay once for a single revision round, or subscribe if you revise several papers a year.
        Prices shown are launch placeholders.
      </p>
      <div className="mt-10"><PricingCards /></div>
      <p className="mt-6 text-sm text-muted">Usage allowances protect service quality: each plan includes a monthly analysis budget.</p>
    </div>
  );
}

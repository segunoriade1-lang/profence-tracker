"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, PlusIcon } from "@/components/Icons";
import OrderForm from "@/components/OrderForm";

export default function NewOrderPage() {
  return (
    <>
      <Link href="/" className="back-link">
        <ArrowLeft size={16} /> Back to search
      </Link>
      <div className="page-head" style={{ marginTop: 14 }}>
        <div>
          <div className="eyebrow">
            <PlusIcon size={14} /> New
          </div>
          <h1>Create inventory order</h1>
          <p className="muted">Log what came in, snap a photo, and tag where it&apos;s stored.</p>
        </div>
      </div>
      <Suspense fallback={<div className="skeleton" style={{ height: 360 }} />}>
        <NewOrderForm />
      </Suspense>
    </>
  );
}

function NewOrderForm() {
  const loc = useSearchParams().get("loc") ?? undefined;
  return <OrderForm initialLocationId={loc} />;
}

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, EditIcon } from "@/components/Icons";
import OrderForm from "@/components/OrderForm";
import SetupNotice from "@/components/Setup";
import { useOrder } from "@/lib/data";

export default function EditOrderPage() {
  const { id } = useParams<{ id: string }>();
  const { order, loading, error } = useOrder(id);

  if (loading) return <div className="skeleton" style={{ height: 320 }} />;
  if (error) return <SetupNotice error={error} />;
  if (!order)
    return (
      <div className="empty">
        <strong>Order not found</strong>
        <Link href="/">Back to search</Link>
      </div>
    );

  return (
    <>
      <Link href={`/orders/${order.id}`} className="back-link">
        <ArrowLeft size={16} /> Back to order
      </Link>
      <div className="page-head" style={{ marginTop: 14 }}>
        <div>
          <div className="eyebrow">
            <EditIcon size={14} /> Editing
          </div>
          <h1 className="mono">{order.poNumber}</h1>
        </div>
      </div>
      <OrderForm existing={order} />
    </>
  );
}

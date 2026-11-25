"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowLeft, CheckIcon, ChevronRight, EditIcon, SearchIcon, TrashIcon } from "@/components/Icons";
import QrLabel from "@/components/QrLabel";
import QuickActions from "@/components/QuickActions";
import SetupNotice from "@/components/Setup";
import SiteMap from "@/components/SiteMap";
import { ageLevel, deleteOrder, isReleased, setOrderMapPos, useLocations, useOrder, usePhoto } from "@/lib/data";

function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const saved = useSearchParams().get("saved");
  const router = useRouter();
  const { order, loading, error } = useOrder(id);
  const photo = usePhoto(id, !!order?.hasPhoto);
  const { locations } = useLocations();
  const zoneId = order ? locations.find((l) => l.id === order.locationId)?.zoneId ?? null : null;
  const [deleting, setDeleting] = useState(false);
  const [posMsg, setPosMsg] = useState<string | null>(null);

  if (loading)
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 96 }} />
        <div className="skeleton" style={{ height: 320 }} />
      </div>
    );
  if (error) return <SetupNotice error={error} />;
  if (!order)
    return (
      <div className="empty">
        <div className="empty-icon">
          <SearchIcon size={24} />
        </div>
        <strong>This order doesn&apos;t exist</strong>
        <span>It may have been deleted.</span>
        <Link href="/">Back to search</Link>
      </div>
    );

  async function onDelete() {
    if (!order || !confirm(`Delete order ${order.poNumber}? This can't be undone.`)) return;
    setDeleting(true);
    await deleteOrder(order);
    router.push("/");
  }

  const released = isReleased(order);
  const created = order.createdAt?.toDate?.();
  const fmt = (d: Date) =>
    d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <>
      {saved && (
        <div className="success">
          <CheckIcon size={18} /> Order saved
        </div>
      )}
      <div className="row between">
        <Link href="/" className="back-link">
          <ArrowLeft size={16} /> Back to search
        </Link>
        <div className="row">
          <Link href={`/orders/${order.id}/edit`} className="btn">
            <EditIcon size={16} /> Edit
          </Link>
          <button className="btn btn-danger" onClick={onDelete} disabled={deleting}>
            <TrashIcon size={16} /> {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      <div className="card qa-card">
        <QuickActions order={order} locations={locations} />
      </div>

      <div className="form-grid">
        <div className="card">
          <dl className="detail-list">
            <div className="detail-item">
              <dt>Purchase order</dt>
              <dd className="po po-lg">{order.poNumber}</dd>
            </div>
            {order.itemName && (
              <div className="detail-item">
                <dt>Item</dt>
                <dd style={{ fontWeight: 600, fontSize: "1.05rem" }}>{order.itemName}</dd>
              </div>
            )}
            {order.description && (
              <div className="detail-item">
                <dt>Description</dt>
                <dd className="prewrap">{order.description}</dd>
              </div>
            )}
            {order.hasPhoto && (photo || order.photoThumb) && (
              <div className="detail-item">
                <dt>Photo</dt>
                <dd>
                  <div className="photo-frame">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo ?? order.photoThumb ?? ""} alt="Order photo" />
                  </div>
                </dd>
              </div>
            )}
            {created && (
              <div className="detail-item">
                <dt>Added</dt>
                <dd className="muted">{fmt(created)}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="stack sticky-panel">
          {zoneId && (
            <div className="card map-mini">
              <div className="row between" style={{ marginBottom: 10 }}>
                <span className="zone-group-title">{released ? "Where it was" : "Where to find it"}</span>
                <Link href={`/map?zone=${zoneId}`} className="small" style={{ fontWeight: 650 }}>
                  Open blueprint <ChevronRight size={14} style={{ verticalAlign: -2 }} />
                </Link>
              </div>
              <SiteMap
                compact
                selectedId={zoneId}
                visibleIds={new Set(locations.map((l) => l.zoneId).filter(Boolean) as string[])}
                dots={[{ id: order.id, zoneId, label: order.poNumber, pos: order.mapPos ?? null, age: ageLevel(order) }]}
                activeDotId={order.id}
                onDotMove={released ? undefined : async (id, x, y) => {
                  setPosMsg(null);
                  try {
                    await setOrderMapPos(id, x, y);
                    setPosMsg("Spot saved");
                  } catch (e) {
                    setPosMsg(`Couldn't save: ${(e as Error).message}`);
                  }
                }}
              />
              <p className="hint" style={{ marginTop: 10 }}>
                {released
                  ? "Where it was before it was picked up."
                  : posMsg ?? (order.mapPos ? "Drag the dot to move it." : "Drag the dot to the exact spot this was dropped.")}
              </p>
            </div>
          )}
          <div className="card stack" style={{ alignItems: "center" }}>
            <QrLabel id={order.id} poNumber={order.poNumber} sub={order.locationName} />
          </div>
        </div>
      </div>
    </>
  );
}

export default function OrderPage() {
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 320 }} />}>
      <OrderDetail />
    </Suspense>
  );
}

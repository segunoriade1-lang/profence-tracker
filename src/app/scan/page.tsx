"use client";

import { useEffect, useMemo, useState } from "react";
import { QrIcon, SearchIcon } from "@/components/Icons";
import QuickActions from "@/components/QuickActions";
import Scanner from "@/components/Scanner";
import SetupNotice from "@/components/Setup";
import { useLocations, useOrders, type InventoryOrder } from "@/lib/data";

/** Order id from a label link (any host — old localhost labels still work). */
function idFromText(text: string) {
  const m = text.match(/\/orders\/([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : null;
}

const norm = (s: string) => s.trim().toLowerCase();

type Result = { kind: "found"; id: string } | { kind: "miss"; text: string; reason: string };

export default function ScanPage() {
  const { orders, loading, error } = useOrders();
  const { locations } = useLocations();
  const [result, setResult] = useState<Result | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  function resolve(text: string): Result {
    const id = idFromText(text);
    if (id) {
      return orders.some((o) => o.id === id)
        ? { kind: "found", id }
        : { kind: "miss", text, reason: "This label's PO isn't in the tracker any more (it may have been deleted)." };
    }
    // Not one of our links: treat the code (or typed text) as a PO number.
    const exact = orders.filter((o) => norm(o.poNumber) === norm(text));
    if (exact.length >= 1) return { kind: "found", id: exact[0].id };
    const partial = orders.filter((o) => norm(o.poNumber).includes(norm(text)));
    if (partial.length === 1) return { kind: "found", id: partial[0].id };
    return {
      kind: "miss",
      text,
      reason: partial.length > 1 ? `${partial.length} POs contain “${text}” — type more of it.` : `No PO matches “${text}”.`,
    };
  }

  function handle(text: string) {
    if (loading) {
      setPendingText(text); // resolve once orders arrive
      return;
    }
    setResult(resolve(text));
  }

  useEffect(() => {
    if (!loading && pendingText) {
      setResult(resolve(pendingText));
      setPendingText(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, pendingText]);

  // A miss clears itself so scanning carries on.
  useEffect(() => {
    if (result?.kind !== "miss") return;
    const t = setTimeout(() => setResult(null), 3500);
    return () => clearTimeout(t);
  }, [result]);

  const order: InventoryOrder | undefined = useMemo(
    () => (result?.kind === "found" ? orders.find((o) => o.id === result.id) : undefined),
    [result, orders]
  );

  const found = result?.kind === "found";

  return (
    <>
      <SetupNotice error={error} />
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1>Scan a label</h1>
          <p className="muted">Point the camera at a PO&apos;s QR code. Everything stays in this tab.</p>
        </div>
      </div>

      <div className={`scan-layout ${found ? "has-result" : ""}`}>
        <div className="stack" style={{ gap: 12 }}>
          <div className={`scanner-wrap ${found ? "is-collapsed" : ""}`}>
            <Scanner active={!result && !pendingText} onResult={handle} />
            {found && (
              <button className="btn btn-primary scan-next" onClick={() => setResult(null)}>
                <QrIcon size={18} /> Scan next
              </button>
            )}
          </div>

          {result?.kind === "miss" && (
            <div className="notice scan-miss" role="alert">
              <span className="grow">{result.reason}</span>
              <button className="btn" onClick={() => setResult(null)}>
                Scan again
              </button>
            </div>
          )}

          <form
            className="scan-manual"
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.trim()) handle(manual.trim());
            }}
          >
            <input
              placeholder="No label? Type the PO number"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              aria-label="PO number"
              className="mono"
            />
            <button className="btn" disabled={!manual.trim()}>
              <SearchIcon size={16} /> Find
            </button>
          </form>
        </div>

        {found && (
          <div className="card">
            {order ? (
              <QuickActions key={order.id} order={order} locations={locations} showHeader showMap />
            ) : (
              <div className="skeleton" style={{ height: 200 }} />
            )}
          </div>
        )}
      </div>
    </>
  );
}

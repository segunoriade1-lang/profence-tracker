"use client";

import { firebaseConfigured } from "@/lib/firebase";

export default function SetupNotice({ error }: { error?: string | null }) {
  if (firebaseConfigured && !error) return null;
  return (
    <div className="notice">
      {!firebaseConfigured ? (
        <>
          <strong>Firebase isn&apos;t connected yet.</strong> Add your Firebase web config to{" "}
          <code>.env.local</code> (see <code>.env.example</code>) and restart the app.
        </>
      ) : (
        <>
          <strong>Couldn&apos;t load data:</strong> {error}
        </>
      )}
    </div>
  );
}

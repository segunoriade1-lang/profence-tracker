"use client";

import QRCode from "qrcode";

/** The link a QR code holds: scanning it opens the order page. */
export function orderUrl(id: string) {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/orders/${id}`;
}

/**
 * Draws a printable label: QR code with the PO number underneath.
 * Returns a PNG data URL.
 */
export async function makeLabel(id: string, poNumber: string, sub?: string): Promise<string> {
  const qrSize = 480;
  const pad = 32;
  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, orderUrl(id), {
    width: qrSize,
    margin: 0,
    errorCorrectionLevel: "M",
  });

  const width = qrSize + pad * 2;
  const textBlock = sub ? 120 : 84;
  const height = qrSize + pad * 2 + textBlock;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(qrCanvas, pad, pad);

  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  let fontSize = 48;
  ctx.font = `700 ${fontSize}px ui-monospace, Menlo, Consolas, monospace`;
  while (ctx.measureText(poNumber).width > width - pad * 2 && fontSize > 18) {
    fontSize -= 2;
    ctx.font = `700 ${fontSize}px ui-monospace, Menlo, Consolas, monospace`;
  }
  ctx.fillText(poNumber, width / 2, qrSize + pad + 20);

  if (sub) {
    ctx.font = `500 26px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.fillStyle = "#333333";
    let s = sub;
    while (ctx.measureText(s).width > width - pad * 2 && s.length > 4) s = s.slice(0, -2);
    if (s !== sub) s = s.slice(0, -1) + "…";
    ctx.fillText(s, width / 2, qrSize + pad + 20 + fontSize + 12);
  }

  return canvas.toDataURL("image/png");
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function printLabel(dataUrl: string, title: string) {
  const w = window.open("", "_blank", "width=600,height=800");
  if (!w) return;
  w.document.write(`<!doctype html><title>${escapeHtml(title)}</title>
<style>@page{margin:10mm}body{margin:0;display:flex;justify-content:center}img{width:70mm;height:auto}</style>
<img src="${dataUrl}" onload="window.print();setTimeout(()=>window.close(),300)">`);
  w.document.close();
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Shrinks a photo into a JPEG data URL no longer than `maxChars`
 * (Firestore documents are capped at 1 MB, so photos are kept well under).
 */
export async function imageToDataUrl(
  file: Blob,
  maxSide: number,
  maxChars: number
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    let side = maxSide;
    let quality = 0.8;
    for (let attempt = 0; attempt < 8; attempt++) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/jpeg", quality);
      if (url.length <= maxChars) return url;
      if (quality > 0.55) quality -= 0.1;
      else side = Math.round(side * 0.8);
    }
    throw new Error("Photo is too large to save. Try a different photo.");
  } finally {
    bitmap.close();
  }
}

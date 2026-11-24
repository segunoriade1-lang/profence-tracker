"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";
import { CameraIcon } from "./Icons";

type Status = "starting" | "scanning" | "paused" | "denied" | "unavailable" | "error";

/**
 * Live camera QR scanner. Calls onResult once per code, then pauses until `active` is set again.
 */
export default function Scanner({
  active,
  onResult,
}: {
  active: boolean;
  onResult: (text: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef(active);
  const onResultRef = useRef(onResult);
  const [status, setStatus] = useState<Status>("starting");
  const [message, setMessage] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [restart, setRestart] = useState(0);

  activeRef.current = active;
  onResultRef.current = onResult;

  // Start the camera once; stop it when leaving the page.
  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let last = 0;

    async function start() {
      setStatus("starting");
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unavailable");
        setMessage(
          window.isSecureContext
            ? "This browser can't use the camera."
            : "The camera only works over a secure (https) connection."
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorchSupported(Boolean(caps.torch));
        const video = videoRef.current!;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        await video.play();
        setStatus(activeRef.current ? "scanning" : "paused");
        raf = requestAnimationFrame(tick);
      } catch (e) {
        const err = e as DOMException;
        if (err.name === "NotAllowedError" || err.name === "SecurityError") {
          setStatus("denied");
          setMessage("Camera access was blocked.");
        } else if (err.name === "NotFoundError" || err.name === "OverconstrainedError") {
          setStatus("unavailable");
          setMessage("No camera was found on this device.");
        } else {
          setStatus("error");
          setMessage(err.message || "Couldn't start the camera.");
        }
      }
    }

    function tick(t: number) {
      raf = requestAnimationFrame(tick);
      const video = videoRef.current;
      if (!activeRef.current || !video || video.readyState < 2 || t - last < 120) return;
      last = t;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;
      // decode a downscaled frame for speed
      const scale = Math.min(1, 720 / Math.max(vw, vh));
      const w = Math.round(vw * scale);
      const h = Math.round(vh * scale);
      const canvas = (canvasRef.current ??= document.createElement("canvas"));
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const code = jsQR(img.data, w, h, { inversionAttempts: "attemptBoth" });
      if (code?.data) {
        activeRef.current = false;
        try {
          navigator.vibrate?.(60);
        } catch {}
        onResultRef.current(code.data);
      }
    }

    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [restart]);

  useEffect(() => {
    setStatus((s) => (s === "scanning" || s === "paused" ? (active ? "scanning" : "paused") : s));
  }, [active]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn(!torchOn);
    } catch {
      setTorchSupported(false);
    }
  }

  const failed = status === "denied" || status === "unavailable" || status === "error";

  return (
    <div className={`scanner ${status}`}>
      <video ref={videoRef} muted playsInline className="scanner-video" />
      {!failed && (
        <div className="scanner-frame" aria-hidden>
          <span className="c tl" />
          <span className="c tr" />
          <span className="c bl" />
          <span className="c br" />
          {status === "scanning" && <span className="scanner-line" />}
        </div>
      )}
      <div className="scanner-status" role="status">
        {status === "starting" && "Starting camera…"}
        {status === "scanning" && "Point at a PO's QR label"}
        {status === "paused" && "Paused"}
      </div>
      {torchSupported && !failed && (
        <button type="button" className="scanner-torch" onClick={toggleTorch} aria-pressed={torchOn}>
          {torchOn ? "Light off" : "Light on"}
        </button>
      )}
      {failed && (
        <div className="scanner-fail">
          <span className="empty-icon">
            <CameraIcon size={24} />
          </span>
          <strong>{message}</strong>
          {status === "denied" && (
            <span className="small">
              Allow camera access for this site in your browser settings (the 🔒 or ⓘ icon next to the address), then
              try again.
            </span>
          )}
          <button className="btn" onClick={() => setRestart((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

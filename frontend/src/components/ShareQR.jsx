import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { QrCode, X } from "lucide-react";

/**
 * Compact QR-code reveal for share URLs. Click to expand → modal-style overlay.
 */
export default function ShareQR({ url, label = "Scan to view on mobile" }) {
  const [open, setOpen] = useState(false);
  if (!url) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="nb-sm bg-white p-2 text-xs font-bold flex items-center gap-1 justify-center w-full"
        data-testid="share-qr-btn"
        title="Show QR code"
      >
        <QrCode size={12} /> QR
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4"
          onClick={() => setOpen(false)}
          data-testid="qr-modal"
        >
          <div
            className="nb bg-white p-6 max-w-sm w-full text-center relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute top-2 right-2 p-1"
              data-testid="qr-close"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <div className="label-mono mb-3">{label}</div>
            <div className="nb-sm p-4 bg-white inline-block">
              <QRCodeSVG
                value={url}
                size={220}
                level="M"
                includeMargin={false}
                fgColor="#0F0F0F"
                bgColor="#FFFFFF"
              />
            </div>
            <div className="text-xs break-all mt-3 text-zinc-600">{url}</div>
          </div>
        </div>
      )}
    </>
  );
}

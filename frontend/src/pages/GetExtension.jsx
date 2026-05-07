import { useEffect } from "react";
import { Link } from "react-router-dom";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const ZIP_URL = `${BACKEND}/api/extension/download`;

export default function GetExtension() {
  useEffect(() => {
    // Auto-trigger download
    const a = document.createElement("a");
    a.href = ZIP_URL;
    a.download = "snapburst-extension.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  return (
    <div className="min-h-screen grid place-items-center bg-[#FAFAFA] px-5 py-10">
      <div className="max-w-2xl w-full nb-lg p-8 sm:p-10 bg-white text-center" data-testid="get-extension-page">
        <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-[#FDE047] border-2 border-[#0F0F0F] grid place-items-center shadow-[4px_4px_0_#0F0F0F]">
          <span className="text-4xl">📦</span>
        </div>
        <div className="label-mono mb-2">Latest build · v1.0.3</div>
        <h1 className="font-display text-4xl sm:text-5xl font-black mb-3">Your download is starting…</h1>
        <p className="text-zinc-700 mb-6">
          If it didn't start automatically, click the button below.
        </p>
        <a href={ZIP_URL} download="snapburst-extension.zip" className="nb-btn nb-btn-tangerine text-base inline-flex" data-testid="manual-download">
          ⬇  Download snapburst-extension.zip
        </a>

        <div className="mt-6">
          <Link to="/submit-checklist" className="nb-btn bg-white inline-flex !py-2 !px-3 text-sm" data-testid="open-checklist">
            ✅ Open the 6-step submit checklist →
          </Link>
        </div>

        <div className="mt-10 text-left nb p-5 bg-[#A7F3D0]" data-testid="submit-steps">
          <div className="label-mono mb-2">Quick reference</div>
          <ol className="list-decimal pl-5 text-sm space-y-2">
            <li>Open <a href="https://chrome.google.com/webstore/devconsole" target="_blank" rel="noreferrer" className="font-semibold underline">chrome.google.com/webstore/devconsole</a></li>
            <li>Click "+ New Item" → upload the ZIP you just downloaded.</li>
            <li>Use the <Link to="/submit-checklist" className="font-semibold underline">submit checklist</Link> to copy listing copy + screenshots.</li>
            <li>Privacy URL: <code className="font-mono-accent">{typeof window !== "undefined" ? window.location.origin : ""}/privacy</code></li>
          </ol>
        </div>
      </div>
    </div>
  );
}


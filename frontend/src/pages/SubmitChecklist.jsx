import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, API } from "../lib/api";
import { Check, Copy, Download, ExternalLink, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const ZIP_URL = `${API}/extension/download`;
const PRIVACY_URL = `${typeof window !== "undefined" ? window.location.origin : ""}/privacy`;

const STORE_COPY = {
  short: "Capture, record, and ship feedback fast — screenshots, full-page, 4K screen recording with annotations and instant share links.",
  detailed: `SnapBurst is the friendliest way to capture and share what's on your screen.

• Screenshots: visible area, custom region, or full-page (with auto-scroll).
• Recording: tab, window, or full screen at 1080p / 2K / 4K — plus webcam + mic.
• Annotate: arrows, boxes, text, blur — without leaving the page.
• Share: instant short links you can drop in Slack, Jira, Trello, Gmail.
• AI Assistant: ask questions about any screenshot — vision-enabled.

No watermark. Free tier forever. Built for fast feedback loops.`,
  category: "Productivity",
  language: "English",
  tags: "screenshot, recorder, screen capture, annotation, GIF, screencast",
};

function CopyRow({ label, value, testid }) {
  const onCopy = () => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };
  return (
    <div className="flex items-start gap-2 mb-2">
      <div className="flex-1">
        <div className="label-mono mb-1">{label}</div>
        <pre className="font-mono-accent text-xs whitespace-pre-wrap bg-white nb-sm p-2 max-h-44 overflow-auto" data-testid={`${testid}-value`}>{value}</pre>
      </div>
      <button onClick={onCopy} className="nb-sm bg-[#FDE047] p-2 mt-5" data-testid={`${testid}-copy`} title={`Copy ${label}`}>
        <Copy size={14} />
      </button>
    </div>
  );
}

function Step({ n, title, done, onToggle, children }) {
  return (
    <div className={`nb p-5 mb-4 ${done ? "bg-[#A7F3D0]" : "bg-white"}`} data-testid={`step-${n}`}>
      <button onClick={onToggle} className="flex items-center gap-3 w-full text-left" data-testid={`step-${n}-toggle`}>
        <span className={`w-9 h-9 grid place-items-center border-2 border-[#0F0F0F] rounded-lg shadow-[2px_2px_0_#0F0F0F] ${done ? "bg-white" : "bg-[#FDE047]"}`}>
          {done ? <Check size={18} /> : <span className="font-display font-black">{n}</span>}
        </span>
        <span className="font-display text-xl font-black flex-1">{title}</span>
        <span className="label-mono">{done ? "done" : "todo"}</span>
      </button>
      <div className="mt-4 pl-12 text-sm text-zinc-700 space-y-3">{children}</div>
    </div>
  );
}

export default function SubmitChecklist() {
  const [done, setDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem("snapburst_submit_checklist") || "{}"); } catch { return {}; }
  });
  const [assets, setAssets] = useState([]);
  const [info, setInfo] = useState(null);
  const [storeId, setStoreId] = useState("");
  const [savedId, setSavedId] = useState("");

  useEffect(() => { localStorage.setItem("snapburst_submit_checklist", JSON.stringify(done)); }, [done]);
  useEffect(() => {
    api.get("/extension/listing-assets").then(r => setAssets(r.data?.items || [])).catch(() => {});
    fetch(`${API}/extension/info`).then(r => r.json()).then(setInfo).catch(() => {});
    api.get("/extension/store-id").then(r => setSavedId(r.data?.extension_id || "")).catch(() => {});
  }, []);

  const toggle = (k) => setDone(d => ({ ...d, [k]: !d[k] }));
  const completed = Object.values(done).filter(Boolean).length;
  const total = 6;

  const saveStoreId = async () => {
    try {
      await api.put("/extension/store-id", { extension_id: storeId.trim() });
      setSavedId(storeId.trim());
      toast.success("Extension ID saved");
      setStoreId("");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <header className="border-b-2 border-[#0F0F0F] bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between">
          <Link to="/dashboard" className="inline-flex items-center gap-2 font-semibold text-sm" data-testid="back-dashboard">
            <ArrowLeft size={16} /> Dashboard
          </Link>
          <div className="label-mono">Submit Checklist</div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-10">
        <div className="label-mono mb-2">Chrome Web Store</div>
        <h1 className="font-display text-4xl sm:text-5xl font-black mb-3" data-testid="checklist-heading">
          Ship SnapBurst in 6 steps
        </h1>
        <p className="text-zinc-700 mb-6 max-w-2xl">
          Walk through each step — copy the listing fields, download the bundle,
          and paste your extension ID once approved. Progress saves automatically.
        </p>

        <div className="nb p-4 bg-[#FDE047] mb-8 flex items-center justify-between" data-testid="progress-bar">
          <div className="font-display font-black text-lg">{completed} / {total} complete</div>
          <div className="flex-1 mx-4 h-3 bg-white nb-sm overflow-hidden">
            <div className="h-full bg-[#0F0F0F] transition-all" style={{ width: `${(completed / total) * 100}%` }} />
          </div>
          <div className="label-mono">{Math.round((completed / total) * 100)}%</div>
        </div>

        <Step n={1} title="Download the latest bundle" done={!!done.s1} onToggle={() => toggle("s1")}>
          <p>Always grab the freshly-built ZIP from the server — never re-upload an old file.</p>
          {info && (
            <div className="text-xs text-zinc-600">
              Build: <strong>v{info.version}</strong> · {info.files?.length || 0} files · {(info.size_bytes / 1024).toFixed(1)} KB
            </div>
          )}
          <a href={ZIP_URL} className="nb-btn nb-btn-tangerine !py-2 !px-3 text-sm inline-flex" data-testid="download-zip">
            <Download size={14} /> snapburst-extension.zip
          </a>
        </Step>

        <Step n={2} title="Open the developer console" done={!!done.s2} onToggle={() => toggle("s2")}>
          <p>Sign in (one-time $5 dev fee) and create a new item.</p>
          <a
            href="https://chrome.google.com/webstore/devconsole"
            target="_blank"
            rel="noreferrer"
            className="nb-btn bg-white !py-2 !px-3 text-sm inline-flex"
            data-testid="open-devconsole"
          >
            <ExternalLink size={14} /> chrome.google.com/webstore/devconsole
          </a>
        </Step>

        <Step n={3} title="Paste the listing copy" done={!!done.s3} onToggle={() => toggle("s3")}>
          <CopyRow label="Short description (132 char max)" value={STORE_COPY.short} testid="copy-short" />
          <CopyRow label="Detailed description" value={STORE_COPY.detailed} testid="copy-detailed" />
          <div className="grid grid-cols-3 gap-3 mt-2">
            <div className="nb-sm bg-white p-2"><div className="label-mono">Category</div><div className="text-sm font-bold">{STORE_COPY.category}</div></div>
            <div className="nb-sm bg-white p-2"><div className="label-mono">Language</div><div className="text-sm font-bold">{STORE_COPY.language}</div></div>
            <div className="nb-sm bg-white p-2"><div className="label-mono">Tags</div><div className="text-sm">{STORE_COPY.tags}</div></div>
          </div>
        </Step>

        <Step n={4} title="Upload screenshots (1280×800)" done={!!done.s4} onToggle={() => toggle("s4")}>
          <p>Five ready-made store screenshots ship with the extension. Right-click → Save image, or click to open.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="store-assets-grid">
            {assets.map(a => (
              <a key={a.name} href={`${API}${a.url}`} target="_blank" rel="noreferrer" className="nb-sm bg-white p-1 block hover:translate-y-[-2px] transition-transform">
                <img src={`${API}${a.url}`} alt={a.name} className="w-full h-28 object-cover" loading="lazy" />
                <div className="label-mono mt-1 px-1 truncate">{a.name}</div>
              </a>
            ))}
            {!assets.length && <div className="text-xs text-zinc-500 col-span-3">No store assets found.</div>}
          </div>
        </Step>

        <Step n={5} title="Privacy URL" done={!!done.s5} onToggle={() => toggle("s5")}>
          <CopyRow label="Privacy policy URL" value={PRIVACY_URL} testid="copy-privacy" />
          <p className="text-xs text-zinc-600">Already published at <Link to="/privacy" className="underline">/privacy</Link>.</p>
        </Step>

        <Step n={6} title="Save your extension ID after approval" done={!!done.s6} onToggle={() => toggle("s6")}>
          <p>Chrome assigns a 32-character ID (a–p only). Pasting it here unlocks deep-link CTAs across the site.</p>
          {savedId ? (
            <div className="nb-sm bg-[#A7F3D0] p-3">
              <div className="label-mono">Saved ID</div>
              <code className="font-mono-accent text-sm break-all">{savedId}</code>
            </div>
          ) : (
            <div className="text-xs text-zinc-500">Not set yet.</div>
          )}
          <div className="flex gap-2">
            <input
              value={storeId}
              onChange={(e) => setStoreId(e.target.value.toLowerCase())}
              placeholder="abcdefghijklmnopabcdefghijklmnop"
              className="nb-input flex-1 font-mono-accent text-xs"
              maxLength={32}
              data-testid="store-id-input"
            />
            <button onClick={saveStoreId} disabled={!storeId || storeId.length !== 32} className="nb-btn nb-btn-tangerine !py-2 !px-3 text-sm" data-testid="store-id-save">
              Save
            </button>
          </div>
        </Step>

        <div className="mt-8 text-center text-xs text-zinc-500">
          Tip: Reviews typically complete in 1–3 days. Watch for emails from <span className="font-mono-accent">chromewebstore-noreply@google.com</span>.
        </div>
      </main>
    </div>
  );
}

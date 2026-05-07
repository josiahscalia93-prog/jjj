import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { Star, Download, ChevronLeft, ChevronRight, Camera, Shield, Users, Calendar } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export default function StorePreview() {
  const [info, setInfo] = useState(null);
  const [assets, setAssets] = useState([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    fetch(`${BACKEND}/api/extension/info`).then(r => r.json()).then(setInfo).catch(() => {});
    fetch(`${BACKEND}/api/extension/listing-assets`).then(r => r.json()).then(d => setAssets(d.items || [])).catch(() => {});
  }, []);

  const downloadUrl = `${BACKEND}/api/extension/download`;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Navbar />
      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <div className="label-mono mb-1">Chrome Web Store — preview</div>
            <h1 className="font-display text-3xl sm:text-4xl font-black">How your listing will look</h1>
            <p className="text-sm text-zinc-600 mt-1">This mocks the public store page. Tweak listing text in the dev console — visual style is set.</p>
          </div>
          <a href={downloadUrl} className="nb-btn nb-btn-yellow text-sm" data-testid="store-preview-download">
            <Download size={16}/> Download .zip
          </a>
        </div>

        {/* Mocked Web Store listing */}
        <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden" data-testid="store-mock">
          {/* breadcrumb */}
          <div className="px-6 py-3 border-b border-zinc-200 text-xs text-zinc-500 flex items-center gap-2">
            <span>chrome web store</span>
            <span>›</span>
            <span>Extensions</span>
            <span>›</span>
            <span>Productivity</span>
            <span>›</span>
            <span className="text-zinc-700">{info?.name || "SnapBurst"}</span>
          </div>

          {/* header */}
          <div className="p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-start border-b border-zinc-200">
            <img src={`${BACKEND}/api/extension/listing-asset/icon128.png`}
                 onError={(e) => { e.target.src = `${BACKEND}/api/extension/listing-asset/01-hero.png`; }}
                 alt="SnapBurst icon"
                 className="hidden" />
            {/* render the actual extension icon128 */}
            <div className="w-32 h-32 rounded-2xl border-2 border-[#0F0F0F] bg-[#FDE047] grid place-items-center shadow-[4px_4px_0_#0F0F0F]" data-testid="store-icon">
              <Camera size={56} strokeWidth={2.4} />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-zinc-900">{info?.name || "SnapBurst — Screen Capture, Record & Share"}</h2>
              <a href="#" className="text-sm text-blue-600 hover:underline">snapburst.com</a>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <div className="flex text-amber-500">
                  {[1,2,3,4,5].map(s => <Star key={s} size={14} fill="#f59e0b" stroke="#f59e0b" />)}
                </div>
                <span className="text-zinc-600">4.8 (preview)</span>
                <span className="text-zinc-400">·</span>
                <span className="text-zinc-600">Productivity</span>
                <span className="text-zinc-400">·</span>
                <span className="text-zinc-600">v{info?.version || "1.0.0"}</span>
              </div>
              <p className="mt-4 text-sm text-zinc-700">
                Screenshot, full-page capture, and HD screen + webcam + mic recording. Annotate and share via Slack, Trello, Jira & Gmail.
              </p>
              <div className="mt-5 flex gap-3">
                <button className="px-4 py-2 rounded-md bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700" data-testid="store-add-btn">Add to Chrome</button>
                <a href={downloadUrl} className="px-4 py-2 rounded-md border border-zinc-300 text-zinc-700 font-semibold text-sm hover:bg-zinc-50">Download ZIP</a>
              </div>
            </div>
          </div>

          {/* screenshots gallery */}
          <div className="p-6 sm:p-8 border-b border-zinc-200">
            <h3 className="text-sm font-semibold text-zinc-900 mb-3">Screenshots</h3>
            {assets.length === 0 ? (
              <div className="text-sm text-zinc-500">No listing images yet.</div>
            ) : (
              <div>
                <div className="relative bg-zinc-100 rounded-lg overflow-hidden border border-zinc-200" data-testid="store-screenshot">
                  <img src={`${BACKEND}${assets[idx]?.url}`} alt="" className="w-full block" />
                  {assets.length > 1 && (
                    <>
                      <button onClick={() => setIdx(i => (i - 1 + assets.length) % assets.length)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 rounded-full w-9 h-9 grid place-items-center shadow border border-zinc-200" data-testid="store-prev"><ChevronLeft/></button>
                      <button onClick={() => setIdx(i => (i + 1) % assets.length)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 rounded-full w-9 h-9 grid place-items-center shadow border border-zinc-200" data-testid="store-next"><ChevronRight/></button>
                    </>
                  )}
                </div>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {assets.map((a, i) => (
                    <button key={a.name} onClick={() => setIdx(i)} className={`shrink-0 border-2 rounded ${i===idx ? "border-blue-600" : "border-transparent"}`}>
                      <img src={`${BACKEND}${a.url}`} alt="" className="h-20 w-32 object-cover rounded" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* about */}
          <div className="p-6 sm:p-8 border-b border-zinc-200">
            <h3 className="text-sm font-semibold text-zinc-900 mb-3">Overview</h3>
            <div className="text-sm text-zinc-700 space-y-2">
              <p>SnapBurst is a joyful Chrome extension for screen capture & screen recording. Snap full pages, record HD video with webcam + mic, mark it up with arrows and shapes, and ship instant share links — straight to Slack, Trello, Jira & Gmail.</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>📸 Screenshots — visible area, selected area, scrolling full-page</li>
                <li>🎬 Screen recording — 4K / 2K / 1080p / GIF preset, with system audio + mic</li>
                <li>✏️ Annotation editor — pen, arrows, shapes, text, blur</li>
                <li>🔗 Public share links + direct posting to Slack &amp; Jira</li>
                <li>🤖 AI assistant (GPT-5.2) with image vision</li>
                <li>☁️ Cloud library + local download · No watermark · No time limit</li>
              </ul>
            </div>
          </div>

          {/* meta strip */}
          <div className="p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="flex items-center gap-2 text-zinc-500"><Calendar size={14}/>Updated</div>
              <div className="font-semibold text-zinc-800">February 2026</div>
            </div>
            <div>
              <div className="flex items-center gap-2 text-zinc-500"><Shield size={14}/>Privacy</div>
              <Link to="/privacy" className="font-semibold text-blue-600 hover:underline">Privacy policy</Link>
            </div>
            <div>
              <div className="flex items-center gap-2 text-zinc-500"><Users size={14}/>Users</div>
              <div className="font-semibold text-zinc-800">Just launched</div>
            </div>
            <div>
              <div className="flex items-center gap-2 text-zinc-500">Size</div>
              <div className="font-semibold text-zinc-800">{info ? `${(info.size_bytes/1024).toFixed(1)} KB` : "—"}</div>
            </div>
          </div>
        </div>

        {/* submission checklist */}
        <div className="mt-8 nb p-6 bg-[#A7F3D0]" data-testid="submission-checklist">
          <div className="label-mono mb-2">Submission checklist</div>
          <h3 className="font-display text-2xl font-bold mb-3">Ready for the dev console</h3>
          <ul className="space-y-2 text-sm">
            <li>✅ <strong>ZIP file</strong> — <a href={downloadUrl} className="underline font-semibold" data-testid="checklist-zip">{downloadUrl}</a></li>
            <li>✅ <strong>Manifest V3</strong> · <strong>icons 16/48/128</strong> · <strong>description ≤132 chars</strong></li>
            <li>✅ <strong>Privacy policy URL</strong> — <Link to="/privacy" className="underline font-semibold">{window.location.origin}/privacy</Link></li>
            <li>✅ <strong>Listing screenshots (1280×800)</strong> — {assets.length} ready ({assets.map(a => a.name.replace(".png","")).join(", ")})</li>
            <li>📝 You still need: store description (use overview above), category = <strong>Productivity</strong>, language = English.</li>
          </ul>
          <a href="https://chrome.google.com/webstore/devconsole" target="_blank" rel="noreferrer" className="nb-btn nb-btn-ink mt-4 !text-white" data-testid="open-devconsole">Open Chrome Dev Console →</a>
        </div>
      </main>
    </div>
  );
}

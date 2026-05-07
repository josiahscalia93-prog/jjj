import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { API } from "../lib/api";
import ShareQR from "../components/ShareQR";
import { Camera, Download } from "lucide-react";

export default function SharePage() {
  const { token } = useParams();
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState(null);
  const fileUrl = `${API}/share/${token}/file`;

  useEffect(() => {
    axios.get(`${API}/share/${token}`).then(r => setMeta(r.data)).catch(() => setErr("not_found"));
  }, [token]);

  if (err) return (
    <div className="min-h-screen grid place-items-center bg-[#FAFAFA] p-8">
      <div className="nb bg-white p-8 text-center max-w-md">
        <div className="label-mono mb-2">404</div>
        <h1 className="font-display text-3xl font-bold mb-2">This share link is gone</h1>
        <p className="text-zinc-600 mb-6">It may have been deleted by the owner.</p>
        <Link to="/" className="nb-btn nb-btn-yellow">Go home</Link>
      </div>
    </div>
  );

  if (!meta) return <div className="min-h-screen grid place-items-center bg-[#FAFAFA]"><div className="label-mono">Loading…</div></div>;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <header className="border-b-2 border-[#0F0F0F] bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-display font-bold text-xl">
            <span className="w-8 h-8 rounded-lg bg-[#FDE047] border-2 border-[#0F0F0F] grid place-items-center"><Camera size={16}/></span>
            SnapBurst
          </Link>
          <a href={fileUrl} download className="nb-btn !py-2 !px-3 text-sm bg-white" data-testid="download-btn">
            <Download size={14}/> Download
          </a>
          <div className="hidden sm:block w-28">
            <ShareQR url={typeof window !== "undefined" ? window.location.href : ""} label="Open this share on mobile" />
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-10">
        <div className="label-mono mb-2">Shared via SnapBurst</div>
        <h1 className="font-display text-4xl sm:text-5xl font-black mb-4" data-testid="share-title">{meta.title}</h1>
        {meta.owner?.name && <div className="text-sm text-zinc-600 mb-6">By {meta.owner.name}</div>}
        <div className="nb bg-white p-3" data-testid="share-media">
          {meta.kind === "recording" ? (
            <video src={fileUrl} controls className="w-full max-h-[80vh]" />
          ) : (
            <img src={fileUrl} alt={meta.title} className="w-full max-h-[80vh] object-contain" />
          )}
        </div>
        <div className="mt-8 nb-lg p-6 bg-[#FDE047] text-center">
          <h3 className="font-display text-2xl font-bold mb-2">Want to capture & share like this?</h3>
          <Link to="/register" className="nb-btn nb-btn-ink !text-white" data-testid="share-cta">Get SnapBurst — free</Link>
        </div>
      </main>
    </div>
  );
}

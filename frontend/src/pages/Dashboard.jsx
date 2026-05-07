import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import UploadModal from "../components/UploadModal";
import AIChat from "../components/AIChat";
import { api } from "../lib/api";
import { Plus, Image as ImageIcon, Video, Trash2, ExternalLink, Share2, Copy } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";

const WORKSPACE_IMG = "https://static.prod-images.emergentagent.com/jobs/d376a859-58a6-4e81-863c-9aeae3b01e94/images/5c5ffecdf72fe9a85fb5255cb619993167233da8086ca18eadb74f04327dff50.png";

export default function Dashboard() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [filter, setFilter] = useState("all");

  const refresh = async () => {
    try {
      const { data } = await api.get("/captures");
      setItems(data);
    } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const filtered = items.filter(i => filter === "all" || i.kind === filter);

  const onDelete = async (id) => {
    if (!confirm("Delete this capture?")) return;
    try { await api.delete(`/captures/${id}`); setItems(it => it.filter(x => x.id !== id)); toast.success("Deleted"); }
    catch { toast.error("Delete failed"); }
  };

  const copyShare = (token) => {
    const url = `${window.location.origin}/share/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Share link copied");
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Navbar />
      <main className="max-w-7xl mx-auto px-5 sm:px-8 py-10">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <div className="label-mono mb-1">Your library</div>
            <h1 className="font-display text-4xl sm:text-5xl font-black">Hey {user?.name?.split(" ")[0] || "there"} 👋</h1>
            <p className="text-zinc-600 mt-2">All your captures live here. Click any to annotate or share.</p>
          </div>
          <button onClick={() => setShowUpload(true)} className="nb-btn nb-btn-tangerine" data-testid="new-capture-btn">
            <Plus size={18} /> New capture
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          {[["all","All"],["screenshot","Screenshots"],["recording","Recordings"]].map(([k,l]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`nb-sm px-4 py-2 text-sm font-semibold ${filter===k?"bg-[#FDE047]":"bg-white"}`}
              data-testid={`filter-${k}`}>
              {l}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1,2,3,4,5,6].map(i => <div key={i} className="nb h-64 bg-white animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState onNew={() => setShowUpload(true)} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((c, i) => (
              <CaptureCard key={c.id} c={c} idx={i} onDelete={() => onDelete(c.id)} onShare={() => copyShare(c.share_token)} />
            ))}
          </div>
        )}
      </main>

      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} onCreated={(c) => setItems(it => [c, ...it])} />
      <AIChat />
    </div>
  );
}

function CaptureCard({ c, idx, onDelete, onShare }) {
  const palette = ["bg-[#FDE047]","bg-[#FBCFE8]","bg-[#A7F3D0]","bg-[#93C5FD]"];
  const [thumb, setThumb] = useState(null);

  useEffect(() => {
    if (c.kind !== "screenshot") return;
    let revoked = null;
    (async () => {
      try {
        const r = await api.get(`/captures/${c.id}/file`, { responseType: "blob" });
        const url = URL.createObjectURL(r.data);
        revoked = url; setThumb(url);
      } catch {}
    })();
    return () => revoked && URL.revokeObjectURL(revoked);
  }, [c.id, c.kind]);

  return (
    <div className={`nb p-5 ${palette[idx % palette.length]} fade-up`} data-testid={`capture-card-${c.id}`}>
      <Link to={`/capture/${c.id}`} className="block">
        <div className="aspect-video w-full nb-sm bg-white overflow-hidden grid place-items-center">
          {c.kind === "screenshot" ? (
            thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> :
              <ImageIcon size={32} className="opacity-30" />
          ) : <Video size={32} className="opacity-50" />}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="font-bold text-base truncate">{c.title}</div>
          <span className="label-mono">{c.kind === "recording" ? "REC" : "IMG"}</span>
        </div>
      </Link>
      <div className="mt-2 text-xs opacity-70">{new Date(c.created_at).toLocaleString()}</div>
      <div className="mt-4 flex gap-2">
        <button onClick={onShare} className="nb-sm bg-white px-3 py-1.5 text-xs font-bold flex items-center gap-1" data-testid={`share-${c.id}`}>
          <Share2 size={12}/> Share
        </button>
        <Link to={`/capture/${c.id}`} className="nb-sm bg-white px-3 py-1.5 text-xs font-bold flex items-center gap-1" data-testid={`open-${c.id}`}>
          <ExternalLink size={12}/> Open
        </Link>
        <button onClick={onDelete} className="nb-sm bg-white px-3 py-1.5 text-xs font-bold flex items-center gap-1 ml-auto" data-testid={`delete-${c.id}`}>
          <Trash2 size={12}/>
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onNew }) {
  return (
    <div className="nb-lg p-10 sm:p-16 bg-white grid grid-cols-1 lg:grid-cols-2 gap-8 items-center" data-testid="empty-state">
      <div>
        <div className="label-mono mb-2">Nothing here yet</div>
        <h2 className="font-display text-3xl font-bold mb-3">Make your first capture</h2>
        <p className="text-zinc-600 mb-6">Press <kbd className="nb-sm bg-[#FDE047] px-2 py-0.5 text-xs">Ctrl + Shift + S</kbd> with the extension installed, or click below.</p>
        <button onClick={onNew} className="nb-btn nb-btn-yellow"><Plus size={18}/> Capture now</button>
      </div>
      <img src={WORKSPACE_IMG} alt="" className="nb w-full" />
    </div>
  );
}

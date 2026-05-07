import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import AIChat from "../components/AIChat";
import AnnotationEditor from "../components/AnnotationEditor";
import { api } from "../lib/api";
import { ArrowLeft, Share2, Copy, Slack, Trello, Mail } from "lucide-react";
import { toast } from "sonner";

export default function CaptureDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [cap, setCap] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);

  const refresh = async () => {
    try {
      const { data } = await api.get(`/captures/${id}`);
      setCap(data);
    } catch (e) {
      toast.error("Capture not found");
      nav("/dashboard");
    }
  };
  useEffect(() => { refresh(); }, [id]);

  useEffect(() => {
    if (!cap || cap.kind !== "recording") return;
    let revoked = null;
    (async () => {
      const r = await api.get(`/captures/${cap.id}/file`, { responseType: "blob" });
      const u = URL.createObjectURL(r.data); revoked = u; setVideoUrl(u);
    })();
    return () => revoked && URL.revokeObjectURL(revoked);
  }, [cap]);

  if (!cap) return <div className="min-h-screen bg-[#FAFAFA]"><Navbar /><div className="p-10 text-center label-mono">Loading…</div></div>;

  const shareUrl = `${window.location.origin}/share/${cap.share_token}`;
  const copyShare = () => { navigator.clipboard.writeText(shareUrl); toast.success("Share link copied"); };
  const intent = (kind) => {
    const links = {
      slack: `https://slack.com/intl/en-in/help/articles/201330736?text=${encodeURIComponent("Sharing a SnapBurst capture: " + shareUrl)}`,
      trello: `https://trello.com/add-card?desc=${encodeURIComponent(shareUrl)}&name=${encodeURIComponent(cap.title)}`,
      jira: `https://www.atlassian.com/software/jira?text=${encodeURIComponent("SnapBurst: " + shareUrl)}`,
      gmail: `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(cap.title)}&body=${encodeURIComponent(shareUrl)}`,
    };
    window.open(links[kind], "_blank");
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Navbar />
      <main className="max-w-7xl mx-auto px-5 sm:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-9">
          <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold mb-4" data-testid="back-link">
            <ArrowLeft size={16} /> Back to library
          </Link>
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="label-mono mb-1">{cap.kind === "recording" ? "Recording" : "Screenshot"}</div>
              <h1 className="font-display text-3xl sm:text-4xl font-black" data-testid="capture-title">{cap.title}</h1>
              <div className="text-xs text-zinc-500 mt-1">{new Date(cap.created_at).toLocaleString()}</div>
            </div>
          </div>

          {cap.kind === "recording" ? (
            <div className="nb bg-black p-2">
              <video src={videoUrl} controls className="w-full max-h-[70vh]" data-testid="recording-player" />
            </div>
          ) : (
            <AnnotationEditor capture={cap} refresh={refresh} />
          )}
        </div>

        <aside className="lg:col-span-3 space-y-4">
          <div className="nb p-5 bg-[#FDE047]" data-testid="share-panel">
            <div className="label-mono mb-2 flex items-center gap-1"><Share2 size={12}/>Share</div>
            <div className="text-xs break-all bg-white nb-sm p-2 mb-3">{shareUrl}</div>
            <button onClick={copyShare} className="nb-btn bg-white w-full mb-2 !text-sm !py-2" data-testid="copy-share-btn">
              <Copy size={14}/> Copy link
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => intent("slack")} className="nb-sm bg-white p-2 text-xs font-bold flex items-center gap-1 justify-center" data-testid="share-slack"><Slack size={12}/>Slack</button>
              <button onClick={() => intent("trello")} className="nb-sm bg-white p-2 text-xs font-bold flex items-center gap-1 justify-center" data-testid="share-trello"><Trello size={12}/>Trello</button>
              <button onClick={() => intent("jira")} className="nb-sm bg-white p-2 text-xs font-bold flex items-center gap-1 justify-center" data-testid="share-jira">Jira</button>
              <button onClick={() => intent("gmail")} className="nb-sm bg-white p-2 text-xs font-bold flex items-center gap-1 justify-center" data-testid="share-gmail"><Mail size={12}/>Gmail</button>
            </div>
          </div>
          <div className="nb p-5 bg-white">
            <div className="label-mono mb-2">Details</div>
            <ul className="text-sm space-y-1">
              <li><strong>Type:</strong> {cap.kind}</li>
              <li><strong>Size:</strong> {(cap.size / 1024).toFixed(1)} KB</li>
              {cap.duration_sec && <li><strong>Duration:</strong> {cap.duration_sec.toFixed(1)}s</li>}
              <li><strong>Format:</strong> {cap.content_type}</li>
            </ul>
          </div>
        </aside>
      </main>
      <AIChat />
    </div>
  );
}

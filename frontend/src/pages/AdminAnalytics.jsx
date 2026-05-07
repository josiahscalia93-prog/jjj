import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import { api } from "../lib/api";
import { setHeroVariant } from "../lib/analytics";
import { TrendingUp, Trophy, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export default function AdminAnalytics() {
  const [winner, setWinner] = useState(null);
  const [summary, setSummary] = useState({});
  const [storeId, setStoreId] = useState("");
  const [storeIdInput, setStoreIdInput] = useState("");
  const [savingId, setSavingId] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [w, s, sid] = await Promise.all([
        api.get("/analytics/winner"),
        api.get("/analytics/summary"),
        fetch(`${BACKEND}/api/extension/store-id`).then(r => r.json()),
      ]);
      setWinner(w.data);
      setSummary(s.data);
      setStoreId(sid.extension_id || "");
      setStoreIdInput(sid.extension_id || "");
    } catch (e) { toast.error("Failed to load"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const saveStoreId = async () => {
    setSavingId(true);
    try {
      await api.put("/extension/store-id", { extension_id: storeIdInput.trim() });
      toast.success("Chrome extension ID saved");
      localStorage.removeItem("sb_store_id");
      localStorage.removeItem("sb_store_id_at");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setSavingId(false); }
  };

  const promoteWinner = (v) => {
    setHeroVariant(v);
    toast.success(`Forced your session to variant ${v}. Use this to preview.`);
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Navbar />
      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-10 space-y-6">
        <div>
          <div className="label-mono mb-1">Growth · Admin</div>
          <h1 className="font-display text-4xl font-black">Analytics & A/B</h1>
          <p className="text-zinc-600 mt-2">Live install-funnel data, hero variant performance, and Chrome Web Store config.</p>
        </div>

        {/* Chrome Web Store ID */}
        <div className="nb p-6 bg-[#FDE047]" data-testid="store-id-card">
          <div className="flex items-start gap-4">
            <Save className="mt-1" />
            <div className="flex-1">
              <h2 className="font-display text-2xl font-bold">Chrome Web Store extension ID</h2>
              <p className="text-sm mt-1 opacity-80">
                After Chrome assigns your published extension ID (32 chars, a–p), paste it here. Every "Add to Chrome" CTA on your site will switch from the ZIP download URL to your live store page automatically — with UTM tags preserved.
              </p>
              <div className="mt-3 flex flex-col sm:flex-row gap-2 items-stretch">
                <input
                  value={storeIdInput}
                  onChange={e => setStoreIdInput(e.target.value)}
                  placeholder="e.g. abcdefghijklmnopabcdefghijklmnop"
                  className="nb-input flex-1 !bg-white"
                  data-testid="store-id-input"
                />
                <button onClick={saveStoreId} disabled={savingId} className="nb-btn nb-btn-ink !text-white" data-testid="store-id-save">
                  {savingId ? "Saving…" : "Save"}
                </button>
              </div>
              <div className="text-xs mt-2 font-mono-accent">
                Currently active: <strong>{storeId || "— (not set, falls back to ZIP download)"}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Winner */}
        <div className="nb-lg p-6 bg-white" data-testid="winner-card">
          <div className="label-mono mb-2 flex items-center gap-1"><Trophy size={12}/>A/B winner</div>
          {loading ? <div className="text-sm">Loading…</div> : winner ? (
            <>
              {winner.winner ? (
                <h3 className="font-display text-3xl font-black">
                  Variant <span className="bg-[#A7F3D0] px-3 border-2 border-[#0F0F0F] rounded-lg" data-testid="winner-variant">{winner.winner}</span> is winning 🎉
                </h3>
              ) : (
                <h3 className="font-display text-2xl font-bold flex items-center gap-2">
                  <AlertTriangle className="text-[#FB923C]" />
                  Not enough traffic yet
                </h3>
              )}
              <p className="text-sm text-zinc-600 mt-1">
                Needs ≥{winner.min_traffic_required} pageviews per variant and a ≥{(winner.min_cvr_lift_pp*100).toFixed(0)}pp install-CVR gap.
              </p>
              <table className="w-full mt-5 text-sm" data-testid="winner-table">
                <thead className="text-left label-mono">
                  <tr>
                    <th className="py-2">Variant</th>
                    <th>Pageviews</th>
                    <th>Install clicks</th>
                    <th>Download .zip</th>
                    <th>Install CVR</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {winner.variants.map(v => (
                    <tr key={v.variant} className={`border-t-2 border-[#0F0F0F] ${winner.winner===v.variant?"bg-[#A7F3D0]":""}`}>
                      <td className="py-3 font-bold">{v.variant}</td>
                      <td>{v.page_views}</td>
                      <td>{v.install_clicks}</td>
                      <td>{v.download_zips}</td>
                      <td className="font-mono-accent">{(v.install_cvr*100).toFixed(2)}%</td>
                      <td><button onClick={() => promoteWinner(v.variant)} className="nb-sm bg-white px-2 py-1 text-xs font-bold" data-testid={`preview-${v.variant}`}>Preview</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : <div className="text-sm">No data</div>}
        </div>

        {/* Raw event summary */}
        <div className="nb p-6 bg-white" data-testid="summary-card">
          <div className="label-mono mb-2 flex items-center gap-1"><TrendingUp size={12}/>Raw event counts</div>
          <table className="w-full text-sm">
            <thead className="text-left label-mono">
              <tr><th className="py-2">Event</th><th>Variant</th><th>Count</th><th>Unique visitors</th></tr>
            </thead>
            <tbody>
              {Object.entries(summary).flatMap(([ev, byVar]) =>
                Object.entries(byVar).map(([v, d]) => (
                  <tr key={`${ev}-${v}`} className="border-t border-zinc-200">
                    <td className="py-2 font-bold">{ev}</td>
                    <td>{v}</td>
                    <td>{d.count}</td>
                    <td>{d.unique_visitors}</td>
                  </tr>
                ))
              )}
              {Object.keys(summary).length === 0 && (
                <tr><td colSpan={4} className="py-4 text-zinc-500">No events tracked yet — visit the landing page to generate data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

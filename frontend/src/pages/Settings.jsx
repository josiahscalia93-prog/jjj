import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Slack, Plug, Trash2, ExternalLink, Download } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export default function Settings() {
  const [info, setInfo] = useState(null);
  const [slackUrl, setSlackUrl] = useState("");
  const [jira, setJira] = useState({ base_url: "", email: "", api_token: "", project_key: "" });
  const [extInfo, setExtInfo] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/integrations");
      setInfo(data);
      setJira(j => ({ ...j, base_url: data.jira_base_url || "", email: data.jira_email || "", project_key: data.jira_project_key || "" }));
    } catch {}
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { fetch(`${BACKEND}/api/extension/info`).then(r => r.json()).then(setExtInfo).catch(() => {}); }, []);

  const saveSlack = async () => {
    try { await api.put("/integrations/slack", { webhook_url: slackUrl }); toast.success("Slack connected"); setSlackUrl(""); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const removeSlack = async () => { await api.delete("/integrations/slack"); toast.success("Slack disconnected"); load(); };
  const saveJira = async () => {
    try { await api.put("/integrations/jira", jira); toast.success("Jira connected"); setJira(j => ({ ...j, api_token: "" })); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const removeJira = async () => { await api.delete("/integrations/jira"); toast.success("Jira disconnected"); load(); };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Navbar />
      <main className="max-w-4xl mx-auto px-5 sm:px-8 py-10 space-y-6">
        <div>
          <div className="label-mono mb-1">Settings</div>
          <h1 className="font-display text-4xl font-black">Integrations & extension</h1>
        </div>

        {/* extension card */}
        <div className="nb p-6 bg-[#FDE047]" data-testid="extension-card">
          <div className="flex items-start gap-4">
            <Download className="mt-1" />
            <div className="flex-1">
              <h2 className="font-display text-2xl font-bold">Chrome Extension</h2>
              <p className="text-sm mt-1">{extInfo ? `${extInfo.name} v${extInfo.version} — ${(extInfo.size_bytes/1024).toFixed(1)} KB` : "Loading…"}</p>
              <p className="text-sm mt-2 opacity-80">Download the ZIP, then in Chrome go to <code className="font-mono-accent text-xs">chrome://extensions</code> → enable <strong>Developer mode</strong> → <strong>Load unpacked</strong> (or upload zip to the Web Store dev console).</p>
              <div className="flex flex-wrap gap-2 mt-4">
                <a href={`${BACKEND}/api/extension/download`} className="nb-btn bg-white" data-testid="download-extension-btn">
                  <Download size={16}/> Download ZIP
                </a>
                <a href="https://chrome.google.com/webstore/devconsole" target="_blank" rel="noreferrer" className="nb-btn bg-white" data-testid="open-webstore-console">
                  <ExternalLink size={16}/> Web Store Dev Console
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Slack */}
        <div className="nb p-6 bg-white" data-testid="slack-card">
          <div className="flex items-start gap-4">
            <Slack className="mt-1" />
            <div className="flex-1">
              <h2 className="font-display text-2xl font-bold">Slack</h2>
              <p className="text-sm opacity-70">Post share links straight into a Slack channel.</p>
              {info?.slack_connected ? (
                <div className="mt-3 flex items-center gap-2">
                  <span className="nb-sm bg-[#A7F3D0] px-3 py-1 text-xs font-bold">Connected</span>
                  <button onClick={removeSlack} className="nb-btn !py-2 !px-3 text-sm" data-testid="slack-disconnect"><Trash2 size={14}/> Disconnect</button>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <label className="label-mono">Incoming webhook URL</label>
                  <input value={slackUrl} onChange={e => setSlackUrl(e.target.value)} placeholder="https://hooks.slack.com/services/…" className="nb-input" data-testid="slack-webhook-input" />
                  <div className="flex gap-2">
                    <button onClick={saveSlack} className="nb-btn nb-btn-mint" data-testid="slack-save"><Plug size={14}/> Connect</button>
                    <a className="text-xs underline self-center" href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noreferrer">Get a webhook URL →</a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Jira */}
        <div className="nb p-6 bg-white" data-testid="jira-card">
          <div className="flex items-start gap-4">
            <div className="mt-1 w-6 h-6 bg-[#0F0F0F] text-white rounded grid place-items-center text-xs font-bold">J</div>
            <div className="flex-1">
              <h2 className="font-display text-2xl font-bold">Jira</h2>
              <p className="text-sm opacity-70">Open issues directly with your capture attached.</p>
              {info?.jira_connected ? (
                <div className="mt-3">
                  <div className="text-xs">Connected to <strong>{info.jira_base_url}</strong> · project <strong>{info.jira_project_key}</strong></div>
                  <button onClick={removeJira} className="nb-btn !py-2 !px-3 text-sm mt-2" data-testid="jira-disconnect"><Trash2 size={14}/> Disconnect</button>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div><label className="label-mono">Base URL</label><input value={jira.base_url} onChange={e => setJira({...jira, base_url: e.target.value})} placeholder="https://acme.atlassian.net" className="nb-input mt-1" data-testid="jira-baseurl"/></div>
                  <div><label className="label-mono">Project key</label><input value={jira.project_key} onChange={e => setJira({...jira, project_key: e.target.value})} placeholder="ENG" className="nb-input mt-1" data-testid="jira-projectkey"/></div>
                  <div><label className="label-mono">Email</label><input value={jira.email} onChange={e => setJira({...jira, email: e.target.value})} placeholder="you@acme.com" className="nb-input mt-1" data-testid="jira-email"/></div>
                  <div><label className="label-mono">API token</label><input type="password" value={jira.api_token} onChange={e => setJira({...jira, api_token: e.target.value})} placeholder="atatt-…" className="nb-input mt-1" data-testid="jira-token"/></div>
                  <div className="sm:col-span-2 flex items-center gap-3">
                    <button onClick={saveJira} className="nb-btn nb-btn-mint" data-testid="jira-save"><Plug size={14}/> Connect</button>
                    <a className="text-xs underline" href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer">Create an API token →</a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

import { Link } from "react-router-dom";
import { useState } from "react";
import Navbar from "../components/Navbar";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { ArrowRight, Camera, Video, Pencil, Share2, Sparkles, Check, Star, Mic, MonitorSmartphone, Wand2, Cloud, Download } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

const HERO_IMG = "https://static.prod-images.emergentagent.com/jobs/d376a859-58a6-4e81-863c-9aeae3b01e94/images/bcf502673c6ee4325cca3bcbd97ef08bebfbb02631a82f1832d37ce81ad8f524.png";
const FEATURE_IMG = "https://static.prod-images.emergentagent.com/jobs/d376a859-58a6-4e81-863c-9aeae3b01e94/images/c89c5fcb08a15a2966bb901e57a955569c28c9e662b2fabe46eda079d7258248.png";
const WORKSPACE_IMG = "https://static.prod-images.emergentagent.com/jobs/d376a859-58a6-4e81-863c-9aeae3b01e94/images/5c5ffecdf72fe9a85fb5255cb619993167233da8086ca18eadb74f04327dff50.png";
const CREATOR1 = "https://images.unsplash.com/photo-1758876019084-cb8f8556d8db?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1NzZ8MHwxfHNlYXJjaHwzfHxjcmVhdG9yJTIwdXNpbmclMjBsYXB0b3AlMjBzbWlsaW5nfGVufDB8fHx8MTc3ODE2NjQwMnww&ixlib=rb-4.1.0&q=85";
const CREATOR2 = "https://images.unsplash.com/photo-1758873272955-3b066dd11c6b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1NzZ8MHwxfHNlYXJjaHw0fHxjcmVhdG9yJTIwdXNpbmclMjBsYXB0b3AlMjBzbWlsaW5nfGVufDB8fHx8MTc3ODE2NjQwMnww&ixlib=rb-4.1.0&q=85";

const integrations = ["Slack", "Trello", "Jira", "Gmail", "Notion", "Linear", "Asana", "Figma", "GitHub", "Zoom"];

export default function Landing() {
  return (
    <div>
      <Navbar />
      <Hero />
      <Marquee />
      <Features />
      <BigShowcase />
      <Pricing />
      <Testimonials />
      <FAQ />
      <CTA />
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b-2 border-[#0F0F0F]" data-testid="hero-section">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-24 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-7 fade-up">
          <div className="inline-flex items-center gap-2 nb-sm bg-[#A7F3D0] px-3 py-1 mb-6">
            <Sparkles size={14} /> <span className="label-mono">v1.0 — now on Chrome Web Store</span>
          </div>
          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-black leading-[0.95] tracking-tight">
            Capture the screen. <br />
            <span className="bg-[#FDE047] px-3 inline-block border-2 border-[#0F0F0F] rounded-xl shadow-[6px_6px_0_#0F0F0F] -rotate-1 my-2">
              Annotate it.
            </span> <br />
            Share in <span className="underline decoration-[#FB923C] decoration-[10px] underline-offset-4">one click</span>.
          </h1>
          <p className="mt-6 text-lg text-zinc-700 max-w-xl">
            SnapBurst is a joyful screen capture & screen recorder for Chrome. Snap full pages, record HD video with webcam + mic,
            mark it up, and ship instant share links — straight to Slack, Trello, Jira & Gmail.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register" className="nb-btn nb-btn-tangerine text-base" data-testid="hero-cta-primary">
              Add to Chrome — Free <ArrowRight size={18} />
            </Link>
            <a href={`${BACKEND}/api/extension/download`} className="nb-btn nb-btn-yellow text-base" data-testid="hero-download-extension">
              <Download size={18}/> Download .zip
            </a>
            <a href="#features" className="nb-btn text-base bg-white" data-testid="hero-cta-secondary">
              See how it works
            </a>
          </div>
          <div className="mt-8 flex items-center gap-4 label-mono">
            <div className="flex -space-x-2">
              <img src={CREATOR1} className="w-8 h-8 rounded-full border-2 border-[#0F0F0F] object-cover" alt="" />
              <img src={CREATOR2} className="w-8 h-8 rounded-full border-2 border-[#0F0F0F] object-cover" alt="" />
              <div className="w-8 h-8 rounded-full bg-[#FBCFE8] border-2 border-[#0F0F0F] grid place-items-center text-xs">+2k</div>
            </div>
            <span>Loved by creators · No watermark · Free forever</span>
          </div>
        </div>
        <div className="lg:col-span-5 relative">
          <div className="absolute -top-6 -left-6 w-32 h-32 bg-[#FBCFE8] border-2 border-[#0F0F0F] rounded-2xl rotate-[-8deg] hidden sm:block"></div>
          <div className="absolute -bottom-8 -right-4 w-40 h-40 bg-[#A7F3D0] border-2 border-[#0F0F0F] rounded-3xl rotate-[6deg] hidden sm:block"></div>
          <img src={HERO_IMG} alt="hero shapes" className="relative nb-lg w-full object-cover bg-[#FDE047]" />
        </div>
      </div>
    </section>
  );
}

function Marquee() {
  return (
    <section id="integrations" className="bg-[#0F0F0F] text-white py-8 border-b-2 border-[#0F0F0F] overflow-hidden" data-testid="integrations-marquee">
      <div className="label-mono text-center text-zinc-400 mb-4">Plays nicely with your stack</div>
      <div className="overflow-hidden">
        <div className="marquee">
          {[...integrations, ...integrations].map((n, i) => (
            <div key={i} className="text-4xl sm:text-6xl font-display font-bold flex items-center gap-8 whitespace-nowrap">
              <span className="text-[#FDE047]">★</span> {n}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="py-20 sm:py-28 border-b-2 border-[#0F0F0F]">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <div className="max-w-2xl mb-14">
          <div className="label-mono mb-3">Everything you need</div>
          <h2 className="font-display text-4xl sm:text-5xl font-bold leading-tight">
            One extension. <span className="bg-[#A7F3D0] px-2 border-2 border-[#0F0F0F] rounded-lg inline-block -rotate-1">Every capture.</span>
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <Bento className="md:col-span-7 bg-[#FDE047]" tag="screen capture" title="Screenshots, the way you mean them" desc="Visible area, free-form selection, scrolling full-page — all in one shortcut. No browser in the screenshot.">
            <Camera size={36} />
          </Bento>
          <Bento className="md:col-span-5 bg-[#FBCFE8]" tag="recording" title="HD recording up to 4K" desc="Tab, window or full desktop. With system audio + mic + webcam picture-in-picture.">
            <Video size={36} />
          </Bento>
          <Bento className="md:col-span-5 bg-[#A7F3D0]" tag="annotate" title="Mark it up, fast" desc="Pen, arrows, shapes, text and blur for sensitive bits. Built for feedback that lands.">
            <Pencil size={36} />
          </Bento>
          <Bento className="md:col-span-7 bg-[#93C5FD]" tag="share" title="Share links your team will actually open" desc="Public links, embed code, direct hand-off to Slack, Trello, Jira, Gmail. No watermark on free.">
            <Share2 size={36} />
          </Bento>
          <Bento className="md:col-span-4 bg-white" tag="ai assistant" title="AI co-pilot for your captures" desc="Ask about features or drop a screenshot — GPT-5.2 vision suggests fixes & callouts.">
            <Wand2 size={36} />
          </Bento>
          <Bento className="md:col-span-4 bg-[#FB923C]" tag="cloud" title="Cloud library" desc="Everything is searchable, organized and synced. Local export anytime.">
            <Cloud size={36} />
          </Bento>
          <Bento className="md:col-span-4 bg-[#0F0F0F] text-white" tag="audio" title="Studio-grade mic + webcam" desc="Crystal clear voiceover. Auto-noise reduction. Looks like a tutorial pro.">
            <Mic size={36} className="text-[#FDE047]" />
          </Bento>
        </div>
      </div>
    </section>
  );
}

function Bento({ className = "", tag, title, desc, children }) {
  return (
    <div className={`nb p-7 ${className}`} data-testid={`feature-${tag}`}>
      <div className="mb-5 inline-block">{children}</div>
      <div className="label-mono mb-2 opacity-80">{tag}</div>
      <h3 className="text-2xl font-display font-bold mb-2">{title}</h3>
      <p className="text-sm opacity-80 leading-relaxed">{desc}</p>
    </div>
  );
}

function BigShowcase() {
  return (
    <section className="py-20 border-b-2 border-[#0F0F0F] bg-[#FAFAFA]" data-testid="showcase-section">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-6">
          <img src={FEATURE_IMG} alt="" className="nb-lg w-full bg-[#FBCFE8]" />
        </div>
        <div className="lg:col-span-6">
          <div className="label-mono mb-2">For creators & teams</div>
          <h2 className="font-display text-4xl sm:text-5xl font-bold leading-tight">From idea to share link in <span className="underline decoration-[#FDE047] decoration-[8px] underline-offset-4">under a minute.</span></h2>
          <p className="text-zinc-700 mt-4 text-lg max-w-lg">Tutorials, bug reports, async standups, design feedback — capture what matters and let context do the talking.</p>
          <ul className="mt-6 space-y-3 text-base">
            {["No watermark on free plan","Unlimited recording time","4K / 2K / 1080p / GIF","Hands-free keyboard shortcuts"].map(t => (
              <li key={t} className="flex items-center gap-3"><span className="w-6 h-6 rounded-full bg-[#A7F3D0] border-2 border-[#0F0F0F] grid place-items-center"><Check size={14}/></span>{t}</li>
            ))}
          </ul>
          <Link to="/register" className="nb-btn nb-btn-yellow mt-7 text-base" data-testid="showcase-cta">Get started — it's free</Link>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(null);

  const checkout = async (tier) => {
    if (!user) { window.location.href = "/register?next=pricing"; return; }
    setBusy(tier);
    try {
      const { data } = await api.post("/billing/checkout", { tier, origin_url: window.location.origin });
      window.location.href = data.url;
    } catch (e) { toast.error(e.response?.data?.detail || "Checkout failed"); }
    finally { setBusy(null); }
  };

  const tiers = [
    { name: "Free", key: "free", price: "$0", color: "bg-white", desc: "For curious creators", features: ["Unlimited screenshots","Unlimited recording (1080p)","Cloud library 1GB","Public share links","AI assistant (limited)"], cta: "Start free", testid: "tier-free" },
    { name: "Pro", key: "pro", price: "$8", color: "bg-[#FDE047]", desc: "For makers and pros", features: ["4K recording","100GB cloud storage","Custom branding","Slack / Trello / Jira hand-off","Unlimited AI"], cta: "Go Pro", testid: "tier-pro", featured: true },
    { name: "Team", key: "team", price: "$14", color: "bg-[#A7F3D0]", desc: "For growing squads", features: ["Everything in Pro","Shared library","SSO + admin","Workspace analytics","Priority support"], cta: "Start team trial", testid: "tier-team" },
  ];
  return (
    <section id="pricing" className="py-20 sm:py-28 border-b-2 border-[#0F0F0F]">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <div className="text-center mb-12">
          <div className="label-mono mb-3">Pricing</div>
          <h2 className="font-display text-4xl sm:text-5xl font-bold">Simple, joyful pricing</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tiers.map(t => (
            <div key={t.name} className={`nb-lg p-7 ${t.color} ${t.featured ? "md:-translate-y-3" : ""}`} data-testid={t.testid}>
              <div className="flex items-center justify-between">
                <h3 className="font-display text-2xl font-bold">{t.name}</h3>
                {t.featured && <span className="label-mono bg-[#0F0F0F] text-white px-2 py-1 rounded-md">Most loved</span>}
              </div>
              <div className="mt-3 flex items-end gap-1">
                <div className="text-5xl font-display font-black">{t.price}</div><div className="mb-2 text-sm opacity-70">/ user / mo</div>
              </div>
              <p className="text-sm opacity-80 mt-1">{t.desc}</p>
              <ul className="mt-5 space-y-2 text-sm">
                {t.features.map(f => <li key={f} className="flex items-center gap-2"><Check size={16}/>{f}</li>)}
              </ul>
              {t.key === "free" ? (
                <Link to="/register" className="nb-btn nb-btn-ink mt-6 w-full !text-white" data-testid={`${t.testid}-cta`}>{t.cta}</Link>
              ) : (
                <button onClick={() => checkout(t.key)} disabled={busy === t.key} className="nb-btn nb-btn-ink mt-6 w-full !text-white" data-testid={`${t.testid}-cta`}>
                  {busy === t.key ? "Redirecting…" : t.cta}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  const list = [
    { quote: "Replaced 3 tools we were paying for. The full-page screenshot alone is gold.", who: "Maya, Product Designer", img: CREATOR1 },
    { quote: "We do async standups now — 90s SnapBurst recordings. Meetings dropped 40%.", who: "Diego, Engineering Lead", img: CREATOR2 },
    { quote: "The AI annotations suggestions? Genuinely useful. Felt like magic.", who: "Sara, Customer Success", img: CREATOR1 },
  ];
  return (
    <section className="py-20 border-b-2 border-[#0F0F0F] bg-[#FBCFE8]" data-testid="testimonials-section">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <h2 className="font-display text-4xl sm:text-5xl font-bold text-center mb-12">Creators are obsessed</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {list.map((t, i) => (
            <div key={i} className="nb p-6 bg-white">
              <div className="flex gap-1 text-[#FB923C] mb-3">{[1,2,3,4,5].map(s => <Star key={s} size={16} fill="#FB923C" />)}</div>
              <p className="text-base">"{t.quote}"</p>
              <div className="mt-4 flex items-center gap-3">
                <img src={t.img} alt="" className="w-10 h-10 rounded-full border-2 border-[#0F0F0F] object-cover" />
                <span className="text-sm font-semibold">{t.who}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const items = [
    { q: "Is SnapBurst really free?", a: "Yes. Free plan includes unlimited screenshots and unlimited 1080p recording, no watermark, no time limit." },
    { q: "Where is my data stored?", a: "Recordings and screenshots are encrypted at rest in our cloud storage. Public links are unguessable tokens." },
    { q: "Does it work without an account?", a: "The Chrome extension can capture without an account; uploading & sharing requires a free account." },
    { q: "Will it work on Mac and Windows?", a: "Yes — anywhere Chrome runs. Edge / Brave / Arc are also supported via Chromium." },
  ];
  return (
    <section id="faq" className="py-20 border-b-2 border-[#0F0F0F]" data-testid="faq-section">
      <div className="max-w-3xl mx-auto px-5 sm:px-8">
        <h2 className="font-display text-4xl sm:text-5xl font-bold mb-10">FAQ</h2>
        <div className="space-y-3">
          {items.map((it, i) => (
            <details key={i} className="nb bg-white p-5 group" data-testid={`faq-${i}`}>
              <summary className="cursor-pointer font-bold text-lg flex justify-between">{it.q}<span className="group-open:rotate-45 transition-transform">+</span></summary>
              <p className="mt-3 text-zinc-700">{it.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="py-24 bg-[#FDE047] border-b-2 border-[#0F0F0F] relative overflow-hidden">
      <div className="max-w-5xl mx-auto px-5 sm:px-8 text-center">
        <h2 className="font-display text-5xl sm:text-7xl font-black leading-[0.95]">
          Press record. <br />Hit share. <br /><span className="underline decoration-[#FB923C] decoration-[12px] underline-offset-4">Look like a pro.</span>
        </h2>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Link to="/register" className="nb-btn nb-btn-ink text-base !text-white" data-testid="footer-cta-primary">Add to Chrome <ArrowRight size={18} /></Link>
          <Link to="/login" className="nb-btn bg-white text-base" data-testid="footer-cta-secondary">I have an account</Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="py-10 bg-[#0F0F0F] text-zinc-300 text-sm">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="font-display text-white font-bold text-lg">SnapBurst</div>
        <div className="flex gap-6">
          <Link to="/privacy" className="hover:text-white">Privacy</Link>
          <a href="#" className="hover:text-white">Terms</a>
          <a href="#" className="hover:text-white">Contact</a>
        </div>
        <div>© {new Date().getFullYear()} SnapBurst Labs</div>
      </div>
    </footer>
  );
}

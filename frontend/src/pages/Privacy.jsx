import Navbar from "../components/Navbar";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Navbar />
      <main className="max-w-3xl mx-auto px-5 sm:px-8 py-12 prose prose-zinc">
        <div className="label-mono mb-2">Last updated: February 2026</div>
        <h1 className="font-display text-5xl font-black mb-6">Privacy Policy</h1>
        <Section title="1. What we collect">
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Account data:</strong> email, name, profile picture (when signing in with Google).</li>
            <li><strong>Captured content:</strong> screenshots and recordings you upload. Encrypted at rest.</li>
            <li><strong>Usage logs:</strong> IP, user agent, request paths — purged within 30 days.</li>
            <li><strong>Integration creds:</strong> Slack webhook URLs and Jira API tokens, only if you add them in Settings.</li>
            <li><strong>AI prompts:</strong> sent to OpenAI via Emergent only when you chat with the AI assistant.</li>
          </ul>
        </Section>
        <Section title="2. What we do NOT collect">
          <ul className="list-disc pl-6 space-y-1">
            <li>We do NOT silently capture screen content.</li>
            <li>We do NOT read or transmit page contents unless you explicitly request a screenshot or recording.</li>
            <li>We do NOT sell your data.</li>
            <li>We do NOT show third-party advertising.</li>
          </ul>
        </Section>
        <Section title="3. Permissions used by the Chrome Extension">
          <ul className="list-disc pl-6 space-y-1">
            <li><code>activeTab, tabs, scripting</code> — for current-tab screenshots and full-page stitching.</li>
            <li><code>tabCapture</code> — for tab recording.</li>
            <li><code>downloads</code> — to save captures locally.</li>
            <li><code>storage</code> — store auth token and recent capture list.</li>
            <li><code>&lt;all_urls&gt;</code> host permission — required because users may capture any page they choose.</li>
          </ul>
        </Section>
        <Section title="4. Sharing">
          Public share links contain a long unguessable token. Anyone with the link can view the capture until you delete it.
        </Section>
        <Section title="5. Third-party services">
          Emergent Object Storage, Emergent Auth (Google), OpenAI (via Emergent), Stripe, optionally Slack & Jira (only if you connect them).
        </Section>
        <Section title="6. Your rights">
          You can delete any capture or your entire account at any time from the dashboard. Account deletion permanently removes captures from storage within 30 days.
        </Section>
        <Section title="7. Contact">
          privacy@snapburst.example.com
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="font-display text-2xl font-bold mb-2">{title}</h2>
      <div className="text-zinc-700 text-base">{children}</div>
    </section>
  );
}

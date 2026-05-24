// Editorial sections — varied layouts, real student copy, custom dividers.

// ——— Section header reused ——————————————————————————————

function SectionHead({ num, kicker, title, sub }) {
  return (
    <div className="grid lg:grid-cols-12 gap-6 lg:gap-12 items-end mb-16">
      <div className="lg:col-span-1">
        <div className="section-mark">{num}</div>
      </div>
      <div className="lg:col-span-7">
        <div className="section-mark mb-3">/ {kicker}</div>
        <h2 className="text-[34px] sm:text-[44px] font-semibold tracking-[-0.025em] leading-[1.05] text-zinc-50">
          {title}
        </h2>
      </div>
      {sub && (
        <div className="lg:col-span-4">
          <p className="text-[14px] text-zinc-400 leading-relaxed max-w-sm">{sub}</p>
        </div>
      )}
    </div>
  );
}

// ——— § 01 · Capabilities ————————————————————————————————
// Editorial 2-column + 3-row mosaic. Not a bento, not a grid of three identical cards.

function Capabilities() {
  return (
    <section id="features" className="relative border-t" style={{ borderColor: 'var(--line)' }}>
      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-24 sm:py-32">
        <SectionHead
          num="§ 01"
          kicker="capabilities"
          title={<>What StudyPilot does <span className="text-zinc-500">while you study.</span></>}
          sub="Four modes, one panel. Switch between them with a keystroke — or let StudyPilot pick the right one as the lecture moves."
        />

        {/* Row A: 2 columns — feature + screenshot detail */}
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 mb-12 items-center">
          <div className="lg:col-span-5">
            <ModeBadge>Mode 01 · Listen</ModeBadge>
            <h3 className="text-[26px] font-semibold tracking-tight text-zinc-50 mt-3 leading-[1.15]">
              A live transcript that knows what's coming next.
            </h3>
            <p className="text-[14px] text-zinc-400 leading-relaxed mt-3 max-w-md">
              StudyPilot captures the audio of any lecture playing in your tab —
              MIT OCW, Khan, your professor's Zoom recording — and runs a
              streaming transcript with timestamps you can jump to.
            </p>
            <DetailList items={[
              ["Sources",  "browser audio, mic, or both"],
              ["Languages","auto-detected, 38 supported"],
              ["Latency",  "≈ 240 ms tail"],
            ]}/>
          </div>
          <div className="lg:col-span-7">
            <TranscriptMock />
          </div>
        </div>

        {/* Custom divider */}
        <CustomDivider />

        {/* Row B: flipped — explainer + screenshot */}
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 my-12 items-center">
          <div className="lg:col-span-7 order-2 lg:order-1">
            <SummaryMock />
          </div>
          <div className="lg:col-span-5 order-1 lg:order-2">
            <ModeBadge>Mode 02 · Summarize</ModeBadge>
            <h3 className="text-[26px] font-semibold tracking-tight text-zinc-50 mt-3 leading-[1.15]">
              Pull the lecture down to what's on the test.
            </h3>
            <p className="text-[14px] text-zinc-400 leading-relaxed mt-3 max-w-md">
              Rolling summaries every five minutes. End-of-class recap with
              flagged terms, equations, and the bits your professor said
              "this'll be on the exam" about.
            </p>
            <DetailList items={[
              ["Granularity", "5 min · chapter · whole class"],
              ["Highlights",  "auto-pulled definitions + formulas"],
              ["Export",      "Notion · Obsidian · markdown"],
            ]}/>
          </div>
        </div>

        <CustomDivider />

        {/* Row C: dual mini-frames — quiz + ask */}
        <div className="grid lg:grid-cols-12 gap-6 lg:gap-8 mt-12">
          <div className="lg:col-span-6 card p-7 relative">
            <ModeBadge>Mode 03 · Quiz</ModeBadge>
            <h3 className="text-[22px] font-semibold tracking-tight text-zinc-50 mt-3 mb-4 leading-[1.18]">
              Multiple choice, free response, or until you get it right.
            </h3>
            <QuizMock />
          </div>
          <div className="lg:col-span-6 card p-7 relative">
            <ModeBadge>Mode 04 · Ask</ModeBadge>
            <h3 className="text-[22px] font-semibold tracking-tight text-zinc-50 mt-3 mb-4 leading-[1.18]">
              Follow-ups that remember the last hour.
            </h3>
            <AskMock />
          </div>
        </div>
      </div>
    </section>
  );
}

// — Capability sub-components ————————————————————————————

function ModeBadge({ children }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-mono uppercase tracking-[0.16em]"
          style={{ color: 'var(--accent-ink)', background: 'color-mix(in oklab, var(--accent) 12%, transparent)', border: '1px solid color-mix(in oklab, var(--accent) 35%, transparent)' }}>
      {children}
    </span>
  );
}

function DetailList({ items }) {
  return (
    <dl className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 max-w-md">
      {items.map(([k, v]) => (
        <div key={k} className="border-t pt-2" style={{ borderColor: 'var(--line)' }}>
          <dt className="text-[10.5px] font-mono uppercase tracking-wider text-zinc-500">{k}</dt>
          <dd className="text-[12.5px] text-zinc-200 mt-1">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function CustomDivider() {
  return (
    <div className="flex items-center gap-4 my-2">
      <div className="grad-divider flex-1"></div>
      <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-zinc-600">/ · /</span>
      <div className="grad-divider flex-1"></div>
    </div>
  );
}

function TranscriptMock() {
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full pulse-dot" style={{ background: 'var(--accent)' }}></span>
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-300">Live transcript</span>
        </div>
        <div className="text-[10.5px] font-mono text-zinc-500">CHEM 105 · 12 min</div>
      </div>
      <div className="space-y-2 text-[13px] leading-relaxed">
        <TLine time="00:38" speaker="Prof." text="…so a hydrogen bond isn't a covalent bond. It's electrostatic — much weaker, but enough to hold water together at room temperature." />
        <TLine time="01:04" speaker="Prof." text="Question from the back? Yeah, exactly — that's why water has such a high boiling point compared to methane." />
        <TLine time="01:22" speaker="You"  text="ask: what's the bond energy difference?" you />
        <TLine time="01:23" speaker="SP"   text="A hydrogen bond is ≈ 20 kJ/mol; an O–H covalent bond is ≈ 460 kJ/mol — about 23×." reply />
      </div>
    </div>
  );
}

function TLine({ time, speaker, text, you, reply }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-[10.5px] font-mono text-zinc-600 w-10 shrink-0 mt-[3px]">{time}</span>
      <span className="text-[10.5px] font-mono w-10 shrink-0 mt-[3px]"
            style={{ color: you ? 'var(--ink-3)' : reply ? 'var(--accent-ink)' : 'var(--ink-4)' }}>
        {speaker}
      </span>
      <span className={you ? "text-zinc-400 italic" : reply ? "text-zinc-100" : "text-zinc-300"}>{text}</span>
    </div>
  );
}

function SummaryMock() {
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-300">Rolling summary · 38 min</span>
        <span className="text-[10.5px] font-mono text-zinc-500">BIO 7.014</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12.5px] mb-4">
        <SummaryStat k="Definitions" v="14 pulled" />
        <SummaryStat k="Equations" v="3 flagged" />
        <SummaryStat k="Exam hints" v="2 caught" />
        <SummaryStat k="Open Qs" v="1 yours" />
      </div>
      <div className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--line)' }}>
        <div className="text-[10.5px] font-mono uppercase tracking-wider text-zinc-500 mb-2">23:00 — 28:00</div>
        <ul className="text-[12.5px] text-zinc-200 space-y-1.5 leading-relaxed">
          <li className="flex gap-2"><Dot/>The light reactions split water and oxidize chlorophyll a.</li>
          <li className="flex gap-2"><Dot/>Excited electrons flow PSII → pheophytin → PQ → cytochrome b₆f.</li>
          <li className="flex gap-2"><Dot accent/><span><span className="text-amber-200">Exam hint:</span> Walker said "expect a free-response on the proton gradient."</span></li>
        </ul>
      </div>
    </div>
  );
}

function SummaryStat({ k, v }) {
  return (
    <div className="border-t pt-2" style={{ borderColor: 'var(--line)' }}>
      <div className="text-[10.5px] font-mono uppercase tracking-wider text-zinc-500">{k}</div>
      <div className="text-[14px] text-zinc-100 mt-0.5">{v}</div>
    </div>
  );
}

function Dot({ accent }) {
  return <span className="mt-[7px] w-1 h-1 rounded-full shrink-0" style={{ background: accent ? '#fde68a' : 'var(--accent)' }}></span>;
}

function QuizMock() {
  return (
    <div className="rounded-xl p-4 mt-2" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--line)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10.5px] font-mono uppercase tracking-wider text-zinc-500">PSYC 110 · midterm prep</span>
        <span className="text-[10.5px] font-mono text-zinc-600">3 / 8</span>
      </div>
      <div className="text-[13.5px] text-zinc-100 mb-3 leading-snug">
        Loftus's "Lost in the Mall" study primarily demonstrates:
      </div>
      <div className="space-y-1.5">
        <Q letter="A">memory consolidation during sleep.</Q>
        <Q letter="B" picked>the malleability of autobiographical memory.</Q>
        <Q letter="C">interference between short- and long-term recall.</Q>
      </div>
      <div className="flex items-center justify-between mt-3 text-[11px]">
        <span className="text-emerald-400 font-mono">✓ correct · +1 streak</span>
        <button className="text-zinc-400 hover:text-zinc-100 inline-flex items-center gap-1">Next <IconArrowRight size={11}/></button>
      </div>
    </div>
  );
}

function Q({ letter, picked, children }) {
  return (
    <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-md text-[12.5px] leading-snug"
         style={{
           background: picked ? 'color-mix(in oklab, var(--accent) 14%, transparent)' : 'rgba(255,255,255,0.02)',
           border: picked ? '1px solid color-mix(in oklab, var(--accent) 40%, transparent)' : '1px solid var(--line)',
         }}>
      <span className="font-mono text-[10px] uppercase mt-[2px]"
            style={{ color: picked ? 'var(--accent-ink)' : 'var(--ink-5)' }}>{letter}</span>
      <span className={picked ? "text-zinc-100" : "text-zinc-400"}>{children}</span>
      {picked && <IconCheck size={11} stroke={2.5} className="ml-auto" style={{ color: 'var(--accent-ink)' }} />}
    </div>
  );
}

function AskMock() {
  return (
    <div className="rounded-xl p-4 mt-2" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--line)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10.5px] font-mono uppercase tracking-wider text-zinc-500">HIST 220 · open chat</span>
        <span className="text-[10.5px] font-mono text-zinc-600">context · 47 min</span>
      </div>
      <div className="space-y-3 text-[12.5px]">
        <div className="flex justify-end">
          <div className="rounded-2xl rounded-tr-sm px-2.5 py-1.5 text-zinc-200 max-w-[88%]"
               style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--line)' }}>
            wait — when did the Whig party actually collapse? Was it before or after Kansas-Nebraska?
          </div>
        </div>
        <div className="text-zinc-200 leading-relaxed">
          <span className="text-zinc-500 mr-1">SP ·</span>
          After. The Kansas-Nebraska Act of 1854 split Northern and Southern
          Whigs along slavery lines. By 1856 the national party had effectively
          dissolved — Northern Whigs flowed into the new Republican Party.
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <PChip>open in transcript · 38:14</PChip>
          <PChip>add to flashcards</PChip>
        </div>
      </div>
    </div>
  );
}

function PChip({ children }) {
  return (
    <button className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-mono text-zinc-400"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)' }}>
      {children}
    </button>
  );
}

// ——— § 02 · How it works ———————————————————————————————————
// Editorial vertical timeline. Numbered, with hairline rails and small frames.

function HowItWorks() {
  const steps = [
    { n: "01", title: "Pin StudyPilot to your browser",
      body: "Chrome, Edge, Arc, or Brave. The panel docks to whichever side you keep your notes on. It only activates when you say so — no background listening.",
      detail: <PinDetail/>,
    },
    { n: "02", title: "Open the thing you're trying to learn",
      body: "A Zoom recording. A YouTube lecture. A 40-page PDF. A Wikipedia article. StudyPilot reads the page and listens to whatever's playing in the tab.",
      detail: <SourceDetail/>,
    },
    { n: "03", title: "Talk to it like a study partner",
      body: "Hold space to ask. Type follow-ups. Switch between Listen, Summarize, Quiz, and Ask without losing context. Everything you said in the last hour is on the table.",
      detail: <AskDetail/>,
    },
  ];

  return (
    <section id="how" className="relative border-t" style={{ borderColor: 'var(--line)' }}>
      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-24 sm:py-32">
        <SectionHead
          num="§ 02"
          kicker="workflow"
          title={<>Thirty seconds to install. <span className="text-zinc-500">No setup after that.</span></>}
        />

        <div className="grid lg:grid-cols-12 gap-8">
          {/* Rail */}
          <div className="hidden lg:block lg:col-span-1 relative">
            <div className="absolute left-1/2 top-3 bottom-3 w-px" style={{ background: 'linear-gradient(180deg, transparent, var(--line-strong), transparent)' }}></div>
          </div>
          <div className="lg:col-span-11 space-y-10">
            {steps.map((s, i) => (
              <article key={s.n} className="grid lg:grid-cols-12 gap-6 lg:gap-10 items-start">
                <div className="lg:col-span-5">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-full text-[12px] font-mono text-white"
                          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-3))', boxShadow: '0 0 20px -6px color-mix(in oklab, var(--accent) 60%, transparent)' }}>
                      {s.n}
                    </span>
                    <span className="rule flex-1 max-w-[80px]"></span>
                  </div>
                  <h3 className="text-[24px] font-semibold tracking-tight text-zinc-50 leading-[1.18]">{s.title}</h3>
                  <p className="text-[14px] text-zinc-400 leading-relaxed mt-3 max-w-md">{s.body}</p>
                </div>
                <div className="lg:col-span-7">
                  {s.detail}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PinDetail() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10.5px] font-mono uppercase tracking-wider text-zinc-500">browser · extensions</span>
        <span className="text-[10.5px] font-mono text-emerald-400">installed</span>
      </div>
      <div className="space-y-2">
        <ExtRow name="Grammarly" icon="rect" />
        <ExtRow name="1Password" icon="round" />
        <ExtRow name="StudyPilot" pinned />
        <ExtRow name="Notion Web Clipper" icon="rect" />
      </div>
    </div>
  );
}
function ExtRow({ name, icon, pinned }) {
  return (
    <div className="flex items-center gap-3 px-2 py-1.5 rounded-md"
         style={{ background: pinned ? 'rgba(255,255,255,0.03)' : 'transparent', border: pinned ? '1px solid var(--line)' : '1px solid transparent' }}>
      {pinned ? <SMark size={18} /> :
        <span className={"w-4 h-4 inline-block " + (icon === 'round' ? 'rounded-full' : 'rounded-sm')} style={{ background: '#26262e' }}></span>}
      <span className={"text-[12.5px] " + (pinned ? "text-zinc-100" : "text-zinc-500")}>{name}</span>
      <div className="flex-1"></div>
      {pinned && <span className="text-[10px] font-mono" style={{ color: 'var(--accent-ink)' }}>pinned</span>}
    </div>
  );
}

function SourceDetail() {
  const sources = [
    { name: "MIT OCW · Lecture 14", meta: "47 min · video", live: true },
    { name: "Origin of Species, Ch. 4", meta: "PDF · 28 pages" },
    { name: "Loftus (1995) · Lost in the Mall", meta: "JSTOR article" },
    { name: "Khan · Linear Algebra · Eigenvectors", meta: "18 min · video" },
  ];
  return (
    <div className="card p-5">
      <div className="text-[10.5px] font-mono uppercase tracking-wider text-zinc-500 mb-3">currently open · 4 tabs</div>
      <div className="space-y-1.5">
        {sources.map((s) => (
          <div key={s.name} className="flex items-center gap-3 px-2.5 py-2 rounded-md"
               style={{ background: s.live ? 'color-mix(in oklab, var(--accent) 8%, transparent)' : 'transparent', border: '1px solid ' + (s.live ? 'color-mix(in oklab, var(--accent) 30%, transparent)' : 'var(--line)') }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.live ? 'var(--accent)' : '#3f3f46' }}></span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] text-zinc-100 truncate">{s.name}</div>
              <div className="text-[10.5px] text-zinc-500 font-mono">{s.meta}</div>
            </div>
            {s.live && <span className="text-[10px] font-mono" style={{ color: 'var(--accent-ink)' }}>active</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function AskDetail() {
  return (
    <div className="card p-5">
      <div className="grid grid-cols-2 gap-3 mb-3">
        <KbdRow keys={["Space"]} label="hold to talk" />
        <KbdRow keys={["⌘","K"]} label="open ask" />
        <KbdRow keys={["⌘","1"]} label="summarize" />
        <KbdRow keys={["⌘","Q"]} label="quiz me" />
      </div>
      <div className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--line)' }}>
        <div className="text-[10.5px] font-mono uppercase tracking-wider text-zinc-500 mb-2">your last question</div>
        <div className="text-[12.5px] text-zinc-100 leading-snug">
          "you said the Whig party collapsed — was that before or after Kansas–Nebraska?"
        </div>
      </div>
    </div>
  );
}
function KbdRow({ keys, label }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-md" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--line)' }}>
      <div className="flex gap-1">
        {keys.map((k) => (
          <kbd key={k} className="px-1.5 py-0.5 rounded text-[10.5px] font-mono text-zinc-300"
               style={{ background: '#1c1e26', border: '1px solid var(--line-strong)', boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.4)' }}>{k}</kbd>
        ))}
      </div>
      <span className="text-[11.5px] text-zinc-500">{label}</span>
    </div>
  );
}

// ——— § 03 · Stance ——————————————————————————————————————
// A short, calm statement on what StudyPilot won't do.

function Stance() {
  return (
    <section id="stance" className="relative border-t" style={{ borderColor: 'var(--line)' }}>
      <div className="max-w-5xl mx-auto px-6 sm:px-8 py-24 sm:py-32">
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-1">
            <div className="section-mark">§ 03</div>
          </div>
          <div className="lg:col-span-11">
            <div className="section-mark mb-4">/ stance</div>
            <p className="text-[28px] sm:text-[36px] font-semibold tracking-[-0.02em] text-zinc-50 leading-[1.18] max-w-3xl">
              <span className="text-zinc-500">StudyPilot won't write your essay,</span>{" "}
              answer your homework for you, or do the thinking on a quiz.{" "}
              <span className="text-zinc-500">It will sit next to you while you do it.</span>
            </p>
            <div className="mt-10 grid sm:grid-cols-3 gap-px rounded-xl overflow-hidden" style={{ background: 'var(--line)', border: '1px solid var(--line)' }}>
              <StanceCell label="What it does" items={["Surfaces definitions", "Explains a step you missed", "Asks back when you guess"]} ok />
              <StanceCell label="What it won't" items={["Write graded work", "Answer take-home exams", "Submit anything for you"]} />
              <StanceCell label="What you control" items={["When the mic is on", "Where transcripts live", "Whether sessions are saved"]} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StanceCell({ label, items, ok }) {
  return (
    <div className="p-5" style={{ background: 'var(--surface)' }}>
      <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-3">{label}</div>
      <ul className="space-y-2 text-[13px] text-zinc-200">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 leading-snug">
            <span className="mt-[6px] w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: ok ? 'var(--accent)' : 'var(--ink-5)' }}></span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ——— § 04 · Final CTA ———————————————————————————————————

function FinalCTA() {
  return (
    <section id="cta" className="relative overflow-hidden border-t" style={{ borderColor: 'var(--line)' }}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[900px] h-[600px]"
             style={{
               background: 'radial-gradient(50% 50% at 50% 50%, color-mix(in oklab, var(--accent) 35%, transparent), transparent 70%)',
               filter: 'blur(50px)',
               opacity: 0.7,
             }}></div>
      </div>
      <div className="max-w-5xl mx-auto px-6 sm:px-8 py-28 sm:py-40 relative">
        <div className="grid lg:grid-cols-12 gap-8 items-end">
          <div className="lg:col-span-8">
            <div className="section-mark mb-5">§ 04 / install</div>
            <h2 className="text-[44px] sm:text-[64px] font-semibold tracking-[-0.03em] leading-[0.98]">
              <span className="text-zinc-50">Open any tab.</span>{" "}
              <span className="grad-text">Learn it better.</span>
            </h2>
            <p className="mt-6 text-[15px] text-zinc-400 max-w-md leading-relaxed">
              Free during beta. Around 30 seconds to install. Your audio and
              transcripts stay on-device unless you turn cloud sync on.
            </p>
          </div>
          <div className="lg:col-span-4 flex flex-col gap-2">
            <a href="#" className="btn-primary inline-flex items-center justify-center gap-1.5 py-3 text-[14px]">
              Add to Chrome — Free <IconArrowRight size={14}/>
            </a>
            <div className="text-[11px] font-mono text-zinc-500 text-center mt-1">
              also: Edge · Arc · Brave
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t" style={{ borderColor: 'var(--line)' }}>
      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <SMark size={22} />
          <span className="font-semibold tracking-[-0.02em] text-zinc-100">StudyPilot</span>
          <span className="text-[12px] text-zinc-500 ml-2">© 2026 · Built by students, for students</span>
        </div>
        <div className="flex items-center gap-5 text-[13px] text-zinc-400">
          <a className="hover:text-zinc-100" href="#features">Capabilities</a>
          <a className="hover:text-zinc-100" href="#how">Workflow</a>
          <a className="hover:text-zinc-100" href="#stance">Stance</a>
          <a className="hover:text-zinc-100" href="#">Privacy</a>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { Capabilities, HowItWorks, Stance, FinalCTA, Footer });

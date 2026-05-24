// StudyPilot extension mockup — rich, multi-state, art-directed.
// Shows: live listening with a running transcript, a summary block,
// a quiz card, and a follow-up Q below — i.e. one full session.

function ProductMockup() {
  return (
    <div className="card overflow-hidden">
      <BrowserChrome />
      <div className="grid grid-cols-12" style={{ background: '#06080d' }}>
        {/* The page being learned from — kept understated */}
        <div className="hidden md:block md:col-span-7 lg:col-span-7 border-r" style={{ borderColor: 'var(--line)' }}>
          <LecturePage />
        </div>
        <aside className="col-span-12 md:col-span-5 lg:col-span-5 flex flex-col"
               style={{ background: 'linear-gradient(180deg, #0a0c12, #07080c)' }}>
          <ExtensionPanel />
        </aside>
      </div>
    </div>
  );
}

function BrowserChrome() {
  return (
    <div className="flex items-center gap-2 px-3 h-9 border-b" style={{ background: '#0a0c13', borderColor: 'var(--line)' }}>
      <div className="flex gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#2a2a30' }}></span>
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#2a2a30' }}></span>
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#2a2a30' }}></span>
      </div>
      <div className="flex-1 flex justify-center">
        <div className="flex items-center gap-2 px-3 py-1 rounded-md text-[11px] text-zinc-400 font-mono"
             style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)' }}>
          <IconLock size={10} />
          <span>ocw.mit.edu / biology · lecture 14 · photosynthesis</span>
        </div>
      </div>
      <button className="relative inline-flex items-center justify-center w-8 h-7 rounded-md"
              style={{ background: 'color-mix(in oklab, var(--accent) 16%, transparent)', border: '1px solid color-mix(in oklab, var(--accent) 35%, transparent)' }}>
        <SMark size={20} />
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full pulse-dot" style={{ background: 'var(--accent)' }}></span>
      </button>
    </div>
  );
}

function LecturePage() {
  return (
    <div className="px-9 py-8 max-w-[600px]">
      <div className="text-[10.5px] font-mono uppercase tracking-[0.2em] text-zinc-600 mb-2">
        MIT OpenCourseWare · 7.014
      </div>
      <h3 className="text-[26px] text-zinc-100 mb-3 leading-[1.18] tracking-tight">
        Lecture 14 — Photosynthesis: The Light Reactions
      </h3>
      <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-500 mb-7">
        <span>Prof. Walker</span>
        <span className="text-zinc-700">·</span>
        <span>47 min</span>
        <span className="text-zinc-700">·</span>
        <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: '#ef4444' }}></span>playing 23:14</span>
      </div>

      {/* Faux video frame */}
      <div className="rounded-xl overflow-hidden mb-7 relative" style={{ aspectRatio: '16/9', background: 'linear-gradient(135deg, #1a1d28, #0e1018)', border: '1px solid var(--line)' }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-full"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)' }}>
            <IconPlay size={14} className="text-white ml-0.5" />
          </span>
        </div>
        {/* Faint waveform across bottom */}
        <div className="absolute left-0 right-0 bottom-3 px-4 flex items-end gap-[2px] h-5 opacity-60">
          {Array.from({ length: 48 }).map((_, i) => (
            <span key={i} className="flex-1 rounded-full" style={{ height: 4 + Math.abs(Math.sin(i * 0.7)) * 14, background: 'rgba(255,255,255,0.35)' }}></span>
          ))}
        </div>
        <div className="absolute bottom-2 right-3 text-[10.5px] font-mono text-zinc-300">23:14 / 47:02</div>
      </div>

      <p className="text-[13.5px] text-zinc-400 leading-relaxed mb-3">
        "…so when a photon of the right energy hits chlorophyll a in
        Photosystem II, what really happens is an electron gets boosted up to a
        higher orbital. And that electron is now <em>hot enough</em> to leave the
        molecule entirely…"
      </p>
      <p className="text-[13.5px] text-zinc-600 leading-relaxed">
        "Now, the molecule on the receiving end — pheophytin — its job is to…"
      </p>
    </div>
  );
}

// — Extension Panel ——————————————————————————————————————————————

function ExtensionPanel() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 h-11 px-4 border-b" style={{ borderColor: 'var(--line)' }}>
        <SMark size={22} />
        <span className="text-[12.5px] font-semibold tracking-[-0.02em] text-zinc-100">StudyPilot</span>
        <span className="text-[10.5px] font-mono text-zinc-600 ml-1">/ biology · 7.014</span>
        <div className="flex-1"></div>
        <ModelChip />
      </div>

      {/* Orb stage — compact */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-4">
        <Orb size={64} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-0.5">
            <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }}></span>
            <span>Listening to lecture</span>
          </div>
          <div className="text-[13px] text-zinc-100 leading-snug truncate">23:14 · electron transport chain</div>
          <div className="text-[11px] text-zinc-500 mt-0.5 truncate">Following along, no questions yet</div>
        </div>
      </div>

      {/* Transcript */}
      <div className="px-4 pb-3">
        <SectionLabel>Live transcript</SectionLabel>
        <div className="mt-2 space-y-1.5 text-[12px] leading-snug">
          <TranscriptLine time="22:58" text="…chlorophyll a in Photosystem II catches the photon —" />
          <TranscriptLine time="23:06" text="that electron gets bumped to a higher orbital, hot enough to leave the molecule." />
          <TranscriptLine time="23:14" text="The next molecule is pheophytin, and its job is to accept—" live />
        </div>
      </div>

      {/* Summary */}
      <div className="mx-4 mt-1 rounded-2xl p-3.5"
           style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>Summarized · last 5 min</SectionLabel>
          <span className="text-[10px] font-mono text-zinc-600">auto</span>
        </div>
        <ul className="text-[12.5px] text-zinc-200 leading-relaxed space-y-1.5">
          <SumLi>Photon hits chlorophyll <em>a</em> → excites an electron.</SumLi>
          <SumLi>Excited electron leaves PSII → enters the ETC via pheophytin.</SumLi>
          <SumLi>Energy released along the chain pumps H⁺ into the thylakoid.</SumLi>
        </ul>
      </div>

      {/* Quiz card */}
      <div className="mx-4 mt-3 rounded-2xl p-3.5"
           style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>Quiz · check before exam</SectionLabel>
          <span className="text-[10px] font-mono text-zinc-600">1 / 4</span>
        </div>
        <div className="text-[12.5px] text-zinc-100 mb-2.5 leading-snug">
          What does pheophytin do in the electron transport chain?
        </div>
        <div className="space-y-1">
          <QzOpt letter="A">Donates an electron to chlorophyll a.</QzOpt>
          <QzOpt letter="B" picked>Accepts the high-energy electron from PSII.</QzOpt>
          <QzOpt letter="C">Splits water to release O₂.</QzOpt>
        </div>
      </div>

      {/* Follow-up — user just asked */}
      <div className="px-4 mt-3 space-y-2">
        <div className="flex items-start gap-2 justify-end">
          <div className="rounded-2xl rounded-tr-sm px-2.5 py-1.5 text-[12.5px] text-zinc-200 leading-snug max-w-[78%]"
               style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--line)' }}>
            why is the electron "hot" after the photon hits it?
          </div>
          <span className="text-[10px] font-mono text-zinc-600 mt-1.5">you</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-[10px] font-mono text-zinc-600 mt-1.5 shrink-0">SP</span>
          <div className="text-[12.5px] text-zinc-200 leading-snug max-w-[88%]">
            <span className="text-zinc-400">Typing</span>{" "}
            <span className="inline-flex gap-0.5">
              <span className="pulse-dot inline-block w-1 h-1 rounded-full bg-zinc-300"></span>
              <span className="pulse-dot inline-block w-1 h-1 rounded-full bg-zinc-300"></span>
              <span className="pulse-dot inline-block w-1 h-1 rounded-full bg-zinc-300"></span>
            </span>
          </div>
        </div>
      </div>

      {/* Quick actions + input */}
      <div className="mt-auto px-4 pb-4 pt-4 border-t" style={{ borderColor: 'var(--line)' }}>
        <div className="flex items-center gap-1.5 mb-2.5">
          <QuickBtn active>Summarize</QuickBtn>
          <QuickBtn>Explain</QuickBtn>
          <QuickBtn>Quiz me</QuickBtn>
          <QuickBtn>Flashcards</QuickBtn>
        </div>
        <div className="flex items-center gap-2 rounded-full pl-3.5 pr-1 py-1"
             style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)' }}>
          <IconMic size={12} className="text-zinc-500" />
          <span className="text-[12.5px] text-zinc-500 flex-1 truncate">Ask anything about this lecture…</span>
          <span className="text-[10.5px] font-mono text-zinc-600 hidden sm:inline">⌘ K</span>
          <button className="ml-1 inline-flex items-center justify-center w-7 h-7 rounded-full text-zinc-900"
                  style={{ background: '#fafafa' }}>
            <IconArrowUp size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// — Panel sub-components ————————————————————————————————

function SectionLabel({ children }) {
  return (
    <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">{children}</div>
  );
}

function TranscriptLine({ time, text, live }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[10px] font-mono text-zinc-600 mt-[2px] w-9 shrink-0">{time}</span>
      <span className={live ? "text-zinc-100" : "text-zinc-500"}>
        {text}
        {live && <span className="inline-block w-1.5 h-3 ml-1 align-middle" style={{ background: 'var(--accent)', animation: 'pulseDot 1s infinite' }}></span>}
      </span>
    </div>
  );
}

function SumLi({ children }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-[7px] w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--accent)' }}></span>
      <span>{children}</span>
    </li>
  );
}

function QzOpt({ letter, children, picked }) {
  return (
    <div className="flex items-start gap-2 px-2 py-1.5 rounded-lg text-[12px] leading-snug"
         style={{
           background: picked ? 'color-mix(in oklab, var(--accent) 14%, transparent)' : 'transparent',
           border: picked ? '1px solid color-mix(in oklab, var(--accent) 40%, transparent)' : '1px solid var(--line)',
         }}>
      <span className="font-mono text-[10px] uppercase mt-[2px]"
            style={{ color: picked ? 'var(--accent-ink)' : 'var(--ink-5)' }}>{letter}</span>
      <span className={picked ? "text-zinc-100" : "text-zinc-400"}>{children}</span>
      {picked && <IconCheck size={11} stroke={2.5} className="ml-auto mt-[3px]" style={{ color: 'var(--accent-ink)' }} />}
    </div>
  );
}

function QuickBtn({ children, active }) {
  return (
    <button className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] transition-colors"
            style={{
              background: active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.025)',
              color: active ? '#fff' : 'var(--ink-3)',
              border: '1px solid ' + (active ? 'var(--line-strong)' : 'var(--line)'),
            }}>
      {children}
    </button>
  );
}

function ModelChip() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono text-zinc-300"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)' }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}></span>
      Gemini 3.1 Flash · Live
    </span>
  );
}

// — Orb ———————————————————————————————————————————————————————

// Brand orb — cyan → blue → violet → pink (matches logo art exactly)
function Orb({ size = 168, arrow = true }) {
  return (
    <div className="relative orb shrink-0" style={{ width: size, height: size }}>
      {/* Outer ripples */}
      <span className="absolute inset-0 rounded-full orb-ripple"
            style={{ border: '1px solid rgba(124, 92, 255, 0.45)', animationDelay: '0s' }}></span>
      <span className="absolute inset-0 rounded-full orb-ripple"
            style={{ border: '1px solid rgba(57, 215, 255, 0.45)', animationDelay: '1.4s' }}></span>

      {/* Outer halo */}
      <span className="absolute -inset-3 rounded-full orb-halo pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 30% 25%, rgba(57,215,255,0.40), transparent 55%),' +
                'radial-gradient(circle at 70% 75%, rgba(255,79,216,0.30), transparent 55%),' +
                'radial-gradient(circle, rgba(124,92,255,0.40), transparent 60%)',
              filter: 'blur(' + Math.round(size / 12) + 'px)',
            }}></span>

      {/* Conic ring (matches brand gradient) */}
      <span className="absolute inset-0 rounded-full orb-conic" style={{ opacity: 0.85 }}></span>

      {/* Inner sphere — the exact brand orb gradient */}
      <span className="absolute rounded-full"
            style={{
              inset: Math.max(3, size * 0.04),
              background:
                'radial-gradient(circle at 30% 25%, #39D7FF 0%, #5C6CFF 42%, #A855F7 72%, #FF4FD8 100%)',
              boxShadow: 'inset 0 0 60px rgba(255,255,255,0.10), inset 0 0 0 1px rgba(255,255,255,0.18)',
            }}></span>

      {/* Spec highlight */}
      <span className="absolute rounded-full"
            style={{
              top: '12%', left: '22%', width: '40%', height: '24%',
              background: 'radial-gradient(ellipse, rgba(255,255,255,0.60), transparent 70%)',
              filter: 'blur(2px)',
            }}></span>

      {/* Pilot arrow (matches the brand mark) */}
      {arrow && (
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" fill="none"
             style={{ filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.55))' }}>
          <path d="M50 30 L62 70 L50 62 L38 70 Z" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="rgba(255,255,255,0.12)"/>
          <path d="M50 36 V62" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" opacity="0.85"/>
        </svg>
      )}
    </div>
  );
}

// Brand mark — the real StudyPilot logo SVG (browser frame + orb + book)
function SMark({ size = 22 }) {
  return (
    <span className="inline-flex items-center justify-center shrink-0" style={{ width: size, height: size * 0.9 }}>
      <svg width={size} height={size * 0.9} viewBox="0 0 200 180" fill="none">
        <defs>
          <linearGradient id={`sp-orb-${size}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#39D7FF"/>
            <stop offset="42%" stopColor="#5C6CFF"/>
            <stop offset="72%" stopColor="#A855F7"/>
            <stop offset="100%" stopColor="#FF4FD8"/>
          </linearGradient>
          <linearGradient id={`sp-line-${size}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#5BB8FF"/>
            <stop offset="50%" stopColor="#7C5CFF"/>
            <stop offset="100%" stopColor="#F04CFF"/>
          </linearGradient>
        </defs>
        {/* Browser frame */}
        <path d="M34 72V38c0-9.9 8.1-18 18-18h96c9.9 0 18 8.1 18 18v34" stroke="#5A6273" strokeWidth="4" fill="none" strokeLinecap="round"/>
        <path d="M34 48h132" stroke="#3A4154" strokeWidth="3"/>
        <circle cx="52" cy="34" r="4.5" fill="#7A8290"/>
        <circle cx="66" cy="34" r="4.5" fill="#7A8290" opacity="0.8"/>
        <circle cx="80" cy="34" r="4.5" fill="#7A8290" opacity="0.6"/>
        {/* Sparkle */}
        <path d="M132 28l3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8z" fill="#FFFFFF"/>
        {/* Orb */}
        <circle cx="100" cy="92" r="44" fill={`url(#sp-orb-${size})`}/>
        {/* Pilot arrow inside orb */}
        <path d="M100 61l19 58-19-13-19 13 19-58z" stroke="#FFFFFF" strokeWidth="4" fill="none" strokeLinejoin="round" strokeLinecap="round"/>
        {/* Book pages */}
        <path d="M100 155c-23-16-49-22-86-22" stroke={`url(#sp-line-${size})`} strokeWidth="4" fill="none" strokeLinecap="round"/>
        <path d="M100 155c23-16 49-22 86-22" stroke={`url(#sp-line-${size})`} strokeWidth="4" fill="none" strokeLinecap="round"/>
        <path d="M100 155c-19-10-43-14-78-14" stroke="#8B8CFF" strokeWidth="2.8" fill="none" strokeLinecap="round" opacity="0.85"/>
        <path d="M100 155c19-10 43-14 78-14" stroke="#F04CFF" strokeWidth="2.8" fill="none" strokeLinecap="round" opacity="0.85"/>
      </svg>
    </span>
  );
}

Object.assign(window, { ProductMockup, Orb, SMark });

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "brand",
  "ambient": true
}/*EDITMODE-END*/;

// Brand-first palettes. Default uses StudyPilot's official tokens.
const ACCENTS = {
  brand:  { c: '#7C5CFF', c2: '#39D7FF', c3: '#FF4FD8' },
  cyan:   { c: '#39D7FF', c2: '#5BB8FF', c3: '#7C5CFF' },
  pink:   { c: '#FF4FD8', c2: '#A855F7', c3: '#7C5CFF' },
  cool:   { c: '#5BB8FF', c2: '#39D7FF', c3: '#7C5CFF' },
};

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [navOpen, setNavOpen] = React.useState(false);

  React.useEffect(() => {
    const a = ACCENTS[t.accent] || ACCENTS.brand;
    document.documentElement.style.setProperty('--accent', a.c);
    document.documentElement.style.setProperty('--accent-2', a.c2);
    document.documentElement.style.setProperty('--accent-3', a.c3);
  }, [t.accent]);

  return (
    <div className="min-h-screen">
      <Nav navOpen={navOpen} setNavOpen={setNavOpen} />
      <Hero ambient={t.ambient} />
      <Capabilities />
      <HowItWorks />
      <Stance />
      <FinalCTA />
      <Footer />

      <TweaksPanel>
        <TweakSection label="Accent" />
        <TweakColor
          label="Hue"
          value={ACCENTS[t.accent]?.c}
          options={[
            [ACCENTS.brand.c, ACCENTS.brand.c2, ACCENTS.brand.c3],
            [ACCENTS.cyan.c,  ACCENTS.cyan.c2,  ACCENTS.cyan.c3],
            [ACCENTS.pink.c,  ACCENTS.pink.c2,  ACCENTS.pink.c3],
            [ACCENTS.cool.c,  ACCENTS.cool.c2,  ACCENTS.cool.c3],
          ]}
          onChange={(v) => {
            const first = Array.isArray(v) ? v[0] : v;
            const key = Object.keys(ACCENTS).find(k => ACCENTS[k].c === first) || 'brand';
            setTweak('accent', key);
          }}
        />
        <TweakSection label="Hero" />
        <TweakToggle label="Ambient glow" value={t.ambient} onChange={(v) => setTweak('ambient', v)} />
      </TweaksPanel>
    </div>
  );
}

function Logo() {
  return (
    <a href="#" className="flex items-center gap-2.5">
      <SMark size={26} />
      <span className="font-semibold tracking-[-0.04em] text-[16px] text-zinc-50">StudyPilot</span>
    </a>
  );
}

function Nav({ navOpen, setNavOpen }) {
  const items = [
    { label: 'Capabilities', href: '#features' },
    { label: 'Workflow', href: '#how' },
    { label: 'Pricing', href: '#cta' },
    { label: 'Changelog', href: '#' },
  ];
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl border-b" style={{ background: 'rgba(6,7,10,0.65)', borderColor: 'var(--line)' }}>
      <div className="max-w-6xl mx-auto px-6 sm:px-8 h-14 flex items-center gap-6">
        <Logo />
        <nav className="hidden md:flex items-center gap-6 text-[13.5px]">
          {items.map((i) => (
            <a key={i.label} href={i.href} className="nav-link transition-colors">{i.label}</a>
          ))}
        </nav>
        <div className="flex-1"></div>
        <a href="#" className="hidden sm:inline text-[13.5px] nav-link">Sign in</a>
        <a href="#cta" className="btn-primary inline-flex items-center gap-1.5">
          Add to Chrome
        </a>
        <button className="md:hidden p-1.5 rounded-md text-zinc-300" onClick={() => setNavOpen(!navOpen)}>
          {navOpen ? <IconClose size={18}/> : <IconMenu size={18}/>}
        </button>
      </div>
      {navOpen && (
        <div className="md:hidden border-t" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
          <div className="max-w-6xl mx-auto px-6 py-3 flex flex-col gap-1 text-[14px]">
            {items.map((i) => (
              <a key={i.label} href={i.href} onClick={() => setNavOpen(false)} className="py-2 nav-link">{i.label}</a>
            ))}
            <a href="#" onClick={() => setNavOpen(false)} className="py-2 nav-link">Sign in</a>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero({ ambient }) {
  return (
    <section className="relative overflow-hidden">
      {/* One restrained ambient wash — top-left, not centered */}
      {ambient && (
        <div className="absolute inset-x-0 -top-32 h-[800px] pointer-events-none">
          <div className="absolute -left-40 top-0 w-[900px] h-[700px]"
               style={{
                 background:
                   'radial-gradient(50% 50% at 30% 30%, color-mix(in oklab, var(--accent) 32%, transparent), transparent 70%)',
                 filter: 'blur(60px)',
               }}></div>
          <div className="absolute right-0 top-40 w-[600px] h-[500px]"
               style={{
                 background:
                   'radial-gradient(50% 50% at 70% 30%, color-mix(in oklab, var(--accent-2) 16%, transparent), transparent 70%)',
                 filter: 'blur(50px)',
               }}></div>
        </div>
      )}

      <div className="relative max-w-6xl mx-auto px-6 sm:px-8 pt-12 sm:pt-16 pb-20 sm:pb-28">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          {/* Left — copy. Note the asymmetric col split (5 / 7) — copy is the smaller column. */}
          <div className="lg:col-span-5 lg:pt-12">
            {/* Editorial top label */}
            <div className="flex items-center gap-3 mb-6">
              <span className="section-mark">— v 0.9 · beta</span>
              <span className="rule flex-1 max-w-[60px]"></span>
            </div>

            <h1 className="text-[44px] sm:text-[56px] lg:text-[68px] font-semibold tracking-[-0.035em] leading-[0.98]">
              <span className="grad-text">A study copilot</span>
              <br/>
              <span className="text-zinc-50">for the tab</span>
              <br/>
              <span className="text-zinc-400">you're already learning from.</span>
            </h1>

            <p className="mt-7 text-[15.5px] text-zinc-400 leading-relaxed max-w-md">
              StudyPilot listens to your lecture, reads what's on the page, and
              answers the questions you'd be too slow to type. Built for
              students who actually want to understand the material.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#cta" className="btn-primary inline-flex items-center gap-1.5 px-5 py-3 text-[14px]">
                Add to Chrome <IconArrowRight size={14} />
              </a>
              <a href="#how" className="btn-secondary inline-flex items-center gap-1.5 px-5 py-3 text-[14px]">
                <IconPlay size={11} /> Watch a session
              </a>
            </div>

            {/* Small honest counter strip — not fake stats */}
            <div className="mt-10 flex items-center gap-5 text-[11.5px] font-mono text-zinc-500">
              <span><span className="text-zinc-200">Free</span> while in beta</span>
              <span className="text-zinc-700">·</span>
              <span><span className="text-zinc-200">12+</span> sites supported</span>
              <span className="text-zinc-700">·</span>
              <span><span className="text-zinc-200">Gemini</span> 3.1 Flash · Live</span>
            </div>
          </div>

          {/* Right — wider mockup column with breathing room */}
          <div className="lg:col-span-7 relative">
            <div className="absolute -inset-6 pointer-events-none">
              <div className="w-full h-full" style={{
                background: 'radial-gradient(50% 50% at 50% 40%, color-mix(in oklab, var(--accent) 18%, transparent), transparent 70%)',
                filter: 'blur(40px)',
              }}></div>
            </div>
            <div className="relative">
              <ProductMockup />
            </div>

            {/* Tiny caption beneath, magazine-style */}
            <div className="hidden lg:flex items-center gap-2 mt-4 px-1 text-[10.5px] font-mono text-zinc-500">
              <span className="w-3 h-px bg-zinc-700"></span>
              <span>Listening to MIT OCW · Photosynthesis · Lecture 14</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

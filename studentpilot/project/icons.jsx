// Minimal icon set — original SVGs, lucide-style (24×24, 1.5 stroke, round caps)
const Ico = ({ d, size = 16, stroke = 1.6, fill = "none", children, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
       strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {d ? <path d={d} /> : children}
  </svg>
);

const IconArrowRight  = (p) => <Ico {...p}><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></Ico>;
const IconArrowUpRight= (p) => <Ico {...p}><path d="M7 17 17 7"/><path d="M8 7h9v9"/></Ico>;
const IconPlay        = (p) => <Ico {...p}><path d="M7 5v14l12-7z" fill="currentColor" stroke="none"/></Ico>;
const IconCheck       = (p) => <Ico {...p}><path d="M4 12.5 9 17.5 20 6.5"/></Ico>;
const IconMic         = (p) => <Ico {...p}><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></Ico>;
const IconScreen      = (p) => <Ico {...p}><rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="m9 11 3-3 3 3"/><path d="M12 8v5"/></Ico>;
const IconRubric      = (p) => <Ico {...p}><path d="M5 3.5h11l3 3V20a.5.5 0 0 1-.5.5h-13A.5.5 0 0 1 5 20Z"/><path d="M16 3.5V7h3"/><path d="M8.5 11h7"/><path d="M8.5 14.5h7"/><path d="M8.5 17.5h4"/></Ico>;
const IconSparkle     = (p) => <Ico {...p}><path d="M12 4v4"/><path d="M12 16v4"/><path d="M4 12h4"/><path d="M16 12h4"/><path d="m6.5 6.5 2.5 2.5"/><path d="m15 15 2.5 2.5"/><path d="m6.5 17.5 2.5-2.5"/><path d="m15 9 2.5-2.5"/></Ico>;
const IconShield      = (p) => <Ico {...p}><path d="M12 3 5 5.5v6.2c0 4.2 2.9 7.9 7 9.3 4.1-1.4 7-5.1 7-9.3V5.5Z"/><path d="m9.5 12 2 2 3.5-4"/></Ico>;
const IconClock       = (p) => <Ico {...p}><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></Ico>;
const IconList        = (p) => <Ico {...p}><path d="M8 6h12"/><path d="M8 12h12"/><path d="M8 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/></Ico>;
const IconBook        = (p) => <Ico {...p}><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v16.5H5.5A1.5 1.5 0 0 1 4 18Z"/><path d="M4 18a1.5 1.5 0 0 1 1.5-1.5H19"/></Ico>;
const IconSlides      = (p) => <Ico {...p}><rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M9 21h6"/><path d="M12 17v4"/><path d="M8 10h5"/><path d="M8 13h8"/></Ico>;
const IconBrain       = (p) => <Ico {...p}><path d="M9 4.5a2.5 2.5 0 0 0-2.5 2.5A2.5 2.5 0 0 0 4 9.5a2.5 2.5 0 0 0 1 2 2.5 2.5 0 0 0 0 4 2.5 2.5 0 0 0 2.5 2.5A2.5 2.5 0 0 0 10 20.5h.5V4.5Z"/><path d="M15 4.5a2.5 2.5 0 0 1 2.5 2.5 2.5 2.5 0 0 1 2.5 2.5 2.5 2.5 0 0 1-1 2 2.5 2.5 0 0 1 0 4 2.5 2.5 0 0 1-2.5 2.5 2.5 2.5 0 0 1-2.5 2.5H13.5V4.5Z"/></Ico>;
const IconUpload      = (p) => <Ico {...p}><path d="M12 16V5"/><path d="m7 10 5-5 5 5"/><path d="M5 20h14"/></Ico>;
const IconMonitor     = (p) => <Ico {...p}><rect x="2.5" y="4" width="19" height="13" rx="1.5"/><path d="M8 21h8"/><path d="M12 17v4"/></Ico>;
const IconChat        = (p) => <Ico {...p}><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/></Ico>;
const IconDot         = (p) => <Ico {...p}><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></Ico>;
const IconArrowDown   = (p) => <Ico {...p}><path d="M12 5v14"/><path d="m6 13 6 6 6-6"/></Ico>;
const IconStar        = (p) => <Ico {...p}><path d="M12 3.5 14.5 9l6 .9-4.4 4.2 1 6L12 17l-5.1 3 1-6L3.5 9.9 9.5 9Z"/></Ico>;
const IconChevron     = (p) => <Ico {...p}><path d="m9 6 6 6-6 6"/></Ico>;
const IconFolder      = (p) => <Ico {...p}><path d="M3.5 6a1.5 1.5 0 0 1 1.5-1.5h4l2 2h8A1.5 1.5 0 0 1 20.5 8v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18Z"/></Ico>;
const IconHistory     = (p) => <Ico {...p}><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4.5V9H8"/><path d="M12 8v4l3 2"/></Ico>;
const IconBookmark    = (p) => <Ico {...p}><path d="M6.5 4.5h11v15l-5.5-3.5-5.5 3.5z"/></Ico>;
const IconTarget      = (p) => <Ico {...p}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></Ico>;
const IconSearch      = (p) => <Ico {...p}><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/></Ico>;
const IconMenu        = (p) => <Ico {...p}><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></Ico>;
const IconClose       = (p) => <Ico {...p}><path d="M6 6l12 12"/><path d="M18 6 6 18"/></Ico>;
const IconPause       = (p) => <Ico {...p}><rect x="7" y="5" width="3" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="3" height="14" rx="1" fill="currentColor" stroke="none"/></Ico>;
const IconSettings    = (p) => <Ico {...p}><circle cx="12" cy="12" r="3"/><path d="M19.5 12a7.5 7.5 0 0 0-.1-1.3l2-1.5-2-3.4-2.4.9a7.5 7.5 0 0 0-2.2-1.3L14.5 3h-4l-.3 2.4a7.5 7.5 0 0 0-2.2 1.3L5.6 5.8l-2 3.4 2 1.5A7.5 7.5 0 0 0 5.5 12a7.5 7.5 0 0 0 .1 1.3l-2 1.5 2 3.4 2.4-.9a7.5 7.5 0 0 0 2.2 1.3l.3 2.4h4l.3-2.4a7.5 7.5 0 0 0 2.2-1.3l2.4.9 2-3.4-2-1.5c.1-.4.1-.9.1-1.3Z"/></Ico>;
const IconPuzzle      = (p) => <Ico {...p}><path d="M9 4.5h6v3a1.5 1.5 0 0 0 3 0v0h2v6h-1.5a1.5 1.5 0 0 0 0 3H20v3h-5v-1.5a1.5 1.5 0 0 0-3 0v1.5H6v-5h.5a1.5 1.5 0 0 0 0-3H6v-7Z"/></Ico>;
const IconKey         = (p) => <Ico {...p}><circle cx="8" cy="14" r="3.5"/><path d="m10.5 11.5 9.5-9.5"/><path d="m16.5 5 2.5 2.5"/></Ico>;
const IconLock        = (p) => <Ico {...p}><rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></Ico>;
const IconAt          = (p) => <Ico {...p}><circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7"/></Ico>;
const IconSpeaker     = (p) => <Ico {...p}><path d="M4 9.5h3.5L12 5v14L7.5 14.5H4Z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M18.5 6.5a8 8 0 0 1 0 11"/></Ico>;
const IconArrowUp     = (p) => <Ico {...p}><path d="M12 19V5"/><path d="m6 11 6-6 6 6"/></Ico>;
const IconSparkle2    = (p) => <Ico {...p}><path d="M12 4 L13.5 10.5 L20 12 L13.5 13.5 L12 20 L10.5 13.5 L4 12 L10.5 10.5 Z"/></Ico>;
const IconCards       = (p) => <Ico {...p}><rect x="3.5" y="6" width="13" height="13" rx="2"/><path d="M7 3.5h11A1.5 1.5 0 0 1 19.5 5v11"/></Ico>;
const IconGlobe       = (p) => <Ico {...p}><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5a13 13 0 0 1 0 17"/><path d="M12 3.5a13 13 0 0 0 0 17"/></Ico>;

Object.assign(window, {
  IconArrowRight, IconArrowUpRight, IconPlay, IconCheck, IconMic, IconScreen,
  IconRubric, IconSparkle, IconShield, IconClock, IconList, IconBook, IconSlides,
  IconBrain, IconUpload, IconMonitor, IconChat, IconDot, IconArrowDown, IconStar,
  IconChevron, IconFolder, IconHistory, IconBookmark, IconTarget, IconSearch,
  IconMenu, IconClose, IconPause, IconSettings, IconPuzzle, IconKey, IconLock, IconAt,
  IconSpeaker, IconArrowUp, IconSparkle2, IconCards, IconGlobe,
});

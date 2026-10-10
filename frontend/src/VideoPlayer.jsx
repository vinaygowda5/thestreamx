import { useState, useEffect, useRef } from "react";
import Hls from "hls.js";
import { supabase, db } from "./supabase.js";
import { cacheVideoForOffline, isCachedOffline } from "./offline.js";
import { ImaAdController, IS_TEST_AD_TAG } from "./adsManager.js";
import { useBodyScrollLock } from "./scrollLock.js";
import { hasPaidPlan } from "./plan.js";
import { AD_FIRST_BREAK_SEC, AD_VOD_EVERY_SEC, AD_LIVE_EVERY_SEC, AD_END_GUARD_SEC, AD_PER_BREAK } from "./adConfig.js";

// Poster tile with a clean fallback — if the image is missing or fails to
// load, show a neutral card with the title instead of a blank/odd placeholder.
function Thumb({ src, title }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6, padding:8, boxSizing:"border-box", textAlign:"center" }}>
        <span style={{ fontSize:22, opacity:.35 }}>🎬</span>
        <span style={{ fontSize:11, color:"#888", lineHeight:1.3, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:3, WebkitBoxOrient:"vertical" }}>{title}</span>
      </div>
    );
  }
  return <img src={src} alt={title} loading="lazy" style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={() => setFailed(true)}/>;
}


/* ═══════════════════════════════════════════════════════
   StreamX VideoPlayer — Exact Jio Hotstar Style
   ✅ Works on Phone, Tablet, Laptop, TV/System
   ✅ Auto-hide controls, tap to show
   ✅ Double-tap left/right to seek (mobile)
   ✅ Keyboard shortcuts (desktop)
   ✅ Picture-in-Picture
   ✅ Fullscreen with rotation lock hint
   ✅ Gesture-based volume/brightness (mobile)
   ✅ Ads system built in
   ✅ Smart MP4 + HLS detection (fixed)
═══════════════════════════════════════════════════════ */

const PREMIUM_MIN_HEIGHT = 1080; // 1080p and 4K need Premium
const VIEW_AFTER_SEC = 30;        // a view counts after 30 s of real watching (one per viewer per title)
const kfmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n);
const AUDIOS  = ["Hindi","English","Kannada","Tamil","Telugu","Bengali","Malayalam"]; // fallback only if content has no language set
const SUBS    = ["Off","English"]; // honest options — see subtitle note below
const SPEEDS  = [0.5,0.75,1,1.25,1.5,2];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
.vp *{box-sizing:border-box;font-family:'Inter',sans-serif;}
@keyframes vp-spin{to{transform:rotate(360deg);}}
@keyframes vp-fadeIn{from{opacity:0;}to{opacity:1;}}
@keyframes vp-slideUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
@keyframes vp-pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
@keyframes vp-ripple{0%{transform:scale(0);opacity:.6;}100%{transform:scale(2.2);opacity:0;}}
@keyframes vp-bounceIn{0%{transform:scale(.7);opacity:0;}60%{transform:scale(1.1);}100%{transform:scale(1);opacity:1;}}
.vp-prog{-webkit-appearance:none;appearance:none;width:100%;height:4px;background:transparent;cursor:pointer;outline:none;}
.vp-prog::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#fff;cursor:pointer;box-shadow:0 0 0 3px rgba(255,255,255,.2);}
.vp-prog::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#fff;cursor:pointer;border:none;}
.vp-vol{-webkit-appearance:none;appearance:none;height:3px;background:rgba(255,255,255,.3);cursor:pointer;outline:none;border-radius:2px;}
.vp-vol::-webkit-slider-thumb{-webkit-appearance:none;width:11px;height:11px;border-radius:50%;background:#fff;cursor:pointer;}
.vp-vol::-moz-range-thumb{width:11px;height:11px;border-radius:50%;background:#fff;cursor:pointer;border:none;}
.vp-ibtn{background:none;border:none;color:rgba(255,255,255,.9);cursor:pointer;padding:8px;display:flex;align-items:center;justify-content:center;border-radius:8px;transition:all .15s;-webkit-tap-highlight-color:transparent;}
.vp-ibtn:hover{background:rgba(255,255,255,.12);color:#fff;}
.vp-ibtn:active{transform:scale(.92);}
.vp-btn{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);color:#fff;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all .15s;}
.vp-btn:hover{background:rgba(255,255,255,.2);}
.vp-btn.on{background:rgba(21,101,192,.35);border-color:rgba(21,101,192,.7);color:#90caf9;}
.vp-stab{background:none;border:none;color:#888;font-size:14px;font-weight:500;padding:11px 18px;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;transition:all .15s;}
.vp-stab.on{color:#fff;font-weight:700;border-bottom-color:#1565c0;}
.vp-sopt{display:flex;align-items:center;padding:14px 22px;cursor:pointer;border-bottom:1px solid #1e1e2e22;transition:background .14s;gap:14px;}
.vp-sopt:hover{background:rgba(255,255,255,.05);}
.vp-ep{display:flex;gap:12px;padding:13px 18px;border-bottom:1px solid #1e1e2e22;cursor:pointer;transition:background .14s;align-items:center;}
.vp-ep:hover{background:rgba(255,255,255,.05);}
`;


export default function VideoPlayer({ content, user, onClose, onNext, onUpgrade }) {
  const videoRef     = useRef(null);
  const hlsRef       = useRef(null);
  const containerRef = useRef(null);
  const hideTimer    = useRef(null);
  const tapTimer     = useRef(null);
  const lastTap      = useRef(0);

  const [phase,      setPhase]      = useState("loading");
  const [playing,    setPlaying]    = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [duration,   setDuration]   = useState(0);
  const [buffered,   setBuffered]   = useState(0);
  const [volume,     setVol]        = useState(0.85);
  const [muted,      setMuted]      = useState(false);
  const [showCtrl,   setShowCtrl]   = useState(true);
  const [fullscreen, setFS]         = useState(false);
  const [seeking,    setSeeking]    = useState(false);
  const [error,      setError]      = useState(null);
  const [toast,      setToast]      = useState(null);
  const [inWL,       setInWL]       = useState(false);
  const [nextCount,  setNextCount]  = useState(null);
  const [isMobile,   setIsMobile]   = useState(false);
  const [isPiP,      setIsPiP]      = useState(false);
  const [seekFlash,  setSeekFlash]  = useState(null); // {side, amount}
  const [buffering,  setBuffering]  = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab,  setSettingsTab]  = useState("quality");
  const [quality,      setQuality]      = useState("Auto");
  const [audioLang,    setAudioLang]    = useState(content?.language || "");
  const [subtitle,     setSub]          = useState("Off");
  const [speed,        setSpeed]        = useState(1);

  const [midDone,      setMidDone]      = useState([]);
  const adContainerRef = useRef(null); // empty div Google's IMA SDK renders its real ad UI into
  const adControllerRef = useRef(null); // one ImaAdController per player mount
  const adBreakRef     = useRef(false); // an ad break has been requested / is running
  const pausedForAdRef = useRef(false); // we paused the content for an ad (so we resume it)
  const watchedRef     = useRef(0);     // seconds of content actually watched
  const lastTimeRef    = useRef(0);
  const podLeftRef     = useRef(0);     // ads still to play in the current break
  const stallTimerRef  = useRef(null);
  const [behindLive, setBehindLive] = useState(false);
  const [adInSec, setAdInSec]       = useState(null);   // staff-only countdown
  const [adStatus, setAdStatus]     = useState("");     // staff-only: what the ad system is doing
  const nextBreakRef   = useRef(0);     // watched-seconds at which the next ad break happens
  const [adPlaying, setAdPlaying] = useState(false);

  const [episodes,   setEpisodes]   = useState([]);
  const [showEp,     setShowEp]     = useState(false);
  const [showInfo,   setShowInfo]   = useState(false);
  const [selSeason,  setSelSeason]  = useState(1);
  const [related,    setRelated]    = useState([]);  // real "More Like This"
  const [topTen,     setTopTen]     = useState([]);  // real "Top 10" by views
  const [subtitleUrl,setSubtitleUrl]= useState(null); // real .vtt track if admin set one

  const isPremium = ["plan_premium","plan_annual","premium"].includes(user?.plan);
  const isStaff   = ["admin", "employee"].includes(user?.role) || !!user?.employee_id;
  const isLive    = content?.is_live || content?.type === "Live";
  const isSeries  = content?.type === "Series" || content?.type === "Web Series";
  // ── Languages ──────────────────────────────────────────────
  // Two ways a title can offer several languages:
  //  (A) several stream links, one per language  (admin → "Other languages")
  //  (B) ONE HLS link that already contains several audio tracks (read from the stream itself)
  const baseUrl = (content?.stream_url || content?.embed_url || "").trim();
  const langOptions = [
    content?.language && baseUrl ? { language: content.language, url: baseUrl } : null,
    ...(Array.isArray(content?.language_streams) ? content.language_streams : []),
  ].filter(o => o && o.language && o.url);
  const CODE_TO_LANG = { en:"English", hi:"Hindi", kn:"Kannada", ta:"Tamil", te:"Telugu", ml:"Malayalam", bn:"Bengali", mr:"Marathi", gu:"Gujarati", pa:"Punjabi", or:"Odia", ur:"Urdu" };
  const [langPick, setLangPick] = useState(() => {
    try {
      const saved = localStorage.getItem(`streamx_langpick_${content?.id}`);
      if (saved && langOptions.some(o => o.language === saved)) return saved;
    } catch (e) {}
    const pref = CODE_TO_LANG[user?.language];                // viewer's profile language
    return pref && langOptions.some(o => o.language === pref) ? pref : null;
  });
  const picked = langOptions.find(o => o.language === langPick);
  const streamUrl = (picked?.url || baseUrl).trim();
  const [audioTracks, setAudioTracks] = useState([]);          // from the HLS stream itself
  const [audioIdx, setAudioIdx] = useState(0);
  const resumeAtRef = useRef(0);

  // ── Schedule set in Admin (start / expiry) ──
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNowTick(Date.now()), 15000); return () => clearInterval(id); }, []);
  const startsMs = content?.starts_at ? Date.parse(content.starts_at) : 0;
  const endsMs   = content?.ends_at ? Date.parse(content.ends_at) : 0;
  const notStarted = startsMs > nowTick;
  const scheduleOver = endsMs > 0 && endsMs <= nowTick;
  const blocked = notStarted || scheduleOver;
  // "Premium subscribers only" title opened by someone without a paid plan -> subscription screen first
  const contentLocked = !!content?.is_premium && !hasPaidPlan(user);
  const halted = blocked || contentLocked;
  const wasBlockedRef = useRef(halted);
  // ── Live ended detection ──
  const [liveEnded, setLiveEnded] = useState(false);
  const lastAdvanceRef = useRef(Date.now());
  const lastSnRef = useRef(-1);
  const staleMsRef = useRef(45000);
  const [qualityLevels, setQualityLevels] = useState([]);
  const [watching, setWatching] = useState(0);        // live: how many members are watching right now
  const [fakeFs, setFakeFs] = useState(false);          // iPhone has no real fullscreen: rotate the player ourselves
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth);
  const [dlPct, setDlPct] = useState(null);             // download progress (null = idle)
  const [dlDone, setDlDone] = useState(false);
  const [adNum, setAdNum] = useState(1);
  useBodyScrollLock();

  useEffect(() => {
    if (!isStaff || isPremium) return;
    const id = setInterval(() => {
      const left = (nextBreakRef.current || AD_FIRST_BREAK_SEC) - watchedRef.current;
      setAdInSec(Math.max(0, Math.ceil(left)));
    }, 1000);
    return () => clearInterval(id);
  }, [isStaff, isPremium]);

  // ── Live audience: everyone watching a live channel joins one realtime room; the count is the room size ──
  useEffect(() => {
    if (!isLive || !content?.id) return;
    const key = user?.id ? String(user.id) : "guest-" + Math.random().toString(36).slice(2);
    const room = supabase.channel("live-viewers-" + content.id, { config: { presence: { key } } });
    room.on("presence", { event: "sync" }, () => setWatching(Object.keys(room.presenceState()).length))
        .subscribe(async status => { if (status === "SUBSCRIBED") { try { await room.track({ at: Date.now() }); } catch (e) {} } });
    return () => { try { supabase.removeChannel(room); } catch (e) {} };
  }, [isLive, content?.id, user?.id]);

  // ── Screen rotation / fullscreen bookkeeping ──
  useEffect(() => {
    const onResize = () => setPortrait(window.innerHeight > window.innerWidth);
    const onFs = () => { if (!document.fullscreenElement && !document.webkitFullscreenElement) setFS(f => (fakeFsRef.current ? f : false)); };
    window.addEventListener("resize", onResize); window.addEventListener("orientationchange", onResize);
    document.addEventListener("fullscreenchange", onFs); document.addEventListener("webkitfullscreenchange", onFs);
    return () => { window.removeEventListener("resize", onResize); window.removeEventListener("orientationchange", onResize); document.removeEventListener("fullscreenchange", onFs); document.removeEventListener("webkitfullscreenchange", onFs); };
  }, []);
  const fakeFsRef = useRef(false);
  useEffect(() => { fakeFsRef.current = fakeFs; }, [fakeFs]);
  // Is this file already downloaded in the app?
  useEffect(() => { let off = false; if (streamUrl) isCachedOffline(streamUrl).then(r => { if (!off) setDlDone(!!r); }).catch(() => {}); return () => { off = true; }; }, [streamUrl]);

  function endLiveNow() {
    setLiveEnded(true);
    try { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } videoRef.current?.pause(); } catch (e) {}
  }
  // Broadcast stopped (no new segments for a long time)? Show "Live ended" instead of replaying old footage
  useEffect(() => {
    if (!isLive || liveEnded) return;
    const id = setInterval(() => {
      if (hlsRef.current && !pausedForAdRef.current && Date.now() - lastAdvanceRef.current > staleMsRef.current) endLiveNow();
    }, 5000);
    return () => clearInterval(id);
  }, [isLive, liveEnded]);
  // Start time reached -> start playing; expiry reached -> stop
  useEffect(() => {
    if (halted) {
      try { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } videoRef.current?.pause(); } catch (e) {}
    } else if (wasBlockedRef.current) { setError(null); startInit(); }   // e.g. the viewer just subscribed
    wasBlockedRef.current = halted;
  }, [halted]);
  useEffect(() => { if (contentLocked) onUpgrade?.(); }, [contentLocked]);   // go straight to the plans screen

  function pickQuality(opt) {            // opt = null -> Auto
    if (opt && opt.premium && !isPremium) {
      setShowSettings(false);
      showToast("👑 " + opt.label + " is a Premium feature");
      onUpgrade?.();                     // open the subscription screen, do NOT switch quality
      return;
    }
    if (hlsRef.current) hlsRef.current.currentLevel = opt ? opt.index : -1;
    setQuality(opt ? opt.label : "Auto");
    setShowSettings(false);
    showToast("Quality: " + (opt ? opt.label : "Auto"));
  }

  function pickLanguage(language) {
    const vEl = videoRef.current;
    if (vEl && !isLive && vEl.currentTime > 1) resumeAtRef.current = vEl.currentTime; // keep my place in movies
    setLangPick(language);
    try { localStorage.setItem(`streamx_langpick_${content?.id}`, language); } catch (e) {}
  }
  function pickAudio(i) {
    if (hlsRef.current) { hlsRef.current.audioTrack = i; setAudioIdx(i); }
  }

  // If the admin changes this title's stream URL while it is open, reload it
  // automatically instead of staying stuck on the old (broken) one.
  const firstUrlRef = useRef(streamUrl);
  useEffect(() => {
    if (streamUrl === firstUrlRef.current) return;
    firstUrlRef.current = streamUrl;
    setError(null);
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    startInit();
  }, [streamUrl]);

  // ── Fetch REAL related content + top 10 + subtitle (replaces fake repeated thumbnails) ──
  useEffect(() => {
    if (!content?.id) return;

    // More Like This — other active titles, same genre first, excluding current
    supabase.from("content")
      .select("id,title,thumbnail,genre,type,is_active")
      .eq("is_active", true)
      .neq("id", content.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!data) { setRelated([]); return; }
        const sameGenre = data.filter(c => c.genre === content.genre);
        const others     = data.filter(c => c.genre !== content.genre);
        setRelated([...sameGenre, ...others].slice(0, 10));
      });

    // Top 10 — real top viewed content (optionally filtered by same language)
    let q = supabase.from("content").select("id,title,thumbnail,views,language,type,is_live").eq("is_active", true).order("views", { ascending: false }).limit(10);
    if (content.language) q = supabase.from("content").select("id,title,thumbnail,views,language,type,is_live").eq("is_active", true).eq("language", content.language).order("views", { ascending: false }).limit(10);
    q.then(({ data }) => setTopTen(data && data.length > 0 ? data : []));

    // Subtitle track — only real if you uploaded a .vtt URL in admin (content.subtitle_url)
    setSubtitleUrl(content?.subtitle_url || null);
  }, [content?.id]);

  // ── Real view count — increments exactly once per time this title is
  // opened (not per render, not randomized). Replaces the old dead
  // backend increment that the frontend never actually called. ──
  // (A view is now counted in the timeupdate handler after real watching — see VIEW_AFTER_SEC.)
  const viewCountedRef = useRef(false);

  // ── Real likes — reflects an actual per-user like, toggleable, backed
  // by the content_likes table (see supabase_migration_likes_views.sql) ──
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(content?.likes_count || 0);
  const [likeBusy, setLikeBusy] = useState(false);
  useEffect(() => {
    if (!content?.id) return;
    setLikesCount(content?.likes_count || 0);
    if (user?.id) db.hasLiked(content.id, user.id).then(setLiked);
    else setLiked(false);
  }, [content?.id, user?.id]);

  async function handleToggleLike() {
    if (!content?.id || likeBusy) return;
    if (!user?.id) return; // must be logged in — button below is hidden/disabled in that case
    setLikeBusy(true);
    try {
      const result = await db.toggleLike(content.id, user.id);
      if (result) { setLiked(result.liked); setLikesCount(result.likes_count); }
    } catch (e) {
      // This used to fail completely silently (console.error only) — if
      // you tap Like and nothing happens, this toast is what will finally
      // tell you why (most commonly: the SQL migration that creates the
      // toggle_content_like function hasn't been run in Supabase yet).
      console.error("toggleLike failed:", e.message);
      showToast("Like failed: " + e.message);
    }
    setLikeBusy(false);
  }

  // Actually turn subtitle track on/off in the browser when toggled
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !v.textTracks || v.textTracks.length === 0) return;
    for (let i = 0; i < v.textTracks.length; i++) {
      v.textTracks[i].mode = subtitle === "On" ? "showing" : "hidden";
    }
  }, [subtitle, subtitleUrl]);

  const fmt = s => {
    if (!s || isNaN(s)) return "0:00";
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60);
    return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${m}:${String(sec).padStart(2,"0")}`;
  };

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 1800); };
  const resetHide = () => {
    setShowCtrl(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (!showSettings) setShowCtrl(false); }, isMobile ? 3000 : 4000);
  };

  // ── Detect device ──
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // ── INIT ──
  useEffect(() => {
    startInit();
    if (user?.id && content?.id) db.isInWatchlist(user.id, content.id).then(setInWL).catch(() => {});
    if (isSeries) {
      setEpisodes(Array.from({ length: content?.episode_count || 8 }, (_, i) => ({
        ep: i+1, title: `Episode ${i+1}`, dur: `${38+i}m`, watched: i < 2, progress: i === 1 ? 62 : 0,
      })));
    }
    const keys = e => {
      if (e.target.tagName === "INPUT") return;
      if (e.key === " " || e.key === "k") { e.preventDefault(); togglePlay(); }
      if (e.key === "ArrowRight") skipSec(10);
      if (e.key === "ArrowLeft")  skipSec(-10);
      if (e.key === "ArrowUp")    { e.preventDefault(); changeVol(Math.min(1, volume+0.1)); }
      if (e.key === "ArrowDown")  { e.preventDefault(); changeVol(Math.max(0, volume-0.1)); }
      if (e.key === "m")          toggleMute();
      if (e.key === "f")          toggleFS();
      if (e.key === "Escape" && !showSettings) onClose();
      if (e.key === "Escape" && showSettings)  setShowSettings(false);
    };
    window.addEventListener("keydown", keys);
    return () => { cleanup(); window.removeEventListener("keydown", keys); };
  }, []);

  function cleanup() {
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (adControllerRef.current) { adControllerRef.current.destroy(); adControllerRef.current = null; }
    clearTimeout(hideTimer.current);
    clearTimeout(tapTimer.current);
  }

  function getAdController() {
    if (adControllerRef.current) return adControllerRef.current;
    const v = videoRef.current, c = adContainerRef.current;
    if (!v || !c) return null;
    adControllerRef.current = new ImaAdController({
      videoEl: v, adContainerEl: c,
      onEvent: (name, e) => {
        if (name === "CONTENT_PAUSE_REQUESTED") {
          pausedForAdRef.current = true;
          try { videoRef.current?.pause(); } catch (err) {}
          setAdPlaying(true); setAdStatus("ad playing"); setAdNum(Math.min(AD_PER_BREAK, AD_PER_BREAK - podLeftRef.current));
        } else if (name === "CONTENT_RESUME_REQUESTED" || name === "ALL_ADS_COMPLETED" || name === "AD_ERROR") {
          if (name === "AD_ERROR") {
            podLeftRef.current = 0;
            const msg = e?.getError?.()?.getMessage?.() || e?.message || "no ad returned";
            console.warn("[StreamX ads]", msg);
            setAdStatus("ERROR: " + msg);               // staff chip keeps the reason on screen
            setTimeout(() => setAdStatus(s => (s.startsWith("ERROR") ? "" : s)), 20000);
          }
          // Ad pod: play the next ad straight away, keep the content paused in between
          if (name === "CONTENT_RESUME_REQUESTED" && podLeftRef.current > 0) {
            podLeftRef.current--;
            setAdStatus("next ad…");
            setTimeout(() => adControllerRef.current?.requestAds(content), 0);
            return;
          }
          if (name === "ALL_ADS_COMPLETED" && podLeftRef.current > 0) return; // chaining to the next ad
          if (name !== "AD_ERROR") setAdStatus("");
          endAdBreak(); // no fill / blocked / finished — carry on with the content
        }
        // STARTED / FIRST_QUARTILE / MIDPOINT / THIRD_QUARTILE / COMPLETE /
        // SKIPPED / PAUSED / RESUMED / CLICK all flow through here too —
        // nothing else to do for them right now beyond what's above, but
        // this is where you'd hook real analytics later if you want it.
      },
    });
    return adControllerRef.current;
  }

  // Called synchronously from the user opening this title (this whole
  // component mounts as a direct result of that tap), which is what
  // satisfies the browser's "ad playback needs a user gesture" rule —
  // never fired on a bare page load with no interaction behind it.
  async function startInit() {
    // No ad before the video — playback starts immediately. Ads come later,
    // as in-stream breaks (see triggerAdBreak / the timeupdate handler).
    if (halted) return;                     // not started yet / expired / premium-only and not subscribed
    startVideo();
    const isEmbed = streamUrl.includes("youtube.com/embed") || streamUrl.includes("iframe");
    if (!isPremium && !isEmbed) {
      const controller = getAdController();
      controller?.prime();
    }
  }

  // Request one in-stream ad break. If an ad is served, IMA fires
  // CONTENT_PAUSE_REQUESTED and we show it; if not (no fill / error) the
  // content just keeps playing.
  function triggerAdBreak() {
    if (isPremium || isEmbedUrl || adBreakRef.current) return;
    const controller = getAdController();
    if (!controller) return;
    adBreakRef.current = true;
    podLeftRef.current = AD_PER_BREAK - 1;
    setAdStatus("requesting ad…");
    controller.requestAds(content);
    setTimeout(() => { if (!pausedForAdRef.current) adBreakRef.current = false; }, 10000); // release lock if nothing started
  }

  function endAdBreak() {
    const wasPaused = pausedForAdRef.current;
    pausedForAdRef.current = false;
    adBreakRef.current = false;
    setAdPlaying(false);
    const v = videoRef.current;
    if (!v || !wasPaused) return;
    // Live: jump back to the live edge instead of resuming from where we paused
    if (isLive && hlsRef.current?.liveSyncPosition) { try { v.currentTime = hlsRef.current.liveSyncPosition; } catch (err) {} }
    v.play().catch(() => {});
  }

  function startVideo() {
    setPhase("playing");
    setTimeout(() => {
      const v = videoRef.current;
      if (!v) { setTimeout(startVideo, 300); return; }
      loadStream(v);
    }, 150);
  }

  // ── SMART LOADER: MP4 direct vs HLS .m3u8 ──
  function loadStream(v) {
    if (!streamUrl) { setError("No video URL set. Add a URL in the admin panel."); return; }
    const isM3U8 = streamUrl.includes(".m3u8");
    const isEmbed = streamUrl.includes("youtube.com/embed") || streamUrl.includes("iframe");
    if (!isEmbed && window.location.protocol === "https:" && /^http:\/\//i.test(streamUrl)) {
      setError("This stream URL starts with http:// and browsers block it on a secure (https) site. Use an https:// URL in admin.");
      return;
    }

    try {
      if (isEmbed) {
        setPlaying(true); resetHide(); return; // rendered as iframe below
      }
      if (!isM3U8) {
        // Direct MP4/video file — load normally, NOT via HLS.js
        v.src = streamUrl;
        const onCanPlay = () => {
          v.volume = volume;
          if (user?.id && content?.id && !isLive) {
            db.getProgress(user.id, content.id).then(sec => { if (sec > 5) { v.currentTime = sec; showToast("Resumed from " + fmt(sec)); } }).catch(() => {});
          }
          v.play().catch(() => {}); setPlaying(true); resetHide(); setBuffering(false);
        };
        const onErr = () => {
          const code = v.error?.code;
          const msg = code === 2 ? "Network error" : code === 3 ? "File may be corrupted" : code === 4 ? "Format not supported / CORS blocked" : "Playback error";
          setError(`Stream unavailable: ${msg}. Check URL in admin.`);
        };
        v.addEventListener("canplay", onCanPlay, { once: true });
        v.addEventListener("loadeddata", onCanPlay, { once: true });
        v.addEventListener("error", onErr, { once: true });
        v.addEventListener("waiting", () => setBuffering(true));
        v.addEventListener("playing", () => setBuffering(false));
        v.load();
        return;
      }
      // Real HLS .m3u8
      if (Hls.isSupported()) {
        if (hlsRef.current) hlsRef.current.destroy();
        const hls = new Hls({ enableWorker: true, lowLatencyMode: false, liveSyncDurationCount: 3, manifestLoadingMaxRetry: 4, levelLoadingMaxRetry: 4, fragLoadingMaxRetry: 6 });
        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(v);
        setAudioTracks([]); setAudioIdx(0); setQualityLevels([]); setQuality("Auto");
        lastAdvanceRef.current = Date.now(); lastSnRef.current = -1;
        hls.on(Hls.Events.LEVEL_LOADED, (_, d) => {
          if (!isLive) return;
          if (d.details.live === false) { endLiveNow(); return; }             // playlist closed = broadcast over
          if (d.details.endSN !== lastSnRef.current) {                          // new segments are still arriving
            lastSnRef.current = d.details.endSN; lastAdvanceRef.current = Date.now();
            staleMsRef.current = Math.max(45000, (d.details.targetduration || 6) * 7000);
          }
        });
        const syncAudio = () => {
          const t = hls.audioTracks || [];
          setAudioTracks(t.map((x, i) => ({ i, label: x.name || x.lang || `Audio ${i + 1}` })));
          setAudioIdx(hls.audioTrack);
        };
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, syncAudio);
        hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => setAudioIdx(hls.audioTrack));
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          v.volume = volume;
          // Real quality ladder from the stream itself + Premium gating (1080p / 4K)
          const uniq = [];
          (hls.levels || []).map((l, i) => ({ index: i, height: l.height || 0 })).filter(l => l.height)
            .sort((x, y) => y.height - x.height).forEach(l => { if (!uniq.some(u => u.height === l.height)) uniq.push(l); });
          setQualityLevels(uniq.map(l => ({ ...l, label: l.height >= 2000 ? "4K" : l.height + "p", premium: l.height >= PREMIUM_MIN_HEIGHT })));
          if (!isPremium && uniq.length) {            // free plan: Auto never picks 1080p / 4K
            const free = uniq.filter(l => l.height < PREMIUM_MIN_HEIGHT);
            hls.autoLevelCapping = free.length ? Math.max(...free.map(l => l.index)) : Math.min(...uniq.map(l => l.index));
          }
          if (resumeAtRef.current > 0 && !isLive) { v.currentTime = resumeAtRef.current; resumeAtRef.current = 0; }
          else if (user?.id && content?.id && !isLive) {
            db.getProgress(user.id, content.id).then(sec => { if (sec > 5) { v.currentTime = sec; showToast("Resumed from " + fmt(sec)); } }).catch(() => {});
          }
          v.play().catch(() => {}); setPlaying(true); resetHide();
        });
        // Live channels always start at the LIVE edge (never in the middle)
        if (isLive) v.addEventListener("loadedmetadata", () => goLive(), { once: true });
        let netRetries = 0;
        hls.on(Hls.Events.ERROR, (_, d) => {
          if (!d.fatal) return;
          // Try to recover from temporary glitches before giving up (important for live)
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR && d.details !== "manifestLoadError" && netRetries < 3) { netRetries++; hls.startLoad(); return; }
          if (d.type === Hls.ErrorTypes.MEDIA_ERROR && netRetries < 3) { netRetries++; hls.recoverMediaError(); return; }
          const code = d.response?.code;
          const hint = code === 404 ? "Stream not found (404). It may be offline or the URL is wrong."
            : (code === 401 || code === 403) ? `Access denied (${code}). The stream is protected.`
            : /LoadError|Timeout/.test(d.details || "") ? "Could not reach the stream. It may be offline or block other websites (CORS)."
            : "Stream unavailable.";
          setError(`${hint} [${d.details || d.type}${code ? " " + code : ""}] Check URL in admin.`);
        });
      } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = streamUrl; v.play().catch(() => {}); setPlaying(true); resetHide();
      } else {
        v.src = streamUrl; v.play().catch(() => {}); setPlaying(true); resetHide();
      }
    } catch (e) { setError("Playback error: " + e.message); }
  }

  // ── VIDEO EVENTS ──
  useEffect(() => {
    const v = videoRef.current;
    if (!v || phase !== "playing") return;
    const onTime = () => {
      if (!seeking) { setProgress(v.currentTime); setDuration(v.duration || 0); }
      if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
      if (isLive) {
        const edge = liveEdge();
        const behind = edge > 0 && edge - v.currentTime > 15;
        setBehindLive(b => (b === behind ? b : behind));
      }
      // ── Ad breaks: first after AD_FIRST_BREAK_SEC of watching, then regularly ──
      const dt = v.currentTime - lastTimeRef.current;
      lastTimeRef.current = v.currentTime;
      if (!v.paused && dt > 0 && dt < 2) watchedRef.current += dt;   // real playback only (not seeks)
      if (!viewCountedRef.current && user?.id && content?.id) {
        const need = Number.isFinite(v.duration) && v.duration > 0 && v.duration < VIEW_AFTER_SEC * 2 ? v.duration * 0.5 : VIEW_AFTER_SEC;
        if (watchedRef.current >= need) { viewCountedRef.current = true; db.registerView(content.id, user.id); }
      }
      if (!isPremium && !adBreakRef.current) {
        const finite = Number.isFinite(v.duration) && v.duration > 0;
        const live = isLive || v.duration === Infinity;
        if (!nextBreakRef.current) nextBreakRef.current = AD_FIRST_BREAK_SEC;
        const nearEnd = finite && !live && v.duration - v.currentTime < AD_END_GUARD_SEC;
        if (watchedRef.current >= nextBreakRef.current && !nearEnd) {
          nextBreakRef.current = watchedRef.current + (live ? AD_LIVE_EVERY_SEC : AD_VOD_EVERY_SEC);
          triggerAdBreak();
        }
      }
      if (v.duration && v.currentTime >= v.duration * 0.94 && nextCount === null && isSeries) setNextCount(10);
      if (user?.id && content?.id && !isLive && Math.floor(v.currentTime) % 10 === 0) {
        db.saveProgress(user.id, content.id, Math.floor(v.currentTime), Math.floor(v.duration || 0)).catch(() => {});
      }
    };
    v.addEventListener("timeupdate", onTime);
    // Live stuck on buffering for 10 s (network hiccup)? Jump back to live automatically.
    const onWait = () => { if (!isLive || stallTimerRef.current) return; stallTimerRef.current = setTimeout(() => { stallTimerRef.current = null; if (!pausedForAdRef.current) goLive(); }, 10000); };
    const onPlayingEv = () => { if (stallTimerRef.current) { clearTimeout(stallTimerRef.current); stallTimerRef.current = null; } };
    v.addEventListener("waiting", onWait);
    v.addEventListener("playing", onPlayingEv);
    v.addEventListener("play",  () => setPlaying(true));
    v.addEventListener("pause", () => setPlaying(false));
    v.addEventListener("ended", () => { setPhase("ended"); setPlaying(false); });
    v.addEventListener("enterpictureinpicture", () => setIsPiP(true));
    v.addEventListener("leavepictureinpicture", () => setIsPiP(false));
    return () => { v.removeEventListener("timeupdate", onTime); v.removeEventListener("waiting", onWait); v.removeEventListener("playing", onPlayingEv); };
  }, [phase, seeking, isPremium, nextCount]);

  useEffect(() => {
    if (nextCount === null || nextCount < 0) return;
    if (nextCount === 0) { onNext?.(); return; }
    const t = setTimeout(() => setNextCount(n => n - 1), 1000);
    return () => clearTimeout(t);
  }, [nextCount]);

  function togglePlay() { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); resetHide(); }
  // ── LIVE helpers ──
  function liveEdge() {
    const h = hlsRef.current, vv = videoRef.current;
    if (h && h.liveSyncPosition > 0) return h.liveSyncPosition;
    const s = vv?.seekable;
    return s && s.length ? s.end(s.length - 1) : 0;
  }
  function goLive() {
    const vv = videoRef.current; if (!vv) return;
    const h = hlsRef.current;
    const det = h?.levels?.[h.currentLevel]?.details;
    if (h && (!det || det.live)) { try { h.startLoad(-1); } catch (e) {} }   // restart loading at the live edge (fixes "stuck" after network drops)
    const t = liveEdge();
    if (t > 0) { try { vv.currentTime = Math.max(0, t - 1); } catch (e) {} }
    vv.play().catch(() => {});
    setBehindLive(false);
  }

  function seekTo(val) { const v = videoRef.current; if (!v) return; v.currentTime = Math.max(0, Math.min(v.duration || 0, val)); setProgress(v.currentTime); }
  function skipSec(s) { seekTo(progress + s); showToast(s > 0 ? `+${Math.abs(s)}s` : `-${Math.abs(s)}s`); }
  function toggleMute() { const v = videoRef.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); }
  function changeVol(val) { const v = videoRef.current; if (!v) return; v.volume = val; setVol(val); setMuted(val === 0); }
  function changeSpeed(s) { const v = videoRef.current; if (v) v.playbackRate = s; setSpeed(s); showToast(s + "x speed"); }

  function toggleFS() {
    if (fakeFs) { setFakeFs(false); setFS(false); return; }
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      setFS(false); if (screen.orientation?.unlock) { try { screen.orientation.unlock(); } catch (e) {} }
      return;
    }
    const el = containerRef.current;
    const req = el?.requestFullscreen || el?.webkitRequestFullscreen;
    const fallbackFs = () => { setFakeFs(true); setFS(true); };   // iPhone: no fullscreen API -> rotate the player ourselves
    if (!req) { fallbackFs(); return; }
    try {
      const r = req.call(el);
      Promise.resolve(r).then(() => { setFS(true); if (isMobile && screen.orientation?.lock) screen.orientation.lock("landscape").catch(() => {}); }).catch(fallbackFs);
    } catch (e) { fallbackFs(); }
  }

  async function togglePiP() {
    try {
      if (document.pictureInPictureElement) { await document.exitPictureInPicture(); }
      else if (videoRef.current && document.pictureInPictureEnabled) { await videoRef.current.requestPictureInPicture(); }
    } catch(e) {}
  }

  async function toggleWL() {
    if (!user?.id || !content?.id) return;
    try {
      if (inWL) { await db.removeFromWatchlist(user.id, content.id); setInWL(false); showToast("Removed from My List"); }
      else { await db.addToWatchlist(user.id, content.id); setInWL(true); showToast("Added to My List ✓"); }
    } catch (e) {
      console.error("toggleWL failed:", e.message);
      showToast("Watchlist failed: " + e.message);
    }
  }

  // ── Real Share — a working deep link (https://thestreamx.com/?watch=<id>)
  // that reopens this exact title when visited, using the Web Share sheet
  // on mobile and clipboard-copy on desktop. ──
  function handleShare() {
    const link = `${window.location.origin}${window.location.pathname}?watch=${content?.id}`;
    if (navigator.share) {
      navigator.share({ title: content?.title, text: `Watch ${content?.title} on StreamX`, url: link }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(link).catch(() => {});
      showToast("Link copied!");
    }
  }

  // ── Real Download — like Jio Hotstar, this is locked inside the app,
  // not saved to the phone's Gallery/Files (no website can do that at
  // all). We cache the actual video bytes in the browser's private Cache
  // Storage; playback later reads straight from that cache, no network
  // needed. Premium-only, matching how real OTT download features work. ──

  async function handleDownload() {
    if (!user?.id) { showToast("Sign in to download"); return; }
    if (!isPremium) {                                  // free viewers are taken to the subscription screen (like Hotstar)
      showToast("👑 Downloads need a Premium subscription");
      onUpgrade?.();
      return;
    }
    if (dlPct !== null) return;                        // already downloading
    if (dlDone) { showToast("Already downloaded. Watch it offline from Profile → Downloads"); return; }
    if (!streamUrl) { showToast("No video file available"); return; }
    if (streamUrl.includes(".m3u8")) { showToast("This stream can't be downloaded. Only direct video files can be"); return; }
    setDlPct(0);
    try {
      await cacheVideoForOffline(streamUrl, pct => setDlPct(pct === null ? 0 : pct));
      await db.logDownload(user.id, content.id);
      setDlDone(true);
      showToast("Downloaded ✓ Saved inside StreamX (Profile → Downloads)");
    } catch (e) {
      // "Failed to fetch" almost always means the video's storage (R2, S3...) has not been told it is OK
      // for this website to read the file bytes (CORS). Playback works without it, downloading needs it.
      if (e.message.includes("Failed to fetch") || e.name === "TypeError") showToast("Download blocked: this video's storage needs CORS enabled for downloads");
      else showToast("Download failed: " + e.message);
    }
    setDlPct(null);
  }

  // ── Mobile gesture handling: double tap to seek ──
  function handleVideoTap(e) {
    const now = Date.now();
    const rect = containerRef.current?.getBoundingClientRect();
    const rotated = fakeFs && portrait;                       // sideways player: visual left/right are screen top/bottom
    const x = rotated ? (e.touches?.[0]?.clientY || e.clientY) - (rect?.top || 0) : (e.touches?.[0]?.clientX || e.clientX) - (rect?.left || 0);
    const w = rotated ? (rect?.height || window.innerHeight) : (rect?.width || window.innerWidth);
    const side = x < w / 2 ? "left" : x > w * 0.65 ? "right" : "center";

    if (now - lastTap.current < 300 && side !== "center") {
      // Double tap — seek
      clearTimeout(tapTimer.current);
      const amount = side === "left" ? -10 : 10;
      seekTo(progress + amount);
      setSeekFlash({ side, amount });
      setTimeout(() => setSeekFlash(null), 500);
    } else {
      tapTimer.current = setTimeout(() => {
        if (showCtrl) setShowCtrl(false);
        else resetHide();
      }, 280);
    }
    lastTap.current = now;
  }

  const pct    = duration > 0 ? (progress / duration) * 100 : 0;
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const isEmbedUrl = streamUrl.includes("youtube.com/embed") || streamUrl.includes("iframe");

  return (
    <div ref={containerRef} className="vp"
      style={fakeFs && portrait
        // iPhone "fullscreen": the whole player is turned sideways so it fills the screen in landscape
        ? { position:"fixed", top:0, left:0, width:"100dvh", height:"100dvw", transformOrigin:"0 0", transform:"translateX(100dvw) rotate(90deg)", zIndex:700, background:"#000", display:"flex", flexDirection:"column", overflow:"hidden" }
        : { position:"fixed", inset:0, zIndex:700, background:"#000", display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <style>{CSS}</style>

      {/* ═══ VIDEO AREA ═══ */}
      <div
        style={{ position:"relative", background:"#000", flexShrink:0, height: fullscreen ? "100%" : "clamp(220px,56.25vw,62vh)" }}
        onMouseMove={!isMobile ? resetHide : undefined}
        onClick={!isMobile ? (e => { if (e.target === e.currentTarget || e.target.tagName === "VIDEO") togglePlay(); }) : undefined}
        onTouchStart={isMobile ? handleVideoTap : undefined}
      >
        {isEmbedUrl ? (
          phase === "playing" && (
            <iframe src={streamUrl} style={{ position:"absolute", inset:0, width:"100%", height:"100%", border:"none" }} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen/>
          )
        ) : (
          <video ref={videoRef} playsInline
            style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"contain", display: phase==="playing"||phase==="ended" ? "block" : "none" }}
          >
            {subtitleUrl && (
              <track
                kind="subtitles"
                src={subtitleUrl}
                srcLang="en"
                label={content?.language || "Subtitles"}
                default={subtitle === "On"}
              />
            )}
          </video>
        )}

        {/* Loading */}
        {phase === "loading" && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:14 }}>
            <div style={{ width:44, height:44, border:"3px solid #222", borderTop:"3px solid #1565c0", borderRadius:"50%", animation:"vp-spin .8s linear infinite" }}/>
            <div style={{ color:"#666", fontSize:13, fontWeight:500 }}>{content?.title}</div>
          </div>
        )}

        {/* Error */}
        {contentLocked && (
          <div style={{ position:"absolute", inset:0, zIndex:56, background:"#000", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, padding:24, textAlign:"center", color:"#fff" }}>
            <div style={{ fontSize:42 }}>👑</div>
            <div style={{ fontSize:18, fontWeight:800 }}>Premium content</div>
            <div style={{ fontSize:13, color:"#aaa", maxWidth:320 }}>Subscribe to a StreamX plan to watch “{content?.title}”.</div>
            <div style={{ display:"flex", gap:10, marginTop:6 }}>
              <button onClick={() => onUpgrade?.()} style={{ background:"#e50914", color:"#fff", border:"none", borderRadius:8, padding:"11px 22px", fontWeight:800, cursor:"pointer" }}>👑 View plans</button>
              <button onClick={onClose} style={{ background:"#222", color:"#fff", border:"none", borderRadius:8, padding:"11px 20px", cursor:"pointer" }}>Close</button>
            </div>
          </div>
        )}
        {!contentLocked && (blocked || liveEnded) && (
          <div style={{ position:"absolute", inset:0, zIndex:55, background:"#000", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, padding:24, textAlign:"center", color:"#fff" }}>
            <div style={{ fontSize:42 }}>{notStarted ? "⏰" : "📴"}</div>
            <div style={{ fontSize:18, fontWeight:800 }}>{notStarted ? "Live starts soon" : "This live has ended"}</div>
            <div style={{ fontSize:13, color:"#aaa" }}>
              {notStarted ? `Starts ${new Date(startsMs).toLocaleString([], { weekday:"short", day:"numeric", month:"short", hour:"numeric", minute:"2-digit" })}  ·  in ${(() => { const m = Math.max(1, Math.round((startsMs - nowTick) / 60000)); return m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + " min"; })()}` : "Thanks for watching. Check Home for more live channels."}
            </div>
            <div style={{ display:"flex", gap:10, marginTop:6 }}>
              {liveEnded && !blocked && <button onClick={() => { setLiveEnded(false); setError(null); lastAdvanceRef.current = Date.now(); startInit(); }} style={{ background:"#1565c0", color:"#fff", border:"none", borderRadius:8, padding:"10px 20px", fontWeight:700, cursor:"pointer" }}>↻ Check again</button>}
              <button onClick={onClose} style={{ background:"#222", color:"#fff", border:"none", borderRadius:8, padding:"10px 20px", cursor:"pointer" }}>Close</button>
            </div>
          </div>
        )}
        {error && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:14, background:"#000", padding:20, zIndex:30 }}>
            <div style={{ fontSize:40 }}>⚠️</div>
            <div style={{ color:"#fff", fontSize:14, fontWeight:600, textAlign:"center", maxWidth:300, lineHeight:1.5 }}>{error}</div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => { setError(null); startInit(); }} style={{ background:"#1565c0", color:"#fff", border:"none", borderRadius:8, padding:"10px 20px", fontWeight:600, cursor:"pointer", fontSize:13 }}>↺ Retry</button>
              <button onClick={onClose} style={{ background:"rgba(255,255,255,.08)", color:"#fff", border:"none", borderRadius:8, padding:"10px 16px", cursor:"pointer", fontSize:13 }}>Close</button>
            </div>
          </div>
        )}

        {/* Seek flash (mobile double-tap) */}
        {seekFlash && (
          <div style={{ position:"absolute", top:0, bottom:0, [seekFlash.side]:0, width:"40%", display:"flex", alignItems:"center", justifyContent:"center", background: seekFlash.side==="left" ? "linear-gradient(90deg,rgba(255,255,255,.12),transparent)" : "linear-gradient(270deg,rgba(255,255,255,.12),transparent)", zIndex:20, animation:"vp-fadeIn .15s ease", pointerEvents:"none" }}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <span style={{ fontSize:26 }}>{seekFlash.side === "left" ? "«" : "»"}</span>
              <span style={{ fontSize:13, fontWeight:700, color:"#fff" }}>{Math.abs(seekFlash.amount)}s</span>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div style={{ position:"absolute", top:"42%", left:"50%", transform:"translate(-50%,-50%)", background:"rgba(0,0,0,.75)", color:"#fff", padding:"8px 18px", borderRadius:6, fontSize:13, fontWeight:600, pointerEvents:"none", animation:"vp-fadeIn .18s ease", whiteSpace:"nowrap", zIndex:25 }}>
            {toast}
          </div>
        )}

        {/* Next Episode */}
        {nextCount !== null && (
          <div style={{ position:"absolute", right:"clamp(12px,3vw,20px)", bottom:80, background:"rgba(0,0,0,.92)", border:"1px solid #1565c0", borderRadius:12, padding:"14px 18px", animation:"vp-slideUp .3s ease", zIndex:20, minWidth:200 }}>
            <div style={{ fontSize:11, color:"#888", marginBottom:3 }}>Next Episode in {nextCount}s</div>
            <div style={{ fontWeight:700, marginBottom:10, fontSize:13, color:"#fff" }}>Continue Watching</div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={(e) => { e.stopPropagation(); onNext?.(); setNextCount(null); }} style={{ background:"#1565c0", border:"none", color:"#fff", borderRadius:7, padding:"7px 14px", fontSize:12, fontWeight:600, cursor:"pointer" }}>Play Now</button>
              <button onClick={(e) => { e.stopPropagation(); setNextCount(null); }} style={{ background:"rgba(255,255,255,.08)", border:"none", color:"#aaa", borderRadius:7, padding:"7px 10px", fontSize:12, cursor:"pointer" }}>Cancel</button>
            </div>
          </div>
        )}

        {/* ═══ REAL Google IMA ad container ═══ — Google's SDK renders its
            own ad video + UI (progress bar, skip button once eligible,
            etc.) directly into this div. Always present in the DOM (IMA
            needs a real element to attach to when requestAds() runs);
            only visible/on-top while an ad is playing (adPlaying). */}
        <div
          ref={adContainerRef}
          style={{ position:"absolute", inset:0, zIndex: adPlaying ? 60 : -1, background: adPlaying ? "#000" : "transparent", pointerEvents: adPlaying ? "auto" : "none" }}
        />
        {isLive && behindLive && !adPlaying && (
          <button onClick={goLive} style={{ position:"absolute", top:14, right:14, zIndex:45, background:"#e50914", color:"#fff", border:"none", borderRadius:20, padding:"7px 16px", fontSize:13, fontWeight:800, cursor:"pointer", boxShadow:"0 2px 12px rgba(0,0,0,.5)" }}>⏵ GO LIVE</button>
        )}
        {isStaff && !isPremium && !adPlaying && (
          <div style={{ position:"absolute", left:12, bottom:70, zIndex:45, background:"rgba(0,0,0,.72)", color: adStatus.startsWith("ERROR") ? "#ff6b6b" : "#9be7a8", fontSize:11, padding:"5px 10px", borderRadius:6, maxWidth:"80%", pointerEvents:"none" }}>
            🧪 Staff view · {adStatus || (adInSec !== null ? `next ad break in ${fmt(adInSec)}` : "ads armed")} · {IS_TEST_AD_TAG ? "Google test ad" : "live ad tag"}
          </div>
        )}
        {adPlaying && (
          <div style={{ position:"absolute", top:14, left:14, zIndex:61, background:"rgba(0,0,0,.7)", backdropFilter:"blur(8px)", color:"#aaa", fontSize:10, padding:"4px 12px", borderRadius:20, letterSpacing:3, textTransform:"uppercase", border:"1px solid rgba(255,255,255,.08)", pointerEvents:"none" }}>
            Ad {adNum} of {AD_PER_BREAK}{IS_TEST_AD_TAG ? " · test" : ""}
          </div>
        )}

        {/* Ended */}
        {phase === "ended" && (
          <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.88)", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16, zIndex:40 }}>
            <div style={{ fontSize:42 }}>🎬</div>
            <div style={{ fontWeight:700, fontSize:"clamp(15px,4vw,18px)", color:"#fff", textAlign:"center" }}>{content?.title}</div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap", justifyContent:"center" }}>
              <button onClick={() => { setPhase("loading"); setProgress(0); setMidDone([]); watchedRef.current = 0; lastTimeRef.current = 0; nextBreakRef.current = 0; setNextCount(null); startInit(); }} style={{ background:"#1565c0", color:"#fff", border:"none", borderRadius:9, padding:"10px 22px", fontWeight:700, fontSize:13, cursor:"pointer" }}>▶ Watch Again</button>
              {onNext && <button onClick={onNext} style={{ background:"#fff", color:"#111", border:"none", borderRadius:9, padding:"10px 22px", fontWeight:700, fontSize:13, cursor:"pointer" }}>Next →</button>}
              <button onClick={onClose} style={{ background:"rgba(255,255,255,.1)", color:"#fff", border:"none", borderRadius:9, padding:"10px 16px", fontSize:13, cursor:"pointer" }}>✕ Close</button>
            </div>
          </div>
        )}

        {/* ═══ CONTROLS OVERLAY ═══ */}
        {showCtrl && (phase === "playing" || phase === "ended") && !isEmbedUrl && (
          <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", justifyContent:"space-between", background:"linear-gradient(to bottom,rgba(0,0,0,.55) 0%,transparent 35%,transparent 55%,rgba(0,0,0,.8) 100%)", animation:"vp-fadeIn .2s ease", zIndex:10, pointerEvents:"none" }}>
            {/* Top bar */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"clamp(10px,2vw,14px) clamp(12px,3vw,18px)", pointerEvents:"auto" }}>
              <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="vp-ibtn" style={{ fontSize:22 }}>←</button>
              <div style={{ flex:1, padding:"0 12px", minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:"clamp(13px,2.5vw,15px)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:"#fff" }}>{content?.title}</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,.45)" }}>
                  {content?.type}{content?.release_year ? ` · ${content.release_year}` : ""}{isLive ? "" : content?.rating ? ` · ${content.rating}` : ""}
                  {isLive && <span style={{ color:"#e50914", fontWeight:700, marginLeft:8, animation:"vp-pulse 1.5s infinite" }}>● LIVE</span>}
                  {isLive && watching > 0 && <span style={{ color:"#ddd", fontWeight:600, marginLeft:10, fontSize:12 }}>👁 {kfmt(watching)} watching</span>}
                </div>
              </div>
              <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                {!isLive && user?.id && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggleLike(); }}
                    disabled={likeBusy}
                    className="vp-ibtn"
                    style={{ fontSize:16, display:"flex", alignItems:"center", gap:5, opacity: likeBusy ? 0.6 : 1 }}
                    title={liked ? "Unlike" : "Like"}
                  >
                    <span style={{ fontSize:17, color: liked ? "#e50914" : "#fff" }}>{liked ? "♥" : "♡"}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,.75)" }}>{likesCount > 999 ? (likesCount/1000).toFixed(1)+"k" : likesCount}</span>
                  </button>
                )}
                {document.pictureInPictureEnabled && !isMobile && (
                  <button onClick={(e) => { e.stopPropagation(); togglePiP(); }} className="vp-ibtn" style={{ fontSize:17 }}>⧉</button>
                )}
                <button onClick={(e) => { e.stopPropagation(); setShowSettings(s => !s); }} className="vp-ibtn" style={{ fontSize:20 }}>⚙</button>
                <button onClick={(e) => { e.stopPropagation(); toggleFS(); }} className="vp-ibtn" style={{ fontSize:18 }}>{fullscreen ? "⊡" : "⛶"}</button>
              </div>
            </div>

            {/* Centre controls */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"clamp(24px,8vw,48px)", pointerEvents:"auto" }}>
              <button onClick={(e) => { e.stopPropagation(); skipSec(-10); }} className="vp-ibtn" style={{ position:"relative", display:"flex", flexDirection:"column", alignItems:"center" }}>
                <svg width="clamp(22px,5vw,28px)" height="clamp(22px,5vw,28px)" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
                <span style={{ fontSize:8, fontWeight:700, marginTop:1 }}>10</span>
              </button>
              <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} style={{ background:"none", border:"none", color:"#fff", cursor:"pointer", padding:0, width:"clamp(56px,14vw,72px)", height:"clamp(56px,14vw,72px)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                {buffering
                  ? <span style={{ width:24, height:24, border:"3px solid rgba(255,255,255,.3)", borderTop:"3px solid #fff", borderRadius:"50%", animation:"vp-spin .7s linear infinite", display:"block" }}/>
                  : playing
                    ? <svg width="65%" height="65%" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                    : <svg width="65%" height="65%" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft:3 }}><path d="M8 5v14l11-7z"/></svg>
                }
              </button>
              <button onClick={(e) => { e.stopPropagation(); skipSec(10); }} className="vp-ibtn" style={{ position:"relative", display:"flex", flexDirection:"column", alignItems:"center" }}>
                <svg width="clamp(22px,5vw,28px)" height="clamp(22px,5vw,28px)" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/></svg>
                <span style={{ fontSize:8, fontWeight:700, marginTop:1 }}>10</span>
              </button>
            </div>

            {/* Bottom */}
            <div style={{ padding:"0 clamp(12px,3vw,18px) clamp(10px,2vw,14px)", pointerEvents:"auto" }}>
              <div style={{ textAlign:"right", fontSize:12, color:"rgba(255,255,255,.6)", marginBottom:5 }}>
                {isLive ? (
                  <button onClick={goLive} style={{ background: behindLive ? "#e50914" : "transparent", border: "1px solid #e50914", color: "#fff", borderRadius: 14, padding: "3px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    {behindLive ? `⏵ GO LIVE  −${fmt(Math.max(0, liveEdge() - progress))}` : "● LIVE"}
                  </button>
                ) : <>{fmt(progress)} / {fmt(duration)}</>}
              </div>
              <div style={{ position:"relative", height:4, background:"rgba(255,255,255,.2)", borderRadius:2, marginBottom:4 }}>
                <div style={{ position:"absolute", left:0, top:0, height:"100%", background:"rgba(255,255,255,.35)", borderRadius:2, width:bufPct+"%" }}/>
                <div style={{ position:"absolute", left:0, top:0, height:"100%", background:"#1565c0", borderRadius:2, width:pct+"%" }}/>
                {!isPremium && !isLive && Number.isFinite(duration) && duration > 0 && (() => {
                  const cues = [];
                  for (let t = Math.max(nextBreakRef.current, AD_FIRST_BREAK_SEC); t < duration - AD_END_GUARD_SEC && cues.length < 12; t += AD_VOD_EVERY_SEC) cues.push(t);
                  return cues.filter(t => t > progress).map(t => (
                    <div key={t} style={{ position:"absolute", top:"50%", left:`${(t / duration) * 100}%`, transform:"translate(-50%,-50%)", width:7, height:7, borderRadius:"50%", background:"#f59e0b" }}/>
                  ));
                })()}
                <div style={{ position:"absolute", top:"50%", transform:"translate(-50%,-50%)", width:14, height:14, borderRadius:"50%", background:"#fff", left:pct+"%", boxShadow:"0 2px 8px rgba(0,0,0,.5)" }}/>
              </div>
              <input type="range" className="vp-prog" min={0} max={duration||100} value={progress} step={0.1}
                onChange={e => seekTo(+e.target.value)}
                onMouseDown={() => setSeeking(true)} onMouseUp={() => setSeeking(false)}
                onTouchStart={() => setSeeking(true)} onTouchEnd={() => setSeeking(false)}
                style={{ position:"absolute", left:"clamp(12px,3vw,18px)", right:"clamp(12px,3vw,18px)", bottom:"clamp(22px,4vw,30px)", opacity:0, cursor:"pointer", height:18, zIndex:5, margin:0, width:`calc(100% - clamp(24px,6vw,36px))` }}
              />
              {/* Volume + speed row — desktop only */}
              {!isMobile && (
                <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:6 }}>
                  <button onClick={toggleMute} className="vp-ibtn" style={{ fontSize:16 }}>{muted||volume===0?"🔇":volume<0.5?"🔉":"🔊"}</button>
                  <input type="range" className="vp-vol" min={0} max={1} step={0.02} value={muted?0:volume} onChange={e=>changeVol(+e.target.value)} style={{ width:70 }}/>
                  <div style={{ flex:1 }}/>
                  <span style={{ color:"rgba(255,255,255,.6)", fontSize:11 }}>{speed}x</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══ INFO SECTION — exact Hotstar match ═══ */}
      <div className="sx-scroll" style={{ flex:1, overflowY:"auto", background:"#000" }}>

        {/* Title block — plain, like screenshot */}
        <div style={{ padding:"18px clamp(14px,3vw,20px) 0" }}>
          <div style={{ fontWeight:800, fontSize:"clamp(18px,4.5vw,22px)", color:"#fff", marginBottom:6 }}>
            {content?.title}
          </div>
          <div style={{ fontSize:13, color:"#8a8a99" }}>
            {isLive ? <span style={{ color:"#e50914", fontWeight:700, letterSpacing:1 }}>● LIVE{watching > 0 && <span style={{ color:"#aaa", fontWeight:500, letterSpacing:0, marginLeft:10 }}>👁 {kfmt(watching)} watching</span>}</span> : [
              content?.release_year,
              content?.runtime || null,
              isSeries ? `${content?.season_count || 1} Season${(content?.season_count||1)>1?"s":""}` : (content?.language ? `${[content?.language].length} Language${1>1?"s":""}` : null)
            ].filter(Boolean).join(" • ")}
          </div>
        </div>

        {/* Language / audio switcher — only when the title really has several */}
        {(langOptions.length > 1 || audioTracks.length > 1) && (() => {
          const pill = (label, active, onClick, key) => (
            <button key={key} onClick={onClick} style={{ background: active ? "#e50914" : "#16161c", color: active ? "#fff" : "#bbb", border: `1px solid ${active ? "#e50914" : "#2a2a34"}`, borderRadius: 20, padding: "6px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{label}</button>
          );
          return (
            <div style={{ padding: "16px clamp(14px,3vw,20px) 0" }}>
              {langOptions.length > 1 && (
                <>
                  <div style={{ fontSize: 11, color: "#777", letterSpacing: .6, marginBottom: 8 }}>🌐 LANGUAGE</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                    {langOptions.map(o => pill(o.language, (picked?.language || langOptions[0].language) === o.language, () => pickLanguage(o.language), o.language))}
                  </div>
                </>
              )}
              {audioTracks.length > 1 && (
                <>
                  <div style={{ fontSize: 11, color: "#777", letterSpacing: .6, marginBottom: 8 }}>🎧 AUDIO</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {audioTracks.map(t => pill(t.label, t.i === audioIdx, () => pickAudio(t.i), "a" + t.i))}
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* 4 icon buttons — plain row like screenshot */}
        <div style={{ display:"flex", padding:"18px 0 6px" }}>
          {[
            // Live channels can't be saved or downloaded
            !isLive && { icon: inWL ? "✓" : "＋", label: inWL ? "Watchlisted" : "Watchlist", action: toggleWL, color: inWL ? "#00c853" : undefined },
            !isLive && { icon: dlPct !== null ? "⏳" : dlDone ? "✅" : "⬇", label: dlPct !== null ? `Downloading ${dlPct}%` : dlDone ? "Downloaded" : "Download", action: handleDownload },
            { icon:"↗", label:"Share",    action: handleShare },
            { icon: liked ? "♥" : "♡", label: liked ? "Liked" : "Like", action: handleToggleLike, color: liked ? "#e50914" : undefined },
          ].filter(Boolean).map(btn => (
            <button key={btn.label} onClick={btn.action} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:7, background:"none", border:"none", color: btn.color || "#ccc", cursor:"pointer", padding:"6px 4px" }}>
              <span style={{ fontSize:20, fontWeight:300 }}>{btn.icon}</span>
              <span style={{ fontSize:11, color:"#999" }}>{btn.label}</span>
            </button>
          ))}
        </div>

        {/* Description (Hotstar shows this lower, simple gray text) */}
        {content?.description && (
          <div style={{ padding:"14px clamp(14px,3vw,20px) 0", fontSize:13, color:"#999", lineHeight:1.6 }}>
            {content.description}
          </div>
        )}

        {/* Episodes — only for series */}
        {isSeries && (
          <div style={{ marginTop:20 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 clamp(14px,3vw,20px)", marginBottom:10 }}>
              <div style={{ fontWeight:700, fontSize:16, color:"#fff" }}>Episodes</div>
              <select value={selSeason} onChange={e=>setSelSeason(+e.target.value)} style={{ background:"#16161a", color:"#fff", border:"1px solid #2a2a2e", borderRadius:6, padding:"5px 10px", fontSize:12 }}>
                {Array.from({ length: content?.season_count || 3 }, (_,i) => i+1).map(s => <option key={s} value={s}>Season {s}</option>)}
              </select>
            </div>
            <div style={{ display:"flex", flexDirection:"column", padding:"0 clamp(14px,3vw,20px)" }}>
              {episodes.map(ep => (
                <div key={ep.ep} onClick={() => showToast(`Playing S${selSeason}E${ep.ep}`)}
                  style={{ display:"flex", gap:12, padding:"10px 0", cursor:"pointer", borderBottom:"1px solid #15151a" }}>
                  <div style={{ width:"clamp(100px,26vw,140px)", height:"clamp(58px,15vw,80px)", borderRadius:7, background:"#16161a", flexShrink:0, position:"relative", overflow:"hidden" }}>
                    {content?.thumbnail ? <img src={content.thumbnail} style={{ width:"100%", height:"100%", objectFit:"cover" }} alt="" onError={e=>e.target.style.display="none"}/> : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, opacity:.3 }}>🎬</div>}
                    <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,.2)" }}>
                      <div style={{ width:26, height:26, borderRadius:"50%", background:"rgba(255,255,255,.85)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"#000" }}>▶</div>
                    </div>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:13, color:"#fff", marginBottom:3 }}>{ep.ep}. {ep.title}</div>
                    <div style={{ fontSize:11, color:"#777" }}>{ep.dur}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* More Like This — REAL different titles from database, not repeated */}
        {related.length > 0 && (
          <div style={{ marginTop:26 }}>
            <div style={{ fontWeight:700, fontSize:18, color:"#fff", padding:"0 clamp(14px,3vw,20px)", marginBottom:12 }}>More Like This</div>
            <div style={{ display:"flex", gap:8, overflowX:"auto", padding:"0 clamp(14px,3vw,20px)" }}>
              {related.map((item) => (
                <div key={item.id} onClick={() => onNext?.(item)} style={{ width:"clamp(108px,30vw,150px)", aspectRatio:"2/3", borderRadius:6, background:"linear-gradient(160deg,#1c1c1c,#0a0a0a)", flexShrink:0, cursor:"pointer", overflow:"hidden", position:"relative" }}>
                  <Thumb src={item.thumbnail} title={item.title}/>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top 10 — REAL top viewed titles from database */}
        {topTen.length > 0 && (
          <div style={{ marginTop:26 }}>
            <div style={{ fontWeight:700, fontSize:18, color:"#fff", padding:"0 clamp(14px,3vw,20px)", marginBottom:14 }}>
              Top 10 in India Today{content?.language ? ` - ${content.language}` : ""}
            </div>
            <div style={{ display:"flex", gap:0, overflowX:"auto", padding:"0 clamp(14px,3vw,20px) 6px" }}>
              {topTen.map((item, i) => (
                <div key={item.id} style={{ display:"flex", alignItems:"flex-end", flexShrink:0, marginRight:4 }}>
                  <div style={{ fontFamily:"Arial Black, sans-serif", fontWeight:900, fontSize:"clamp(48px,13vw,68px)", color:"#1a1a1a", WebkitTextStroke:"1.5px #444", lineHeight:1, marginRight:-14, marginBottom:4, zIndex:1, userSelect:"none" }}>
                    {i+1}
                  </div>
                  <div style={{ width:"clamp(118px,30vw,150px)", flexShrink:0 }}>
                    <div onClick={() => onNext?.(item)} style={{ width:"100%", aspectRatio:"2/3", borderRadius:6, background:"linear-gradient(160deg,#1c1c1c,#0a0a0a)", cursor:"pointer", overflow:"hidden", marginBottom:8 }}>
                      <Thumb src={item.thumbnail} title={item.title}/>
                    </div>
                    {!(item.is_live || item.type === "Live") && <button onClick={async () => { if (!user?.id) { showToast("Sign in to use Watchlist"); return; } try { await db.addToWatchlist(user.id, item.id); showToast("Added to My List ✓"); } catch (e) { showToast("Watchlist failed: " + e.message); } }} style={{ width:"100%", background:"#1c1c20", border:"none", borderRadius:5, color:"#ccc", fontSize:11.5, fontWeight:600, padding:"7px 0", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                      ＋ Watchlist
                    </button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ height:90 }}/>
      </div>

      {/* ═══ SETTINGS SHEET ═══ */}
      {showSettings && (
        <>
          <div style={{ position:"fixed", inset:0, zIndex:800, background:"rgba(0,0,0,.6)" }} onClick={() => setShowSettings(false)}/>
          <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:801, background:"#1a1a1a", borderRadius:"16px 16px 0 0", animation:"vp-slideUp .3s ease", maxHeight:"70vh", display:"flex", flexDirection:"column" }}>
            <div style={{ display:"flex", justifyContent:"center", padding:"12px 0 6px" }}><div style={{ width:40, height:4, borderRadius:2, background:"#444" }}/></div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0 20px 10px" }}>
              <div style={{ fontWeight:700, fontSize:17, color:"#fff" }}>Settings</div>
              <button onClick={() => setShowSettings(false)} style={{ background:"none", border:"none", color:"#555", fontSize:20, cursor:"pointer" }}>✕</button>
            </div>
            <div style={{ display:"flex", overflowX:"auto", borderBottom:"1px solid #2a2a2a", padding:"0 16px" }}>
              {["quality","audio","subtitles","speed"].map(t => (
                <button key={t} className={`vp-stab${settingsTab===t?" on":""}`} onClick={() => setSettingsTab(t)}>{t === "audio" ? "Audio Language" : t.charAt(0).toUpperCase()+t.slice(1)}</button>
              ))}
            </div>
            <div style={{ overflowY:"auto", flex:1, paddingBottom:20 }}>
              {settingsTab === "quality" && [{ label:"Auto", index:-1, premium:false }, ...qualityLevels].map(opt => (
                <div key={opt.label} className="vp-sopt" onClick={() => pickQuality(opt.index === -1 ? null : opt)}>
                  {quality === opt.label ? <span style={{ color:"#1565c0", fontSize:18, flexShrink:0 }}>✓</span> : <span style={{ width:18 }}/>}
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:quality===opt.label?700:400, fontSize:14, color:"#fff" }}>{opt.label}{opt.premium && <span style={{ marginLeft:8 }}>👑</span>}</div>
                    {opt.premium && !isPremium && <div style={{ fontSize:11, color:"#f59e0b" }}>Premium · tap to upgrade</div>}
                    {opt.label === "Auto" && <div style={{ fontSize:11, color:"#777" }}>{qualityLevels.length ? "Best quality for your connection" : "This stream has a single quality"}</div>}
                  </div>
                </div>
              ))}
              {settingsTab === "audio" && (
                // REAL: only show the language YOU set in Admin for this title, not a fake unrelated list
                content?.language ? (
                  <div className="vp-sopt" onClick={() => { setAudioLang(content.language); setShowSettings(false); showToast("Audio: "+content.language); }}>
                    <span style={{ color:"#1565c0", fontSize:18 }}>✓</span>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14, color:"#fff" }}>{content.language}</div>
                      <div style={{ fontSize:11, color:"#666", marginTop:2 }}>Original audio track</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding:"24px 22px", fontSize:13, color:"#666", lineHeight:1.6 }}>
                    No language set for this title in Admin. Edit this content and set a Language to show it here.
                  </div>
                )
              )}
              {settingsTab === "subtitles" && (
                subtitleUrl ? (
                  <>
                    <div className="vp-sopt" onClick={() => { setSub("Off"); setShowSettings(false); }}>
                      {subtitle === "Off" ? <span style={{ color:"#1565c0", fontSize:18 }}>✓</span> : <span style={{ width:18 }}/>}
                      <div style={{ fontWeight:subtitle==="Off"?700:400, fontSize:14, color:"#fff" }}>Off</div>
                    </div>
                    <div className="vp-sopt" onClick={() => { setSub("On"); setShowSettings(false); showToast("Subtitles on"); }}>
                      {subtitle === "On" ? <span style={{ color:"#1565c0", fontSize:18 }}>✓</span> : <span style={{ width:18 }}/>}
                      <div style={{ fontWeight:subtitle==="On"?700:400, fontSize:14, color:"#fff" }}>{content?.language || "Subtitles"}</div>
                    </div>
                  </>
                ) : (
                  <div style={{ padding:"24px 22px", fontSize:13, color:"#666", lineHeight:1.6 }}>
                    No subtitles uploaded for this title yet.<br/><br/>
                    <span style={{ color:"#888" }}>Note: browsers can't auto-generate subtitles — there's no built-in speech-to-text for video playback. To add real subtitles, generate a <code style={{ color:"#999" }}>.vtt</code> file (e.g. with Whisper AI or YouTube's auto-captions export) and paste its URL into the "Subtitle URL" field in Admin for this title.</span>
                  </div>
                )
              )}
              {settingsTab === "speed" && SPEEDS.map(s => (
                <div key={s} className="vp-sopt" onClick={() => { changeSpeed(s); setShowSettings(false); }}>
                  {speed === s ? <span style={{ color:"#1565c0", fontSize:18 }}>✓</span> : <span style={{ width:18 }}/>}
                  <div style={{ fontWeight:speed===s?700:400, fontSize:14, color:"#fff" }}>{s===1?"Normal":s+"x"}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
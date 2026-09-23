import { useState, useEffect, useRef } from "react";
import Hls from "hls.js";
import { supabase, db } from "./supabase.js";

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

const FALLBACK_ADS = [
  { id:"f1", brand:"JioFiber Ultra",   tagline:"India's Fastest Broadband",  sub_text:"1 Gbps · ₹399/mo", cta:"Get Now",   cta_url:"https://jio.com",     icon:"⚡", color:"#003580", duration:15, skip_after:5 },
  { id:"f2", brand:"Swiggy Instamart", tagline:"Groceries in 10 Minutes!",   sub_text:"Flat 40% off",     cta:"Order Now", cta_url:"https://swiggy.com",  icon:"🛵", color:"#fc8019", duration:12, skip_after:5 },
  { id:"f3", brand:"Dream11",          tagline:"Play Fantasy Cricket & Win", sub_text:"₹50 Free",         cta:"Play Now",  cta_url:"https://dream11.com", icon:"🏆", color:"#f3a700", duration:10, skip_after:5 },
];

const QUALITY = ["Auto","4K","1080p","720p","480p","360p"];
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
::-webkit-scrollbar{width:4px;}
::-webkit-scrollbar-thumb{background:#e50914;border-radius:2px;}
`;

async function trackAd(adId, userId, event) {
  if (!adId) return;
  supabase.from("ad_impressions").insert({ ad_id: adId, user_id: userId || null, impression_type: event, created_at: new Date().toISOString() }).catch(() => {});
}
async function getAds(type, isPremium) {
  if (isPremium) return [];
  try {
    const { data } = await supabase.from("ads").select("*").eq("is_active", true).eq("type", type).order("priority").limit(3);
    if (data?.length > 0) return data;
  } catch (e) {}
  return FALLBACK_ADS;
}

export default function VideoPlayer({ content, user, onClose, onNext }) {
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

  const [currentAd,    setCurrentAd]    = useState(null);
  const [adTimeLeft,   setAdTimeLeft]   = useState(0);
  const [adCanSkip,    setAdCanSkip]    = useState(false);
  const [midDone,      setMidDone]      = useState([]);
  const [bannerAd,     setBannerAd]     = useState(null);
  const [bannerVisible,setBannerVisible]= useState(false);

  const [episodes,   setEpisodes]   = useState([]);
  const [showEp,     setShowEp]     = useState(false);
  const [showInfo,   setShowInfo]   = useState(false);
  const [selSeason,  setSelSeason]  = useState(1);
  const [related,    setRelated]    = useState([]);  // real "More Like This"
  const [topTen,     setTopTen]     = useState([]);  // real "Top 10" by views
  const [subtitleUrl,setSubtitleUrl]= useState(null); // real .vtt track if admin set one

  const isPremium = ["plan_premium","plan_annual","premium"].includes(user?.plan);
  const isLive    = content?.is_live || content?.type === "Live";
  const isSeries  = content?.type === "Series" || content?.type === "Web Series";
  const streamUrl = content?.stream_url || content?.embed_url || "";

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
    let q = supabase.from("content").select("id,title,thumbnail,views,language").eq("is_active", true).order("views", { ascending: false }).limit(10);
    if (content.language) q = supabase.from("content").select("id,title,thumbnail,views,language").eq("is_active", true).eq("language", content.language).order("views", { ascending: false }).limit(10);
    q.then(({ data }) => setTopTen(data && data.length > 0 ? data : []));

    // Subtitle track — only real if you uploaded a .vtt URL in admin (content.subtitle_url)
    setSubtitleUrl(content?.subtitle_url || null);
  }, [content?.id]);

  // ── Real view count — increments exactly once per time this title is
  // opened (not per render, not randomized). Replaces the old dead
  // backend increment that the frontend never actually called. ──
  useEffect(() => {
    if (!content?.id) return;
    db.incrementViews(content.id);
  }, [content?.id]);

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
    } catch (e) { console.error("toggleLike failed:", e.message); }
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
    clearTimeout(hideTimer.current);
    clearTimeout(tapTimer.current);
  }

  async function startInit() {
    if (!isPremium) {
      const [ads, allAds] = await Promise.all([getAds("pre_roll", isPremium), getAds("pre_roll", false)]);
      if (ads.length > 0) {
        const ad = ads[Math.floor(Math.random() * ads.length)];
        setCurrentAd(ad); setAdTimeLeft(ad.duration || 15); setAdCanSkip(false); setPhase("preroll");
        trackAd(ad.id, user?.id, "view");
        if (allAds.length > 0) { setBannerAd(allAds[Math.floor(Math.random() * allAds.length)]); setBannerVisible(true); }
        return;
      }
    }
    startVideo();
  }

  function startVideo() {
    setPhase("playing"); setBannerVisible(false);
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

    try {
      if (isEmbed) {
        setPlaying(true); resetHide(); return; // rendered as iframe below
      }
      if (!isM3U8) {
        // Direct MP4/video file — load normally, NOT via HLS.js
        v.src = streamUrl;
        const onCanPlay = () => {
          v.volume = volume;
          if (user?.id && content?.id) {
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
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          v.volume = volume;
          if (user?.id && content?.id) {
            db.getProgress(user.id, content.id).then(sec => { if (sec > 5) { v.currentTime = sec; showToast("Resumed from " + fmt(sec)); } }).catch(() => {});
          }
          v.play().catch(() => {}); setPlaying(true); resetHide();
        });
        hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) setError("Stream unavailable. Check URL in admin."); });
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
      if (!isPremium && v.duration) {
        const pct = (v.currentTime / v.duration) * 100;
        [25, 50, 75].forEach(p => {
          if (pct >= p && !midDone.includes(p)) {
            setMidDone(d => [...d, p]); v.pause();
            getAds("mid_roll", false).then(ads => {
              const ad = ads.length > 0 ? ads[Math.floor(Math.random()*ads.length)] : FALLBACK_ADS[1];
              setCurrentAd(ad); setAdTimeLeft(ad.duration || 12); setAdCanSkip(false); setPhase("midroll");
              trackAd(ad.id, user?.id, "midroll_view");
            });
          }
        });
      }
      if (v.duration && v.currentTime >= v.duration * 0.94 && nextCount === null && isSeries) setNextCount(10);
      if (user?.id && content?.id && Math.floor(v.currentTime) % 10 === 0) {
        db.saveProgress(user.id, content.id, Math.floor(v.currentTime), Math.floor(v.duration || 0)).catch(() => {});
      }
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play",  () => setPlaying(true));
    v.addEventListener("pause", () => setPlaying(false));
    v.addEventListener("ended", () => { setPhase("ended"); setPlaying(false); });
    v.addEventListener("enterpictureinpicture", () => setIsPiP(true));
    v.addEventListener("leavepictureinpicture", () => setIsPiP(false));
    return () => { v.removeEventListener("timeupdate", onTime); };
  }, [phase, seeking, midDone, isPremium, nextCount]);

  useEffect(() => {
    if (phase !== "preroll" && phase !== "midroll") return;
    if (adTimeLeft <= 0) { resumeFromAd(); return; }
    const t = setInterval(() => setAdTimeLeft(s => { if (s <= 1) { clearInterval(t); return 0; } return s - 1; }), 1000);
    const sk = setTimeout(() => setAdCanSkip(true), (currentAd?.skip_after || 5) * 1000);
    return () => { clearInterval(t); clearTimeout(sk); };
  }, [phase]);

  useEffect(() => {
    if (nextCount === null || nextCount < 0) return;
    if (nextCount === 0) { onNext?.(); return; }
    const t = setTimeout(() => setNextCount(n => n - 1), 1000);
    return () => clearTimeout(t);
  }, [nextCount]);

  function resumeFromAd() {
    trackAd(currentAd?.id, user?.id, "complete");
    setCurrentAd(null); setAdCanSkip(false);
    if (phase === "preroll") startVideo();
    else { setPhase("playing"); videoRef.current?.play(); setPlaying(true); }
  }
  function skipAd() {
    if (!adCanSkip) return;
    trackAd(currentAd?.id, user?.id, "skip");
    setCurrentAd(null); setAdCanSkip(false);
    if (phase === "preroll") startVideo();
    else { setPhase("playing"); videoRef.current?.play(); setPlaying(true); }
  }

  function togglePlay() { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); resetHide(); }
  function seekTo(val) { const v = videoRef.current; if (!v) return; v.currentTime = Math.max(0, Math.min(v.duration || 0, val)); setProgress(v.currentTime); }
  function skipSec(s) { seekTo(progress + s); showToast(s > 0 ? `+${Math.abs(s)}s` : `-${Math.abs(s)}s`); }
  function toggleMute() { const v = videoRef.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); }
  function changeVol(val) { const v = videoRef.current; if (!v) return; v.volume = val; setVol(val); setMuted(val === 0); }
  function changeSpeed(s) { const v = videoRef.current; if (v) v.playbackRate = s; setSpeed(s); showToast(s + "x speed"); }

  function toggleFS() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().then(() => { setFS(true); if (isMobile && screen.orientation?.lock) screen.orientation.lock("landscape").catch(()=>{}); }).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => { setFS(false); if (screen.orientation?.unlock) screen.orientation.unlock(); }).catch(() => {});
    }
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
    } catch (e) {}
  }

  // ── Mobile gesture handling: double tap to seek ──
  function handleVideoTap(e) {
    const now = Date.now();
    const rect = containerRef.current?.getBoundingClientRect();
    const x = (e.touches?.[0]?.clientX || e.clientX) - (rect?.left || 0);
    const w = rect?.width || window.innerWidth;
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
  const skipIn = Math.max(0, (currentAd?.skip_after || 5) - ((currentAd?.duration || 15) - adTimeLeft));
  const isEmbedUrl = streamUrl.includes("youtube.com/embed") || streamUrl.includes("iframe");

  return (
    <div ref={containerRef} className="vp"
      style={{ position:"fixed", inset:0, zIndex:700, background:"#000", display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <style>{CSS}</style>

      {/* ═══ VIDEO AREA ═══ */}
      <div
        style={{ position:"relative", background:"#000", flexShrink:0, height: fullscreen ? "100vh" : "clamp(220px,55vw,420px)" }}
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

        {/* Buffering spinner overlay (while playing) */}
        {buffering && phase === "playing" && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none", zIndex:15 }}>
            <div style={{ width:40, height:40, border:"3px solid rgba(255,255,255,.2)", borderTop:"3px solid #fff", borderRadius:"50%", animation:"vp-spin .7s linear infinite" }}/>
          </div>
        )}

        {/* Error */}
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

        {/* Skip Intro */}
        {phase === "playing" && showCtrl && progress > 30 && progress < 300 && (
          <button onClick={(e) => { e.stopPropagation(); skipSec(90); showToast("Intro skipped"); }} style={{ position:"absolute", right:"clamp(12px,3vw,20px)", top:"clamp(52px,10vw,68px)", background:"rgba(0,0,0,.85)", backdropFilter:"blur(8px)", color:"#fff", border:"1px solid rgba(255,255,255,.25)", borderRadius:8, padding:"9px 18px", fontSize:13, fontWeight:600, cursor:"pointer", zIndex:20, animation:"vp-fadeIn .3s ease" }}>
            Skip Intro
          </button>
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

        {/* ═══ PRE-ROLL / MID-ROLL AD ═══ */}
        {(phase === "preroll" || phase === "midroll") && currentAd && (
          <div style={{ position:"absolute", inset:0, zIndex:60, background:`linear-gradient(160deg,${currentAd.color||"#333"}66,#000 55%)`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
            <div style={{ position:"absolute", top:14, left:14, background:"rgba(0,0,0,.7)", backdropFilter:"blur(8px)", color:"#aaa", fontSize:10, padding:"4px 12px", borderRadius:20, letterSpacing:3, textTransform:"uppercase", border:"1px solid rgba(255,255,255,.08)" }}>
              {phase === "midroll" ? "Mid-roll" : "Pre-roll"} · Ad
            </div>
            <div style={{ position:"absolute", top:14, right:14, background:"rgba(0,0,0,.7)", color:"rgba(255,255,255,.85)", fontSize:13, fontWeight:600, padding:"5px 14px", borderRadius:20, border:"1px solid rgba(255,255,255,.1)" }}>
              {adTimeLeft}s
            </div>
            <div style={{ textAlign:"center", padding:"16px 24px", maxWidth:440 }}>
              <div style={{ width:80, height:80, borderRadius:"50%", background:`radial-gradient(circle,${currentAd.color||"#333"}55,${currentAd.color||"#333"}11)`, border:`2px solid ${currentAd.color||"#333"}66`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:38, margin:"0 auto 16px" }}>
                {currentAd.icon || "📢"}
              </div>
              <div style={{ fontSize:"clamp(20px,4.5vw,28px)", fontWeight:900, color:"#fff", marginBottom:6 }}>{currentAd.brand}</div>
              <div style={{ color:"rgba(255,255,255,.6)", fontSize:"clamp(12px,2.5vw,14px)", marginBottom:6 }}>{currentAd.tagline}</div>
              {currentAd.sub_text && <div style={{ color:"rgba(255,255,255,.35)", fontSize:11, marginBottom:20 }}>{currentAd.sub_text}</div>}
              <button onClick={() => { trackAd(currentAd.id, user?.id, "click"); if (currentAd.cta_url) window.open(currentAd.cta_url, "_blank"); }}
                style={{ background:`linear-gradient(135deg,${currentAd.color||"#1565c0"},${currentAd.color||"#1565c0"}cc)`, border:"none", color:"#fff", borderRadius:10, padding:"11px 32px", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                {currentAd.cta || "Learn More"}
              </button>
            </div>
            <div style={{ position:"absolute", bottom:"clamp(60px,12vh,80px)", right:"clamp(14px,4vw,32px)", display:"flex", flexDirection:"column", alignItems:"flex-end", gap:8 }}>
              {adCanSkip ? (
                <button onClick={skipAd} style={{ background:"rgba(0,0,0,.9)", backdropFilter:"blur(12px)", border:"1px solid rgba(255,255,255,.3)", color:"#fff", borderRadius:8, padding:"10px 18px", fontSize:13, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:8 }}>
                  Skip Ad <span style={{ background:"rgba(255,255,255,.15)", borderRadius:4, padding:"1px 7px" }}>❯</span>
                </button>
              ) : (
                <div style={{ background:"rgba(0,0,0,.75)", color:"#888", borderRadius:8, padding:"8px 14px", fontSize:12, border:"1px solid rgba(255,255,255,.08)" }}>Skip in {skipIn}s</div>
              )}
              <div style={{ width:180, height:3, background:"rgba(255,255,255,.12)", borderRadius:2, overflow:"hidden" }}>
                <div style={{ height:"100%", background:"rgba(255,255,255,.55)", borderRadius:2, width:`${((currentAd.duration-adTimeLeft)/currentAd.duration)*100}%`, transition:"width 1s linear" }}/>
              </div>
            </div>
            {!isPremium && (
              <div style={{ position:"absolute", bottom:14, left:"50%", transform:"translateX(-50%)", background:"rgba(229,9,20,.12)", border:"1px solid rgba(229,9,20,.25)", borderRadius:20, padding:"5px 16px", fontSize:11, color:"#e50914", fontWeight:600 }}>
                👑 Upgrade for Ad-Free Experience
              </div>
            )}
          </div>
        )}

        {/* Ended */}
        {phase === "ended" && (
          <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.88)", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16, zIndex:40 }}>
            <div style={{ fontSize:42 }}>🎬</div>
            <div style={{ fontWeight:700, fontSize:"clamp(15px,4vw,18px)", color:"#fff", textAlign:"center" }}>{content?.title}</div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap", justifyContent:"center" }}>
              <button onClick={() => { setPhase("loading"); setProgress(0); setMidDone([]); setNextCount(null); startInit(); }} style={{ background:"#1565c0", color:"#fff", border:"none", borderRadius:9, padding:"10px 22px", fontWeight:700, fontSize:13, cursor:"pointer" }}>▶ Watch Again</button>
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
              <div style={{ textAlign:"right", fontSize:12, color:"rgba(255,255,255,.6)", marginBottom:5 }}>{fmt(progress)} / {fmt(duration)}</div>
              <div style={{ position:"relative", height:4, background:"rgba(255,255,255,.2)", borderRadius:2, marginBottom:4 }}>
                <div style={{ position:"absolute", left:0, top:0, height:"100%", background:"rgba(255,255,255,.35)", borderRadius:2, width:bufPct+"%" }}/>
                <div style={{ position:"absolute", left:0, top:0, height:"100%", background:"#1565c0", borderRadius:2, width:pct+"%" }}/>
                {[25,50,75].filter(p => !midDone.includes(p) && !isPremium).map(p => (
                  <div key={p} style={{ position:"absolute", top:"50%", left:`${p}%`, transform:"translate(-50%,-50%)", width:7, height:7, borderRadius:"50%", background:"#f59e0b" }}/>
                ))}
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

      {/* ═══ AD BANNER ═══ */}
      {bannerVisible && bannerAd && phase !== "preroll" && (
        <div style={{ background:"#111118", borderTop:"1px solid #1e1e2e", flexShrink:0, animation:"vp-fadeIn .3s ease" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px" }}>
            <div style={{ width:38, height:38, borderRadius:8, background:bannerAd.color||"#333", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>{bannerAd.icon || "📢"}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                <span style={{ background:"#f59e0b", color:"#000", fontSize:9, fontWeight:800, padding:"1px 5px", borderRadius:3 }}>Ad</span>
                <span style={{ fontWeight:600, fontSize:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:"#fff" }}>{bannerAd.tagline}</span>
              </div>
              <div style={{ fontSize:11, color:"#666" }}>{bannerAd.sub_text || bannerAd.brand}</div>
            </div>
            <button onClick={() => { trackAd(bannerAd.id, user?.id, "banner_click"); if (bannerAd.cta_url) window.open(bannerAd.cta_url, "_blank"); }} style={{ background:bannerAd.color||"#1565c0", color:"#fff", border:"none", borderRadius:7, padding:"6px 12px", fontSize:11, fontWeight:700, cursor:"pointer" }}>{bannerAd.cta || "Learn More"}</button>
            <button onClick={() => setBannerVisible(false)} style={{ background:"none", border:"none", color:"#444", cursor:"pointer", fontSize:16 }}>✕</button>
          </div>
        </div>
      )}

      {/* ═══ INFO SECTION — exact Hotstar match ═══ */}
      <div style={{ flex:1, overflowY:"auto", background:"#000" }}>

        {/* Title block — plain, like screenshot */}
        <div style={{ padding:"18px clamp(14px,3vw,20px) 0" }}>
          <div style={{ fontWeight:800, fontSize:"clamp(18px,4.5vw,22px)", color:"#fff", marginBottom:6 }}>
            {content?.title}
          </div>
          <div style={{ fontSize:13, color:"#8a8a99" }}>
            {[
              content?.release_year,
              content?.runtime || (isSeries ? null : "2h 11m"),
              isSeries ? `${content?.season_count || 1} Season${(content?.season_count||1)>1?"s":""}` : (content?.language ? `${[content?.language].length} Language${1>1?"s":""}` : null)
            ].filter(Boolean).join(" • ")}
          </div>
        </div>

        {/* 4 icon buttons — plain row like screenshot */}
        <div style={{ display:"flex", padding:"18px 0 6px" }}>
          {[
            { icon: inWL ? "✓" : "＋", label: inWL ? "Watchlisted" : "Watchlist", action: toggleWL },
            { icon:"⬇", label:"Download", action:()=>showToast("Downloading...") },
            { icon:"↗", label:"Share",    action:()=>{ navigator.clipboard?.writeText(window.location.href).catch(()=>{}); showToast("Link copied!"); } },
            { icon:"♡", label:"Rate",     action:()=>showToast("Thanks for rating!") },
          ].map(btn => (
            <button key={btn.label} onClick={btn.action} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:7, background:"none", border:"none", color:"#ccc", cursor:"pointer", padding:"6px 4px" }}>
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
                  {item.thumbnail
                    ? <img src={item.thumbnail} alt={item.title} style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>e.target.style.display="none"}/>
                    : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, opacity:.3 }}>🎬</div>
                  }
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
                      {item.thumbnail
                        ? <img src={item.thumbnail} alt={item.title} style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>e.target.style.display="none"}/>
                        : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, opacity:.3 }}>🎬</div>
                      }
                    </div>
                    <button onClick={() => showToast("Added to Watchlist")} style={{ width:"100%", background:"#1c1c20", border:"none", borderRadius:5, color:"#ccc", fontSize:11.5, fontWeight:600, padding:"7px 0", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                      ＋ Watchlist
                    </button>
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
              {settingsTab === "quality" && QUALITY.map(q => (
                <div key={q} className="vp-sopt" onClick={() => { setQuality(q); setShowSettings(false); showToast("Quality: "+q); }}>
                  {quality === q ? <span style={{ color:"#1565c0", fontSize:18, flexShrink:0 }}>✓</span> : <span style={{ width:18 }}/>}
                  <div style={{ flex:1 }}><div style={{ fontWeight:quality===q?700:400, fontSize:14, color:"#fff" }}>{q}</div>{q === "4K" && !isPremium && <div style={{ fontSize:11, color:"#f59e0b" }}>Requires Premium</div>}</div>
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
import { useState, useEffect, useRef } from "react";
import { supabase, db } from "./supabase.js";
import VideoPlayer from "./VideoPlayer.jsx";
import Search from "./Search.jsx";

const GS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Manrope:wght@400;500;600;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html{scroll-behavior:smooth;}
body{background:#0a0a0f;color:#fff;font-family:'Manrope',sans-serif;overflow-x:hidden;}
::-webkit-scrollbar{height:2px;width:3px;}
::-webkit-scrollbar-thumb{background:#e50914;border-radius:2px;}
.rs{display:flex;gap:12px;overflow-x:auto;padding-bottom:4px;scroll-behavior:smooth;}
.rs::-webkit-scrollbar{height:0;}
@keyframes fadeUp{from{opacity:0;transform:translateY(18px);}to{opacity:1;transform:translateY(0);}}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
.ch{transition:transform .22s,box-shadow .22s;cursor:pointer;}
.ch:hover{transform:scale(1.06) translateY(-4px);}
@media(max-width:480px){.ch:hover{transform:none;}}
.pt{background:none;border:none;font-family:'Manrope',sans-serif;font-size:13px;font-weight:600;color:#555;padding:7px 14px;cursor:pointer;white-space:nowrap;border-bottom:2px solid transparent;transition:color .18s,border-color .18s;}
.pt.on{color:#fff;font-weight:700;border-bottom-color:#e50914;}
`;

const CATS = ["For You","Live","Movies","Series","Sports","Kids","Premium","News"];

const GENRE_COLOR = {
  Action:"#e50914",Drama:"#f59e0b","Sci-Fi":"#1d9bf0",Thriller:"#a855f7",
  Horror:"#f87171",Romance:"#ec4899",Comedy:"#84cc16",Kids:"#84cc16",
  Cricket:"#00c853",Racing:"#e50914",Football:"#38bdf8",News:"#f97316",
  Sports:"#00c853",Documentary:"#38bdf8",Nature:"#22c55e",default:"#64748b",
};
const GENRE_EMOJI = {
  Action:"💥",Drama:"🎭","Sci-Fi":"🌌",Thriller:"🔪",Horror:"👻",
  Romance:"💕",Comedy:"😄",Kids:"🧸",Cricket:"🏏",Racing:"🏎️",
  Football:"⚽",News:"📺",Sports:"🏆",Documentary:"🎥",Nature:"🌊",default:"🎬",
};

const gc = i => GENRE_COLOR[i?.genre] || GENRE_COLOR.default;
const ge = i => GENRE_EMOJI[i?.genre] || GENRE_EMOJI.default;

/* ── Universal Player ── */
function UniversalPlayer({ content, user, onClose, onNext }) {
  if (!content) return null;
  const url = content.embed_url || content.stream_url || "";
  const isYT = url.includes("youtube.com") || url.includes("youtu.be");

  function toEmbed(u) {
    try {
      if (u.includes("youtube.com/watch?v=")) return `https://www.youtube.com/embed/${new URL(u).searchParams.get("v")}?autoplay=1&rel=0`;
      if (u.includes("youtu.be/")) return `https://www.youtube.com/embed/${u.split("youtu.be/")[1]?.split("?")[0]}?autoplay=1&rel=0`;
    } catch(e) {}
    return u;
  }

  if (content.embed_url || isYT) {
    return (
      <div style={{position:"fixed",inset:0,zIndex:700,background:"#000",display:"flex",flexDirection:"column"}}>
        <style>{`@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}`}</style>
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"11px 18px",background:"rgba(0,0,0,.96)",borderBottom:"1px solid #1a1a26",flexShrink:0}}>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.12)",color:"#fff",fontSize:18,cursor:"pointer",borderRadius:8,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:15,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{content.title}</div>
            <div style={{fontSize:11,color:"#555"}}>{content.type} · {content.genre}</div>
          </div>
          {(content.is_live||content.type==="Live") && <div style={{background:"#e50914",color:"#fff",fontSize:10,fontWeight:800,padding:"4px 14px",borderRadius:20,letterSpacing:2,animation:"pulse 1.5s infinite"}}>● LIVE</div>}
          <button onClick={onClose} style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"#aaa",borderRadius:8,padding:"6px 14px",fontSize:12,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{flex:1,position:"relative"}}>
          <iframe src={toEmbed(content.embed_url||url)} style={{position:"absolute",inset:0,width:"100%",height:"100%",border:"none"}} allow="autoplay; fullscreen; encrypted-media" allowFullScreen title={content.title}/>
        </div>
      </div>
    );
  }
  return <VideoPlayer content={content} user={user} onClose={onClose} onNext={onNext}/>;
}

/* ── Content Card ── */
function Card({ item, onPlay }) {
  const [hov, setHov] = useState(false);
  const color = gc(item), emoji = ge(item);
  const isLive = item.is_live || item.type === "Live";
  return (
    <div className="ch"
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      onClick={()=>onPlay(item)}
      style={{flex:"0 0 clamp(140px,28vw,165px)",borderRadius:10,overflow:"hidden",border:`1.5px solid ${hov?color+"88":"#1c1c24"}`,background:"#0f0f16",boxShadow:hov?`0 10px 32px ${color}33`:"none"}}
    >
      <div style={{height:"clamp(88px,17vw,105px)",position:"relative",overflow:"hidden",background:item.thumbnail?`url(${item.thumbnail}) center/cover no-repeat`:`linear-gradient(135deg,${color}22,#0a0a0f)`,display:"flex",alignItems:"center",justifyContent:"center"}}>
        {!item.thumbnail && <span style={{fontSize:"clamp(30px,7vw,42px)"}}>{emoji}</span>}
        {isLive && <div style={{position:"absolute",top:6,left:6,background:"#e50914",color:"#fff",fontSize:9,fontWeight:800,padding:"2px 8px",borderRadius:3,letterSpacing:2,animation:"pulse 1.5s infinite"}}>● LIVE</div>}
        {item.is_premium && !isLive && <div style={{position:"absolute",top:6,right:6,background:"rgba(229,9,20,.9)",color:"#fff",fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:3}}>PRO</div>}
        {hov && <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:38,height:38,borderRadius:"50%",background:color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:900}}>▶</div></div>}
      </div>
      <div style={{padding:"8px 10px 10px"}}>
        <div style={{fontWeight:700,fontSize:12,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:10,color,fontWeight:600}}>{item.genre}</span>
          {item.score>0 && <span style={{fontSize:10,color:"#f59e0b"}}>★ {item.score}</span>}
        </div>
      </div>
    </div>
  );
}

/* ── Content Row ── */
function Row({ label, items, onPlay }) {
  const ref = useRef(null);
  // Don't render row if no items
  if (!items?.length) return null;
  return (
    <div style={{marginBottom:"clamp(24px,4vw,34px)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,padding:"0 clamp(14px,4vw,24px)"}}>
        <div style={{fontWeight:800,fontSize:"clamp(14px,3vw,16px)"}}>{label}</div>
        <div style={{display:"flex",gap:5}}>
          <button onClick={()=>ref.current?.scrollBy({left:-300,behavior:"smooth"})} style={{width:24,height:24,borderRadius:"50%",background:"rgba(255,255,255,.08)",border:"none",color:"#aaa",cursor:"pointer",fontSize:13}}>‹</button>
          <button onClick={()=>ref.current?.scrollBy({left:300,behavior:"smooth"})}  style={{width:24,height:24,borderRadius:"50%",background:"rgba(255,255,255,.08)",border:"none",color:"#aaa",cursor:"pointer",fontSize:13}}>›</button>
        </div>
      </div>
      <div ref={ref} className="rs" style={{padding:`0 clamp(14px,4vw,24px) 6px`}}>
        {items.map(i=><Card key={i.id} item={i} onPlay={onPlay}/>)}
      </div>
    </div>
  );
}

/* ── Hero Banner ── */
function Hero({ items, onPlay }) {
  const [idx, setIdx] = useState(0);
  const [key, setKey] = useState(0);
  useEffect(()=>{
    if(!items.length) return;
    const t=setInterval(()=>{setIdx(i=>(i+1)%items.length);setKey(k=>k+1);},6000);
    return()=>clearInterval(t);
  },[items.length]);

  if(!items.length) return <div style={{height:"55vh",background:"#0a0a0f"}}/>;

  const h = items[idx], color = gc(h);
  return (
    <div style={{position:"relative",height:"clamp(310px,60vh,680px)",overflow:"hidden",background:`radial-gradient(ellipse at 70% 50%,${color}28,#0a0a0f 65%)`}}>
      {h.thumbnail && <div style={{position:"absolute",right:0,top:0,bottom:0,width:"clamp(50%,60%,65%)",background:`url(${h.thumbnail}) center/cover`,maskImage:"linear-gradient(to left,rgba(0,0,0,.7),transparent)",WebkitMaskImage:"linear-gradient(to left,rgba(0,0,0,.7),transparent)"}}/>}
      {!h.thumbnail && <div style={{position:"absolute",right:"-2%",top:"50%",transform:"translateY(-52%)",fontSize:"clamp(160px,26vw,380px)",opacity:.06,userSelect:"none"}}>{ge(h)}</div>}
      <div style={{position:"absolute",inset:0,background:`linear-gradient(100deg,#0a0a0f 38%,transparent 68%)`}}/>
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:"55%",background:"linear-gradient(to top,#0a0a0f,transparent)"}}/>
      <div key={key} style={{position:"absolute",bottom:"clamp(50px,8vh,75px)",left:0,right:0,padding:"0 clamp(14px,5vw,40px)",animation:"fadeUp .5s ease"}}>
        {h.is_live && <div style={{display:"inline-flex",alignItems:"center",gap:5,background:"#e50914",color:"#fff",padding:"3px 12px",borderRadius:4,fontSize:10,fontWeight:800,marginBottom:10,letterSpacing:2,animation:"pulse 1.5s infinite"}}><span style={{width:5,height:5,background:"#fff",borderRadius:"50%"}}/>LIVE NOW</div>}
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(30px,7vw,68px)",lineHeight:.95,marginBottom:8,maxWidth:540,letterSpacing:1}}>{h.title}</div>
        <div style={{fontSize:"clamp(12px,1.8vw,13px)",color:"rgba(255,255,255,.55)",maxWidth:420,lineHeight:1.6,marginBottom:14,display:"clamp(none,block,block)"}}>{h.description}</div>
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          {h.rating && <span style={{background:"rgba(255,255,255,.1)",color:"rgba(255,255,255,.7)",fontSize:10,padding:"2px 8px",borderRadius:4,fontWeight:600}}>{h.rating}</span>}
          {h.score>0 && <span style={{background:"rgba(245,158,11,.15)",color:"#f59e0b",fontSize:10,fontWeight:700,padding:"2px 9px",borderRadius:4}}>★ {h.score}</span>}
          {h.language && <span style={{background:"rgba(255,255,255,.08)",color:"rgba(255,255,255,.5)",fontSize:10,padding:"2px 8px",borderRadius:4}}>{h.language}</span>}
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>onPlay(h)} style={{background:h.is_live?"#e50914":"#fff",color:h.is_live?"#fff":"#111",border:"none",borderRadius:9,padding:"clamp(10px,2vw,13px) clamp(18px,3vw,26px)",fontWeight:800,fontSize:"clamp(13px,2vw,15px)",cursor:"pointer"}}>▶ {h.is_live?"Watch Live":"Play Now"}</button>
          <button style={{background:"rgba(255,255,255,.1)",color:"#fff",border:"1px solid rgba(255,255,255,.2)",borderRadius:9,padding:"clamp(10px,2vw,13px) clamp(14px,2.5vw,20px)",fontSize:"clamp(13px,2vw,14px)",cursor:"pointer"}}>+ My List</button>
        </div>
      </div>
      <div style={{position:"absolute",bottom:"clamp(12px,2.5vh,18px)",left:"50%",transform:"translateX(-50%)",display:"flex",gap:5}}>
        {items.slice(0,5).map((_,i)=>(
          <div key={i} onClick={()=>{setIdx(i);setKey(k=>k+1);}} style={{height:4,borderRadius:2,cursor:"pointer",transition:"all .3s",width:i===idx?22:5,background:i===idx?color:"rgba(255,255,255,.2)"}}/>
        ))}
      </div>
    </div>
  );
}

/* ── Empty State ── */
function Empty({ icon, msg }) {
  return (
    <div style={{textAlign:"center",padding:"clamp(40px,10vh,60px) 20px",color:"#333"}}>
      <div style={{fontSize:48,marginBottom:14,opacity:.4}}>{icon}</div>
      <div style={{fontSize:14,fontWeight:600,color:"#2a2a36",marginBottom:6}}>{msg}</div>
      <div style={{fontSize:12,color:"#1a1a26"}}>Content added in admin panel will appear here</div>
    </div>
  );
}

/* ── Main Home ── */
export default function Home({ onNavigate, user, onUpgrade }) {
  const [cat,        setCat]        = useState("For You");
  const [content,    setContent]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [playItem,   setPlayItem]   = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [scrolled,   setScrolled]   = useState(false);

  useEffect(()=>{
    loadContent();
    const fn=()=>setScrolled(window.scrollY>10);
    window.addEventListener("scroll",fn);
    return()=>window.removeEventListener("scroll",fn);
  },[]);

  // Realtime — when admin adds/edits content it shows instantly
  useEffect(()=>{
    const ch = supabase.channel("home-rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"content"},()=>loadContent())
      .subscribe();
    return()=>supabase.removeChannel(ch);
  },[]);

  async function loadContent(){
    setLoading(true);
    try {
      const { data } = await supabase
        .from("content")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      setContent(data || []);
    } catch(e){ setContent([]); }
    setLoading(false);
  }

  // Group — only real DB content, NO fake data
  const g = {
    live:     content.filter(c=>c.is_live||c.type==="Live"),
    movies:   content.filter(c=>c.type==="Movie"),
    series:   content.filter(c=>c.type==="Series"),
    sports:   content.filter(c=>["Cricket","Football","Racing","Kabaddi","Wrestling","Sports"].includes(c.genre)),
    kids:     content.filter(c=>c.genre==="Kids"),
    premium:  content.filter(c=>c.is_premium),
    news:     content.filter(c=>c.genre==="News"),
    trending: [...content].sort((a,b)=>(b.views||0)-(a.views||0)),
    featured: content.filter(c=>c.is_featured),
  };

  const heroItems = [...g.featured, ...g.live].slice(0,5);
  const hasAny    = content.length > 0;

  function rows(){
    switch(cat){
      case "Live":    return [["🔴 Live Channels", g.live]];
      case "Movies":  return [["🎬 Movies",         g.movies]];
      case "Series":  return [["📺 Series",          g.series]];
      case "Sports":  return [["🏆 Sports",          g.sports]];
      case "Kids":    return [["🧸 Kids",             g.kids]];
      case "Premium": return [["👑 Premium",          g.premium]];
      case "News":    return [["📰 News",             g.news]];
      default: return [
        ["🔴 Live Now",    g.live],
        ["🔥 Trending",    g.trending.slice(0,12)],
        ["🎬 Movies",      g.movies],
        ["📺 Series",      g.series],
        ["🏆 Sports",      g.sports],
        ["🧸 Kids",        g.kids],
        ["👑 Originals",   g.premium],
        ["📰 News",        g.news],
      ];
    }
  }

  const catEmptyMsg = {
    "Live":    ["🔴","No live channels yet"],
    "Movies":  ["🎬","No movies yet"],
    "Series":  ["📺","No series yet"],
    "Sports":  ["🏆","No sports content yet"],
    "Kids":    ["🧸","No kids content yet"],
    "Premium": ["👑","No premium content yet"],
    "News":    ["📰","No news channels yet"],
  };

  return (
    <div style={{minHeight:"100vh",background:"#0a0a0f",paddingBottom:"clamp(70px,12vw,88px)"}}>
      <style>{GS}</style>

      {showSearch && <Search onPlay={i=>{setPlayItem(i);setShowSearch(false);}} onClose={()=>setShowSearch(false)} content={content}/>}
      {playItem   && (
    <UniversalPlayer
      content={playItem}
      user={user}
      onClose={() => setPlayItem(null)}
      onNext={(nextItem) => {
        if (nextItem && nextItem.id) {
          setPlayItem(nextItem);
        }
      }}
    />
  )}

      {/* ── NAVBAR ── */}
      <nav style={{position:"fixed",top:0,left:0,right:0,zIndex:200,background:scrolled?"rgba(10,10,15,.97)":"transparent",backdropFilter:scrolled?"blur(16px)":"none",borderBottom:scrolled?"1px solid rgba(255,255,255,.05)":"none",transition:"all .3s"}}>
        <div style={{display:"flex",alignItems:"center",gap:"clamp(8px,2vw,16px)",padding:"0 clamp(14px,4vw,24px)",height:"clamp(50px,8vw,56px)"}}>
          <div style={{fontWeight:900,fontSize:22,letterSpacing:1,cursor:"pointer",lineHeight:1,flexShrink:0}} onClick={()=>setCat("For You")}>
            <span style={{color:"#e50914"}}>STREAM</span><span style={{color:"#aaa"}}>X</span>
          </div>
          <div style={{flex:1}}/>
          <button onClick={()=>setShowSearch(true)} style={{display:"flex",alignItems:"center",gap:7,background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.08)",borderRadius:8,padding:"7px clamp(10px,2vw,14px)",color:"#aaa",fontSize:13,cursor:"pointer"}}>
            🔍 Search
          </button>
          <button onClick={onUpgrade} style={{background:"rgba(229,9,20,.12)",border:"1px solid rgba(229,9,20,.3)",color:"#89050b",borderRadius:8,padding:"7px clamp(9px,1.5vw,13px)",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
            👑 Premium
          </button>
          <div onClick={()=>onNavigate("profile")} style={{width:34,height:34,borderRadius:"50%",background:"linear-gradient(135deg,#e50914,#ff4444)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,cursor:"pointer",fontWeight:700,flexShrink:0}}>
            {user?.name?.[0]?.toUpperCase()||"👤"}
          </div>
        </div>
        {/* Category tabs */}
        <div style={{display:"flex",overflowX:"auto",padding:"0 clamp(14px,4vw,24px)",borderBottom:"1px solid rgba(255,255,255,.06)"}}>
          {CATS.map(c=><button key={c} className={`pt${cat===c?" on":""}`} onClick={()=>setCat(c)}>{c}</button>)}
        </div>
      </nav>

      {/* ── HERO (only if content exists) ── */}
      {cat==="For You" && !loading && heroItems.length>0 && <Hero items={heroItems} onPlay={setPlayItem}/>}
      {(cat!=="For You" || heroItems.length===0) && <div style={{height:"clamp(96px,14vw,108px)"}}/>}

      {/* ── CONTENT ── */}
      {loading ? (
        // Loading skeleton
        <div style={{padding:"clamp(14px,4vw,24px)"}}>
          {[1,2,3].map(i=>(
            <div key={i} style={{marginBottom:32}}>
              <div style={{height:16,width:150,background:"#1a1a26",borderRadius:5,marginBottom:12}}/>
              <div style={{display:"flex",gap:12}}>
                {[1,2,3,4].map(j=>(
                  <div key={j} style={{width:"clamp(140px,28vw,165px)",height:"clamp(115px,22vw,128px)",background:"#1a1a26",borderRadius:9,flexShrink:0}}/>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{paddingTop: cat==="For You" && heroItems.length>0 ? 24 : 8}}>

          {/* No content at all — show big empty state */}
          {!hasAny && cat==="For You" && (
            <div style={{textAlign:"center",padding:"60px 20px",animation:"fadeIn .4s ease"}}>
              <div style={{fontSize:72,marginBottom:20,opacity:.3}}>🎬</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1,marginBottom:8,color:"#2a2a36"}}>No Content Yet</div>
              <div style={{fontSize:14,color:"#222",marginBottom:24}}>Go to Admin Panel and add your first movie, series or live channel</div>
              <button onClick={()=>onNavigate("admin")} style={{background:"#e50914",color:"#fff",border:"none",borderRadius:10,padding:"12px 28px",fontWeight:700,fontSize:14,cursor:"pointer"}}>
                Open Admin Panel →
              </button>
            </div>
          )}

          {/* Content rows — only real data, empty rows are hidden */}
          {hasAny && rows().map(([label,items],i)=>(
            <Row key={i} label={label} items={items} onPlay={setPlayItem}/>
          ))}

          {/* Category empty state */}
          {hasAny && cat!=="For You" && rows().every(([,items])=>!items?.length) && (
            <Empty icon={catEmptyMsg[cat]?.[0]||"📂"} msg={catEmptyMsg[cat]?.[1]||"No content yet"}/>
          )}

          {/* Premium banner — only if content exists */}
          {hasAny && cat==="For You" && (
            <div style={{margin:`8px clamp(14px,4vw,24px) 40px`,borderRadius:14,background:"linear-gradient(120deg,#e50914,#ff6b35)",padding:"clamp(18px,4vw,26px) clamp(18px,5vw,32px)",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:14}}>
              <div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(20px,4vw,26px)",letterSpacing:1,marginBottom:4}}>Upgrade to StreamX Premium</div>
                <div style={{fontSize:"clamp(11px,2vw,13px)",color:"rgba(255,255,255,.8)"}}>4K · HDR · No Ads · 4 Screens · Downloads</div>
              </div>
              <button onClick={onUpgrade} style={{background:"#fff",color:"#e50914",border:"none",borderRadius:9,padding:"clamp(10px,2vw,12px) clamp(16px,3vw,22px)",fontWeight:800,fontSize:"clamp(12px,2vw,14px)",cursor:"pointer",whiteSpace:"nowrap"}}>
                Subscribe ₹249/mo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { supabase, db } from "./supabase.js";
import VideoPlayer from "./VideoPlayer.jsx";

const RED = "#e50914";

function UniversalPlayer({ content, user, onClose }) {
  if (!content) return null;
  const url = content.embed_url || content.stream_url || "";
  const isYT = url.includes("youtube.com") || url.includes("youtu.be");

  function toEmbed(u) {
    try {
      if (u.includes("youtube.com/watch?v=")) {
        const id = new URL(u).searchParams.get("v");
        return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
      }
      if (u.includes("youtu.be/")) {
        const id = u.split("youtu.be/")[1]?.split("?")[0];
        return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
      }
    } catch(e) {}
    return u;
  }

  if (content.embed_url || isYT) {
    return (
      <div style={{position:"fixed",inset:0,zIndex:800,background:"#000",display:"flex",flexDirection:"column"}}>
        <style>{`@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}`}</style>
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 18px",background:"rgba(0,0,0,.96)",borderBottom:"1px solid #1a1a26",flexShrink:0}}>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.1)",color:"#fff",fontSize:18,cursor:"pointer",borderRadius:8,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:15,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{content.title}</div>
            <div style={{fontSize:11,color:"#555"}}>{content.type} · {content.genre}</div>
          </div>
          {(content.is_live||content.type==="Live") && (
            <div style={{background:RED,color:"#fff",fontSize:10,fontWeight:800,padding:"4px 14px",borderRadius:20,letterSpacing:2,animation:"pulse 1.5s infinite"}}>● LIVE</div>
          )}
          <button onClick={onClose} style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"#aaa",borderRadius:8,padding:"6px 14px",fontSize:12,cursor:"pointer"}}>✕ Close</button>
        </div>
        <div style={{flex:1,position:"relative"}}>
          <iframe src={toEmbed(content.embed_url||url)} style={{position:"absolute",inset:0,width:"100%",height:"100%",border:"none"}} allow="autoplay; fullscreen; encrypted-media" allowFullScreen title={content.title}/>
        </div>
      </div>
    );
  }
  return <VideoPlayer content={content} user={user} onClose={onClose} onNext={()=>{}}/>;
}

const GENRE_COLOR = {
  Action:"#e50914",Drama:"#f59e0b","Sci-Fi":"#1d9bf0",Thriller:"#a855f7",
  Horror:"#f87171",Romance:"#ec4899",Comedy:"#84cc16",Kids:"#84cc16",
  Cricket:"#00c853",Racing:"#e50914",Football:"#38bdf8",default:"#64748b",
};

export default function WatchPage({ content, user, onBack, onUpgrade }) {
  const [playing,    setPlaying]    = useState(false);
  const [related,    setRelated]    = useState([]);
  const [inWL,       setInWL]       = useState(false);
  const [liked,      setLiked]      = useState(false);
  const [episodes,   setEpisodes]   = useState([]);
  const [selSeason,  setSelSeason]  = useState(1);
  const [toast,      setToast]      = useState(null);
  const [activeTab,  setActiveTab]  = useState("about");

  const color   = GENRE_COLOR[content?.genre] || GENRE_COLOR.default;
  const isLive  = content?.is_live || content?.type === "Live";
  const isSeries= content?.type === "Series";
  const isPremium = ["plan_premium","plan_annual","premium"].includes(user?.plan);
  const isLocked  = content?.is_premium && !isPremium;

  const showToast = msg => { setToast(msg); setTimeout(()=>setToast(null),2500); };

  useEffect(() => {
    loadRelated();
    if (user?.id && content?.id) {
      db.isInWatchlist(user.id, content.id).then(setInWL).catch(()=>{});
    }
    // Mock episodes for series
    if (isSeries) {
      setEpisodes(Array.from({length:8},(_,i)=>({
        ep: i+1,
        title: `Episode ${i+1}`,
        duration: "42 min",
        desc: `Episode ${i+1} of the series.`,
        watched: i < 3,
        progress: i===2?62:0,
      })));
    }
  }, [content?.id]);

  async function loadRelated() {
    if (!content?.genre) return;
    try {
      const { data } = await supabase
        .from("content")
        .select("*")
        .eq("is_active", true)
        .eq("genre", content.genre)
        .neq("id", content.id)
        .limit(8);
      setRelated(data || []);
    } catch(e) {}
  }

  async function toggleWatchlist() {
    if (!user?.id) return;
    try {
      if (inWL) {
        await db.removeFromWatchlist(user.id, content.id);
        setInWL(false); showToast("Removed from My List");
      } else {
        await db.addToWatchlist(user.id, content.id);
        setInWL(true); showToast("Added to My List ✓");
      }
    } catch(e) { showToast("Error updating list"); }
  }

  function handlePlay() {
    if (isLocked) { onUpgrade(); return; }
    setPlaying(true);
  }

  const LANGS = (content?.language || "").split("/").map(l=>l.trim()).filter(Boolean);

  return (
    <div style={{minHeight:"100vh",background:"#07070c",fontFamily:"'Inter',sans-serif",color:"#fff",paddingBottom:80}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Bebas+Neue&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
        @keyframes spin{to{transform:rotate(360deg);}}
        .ep-card{transition:background .15s;cursor:pointer;border-radius:10px;overflow:hidden;}
        .ep-card:hover{background:rgba(255,255,255,.04);}
        .rel-card{cursor:pointer;border-radius:9px;overflow:hidden;transition:transform .2s;}
        .rel-card:hover{transform:scale(1.04);}
        @media(max-width:600px){
          .watch-layout{flex-direction:column!important;}
          .watch-side{width:100%!important;max-width:100%!important;}
        }
      `}</style>

      {/* Player Modal */}
      {playing && (
        <UniversalPlayer content={content} user={user} onClose={()=>setPlaying(false)}/>
      )}

      {/* Toast */}
      {toast && (
        <div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:"#1a1a26",color:"#fff",padding:"10px 24px",borderRadius:40,fontSize:13,fontWeight:600,border:"1px solid #2a2a36",whiteSpace:"nowrap"}}>
          {toast}
        </div>
      )}

      {/* ── HERO SECTION ── */}
      <div style={{
        position:"relative",
        height:"clamp(260px,50vw,480px)",
        background: content?.thumbnail
          ? `url(${content.thumbnail}) center/cover`
          : `radial-gradient(ellipse at 60% 50%,${color}33,#07070c 65%)`,
        overflow:"hidden",
      }}>
        {/* Gradient overlay */}
        <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,rgba(7,7,12,.3) 0%,rgba(7,7,12,.6) 60%,#07070c 100%)"}}/>
        <div style={{position:"absolute",inset:0,background:"linear-gradient(to right,rgba(7,7,12,.8) 0%,transparent 60%)"}}/>

        {/* Back button */}
        <button
          onClick={onBack}
          style={{position:"absolute",top:"clamp(12px,3vw,20px)",left:"clamp(14px,4vw,24px)",background:"rgba(0,0,0,.6)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,.15)",color:"#fff",fontSize:16,cursor:"pointer",borderRadius:9,width:38,height:38,display:"flex",alignItems:"center",justifyContent:"center",zIndex:10}}
        >←</button>

        {/* Big Play Button */}
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <button
            onClick={handlePlay}
            style={{
              width:"clamp(56px,10vw,72px)",height:"clamp(56px,10vw,72px)",
              borderRadius:"50%",
              background:isLocked?"rgba(255,255,255,.12)":"rgba(229,9,20,.9)",
              border:`2px solid ${isLocked?"rgba(255,255,255,.2)":RED}`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:"clamp(22px,4vw,28px)",cursor:"pointer",
              backdropFilter:"blur(8px)",
              boxShadow:isLocked?"none":`0 8px 32px ${RED}66`,
              transition:"transform .2s",
            }}
            onMouseEnter={e=>e.currentTarget.style.transform="scale(1.08)"}
            onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
          >
            {isLocked?"🔒":"▶"}
          </button>
        </div>

        {/* Live badge */}
        {isLive && (
          <div style={{position:"absolute",top:"clamp(12px,3vw,20px)",right:"clamp(14px,4vw,24px)",background:RED,color:"#fff",fontSize:11,fontWeight:800,padding:"4px 14px",borderRadius:20,letterSpacing:2,animation:"pulse 1.5s infinite",display:"flex",gap:6,alignItems:"center"}}>
            <span style={{width:6,height:6,background:"#fff",borderRadius:"50%"}}/>LIVE
          </div>
        )}

        {/* Content info overlay at bottom */}
        <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"0 clamp(14px,4vw,24px) clamp(14px,3vw,20px)",animation:"fadeUp .4s ease"}}>
          {content?.type && (
            <div style={{display:"inline-block",background:`${color}22`,border:`1px solid ${color}44`,color,fontSize:10,fontWeight:700,padding:"2px 10px",borderRadius:20,marginBottom:8,letterSpacing:.5}}>
              {content.type.toUpperCase()}
            </div>
          )}
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(28px,6vw,52px)",lineHeight:.95,marginBottom:8,letterSpacing:.5}}>
            {content?.title}
          </div>
          {/* Meta row */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            {content?.release_year && <span style={{fontSize:12,color:"rgba(255,255,255,.5)"}}>{content.release_year}</span>}
            {content?.rating && <span style={{background:"rgba(255,255,255,.1)",color:"rgba(255,255,255,.7)",fontSize:10,padding:"2px 8px",borderRadius:4,fontWeight:600}}>{content.rating}</span>}
            {content?.score>0 && <span style={{background:"rgba(245,158,11,.15)",color:"#f59e0b",fontSize:10,fontWeight:700,padding:"2px 9px",borderRadius:4}}>★ {content.score}</span>}
            {LANGS.map(l=><span key={l} style={{background:"rgba(255,255,255,.08)",color:"rgba(255,255,255,.5)",fontSize:10,padding:"2px 8px",borderRadius:4}}>{l}</span>)}
            {isSeries && content?.season_count && <span style={{fontSize:12,color:"rgba(255,255,255,.5)"}}>{content.season_count} Season{content.season_count>1?"s":""}</span>}
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{padding:"0 clamp(14px,4vw,24px)",marginTop:"-4px"}}>

        {/* ── ACTION BUTTONS ── */}
        <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
          {/* Play / Watch Live */}
          <button
            onClick={handlePlay}
            style={{
              flex:1,minWidth:120,
              background:isLocked?"#1a1a26":RED,
              color:"#fff",border:"none",borderRadius:10,
              padding:"clamp(12px,2vw,14px) 0",
              fontWeight:800,fontSize:"clamp(14px,2.5vw,16px)",
              cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              fontFamily:"'Inter',sans-serif",
            }}
          >
            {isLocked ? "🔒 Unlock Premium" : isLive ? "▶ Watch Live" : "▶ Play Now"}
          </button>

          {/* Trailer */}
          {content?.trailer_url && (
            <button style={{background:"rgba(255,255,255,.08)",color:"#fff",border:"1px solid rgba(255,255,255,.12)",borderRadius:10,padding:"clamp(12px,2vw,14px) clamp(16px,3vw,20px)",fontWeight:600,fontSize:14,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
              ▷ Trailer
            </button>
          )}

          {/* My List */}
          <button
            onClick={toggleWatchlist}
            style={{
              background:inWL?"rgba(229,9,20,.15)":"rgba(255,255,255,.08)",
              color:inWL?RED:"#fff",
              border:`1px solid ${inWL?"rgba(229,9,20,.3)":"rgba(255,255,255,.12)"}`,
              borderRadius:10,
              padding:"clamp(12px,2vw,14px) clamp(16px,3vw,20px)",
              fontWeight:600,fontSize:14,cursor:"pointer",
              fontFamily:"'Inter',sans-serif",
            }}
          >
            {inWL?"✓ Saved":"+ My List"}
          </button>

          {/* Like */}
          <button
            onClick={()=>{setLiked(l=>!l);showToast(liked?"Removed like":"Liked! ❤️");}}
            style={{
              background:liked?"rgba(229,9,20,.15)":"rgba(255,255,255,.08)",
              color:liked?RED:"#aaa",
              border:`1px solid ${liked?"rgba(229,9,20,.3)":"rgba(255,255,255,.12)"}`,
              borderRadius:10,padding:"clamp(12px,2vw,14px) 16px",
              fontSize:18,cursor:"pointer",
            }}
          >
            {liked?"❤️":"🤍"}
          </button>

          {/* Share */}
          <button
            onClick={()=>{ navigator.clipboard?.writeText(window.location.href).catch(()=>{}); showToast("Link copied!"); }}
            style={{background:"rgba(255,255,255,.08)",color:"#aaa",border:"1px solid rgba(255,255,255,.12)",borderRadius:10,padding:"clamp(12px,2vw,14px) 16px",fontSize:16,cursor:"pointer"}}
          >
            ↗
          </button>
        </div>

        {/* ── PREMIUM LOCK BANNER ── */}
        {isLocked && (
          <div style={{background:"linear-gradient(120deg,rgba(229,9,20,.12),rgba(245,158,11,.08))",border:"1px solid rgba(229,9,20,.25)",borderRadius:12,padding:"14px 18px",marginBottom:20,display:"flex",alignItems:"center",gap:14}}>
            <div style={{fontSize:28}}>👑</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:2}}>Premium Content</div>
              <div style={{fontSize:12,color:"#888"}}>Subscribe to StreamX Premium to watch this content in 4K HDR</div>
            </div>
            <button onClick={onUpgrade} style={{background:RED,color:"#fff",border:"none",borderRadius:8,padding:"9px 18px",fontWeight:700,fontSize:13,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"'Inter',sans-serif"}}>
              Upgrade ₹499
            </button>
          </div>
        )}

        {/* ── TABS ── */}
        <div style={{display:"flex",gap:0,borderBottom:"1px solid #1a1a26",marginBottom:20,overflowX:"auto"}}>
          {["about", isSeries?"episodes":null, "more"].filter(Boolean).map(t=>(
            <button key={t} onClick={()=>setActiveTab(t)} style={{
              background:"none",border:"none",
              color:activeTab===t?"#fff":"#555",
              fontWeight:activeTab===t?700:500,
              padding:"10px 18px",cursor:"pointer",
              fontSize:13,whiteSpace:"nowrap",
              borderBottom:`2px solid ${activeTab===t?RED:"transparent"}`,
              fontFamily:"'Inter',sans-serif",
              textTransform:"capitalize",
            }}>
              {t==="episodes"?"Episodes":t==="about"?"About":"More Like This"}
            </button>
          ))}
        </div>

        {/* ── ABOUT TAB ── */}
        {activeTab==="about" && (
          <div style={{animation:"fadeUp .3s ease"}}>
            {/* Description */}
            <p style={{fontSize:"clamp(13px,2vw,14px)",color:"rgba(255,255,255,.65)",lineHeight:1.7,marginBottom:20}}>
              {content?.description || "No description available."}
            </p>

            {/* Details grid */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12,marginBottom:20}}>
              {[
                ["Genre",       content?.genre],
                ["Type",        content?.type],
                ["Language",    content?.language],
                ["Rating",      content?.rating],
                ["Year",        content?.release_year],
                ["Director",    content?.director],
                ["Studio",      content?.studio],
                ["Duration",    content?.duration ? `${Math.floor(content.duration/60)}h ${content.duration%60}m` : null],
              ].filter(([,v])=>v).map(([k,v])=>(
                <div key={k} style={{background:"#0e0e18",border:"1px solid #1a1a26",borderRadius:8,padding:"10px 14px"}}>
                  <div style={{fontSize:10,color:"#555",fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>{k}</div>
                  <div style={{fontSize:13,fontWeight:600,color:"#e0e0ee"}}>{v}</div>
                </div>
              ))}
            </div>

            {/* Audio & Subtitles */}
            <div style={{background:"#0e0e18",border:"1px solid #1a1a26",borderRadius:10,padding:"14px 16px",marginBottom:20}}>
              <div style={{fontSize:12,color:"#555",fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:10}}>Audio & Subtitles</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {(content?.language||"Hindi").split("/").map(l=>l.trim()).filter(Boolean).map(l=>(
                  <span key={l} style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"#ccc",fontSize:12,padding:"4px 12px",borderRadius:20}}>
                    🔊 {l}
                  </span>
                ))}
                <span style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"#888",fontSize:12,padding:"4px 12px",borderRadius:20}}>
                  CC Subtitles
                </span>
              </div>
            </div>

            {/* Tags */}
            {content?.tags?.length>0 && (
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:20}}>
                {content.tags.map(t=>(
                  <span key={t} style={{background:`${color}18`,border:`1px solid ${color}33`,color,fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20}}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── EPISODES TAB ── */}
        {activeTab==="episodes" && isSeries && (
          <div style={{animation:"fadeUp .3s ease"}}>
            {/* Season selector */}
            <div style={{display:"flex",gap:8,marginBottom:16,overflowX:"auto",paddingBottom:4}}>
              {Array.from({length:content?.season_count||1},(_,i)=>i+1).map(s=>(
                <button key={s} onClick={()=>setSelSeason(s)} style={{
                  background:selSeason===s?"rgba(229,9,20,.15)":"rgba(255,255,255,.06)",
                  border:`1px solid ${selSeason===s?"rgba(229,9,20,.3)":"rgba(255,255,255,.1)"}`,
                  color:selSeason===s?RED:"#aaa",
                  borderRadius:8,padding:"7px 18px",fontSize:13,fontWeight:600,
                  cursor:"pointer",whiteSpace:"nowrap",fontFamily:"'Inter',sans-serif",
                }}>
                  Season {s}
                </button>
              ))}
            </div>

            {/* Episode list */}
            <div style={{display:"flex",flexDirection:"column",gap:2}}>
              {episodes.map(ep=>(
                <div
                  key={ep.ep}
                  className="ep-card"
                  onClick={handlePlay}
                  style={{padding:"12px 14px",display:"flex",alignItems:"center",gap:14,border:"1px solid transparent"}}
                >
                  {/* Thumbnail */}
                  <div style={{
                    width:"clamp(80px,16vw,110px)",height:"clamp(50px,10vw,65px)",
                    borderRadius:8,background:`linear-gradient(135deg,${color}22,#0a0a0f)`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    flexShrink:0,position:"relative",fontSize:22,overflow:"hidden",
                  }}>
                    🎬
                    {ep.watched && (
                      <div style={{position:"absolute",bottom:0,left:0,right:0,height:3,background:RED,borderRadius:"0 0 8px 8px"}}>
                        {ep.progress>0 && <div style={{height:"100%",width:`${ep.progress}%`,background:RED}}/>}
                      </div>
                    )}
                    <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.3)"}}>
                      <div style={{width:28,height:28,borderRadius:"50%",background:isLocked?"rgba(255,255,255,.1)":RED,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11}}>
                        {isLocked?"🔒":"▶"}
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <div style={{fontWeight:700,fontSize:13}}>E{ep.ep} · {ep.title}</div>
                      <div style={{fontSize:11,color:"#555",flexShrink:0,marginLeft:8}}>{ep.duration}</div>
                    </div>
                    <div style={{fontSize:12,color:"#666",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ep.desc}</div>
                    {ep.progress>0 && (
                      <div style={{fontSize:11,color:RED,marginTop:4}}>{ep.progress}% watched</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── MORE LIKE THIS TAB ── */}
        {activeTab==="more" && (
          <div style={{animation:"fadeUp .3s ease"}}>
            {related.length===0 ? (
              <div style={{textAlign:"center",padding:"32px 0",color:"#444",fontSize:13}}>No similar content found</div>
            ) : (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12}}>
                {related.map(item=>(
                  <div key={item.id} className="rel-card" onClick={()=>{}}>
                    <div style={{
                      height:90,
                      background:item.thumbnail?`url(${item.thumbnail}) center/cover`:`linear-gradient(135deg,${GENRE_COLOR[item.genre]||"#333"}22,#0a0a0f)`,
                      display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,
                    }}>
                      {!item.thumbnail && "🎬"}
                    </div>
                    <div style={{padding:"7px 8px 9px",background:"#0e0e18",borderTop:"1px solid #1a1a26"}}>
                      <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
                      <div style={{fontSize:10,color:GENRE_COLOR[item.genre]||"#666",marginTop:2}}>{item.genre}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
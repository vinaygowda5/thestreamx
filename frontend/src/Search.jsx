import { hasPaidPlan } from "./plan.js";
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase.js";

const R = "#e50914";

export default function Search({ onNavigate, user, onClose }) {
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState([]);
  const [trending, setTrending] = useState([]);
  const [recent,   setRecent]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState("all");
  const [selected, setSelected] = useState(null);
  const inputRef = useRef(null);

  const FILTERS = [
    { id:"all",    label:"All"        },
    { id:"Movie",  label:"Movies"     },
    { id:"Web Series",label:"Series"  },
    { id:"Live",   label:"Live"       },
    { id:"Sports", label:"Sports"     },
  ];

  useEffect(() => {
    inputRef.current?.focus();
    loadTrending();
    loadRecent();
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(() => doSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query, filter]);

  async function loadTrending() {
    try {
      const { data } = await supabase
        .from("content")
        .select("id,title,type,genre,thumbnail,views,rating,is_live,is_premium,release_year")
        .eq("is_active", true)
        .order("views", { ascending: false })
        .limit(10);
      setTrending(data || []);
    } catch(e) {}
  }

  function loadRecent() {
    try {
      const saved = JSON.parse(localStorage.getItem("sx_recent_search") || "[]");
      setRecent(saved);
    } catch(e) {}
  }

  function saveRecent(q) {
    try {
      const saved = JSON.parse(localStorage.getItem("sx_recent_search") || "[]");
      const updated = [q, ...saved.filter(x => x !== q)].slice(0, 8);
      localStorage.setItem("sx_recent_search", JSON.stringify(updated));
      setRecent(updated);
    } catch(e) {}
  }

  function clearRecent() {
    localStorage.removeItem("sx_recent_search");
    setRecent([]);
  }

  async function doSearch(q) {
    setLoading(true);
    try {
      let qb = supabase
        .from("content")
        .select("id,title,type,genre,thumbnail,views,rating,is_live,is_premium,release_year,language,description,score")
        .eq("is_active", true)
        .or(`title.ilike.%${q}%,description.ilike.%${q}%,genre.ilike.%${q}%,language.ilike.%${q}%,director.ilike.%${q}%`)
        .limit(40);

      if (filter !== "all") {
        if (filter === "Live") qb = qb.eq("is_live", true);
        else if (filter === "Sports") qb = qb.eq("genre", "Sports");
        else qb = qb.eq("type", filter);
      }

      const { data } = await qb.order("views", { ascending: false });
      setResults(data || []);
      if (q.length > 1) saveRecent(q);
    } catch(e) { setResults([]); }
    setLoading(false);
  }

  function playContent(item) {
    setSelected(item);
  }

  const showResults = query.trim().length > 0;
  const showHome    = !showResults;

  // Content card
  function Card({ item, big }) {
    const isPremium = item.is_premium && !hasPaidPlan(user);
    return (
      <div
        onClick={() => playContent(item)}
        style={{ cursor:"pointer", position:"relative", borderRadius:10, overflow:"hidden", background:"#0e0e1e", border:"1px solid #1a1a2e", flexShrink:0, width:big?"100%":"clamp(130px,28vw,170px)", transition:"transform .15s" }}
        onMouseEnter={e=>e.currentTarget.style.transform="scale(1.02)"}
        onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
      >
        {/* Thumbnail */}
        <div style={{ paddingTop:big?"42%":"140%", position:"relative", background:"#0a0a14" }}>
          {item.thumbnail
            ? <img src={item.thumbnail} alt={item.title} style={{ position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover" }} onError={e=>e.target.style.display="none"}/>
            : <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:big?40:28,opacity:.3 }}>🎬</div>
          }
          {/* Overlays */}
          <div style={{ position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,.9) 0%,transparent 50%)" }}/>
          {/* Play button */}
          <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",opacity:0,transition:"opacity .2s" }} className="play-overlay">
            <div style={{ width:44,height:44,borderRadius:"50%",background:"rgba(229,9,20,.9)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18 }}>▶</div>
          </div>
          {/* Badges */}
          {item.is_live && (
            <div style={{ position:"absolute",top:8,left:8,background:R,color:"#fff",fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:3,letterSpacing:1.5 }}>● LIVE</div>
          )}
          {isPremium && (
            <div style={{ position:"absolute",top:8,right:8,background:"#f59e0b",color:"#000",fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:3 }}>👑 PRO</div>
          )}
          {item.score > 0 && (
            <div style={{ position:"absolute",bottom:8,right:8,background:"rgba(0,0,0,.8)",color:"#f59e0b",fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:4 }}>⭐ {item.score}</div>
          )}
          {/* Title on image */}
          {big && (
            <div style={{ position:"absolute",bottom:0,left:0,right:0,padding:"12px 14px" }}>
              <div style={{ fontWeight:700,fontSize:15,color:"#fff",marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{item.title}</div>
              <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                <span style={{ fontSize:10,color:"#aaa" }}>{item.type}</span>
                {item.genre && <span style={{ fontSize:10,color:"#aaa" }}>· {item.genre}</span>}
                {item.release_year && <span style={{ fontSize:10,color:"#aaa" }}>· {item.release_year}</span>}
              </div>
            </div>
          )}
        </div>
        {/* Info below — small cards only */}
        {!big && (
          <div style={{ padding:"8px 10px" }}>
            <div style={{ fontWeight:600,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3 }}>{item.title}</div>
            <div style={{ fontSize:10,color:"#666688" }}>{item.type}{item.release_year?` · ${item.release_year}`:""}</div>
          </div>
        )}
      </div>
    );
  }

  // Result row (list view)
  function ResultRow({ item }) {
    const isPremium = item.is_premium && !hasPaidPlan(user);
    return (
      <div
        onClick={() => playContent(item)}
        style={{ display:"flex",alignItems:"center",gap:14,padding:"10px 16px",cursor:"pointer",borderBottom:"1px solid #1a1a2e11",transition:"background .15s" }}
        onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.03)"}
        onMouseLeave={e=>e.currentTarget.style.background="transparent"}
      >
        {/* Thumb */}
        <div style={{ width:72,height:46,borderRadius:7,background:"#0a0a14",flexShrink:0,position:"relative",overflow:"hidden" }}>
          {item.thumbnail
            ? <img src={item.thumbnail} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} onError={e=>e.target.style.display="none"}/>
            : <div style={{ width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,opacity:.3 }}>🎬</div>
          }
          {item.is_live && <div style={{ position:"absolute",top:3,left:3,background:R,color:"#fff",fontSize:7,fontWeight:800,padding:"1px 4px",borderRadius:2,letterSpacing:1 }}>LIVE</div>}
        </div>
        {/* Info */}
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ fontWeight:600,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3 }}>{item.title}</div>
          <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
            <span style={{ fontSize:11,color:"#666688" }}>{item.type}</span>
            {item.genre && <span style={{ fontSize:11,color:"#555577" }}>· {item.genre}</span>}
            {item.language && <span style={{ fontSize:11,color:"#555577" }}>· {item.language}</span>}
            {item.release_year && <span style={{ fontSize:11,color:"#555577" }}>· {item.release_year}</span>}
          </div>
        </div>
        {/* Right side */}
        <div style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0 }}>
          {isPremium
            ? <span style={{ background:"#f59e0b22",color:"#f59e0b",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,border:"1px solid #f59e0b44" }}>👑 Premium</span>
            : <div style={{ width:32,height:32,borderRadius:"50%",background:"rgba(229,9,20,.1)",border:"1px solid rgba(229,9,20,.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13 }}>▶</div>
          }
          {item.score > 0 && <span style={{ fontSize:10,color:"#f59e0b",fontWeight:600 }}>⭐ {item.score}</span>}
        </div>
      </div>
    );
  }

  // Mini player modal
  function MiniPlayer({ item, onClose: closePlayer }) {
    const vRef   = useRef(null);
    const hlsRef = useRef(null);
    const url    = item.stream_url || item.embed_url || "";
    const isEmbed= url.includes("youtube.com/embed")||url.includes("iframe");

    useEffect(() => {
      if (!url || isEmbed) return;
      const v = vRef.current; if (!v) return;
      try {
        if (window.Hls && window.Hls.isSupported()) {
          const hls = new window.Hls();
          hlsRef.current = hls;
          hls.loadSource(url);
          hls.attachMedia(v);
          hls.on(window.Hls.Events.MANIFEST_PARSED, () => v.play().catch(()=>{}));
        } else {
          v.src = url;
          v.play().catch(()=>{});
        }
      } catch(e) {}
      return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
    }, [url]);

    return (
      <div style={{ position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,.95)",display:"flex",flexDirection:"column",fontFamily:"Inter,sans-serif" }} onClick={closePlayer}>
        <div onClick={e=>e.stopPropagation()}>
          {/* Header */}
          <div style={{ display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:"rgba(0,0,0,.5)" }}>
            <button onClick={closePlayer} style={{ background:"none",border:"none",color:"#fff",fontSize:22,cursor:"pointer",padding:4 }}>←</button>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ fontWeight:700,fontSize:15,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{item.title}</div>
              <div style={{ fontSize:11,color:"#666688" }}>{item.type} · {item.genre}</div>
            </div>
            {item.is_live && <div style={{ background:R,color:"#fff",fontSize:9,fontWeight:800,padding:"3px 8px",borderRadius:3,letterSpacing:1.5,animation:"pulse 1.5s infinite" }}>● LIVE</div>}
          </div>
          {/* Player */}
          <div style={{ width:"100%",paddingTop:"56.25%",position:"relative",background:"#000" }}>
            {url ? (
              isEmbed
                ? <iframe src={url} style={{ position:"absolute",inset:0,width:"100%",height:"100%",border:"none" }} allowFullScreen allow="autoplay"/>
                : <video ref={vRef} style={{ position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain" }} controls playsInline/>
            ) : (
              <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12 }}>
                <div style={{ fontSize:40 }}>🎬</div>
                <div style={{ color:"#666688",fontSize:13 }}>No stream URL available</div>
              </div>
            )}
          </div>
          {/* Info */}
          <div style={{ padding:"16px 16px 24px",background:"#0a0a14",maxHeight:"35vh",overflowY:"auto" }}>
            <div style={{ fontWeight:700,fontSize:18,marginBottom:8 }}>{item.title}</div>
            <div style={{ display:"flex",gap:8,marginBottom:12,flexWrap:"wrap" }}>
              {item.type && <span style={{ background:"rgba(21,101,192,.2)",color:"#60a5fa",fontSize:11,fontWeight:600,padding:"2px 9px",borderRadius:20 }}>{item.type}</span>}
              {item.genre && <span style={{ background:"rgba(255,255,255,.06)",color:"#aaa",fontSize:11,padding:"2px 9px",borderRadius:20 }}>{item.genre}</span>}
              {item.rating && <span style={{ background:"rgba(255,255,255,.06)",color:"#aaa",fontSize:11,padding:"2px 9px",borderRadius:20 }}>{item.rating}</span>}
              {item.release_year && <span style={{ background:"rgba(255,255,255,.06)",color:"#aaa",fontSize:11,padding:"2px 9px",borderRadius:20 }}>{item.release_year}</span>}
              {item.score > 0 && <span style={{ background:"rgba(245,158,11,.12)",color:"#f59e0b",fontSize:11,fontWeight:700,padding:"2px 9px",borderRadius:20 }}>⭐ {item.score}/10</span>}
            </div>
            {item.description && <div style={{ fontSize:13,color:"#888",lineHeight:1.7 }}>{item.description}</div>}
            <button
              onClick={()=>{ closePlayer(); onNavigate && onNavigate("home"); }}
              style={{ width:"100%",background:R,color:"#fff",border:"none",borderRadius:10,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif",marginTop:16 }}
            >
              ▶ Open Full Player
            </button>
          </div>
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, minHeight:"100vh",background:"#07070c",fontFamily:"Inter,sans-serif",paddingBottom:80, overflowY:"auto" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .card-hover:hover .play-overlay{opacity:1!important;}
        input{-webkit-appearance:none;}
        input:focus{outline:none;}
      `}</style>

      {/* Mini player */}
      {selected && <MiniPlayer item={selected} onClose={()=>setSelected(null)}/>}

      {/* Search bar */}
      <div style={{ position:"sticky",top:0,zIndex:100,background:"rgba(7,7,12,.97)",backdropFilter:"blur(16px)",borderBottom:"1px solid #1a1a2e",padding:"12px 16px" }}>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <button onClick={onClose||(() => onNavigate("home"))} style={{ background:"none",border:"none",color:"#aaa",fontSize:22,cursor:"pointer",padding:"2px 6px",flexShrink:0 }}>←</button>
          <div style={{ flex:1,position:"relative" }}>
            <span style={{ position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:16,color:"#444466",pointerEvents:"none" }}>🔍</span>
            <input
              ref={inputRef}
              value={query}
              onChange={e=>setQuery(e.target.value)}
              placeholder="Search movies, series, live..."
              style={{ width:"100%",background:"#111120",border:"1.5px solid #1a1a2e",borderRadius:25,color:"#e2e2f0",fontSize:14,padding:"11px 40px 11px 40px",fontFamily:"Inter,sans-serif",transition:"border-color .2s" }}
              onFocus={e=>e.target.style.borderColor=R}
              onBlur={e=>e.target.style.borderColor="#1a1a2e"}
              autoComplete="off"
            />
            {query && (
              <button onClick={()=>{setQuery("");setResults([]);}} style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#555",fontSize:16,cursor:"pointer",padding:2 }}>✕</button>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        {showResults && (
          <div style={{ display:"flex",gap:6,marginTop:10,overflowX:"auto",paddingBottom:2 }}>
            {FILTERS.map(f=>(
              <button key={f.id} onClick={()=>setFilter(f.id)} style={{ background:filter===f.id?"rgba(229,9,20,.18)":"rgba(255,255,255,.05)",border:`1px solid ${filter===f.id?"rgba(229,9,20,.4)":"#1a1a2e"}`,color:filter===f.id?R:"#666688",borderRadius:20,padding:"5px 14px",fontSize:12,fontWeight:filter===f.id?700:500,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"Inter,sans-serif" }}>
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding:"0 0 20px" }}>

        {/* ── SEARCH RESULTS ── */}
        {showResults && (
          <div style={{ animation:"fadeIn .25s ease" }}>
            {loading ? (
              <div style={{ display:"flex",alignItems:"center",justifyContent:"center",padding:"48px 0",gap:12 }}>
                <div style={{ width:22,height:22,border:"2px solid #1a1a2e",borderTop:`2px solid ${R}`,borderRadius:"50%",animation:"spin .7s linear infinite" }}/>
                <span style={{ color:"#444466",fontSize:13 }}>Searching...</span>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            ) : results.length === 0 ? (
              <div style={{ textAlign:"center",padding:"56px 24px",animation:"fadeIn .3s ease" }}>
                <div style={{ fontSize:52,marginBottom:14,opacity:.3 }}>🔍</div>
                <div style={{ fontSize:16,fontWeight:600,color:"#e2e2f0",marginBottom:8 }}>No results for "{query}"</div>
                <div style={{ fontSize:13,color:"#444466",lineHeight:1.6 }}>
                  Try different keywords<br/>or check spelling
                </div>
              </div>
            ) : (
              <div>
                <div style={{ padding:"12px 16px",fontSize:12,color:"#444466",fontWeight:600 }}>
                  {results.length} result{results.length!==1?"s":""} for "{query}"
                </div>
                <div className="card" style={{ margin:"0 16px 16px",borderRadius:12,overflow:"hidden" }}>
                  {results.map(item => <ResultRow key={item.id} item={item}/>)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── HOME STATE ── */}
        {showHome && (
          <div style={{ animation:"fadeIn .3s ease" }}>

            {/* Recent searches */}
            {recent.length > 0 && (
              <div style={{ padding:"16px 16px 0" }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
                  <div style={{ fontSize:13,fontWeight:700,color:"#aaa" }}>Recent Searches</div>
                  <button onClick={clearRecent} style={{ background:"none",border:"none",color:"#555",fontSize:12,cursor:"pointer",fontFamily:"Inter,sans-serif" }}>Clear</button>
                </div>
                <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                  {recent.map(r=>(
                    <button key={r} onClick={()=>setQuery(r)} style={{ background:"rgba(255,255,255,.06)",border:"1px solid #1a1a2e",color:"#aaa",borderRadius:20,padding:"6px 14px",fontSize:12,cursor:"pointer",fontFamily:"Inter,sans-serif",display:"flex",alignItems:"center",gap:6 }}>
                      🕐 {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

                {/* Rest — horizontal scroll */}
                <div style={{ overflowX:"auto",paddingLeft:16,paddingRight:16,display:"flex",gap:10 }}>
                  {trending.slice(1).map((item,i)=>(
                    <div key={item.id} onClick={()=>playContent(item)} style={{ flexShrink:0,width:"clamp(120px,25vw,160px)",cursor:"pointer",position:"relative" }}>
                      <div style={{ paddingTop:"140%",borderRadius:9,overflow:"hidden",background:"#0e0e1e",border:"1px solid #1a1a2e",position:"relative" }}>
                        {item.thumbnail
                          ? <img src={item.thumbnail} alt="" style={{ position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover" }} onError={e=>e.target.style.display="none"}/>
                          : <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,opacity:.2 }}>🎬</div>
                        }
                        <div style={{ position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,.85) 0%,transparent 55%)" }}/>
                        <div style={{ position:"absolute",top:6,left:6,background:"rgba(0,0,0,.7)",color:"#f59e0b",fontSize:10,fontWeight:800,padding:"2px 7px",borderRadius:4 }}>#{i+2}</div>
                        {item.is_live && <div style={{ position:"absolute",top:6,right:6,background:R,color:"#fff",fontSize:7,fontWeight:800,padding:"1px 5px",borderRadius:2,letterSpacing:1 }}>LIVE</div>}
                        <div style={{ position:"absolute",bottom:0,left:0,right:0,padding:"8px" }}>
                          <div style={{ fontSize:11,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{item.title}</div>
                          <div style={{ fontSize:9,color:"#888",marginTop:2 }}>{item.type}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Browse by genre */}
            <div style={{ padding:"24px 16px 0" }}>
              <div style={{ fontSize:14,fontWeight:800,marginBottom:14,color:"#e2e2f0" }}>Browse by Genre</div>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10 }}>
                {[
                  {label:"Action",     icon:"💥", color:"#e50914"},
                  {label:"Drama",      icon:"🎭", color:"#8b5cf6"},
                  {label:"Comedy",     icon:"😂", color:"#f59e0b"},
                  {label:"Thriller",   icon:"😱", color:"#1565c0"},
                  {label:"Romance",    icon:"❤️", color:"#ec4899"},
                  {label:"Sci-Fi",     icon:"🚀", color:"#06b6d4"},
                  {label:"Kids",       icon:"🧒", color:"#84cc16"},
                  {label:"Cricket",    icon:"🏏", color:"#00c853"},
                  {label:"Football",   icon:"⚽", color:"#f97316"},
                  {label:"News",       icon:"📰", color:"#64748b"},
                  {label:"Horror",     icon:"👻", color:"#7c3aed"},
                  {label:"Nature",     icon:"🌿", color:"#16a34a"},
                ].map(g=>(
                  <button key={g.label} onClick={()=>{setQuery(g.label);setFilter("all");}} style={{ background:`${g.color}18`,border:`1px solid ${g.color}33`,borderRadius:10,padding:"14px 12px",cursor:"pointer",textAlign:"left",transition:"all .15s",fontFamily:"Inter,sans-serif" }}
                    onMouseEnter={e=>{e.currentTarget.style.background=`${g.color}28`;e.currentTarget.style.borderColor=`${g.color}66`;}}
                    onMouseLeave={e=>{e.currentTarget.style.background=`${g.color}18`;e.currentTarget.style.borderColor=`${g.color}33`;}}
                  >
                    <div style={{ fontSize:22,marginBottom:5 }}>{g.icon}</div>
                    <div style={{ fontSize:12,fontWeight:700,color:"#e2e2f0" }}>{g.label}</div>
                  </button>
                ))}
              </div>
            </div>

          </div>
      </div>
  );
}
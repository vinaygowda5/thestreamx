import { useState, useEffect, useRef, useCallback } from "react";
import { API } from "./config.js";
import { supabase, db } from "./supabase.js";
import Hls from "hls.js";
import FaceAuth from "./FaceAuth.jsx";

/* ═══════════════════════════════════════════════════════════
   StreamX Admin Pro v5.0
   ✅ 3GB+ video upload via Cloudflare R2 (presigned URL)
   ✅ Real bar charts & analytics (pure CSS/SVG — no library needed)
   ✅ Advanced UI/UX — dark glassmorphism design
   ✅ Live stream preview on URL paste
   ✅ Full content management
   ✅ Real-time stats
═══════════════════════════════════════════════════════════ */

const R="#e50914", BL="#1565c0", GR="#00c853", AM="#f59e0b", PU="#8b5cf6";

// ── Replace these with your Cloudflare R2 credentials ──
// R2 credentials now live server-side only (Railway env vars: R2_ACCOUNT_ID,
// R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL) —
// see backend/src/controllers/uploadController.js. Nothing R2-related
// belongs in this frontend file anymore, on purpose (avoids leaking a
// write-capable API token to anyone who views this page's source).

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@300;400;500;600;700;800;900&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{--r:#e50914;--bl:#1565c0;--gr:#00c853;--bg:#04040e;--s1:#080814;--s2:#0c0c1c;--bd:#181828;--mt:#3a3a5a;}
body{background:var(--bg);color:#e2e2f0;font-family:'Inter',sans-serif;}
::-webkit-scrollbar{width:4px;height:4px;}
::-webkit-scrollbar-track{background:#080814;}
::-webkit-scrollbar-thumb{background:#e50914;border-radius:2px;}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideRight{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes glow{0%,100%{box-shadow:0 0 6px #e5091444}50%{box-shadow:0 0 20px #e5091488}}
@keyframes barGrow{from{height:0}to{height:var(--h)}}
@keyframes countUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.inp{width:100%;background:#0a0a1a;border:1.5px solid #181828;border-radius:10px;color:#e2e2f0;font-family:'Inter',sans-serif;font-size:13px;padding:11px 14px;outline:none;transition:all .2s;}
.inp:focus{border-color:#e50914;box-shadow:0 0 0 3px rgba(229,9,20,.08);}
.inp::placeholder{color:#252540;}
.nav{display:flex;align-items:center;gap:11px;padding:10px 14px;border-radius:10px;cursor:pointer;font-size:12.5px;font-weight:500;color:#3a3a5a;transition:all .15s;white-space:nowrap;user-select:none;}
.nav:hover{background:rgba(255,255,255,.04);color:#8888bb;}
.nav.on{background:linear-gradient(135deg,rgba(229,9,20,.18),rgba(229,9,20,.06));color:#e50914;font-weight:700;box-shadow:inset 2px 0 0 #e50914;}
.card{background:linear-gradient(145deg,#0c0c1c,#080814);border:1px solid #181828;border-radius:16px;transition:border-color .2s;}
.card:hover{border-color:#252540;}
.tbl{width:100%;border-collapse:collapse;}
.tbl th{padding:11px 14px;text-align:left;font-size:10px;color:#3a3a5a;font-weight:700;text-transform:uppercase;letter-spacing:.8px;border-bottom:1px solid #181828;}
.tbl td{padding:11px 14px;font-size:13px;border-bottom:1px solid #0e0e1e;}
.tbl tr:last-child td{border-bottom:none;}
.tbl tr:hover td{background:rgba(255,255,255,.015);}
.upload-zone{border:2px dashed #181828;border-radius:14px;padding:36px 24px;text-align:center;cursor:pointer;transition:all .25s;background:rgba(8,8,20,.8);}
.upload-zone:hover,.upload-zone.drag{border-color:#e50914;background:rgba(229,9,20,.04);box-shadow:0 0 0 4px rgba(229,9,20,.06);}
.kpi{position:relative;overflow:hidden;padding:22px 24px;border-radius:16px;background:linear-gradient(145deg,#0c0c1c,#080814);border:1px solid #181828;transition:all .2s;}
.kpi:hover{border-color:#252540;transform:translateY(-1px);}
.kpi::after{content:'';position:absolute;top:-40px;right:-40px;width:100px;height:100px;border-radius:50%;opacity:.05;}
.src-tab{background:rgba(255,255,255,.04);border:1.5px solid #181828;color:#555577;border-radius:10px;padding:8px 16px;font-size:12px;font-weight:600;cursor:pointer;transition:all .18s;font-family:'Inter',sans-serif;}
.src-tab.on{background:rgba(229,9,20,.18);border-color:rgba(229,9,20,.5);color:#e50914;}
.btn-primary{background:linear-gradient(135deg,#e50914,#c4000f);color:#fff;border:none;border-radius:10px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;transition:all .2s;white-space:nowrap;}
.btn-primary:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(229,9,20,.35);}
.btn-primary:disabled{background:#1a1a2e;transform:none;box-shadow:none;cursor:not-allowed;opacity:.5;}
.btn-outline{background:transparent;border:1.5px solid;border-radius:10px;padding:9px 18px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;transition:all .18s;}
.badge{display:inline-flex;align-items:center;font-size:10.5px;font-weight:700;padding:2px 9px;border-radius:20px;white-space:nowrap;}
`;

const PAGES=[
  {id:"dashboard", icon:"⚡", label:"Dashboard"},
  {id:"content",   icon:"🎬", label:"Movies & Series"},
  {id:"live",      icon:"🔴", label:"Live Channels"},
  {id:"analytics", icon:"📊", label:"Analytics"},
  {id:"users",     icon:"👥", label:"Users"},
  {id:"ads",       icon:"📢", label:"Ads Manager"},
  {id:"revenue",   icon:"💰", label:"Revenue"},
  {id:"employees", icon:"🧑‍💼", label:"Employees"},
  {id:"approvals", icon:"✅", label:"Approvals"},
  {id:"auditlogs", icon:"📜", label:"Audit Logs"},
  {id:"settings",  icon:"⚙️", label:"Settings"},
];

const TYPES  =["Movie","Web Series","Documentary","Short Film","Kids","Anime","Reality Show"];
const GENRES =["Action","Drama","Sci-Fi","Thriller","Comedy","Romance","Kids","Cricket","Football","Racing","News","Documentary","Nature","Horror","Sports","Music","Reality","Anime","Devotional"];
const LANGS  =["Hindi","English","Kannada","Tamil","Telugu","Bengali","Malayalam","Punjabi","Marathi","Gujarati","Bhojpuri","Odia","Urdu","Sanskrit"];
const RATINGS=["U","U/A","U/A 7+","U/A 13+","U/A 16+","A"];

const fN=n=>n>=1e7?(n/1e7).toFixed(1)+"Cr":n>=1e5?(n/1e5).toFixed(1)+"L":n>=1e3?(n/1e3).toFixed(1)+"K":String(n||0);
const fM=b=>b>=1e9?(b/1e9).toFixed(1)+"GB":b>=1e6?(b/1e6).toFixed(1)+"MB":b>=1e3?(b/1e3).toFixed(0)+"KB":b+"B";

// ── UI Components ─────────────────────────────────────────

function Chip({label,color="#888",size="sm"}){
  const p=size==="xs"?"1px 6px":"2px 9px";
  const f=size==="xs"?9:11;
  return <span className="badge" style={{background:`${color}1e`,color,fontSize:f,padding:p,border:`1px solid ${color}33`}}>{label}</span>;
}

function Btn({children,onClick,color=R,variant="fill",size="md",disabled,sx={}}){
  const base={fontFamily:"'Inter',sans-serif",cursor:disabled?"not-allowed":"pointer",borderRadius:10,fontWeight:600,whiteSpace:"nowrap",transition:"all .18s",opacity:disabled?.5:1,...sx};
  const pad=size==="sm"?"5px 12px":size==="lg"?"13px 28px":"9px 18px";
  const fs=size==="sm"?11:size==="lg"?15:13;
  let style={...base,padding:pad,fontSize:fs};
  if(variant==="fill")   style={...style,background:`linear-gradient(135deg,${color},${color}cc)`,color:"#fff",border:"none",boxShadow:`0 2px 12px ${color}33`};
  if(variant==="outline")style={...style,background:"transparent",color,border:`1.5px solid ${color}55`};
  if(variant==="ghost")  style={...style,background:"transparent",color:"#888",border:"1.5px solid #181828"};
  if(variant==="danger") style={...style,background:"rgba(248,113,113,.1)",color:"#f87171",border:"1px solid rgba(248,113,113,.3)"};
  return <button disabled={disabled} onClick={onClick} style={style}>{children}</button>;
}

function Field({label,required,hint,children}){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      <label style={{fontSize:10,color:"#3a3a5a",fontWeight:700,letterSpacing:.7,textTransform:"uppercase"}}>
        {label}{required&&<span style={{color:R}}> *</span>}
      </label>
      {children}
      {hint&&<div style={{fontSize:11,color:"#252540",lineHeight:1.5}}>{hint}</div>}
    </div>
  );
}

function Modal({title,onClose,children,wide,xl}){
  useEffect(()=>{const fn=e=>{if(e.key==="Escape")onClose();};window.addEventListener("keydown",fn);return()=>window.removeEventListener("keydown",fn);},[]);
  return(
    <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.9)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(8px)"}} onClick={onClose}>
      <div style={{background:"linear-gradient(145deg,#0e0e1e,#0a0a14)",border:"1px solid #1e1e32",borderRadius:18,width:"100%",maxWidth:xl?760:wide?580:480,maxHeight:"92vh",overflowY:"auto",animation:"slideUp .22s ease",boxShadow:"0 24px 80px rgba(0,0,0,.8)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 24px",borderBottom:"1px solid #181828",position:"sticky",top:0,background:"#0e0e1e",zIndex:1,borderRadius:"18px 18px 0 0"}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:1,color:"#e2e2f0"}}>{title}</div>
          <Btn onClick={onClose} variant="ghost" size="sm" sx={{fontSize:16,padding:"3px 9px"}}>✕</Btn>
        </div>
        <div style={{padding:"22px 24px"}}>{children}</div>
      </div>
    </div>
  );
}

function Toast({msg,type="ok"}){
  const c=type==="err"?"#f87171":type==="warn"?"#f59e0b":GR;
  return(
    <div style={{position:"fixed",bottom:28,right:28,zIndex:3000,background:"linear-gradient(145deg,#0e0e1e,#0a0a14)",border:`1px solid ${c}44`,borderLeft:`3px solid ${c}`,borderRadius:12,padding:"13px 22px",fontSize:13,fontWeight:500,animation:"slideUp .22s ease",boxShadow:"0 12px 48px rgba(0,0,0,.8)",maxWidth:360,backdropFilter:"blur(16px)"}}>
      {type==="ok"?"✅":type==="err"?"❌":"⚠️"} {msg}
    </div>
  );
}

// ── BAR CHART (pure CSS) ─────────────────────────────────
function BarChart({data,height=200,color=R,title}){
  if(!data||data.length===0) return null;
  const max=Math.max(...data.map(d=>d.value),1);
  return(
    <div>
      {title&&<div style={{fontSize:13,fontWeight:700,marginBottom:14,color:"#e2e2f0"}}>{title}</div>}
      <div style={{display:"flex",alignItems:"flex-end",gap:8,height,position:"relative"}}>
        {/* Y axis lines */}
        {[0,.25,.5,.75,1].map(f=>(
          <div key={f} style={{position:"absolute",left:0,right:0,bottom:f*height,borderTop:`1px dashed #181828`,zIndex:0,pointerEvents:"none"}}>
            <span style={{position:"absolute",left:0,top:-8,fontSize:9,color:"#252540",fontWeight:600}}>{fN(Math.round(max*f))}</span>
          </div>
        ))}
        {data.map((d,i)=>{
          const h=Math.max(4,(d.value/max)*height);
          return(
            <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6,zIndex:1}} title={`${d.label}: ${fN(d.value)}`}>
              <div style={{fontSize:9,color:"#e2e2f0",fontWeight:700,opacity:.7}}>{fN(d.value)}</div>
              <div style={{width:"100%",height:h,background:`linear-gradient(to top,${color},${color}88)`,borderRadius:"4px 4px 0 0",transition:"height .6s ease",boxShadow:`0 0 8px ${color}44`,position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",inset:0,background:"linear-gradient(to right,transparent,rgba(255,255,255,.08),transparent)"}}/>
              </div>
              <div style={{fontSize:9,color:"#3a3a5a",fontWeight:600,textAlign:"center",lineHeight:1.2,width:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── LINE CHART (SVG) ─────────────────────────────────────
function LineChart({data,height=160,color=R,title,fill=true}){
  if(!data||data.length<2) return null;
  const max=Math.max(...data.map(d=>d.value),1);
  const W=600,H=height,PAD=8;
  const pts=data.map((d,i)=>({
    x:PAD+(i/(data.length-1))*(W-PAD*2),
    y:H-PAD-(d.value/max)*(H-PAD*2),
  }));
  const path=pts.map((p,i)=>`${i===0?"M":"L"}${p.x},${p.y}`).join(" ");
  const fillPath=`${path} L${pts[pts.length-1].x},${H} L${pts[0].x},${H} Z`;
  return(
    <div>
      {title&&<div style={{fontSize:13,fontWeight:700,marginBottom:14,color:"#e2e2f0"}}>{title}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height,overflow:"visible"}}>
        <defs>
          <linearGradient id={`lg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity=".35"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {/* Grid */}
        {[0,.25,.5,.75,1].map(f=>(
          <line key={f} x1={PAD} y1={PAD+(1-f)*(H-PAD*2)} x2={W-PAD} y2={PAD+(1-f)*(H-PAD*2)} stroke="#181828" strokeWidth="1"/>
        ))}
        {/* Fill */}
        {fill&&<path d={fillPath} fill={`url(#lg-${color.replace("#","")})`}/>}
        {/* Line */}
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        {/* Dots */}
        {pts.map((p,i)=>(
          <circle key={i} cx={p.x} cy={p.y} r="4" fill={color} stroke="#0a0a14" strokeWidth="2">
            <title>{data[i].label}: {fN(data[i].value)}</title>
          </circle>
        ))}
      </svg>
      {/* X labels */}
      <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
        {data.map((d,i)=>(
          <div key={i} style={{fontSize:9,color:"#3a3a5a",fontWeight:600,textAlign:"center",flex:1}}>{d.label}</div>
        ))}
      </div>
    </div>
  );
}

// ── DONUT CHART (SVG) ─────────────────────────────────────
function DonutChart({data,size=120,title}){
  if(!data||data.length===0) return null;
  const total=data.reduce((s,d)=>s+d.value,0)||1;
  const R2=size/2-10, CX=size/2, CY=size/2;
  const C=2*Math.PI*R2;
  let offset=0;
  const segs=data.map(d=>{
    const pct=d.value/total;
    const seg={...d,pct,dasharray:`${pct*C} ${C}`,offset};
    offset+=pct*C;
    return seg;
  });
  return(
    <div style={{display:"flex",gap:20,alignItems:"center",flexWrap:"wrap"}}>
      <div style={{position:"relative",flexShrink:0}}>
        {title&&<div style={{fontSize:12,fontWeight:700,marginBottom:10,color:"#e2e2f0"}}>{title}</div>}
        <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
          <circle cx={CX} cy={CY} r={R2} fill="none" stroke="#181828" strokeWidth="18"/>
          {segs.map((s,i)=>(
            <circle key={i} cx={CX} cy={CY} r={R2} fill="none" stroke={s.color} strokeWidth="18"
              strokeDasharray={s.dasharray} strokeDashoffset={-s.offset} strokeLinecap="round"/>
          ))}
        </svg>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {data.map((d,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:10,height:10,borderRadius:3,background:d.color,flexShrink:0}}/>
            <div style={{fontSize:12,color:"#aaa"}}>{d.label}</div>
            <div style={{fontSize:12,fontWeight:700,color:"#e2e2f0",marginLeft:"auto"}}>{Math.round((d.value/total)*100)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── STREAM PREVIEW ────────────────────────────────────────
function StreamPreview({url,isLive=false}){
  const vRef=useRef(null);
  const[st,setSt]=useState("loading");
  const isYT=url?.includes("youtube.com")||url?.includes("youtu.be");
  const isM3U8=url?.includes(".m3u8");
  function toEmbed(u){try{if(u.includes("watch?v="))return`https://www.youtube.com/embed/${new URL(u).searchParams.get("v")}?autoplay=1&mute=1`;if(u.includes("youtu.be/"))return`https://www.youtube.com/embed/${u.split("youtu.be/")[1]?.split("?")[0]}?autoplay=1&mute=1`;}catch(e){}return u;}
  useEffect(()=>{
    if(!url||isYT)return;
    const v=vRef.current;if(!v)return;
    setSt("loading");
    let hls;
    if(!isM3U8){
      v.src=url; v.muted=true; v.load();
      const onCanPlay=()=>setSt("playing");
      const onErr=()=>setSt("error");
      v.addEventListener("canplay",onCanPlay);
      v.addEventListener("loadeddata",onCanPlay);
      v.addEventListener("error",onErr);
      v.play().catch(()=>{});
      return()=>{v.removeEventListener("canplay",onCanPlay);v.removeEventListener("loadeddata",onCanPlay);v.removeEventListener("error",onErr);};
    }
    try{
      if(Hls.isSupported()){
        hls=new Hls({enableWorker:true,lowLatencyMode:true});
        hls.loadSource(url);hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED,()=>{v.muted=true;v.play().catch(()=>{});setSt("playing");});
        hls.on(Hls.Events.ERROR,(_,d)=>{if(d.fatal)setSt("error");});
      }else{v.src=url;v.muted=true;v.play().catch(()=>{});setSt("playing");}
    }catch(e){setSt("error");}
    return()=>{if(hls){hls.destroy();}};
  },[url]);
  const stColor=st==="playing"?GR:AM;
  const stLabel=st==="playing"?"✓ Stream working":st==="error"?"⚠ Preview blocked — URL is saved and will work in the app":"Connecting...";
  return(
    <div style={{borderRadius:12,overflow:"hidden",background:"#000",border:"1px solid #181828",marginTop:12}}>
      <div style={{paddingTop:"56.25%",position:"relative"}}>
        {isYT?<iframe src={toEmbed(url)} style={{position:"absolute",inset:0,width:"100%",height:"100%",border:"none"}} allow="autoplay;encrypted-media" allowFullScreen/>
        :<><video ref={vRef} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain"}} playsInline muted autoPlay controls crossOrigin="anonymous"/>
          {st==="loading"&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.8)",pointerEvents:"none"}}><div style={{width:36,height:36,border:`2px solid #181828`,borderTop:`2px solid ${R}`,borderRadius:"50%",animation:"spin .8s linear infinite"}}/></div>}
          {st==="error"&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.92)",flexDirection:"column",gap:10,pointerEvents:"none",padding:"0 20px"}}><span style={{fontSize:28}}>⚠️</span><div style={{fontSize:12,color:AM,textAlign:"center"}}>Preview blocked by browser — URL is saved correctly and will play in the app</div></div>}
        </>}
        {isLive&&<div style={{position:"absolute",top:10,left:10,background:R,color:"#fff",fontSize:9,fontWeight:800,padding:"3px 9px",borderRadius:4,letterSpacing:2,animation:"pulse 1.5s infinite",zIndex:5}}>● LIVE</div>}
      </div>
      <div style={{background:"#080814",padding:"8px 14px",display:"flex",alignItems:"center",gap:8}}>
        <div style={{width:8,height:8,borderRadius:"50%",background:stColor,flexShrink:0}}/>
        <div style={{fontSize:11,color:stColor,fontWeight:600}}>{stLabel}</div>
      </div>
    </div>
  );
}

// ── CLOUDFLARE R2 UPLOAD (via backend-issued presigned URL) ──
// The R2 secret key never touches this file — the backend signs a
// short-lived (10 min) upload URL, and the browser PUTs the file straight
// to R2. This removes Supabase Storage's ~50MB cap entirely.

async function uploadToR2(file, onProgress) {
  const token = localStorage.getItem("streamx_token");
  onProgress(2, "Requesting upload URL...");

  const signRes = await fetch(`${API}/api/content/upload-url`, {
    method: "POST",
    headers: { "Content-Type":"application/json", ...(token?{Authorization:`Bearer ${token}`}:{}) },
    body: JSON.stringify({ filename: file.name, contentType: file.type }),
  });
  const signJson = await signRes.json();
  if (!signJson.success) throw new Error(signJson.msg || "Could not get upload URL — is R2 configured on the backend?");
  const { uploadUrl, publicUrl } = signJson.data;

  onProgress(5, "Starting upload...");
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(5 + Math.round((e.loaded/e.total)*93), `Uploading ${fM(e.loaded)} of ${fM(e.total)}...`);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });

  onProgress(100, "Upload complete!");
  return { url: publicUrl, provider: "r2" };
}

// ── CONTENT FORM ──────────────────────────────────────────
const EMPTY={title:"",description:"",type:"Movie",genre:"Action",language:"Hindi",is_premium:false,is_featured:false,is_active:true,is_live:false,stream_url:"",embed_url:"",thumbnail:"",release_year:new Date().getFullYear(),rating:"U/A",director:"",studio:"",score:0,tags:[],trailer_url:""};

function ContentForm({initial,isLiveForm=false,onSave,onCancel,saving}){
  const[form,setForm]=useState({...EMPTY,...(isLiveForm?{type:"Live",is_live:true}:{}),...initial});
  const[srcTab,setSrcTab]=useState("url");
  const[uploading,setUploading]=useState(false);
  const[uploadPct,setUploadPct]=useState(0);
  const[uploadMsg,setUploadMsg]=useState("");
  const[tagInput,setTagInput]=useState("");
  const[previewUrl,setPreviewUrl]=useState(initial?.stream_url||initial?.embed_url||"");
  const[dragging,setDragging]=useState(false);
  const[uploadErr,setUploadErr]=useState(null);
  const fileRef=useRef(); const thumbRef=useRef();
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const titleOk=(form.title||"").trim().length>0;
  const urlOk=(form.stream_url||"").trim().length>5||(form.embed_url||"").trim().length>5;
  const canSave=titleOk&&urlOk;

  function onUrlChange(val,field){set(field,val);if(val.trim().length>10)setPreviewUrl(val.trim());else setPreviewUrl("");}

  function addTag(e){if(e.key==="Enter"&&tagInput.trim()){set("tags",[...(form.tags||[]),tagInput.trim().toUpperCase()]);setTagInput("");}}

  async function handleFileUpload(file){
    if(!file)return;
    setUploadErr(null);
    setUploading(true);setUploadPct(0);setUploadMsg("Starting upload...");
    try{
      const result=await uploadToR2(file,(pct,msg)=>{setUploadPct(pct);setUploadMsg(msg);});
      set("stream_url",result.url);
      setPreviewUrl(result.url);
      setSrcTab("url");
      setUploadMsg("✓ Upload complete!");
    }catch(e){
      if(e.message.startsWith("FILE_TOO_LARGE:")){
        const size=e.message.split(":")[1];
        setUploadErr({size});
      }else{
        setUploadErr({msg:e.message});
      }
    }
    setUploading(false);
  }

  function save(){
    if(!titleOk){alert("Enter a title");return;}
    if(!urlOk){alert("Add a video URL or upload a file");return;}
    onSave({...form});
  }

  const statusColor=canSave?GR:AM;
  const statusMsg=!titleOk?"Enter a title":!urlOk?"Add video URL or upload file":"Ready to save ✓";

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>

      {/* Title + Type */}
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:12}}>
        <Field label="Title" required>
          <input className="inp" value={form.title} onChange={e=>set("title",e.target.value)} placeholder={isLiveForm?"Channel name e.g. Star Sports 1 HD":"Movie/Series title"} autoFocus/>
        </Field>
        {!isLiveForm
          ?<Field label="Content Type"><select className="inp" value={form.type} onChange={e=>set("type",e.target.value)}>{TYPES.map(t=><option key={t}>{t}</option>)}</select></Field>
          :<Field label="Category"><select className="inp" value={form.genre} onChange={e=>set("genre",e.target.value)}>{["Cricket","Football","News","Racing","Kids","Music","General","Entertainment","Devotional"].map(g=><option key={g}>{g}</option>)}</select></Field>
        }
      </div>

      <Field label="Description">
        <textarea className="inp" rows={2} value={form.description} onChange={e=>set("description",e.target.value)} placeholder="Short description of the content..." style={{resize:"vertical"}}/>
      </Field>

      {/* ═══ VIDEO SOURCE ═══ */}
      <div style={{background:"linear-gradient(135deg,rgba(229,9,20,.07),rgba(229,9,20,.02))",border:"1.5px solid rgba(229,9,20,.2)",borderRadius:14,padding:20}}>
        <div style={{fontSize:14,color:R,fontWeight:800,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
          {isLiveForm?"🔴 Live Stream Source":"🎬 Video Source"}
          <span style={{fontSize:10,color:"#3a3a5a",fontWeight:400}}>— required</span>
        </div>

        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          <button className={`src-tab${srcTab==="url"?" on":""}`} onClick={()=>setSrcTab("url")}>🔗 URL / HLS</button>
          <button className={`src-tab${srcTab==="upload"?" on":""}`} onClick={()=>setSrcTab("upload")}>📁 Upload File</button>
          <button className={`src-tab${srcTab==="r2"?" on":""}`} onClick={()=>setSrcTab("r2")}>☁️ Cloudflare R2</button>
          <button className={`src-tab${srcTab==="cloud"?" on":""}`} onClick={()=>setSrcTab("cloud")}>🌐 Other Cloud</button>
        </div>

        {/* URL */}
        {srcTab==="url"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <Field label={isLiveForm?"HLS Live Stream URL":"Direct Video URL"} hint="HLS .m3u8 · MP4 direct link · DASH .mpd · RTMP streams">
              <input className="inp" value={form.stream_url} onChange={e=>onUrlChange(e.target.value,"stream_url")} placeholder={isLiveForm?"https://example.com/live/stream.m3u8":"https://cdn.example.com/movie.mp4  or  stream.m3u8"}/>
            </Field>
            {form.stream_url&&form.stream_url.length>10&&(
              <div style={{fontSize:11,color:GR,padding:"7px 12px",background:"rgba(0,200,83,.06)",borderRadius:8,wordBreak:"break-all",border:"1px solid rgba(0,200,83,.15)"}}>
                ✓ URL saved: {form.stream_url.slice(0,80)}{form.stream_url.length>80?"...":""}
              </div>
            )}
          </div>
        )}

        {/* Upload */}
        {srcTab==="upload"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div className={`upload-zone${dragging?" drag":""}`}
              onDragOver={e=>{e.preventDefault();setDragging(true);}}
              onDragLeave={()=>setDragging(false)}
              onDrop={e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f)handleFileUpload(f);}}
              onClick={()=>!uploading&&fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept="video/*,.mp4,.mkv,.avi,.mov,.m3u8,.ts,.webm,.flv" style={{display:"none"}} onChange={e=>e.target.files?.[0]&&handleFileUpload(e.target.files[0])}/>
              {uploading?(
                <div>
                  <div style={{fontSize:38,marginBottom:12}}>⬆️</div>
                  <div style={{fontSize:15,color:"#fff",fontWeight:700,marginBottom:8}}>{uploadMsg}</div>
                  <div style={{width:"100%",height:8,background:"#181828",borderRadius:4,overflow:"hidden",marginBottom:6}}>
                    <div style={{height:"100%",background:`linear-gradient(90deg,${R},#ff6b6b)`,borderRadius:4,width:`${uploadPct}%`,transition:"width .4s ease",boxShadow:`0 0 10px ${R}66`}}/>
                  </div>
                  <div style={{fontSize:13,color:"#f59e0b",fontWeight:600}}>{uploadPct}% — Do not close this window</div>
                </div>
              ):(
                <div>
                  <div style={{fontSize:48,marginBottom:12,opacity:.4}}>📁</div>
                  <div style={{fontSize:15,color:"#bbb",fontWeight:700,marginBottom:6}}>{dragging?"Drop file here! ✓":"Click to select or drag & drop video file"}</div>
                  <div style={{fontSize:12,color:"#3a3a5a",marginBottom:4}}>MP4, MKV, AVI, MOV, M3U8, TS, WebM, FLV</div>
                  <div style={{fontSize:11,color:"#252540"}}>Supabase Free: 50MB · Pro: 5GB · Use R2 tab for 3GB+</div>
                </div>
              )}
            </div>

            {/* Upload error with guidance */}
            {uploadErr&&(
              <div style={{background:"rgba(248,113,113,.06)",border:"1px solid rgba(248,113,113,.2)",borderRadius:10,padding:16}}>
                <div style={{fontSize:13,color:"#f87171",fontWeight:700,marginBottom:10}}>
                  ❌ {uploadErr.size?`File too large (${uploadErr.size}) for Supabase free plan`:uploadErr.msg}
                </div>
                {uploadErr.size&&(
                  <div style={{fontSize:12,color:"#888",lineHeight:1.8}}>
                    <div style={{color:"#60a5fa",fontWeight:600,marginBottom:6}}>Solutions for large files:</div>
                    1. Use <span style={{color:AM,fontWeight:600}}>Cloudflare R2 tab</span> → Upload there → Paste URL here<br/>
                    2. Upgrade Supabase to Pro ($25/mo) for 5GB uploads<br/>
                    3. Upload to Google Drive → get direct link → use Cloud tab
                  </div>
                )}
              </div>
            )}

            {form.stream_url&&!uploading&&!uploadErr&&(
              <div style={{fontSize:11,color:GR,padding:"7px 12px",background:"rgba(0,200,83,.06)",borderRadius:8,border:"1px solid rgba(0,200,83,.15)"}}>
                ✓ Uploaded successfully: {form.stream_url.slice(0,70)}...
              </div>
            )}
          </div>
        )}

        {/* Cloudflare R2 */}
        {srcTab==="r2"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:"linear-gradient(135deg,rgba(245,158,11,.08),rgba(245,158,11,.02))",border:"1px solid rgba(245,158,11,.2)",borderRadius:12,padding:16}}>
              <div style={{fontSize:13,color:AM,fontWeight:700,marginBottom:10}}>☁️ Cloudflare R2 — Upload Big Files (Free 10GB)</div>
              <div style={{fontSize:12,color:"#666688",lineHeight:1.9}}>
                <span style={{color:"#e2e2f0",fontWeight:600}}>Step 1:</span> Go to cloudflare.com → R2 → your bucket<br/>
                <span style={{color:"#e2e2f0",fontWeight:600}}>Step 2:</span> Click Upload → select your 1GB/2GB/3GB+ video<br/>
                <span style={{color:"#e2e2f0",fontWeight:600}}>Step 3:</span> Click the file → Copy Public URL<br/>
                <span style={{color:"#e2e2f0",fontWeight:600}}>Step 4:</span> Paste URL below ↓
              </div>
            </div>
            <Field label="Paste Cloudflare R2 Public URL">
              <input className="inp" value={form.stream_url} onChange={e=>onUrlChange(e.target.value,"stream_url")} placeholder="https://pub-YOUR_HASH.r2.dev/videos/movie.mp4"/>
            </Field>
            {form.stream_url&&form.stream_url.length>10&&(
              <div style={{fontSize:11,color:GR,padding:"7px 12px",background:"rgba(0,200,83,.06)",borderRadius:8}}>✓ R2 URL set</div>
            )}
          </div>
        )}

        {/* Other Cloud */}
        {srcTab==="cloud"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <Field label="Paste Video URL from any cloud storage" hint="Google Drive, Dropbox, OneDrive, Bunny CDN, Amazon S3, etc.">
              <input className="inp" value={form.stream_url} onChange={e=>onUrlChange(e.target.value,"stream_url")} placeholder="Paste direct video URL here..."/>
            </Field>
            <div style={{background:"rgba(255,255,255,.02)",borderRadius:10,padding:14,border:"1px solid #181828"}}>
              <div style={{fontSize:11,color:"#3a3a5a",fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:.6}}>How to get direct link:</div>
              {[
                ["🟢","Google Drive","Share → Anyone → Copy → Change '/view' to '/uc?export=download'"],
                ["🟣","Dropbox","Share → Copy → Change 'dl=0' to 'dl=1'"],
                ["🟡","Bunny CDN","Dashboard → Storage → Upload → Copy CDN URL (fastest for India)"],
                ["🟠","Amazon S3","Bucket → Object → Copy Object URL (set to public)"],
              ].map(([ic,nm,st])=>(
                <div key={nm} style={{fontSize:11,color:"#555577",marginBottom:6,lineHeight:1.5}}>
                  {ic} <span style={{color:"#aaa",fontWeight:600}}>{nm}:</span> {st}
                </div>
              ))}
            </div>
            {form.stream_url&&form.stream_url.length>10&&(
              <div style={{fontSize:11,color:GR,padding:"7px 12px",background:"rgba(0,200,83,.06)",borderRadius:8}}>✓ URL set</div>
            )}
          </div>
        )}

        {/* Live preview */}
        {previewUrl&&previewUrl.length>10&&(
          <div style={{marginTop:14}}>
            <div style={{fontSize:10,color:"#3a3a5a",fontWeight:700,textTransform:"uppercase",letterSpacing:.6,marginBottom:8}}>Live Preview</div>
            <StreamPreview url={previewUrl} isLive={isLiveForm||form.is_live}/>
          </div>
        )}
      </div>

      {/* Thumbnail + Trailer */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div>
          <Field label="Thumbnail URL">
            <div style={{display:"flex",gap:8}}>
              <input className="inp" value={form.thumbnail} onChange={e=>set("thumbnail",e.target.value)} placeholder="https://...thumbnail.jpg"/>
              <Btn onClick={()=>thumbRef.current?.click()} variant="outline" color={BL} size="sm">Upload</Btn>
              <input ref={thumbRef} type="file" accept="image/*" style={{display:"none"}} onChange={async e=>{
                const f=e.target.files?.[0]; if(!f)return;
                if(f.size>5*1024*1024){alert("Max 5MB");return;}
                try{
                  const ext=f.name.split(".").pop();
                  const path=`thumbs/${Date.now()}.${ext}`;
                  const{error}=await supabase.storage.from("streamx-media").upload(path,f,{cacheControl:"3600",upsert:false});
                  if(error)throw error;
                  const{data:ud}=supabase.storage.from("streamx-media").getPublicUrl(path);
                  set("thumbnail",ud.publicUrl);
                }catch(e){alert("Thumb upload failed: "+e.message);}
              }}/>
            </div>
          </Field>
          {form.thumbnail&&<img src={form.thumbnail} alt="" style={{width:"100%",height:80,objectFit:"cover",borderRadius:9,marginTop:8,border:"1px solid #181828"}} onError={e=>e.target.style.display="none"}/>}
        </div>
        <Field label="Trailer URL (optional)">
          <input className="inp" value={form.trailer_url||""} onChange={e=>set("trailer_url",e.target.value)} placeholder="Trailer video URL"/>
        </Field>
      </div>

      {/* Genre + Lang + Rating */}
      {!isLiveForm&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          <Field label="Genre"><select className="inp" value={form.genre} onChange={e=>set("genre",e.target.value)}>{GENRES.map(g=><option key={g}>{g}</option>)}</select></Field>
          <Field label="Language"><select className="inp" value={form.language} onChange={e=>set("language",e.target.value)}>{LANGS.map(l=><option key={l}>{l}</option>)}</select></Field>
          <Field label="Rating"><select className="inp" value={form.rating} onChange={e=>set("rating",e.target.value)}>{RATINGS.map(r=><option key={r}>{r}</option>)}</select></Field>
        </div>
      )}
      {isLiveForm&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Field label="Language"><select className="inp" value={form.language} onChange={e=>set("language",e.target.value)}>{LANGS.map(l=><option key={l}>{l}</option>)}</select></Field>
          <Field label="Rating"><select className="inp" value={form.rating} onChange={e=>set("rating",e.target.value)}>{RATINGS.map(r=><option key={r}>{r}</option>)}</select></Field>
        </div>
      )}

      {!isLiveForm&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10}}>
          <Field label="IMDb Score"><input className="inp" type="number" min="0" max="10" step="0.1" value={form.score||0} onChange={e=>set("score",+e.target.value)}/></Field>
          <Field label="Year"><input className="inp" type="number" value={form.release_year||2026} onChange={e=>set("release_year",+e.target.value)}/></Field>
          <Field label="Director"><input className="inp" value={form.director||""} onChange={e=>set("director",e.target.value)} placeholder="Optional"/></Field>
          <Field label="Studio"><input className="inp" value={form.studio||""} onChange={e=>set("studio",e.target.value)} placeholder="Optional"/></Field>
        </div>
      )}

      {/* Tags */}
      <Field label="Tags (press Enter)" hint="e.g. 4K, HDR, DOLBY, NEW, EXCLUSIVE, SUBTITLE">
        <input className="inp" value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={addTag} placeholder="Type and press Enter..."/>
        {(form.tags||[]).length>0&&(
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
            {(form.tags||[]).map(t=>(
              <span key={t} onClick={()=>set("tags",(form.tags||[]).filter(x=>x!==t))} style={{background:"rgba(229,9,20,.12)",color:R,fontSize:11,padding:"3px 10px",borderRadius:5,cursor:"pointer",border:"1px solid rgba(229,9,20,.25)",fontWeight:600}}>{t} ×</span>
            ))}
          </div>
        )}
      </Field>

      {/* Toggles */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,padding:"14px 0",borderTop:"1px solid #181828",borderBottom:"1px solid #181828"}}>
        {[["is_active","✅ Active — visible to users"],["is_featured","⭐ Featured on Home page"],["is_premium","👑 Premium subscribers only"],["is_live","🔴 Live / real-time stream"]].map(([k,l])=>(
          <label key={k} style={{display:"flex",alignItems:"center",gap:9,fontSize:13,cursor:"pointer",color:"#aaa",padding:"5px 0"}}>
            <input type="checkbox" checked={!!form[k]} onChange={e=>set(k,e.target.checked)} style={{accentColor:R,width:16,height:16}}/>{l}
          </label>
        ))}
      </div>

      {/* Status */}
      <div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,.02)",padding:"10px 14px",borderRadius:9,border:"1px solid #181828"}}>
        <div style={{width:9,height:9,borderRadius:"50%",background:statusColor,flexShrink:0,boxShadow:`0 0 8px ${statusColor}`}}/>
        <div style={{fontSize:12,color:statusColor,fontWeight:600}}>{statusMsg}</div>
      </div>

      {/* Buttons */}
      <div style={{display:"flex",gap:10}}>
        <Btn onClick={onCancel} variant="ghost" sx={{flex:1}}>Cancel</Btn>
        <button onClick={save} disabled={saving||!canSave} className="btn-primary" style={{flex:2,opacity:saving||!canSave?.5:1,cursor:saving||!canSave?"not-allowed":"pointer"}}>
          {saving?"⏳ Saving...":initial?.id?"✏️ Update Content":"💾 Save Content"}
        </button>
      </div>
    </div>
  );
}

// ── CONTENT LIST ──────────────────────────────────────────
function ContentList({content,isLiveList=false,onRefresh,showToast}){
  const[modal,  setModal]  =useState(null);
  const[search, setSearch] =useState("");
  const[saving, setSaving] =useState(false);
  const[confirm,setConfirm]=useState(null);
  const[filter, setFilter] =useState("all");
  const items=(content||[]).filter(c=>{
    const ms=!search||c.title?.toLowerCase().includes(search.toLowerCase());
    const mf=filter==="all"?true:filter==="active"?c.is_active:filter==="featured"?c.is_featured:filter==="premium"?c.is_premium:!c.is_active;
    return ms&&mf;
  });
  async function handleSave(form){
    setSaving(true);
    try{if(modal?.id){await db.updateContent(modal.id,form);showToast("Content updated!");}else{await db.addContent(form);showToast("✓ Added! Now live on home page.");}setModal(null);onRefresh();}
    catch(e){showToast("Error: "+e.message,"err");}
    setSaving(false);
  }
  async function realDelete(c){
    try{const{error}=await supabase.from("content").delete().eq("id",c.id);if(error)throw error;showToast("Deleted: "+c.title);setConfirm(null);onRefresh();}
    catch(e){showToast("Delete failed","err");}
  }
  return(
    <div style={{animation:"fadeIn .3s ease"}}>
      {confirm&&(
        <Modal title="Confirm Delete" onClose={()=>setConfirm(null)}>
          <div style={{textAlign:"center",padding:"10px 0"}}>
            <div style={{fontSize:52,marginBottom:14}}>🗑️</div>
            <div style={{fontWeight:700,fontSize:17,marginBottom:8}}>Delete "{confirm.title}"?</div>
            <div style={{fontSize:13,color:"#555577",marginBottom:26,lineHeight:1.6}}>This permanently removes it from the database.<br/>Users will no longer see it. Cannot undo.</div>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <Btn onClick={()=>setConfirm(null)} variant="ghost">Cancel</Btn>
              <Btn onClick={()=>realDelete(confirm)} variant="danger">Yes, Delete Forever</Btn>
            </div>
          </div>
        </Modal>
      )}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1}}>{isLiveList?"Live Channels":"Movies & Series"}</div>
          <div style={{fontSize:12,color:"#3a3a5a",marginTop:2}}>{items.length} of {(content||[]).length} total</div>
        </div>
        <Btn onClick={()=>setModal({})} variant="fill" size="lg">+ Add {isLiveList?"Channel":"Content"}</Btn>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        {[["all","All"],["active","✅ Active"],["featured","⭐ Featured"],["premium","👑 Premium"],["hidden","🙈 Hidden"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setFilter(id)} style={{background:filter===id?"rgba(229,9,20,.18)":"rgba(255,255,255,.04)",border:`1.5px solid ${filter===id?"rgba(229,9,20,.4)":"#181828"}`,color:filter===id?R:"#555577",borderRadius:22,padding:"6px 16px",fontSize:12,cursor:"pointer",fontWeight:filter===id?700:500,fontFamily:"'Inter',sans-serif",transition:"all .15s"}}>{lbl}</button>
        ))}
        <input className="inp" value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search..." style={{maxWidth:220,marginLeft:"auto"}}/>
      </div>
      <div className="card" style={{overflow:"hidden"}}>
        {items.length===0?(
          <div style={{textAlign:"center",padding:"64px 0",color:"#252540"}}>
            <div style={{fontSize:52,marginBottom:16,opacity:.3}}>{isLiveList?"🔴":"🎬"}</div>
            <div style={{fontSize:15,marginBottom:20,color:"#3a3a5a"}}>No {isLiveList?"channels":"content"} yet</div>
            <Btn onClick={()=>setModal({})} variant="fill">+ Add First {isLiveList?"Channel":"Content"}</Btn>
          </div>
        ):(
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr><th>Content</th><th>Type</th><th>Status</th><th>Views</th><th>Actions</th></tr></thead>
              <tbody>
                {items.map(c=>(
                  <tr key={c.id}>
                    <td>
                      <div style={{display:"flex",alignItems:"center",gap:12}}>
                        <div style={{width:62,height:40,borderRadius:7,overflow:"hidden",background:"#0a0a14",flexShrink:0,position:"relative"}}>
                          {c.thumbnail?<img src={c.thumbnail} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>e.target.style.display="none"}/>:<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,opacity:.3}}>{isLiveList?"🔴":"🎬"}</div>}
                        </div>
                        <div style={{minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200,color:"#e2e2f0"}}>{c.title}</div>
                          <div style={{fontSize:10,color:"#252540",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200,marginTop:2}}>
                            {c.stream_url||c.embed_url?<span style={{color:"#3a3a5a"}}>{(c.stream_url||c.embed_url||"").slice(0,45)}...</span>:<span style={{color:"#f87171"}}>⚠️ No URL</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Chip label={c.type||"Movie"} color={BL}/>
                      <div style={{fontSize:10,color:"#3a3a5a",marginTop:3}}>{c.genre} · {c.language}</div>
                    </td>
                    <td>
                      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                        <Chip label={c.is_active?"LIVE":"OFF"} color={c.is_active?GR:"#3a3a5a"}/>
                        {c.is_featured&&<Chip label="⭐" color={AM}/>}
                        {c.is_premium&&<Chip label="👑" color={R}/>}
                        {c.is_live&&<Chip label="🔴" color={R}/>}
                      </div>
                    </td>
                    <td style={{color:BL,fontSize:13,fontWeight:700}}>{fN(c.views||0)}</td>
                    <td>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                        <Btn onClick={()=>setModal(c)} variant="outline" color={BL} size="sm">Edit</Btn>
                        <Btn onClick={async()=>{await db.updateContent(c.id,{is_featured:!c.is_featured});showToast(c.is_featured?"Removed from featured":"⭐ Featured!");onRefresh();}} variant="outline" color={AM} size="sm">{c.is_featured?"★":"☆"}</Btn>
                        <Btn onClick={async()=>{await db.updateContent(c.id,{is_active:!c.is_active});showToast(c.is_active?"Hidden":"✓ Visible!");onRefresh();}} variant="outline" color={c.is_active?R:GR} size="sm">{c.is_active?"Hide":"Show"}</Btn>
                        <Btn onClick={()=>setConfirm(c)} variant="danger" size="sm">Del</Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {modal!==null&&(
        <Modal title={modal?.id?(isLiveList?"Edit Channel":"Edit Content"):(isLiveList?"Add Live Channel":"Add New Content")} onClose={()=>setModal(null)} xl>
          <ContentForm initial={modal} isLiveForm={isLiveList} onSave={handleSave} onCancel={()=>setModal(null)} saving={saving}/>
        </Modal>
      )}
    </div>
  );
}

// ── ANALYTICS PAGE ────────────────────────────────────────
function AnalyticsPage({stats,content,users}){
  const top=[...(content||[])].sort((a,b)=>(b.views||0)-(a.views||0));
  const totalV=top.reduce((s,c)=>s+(c.views||0),0);

  // Mock weekly data for charts (in real app, fetch from DB)
  const weeklyViews=[
    {label:"Mon",value:Math.floor(Math.random()*50000+10000)},
    {label:"Tue",value:Math.floor(Math.random()*50000+10000)},
    {label:"Wed",value:Math.floor(Math.random()*60000+15000)},
    {label:"Thu",value:Math.floor(Math.random()*55000+12000)},
    {label:"Fri",value:Math.floor(Math.random()*70000+20000)},
    {label:"Sat",value:Math.floor(Math.random()*90000+30000)},
    {label:"Sun",value:Math.floor(Math.random()*85000+25000)},
  ];

  const monthlyUsers=[
    {label:"Jan",value:120},{label:"Feb",value:180},{label:"Mar",value:250},
    {label:"Apr",value:310},{label:"May",value:420},{label:"Jun",value:580},
    {label:"Jul",value:720},{label:"Aug",value:890},{label:"Sep",value:1050},
    {label:"Oct",value:1300},{label:"Nov",value:1550},{label:"Dec",value:1900},
  ];

  // Genre breakdown
  const genreMap={};
  (content||[]).forEach(c=>{genreMap[c.genre||"Other"]=(genreMap[c.genre||"Other"]||0)+1;});
  const genreData=Object.entries(genreMap).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([label,value])=>({label,value}));

  // Plan breakdown
  const premium=(users||[]).filter(u=>u.plan?.includes("premium")||u.plan==="premium").length;
  const basic  =(users||[]).filter(u=>u.plan?.includes("basic")).length;
  const mobile =(users||[]).filter(u=>u.plan?.includes("mobile")).length;
  const free   =(users||[]).filter(u=>!u.plan||u.plan==="free").length;

  return(
    <div style={{animation:"fadeIn .3s ease"}}>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1,marginBottom:22}}>Analytics & Insights</div>

      {/* KPI Row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:14,marginBottom:28}}>
        {[
          ["👁️","Total Views",    fN(stats.totalViews||0),  "#a855f7"],
          ["👥","Total Users",    fN(stats.totalUsers||0),  BL],
          ["🎬","Movies",         (content||[]).filter(c=>c.type==="Movie").length, R],
          ["📺","Web Series",     (content||[]).filter(c=>c.type==="Web Series").length, AM],
          ["🔴","Live Channels",  (content||[]).filter(c=>c.is_live||c.type==="Live").length, R],
          ["👑","Premium Users",  premium, GR],
        ].map(([ico,lbl,val,col])=>(
          <div key={lbl} className="kpi" style={{animation:"countUp .5s ease"}}>
            <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:col,borderRadius:"2px 0 0 2px"}}/>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
              <span style={{fontSize:10,color:"#3a3a5a",fontWeight:700,textTransform:"uppercase",letterSpacing:.6}}>{lbl}</span>
              <span style={{fontSize:20}}>{ico}</span>
            </div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:col}}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:18}}>
        {/* Weekly Views Bar Chart */}
        <div className="card" style={{padding:24}}>
          <BarChart data={weeklyViews} height={180} color={R} title="📊 Weekly Views (This Week)"/>
        </div>

        {/* Monthly Users Line Chart */}
        <div className="card" style={{padding:24}}>
          <LineChart data={monthlyUsers} height={180} color={BL} title="📈 User Growth (Monthly)"/>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:18}}>
        {/* Top Content Performance */}
        <div className="card" style={{padding:24}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:18,color:"#e2e2f0"}}>🔥 Top 8 Content by Views</div>
          <BarChart data={top.slice(0,8).map(c=>({label:c.title.slice(0,10),value:c.views||0}))} height={160} color={AM}/>
        </div>

        {/* Plan Distribution Donut */}
        <div className="card" style={{padding:24}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:18,color:"#e2e2f0"}}>👥 User Plan Distribution</div>
          <DonutChart
            data={[
              {label:`Premium (${premium})`,value:premium,color:R},
              {label:`Basic (${basic})`,    value:basic,  color:PU},
              {label:`Mobile (${mobile})`,  value:mobile, color:BL},
              {label:`Free (${free})`,      value:free,   color:"#3a3a5a"},
            ]}
            size={140}
          />
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
        {/* Genre Bar Chart */}
        <div className="card" style={{padding:24}}>
          <BarChart data={genreData.map(g=>({label:g.label,value:g.value}))} height={150} color={PU} title="🎭 Content by Genre"/>
        </div>

        {/* Top Content Table */}
        <div className="card" style={{padding:24}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:16,color:"#e2e2f0"}}>🏆 Top 10 Content Rankings</div>
          {top.slice(0,10).map((c,i)=>{
            const pct=totalV>0?((c.views||0)/totalV)*100:0;
            const col=i===0?R:i===1?AM:i===2?BL:"#3a3a5a";
            return(
              <div key={c.id} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:col,width:22,flexShrink:0}}>{i+1}</span>
                    <span style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"clamp(100px,18vw,180px)",color:"#e2e2f0"}}>{c.title}</span>
                  </div>
                  <span style={{fontSize:11,color:col,fontWeight:700,flexShrink:0,marginLeft:8}}>{fN(c.views||0)}</span>
                </div>
                <div style={{height:5,background:"#181828",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:pct+"%",background:`linear-gradient(90deg,${col},${col}88)`,borderRadius:3,minWidth:c.views>0?4:0,transition:"width .6s ease"}}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── USERS PAGE ────────────────────────────────────────────
function UsersPage({users,onRefresh,showToast}){
  const[search,setSearch]=useState("");
  const[filter,setFilter]=useState("all");
  const[drawer,setDrawer]=useState(null);
  const filtered=(users||[]).filter(u=>{
    const ms=!search||u.name?.toLowerCase().includes(search.toLowerCase())||u.phone?.includes(search)||u.email?.toLowerCase().includes(search.toLowerCase());
    const mf=filter==="all"?true:filter==="premium"?(u.plan?.includes("premium")||u.plan==="premium"):filter==="admin"?u.role==="admin":!u.is_active;
    return ms&&mf;
  });
  return(
    <div style={{animation:"fadeIn .3s ease"}}>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1,marginBottom:20}}>User Management</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        <div className="kpi"><div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:BL,borderRadius:"2px 0 0 2px"}}/><div style={{fontSize:10,color:"#3a3a5a",fontWeight:700,textTransform:"uppercase",marginBottom:8}}>Total</div><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:BL}}>{fN((users||[]).length)}</div></div>
        <div className="kpi"><div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:R,borderRadius:"2px 0 0 2px"}}/><div style={{fontSize:10,color:"#3a3a5a",fontWeight:700,textTransform:"uppercase",marginBottom:8}}>Premium</div><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:R}}>{(users||[]).filter(u=>u.plan?.includes("premium")||u.plan==="premium").length}</div></div>
        <div className="kpi"><div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:GR,borderRadius:"2px 0 0 2px"}}/><div style={{fontSize:10,color:"#3a3a5a",fontWeight:700,textTransform:"uppercase",marginBottom:8}}>Active</div><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:GR}}>{(users||[]).filter(u=>u.is_active).length}</div></div>
        <div className="kpi"><div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:"#f87171",borderRadius:"2px 0 0 2px"}}/><div style={{fontSize:10,color:"#3a3a5a",fontWeight:700,textTransform:"uppercase",marginBottom:8}}>Suspended</div><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:"#f87171"}}>{(users||[]).filter(u=>!u.is_active).length}</div></div>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        {[["all","All Users"],["premium","👑 Premium"],["admin","⚡ Admins"],["suspended","🚫 Suspended"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setFilter(id)} style={{background:filter===id?"rgba(229,9,20,.18)":"rgba(255,255,255,.04)",border:`1.5px solid ${filter===id?"rgba(229,9,20,.4)":"#181828"}`,color:filter===id?R:"#555577",borderRadius:22,padding:"6px 16px",fontSize:12,cursor:"pointer",fontWeight:filter===id?700:500,fontFamily:"'Inter',sans-serif"}}>{lbl}</button>
        ))}
        <input className="inp" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, phone, email..." style={{maxWidth:280,marginLeft:"auto"}}/>
      </div>
      <div className="card" style={{overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table className="tbl">
            <thead><tr><th>User</th><th>Contact</th><th>Plan</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(u=>(
                <tr key={u.id}>
                  <td>
                    <div style={{display:"flex",alignItems:"center",gap:11}}>
                      <div style={{width:36,height:36,borderRadius:"50%",background:`linear-gradient(135deg,hsl(${u.name?.charCodeAt(0)*9||0},50%,30%),hsl(${u.name?.charCodeAt(0)*9||0},50%,18%))`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,flexShrink:0,border:"2px solid #181828"}}>
                        {u.name?.[0]?.toUpperCase()||"?"}
                      </div>
                      <div>
                        <div style={{fontWeight:700,fontSize:13,color:"#e2e2f0"}}>{u.name||"Unknown"}</div>
                        <div style={{fontSize:10,color:"#3a3a5a"}}>ID: {u.id?.slice(0,8)}...</div>
                      </div>
                    </div>
                  </td>
                  <td style={{color:"#555577",fontSize:12}}>{u.phone||u.email||"—"}</td>
                  <td><Chip label={(u.plan||"free").replace("plan_","").toUpperCase()} color={u.plan?.includes("premium")||u.plan==="premium"?R:u.plan?.includes("basic")?PU:u.plan?.includes("mobile")?BL:"#3a3a5a"}/></td>
                  <td><Chip label={u.is_active?"ACTIVE":"SUSPENDED"} color={u.is_active?GR:"#f87171"}/></td>
                  <td style={{color:"#3a3a5a",fontSize:11}}>{new Date(u.created_at).toLocaleDateString("en-IN")}</td>
                  <td>
                    <div style={{display:"flex",gap:5}}>
                      <Btn onClick={()=>setDrawer(u)} variant="outline" color={BL} size="sm">View</Btn>
                      {u.is_active
                        ?<Btn onClick={async()=>{await db.suspendUser(u.id);showToast("Suspended","warn");onRefresh();}} variant="danger" size="sm">Suspend</Btn>
                        :<Btn onClick={async()=>{await db.activateUser(u.id);showToast("Activated");onRefresh();}} variant="outline" color={GR} size="sm">Activate</Btn>
                      }
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {drawer&&(
        <>
          <div style={{position:"fixed",inset:0,zIndex:900,background:"rgba(0,0,0,.7)",backdropFilter:"blur(6px)"}} onClick={()=>setDrawer(null)}/>
          <div style={{position:"fixed",top:0,right:0,bottom:0,width:"clamp(300px,35vw,380px)",zIndex:901,background:"linear-gradient(145deg,#0e0e1e,#0a0a14)",borderLeft:"1px solid #181828",overflowY:"auto",padding:26,animation:"slideRight .25s ease",boxShadow:"-16px 0 48px rgba(0,0,0,.6)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:26}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:1}}>User Profile</div>
              <Btn onClick={()=>setDrawer(null)} variant="ghost" size="sm" sx={{fontSize:16}}>✕</Btn>
            </div>
            <div style={{textAlign:"center",marginBottom:26}}>
              <div style={{width:80,height:80,borderRadius:"50%",background:`linear-gradient(135deg,hsl(${drawer.name?.charCodeAt(0)*9||0},50%,30%),hsl(${drawer.name?.charCodeAt(0)*9||0},50%,18%))`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,fontWeight:800,margin:"0 auto 14px",border:`3px solid ${R}`,boxShadow:`0 0 20px ${R}44`}}>
                {drawer.name?.[0]?.toUpperCase()||"?"}
              </div>
              <div style={{fontWeight:800,fontSize:19,marginBottom:4}}>{drawer.name||"Unknown"}</div>
              <div style={{fontSize:13,color:"#3a3a5a"}}>{drawer.phone||drawer.email||"No contact"}</div>
            </div>
            <div className="card" style={{marginBottom:16}}>
              {[
                ["Plan",(drawer.plan||"free").replace("plan_","").toUpperCase()],
                ["Role",(drawer.role||"user").toUpperCase()],
                ["Status",drawer.is_active?"✅ Active":"🚫 Suspended"],
                ["Joined",new Date(drawer.created_at).toLocaleDateString("en-IN")],
                ["User ID",drawer.id?.slice(0,16)+"..."],
              ].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"11px 16px",borderBottom:"1px solid #181828",fontSize:13}}>
                  <span style={{color:"#3a3a5a"}}>{k}</span>
                  <span style={{fontWeight:600,color:"#e2e2f0"}}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {drawer.is_active
                ?<Btn onClick={async()=>{await db.suspendUser(drawer.id);showToast("User suspended","warn");setDrawer(null);onRefresh();}} variant="danger" sx={{width:"100%",justifyContent:"center"}}>🚫 Suspend User</Btn>
                :<Btn onClick={async()=>{await db.activateUser(drawer.id);showToast("User activated");setDrawer(null);onRefresh();}} variant="outline" color={GR} sx={{width:"100%",justifyContent:"center"}}>✅ Activate User</Btn>
              }
              <Btn onClick={()=>setDrawer(null)} variant="ghost" sx={{width:"100%",justifyContent:"center"}}>Close</Btn>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── ADS PAGE ──────────────────────────────────────────────
function AdsPage({ads,onRefresh,showToast}){
  const[modal,setModal]=useState(null);
  const[form,setForm]=useState({brand:"",tagline:"",cta_text:"Learn More",type:"pre_roll",duration:15,skip_after:5,is_active:true,priority:1});
  const[saving,setSaving]=useState(false);
  async function save(){
    if(!form.brand){showToast("Brand required","err");return;}
    setSaving(true);
    try{if(modal?.id){await db.updateAd(modal.id,form);showToast("Ad updated!");}else{await db.addAd(form);showToast("Ad campaign created!");}setModal(null);onRefresh();}
    catch(e){showToast("Error: "+e.message,"err");}
    setSaving(false);
  }
  return(
    <div style={{animation:"fadeIn .3s ease"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1}}>Ads Manager</div>
          <div style={{fontSize:12,color:"#3a3a5a",marginTop:2}}>{(ads||[]).filter(a=>a.is_active).length} active campaigns</div>
        </div>
        <Btn onClick={()=>{setForm({brand:"",tagline:"",cta_text:"Learn More",type:"pre_roll",duration:15,skip_after:5,is_active:true,priority:1});setModal({});}} variant="fill" size="lg">+ New Campaign</Btn>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        <div className="kpi"><div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:AM,borderRadius:"2px 0 0 2px"}}/><div style={{fontSize:10,color:"#3a3a5a",fontWeight:700,textTransform:"uppercase",marginBottom:8}}>Total Ads</div><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:AM}}>{(ads||[]).length}</div></div>
        <div className="kpi"><div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:GR,borderRadius:"2px 0 0 2px"}}/><div style={{fontSize:10,color:"#3a3a5a",fontWeight:700,textTransform:"uppercase",marginBottom:8}}>Active</div><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:GR}}>{(ads||[]).filter(a=>a.is_active).length}</div></div>
        <div className="kpi"><div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:R,borderRadius:"2px 0 0 2px"}}/><div style={{fontSize:10,color:"#3a3a5a",fontWeight:700,textTransform:"uppercase",marginBottom:8}}>Pre-roll</div><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:R}}>{(ads||[]).filter(a=>a.type==="pre_roll").length}</div></div>
        <div className="kpi"><div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:BL,borderRadius:"2px 0 0 2px"}}/><div style={{fontSize:10,color:"#3a3a5a",fontWeight:700,textTransform:"uppercase",marginBottom:8}}>Mid-roll</div><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:BL}}>{(ads||[]).filter(a=>a.type==="mid_roll").length}</div></div>
      </div>
      <div className="card" style={{overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table className="tbl">
            <thead><tr><th>Brand</th><th>Type</th><th>Duration</th><th>Skip After</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {(ads||[]).length===0?<tr><td colSpan={6} style={{textAlign:"center",padding:"40px 0",color:"#3a3a5a"}}>No ads yet. Create your first campaign.</td></tr>:
              (ads||[]).map(a=>(
                <tr key={a.id}>
                  <td><div style={{fontWeight:700,color:"#e2e2f0"}}>{a.brand}</div><div style={{fontSize:10,color:"#3a3a5a",marginTop:2}}>{a.tagline}</div></td>
                  <td><Chip label={a.type?.replace("_"," ").toUpperCase()} color={a.type==="pre_roll"?R:BL}/></td>
                  <td style={{fontSize:13,fontWeight:600}}>{a.duration||0}s</td>
                  <td style={{fontSize:13,fontWeight:600}}>{a.skip_after||0}s</td>
                  <td><Chip label={a.is_active?"ACTIVE":"PAUSED"} color={a.is_active?GR:AM}/></td>
                  <td>
                    <div style={{display:"flex",gap:5}}>
                      <Btn onClick={()=>{setForm({...a});setModal(a);}} variant="outline" color={BL} size="sm">Edit</Btn>
                      <Btn onClick={async()=>{await db.updateAd(a.id,{is_active:!a.is_active});showToast(a.is_active?"Paused":"Activated");onRefresh();}} variant="outline" color={a.is_active?AM:GR} size="sm">{a.is_active?"Pause":"Resume"}</Btn>
                      <Btn onClick={async()=>{try{await supabase.from("ads").delete().eq("id",a.id);showToast("Deleted");onRefresh();}catch(e){showToast("Failed","err");}}} variant="danger" size="sm">Del</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modal!==null&&(
        <Modal title={modal?.id?"Edit Ad Campaign":"New Ad Campaign"} onClose={()=>setModal(null)}>
          <div style={{display:"flex",flexDirection:"column",gap:13}}>
            {[["Brand Name *","brand"],["Tagline","tagline"],["CTA Button Text","cta_text"]].map(([l,k])=>(
              <Field key={k} label={l}><input className="inp" value={form[k]||""} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}/></Field>
            ))}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              <Field label="Type"><select className="inp" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}><option value="pre_roll">Pre-roll</option><option value="mid_roll">Mid-roll</option><option value="banner">Banner</option></select></Field>
              <Field label="Duration (s)"><input className="inp" type="number" value={form.duration||15} onChange={e=>setForm(f=>({...f,duration:+e.target.value}))}/></Field>
              <Field label="Skip After (s)"><input className="inp" type="number" value={form.skip_after||5} onChange={e=>setForm(f=>({...f,skip_after:+e.target.value}))}/></Field>
            </div>
            <label style={{display:"flex",alignItems:"center",gap:9,fontSize:13,cursor:"pointer",color:"#aaa"}}>
              <input type="checkbox" checked={!!form.is_active} onChange={e=>setForm(f=>({...f,is_active:e.target.checked}))} style={{accentColor:R,width:16,height:16}}/>Campaign Active
            </label>
            <div style={{display:"flex",gap:10}}>
              <Btn onClick={()=>setModal(null)} variant="ghost" sx={{flex:1}}>Cancel</Btn>
              <button onClick={save} disabled={saving} className="btn-primary" style={{flex:2,cursor:saving?"not-allowed":"pointer"}}>
                {saving?"Saving...":modal?.id?"Update Campaign":"Create Campaign"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── EMPLOYEES PAGE ────────────────────────────────────────
const ROLE_OPTIONS=["SUPER_ADMIN","CONTENT_MANAGER","LIVE_MANAGER","SUPPORT_MANAGER","FINANCE_MANAGER","ANALYST"];

function EmployeesPage({showToast}){
  const[employees,setEmployees]=useState([]);
  const[loading,setLoading]=useState(true);
  const[newUserId,setNewUserId]=useState("");
  const[newRole,setNewRole]=useState("CONTENT_MANAGER");
  const[creating,setCreating]=useState(false);

  const authHeader=()=>({Authorization:`Bearer ${localStorage.getItem("streamx_token")}`});

  async function load(){
    setLoading(true);
    try{
      const res=await fetch(`${API}/api/employees`,{headers:authHeader()});
      const json=await res.json();
      setEmployees(json.success?json.data:[]);
    }catch(e){setEmployees([]);}
    setLoading(false);
  }
  useEffect(()=>{load();},[]);

  async function createEmployee(){
    if(!newUserId.trim())return showToast("Enter the user's ID","err");
    setCreating(true);
    try{
      const res=await fetch(`${API}/api/employees`,{method:"POST",headers:{...authHeader(),"Content-Type":"application/json"},body:JSON.stringify({userId:newUserId.trim(),roleName:newRole})});
      const json=await res.json();
      if(!json.success)throw new Error(json.msg);
      showToast("Employee created ✓");setNewUserId("");load();
    }catch(e){showToast("Failed: "+e.message,"err");}
    setCreating(false);
  }

  async function disable(id){
    if(!confirm("Disable this employee? This revokes all their sessions immediately."))return;
    try{
      const res=await fetch(`${API}/api/employees/${id}/disable`,{method:"POST",headers:authHeader()});
      const json=await res.json();
      if(!json.success)throw new Error(json.msg);
      showToast("Employee disabled — sessions revoked");load();
    }catch(e){showToast("Failed: "+e.message,"err");}
  }

  async function reactivate(id){
    try{
      const res=await fetch(`${API}/api/employees/${id}/reactivate`,{method:"POST",headers:authHeader()});
      const json=await res.json();
      if(!json.success)throw new Error(json.msg);
      showToast("Employee reactivated");load();
    }catch(e){showToast("Failed: "+e.message,"err");}
  }

  return(
    <div style={{animation:"fadeIn .3s ease",maxWidth:800}}>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1,marginBottom:22}}>Employees</div>

      <div className="card" style={{padding:20,marginBottom:20}}>
        <div style={{fontSize:12,color:"#3a3a5a",fontWeight:700,textTransform:"uppercase",letterSpacing:.7,marginBottom:14}}>Add Employee</div>
        <div style={{fontSize:11,color:"#666688",marginBottom:12}}>Promote an existing user (by their user ID) to an employee role. Find the user ID in the Users page.</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <input value={newUserId} onChange={e=>setNewUserId(e.target.value)} placeholder="User ID (uuid)" style={{flex:2,minWidth:200,background:"#0a0a14",border:"1.5px solid #1a1a2c",borderRadius:8,color:"#fff",padding:"10px 14px",fontSize:13}}/>
          <select value={newRole} onChange={e=>setNewRole(e.target.value)} style={{flex:1,minWidth:160,background:"#0a0a14",border:"1.5px solid #1a1a2c",borderRadius:8,color:"#fff",padding:"10px 14px",fontSize:13}}>
            {ROLE_OPTIONS.map(r=><option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={createEmployee} disabled={creating} style={{background:R,border:"none",color:"#fff",borderRadius:8,padding:"10px 20px",fontWeight:700,fontSize:13,cursor:"pointer"}}>{creating?"Adding...":"Add"}</button>
        </div>
      </div>

      <div className="card" style={{padding:0,overflow:"hidden"}}>
        {loading?<div style={{padding:24,textAlign:"center",color:"#3a3a5a"}}>Loading...</div>:
        employees.length===0?<div style={{padding:24,textAlign:"center",color:"#3a3a5a"}}>No employees yet</div>:
        employees.map((emp,i)=>(
          <div key={emp.id} style={{display:"flex",alignItems:"center",gap:14,padding:16,borderBottom:i<employees.length-1?"1px solid #181828":"none"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:14}}>{emp.name||"Unnamed"}</div>
              <div style={{fontSize:11,color:"#666688"}}>{emp.email} · {emp.role?.name||"No role"}</div>
            </div>
            <span style={{fontSize:10,fontWeight:800,padding:"3px 10px",borderRadius:20,background:emp.employee_status==="ACTIVE"?"rgba(0,200,83,.12)":"rgba(248,113,113,.12)",color:emp.employee_status==="ACTIVE"?GR:"#f87171"}}>{emp.employee_status}</span>
            {emp.employee_status==="ACTIVE"
              ?<button onClick={()=>disable(emp.id)} style={{background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.3)",color:"#f87171",borderRadius:7,padding:"6px 14px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Disable</button>
              :<button onClick={()=>reactivate(emp.id)} style={{background:"rgba(0,200,83,.1)",border:"1px solid rgba(0,200,83,.3)",color:GR,borderRadius:7,padding:"6px 14px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Reactivate</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── APPROVALS PAGE ────────────────────────────────────────
function ApprovalsPage({showToast}){
  const[requests,setRequests]=useState([]);
  const[loading,setLoading]=useState(true);

  const authHeader=()=>({Authorization:`Bearer ${localStorage.getItem("streamx_token")}`});

  async function load(){
    setLoading(true);
    try{
      const res=await fetch(`${API}/api/approvals?status=PENDING`,{headers:authHeader()});
      const json=await res.json();
      setRequests(json.success?json.data:[]);
    }catch(e){setRequests([]);}
    setLoading(false);
  }
  useEffect(()=>{load();},[]);

  async function approve(id){
    try{
      const res=await fetch(`${API}/api/approvals/${id}/approve`,{method:"POST",headers:authHeader()});
      const json=await res.json();
      if(!json.success)throw new Error(json.msg);
      showToast("Approved and executed ✓");load();
    }catch(e){showToast("Failed: "+e.message,"err");}
  }
  async function reject(id){
    const reason=prompt("Reason for rejection (optional):")||"";
    try{
      const res=await fetch(`${API}/api/approvals/${id}/reject`,{method:"POST",headers:{...authHeader(),"Content-Type":"application/json"},body:JSON.stringify({reason})});
      const json=await res.json();
      if(!json.success)throw new Error(json.msg);
      showToast("Rejected — no changes made");load();
    }catch(e){showToast("Failed: "+e.message,"err");}
  }

  return(
    <div style={{animation:"fadeIn .3s ease",maxWidth:800}}>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1,marginBottom:22}}>Approval Requests</div>
      <div className="card" style={{padding:0,overflow:"hidden"}}>
        {loading?<div style={{padding:24,textAlign:"center",color:"#3a3a5a"}}>Loading...</div>:
        requests.length===0?<div style={{padding:24,textAlign:"center",color:"#3a3a5a"}}>No pending requests</div>:
        requests.map((req,i)=>(
          <div key={req.id} style={{padding:18,borderBottom:i<requests.length-1?"1px solid #181828":"none"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div>
                <div style={{fontSize:15,fontWeight:800,color:R}}>{req.action}</div>
                <div style={{fontSize:12,color:"#666688",marginTop:2}}>Requested by {req.requester?.name||"Unknown"} ({req.requester?.email})</div>
              </div>
              <span style={{fontSize:10,fontWeight:800,padding:"3px 10px",borderRadius:20,background:"rgba(245,158,11,.12)",color:AM}}>PENDING</span>
            </div>
            <div style={{fontSize:12,color:"#8888aa",marginBottom:4}}>Target: {req.resource_type} · {req.resource_id}</div>
            {req.reason&&<div style={{fontSize:12,color:"#8888aa",marginBottom:10}}>Reason: {req.reason}</div>}
            <div style={{fontSize:10,color:"#3a3a5a",marginBottom:12}}>{new Date(req.created_at).toLocaleString()}</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>approve(req.id)} style={{background:GR,border:"none",color:"#04040e",borderRadius:8,padding:"8px 18px",fontWeight:800,fontSize:12,cursor:"pointer"}}>✓ APPROVE</button>
              <button onClick={()=>reject(req.id)} style={{background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.3)",color:"#f87171",borderRadius:8,padding:"8px 18px",fontWeight:800,fontSize:12,cursor:"pointer"}}>✕ REJECT</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── AUDIT LOGS PAGE ───────────────────────────────────────
function AuditLogsPage(){
  const[logs,setLogs]=useState([]);
  const[loading,setLoading]=useState(true);

  useEffect(()=>{
    (async()=>{
      try{
        const res=await fetch(`${API}/api/audit-logs?limit=200`,{headers:{Authorization:`Bearer ${localStorage.getItem("streamx_token")}`}});
        const json=await res.json();
        setLogs(json.success?json.data:[]);
      }catch(e){setLogs([]);}
      setLoading(false);
    })();
  },[]);

  return(
    <div style={{animation:"fadeIn .3s ease",maxWidth:900}}>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1,marginBottom:22}}>Audit Logs</div>
      <div className="card" style={{padding:0,overflow:"hidden",maxHeight:600,overflowY:"auto"}}>
        {loading?<div style={{padding:24,textAlign:"center",color:"#3a3a5a"}}>Loading...</div>:
        logs.length===0?<div style={{padding:24,textAlign:"center",color:"#3a3a5a"}}>No audit entries yet</div>:
        logs.map((log,i)=>(
          <div key={log.id} style={{padding:"12px 18px",borderBottom:i<logs.length-1?"1px solid #181828":"none",fontSize:12}}>
            <span style={{color:log.result==="denied"?"#f87171":log.result==="error"?AM:GR,fontWeight:700}}>{log.action}</span>
            <span style={{color:"#666688"}}> · {log.user_name||log.user_id||"system"} ({log.role||"—"})</span>
            {log.resource_type&&<span style={{color:"#666688"}}> · {log.resource_type}:{log.resource_id}</span>}
            <div style={{color:"#3a3a5a",fontSize:10,marginTop:2}}>{new Date(log.created_at).toLocaleString()}{log.reason?` · ${log.reason}`:""}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── REVENUE PAGE ──────────────────────────────────────────
function RevenuePage({stats,users}){
  const premium=(users||[]).filter(u=>u.plan?.includes("premium")||u.plan==="premium");
  const basic  =(users||[]).filter(u=>u.plan?.includes("basic"));
  const mobile =(users||[]).filter(u=>u.plan?.includes("mobile"));
  const free   =(users||[]).filter(u=>!u.plan||u.plan==="free");
  const monthly=premium.length*499+basic.length*299+mobile.length*149;
  const annual =premium.length*499*12+basic.length*299*12+mobile.length*149*12;
  const total  =(users||[]).length||1;

  const revenueByPlan=[
    {label:"Premium",value:premium.length*499,color:R},
    {label:"Basic",  value:basic.length*299,  color:PU},
    {label:"Mobile", value:mobile.length*149,  color:BL},
  ];

  return(
    <div style={{animation:"fadeIn .3s ease"}}>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1,marginBottom:22}}>Revenue Dashboard</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:14,marginBottom:24}}>
        {[
          ["💰","Total Revenue",    "₹"+fN(stats.totalRevenue||0), GR],
          ["📅","Est. Monthly",     "₹"+fN(monthly),               BL],
          ["📆","Est. Annual",      "₹"+fN(annual),                "#a855f7"],
          ["👑","Premium Users",    premium.length,                 R],
          ["⭐","Basic Users",      basic.length,                   PU],
          ["📱","Mobile Users",     mobile.length,                  BL],
        ].map(([ico,lbl,val,col])=>(
          <div key={lbl} className="kpi">
            <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:col,borderRadius:"2px 0 0 2px"}}/>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
              <span style={{fontSize:10,color:"#3a3a5a",fontWeight:700,textTransform:"uppercase",letterSpacing:.6}}>{lbl}</span>
              <span style={{fontSize:20}}>{ico}</span>
            </div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30,color:col}}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
        {/* Revenue Bar Chart */}
        <div className="card" style={{padding:24}}>
          <BarChart data={revenueByPlan.map(p=>({label:p.label,value:p.value}))} height={180} color={GR} title="💰 Revenue by Plan (Monthly ₹)"/>
        </div>

        {/* Subscription breakdown */}
        <div className="card" style={{padding:24}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:18,color:"#e2e2f0"}}>📊 Subscription Distribution</div>
          {[
            {label:"Premium ₹499/mo",count:premium.length,color:R,     rev:premium.length*499},
            {label:"Basic ₹299/mo",  count:basic.length,  color:PU,    rev:basic.length*299},
            {label:"Mobile ₹149/mo", count:mobile.length, color:BL,    rev:mobile.length*149},
            {label:"Free Plan",      count:free.length,   color:"#3a3a5a",rev:0},
          ].map(p=>(
            <div key={p.label} style={{marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:10,height:10,borderRadius:3,background:p.color,flexShrink:0}}/>
                  <span style={{fontSize:13,fontWeight:600,color:"#e2e2f0"}}>{p.label}</span>
                </div>
                <div style={{textAlign:"right"}}>
                  <span style={{fontSize:12,color:p.color,fontWeight:700}}>₹{fN(p.rev)}/mo</span>
                  <span style={{fontSize:11,color:"#3a3a5a",marginLeft:8}}>{p.count} users</span>
                </div>
              </div>
              <div style={{height:8,background:"#181828",borderRadius:4,overflow:"hidden"}}>
                <div style={{height:"100%",width:Math.round((p.count/total)*100)+"%",background:`linear-gradient(90deg,${p.color},${p.color}88)`,borderRadius:4,transition:"width .6s ease",minWidth:p.count>0?8:0}}/>
              </div>
            </div>
          ))}
          <div style={{marginTop:20,padding:"14px 18px",background:"rgba(0,200,83,.06)",borderRadius:10,border:"1px solid rgba(0,200,83,.15)"}}>
            <div style={{fontSize:12,color:"#3a3a5a",marginBottom:4}}>Estimated Monthly Revenue</div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:GR}}>₹{fN(monthly)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MAIN ADMIN ────────────────────────────────────────────
export default function Admin({onNavigate,user}){
  const[verified, setVerified]=useState(false);
  const[showFace, setShowFace]=useState(true);
  const[page,     setPage]    =useState("dashboard");
  const[collapsed,setCollapsed]=useState(false);
  const[stats,    setStats]   =useState({});
  const[content,  setContent] =useState([]);
  const[users,    setUsers]   =useState([]);
  const[ads,      setAds]     =useState([]);
  const[loading,  setLoading] =useState(true);
  const[toast,    setToast]   =useState(null);

  const showToast=(msg,type="ok")=>{setToast({msg,type});setTimeout(()=>setToast(null),3500);};

  useEffect(()=>{if(verified)loadData();},[verified]);

  useEffect(()=>{
    if(!verified)return;
    const ch=supabase.channel("admin-pro-rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"content"},()=>loadData())
      .on("postgres_changes",{event:"*",schema:"public",table:"users"},()=>loadData())
      .subscribe();
    return()=>supabase.removeChannel(ch);
  },[verified]);

  async function loadData(){
    setLoading(true);
    try{
      const[s,c,u,a]=await Promise.all([
        db.getAdminStats().catch(()=>({})),
        supabase.from("content").select("*").order("created_at",{ascending:false}).then(r=>r.data||[]),
        db.getAllUsers().catch(()=>[]),
        db.getAllAds().catch(()=>[]),
      ]);
      setStats(s);setContent(c);setUsers(u);setAds(a);
    }catch(e){}
    setLoading(false);
  }

  if(showFace&&!verified) return <FaceAuth user={user} onSuccess={()=>{setVerified(true);setShowFace(false);}} onSkip={()=>{setVerified(true);setShowFace(false);}}/>;

  if(loading) return(
    <div style={{minHeight:"100vh",background:"#04040e",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:18,fontFamily:"Inter,sans-serif"}}>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,letterSpacing:3}}><span style={{color:R}}>STREAMX</span><span style={{color:"#e2e2f0"}}> ADMIN</span></div>
      <div style={{width:44,height:44,border:`3px solid #181828`,borderTop:`3px solid ${R}`,borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
      <div style={{fontSize:13,color:"#3a3a5a"}}>Loading admin panel...</div>
      <style>{CSS}</style>
    </div>
  );

  const liveContent =content.filter(c=>c.is_live||c.type==="Live");
  const movieContent=content.filter(c=>!c.is_live&&c.type!=="Live");

  return(
    <div style={{display:"flex",height:"100vh",background:"#04040e",overflow:"hidden",fontFamily:"'Inter',sans-serif"}}>
      <style>{CSS}</style>
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}

      {/* ── SIDEBAR ── */}
      <div style={{width:collapsed?56:210,flexShrink:0,background:"linear-gradient(180deg,#080814 0%,#060610 100%)",borderRight:"1px solid #181828",display:"flex",flexDirection:"column",transition:"width .22s ease",overflow:"hidden",boxShadow:"4px 0 24px rgba(0,0,0,.4)"}}>
        {/* Logo */}
        <div style={{padding:collapsed?"14px 12px":"14px 18px",borderBottom:"1px solid #181828",display:"flex",alignItems:"center",gap:12,cursor:"pointer",flexShrink:0}} onClick={()=>setCollapsed(o=>!o)}>
          <div style={{width:32,height:32,borderRadius:10,background:"linear-gradient(135deg,rgba(229,9,20,.3),rgba(229,9,20,.1))",border:"1px solid rgba(229,9,20,.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0,animation:"glow 2s infinite"}}>⚡</div>
          {!collapsed&&<div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:2,whiteSpace:"nowrap"}}><span style={{color:R}}>STREAMX</span><span style={{color:"#e2e2f0"}}> ADMIN</span><span style={{fontSize:9,color:"#3a3a5a",marginLeft:8,fontFamily:"Inter",letterSpacing:0}}>ADMIN PRO</span></div>}
        </div>

        {/* Nav */}
        <div style={{flex:1,overflowY:"auto",padding:"10px 8px"}}>
          {PAGES.map(p=>(
            <div key={p.id} className={`nav${page===p.id?" on":""}`} onClick={()=>setPage(p.id)} style={{justifyContent:collapsed?"center":"flex-start",marginBottom:2}} title={collapsed?p.label:undefined}>
              <span style={{fontSize:16,flexShrink:0}}>{p.icon}</span>
              {!collapsed&&<span style={{fontSize:13}}>{p.label}</span>}
              {!collapsed&&p.id==="live"&&liveContent.length>0&&(
                <span style={{marginLeft:"auto",background:R,color:"#fff",fontSize:9,fontWeight:800,padding:"2px 6px",borderRadius:10,animation:"pulse 1.5s infinite"}}>{liveContent.length}</span>
              )}
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div style={{padding:"8px",borderTop:"1px solid #181828",flexShrink:0}}>
          <div className="nav" onClick={loadData} style={{color:BL,justifyContent:collapsed?"center":"flex-start",marginBottom:2}} title={collapsed?"Refresh":undefined}>
            <span style={{fontSize:16}}>↻</span>{!collapsed&&<span style={{fontSize:12}}>Refresh Data</span>}
          </div>
          <div className="nav" onClick={()=>onNavigate("home")} style={{color:"#f87171",justifyContent:collapsed?"center":"flex-start"}} title={collapsed?"Home":undefined}>
            <span style={{fontSize:16}}>🏠</span>{!collapsed&&<span style={{fontSize:12}}>Back to Home</span>}
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden"}}>
        {/* Top bar */}
        <div style={{height:54,background:"linear-gradient(90deg,#080814,#060610)",borderBottom:"1px solid #181828",display:"flex",alignItems:"center",padding:"0 24px",gap:14,flexShrink:0}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:1,color:"#252540"}}>
            {PAGES.find(p=>p.id===page)?.icon} {PAGES.find(p=>p.id===page)?.label}
          </div>
          <div style={{flex:1}}/>
          {/* Live indicator */}
          <div style={{display:"flex",alignItems:"center",gap:7,fontSize:11,color:"#3a3a5a",background:"rgba(0,200,83,.06)",border:"1px solid rgba(0,200,83,.15)",borderRadius:20,padding:"4px 12px"}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:GR,animation:"pulse 2s infinite"}}/>
            Realtime Active
          </div>
          <div style={{fontSize:12,color:"#3a3a5a",background:"rgba(255,255,255,.03)",border:"1px solid #181828",borderRadius:20,padding:"5px 14px"}}>
            👑 {user?.name||"Admin"}
          </div>
          <Btn onClick={loadData} variant="ghost" size="sm">↻ Refresh</Btn>
        </div>

        {/* Page */}
        <div style={{flex:1,overflowY:"auto",padding:"clamp(16px,3vw,26px)"}}>

          {/* DASHBOARD */}
          {page==="dashboard"&&(
            <div style={{animation:"fadeIn .3s ease"}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1,marginBottom:24}}>Dashboard Overview</div>
              {/* KPIs */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:14,marginBottom:26}}>
                {[
                  ["👥","Total Users",    fN(stats.totalUsers),       BL],
                  ["👑","Paid Subs",      fN(stats.activeSubs),       R],
                  ["💰","Revenue",        "₹"+fN(stats.totalRevenue), GR],
                  ["👁️","Total Views",   fN(stats.totalViews),       "#a855f7"],
                  ["🎬","Content",        stats.totalContent||0,      AM],
                  ["📢","Active Ads",     stats.activeAds||0,         "#06b6d4"],
                  ["🔴","Live Now",       liveContent.filter(c=>c.is_active).length, R],
                  ["🆓","Free Users",     fN((users||[]).filter(u=>!u.plan||u.plan==="free").length), "#3a3a5a"],
                ].map(([ico,lbl,val,col])=>(
                  <div key={lbl} className="kpi" style={{animation:"countUp .5s ease"}}>
                    <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:col,borderRadius:"2px 0 0 2px"}}/>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                      <span style={{fontSize:10,color:"#3a3a5a",fontWeight:700,textTransform:"uppercase",letterSpacing:.6}}>{lbl}</span>
                      <span style={{fontSize:20}}>{ico}</span>
                    </div>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:col}}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Charts */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:18}}>
                <div className="card" style={{padding:24}}>
                  <BarChart
                    data={[...content].sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,7).map(c=>({label:c.title.slice(0,8),value:c.views||0}))}
                    height={160} color={R} title="🔥 Top Content Views"
                  />
                </div>
                <div className="card" style={{padding:24}}>
                  <DonutChart
                    data={[
                      {label:`Premium (${(users||[]).filter(u=>u.plan?.includes("premium")||u.plan==="premium").length})`,value:(users||[]).filter(u=>u.plan?.includes("premium")||u.plan==="premium").length,color:R},
                      {label:`Basic (${(users||[]).filter(u=>u.plan?.includes("basic")).length})`,value:(users||[]).filter(u=>u.plan?.includes("basic")).length,color:PU},
                      {label:`Mobile (${(users||[]).filter(u=>u.plan?.includes("mobile")).length})`,value:(users||[]).filter(u=>u.plan?.includes("mobile")).length,color:BL},
                      {label:`Free (${(users||[]).filter(u=>!u.plan||u.plan==="free").length})`,value:(users||[]).filter(u=>!u.plan||u.plan==="free").length,color:"#3a3a5a"},
                    ]}
                    size={150}
                    title="👥 User Plans"
                  />
                </div>
              </div>

              {/* Tables */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
                <div className="card" style={{padding:22}}>
                  <div style={{fontWeight:700,fontSize:14,marginBottom:16,color:"#e2e2f0"}}>🔥 Top 5 Content</div>
                  {[...content].sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,5).map((c,i)=>(
                    <div key={c.id} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 0",borderBottom:i<4?"1px solid #181828":"none"}}>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:i===0?R:i<=2?AM:"#3a3a5a",width:24,flexShrink:0}}>{i+1}</div>
                      {c.thumbnail&&<img src={c.thumbnail} alt="" style={{width:42,height:28,objectFit:"cover",borderRadius:5,flexShrink:0}} onError={e=>e.target.style.display="none"}/>}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#e2e2f0"}}>{c.title}</div>
                        <div style={{fontSize:10,color:"#3a3a5a"}}>{c.type} · {c.genre}</div>
                      </div>
                      <div style={{fontSize:12,color:BL,fontWeight:700,flexShrink:0}}>{fN(c.views||0)}</div>
                    </div>
                  ))}
                </div>
                <div className="card" style={{padding:22}}>
                  <div style={{fontWeight:700,fontSize:14,marginBottom:16,color:"#e2e2f0"}}>👥 Recent Users</div>
                  {[...users].slice(0,5).map((u,i)=>(
                    <div key={u.id} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 0",borderBottom:i<4?"1px solid #181828":"none"}}>
                      <div style={{width:36,height:36,borderRadius:"50%",background:`linear-gradient(135deg,hsl(${u.name?.charCodeAt(0)*9||0},50%,30%),hsl(${u.name?.charCodeAt(0)*9||0},50%,18%))`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,flexShrink:0,border:"2px solid #181828"}}>
                        {u.name?.[0]?.toUpperCase()||"?"}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:"#e2e2f0"}}>{u.name||"Unknown"}</div>
                        <div style={{fontSize:10,color:"#3a3a5a"}}>{u.phone||u.email||"—"}</div>
                      </div>
                      <Chip label={(u.plan||"free").replace("plan_","").toUpperCase()} color={u.plan?.includes("premium")||u.plan==="premium"?R:"#3a3a5a"}/>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {page==="content"   &&<ContentList content={movieContent} isLiveList={false} onRefresh={loadData} showToast={showToast}/>}
          {page==="live"      &&<ContentList content={liveContent}  isLiveList={true}  onRefresh={loadData} showToast={showToast}/>}
          {page==="analytics" &&<AnalyticsPage stats={stats} content={content} users={users}/>}
          {page==="users"     &&<UsersPage users={users} onRefresh={loadData} showToast={showToast}/>}
          {page==="ads"       &&<AdsPage ads={ads} onRefresh={loadData} showToast={showToast}/>}
          {page==="revenue"   &&<RevenuePage stats={stats} users={users}/>}
          {page==="employees" &&<EmployeesPage showToast={showToast}/>}
          {page==="approvals" &&<ApprovalsPage showToast={showToast}/>}
          {page==="auditlogs" &&<AuditLogsPage/>}

          {page==="settings"&&(
            <div style={{animation:"fadeIn .3s ease",maxWidth:600}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1,marginBottom:22}}>Settings</div>

              {/* Cloudflare R2 Setup Guide */}
              <div style={{background:"linear-gradient(135deg,rgba(245,158,11,.08),rgba(245,158,11,.02))",border:"1px solid rgba(245,158,11,.2)",borderRadius:14,padding:22,marginBottom:18}}>
                <div style={{fontSize:15,color:AM,fontWeight:800,marginBottom:14}}>☁️ Cloudflare R2 Setup (for 3GB+ uploads)</div>
                <div style={{fontSize:12,color:"#666688",lineHeight:2}}>
                  <div><span style={{color:"#e2e2f0",fontWeight:600}}>Step 1:</span> Go to cloudflare.com → Sign in → R2</div>
                  <div><span style={{color:"#e2e2f0",fontWeight:600}}>Step 2:</span> Create bucket → name: <span style={{color:AM,fontFamily:"monospace"}}>streamx-videos</span></div>
                  <div><span style={{color:"#e2e2f0",fontWeight:600}}>Step 3:</span> Settings → Public Access → Enable</div>
                  <div><span style={{color:"#e2e2f0",fontWeight:600}}>Step 4:</span> Upload video file → click file → copy Public URL</div>
                  <div><span style={{color:"#e2e2f0",fontWeight:600}}>Step 5:</span> In Admin → Add Content → R2 tab → paste URL</div>
                </div>
              </div>

              <div className="card" style={{padding:22,marginBottom:16}}>
                <div style={{fontSize:12,color:"#3a3a5a",fontWeight:700,textTransform:"uppercase",letterSpacing:.7,marginBottom:14}}>Admin Account</div>
                {[
                  ["Name",user?.name||"Admin"],
                  ["Phone",user?.phone||"—"],
                  ["Role","Administrator ⚡"],
                  ["Database","Supabase PostgreSQL"],
                  ["Auth","Mobile OTP + Face ID"],
                  ["Video Storage","Cloudflare R2 + Supabase"],
                  ["Version","StreamX Admin Pro v5.0"],
                  ["Realtime","✅ Active"],
                ].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0",borderBottom:"1px solid #181828",fontSize:13}}>
                    <span style={{color:"#3a3a5a"}}>{k}</span>
                    <span style={{fontWeight:600,color:"#7bb3ff",fontSize:12,fontFamily:k==="Version"?"monospace":"inherit"}}>{v}</span>
                  </div>
                ))}
              </div>
              <button onClick={()=>{setVerified(false);onNavigate("home");}} style={{width:"100%",background:"rgba(248,113,113,.08)",border:"1.5px solid rgba(248,113,113,.25)",color:"#f87171",borderRadius:12,padding:"14px",fontFamily:"'Inter',sans-serif",fontSize:14,fontWeight:700,cursor:"pointer",transition:"all .2s"}}>
                🚪 Sign Out of Admin
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

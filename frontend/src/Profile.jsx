import { useState, useEffect } from "react";
import { API } from "./config.js";
import CustomerSupport from "./CustomerSupport.jsx";
import { supabase, db } from "./supabase.js";
import { promptInstall, canInstall, subscribeToPush } from "./pwa.js";

const RED="#e50914",BG="#07070c",S1="#0f0f16",BD="#1a1a26",MT="#555";

const LANGUAGES=[
  {code:"hi",label:"Hindi",flag:"🇮🇳"},{code:"en",label:"English",flag:"🇬🇧"},
  {code:"kn",label:"Kannada",flag:"🇮🇳"},{code:"ta",label:"Tamil",flag:"🇮🇳"},
  {code:"te",label:"Telugu",flag:"🇮🇳"},{code:"bn",label:"Bengali",flag:"🇮🇳"},
  {code:"ml",label:"Malayalam",flag:"🇮🇳"},{code:"pa",label:"Punjabi",flag:"🇮🇳"},
  {code:"mr",label:"Marathi",flag:"🇮🇳"},{code:"gu",label:"Gujarati",flag:"🇮🇳"},
  {code:"bh",label:"Bhojpuri",flag:"🇮🇳"},{code:"or",label:"Odia",flag:"🇮🇳"},
];

export default function Profile({onNavigate,user,onLogout,onUpgrade}){
  const[tab,setTab]=useState("profile");
  const[userData,setUserData]=useState(user||{});
  const[watchlist,setWatchlist]=useState([]);
  const[history,setHistory]=useState([]);
  const[installable,setInstallable]=useState(canInstall());
  useEffect(()=>{
    const t=setInterval(()=>setInstallable(canInstall()),1000);
    return ()=>clearInterval(t);
  },[]);
  const[notifs,setNotifs]=useState([]);
  const[sub,setSub]=useState(null);
  const[toast,setToast]=useState(null);
  const[toastType,setToastType]=useState("ok");
  const[editName,setEditName]=useState(false);
  const[newName,setNewName]=useState(user?.name||"");
  const[editEmail,setEditEmail]=useState(false);
  const[newEmail,setNewEmail]=useState(user?.email||"");
  const[savingName,setSavingName]=useState(false);
  const[savingEmail,setSavingEmail]=useState(false);
  const[prefs,setPrefs]=useState({autoplay:true,skipIntro:true,notifications:true,emailAlerts:false});
  const[appLang,setAppLang]=useState(user?.language||"en");
  const[showLang,setShowLang]=useState(false);
  const[showSupport,setShowSupport]=useState(false);  // ← AI Support
  const[showDelete,setShowDelete]=useState(false);
  const[deleteConfirm,setDeleteConfirm]=useState("");
  const[deleting,setDeleting]=useState(false);

  useEffect(()=>{
    if(!user?.id)return;
    loadData();
    try{
      const s=localStorage.getItem("streamx_prefs_"+user.id);
      if(s)setPrefs(JSON.parse(s));
      const l=localStorage.getItem("streamx_lang_"+user.id);
      if(l)setAppLang(l);
    }catch(e){}
  },[user?.id]);

  async function loadData(){
    try{
      const[w,h,n,s]=await Promise.all([
        db.getWatchlist(user.id).catch(()=>[]),
        db.getHistory(user.id).catch(()=>[]),
        db.getNotifications(user.id).catch(()=>[]),
        db.getSubscription(user.id).catch(()=>null),
      ]);
      setWatchlist(w||[]);setHistory(h||[]);setNotifs(n||[]);setSub(s||null);
    }catch(e){}
  }

  const showToast=(msg,type="ok")=>{setToast(msg);setToastType(type);setTimeout(()=>setToast(null),3000);};

  async function saveName(){
    if(!newName.trim()||!user?.id)return;
    setSavingName(true);
    try{const u=await db.updateUser(user.id,{name:newName.trim()});setUserData(u||{...userData,name:newName.trim()});localStorage.setItem("streamx_user",JSON.stringify(u||userData));showToast("Name updated ✓");setEditName(false);}
    catch(e){showToast("Failed","err");}
    setSavingName(false);
  }

  async function saveEmail(){
    if(!user?.id)return;
    if(!newEmail.trim()){
      setPrefs(p=>({...p,emailAlerts:false}));savePrefs({...prefs,emailAlerts:false});
      try{await db.updateUser(user.id,{email:""});}catch(e){}
      setUserData(u=>({...u,email:""}));localStorage.setItem("streamx_user",JSON.stringify({...userData,email:""}));
      showToast("Email removed");setEditEmail(false);return;
    }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())){showToast("Enter a valid email","err");return;}
    setSavingEmail(true);
    try{const u=await db.updateUser(user.id,{email:newEmail.trim()});setUserData(u||{...userData,email:newEmail.trim()});localStorage.setItem("streamx_user",JSON.stringify(u||userData));const np={...prefs,emailAlerts:true};setPrefs(np);savePrefs(np);showToast("Email saved ✓");setEditEmail(false);}
    catch(e){showToast("Failed","err");}
    setSavingEmail(false);
  }

  function savePrefs(p){if(!user?.id)return;localStorage.setItem("streamx_prefs_"+user.id,JSON.stringify(p));}

  function togglePref(key){
    if(key==="emailAlerts"&&!prefs.emailAlerts&&!userData?.email){showToast("Add email first","err");setEditEmail(true);return;}
    const n={...prefs,[key]:!prefs[key]};setPrefs(n);savePrefs(n);showToast(n[key]?"Enabled ✓":"Disabled");
  }

  function saveLang(code){
    setAppLang(code);if(user?.id)localStorage.setItem("streamx_lang_"+user.id,code);
    db.updateUser(user.id,{language:code}).catch(()=>{});showToast("Language updated ✓");setShowLang(false);
  }

  async function deleteAccount(){
    if(deleteConfirm.toLowerCase()!=="delete")return;
    setDeleting(true);
    try{
      if(user?.id){
        await supabase.from("watchlist").delete().eq("user_id",user.id).catch(()=>{});
        await supabase.from("watch_history").delete().eq("user_id",user.id).catch(()=>{});
        await supabase.from("notifications").delete().eq("user_id",user.id).catch(()=>{});
        await supabase.from("profiles").delete().eq("user_id",user.id).catch(()=>{});
        await supabase.from("subscriptions").delete().eq("user_id",user.id).catch(()=>{});
        await supabase.from("users").delete().eq("id",user.id).catch(()=>{});
        await supabase.auth.signOut().catch(()=>{});
      }
      localStorage.removeItem("streamx_user");
      localStorage.removeItem("streamx_prefs_"+user?.id);
      localStorage.removeItem("streamx_lang_"+user?.id);
      showToast("Account deleted. Goodbye 👋");
      setTimeout(()=>onLogout(),2000);
    }catch(e){showToast("Delete failed. Try again.","err");}
    setDeleting(false);
  }

  const plan=userData?.plan||"free";
  const planInfo={
    free:{name:"Free",color:"#555",price:"₹0",icon:"🆓"},
    plan_mobile:{name:"Mobile",color:"#3b82f6",price:"₹99/mo",icon:"📱"},
    plan_basic:{name:"Basic",color:"#8b5cf6",price:"₹149/mo",icon:"⭐"},
    plan_premium:{name:"Premium",color:RED,price:"₹249/mo",icon:"👑"},
    plan_annual:{name:"Annual",color:"#f59e0b",price:"₹2499/yr",icon:"🏆"},
    premium:{name:"Premium",color:RED,price:"₹249/mo",icon:"👑"},
  }[plan]||{name:"Free",color:"#555",price:"₹0",icon:"🆓"};

  const unread=notifs.filter(n=>!n.is_read).length;
  const selLang=LANGUAGES.find(l=>l.code===appLang)||LANGUAGES[1];

  const TABS=[
    {id:"profile",label:"Profile",icon:"👤"},
    {id:"watchlist",label:"Watchlist",icon:"♥"},
    {id:"history",label:"History",icon:"🕐"},
    {id:"notifications",label:`Alerts${unread>0?` (${unread})`:""}`,icon:"🔔"},
    {id:"settings",label:"Settings",icon:"⚙️"},
  ];

  const Card=({children,style={}})=>(
    <div style={{background:S1,border:`1px solid ${BD}`,borderRadius:14,padding:16,marginBottom:14,...style}}>{children}</div>
  );

  const Row=({icon,label,sub,right,onClick,last,danger})=>(
    <div onClick={onClick} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",borderBottom:last?"none":`1px solid ${BD}22`,cursor:onClick?"pointer":"default",transition:"opacity .15s"}}
      onMouseEnter={e=>{if(onClick)e.currentTarget.style.opacity=".8";}}
      onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
      {icon&&<div style={{width:34,height:34,borderRadius:9,background:danger?"rgba(248,113,113,.1)":"rgba(255,255,255,.05)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{icon}</div>}
      <div style={{flex:1}}>
        <div style={{fontSize:13,fontWeight:600,color:danger?"#f87171":"#e0e0ee"}}>{label}</div>
        {sub&&<div style={{fontSize:11,color:MT,marginTop:1}}>{sub}</div>}
      </div>
      {right}
      {onClick&&!right&&<div style={{color:"#2a2a3a",fontSize:18}}>›</div>}
    </div>
  );

  const Toggle=({on,onChange})=>(
    <div onClick={onChange} style={{width:44,height:24,borderRadius:12,background:on?RED:"#1f1f2e",position:"relative",cursor:"pointer",transition:"background .2s",flexShrink:0}}>
      <div style={{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:on?23:3,transition:"left .2s"}}/>
    </div>
  );

  return(
    <div style={{minHeight:"100vh",background:BG,fontFamily:"Inter,sans-serif",paddingBottom:80}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .inp{background:#0a0a14;border:1.5px solid #1a1a2c;border-radius:8px;color:#fff;padding:10px 14px;font-size:14px;outline:none;font-family:Inter,sans-serif;width:100%;transition:border-color .2s;}
        .inp:focus{border-color:#e50914;}
        .lang-opt{display:flex;align-items:center;gap:10px;padding:11px 14px;cursor:pointer;border-radius:8px;transition:background .14s;}
        .lang-opt:hover{background:rgba(255,255,255,.05);}
      `}</style>

      {/* AI Customer Support — opens as full screen overlay */}
      {showSupport&&<CustomerSupport user={user} onClose={()=>setShowSupport(false)}/>}

      {/* Toast */}
      {toast&&(
        <div style={{position:"fixed",top:18,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:toastType==="err"?"rgba(248,113,113,.12)":"rgba(0,200,83,.1)",border:`1px solid ${toastType==="err"?"rgba(248,113,113,.3)":"rgba(0,200,83,.3)"}`,color:toastType==="err"?"#f87171":"#00c853",padding:"10px 22px",borderRadius:40,fontSize:13,fontWeight:600,whiteSpace:"nowrap",boxShadow:"0 4px 20px rgba(0,0,0,.5)"}}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{background:`linear-gradient(160deg,${planInfo.color}18,${BG} 55%)`,borderBottom:`1px solid ${BD}`}}>
        <div style={{display:"flex",alignItems:"center",gap:14,padding:"14px 20px 0"}}>
          <div style={{fontWeight:900,fontSize:22,letterSpacing:1,cursor:"pointer"}} onClick={()=>onNavigate("home")}>
            <span style={{color:RED}}>STREAM</span><span style={{color:"#aaa"}}>X</span>
          </div>
          <div style={{flex:1}}/>
          <button onClick={()=>onNavigate("home")} style={{background:"rgba(255,255,255,.06)",border:`1px solid ${BD}`,color:"#aaa",borderRadius:8,padding:"7px 14px",fontSize:12,cursor:"pointer"}}>← Home</button>
        </div>
        <div style={{padding:"20px 20px 0",display:"flex",gap:18,alignItems:"flex-end",flexWrap:"wrap"}}>
          <div style={{width:78,height:78,borderRadius:"50%",background:`linear-gradient(135deg,${planInfo.color}44,${planInfo.color}18)`,border:`3px solid ${planInfo.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,fontWeight:700,flexShrink:0}}>
            {userData?.name?.[0]?.toUpperCase()||"👤"}
          </div>
          <div style={{flex:1,paddingBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
              <div style={{fontSize:22,fontWeight:800}}>{userData?.name||"User"}</div>
              <button onClick={()=>{setEditName(true);setNewName(userData?.name||"");}} style={{background:"none",border:`1px solid ${BD}`,color:MT,borderRadius:6,padding:"2px 8px",fontSize:11,cursor:"pointer"}}>✏️</button>
            </div>
            <div style={{fontSize:12,color:MT}}>
              {userData?.email||userData?.phone||"No contact"} ·
              <span style={{color:planInfo.color,fontWeight:700,marginLeft:6}}>{planInfo.icon} {planInfo.name}</span>
            </div>
            <div style={{display:"flex",gap:20,marginTop:12,flexWrap:"wrap"}}>
              {[[watchlist.length,"Watchlist"],[history.length,"Watched"],[unread,"Alerts"]].map(([n,l])=>(
                <div key={l}>
                  <div style={{fontSize:20,fontWeight:900,color:RED,fontFamily:"serif"}}>{n}</div>
                  <div style={{fontSize:10,color:MT}}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{display:"flex",overflowX:"auto",padding:"0 20px",borderTop:`1px solid ${BD}`,marginTop:16}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",color:tab===t.id?"#fff":MT,fontWeight:tab===t.id?700:500,padding:"10px 14px",cursor:"pointer",fontSize:13,whiteSpace:"nowrap",borderBottom:`2px solid ${tab===t.id?RED:"transparent"}`,fontFamily:"Inter,sans-serif",transition:"all .15s"}}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{maxWidth:580,margin:"0 auto",padding:"16px 16px 40px"}}>

        {/* ══ PROFILE ══ */}
        {tab==="profile"&&(
          <div style={{animation:"fadeUp .3s ease"}}>
            <div style={{background:`linear-gradient(120deg,${planInfo.color}18,${planInfo.color}06)`,border:`1px solid ${planInfo.color}33`,borderRadius:14,padding:18,marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div>
                  <div style={{fontSize:20,fontWeight:900,color:planInfo.color}}>{planInfo.icon} {planInfo.name} Plan</div>
                  <div style={{fontSize:12,color:MT,marginTop:2}}>{sub?`Active · Expires ${new Date(sub.end_date).toLocaleDateString("en-IN")}`:"No active subscription"}</div>
                </div>
                <div style={{fontSize:22,fontWeight:900}}>{planInfo.price}</div>
              </div>
              <button onClick={onUpgrade} style={{width:"100%",background:planInfo.color,border:"none",color:"#fff",borderRadius:8,padding:"11px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>
                {plan==="plan_premium"||plan==="premium"?"Manage Subscription":"Upgrade to Premium 👑"}
              </button>
            </div>
            {editName&&(
              <Card>
                <div style={{fontSize:11,color:MT,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:10}}>Edit Name</div>
                <input className="inp" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Enter your name" autoFocus onKeyDown={e=>{if(e.key==="Enter")saveName();if(e.key==="Escape")setEditName(false);}}/>
                <div style={{display:"flex",gap:8,marginTop:10}}>
                  <button onClick={()=>setEditName(false)} style={{flex:1,background:"rgba(255,255,255,.06)",border:`1px solid ${BD}`,color:"#aaa",borderRadius:8,padding:"9px",fontSize:13,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Cancel</button>
                  <button onClick={saveName} disabled={savingName||!newName.trim()} style={{flex:2,background:RED,border:"none",color:"#fff",borderRadius:8,padding:"9px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{savingName?"Saving...":"Save Name"}</button>
                </div>
              </Card>
            )}
            <Card>
              <div style={{fontSize:11,color:MT,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:10}}>Personal Info</div>
              <Row label="Full Name" sub={userData?.name||"Not set"} onClick={()=>{setEditName(true);setNewName(userData?.name||"");}}/>
              <Row label="Mobile Number" sub={userData?.phone||"Not set"}/>
              <Row label="Email Address" sub={userData?.email||"Not added"} onClick={()=>{setEditEmail(true);setNewEmail(userData?.email||"");}} last/>
            </Card>
            {editEmail&&(
              <Card>
                <div style={{fontSize:11,color:MT,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>Email Address</div>
                <div style={{fontSize:12,color:MT,marginBottom:10}}>Used for login OTP and notifications</div>
                <input className="inp" value={newEmail} onChange={e=>setNewEmail(e.target.value)} placeholder="Enter email address" type="email" autoFocus onKeyDown={e=>{if(e.key==="Enter")saveEmail();if(e.key==="Escape")setEditEmail(false);}}/>
                <div style={{display:"flex",gap:8,marginTop:10}}>
                  <button onClick={()=>setEditEmail(false)} style={{flex:1,background:"rgba(255,255,255,.06)",border:`1px solid ${BD}`,color:"#aaa",borderRadius:8,padding:"9px",fontSize:13,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Cancel</button>
                  <button onClick={saveEmail} disabled={savingEmail} style={{flex:2,background:RED,border:"none",color:"#fff",borderRadius:8,padding:"9px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{savingEmail?"Saving...":"Save Email"}</button>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ══ WATCHLIST ══ */}
        {tab==="watchlist"&&(
          <Card>
            <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>My Watchlist ({watchlist.length})</div>
            {watchlist.length===0?(
              <div style={{textAlign:"center",padding:"32px 0",color:MT}}>
                <div style={{fontSize:36,marginBottom:10}}>♥</div>
                <div>Nothing saved yet</div>
                <div style={{fontSize:12,marginTop:4}}>Tap + My List while watching</div>
              </div>
            ):watchlist.map((item,i)=>{
              const c=item.content||{};
              return(
                <div key={item.id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",borderBottom:i<watchlist.length-1?`1px solid ${BD}22`:"none"}}>
                  <div style={{width:52,height:36,borderRadius:6,background:`linear-gradient(135deg,${RED}22,#0a0a0f)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🎬</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.title||"Unknown"}</div>
                    <div style={{fontSize:11,color:MT}}>{c.genre} · {c.type}</div>
                  </div>
                  <button onClick={async()=>{await db.removeFromWatchlist(user.id,item.content_id).catch(()=>{});setWatchlist(w=>w.filter(x=>x.id!==item.id));showToast("Removed");}} style={{background:"rgba(255,255,255,.04)",border:`1px solid ${BD}`,color:MT,borderRadius:6,padding:"5px 9px",fontSize:11,cursor:"pointer"}}>✕</button>
                </div>
              );
            })}
          </Card>
        )}

        {/* ══ HISTORY ══ */}
        {tab==="history"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:700}}>Watch History ({history.length})</div>
              {history.length>0&&<button onClick={async()=>{await db.clearHistory(user.id).catch(()=>{});setHistory([]);showToast("History cleared");}} style={{background:"rgba(248,113,113,.08)",border:"1px solid rgba(248,113,113,.2)",color:"#f87171",borderRadius:7,padding:"5px 12px",fontSize:11,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Clear All</button>}
            </div>
            <Card>
              {history.length===0?(
                <div style={{textAlign:"center",padding:"32px 0",color:MT}}>
                  <div style={{fontSize:36,marginBottom:10}}>🕐</div>
                  <div>No watch history yet</div>
                </div>
              ):history.map((item,i)=>{
                const c=item.content||{};
                return(
                  <div key={item.id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",borderBottom:i<history.length-1?`1px solid ${BD}22`:"none"}}>
                    <div style={{width:52,height:36,borderRadius:6,background:`linear-gradient(135deg,${RED}22,#0a0a0f)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🎬</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.title||"Unknown"}</div>
                      <div style={{fontSize:11,color:MT,marginTop:2}}>
                        {item.progress_pct||0}% watched · {new Date(item.watched_at).toLocaleDateString("en-IN")}
                      </div>
                      {item.progress_pct>0&&item.progress_pct<100&&(
                        <div style={{height:3,background:"#1a1a26",borderRadius:2,marginTop:5,overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${item.progress_pct}%`,background:RED,borderRadius:2}}/>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>
        )}

        {/* ══ NOTIFICATIONS ══ */}
        {tab==="notifications"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:700}}>Notifications ({notifs.length})</div>
              {unread>0&&<button onClick={async()=>{await db.markAllNotifsRead(user.id).catch(()=>{});setNotifs(n=>n.map(x=>({...x,is_read:true})));showToast("All marked read");}} style={{background:"rgba(255,255,255,.06)",border:`1px solid ${BD}`,color:"#aaa",borderRadius:7,padding:"5px 12px",fontSize:11,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Mark all read</button>}
            </div>
            <Card>
              {notifs.length===0?(
                <div style={{textAlign:"center",padding:"32px 0",color:MT}}>
                  <div style={{fontSize:36,marginBottom:10}}>🔔</div>
                  <div>No notifications yet</div>
                </div>
              ):notifs.map((n,i)=>(
                <div key={n.id} onClick={()=>{if(!n.is_read)db.markNotifRead(n.id).catch(()=>{});setNotifs(ns=>ns.map(x=>x.id===n.id?{...x,is_read:true}:x));}}
                  style={{display:"flex",gap:12,padding:"12px 0",borderBottom:i<notifs.length-1?`1px solid ${BD}22`:"none",cursor:"pointer",opacity:n.is_read?.6:1}}>
                  <div style={{width:34,height:34,borderRadius:9,background:n.is_read?"rgba(255,255,255,.04)":"rgba(229,9,20,.1)",border:`1px solid ${n.is_read?BD:"rgba(229,9,20,.2)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>
                    {n.type==="welcome"?"🎉":n.type==="subscription"?"👑":n.type==="system"?"⚙️":"🔔"}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:n.is_read?500:700,fontSize:13,marginBottom:2}}>{n.title}</div>
                    <div style={{fontSize:11,color:MT,lineHeight:1.4}}>{n.message}</div>
                    <div style={{fontSize:10,color:"#2a2a3a",marginTop:4}}>{new Date(n.created_at).toLocaleDateString("en-IN")}</div>
                  </div>
                  {!n.is_read&&<div style={{width:8,height:8,borderRadius:"50%",background:RED,flexShrink:0,marginTop:4}}/>}
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* ══ SETTINGS ══ */}
        {tab==="settings"&&(
          <div style={{animation:"fadeUp .3s ease"}}>

            {/* Preferences */}
            <Card>
              <div style={{fontSize:11,color:MT,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:10}}>Playback</div>
              <Row label="Autoplay Next" sub="Auto-play next episode" right={<Toggle on={prefs.autoplay} onChange={()=>togglePref("autoplay")}/>}/>
              <Row label="Skip Intro" sub="Automatically skip intros" right={<Toggle on={prefs.skipIntro} onChange={()=>togglePref("skipIntro")}/>}/>
              <Row label="Notifications" sub="Push alerts for new content" right={<Toggle on={prefs.notifications} onChange={()=>togglePref("notifications")}/>}/>
              <Row label="Email Alerts" sub={userData?.email?"Alerts to "+userData.email:"Add email first"} right={<Toggle on={prefs.emailAlerts} onChange={()=>togglePref("emailAlerts")}/>} last/>
            </Card>

            {/* Language */}
            <Card>
              <div style={{fontSize:11,color:MT,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:10}}>Language</div>
              <Row icon="🌐" label="App Language" sub={`${selLang.flag} ${selLang.label}`} onClick={()=>setShowLang(true)} last/>
            </Card>
            {showLang&&(
              <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,.8)",display:"flex",alignItems:"flex-end"}} onClick={()=>setShowLang(false)}>
                <div style={{width:"100%",background:"#0f0f16",borderRadius:"16px 16px 0 0",padding:"16px 0 32px",maxHeight:"70vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
                  <div style={{textAlign:"center",width:36,height:4,borderRadius:2,background:"#2a2a3a",margin:"0 auto 16px"}}/>
                  <div style={{fontSize:13,fontWeight:700,padding:"0 16px",marginBottom:10}}>Select Language</div>
                  {LANGUAGES.map(l=>(
                    <div key={l.code} className="lang-opt" onClick={()=>saveLang(l.code)}>
                      <span style={{fontSize:20}}>{l.flag}</span>
                      <span style={{fontSize:14,fontWeight:appLang===l.code?700:400}}>{l.label}</span>
                      {appLang===l.code&&<span style={{marginLeft:"auto",color:RED,fontSize:16}}>✓</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Support & Help */}
            <Card>
              <div style={{fontSize:11,color:MT,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:10}}>Support & Help</div>
              {/* ← AI CUSTOMER SUPPORT BUTTON */}
              <Row icon="🤖" label="AI Customer Support" sub="Chat with our AI — available 24/7" onClick={()=>setShowSupport(true)}/>
              {installable&&<Row icon="📲" label="Install App" sub="Add StreamX to your home screen" onClick={async()=>{const ok=await promptInstall();if(ok)setInstallable(false);}}/>}
              {"Notification" in window && Notification.permission!=="granted" && (
                <Row icon="🔔" label="Enable Notifications" sub="Get notified about new releases" onClick={async()=>{
                  const perm=await Notification.requestPermission();
                  if(perm!=="granted"){showToast("Notifications blocked — enable in browser settings");return;}
                  const token=localStorage.getItem("streamx_token");
                  const ok=await subscribeToPush(API, token);
                  showToast(ok?"Notifications enabled":"Could not enable notifications right now");
                }}/>
              )}
              <Row icon="📧" label="Email Support" sub="support@streamx.in" onClick={()=>window.open("mailto:support@streamx.in")}/>
              <Row icon="📋" label="Terms of Use" onClick={()=>showToast("Coming soon")}/>
              <Row icon="🔒" label="Privacy Policy" onClick={()=>showToast("Coming soon")} last/>
            </Card>

            {/* Account */}
            <Card>
              <div style={{fontSize:11,color:MT,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:10}}>Account</div>
              <Row icon="🚪" label="Sign Out" sub="Sign out from this device" onClick={()=>{localStorage.removeItem("streamx_user");onLogout();}}/>
              <Row icon="🗑️" label="Delete Account" sub="Permanently delete your account" onClick={()=>setShowDelete(true)} danger last/>
            </Card>

            {/* Delete confirm */}
            {showDelete&&(
              <Card style={{border:"1px solid rgba(248,113,113,.3)",background:"rgba(248,113,113,.04)"}}>
                <div style={{fontSize:14,fontWeight:700,color:"#f87171",marginBottom:6}}>⚠️ Delete Account</div>
                <div style={{fontSize:12,color:MT,marginBottom:12,lineHeight:1.6}}>This permanently deletes all your data — watchlist, history, subscriptions. This cannot be undone.</div>
                <div style={{fontSize:11,color:MT,marginBottom:6}}>Type <strong style={{color:"#fff"}}>delete</strong> to confirm:</div>
                <input className="inp" value={deleteConfirm} onChange={e=>setDeleteConfirm(e.target.value)} placeholder='Type "delete" to confirm'/>
                <div style={{display:"flex",gap:8,marginTop:10}}>
                  <button onClick={()=>{setShowDelete(false);setDeleteConfirm("");}} style={{flex:1,background:"rgba(255,255,255,.06)",border:`1px solid ${BD}`,color:"#aaa",borderRadius:8,padding:"9px",fontSize:13,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Cancel</button>
                  <button onClick={deleteAccount} disabled={deleting||deleteConfirm.toLowerCase()!=="delete"} style={{flex:2,background:deleteConfirm.toLowerCase()==="delete"?"#f87171":"#1a1a26",border:"none",color:"#fff",borderRadius:8,padding:"9px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{deleting?"Deleting...":"Delete Forever"}</button>
                </div>
              </Card>
            )}

            <div style={{fontSize:11,color:"#1a1a26",textAlign:"center",marginTop:20}}>StreamX v4.0 · Made with ❤️ in India</div>
          </div>
        )}
      </div>
    </div>
  );
}

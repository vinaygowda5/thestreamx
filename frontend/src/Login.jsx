import { useState, useEffect, useRef } from "react";
import { API } from "./config.js";
import { supabase, db } from "./supabase.js";

/*
  Streamx Login — Email OTP
  Uses Supabase Auth directly (works without Railway backend)
  Switch to backend later when Railway is ready
*/

const ADMIN_EMAILS = ["admin@cthestreamx.in","vinaygowda12096909@gmail.com","admin@streamx.in"];
const TEST_EMAIL   = "test@streamx.dev";
const TEST_CODE    = "000000";

// Saves the user locally AND fetches a backend JWT so Payment.jsx (and any
// other backend-only route) actually has a valid token to send. Previously
// nothing ever set streamx_token, so those routes always failed auth.
async function establishSession(user){
  localStorage.setItem("streamx_user", JSON.stringify(user));
  if (user?.email === TEST_EMAIL) return; // dev test account has no real backend row
  try{
    const res = await fetch(`${API}/api/auth/session`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ email: user.email }),
    });
    const json = await res.json();
    if (json.success && json.data?.token) localStorage.setItem("streamx_token", json.data.token);
  }catch(e){ /* backend may be briefly down — user can still browse, payment will just prompt re-auth */ }
}

const PLAN_DEVICES = {
  free:1,plan_mobile:1,plan_basic:2,plan_premium:4,plan_annual:4,premium:4,
};

function getDeviceId(){
  let id=localStorage.getItem("nc_device_id");
  if(!id){id="dev_"+Date.now()+"_"+Math.random().toString(36).slice(2,10);localStorage.setItem("nc_device_id",id);}
  return id;
}
function getDeviceName(){
  const ua=navigator.userAgent;
  if(/iPhone/i.test(ua))return"iPhone";
  if(/iPad/i.test(ua))return"iPad";
  if(/Android.*Mobile/i.test(ua))return"Android Phone";
  if(/Android/i.test(ua))return"Android Tablet";
  if(/Windows/i.test(ua))return"Windows PC";
  if(/Mac/i.test(ua))return"Mac";
  return"Unknown Device";
}
function getDeviceOS(){
  const ua=navigator.userAgent;
  if(/iPhone|iPad|iPod/i.test(ua))return"iOS";
  if(/Android/i.test(ua))return"Android";
  if(/Windows/i.test(ua))return"Windows";
  if(/Mac/i.test(ua))return"macOS";
  return"Unknown";
}

export default function Login({onLogin}){
  const[step,        setStep]        =useState("email");
  const[email,       setEmail]       =useState("");
  const[phone,       setPhone]       =useState("");
  const[otp,         setOtp]         =useState(["","","","","",""]);
  const[error,       setError]       =useState("");
  const[loading,     setLoading]     =useState(false);
  const[timer,       setTimer]       =useState(0);
  const[activeDevs,  setActiveDevs]  =useState([]);
  const[pendingUser, setPendingUser] =useState(null);

  const refs=[useRef(),useRef(),useRef(),useRef(),useRef(),useRef()];

  useEffect(()=>{
    if(timer<=0)return;
    const t=setTimeout(()=>setTimer(s=>s-1),1000);
    return()=>clearTimeout(t);
  },[timer]);

  const clean      = email.trim().toLowerCase();
  const isTest     = clean===TEST_EMAIL;
  const canSend    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)&&!loading;
  const canVerify  = otp.join("").length===6&&!loading;

  async function sendOTP(){
    setError("");if(!canSend)return;
    setLoading(true);
    if(!isTest){
      const{error}=await supabase.auth.signInWithOtp({
        email:clean,
        options:{shouldCreateUser:true}
      });
      if(error){setLoading(false);setError("Failed to send OTP. Check your email.");return;}
    }
    setLoading(false);
    setStep("otp");setTimer(60);
    setOtp(["","","","","",""]);
    setTimeout(()=>refs[0].current?.focus(),150);
  }

  async function verifyOTP(code){
    const c=code||otp.join("");
    if(c.length<6)return;
    setError("");setLoading(true);

    try{
      // TEST EMAIL — skip real OTP
      if(isTest){
        if(c!==TEST_CODE){
          setError("Wrong test code. Use "+TEST_CODE);
          setLoading(false);setOtp(["","","","","",""]);
          setTimeout(()=>refs[0].current?.focus(),100);return;
        }
        let user=await supabase.from("users").select("*").eq("email",clean).single().then(r=>r.data);
        if(!user){
          const{data,error}=await supabase.from("users").insert({
            name:"Test Admin",email:clean,phone:"",
            role:"admin",plan:"premium",is_active:true,
          }).select().single();
          if(error)throw error;
          user=data;
        }
        if(!user.is_active){setError("Account suspended.");setLoading(false);return;}
        const ok=await checkDeviceLimit(user);
        if(!ok){setPendingUser(user);setStep("devices");setLoading(false);return;}
        await registerDevice(user);
        establishSession(user);
        onLogin(user);setLoading(false);return;
      }

      // REAL EMAIL OTP via Supabase Auth
      const{data,error}=await supabase.auth.verifyOtp({
        email:clean,token:c,type:"email"
      });
      if(error||!data?.user){
        setError("Wrong OTP. Please try again.");
        setLoading(false);setOtp(["","","","","",""]);
        setTimeout(()=>refs[0].current?.focus(),100);return;
      }

      const authId=data.user.id;
      const isAdmin=ADMIN_EMAILS.includes(clean);

      // Find existing user
      let user=await supabase.from("users").select("*").eq("id",authId).single().then(r=>r.data).catch(()=>null);
      if(!user)user=await supabase.from("users").select("*").eq("email",clean).single().then(r=>r.data).catch(()=>null);

      if(user){
        // Existing user — welcome back
        if(!user.is_active){setError("Account suspended. Contact support@streamx.in");setLoading(false);return;}
        const ok=await checkDeviceLimit(user);
        if(!ok){setPendingUser(user);setStep("devices");setLoading(false);return;}
        await registerDevice(user);
        establishSession(user);
        onLogin(user);
      } else {
        // New user — ask for phone
        setPendingUser({id:authId,email:clean,role:isAdmin?"admin":"user",plan:isAdmin?"premium":"free",is_active:true});
        setStep("phone");
      }
    }catch(e){
      setError("Login failed: "+e.message);
      console.error(e);
    }
    setLoading(false);
  }

  async function savePhoneAndCreate(){
    setError("");setLoading(true);
    const fullPhone=phone.replace(/\D/g,"").length===10?"+91"+phone.replace(/\D/g,""):"";

    try{
      // Check phone not used by another account
      if(fullPhone){
        const phoneCheck=await supabase.from("users").select("id,email").eq("phone",fullPhone).maybeSingle();
        const existing=phoneCheck.data;
        if(existing&&existing.id!==pendingUser.id){
          setError(`Account already exists for this number (${existing.email}). Please use that email to login.`);
          setLoading(false);return;
        }
      }

      const insertRes=await supabase.from("users").insert({
        id:pendingUser.id,
        name:clean.split("@")[0],
        email:pendingUser.email,
        phone:fullPhone,
        role:pendingUser.role,
        plan:pendingUser.plan,
        is_active:true,
      }).select().single();

      if(insertRes.error)throw insertRes.error;
      const newUser=insertRes.data;

      await supabase.from("notifications").insert({
        user_id:newUser.id,type:"welcome",
        title:"Welcome to Streamx! 🎬",
        message:"Welcome to Streamx! Start watching now.",
      });

      const allowed=await checkDeviceLimit(newUser);
      if(!allowed){setPendingUser(newUser);setStep("devices");setLoading(false);return;}
      await registerDevice(newUser);
      establishSession(newUser);
      onLogin(newUser);
    }catch(e){
      setError("Account creation failed: "+e.message);
      console.error(e);
    }
    setLoading(false);
  }

  async function checkDeviceLimit(user){
    const limit=PLAN_DEVICES[user.plan]||1;
    const deviceId=getDeviceId();
    try{
      const{data:sessions}=await supabase.from("user_sessions").select("*").eq("user_id",user.id).eq("is_active",true);
      if(!sessions||sessions.length===0)return true;
      if(sessions.find(s=>s.device_id===deviceId))return true;
      if(sessions.length<limit)return true;
      setActiveDevs(sessions);return false;
    }catch(e){return true;}
  }

  async function registerDevice(user){
    try{
      await supabase.from("user_sessions").upsert({
        user_id:user.id,device_id:getDeviceId(),
        device_name:getDeviceName(),device_os:getDeviceOS(),
        is_active:true,last_active:new Date().toISOString(),
      },{onConflict:"user_id,device_id"});
    }catch(e){}
  }

  async function signOutDevice(id){
    try{
      await supabase.from("user_sessions").update({is_active:false}).eq("id",id);
      const updated=activeDevs.filter(d=>d.id!==id);
      setActiveDevs(updated);
      if(pendingUser&&updated.length<(PLAN_DEVICES[pendingUser.plan]||1)){
        await registerDevice(pendingUser);
        establishSession(pendingUser);
        onLogin(pendingUser);
      }
    }catch(e){setError("Failed to sign out.");}
  }

  async function signOutAll(){
    try{
      await supabase.from("user_sessions").update({is_active:false}).eq("user_id",pendingUser.id);
      await registerDevice(pendingUser);
      establishSession(pendingUser);
      onLogin(pendingUser);
    }catch(e){setError("Failed. Try again.");}
  }

  function handleOTPInput(i,v){
    if(!/^\d?$/.test(v))return;
    const n=[...otp];n[i]=v;setOtp(n);
    if(v&&i<5)refs[i+1].current?.focus();
    if(!v&&i>0)refs[i-1].current?.focus();
    if(v&&i===5)setTimeout(()=>verifyOTP([...otp.slice(0,5),v].join("")),80);
  }
  function handlePaste(e){
    e.preventDefault();
    const p=e.clipboardData.getData("text").replace(/\D/g,"").slice(0,6);
    if(p.length===6){setOtp(p.split(""));refs[5].current?.focus();setTimeout(()=>verifyOTP(p),80);}
  }

  const inp={width:"100%",height:52,background:"#0f0f18",border:"1.5px solid #1e1e2e",borderRadius:10,color:"#fff",fontSize:15,padding:"0 14px",fontFamily:"Inter,sans-serif",outline:"none"};
  const btn=(on)=>({width:"100%",height:52,background:on?"linear-gradient(135deg,#e50914,#c00)":"#141420",color:"#fff",border:"none",borderRadius:12,fontWeight:800,fontSize:15,cursor:on?"pointer":"not-allowed",fontFamily:"Inter,sans-serif",transition:"all .2s"});
  const planLabel={free:"Free (1 device)",plan_mobile:"Mobile (1 device)",plan_basic:"Basic (2 devices)",plan_premium:"Premium (4 devices)",plan_annual:"Annual (4 devices)",premium:"Premium (4 devices)"};

  return(
    <div style={{minHeight:"100vh",background:"#07070c",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"Inter,sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        .otp-inp{width:46px;height:56px;border-radius:10px;background:#0f0f18;border:2px solid #1e1e2e;color:#fff;font-size:22px;text-align:center;font-family:Inter,sans-serif;transition:border-color .2s;-webkit-appearance:none;outline:none;}
        .otp-inp:focus{border-color:#e50914;}
        input:focus{border-color:#e50914!important;}
        input:-webkit-autofill{-webkit-box-shadow:0 0 0 30px #0f0f18 inset!important;-webkit-text-fill-color:#fff!important;}
        .dev-card{display:flex;align-items:center;gap:12px;padding:12px 14px;background:#0a0a14;border:1px solid #1e1e2e;border-radius:10px;margin-bottom:8px;}
      `}</style>

      <div style={{background:"rgba(13,13,22,.98)",border:"1px solid #1a1a28",borderRadius:22,padding:"36px 24px 28px",width:"100%",maxWidth:380,animation:"fadeUp .4s ease"}}>

        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontWeight:900,fontSize:36,letterSpacing:2,lineHeight:1.1,marginBottom:5}}>
            <span style={{color:"#e50914"}}>STREAM</span><span style={{color:"#fff"}}>X</span>
          </div>
          <div style={{fontSize:12,color:"#2a2a3a"}}>India's Premium OTT</div>
        </div>

        {/* STEP 1 — EMAIL */}
        {step==="email"&&(
          <div style={{animation:"fadeUp .25s ease"}}>
            <div style={{fontSize:13,color:"#aaa",marginBottom:20,textAlign:"center",lineHeight:1.7,fontWeight:600}}>
              Enter your email to continue<br/>
              <span style={{fontSize:11,color:"#444"}}>We'll send a 6-digit verification code</span>
            </div>
            <div style={{fontSize:10,color:"#333",fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>Email Address</div>
            <input style={inp} value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@email.com" type="email" autoFocus onKeyDown={e=>e.key==="Enter"&&canSend&&sendOTP()}/>
            {error&&<div style={{background:"rgba(248,113,113,.08)",border:"1px solid rgba(248,113,113,.2)",borderRadius:8,padding:"9px 12px",marginTop:10,color:"#f87171",fontSize:12}}>❌ {error}</div>}
            <button style={{...btn(canSend),marginTop:14}} onClick={sendOTP} disabled={!canSend}>{loading?"Sending code...":"Send OTP →"}</button>
            <div style={{textAlign:"center",marginTop:16,fontSize:11,color:"#1a1a28",lineHeight:1.8}}>By continuing, you agree to Streamx<br/>Terms of Use and Privacy Policy</div>
          </div>
        )}

        {/* STEP 2 — OTP */}
        {step==="otp"&&(
          <div style={{animation:"fadeUp .25s ease"}}>
            <div style={{textAlign:"center",marginBottom:22}}>
              <div style={{width:56,height:56,borderRadius:"50%",background:"rgba(229,9,20,.1)",border:"2px solid rgba(229,9,20,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,margin:"0 auto 10px"}}>📧</div>
              <div style={{fontSize:13,color:"#555",marginBottom:2}}>Code sent to</div>
              <div style={{fontSize:15,fontWeight:800,color:"#fff",marginBottom:4}}>{email}</div>
              <div style={{fontSize:12,color:"#444",marginBottom:6}}>{isTest?"Test mode — use code below":"Check your inbox and spam folder"}</div>
              <button onClick={()=>{setStep("email");setError("");setOtp(["","","","","",""]);}} style={{background:"none",border:"none",color:"#e50914",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>← Change email</button>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:20}}>
              {otp.map((v,i)=><input key={i} ref={refs[i]} value={v} onChange={e=>handleOTPInput(i,e.target.value)} onPaste={handlePaste} maxLength={1} type="tel" inputMode="numeric" className="otp-inp" style={{borderColor:v?"#e50914":"#1e1e2e"}}/>)}
            </div>
            {error&&<div style={{background:"rgba(248,113,113,.08)",border:"1px solid rgba(248,113,113,.2)",borderRadius:8,padding:"9px 12px",marginBottom:12,color:"#f87171",fontSize:12,textAlign:"center"}}>❌ {error}</div>}
            <button style={{...btn(canVerify),marginBottom:12}} onClick={()=>verifyOTP()} disabled={!canVerify}>{loading?"Verifying...":"Verify OTP →"}</button>
            <div style={{textAlign:"center",fontSize:13}}>
              {timer>0
                ?<span style={{color:"#333"}}>Resend in <span style={{color:"#e50914",fontWeight:700}}>{timer}s</span></span>
                :<button onClick={()=>{sendOTP();setOtp(["","","","","",""]);}} style={{background:"none",border:"none",color:"#e50914",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"Inter,sans-serif"}}>Resend OTP</button>
              }
            </div>
            {isTest&&<div style={{textAlign:"center",marginTop:10,fontSize:11,color:"#f59e0b",background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.2)",borderRadius:8,padding:"7px 10px"}}>⚠️ Test mode — code is {TEST_CODE}</div>}
          </div>
        )}

        {/* STEP 3 — PHONE (new users) */}
        {step==="phone"&&(
          <div style={{animation:"fadeUp .25s ease"}}>
            <div style={{textAlign:"center",marginBottom:22}}>
              <div style={{width:56,height:56,borderRadius:"50%",background:"rgba(0,200,83,.08)",border:"2px solid rgba(0,200,83,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,margin:"0 auto 10px"}}>✅</div>
              <div style={{fontWeight:800,fontSize:17,color:"#fff",marginBottom:6}}>Email Verified!</div>
              <div style={{fontSize:13,color:"#888",lineHeight:1.6}}>Add your mobile number to link all devices to one account.</div>
            </div>
            <div style={{fontSize:10,color:"#333",fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>Mobile Number (optional)</div>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <div style={{...inp,width:72,flex:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
                <span style={{fontSize:16}}>🇮🇳</span><span style={{color:"#888",fontSize:13,fontWeight:700}}>+91</span>
              </div>
              <input style={{...inp,flex:1}} value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="10-digit number" type="tel" maxLength={10} autoFocus onKeyDown={e=>e.key==="Enter"&&savePhoneAndCreate()}/>
            </div>
            {error&&<div style={{background:"rgba(248,113,113,.08)",border:"1px solid rgba(248,113,113,.2)",borderRadius:8,padding:"9px 12px",marginBottom:10,color:"#f87171",fontSize:12}}>❌ {error}</div>}
            <button style={{...btn(true),marginBottom:8}} onClick={savePhoneAndCreate} disabled={loading}>{loading?"Creating account...":"Start Watching 🎬"}</button>
          </div>
        )}

        {/* STEP 4 — DEVICE LIMIT */}
        {step==="devices"&&pendingUser&&(
          <div style={{animation:"fadeUp .25s ease"}}>
            <div style={{textAlign:"center",marginBottom:18}}>
              <div style={{fontSize:40,marginBottom:10}}>📱</div>
              <div style={{fontWeight:800,fontSize:17,color:"#fff",marginBottom:6}}>Device Limit Reached</div>
              <div style={{fontSize:13,color:"#888",lineHeight:1.6}}>
                Your plan allows <span style={{color:"#fff",fontWeight:700}}>{PLAN_DEVICES[pendingUser.plan]||1}</span> device{(PLAN_DEVICES[pendingUser.plan]||1)>1?"s":""}.<br/>Sign out from another device to continue.
              </div>
            </div>
            {activeDevs.map(d=>(
              <div key={d.id} className="dev-card">
                <span style={{fontSize:22}}>{d.device_os==="iOS"||d.device_os==="Android"?"📱":"💻"}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#fff"}}>{d.device_name||"Unknown"}</div>
                  <div style={{fontSize:11,color:"#555"}}>Last active {d.last_active?new Date(d.last_active).toLocaleDateString("en-IN"):"recently"}</div>
                </div>
                <button onClick={()=>signOutDevice(d.id)} style={{background:"rgba(248,113,113,.08)",border:"1px solid rgba(248,113,113,.2)",color:"#f87171",borderRadius:7,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Sign Out</button>
              </div>
            ))}
            <button onClick={signOutAll} style={{width:"100%",background:"rgba(229,9,20,.12)",border:"1px solid rgba(229,9,20,.3)",color:"#e50914",borderRadius:10,padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif",marginBottom:10}}>Sign Out All & Continue</button>
            <div style={{background:"rgba(229,9,20,.06)",border:"1px solid rgba(229,9,20,.15)",borderRadius:10,padding:"12px",marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#e50914",marginBottom:6}}>👑 Need more screens? Upgrade!</div>
              <div style={{display:"flex",gap:6}}>
                {[{p:"Basic",pr:"₹299",d:"2 devices"},{p:"Premium",pr:"₹499",d:"4 devices"}].map(x=>(
                  <div key={x.p} style={{flex:1,background:"rgba(255,255,255,.04)",borderRadius:7,padding:"7px",textAlign:"center"}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#fff"}}>{x.p}</div>
                    <div style={{fontSize:12,color:"#e50914",fontWeight:800}}>{x.pr}<span style={{fontSize:9,color:"#555",fontWeight:400}}>/mo</span></div>
                    <div style={{fontSize:10,color:"#555"}}>{x.d}</div>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={()=>{setStep("email");setError("");setOtp(["","","","","",""]);setPendingUser(null);}} style={{width:"100%",background:"rgba(255,255,255,.04)",border:"1px solid #1e1e2e",color:"#555",borderRadius:10,padding:"10px",fontSize:12,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>← Back</button>
          </div>
        )}
      </div>
    </div>
  );
}

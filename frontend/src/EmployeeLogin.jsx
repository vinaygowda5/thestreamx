import { useState } from "react";
import { API } from "./config.js";

function isMobileDevice(){
  return /Android|iPhone|iPad|iPod|Mobile|BlackBerry|Windows Phone|Opera Mini/i.test(navigator.userAgent);
}

export default function EmployeeLogin({onLogin, onBack}){
  const[email,setEmail]=useState("");
  const[employeeId,setEmployeeId]=useState("");
  const[password,setPassword]=useState("");
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState("");
  const mobile=isMobileDevice();

  async function submit(e){
    e.preventDefault();
    setError("");
    if(mobile){setError("Employee accounts can only sign in from a desktop or laptop.");return;}
    if(!email.trim()||!employeeId.trim()||!password.trim()){setError("Fill in all three fields");return;}
    setLoading(true);
    try{
      const res=await fetch(`${API}/api/employee-auth/login`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({email:email.trim(),employeeId:employeeId.trim(),password}),
      });
      const json=await res.json();
      if(!json.success)throw new Error(json.msg||"Login failed");
      localStorage.setItem("streamx_token",json.data.token);
      localStorage.setItem("streamx_user",JSON.stringify({
        id:json.data.user.id,name:json.data.user.name,email:json.data.user.email,
        role:"employee",
      }));
      onLogin(json.data.user);
    }catch(err){setError(err.message);}
    setLoading(false);
  }

  return(
    <div style={{minHeight:"100vh",background:"#07070c",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Inter,sans-serif",padding:20}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontWeight:900,fontSize:32,letterSpacing:1}}>
            <span style={{color:"#e50914"}}>STREAM</span><span style={{color:"#aaa"}}>X</span>
          </div>
          <div style={{fontSize:12,color:"#555",marginTop:6}}>Staff Login</div>
        </div>

        {mobile&&(
          <div style={{background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.3)",color:"#f87171",borderRadius:10,padding:14,fontSize:13,marginBottom:16,textAlign:"center"}}>
            📵 Employee accounts can only sign in from a desktop or laptop computer, not a mobile device.
          </div>
        )}

        <form onSubmit={submit} style={{display:"flex",flexDirection:"column",gap:12}}>
          <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="Work email" disabled={mobile}
            style={{background:"#0f0f16",border:"1.5px solid #1a1a26",borderRadius:10,color:"#fff",padding:"13px 16px",fontSize:14,outline:"none"}}/>
          <input value={employeeId} onChange={e=>setEmployeeId(e.target.value.toUpperCase())} placeholder="Employee ID (e.g. STX-AB12CD)" disabled={mobile}
            style={{background:"#0f0f16",border:"1.5px solid #1a1a26",borderRadius:10,color:"#fff",padding:"13px 16px",fontSize:14,outline:"none"}}/>
          <input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="Password" disabled={mobile}
            style={{background:"#0f0f16",border:"1.5px solid #1a1a26",borderRadius:10,color:"#fff",padding:"13px 16px",fontSize:14,outline:"none"}}/>

          {error&&<div style={{color:"#f87171",fontSize:13,textAlign:"center"}}>{error}</div>}

          <button type="submit" disabled={loading||mobile} style={{background:"#e50914",border:"none",color:"#fff",borderRadius:10,padding:"13px",fontWeight:700,fontSize:14,cursor:mobile?"not-allowed":"pointer",opacity:mobile?.5:1,marginTop:4}}>
            {loading?"Signing in...":"Sign In"}
          </button>
        </form>

        <div style={{textAlign:"center",marginTop:20}}>
          <button onClick={onBack} style={{background:"none",border:"none",color:"#666",fontSize:13,cursor:"pointer",textDecoration:"underline"}}>
            ← Back to customer login
          </button>
        </div>
      </div>
    </div>
  );
}
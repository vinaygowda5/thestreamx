import { useState, useEffect, useRef } from "react";
import { API } from "./config.js";

/*
  StreamX customer support
  - /api/support/chat answers (AI if a key is configured, otherwise built-in answers: it never fails)
  - Guided forms (cancel, payment, login...) collect details and create a ticket that the admin team sees under Support Tickets
  - No secret keys in the frontend
*/

// ── Only the backend URL is here — no secret keys in frontend ──

const QUICK = [
  "Video not playing 🎬",
  "OTP not received 📧",
  "Cancel subscription",
  "Upgrade to Premium 👑",
  "Device limit reached 📱",
  "How to download?",
];


// ── Guided enquiry forms: the customer answers a few questions and the whole thing goes to customer service ──
const DEVICES = ["Android phone", "iPhone", "Laptop / PC", "Smart TV", "Other"];
const METHODS = ["UPI", "Credit / Debit card", "Net banking", "Wallet", "Not sure"];
const FORMS = {
  cancel: { title: "Cancel subscription", intro: "Refunds are given only if you cancel within 2 hours of payment. Please answer these so our team can check your payment and process your request.", fields: [
    { k: "reason", label: "1. Why do you want to cancel?", type: "select", required: true, options: ["Too expensive", "Not watching enough", "Content I want is missing", "Video / app problems", "Paid by mistake", "Switching to another service", "Other"] },
    { k: "reason_more", label: "Tell us more (optional)", type: "textarea" },
    { k: "txn", label: "2. Transaction / Payment ID", type: "text", required: true, placeholder: "e.g. pay_Abc123XYZ (in your payment SMS or email)" },
    { k: "paid_at", label: "3. When did you pay? (date & time)", type: "datetime-local", required: true },
    { k: "amount", label: "Amount paid (₹)", type: "text", placeholder: "e.g. 249" },
    { k: "method", label: "Payment method", type: "select", options: METHODS },
  ] },
  payment: { title: "Payment problem", intro: "We'll check this with our payment partner. The Payment ID is the fastest way for us to find it.", fields: [
    { k: "issue", label: "1. What happened?", type: "select", required: true, options: ["Money deducted, plan not active", "Payment failed", "Charged twice", "Wrong amount charged", "Other"] },
    { k: "txn", label: "2. Transaction / Payment ID", type: "text", required: true, placeholder: "e.g. pay_Abc123XYZ" },
    { k: "amount", label: "3. Amount (₹)", type: "text", required: true },
    { k: "paid_at", label: "4. Date & time of payment", type: "datetime-local", required: true },
    { k: "method", label: "Payment method", type: "select", options: METHODS },
    { k: "note", label: "Anything else? (optional)", type: "textarea" },
  ] },
  login: { title: "Login / OTP problem", fields: [
    { k: "contact", label: "1. Email or phone you log in with", type: "text", required: true },
    { k: "issue", label: "2. What is happening?", type: "select", required: true, options: ["Code not received", "Code says invalid or expired", "Account suspended", "Want to change email / phone", "Other"] },
    { k: "device", label: "3. Which device?", type: "select", options: DEVICES },
    { k: "note", label: "Anything else? (optional)", type: "textarea" },
  ] },
  video: { title: "Video not playing", fields: [
    { k: "title", label: "1. Which movie / show?", type: "text", required: true },
    { k: "issue", label: "2. What do you see?", type: "select", required: true, options: ["Black screen", "Keeps buffering", "Error message", "No sound", "Wrong language / audio", "Other"] },
    { k: "device", label: "3. Which device?", type: "select", required: true, options: DEVICES },
    { k: "browser", label: "Browser / app (Chrome, Safari...)", type: "text" },
    { k: "error", label: "Exact error message (if any)", type: "text" },
  ] },
  live: { title: "Live channel problem", fields: [
    { k: "channel", label: "1. Which live channel?", type: "text", required: true },
    { k: "issue", label: "2. What is happening?", type: "select", required: true, options: ["Not starting", "Stuck / lagging", "Says “Live ended” wrongly", "No sound", "Other"] },
    { k: "device", label: "3. Which device?", type: "select", options: DEVICES },
    { k: "note", label: "Anything else? (optional)", type: "textarea" },
  ] },
  account: { title: "Account / data request", intro: "For your safety our team will verify your account before making changes.", fields: [
    { k: "request", label: "1. What do you need?", type: "select", required: true, options: ["Delete my account", "Download / correct my data", "Change email or phone", "Other"] },
    { k: "contact", label: "2. Registered email or phone", type: "text", required: true },
    { k: "note", label: "Anything else? (optional)", type: "textarea" },
  ] },
  other: { title: "Contact customer service", fields: [
    { k: "topic", label: "1. Subject", type: "text", required: true, placeholder: "e.g. Subtitle missing in a movie" },
    { k: "message", label: "2. Describe your problem", type: "textarea", required: true },
  ] },
};

export default function CustomerSupport({ user, onClose, onUpgrade }) {
  const [messages, setMessages] = useState([{
    role:"assistant",
    content:"Hi! 👋 I'm thestreamx Support AI.\n\nHow can I help you today?\n• Video not playing?\n• Login issues?\n• Subscription & plans?\n• Any other problem?"
  }]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [formKey, setFormKey] = useState(null);      // which guided form is open
  const [formVals, setFormVals] = useState({});
  const [ticketBusy, setTicketBusy] = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(()=>{
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  },[messages]);

  function openForm(key){ setFormVals({}); setError(""); setFormKey(FORMS[key]?key:"other"); }

  async function submitForm(){
    const f=FORMS[formKey];
    const missing=f.fields.find(x=>x.required&&!String(formVals[x.k]||"").trim());
    if(missing){setError("Please fill in: "+missing.label.replace(/^\d+\.\s*/,""));return;}
    setTicketBusy(true);setError("");
    try{
      const lines=f.fields.filter(x=>String(formVals[x.k]||"").trim()).map(x=>`${x.label.replace(/^\d+\.\s*/,"").replace(/\s*\(.*\)\s*$/,"")}: ${x.type==="datetime-local"?new Date(formVals[x.k]).toLocaleString():formVals[x.k]}`);
      const who=`${user?.name||user?.username||"-"} · ${user?.email||"-"} · ${user?.phone||"-"} · plan: ${user?.plan||"free"} · user id: ${user?.id||"-"}`;
      const first=String(formVals[f.fields[0].k]||"").slice(0,50);
      const res=await fetch(`${API}/api/support-tickets`,{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${localStorage.getItem("streamx_token")}`},
        body:JSON.stringify({subject:`[${f.title}] ${first}`,message:`CATEGORY: ${f.title}\nCUSTOMER: ${who}\n\n${lines.join("\n")}`}),
      });
      const json=await res.json();
      if(!json.success)throw new Error(json.msg||"Could not send your request");
      const id=String(json.data?.id||"").slice(0,8).toUpperCase();
      setMessages(m=>[...m,{role:"assistant",content:`✅ Sent to customer service${id?` (ticket #${id})`:""}. They will check the details and contact you on your registered email${user?.phone?" or phone":""}.${formKey==="cancel"?" Please remember: refunds are only possible within 2 hours of payment.":""} You don't need to send it again.`}]);
      setFormKey(null);
    }catch(e){setError(/401|token|auth/i.test(e.message)?"Please log in again to contact customer service":e.message);}
    setTicketBusy(false);
  }

  async function send(){
    if(!input.trim()||loading) return;
    const userMsg = { role:"user", content:input.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated); setInput(""); setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/api/support/chat`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          // only the real conversation: drop the assistant greeting that starts the chat
          messages: updated.filter((m,idx)=>!(idx===0&&m.role==="assistant")).map(m=>({role:m.role,content:m.content})).slice(-10),
          userId: user?.id || null,
        }),
      });
      const data = await res.json();
      if(!data.success){ setError(data.msg||"Failed to get response"); setLoading(false); return; }
      setMessages(m=>[...m,{ role:"assistant", content:data.data.reply, form:data.data.form||null, showPlans:!!data.data.showPlans }]);
    } catch(e){
      setError("Network error. Check your internet connection.");
    }
    setLoading(false);
  }

  return(
    <div style={{position:"fixed",inset:0,zIndex:900,background:"#07070c",display:"flex",flexDirection:"column",fontFamily:"Inter,sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes typing{0%,100%{opacity:.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}
      `}</style>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:"1px solid #1a1a26",background:"#0a0a14",flexShrink:0}}>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#aaa",fontSize:22,cursor:"pointer",padding:4}}>←</button>
        <div style={{width:38,height:38,borderRadius:"50%",background:"linear-gradient(135deg,#e50914,#c00)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🤖</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:15,color:"#fff"}}>thestreamx Support</div>
          <div style={{fontSize:11,color:"#00c853",display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:"#00c853"}}/>
            Support Assistant • Always online
          </div>
        </div>
        
      </div>

      {/* Messages */}
      <div style={{flex:1,overflowY:"auto",padding:"16px 14px 8px"}}>
        {messages.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:14,animation:"fadeIn .3s ease"}}>
            {m.role==="assistant"&&(
              <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#e50914,#c00)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0,marginRight:8,marginTop:2}}>🤖</div>
            )}
            <div style={{maxWidth:"80%",background:m.role==="user"?"linear-gradient(135deg,#e50914,#c00)":"#111120",border:m.role==="user"?"none":"1px solid #1a1a26",borderRadius:m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",padding:"11px 14px",fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap",color:"#fff"}}>
              {m.content}
              {m.role==="assistant"&&(m.form||m.showPlans)&&(
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
                  {m.showPlans&&onUpgrade&&<button onClick={onUpgrade} style={{background:"#e50914",color:"#fff",border:"none",borderRadius:16,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>👑 See plans</button>}
                  {m.form&&<button onClick={()=>openForm(m.form)} style={{background:"transparent",color:"#ddd",border:"1px solid #3a3a4a",borderRadius:16,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>📝 Send details to customer service</button>}
                </div>
              )}
            </div>
            {m.role==="user"&&(
              <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#1565c0,#0d47a1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,flexShrink:0,marginLeft:8,marginTop:2}}>
                {user?.name?.[0]?.toUpperCase()||"U"}
              </div>
            )}
          </div>
        ))}
        {loading&&(
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#e50914,#c00)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🤖</div>
            <div style={{background:"#111120",border:"1px solid #1a1a26",borderRadius:"16px 16px 16px 4px",padding:"12px 16px",display:"flex",gap:5,alignItems:"center"}}>
              {[0,1,2].map(i=>(
                <div key={i} style={{width:7,height:7,borderRadius:"50%",background:"#555",animation:"typing 1.2s infinite",animationDelay:i*0.2+"s"}}/>
              ))}
            </div>
          </div>
        )}
        {error&&(
          <div style={{background:"rgba(248,113,113,.08)",border:"1px solid rgba(248,113,113,.2)",borderRadius:10,padding:"10px 14px",marginBottom:12,color:"#f87171",fontSize:12,lineHeight:1.5}}>
            ❌ {error}
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Quick replies */}
      {messages.length<=1&&(
        <div style={{padding:"4px 14px 8px",display:"flex",gap:7,flexWrap:"wrap",flexShrink:0}}>
          {QUICK.map(q=>(
            <button key={q} onClick={()=>{ if(q.startsWith("Upgrade")&&onUpgrade){onUpgrade();return;} if(q.startsWith("Cancel")){openForm("cancel");return;} setInput(q);setTimeout(()=>inputRef.current?.focus(),50);}}
              style={{background:"#111120",border:"1px solid #1a1a26",color:"#aaa",borderRadius:20,padding:"7px 13px",fontSize:12,cursor:"pointer",fontFamily:"Inter,sans-serif",transition:"all .15s"}}
              onMouseEnter={e=>{e.target.style.borderColor="#e50914";e.target.style.color="#fff";}}
              onMouseLeave={e=>{e.target.style.borderColor="#1a1a26";e.target.style.color="#aaa";}}>
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Guided customer-service form */}
      {formKey&&(()=>{
        const f=FORMS[formKey];
        const inp={width:"100%",background:"#0d0d16",border:"1.5px solid #2a2a3a",borderRadius:10,color:"#fff",fontSize:14,padding:"10px 12px",outline:"none",fontFamily:"Inter,sans-serif",boxSizing:"border-box"};
        return(
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:5}} onClick={()=>!ticketBusy&&setFormKey(null)}>
            <div onClick={e=>e.stopPropagation()} style={{background:"#14141c",borderRadius:"18px 18px 0 0",padding:"20px 18px calc(22px + env(safe-area-inset-bottom,0px))",width:"100%",maxWidth:520,maxHeight:"88%",overflowY:"auto"}}>
              <div style={{fontWeight:800,fontSize:16,color:"#fff",marginBottom:4}}>📝 {f.title}</div>
              {f.intro&&<div style={{fontSize:12,color:"#f5b400",marginBottom:12,lineHeight:1.5}}>{f.intro}</div>}
              {f.fields.map(x=>(
                <div key={x.k} style={{marginBottom:12}}>
                  <div style={{fontSize:12,color:"#bbb",fontWeight:600,marginBottom:5}}>{x.label}{x.required&&<span style={{color:"#ff5a63"}}> *</span>}</div>
                  {x.type==="select"?(
                    <select value={formVals[x.k]||""} onChange={e=>setFormVals(v=>({...v,[x.k]:e.target.value}))} style={inp}>
                      <option value="">Choose…</option>
                      {x.options.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  ):x.type==="textarea"?(
                    <textarea rows={3} maxLength={600} value={formVals[x.k]||""} onChange={e=>setFormVals(v=>({...v,[x.k]:e.target.value}))} style={{...inp,resize:"none",lineHeight:1.5}}/>
                  ):(
                    <input type={x.type} max={x.type==="datetime-local"?new Date().toISOString().slice(0,16):undefined} maxLength={120} value={formVals[x.k]||""} placeholder={x.placeholder||""} onChange={e=>setFormVals(v=>({...v,[x.k]:e.target.value}))} style={inp}/>
                  )}
                </div>
              ))}
              {error&&<div style={{color:"#ff6b6b",fontSize:12,marginBottom:8}}>{error}</div>}
              <div style={{display:"flex",gap:10,marginTop:4}}>
                <button onClick={()=>setFormKey(null)} disabled={ticketBusy} style={{flex:1,background:"#222",color:"#ccc",border:"none",borderRadius:10,padding:"12px",fontWeight:600,cursor:"pointer"}}>Cancel</button>
                <button onClick={submitForm} disabled={ticketBusy} style={{flex:2,background:"#e50914",color:"#fff",border:"none",borderRadius:10,padding:"12px",fontWeight:700,cursor:"pointer"}}>{ticketBusy?"Sending…":"Send to customer service"}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Input */}
      <div style={{padding:"10px 14px calc(10px + env(safe-area-inset-bottom))",background:"#0a0a14",borderTop:"1px solid #1a1a26",display:"flex",gap:10,alignItems:"flex-end",flexShrink:0}}>
        <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
          placeholder="Type your question..."
          rows={1}
          style={{flex:1,background:"#111120",border:"1.5px solid #1a1a26",borderRadius:12,color:"#fff",fontSize:14,padding:"11px 14px",outline:"none",fontFamily:"Inter,sans-serif",resize:"none",lineHeight:1.4,maxHeight:100,overflowY:"auto"}}
          onInput={e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,100)+"px";}}
          onFocus={e=>e.target.style.borderColor="#e50914"}
          onBlur={e=>e.target.style.borderColor="#1a1a26"}
        />
        <button onClick={send} disabled={!input.trim()||loading}
          style={{background:input.trim()&&!loading?"#e50914":"#1a1a26",color:"#fff",border:"none",borderRadius:12,width:46,height:46,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,cursor:input.trim()&&!loading?"pointer":"not-allowed",flexShrink:0,transition:"background .2s"}}>
          {loading?"⏳":"➤"}
        </button>
      </div>
    </div>
  );
}
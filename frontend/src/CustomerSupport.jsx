import { useState, useEffect, useRef } from "react";
import { API } from "./config.js";

/*
  Namma Cinema AI Customer Support
  - OpenAI key is stored ONLY in Railway backend env variables
  - Frontend just calls /api/support/chat (no key exposed)
  - Secure: users never see your OpenAI key
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

export default function CustomerSupport({ user, onClose }) {
  const [messages, setMessages] = useState([{
    role:"assistant",
    content:"Hi! 👋 I'm Namma Cinema Support AI.\n\nHow can I help you today?\n• Video not playing?\n• Login issues?\n• Subscription & plans?\n• Any other problem?"
  }]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(()=>{
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  },[messages]);

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
          messages: updated.slice(-10),
          userId: user?.id || null,
        }),
      });
      const data = await res.json();
      if(!data.success){ setError(data.msg||"Failed to get response"); setLoading(false); return; }
      setMessages(m=>[...m,{ role:"assistant", content:data.data.reply }]);
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
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-thumb{background:#e50914;border-radius:2px;}
      `}</style>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:"1px solid #1a1a26",background:"#0a0a14",flexShrink:0}}>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#aaa",fontSize:22,cursor:"pointer",padding:4}}>←</button>
        <div style={{width:38,height:38,borderRadius:"50%",background:"linear-gradient(135deg,#e50914,#c00)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🤖</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:15,color:"#fff"}}>Namma Cinema Support</div>
          <div style={{fontSize:11,color:"#00c853",display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:"#00c853"}}/>
            AI Assistant • Always online
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
            <button key={q} onClick={()=>{setInput(q);setTimeout(()=>inputRef.current?.focus(),50);}}
              style={{background:"#111120",border:"1px solid #1a1a26",color:"#aaa",borderRadius:20,padding:"7px 13px",fontSize:12,cursor:"pointer",fontFamily:"Inter,sans-serif",transition:"all .15s"}}
              onMouseEnter={e=>{e.target.style.borderColor="#e50914";e.target.style.color="#fff";}}
              onMouseLeave={e=>{e.target.style.borderColor="#1a1a26";e.target.style.color="#aaa";}}>
              {q}
            </button>
          ))}
        </div>
      )}

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

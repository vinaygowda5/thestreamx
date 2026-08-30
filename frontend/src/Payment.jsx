import { useState } from "react";
import { API } from "./config.js";

/*
  StreamX — Real Razorpay Payment
  - All payment verification happens on BACKEND (secure)
  - Frontend only opens Razorpay popup, sends result to backend
  - Backend verifies signature and activates subscription

  WHERE TO ADD YOUR KEYS:
  - Razorpay Key ID → Railway env: RAZORPAY_KEY_ID
  - Razorpay Secret → Railway env: RAZORPAY_KEY_SECRET
  - DO NOT put keys in this frontend file
*/


const PLANS = [
  {
    id:       "plan_mobile",
    name:     "Mobile",
    price:    99,
    period:   "month",
    screens:  1,
    quality:  "HD",
    noAds:    false,
    color:    "#3b82f6",
    icon:     "📱",
    features: ["1 Screen", "HD Quality", "Mobile Only"],
  },
  {
    id:       "plan_basic",
    name:     "Basic",
    price:    149,
    period:   "month",
    screens:  2,
    quality:  "FHD",
    noAds:    false,
    color:    "#8b5cf6",
    icon:     "⭐",
    features: ["2 Screens", "Full HD", "TV + Mobile"],
  },
  {
    id:       "plan_premium",
    name:     "Premium",
    price:    249,
    period:   "month",
    screens:  4,
    quality:  "4K HDR",
    noAds:    true,
    color:    "#e50914",
    icon:     "👑",
    popular:  true,
    features: ["4 Screens", "4K HDR", "No Ads", "Downloads", "All Devices"],
  },
  {
    id:       "plan_annual",
    name:     "Annual",
    price:    2499,
    period:   "year",
    screens:  4,
    quality:  "4K HDR",
    noAds:    true,
    color:    "#f59e0b",
    icon:     "🏆",
    features: ["4 Screens", "4K HDR", "No Ads", "Downloads", "Save 83%"],
  },
];

export default function Payment({ user, onClose, onSuccess }) {
  const [loadingPlan, setLoadingPlan] = useState(null); // holds the plan.id currently processing, or null
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState(null);

  async function handleSubscribe(plan) {
    if (!user?.id) { setError("Please login first"); return; }
    setError(""); setLoadingPlan(plan.id);

    const token = localStorage.getItem("streamx_token");

    try {
      // Step 1 — Create order on backend
      const orderRes = await fetch(`${API}/api/subscriptions/order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token,
        },
        body: JSON.stringify({ plan_id: plan.id }),
      });
      const orderData = await orderRes.json();
      if (!orderData.success) { setError(orderData.msg || "Failed to create order"); setLoadingPlan(null); return; }

      const { order_id, amount, key_id } = orderData.data;

      // Step 2 — Open Razorpay popup
      const options = {
        key:         key_id,
        amount:      amount,
        currency:    "INR",
        name:        "StreamX",
        description: `${plan.name} Plan - ₹${plan.price}/${plan.period}`,
        order_id:    order_id,
        prefill: {
          name:  user.name  || "",
          email: user.email || "",
          contact: user.phone || "",
        },
        theme: { color: plan.color },
        handler: async function(response) {
          // Step 3 — Verify payment on backend (SECURE — never skip this)
          try {
            const verifyRes = await fetch(`${API}/api/subscriptions/verify`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token,
              },
              body: JSON.stringify({
                order_id:    order_id,
                payment_id:  response.razorpay_payment_id,
                signature:   response.razorpay_signature,
                plan_id:     plan.id,
              }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyData.success) { setError("Payment verification failed. Contact support."); setLoadingPlan(null); return; }

            // Success!
            setSuccess(plan);
            setLoadingPlan(null);
            onSuccess?.(plan.id);
          } catch(e) {
            setError("Verification failed. Contact support@streamx.in");
            setLoadingPlan(null);
          }
        },
        modal: {
          ondismiss: () => { setLoadingPlan(null); }
        }
      };

      // Load Razorpay script if not already loaded
      if (!window.Razorpay) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = resolve;
          script.onerror = reject;
          document.body.appendChild(script);
        });
      }

      const rzp = new window.Razorpay(options);
      rzp.open();

    } catch(e) {
      setError("Something went wrong. Please try again.");
      setLoadingPlan(null);
    }
  }

  if (success) {
    return (
      <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,.95)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"Inter,sans-serif"}}>
        <div style={{background:"#0e0e1e",border:"1px solid #1a1a2e",borderRadius:20,padding:"36px 28px",width:"100%",maxWidth:380,textAlign:"center"}}>
          <div style={{fontSize:56,marginBottom:16}}>🎉</div>
          <div style={{fontWeight:900,fontSize:22,color:"#fff",marginBottom:8}}>{success.icon} {success.name} Activated!</div>
          <div style={{fontSize:14,color:"#888",marginBottom:24,lineHeight:1.6}}>
            Your {success.name} plan is now active.<br/>Enjoy {success.quality}, {success.screens} screen{success.screens>1?"s":""}{success.noAds?" and No Ads":""}!
          </div>
          <button onClick={onClose} style={{width:"100%",background:"#e50914",color:"#fff",border:"none",borderRadius:12,padding:"14px",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>
            Start Watching 🎬
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,.95)",overflowY:"auto",fontFamily:"Inter,sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;margin:0;padding:0;}`}</style>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:"1px solid #1a1a2e",position:"sticky",top:0,background:"rgba(0,0,0,.95)",zIndex:10}}>
        <div>
          <div style={{fontWeight:900,fontSize:20,color:"#fff"}}>Choose Your Plan</div>
          <div style={{fontSize:12,color:"#555",marginTop:2}}>Upgrade to unlock premium content</div>
        </div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.08)",border:"1px solid #1a1a2e",color:"#aaa",borderRadius:8,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:18}}>✕</button>
      </div>

      <div style={{padding:"20px 16px 40px",maxWidth:480,margin:"0 auto"}}>

        {/* Current plan badge */}
        {user?.plan && user.plan !== "free" && (
          <div style={{background:"rgba(0,200,83,.08)",border:"1px solid rgba(0,200,83,.2)",borderRadius:10,padding:"10px 16px",marginBottom:20,fontSize:13,color:"#00c853",fontWeight:600}}>
            ✅ Current plan: {user.plan.replace("plan_","").toUpperCase()}
          </div>
        )}

        {error && (
          <div style={{background:"rgba(248,113,113,.08)",border:"1px solid rgba(248,113,113,.2)",borderRadius:10,padding:"10px 16px",marginBottom:20,color:"#f87171",fontSize:13}}>
            ❌ {error}
          </div>
        )}

        {/* Plans */}
        {PLANS.map(plan => {
          const isCurrent = user?.plan === plan.id;
          return (
            <div key={plan.id} style={{background:"#0e0e1e",border:`1.5px solid ${plan.popular?"rgba(229,9,20,.4)":"#1a1a2e"}`,borderRadius:16,padding:"20px",marginBottom:14,position:"relative",overflow:"hidden"}}>
              {plan.popular && (
                <div style={{position:"absolute",top:0,right:0,background:"#e50914",color:"#fff",fontSize:10,fontWeight:800,padding:"4px 14px",borderRadius:"0 16px 0 8px",letterSpacing:.5}}>MOST POPULAR</div>
              )}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <span style={{fontSize:22}}>{plan.icon}</span>
                    <span style={{fontWeight:800,fontSize:18,color:"#fff"}}>{plan.name}</span>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {plan.features.map(f=>(
                      <span key={f} style={{background:"rgba(255,255,255,.06)",color:"#aaa",fontSize:11,padding:"2px 8px",borderRadius:20}}>{f}</span>
                    ))}
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
                  <div style={{fontWeight:900,fontSize:24,color:plan.color}}>₹{plan.price}</div>
                  <div style={{fontSize:11,color:"#555"}}>per {plan.period}</div>
                </div>
              </div>

              {isCurrent ? (
                <div style={{width:"100%",background:"rgba(0,200,83,.1)",border:"1px solid rgba(0,200,83,.3)",color:"#00c853",borderRadius:10,padding:"11px",fontSize:13,fontWeight:700,textAlign:"center"}}>
                  ✅ Current Plan
                </div>
              ) : (
                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={loadingPlan === plan.id}
                  style={{width:"100%",background:loadingPlan===plan.id?"#1a1a2e":`linear-gradient(135deg,${plan.color},${plan.color}cc)`,color:"#fff",border:"none",borderRadius:10,padding:"12px",fontWeight:800,fontSize:14,cursor:loadingPlan===plan.id?"not-allowed":"pointer",fontFamily:"Inter,sans-serif",transition:"all .2s",boxShadow:loadingPlan===plan.id?"none":`0 4px 16px ${plan.color}44`}}
                >
                  {loadingPlan===plan.id ? "Processing..." : `Subscribe ₹${plan.price}/${plan.period === "year" ? "yr" : "mo"}`}
                </button>
              )}
            </div>
          );
        })}

        {/* Info */}
        <div style={{background:"rgba(255,255,255,.02)",border:"1px solid #1a1a2e",borderRadius:12,padding:"16px",marginTop:8}}>
          <div style={{fontSize:12,color:"#555",lineHeight:1.8}}>
            🔒 Payments secured by Razorpay<br/>
            📱 UPI, Cards, Net Banking accepted<br/>
            🔄 Cancel anytime from your profile<br/>
            📧 Receipt sent to {user?.email || "your email"}
          </div>
        </div>
      </div>
    </div>
  );
}

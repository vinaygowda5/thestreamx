import { useState, useEffect } from "react";
import Login from "./Login.jsx";
import Home from "./Home.jsx";
import Profile from "./Profile.jsx";
import Admin from "./Admin.jsx";
import Search from "./Search.jsx";

const ADMIN_PHONES = ["+918660570052", "+919000000000", "+919000000001"];
const ADMIN_EMAILS = ["admin@streamx.in", "vinaygowdaw@email.com"];

export default function App() {
  const [user,    setUser]    = useState(null);
  const [page,    setPage]    = useState("home");
  const [loading, setLoading] = useState(true);
  const [upgrade, setUpgrade] = useState(false);

  useEffect(() => {
    // Load user from localStorage — instant, no delay
    try {
      const saved = localStorage.getItem("streamx_user");
      if (saved) {
        const u = JSON.parse(saved);
        if (u?.id) { setUser(u); setPage("home"); }
      }
    } catch (e) {}
    setLoading(false);
  }, []);

  function handleLogin(u) {
    const isAdmin = ADMIN_PHONES.includes(u.phone) || ADMIN_EMAILS.includes(u.email) || u.role === "admin";
    const userData = { ...u, role: isAdmin ? "admin" : (u.role || "user"), plan: isAdmin ? "premium" : (u.plan || "free") };
    localStorage.setItem("streamx_user", JSON.stringify(userData));
    setUser(userData);
    setPage("home");
  }

  function handleLogout() {
    localStorage.removeItem("streamx_user");
    setUser(null);
    setPage("home");
  }

  function handleNavigate(p) {
    // Admin check
    if (p === "admin") {
      const isAdmin = user && (ADMIN_PHONES.includes(user.phone) || ADMIN_EMAILS.includes(user.email) || user.role === "admin");
      if (!isAdmin) { alert("Admin access only!"); return; }
    }
    setPage(p);
    window.scrollTo(0, 0);
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#07070c", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontWeight: 900, fontSize: 36, letterSpacing: 2, marginBottom: 20 }}>
          <span style={{ color: "#e50914" }}>STREAM</span><span style={{ color: "#fff" }}>X</span>
        </div>
        <div style={{ width: 36, height: 36, border: "3px solid #1a1a26", borderTop: "3px solid #e50914", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
      </div>
    </div>
  );

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <div style={{ minHeight: "100vh", background: "#07070c" }}>
      {/* Upgrade Modal */}
      {upgrade && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.9)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "Inter,sans-serif" }}>
          <div style={{ background: "#111120", border: "1px solid #1a1a26", borderRadius: 20, padding: 32, width: "100%", maxWidth: 380, textAlign: "center" }}>
            <div style={{ fontSize: 52, marginBottom: 14 }}>👑</div>
            <div style={{ fontWeight: 900, fontSize: 24, marginBottom: 6 }}>StreamX Premium</div>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 24, lineHeight: 1.7 }}>4K · HDR · No Ads · 4 Screens · Downloads · All Languages</div>
            {[
              { name: "Mobile", price: "₹99", sub: "/month · 1 screen · HD" },
              { name: "Basic",  price: "₹149", sub: "/month · 2 screens · FHD" },
              { name: "Premium",price: "₹249", sub: "/month · 4 screens · 4K HDR", best: true },
              { name: "Annual", price: "₹2499", sub: "/year · Save 83% · All features", best: false },
            ].map(p => (
              <div key={p.name} onClick={() => setUpgrade(false)} style={{ background: p.best ? "rgba(229,9,20,.12)" : "rgba(255,255,255,.04)", border: `1px solid ${p.best ? "rgba(229,9,20,.4)" : "#1a1a26"}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "all .15s" }}>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}{p.best && <span style={{ background: "#e50914", color: "#fff", fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 3, marginLeft: 8 }}>BEST</span>}</div>
                  <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{p.sub}</div>
                </div>
                <div style={{ fontWeight: 900, fontSize: 18, color: p.best ? "#e50914" : "#fff" }}>{p.price}</div>
              </div>
            ))}
            <button onClick={() => setUpgrade(false)} style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid #1a1a26", color: "#aaa", borderRadius: 10, padding: "12px", fontSize: 13, cursor: "pointer", fontFamily: "Inter,sans-serif", marginTop: 4 }}>Maybe Later</button>
          </div>
        </div>
      )}

      {/* Pages */}
      {page === "home"    && <Home    onNavigate={handleNavigate} user={user} onUpgrade={() => setUpgrade(true)} />}
      {page === "profile" && <Profile onNavigate={handleNavigate} user={user} onLogout={handleLogout} onUpgrade={() => setUpgrade(true)} />}
      {page === "admin"   && <Admin   onNavigate={handleNavigate} user={user} />}
      {page === "search"  && <Search  onNavigate={handleNavigate} user={user} onClose={() => setPage("home")} />}

      {/* Bottom Nav — Mobile */}
      {page !== "admin" && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, background: "rgba(7,7,12,.97)", backdropFilter: "blur(16px)", borderTop: "1px solid #1a1a26", display: "flex", padding: "8px 0 calc(8px + env(safe-area-inset-bottom))" }}>
          {[
            { id: "home",    icon: <img src="./icons/home.svg" width="24" height="24" />, label: "Home"    },
            { id: "search",  icon: <img src="./icons/search.svg" width="24" height="24" />, label: "Search"  },
            { id: "profile", icon: <img src="./icons/profile.svg" width="24" height="24" />, label: "Profile" },
            ...(user?.role === "admin" ? [{ id: "admin", icon: <img src="./icons/admin.svg" width="24" height="24" />, label: "Admin" }] : []),
          ].map(tab => (
            <button key={tab.id} onClick={() => handleNavigate(tab.id)} style={{ flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer", padding: "4px 0" }}>
              <span style={{ fontSize: 20 }}>{tab.icon}</span>
              <span style={{ fontSize: 10, color: page === tab.id ? "#e50914" : "#555", fontWeight: page === tab.id ? 700 : 400, fontFamily: "Inter,sans-serif" }}>{tab.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
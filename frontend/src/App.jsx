import { useState, useEffect, lazy, Suspense, Component } from "react";
import Login from "./Login.jsx";
import Home from "./Home.jsx";
const Profile = lazy(() => import("./Profile.jsx"));
const Admin = lazy(() => import("./Admin.jsx"));
const Search = lazy(() => import("./Search.jsx"));
const Payment = lazy(() => import("./Payment.jsx"));
const LegalPage = lazy(() => import("./LegalPage.jsx"));
const CustomerSupport = lazy(() => import("./CustomerSupport.jsx"));
import { t } from "./i18n.js";
import { API } from "./config.js";

const ADMIN_PHONES = ["+918660570052", "+919000000000", "+919000000001"];
const ADMIN_EMAILS = ["admin@streamx.in", "vinaygowdaw@gmail.com"];

function AppInner() {
  const [user,    setUser]    = useState(null);
  const [page,    setPage]    = useState("home");
  const [loading, setLoading] = useState(true);
  const [upgrade, setUpgrade] = useState(false);
  const [legalPage, setLegalPage] = useState(null);     // slug of the open legal page, or null
  const [showSupport, setShowSupport] = useState(false); // footer "Contact Support"
  const [employeeRole, setEmployeeRole] = useState(null); // null = not an employee (or not checked yet)

  async function checkEmployeeStatus() {
    try {
      const token = localStorage.getItem("streamx_token");
      if (!token) return;
      const res = await fetch(`${API}/api/employees/me`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.success && json.data?.isEmployee && json.data?.status === "ACTIVE") {
        setEmployeeRole(json.data.roleName);
      } else {
        setEmployeeRole(null);
      }
    } catch (e) { setEmployeeRole(null); }
  }

  useEffect(() => {
    // Load user from localStorage — instant, no delay
    try {
      const saved = localStorage.getItem("streamx_user");
      if (saved) {
        const u = JSON.parse(saved);
        if (u?.id) { setUser(u); setPage("home"); checkEmployeeStatus(); }
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
    checkEmployeeStatus();
  }

  // Employee ID+password login (no OTP), now triggered from inside Login.jsx
  // itself once it detects the email belongs to a staff account. Goes
  // straight into the Admin panel — an employee never sees the customer
  // Home/Search/Profile screens at all (enforced in the render below).
  function handleEmployeeLogin(employeeData) {
    const userData = { id: employeeData.id, name: employeeData.name, email: employeeData.email, role: "employee" };
    localStorage.setItem("streamx_user", JSON.stringify(userData));
    setUser(userData);
    setEmployeeRole(employeeData.roleName);
    setPage("admin");
  }

  function handleLogout() {
    const token = localStorage.getItem("streamx_token");
    if (employeeRole && token) {
      fetch(`${API}/api/employee-auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
    localStorage.removeItem("streamx_user");
    localStorage.removeItem("streamx_token");
    setUser(null);
    setEmployeeRole(null);
    setPage("home");
  }

  function handleNavigate(p) {
    // Admin check — allow the legacy admin flag OR any active employee role
    if (p === "admin") {
      const isAdmin = user && (ADMIN_PHONES.includes(user.phone) || ADMIN_EMAILS.includes(user.email) || user.role === "admin");
      if (!isAdmin && !employeeRole) { alert("Admin access only!"); return; }
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

  if (!user) {
    // One login screen for everyone. Login.jsx itself detects, once an
    // email is entered, whether it belongs to a staff account — if so it
    // switches to asking for Employee ID + password instead of sending an
    // OTP, and calls onEmployeeLogin instead of onLogin on success.
    return <Login onLogin={handleLogin} onEmployeeLogin={handleEmployeeLogin} />;
  }

  // An employee (any role, including SUPER_ADMIN created via the Employees
  // system) never sees the customer app at all — only the Admin panel and
  // its own Sign Out. The legacy full-admin account (role==="admin") is
  // unrestricted and can still browse Home/Search/Profile like before.
  if (user.role === "employee") {
    return (
      <div style={{ minHeight: "100vh", background: "#07070c" }}>
        <Admin onNavigate={() => {}} user={user} employeeRole={employeeRole} onLogout={handleLogout} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#07070c" }}>
      {/* Upgrade Modal — real payment flow (Razorpay + backend verification) */}
      {upgrade && (
        <Payment
          user={user}
          onClose={() => setUpgrade(false)}
          onSuccess={(planId) => {
            const updated = { ...user, plan: planId };
            setUser(updated);
            localStorage.setItem("streamx_user", JSON.stringify(updated));
            setUpgrade(false);
          }}
        />
      )}

      {/* Legal pages overlay (footer links) */}
      {legalPage && <LegalPage slug={legalPage} onClose={() => setLegalPage(null)} />}

      {/* AI Customer Support overlay (footer "Contact Support") */}
      {showSupport && <CustomerSupport user={user} onClose={() => setShowSupport(false)} onUpgrade={() => { setShowSupport(false); setUpgrade(true); }} />}

      {/* Pages */}
      {page === "home"    && <Home    onNavigate={handleNavigate} user={user} onUpgrade={() => setUpgrade(true)} onOpenLegal={setLegalPage} onSupport={() => setShowSupport(true)} />}
      {page === "profile" && <Profile onNavigate={handleNavigate} user={user} onLogout={handleLogout} onUpgrade={() => setUpgrade(true)} />}
      {page === "admin"   && <Admin   onNavigate={handleNavigate} user={user} employeeRole={employeeRole} onLogout={handleLogout} />}
      {page === "search"  && <Search  onNavigate={handleNavigate} user={user} onClose={() => setPage("home")} />}

      {/* Bottom Nav — Mobile */}
      {page !== "admin" && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, background: "rgba(7,7,12,.97)", backdropFilter: "blur(16px)", borderTop: "1px solid #1a1a26", display: "flex", padding: "8px 0 calc(8px + env(safe-area-inset-bottom))" }}>
          {(() => {
            const lang = (user?.id && localStorage.getItem("streamx_lang_" + user.id)) || user?.language || "en";
            return [
              { id: "home",    icon: <img src="./icons/home.svg" width="24" height="24" />, label: t("nav_home", lang)    },
              { id: "search",  icon: <img src="./icons/search.svg" width="24" height="24" />, label: t("nav_search", lang)  },
              { id: "profile", icon: <img src="./icons/profile.svg" width="24" height="24" />, label: t("nav_profile", lang) },
              ...((user?.role === "admin" || employeeRole) ? [{ id: "admin", icon: <img src="./icons/admin.svg" width="24" height="24" />, label: t("nav_admin", lang) }] : []),
            ];
          })().map(tab => (
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
// Heavy screens (Admin, Profile, Payment...) load only when opened, so the first screen appears much faster
// A new deploy renames the screen files, so an already-open tab can fail to load one ("black screen").
// Reload once automatically; any other crash shows a Reload button instead of an empty page.
const isChunkError = e => /dynamically imported module|Loading chunk|Importing a module script failed|error loading dynamically/i.test(String(e?.message || e));
class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e) {
    console.error("App crashed:", e);
    if (isChunkError(e)) {
      const last = Number(sessionStorage.getItem("streamx_chunk_reload") || 0);
      if (Date.now() - last > 30000) { sessionStorage.setItem("streamx_chunk_reload", String(Date.now())); window.location.reload(); }
    }
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", background: "#07070c", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, fontFamily: "Inter,sans-serif", textAlign: "center", padding: 24 }}>
        <div style={{ fontSize: 40 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Something went wrong</div>
        <div style={{ color: "#999", fontSize: 13 }}>Please reload. If it keeps happening, tell support.</div>
        <button onClick={() => window.location.reload()} style={{ background: "#e50914", color: "#fff", border: "none", borderRadius: 10, padding: "12px 28px", fontWeight: 700, cursor: "pointer" }}>Reload</button>
      </div>
    );
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div style={{ minHeight: "100vh", background: "#07070c" }} />}>
        <AppInner />
      </Suspense>
    </ErrorBoundary>
  );
}
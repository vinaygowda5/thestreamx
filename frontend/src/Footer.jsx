const SECTIONS = [
  { title: "Company", links: [["About Us", "about-us"], ["Contact Us", "contact-us"]] },
  { title: "Legal", links: [
    ["Privacy Policy", "privacy-policy"],
    ["Terms & Conditions", "terms-and-conditions"],
    ["Cookie Policy", "cookie-policy"],
    ["Refund & Cancellation", "refund-cancellation"],
    ["DMCA / Copyright", "dmca"],
  ] },
  { title: "Support", links: [["Help Center", "help-center"], ["Contact Support", "__support"]] },
];

export default function Footer({ onOpenLegal, onSupport }) {
  const linkStyle = { background: "none", border: "none", padding: "5px 0", color: "#8b8b9a", fontSize: 13, cursor: "pointer", textAlign: "left", fontFamily: "Inter,sans-serif" };
  return (
    <footer style={{ marginTop: 20, borderTop: "1px solid #1a1a26", padding: "28px clamp(14px,4vw,24px) 24px", fontFamily: "Inter,sans-serif" }}>
      <div style={{ fontWeight: 900, fontSize: 24, letterSpacing: 2 }}>
        <span style={{ color: "#e50914" }}>STREAM</span><span style={{ color: "#fff" }}>X</span>
      </div>
      <div style={{ color: "#5d5d6b", fontSize: 12, margin: "6px 0 22px" }}>© 2026 StreamX. All rights reserved.</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "22px clamp(28px,8vw,72px)" }}>
        {SECTIONS.map((s) => (
          <div key={s.title} style={{ display: "flex", flexDirection: "column", minWidth: 130 }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{s.title}:</div>
            {s.links.map(([label, slug]) => (
              <button key={slug} style={linkStyle} onClick={() => (slug === "__support" ? onSupport?.() : onOpenLegal?.(slug))}>
                {label}
              </button>
            ))}
          </div>
        ))}
      </div>
    </footer>
  );
}
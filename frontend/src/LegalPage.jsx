import { useState, useEffect } from "react";
import { useBodyScrollLock } from "./scrollLock.js";

/*
  LegalPage — fetches /legal/{slug}.md at runtime and renders it with a tiny
  built-in markdown parser. Supports only what the policy docs use:
  ###### headers, **bold**, [text](url) links, "---" rules and paragraphs.
*/

const TITLES = {
  "privacy-policy": "Privacy Policy",
  "terms-and-conditions": "Terms & Conditions",
  "cookie-policy": "Cookie Policy",
  "refund-cancellation": "Refund & Cancellation",
  "disclaimer": "Disclaimer",
  "Dmca": "DMCA / Copyright",
  "Aboutus": "About Us",
  "Contactus": "Contact Us",
  "Helpcenter": "Help Center",
};

// ── inline: **bold**, [text](url), and \-escaped characters ──
function inline(text, keyBase) {
  const out = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0, m, i = 0;
  const clean = (s) => s.replace(/\\([\\`*_{}\[\]()#+\-.!<>|~])/g, "$1");
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(clean(text.slice(last, m.index)));
    if (m[1] !== undefined) {
      out.push(<strong key={keyBase + "b" + i++} style={{ color: "#fff", fontWeight: 700 }}>{clean(m[1])}</strong>);
    } else {
      out.push(
        <a key={keyBase + "a" + i++} href={m[3]} target="_blank" rel="noopener noreferrer" style={{ color: "#ff5a63", textDecoration: "underline" }}>
          {clean(m[2])}
        </a>
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(clean(text.slice(last)));
  return out;
}

// ── block level: split on blank lines, merge soft-wrapped lines ──
function parse(md) {
  const blocks = [];
  let para = [];
  const flush = () => {
    if (para.length) { blocks.push({ type: "p", text: para.join(" ") }); para = []; }
  };
  for (const raw of md.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flush(); blocks.push({ type: "h", text: h[2] }); continue; }
    if (/^-{3,}$/.test(line)) { flush(); blocks.push({ type: "hr" }); continue; }
    para.push(line);
  }
  flush();
  return blocks;
}

export default function LegalPage({ slug, onClose }) {
  const [blocks, setBlocks] = useState(null);
  const [error, setError] = useState(false);
  const title = TITLES[slug] || "Legal";
  useBodyScrollLock();

  useEffect(() => {
    let cancelled = false;
    setBlocks(null); setError(false);
    fetch(`/legal/${slug}.md`)
      .then((r) => { if (!r.ok) throw new Error("http " + r.status); return r.text(); })
      .then((txt) => {
        // Vercel can answer a missing file with index.html — treat that as an error
        if (/^\s*<(!doctype|html)/i.test(txt)) throw new Error("not markdown");
        if (!cancelled) setBlocks(parse(txt));
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sx-scroll" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#07070c", overflowY: "auto", fontFamily: "Inter,sans-serif" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: "rgba(7,7,12,.96)", backdropFilter: "blur(14px)", borderBottom: "1px solid #1a1a26", display: "flex", alignItems: "center", gap: 12, padding: "12px clamp(14px,4vw,28px)" }}>
        <button onClick={onClose} aria-label="Back" style={{ background: "#14141c", border: "1px solid #24243a", color: "#fff", borderRadius: 8, width: 36, height: 36, fontSize: 18, cursor: "pointer", flexShrink: 0 }}>←</button>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "26px clamp(16px,5vw,28px) 80px" }}>
        {!blocks && !error && (
          <div style={{ color: "#777", fontSize: 14, textAlign: "center", padding: "60px 0" }}>Loading…</div>
        )}
        {error && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#999", fontSize: 14 }}>
            Couldn't load this page. Please check your connection and try again.
          </div>
        )}
        {blocks && blocks.map((b, i) => {
          if (b.type === "hr") return <hr key={i} style={{ border: "none", borderTop: "1px solid #1a1a26", margin: "22px 0" }} />;
          if (b.type === "h") return (
            <h2 key={i} style={{ fontSize: 19, fontWeight: 800, color: "#fff", margin: "30px 0 10px", lineHeight: 1.3 }}>{inline(b.text, "h" + i)}</h2>
          );
          return <p key={i} style={{ fontSize: 14.5, lineHeight: 1.75, color: "#b4b4c0", margin: "0 0 14px" }}>{inline(b.text, "p" + i)}</p>;
        })}
      </div>
    </div>
  );
}
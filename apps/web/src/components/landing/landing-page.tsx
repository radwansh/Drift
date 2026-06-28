"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { TrialRequestModal } from "./trial-request-modal";

export function LandingPage() {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const startTimeRef = useRef(Date.now());
  const total = 5;
  const DURATION = 6000;

  const goTo = useCallback((index: number) => {
    let target = index;
    if (target < 0) target = total - 1;
    if (target >= total) target = 0;
    if (target === current) return;
    setCurrent(target);
    startTimeRef.current = Date.now();
  }, [current]);

  const advance = useCallback(() => goTo(current + 1), [goTo, current]);
  const goBack = useCallback(() => goTo(current - 1), [goTo, current]);

  useEffect(() => {
    const particles = document.getElementById("landing-particles");
    if (particles) {
      for (let i = 0; i < 30; i++) {
        const p = document.createElement("div");
        p.className = "particle";
        p.style.left = Math.random() * 100 + "%";
        p.style.width = (2 + Math.random() * 6) + "px";
        p.style.height = p.style.width;
        p.style.animationDuration = (12 + Math.random() * 20) + "s";
        p.style.animationDelay = (Math.random() * 10) + "s";
        p.style.opacity = String(0.3 + Math.random() * 0.4);
        particles.appendChild(p);
      }
    }
  }, []);

  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min((elapsed / DURATION) * 100, 100);
      if (progressRef.current) progressRef.current.style.width = pct + "%";
      if (elapsed >= DURATION) {
        advance();
        startTimeRef.current = Date.now();
      }
    }, 50);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [advance, paused]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (modalOpen) return;
      if (e.key === "ArrowRight") { advance(); startTimeRef.current = Date.now(); }
      if (e.key === "ArrowLeft") { goBack(); startTimeRef.current = Date.now(); }
      if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [advance, goBack, modalOpen]);

  let touchStartX = 0;
  function handleTouchStart(e: React.TouchEvent) { touchStartX = e.touches[0].clientX; }
  function handleTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) {
      if (dx > 0) { goBack(); startTimeRef.current = Date.now(); }
      else { advance(); startTimeRef.current = Date.now(); }
    }
  }

  return (
    <>
      <style>{`
        .landing-page * { margin: 0; padding: 0; box-sizing: border-box; }
        .landing-page {
          font-family: 'Inter', -apple-system, sans-serif;
          background: #ffffff;
          color: #0f172a;
          overflow: hidden;
          height: 100vh;
          width: 100vw;
        }
        .landing-slide {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 64px;
          opacity: 0;
          transform: scale(0.96);
          transition: opacity 0.8s ease, transform 0.8s ease;
          pointer-events: none;
        }
        .landing-slide.active {
          opacity: 1;
          transform: scale(1);
          pointer-events: auto;
        }
        .landing-slide.exit {
          opacity: 0;
          transform: scale(1.04);
        }
        .landing-progress {
          position: fixed;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: rgba(59,130,246,0.15);
          z-index: 100;
        }
        .landing-progress-inner {
          height: 100%;
          background: #3b82f6;
          transition: width 0.1s linear;
        }
        .landing-indicators {
          position: fixed;
          bottom: 32px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 10px;
          z-index: 100;
        }
        .landing-indicators button {
          width: 10px; height: 10px;
          border-radius: 50%;
          border: none;
          background: rgba(59,130,246,0.25);
          cursor: pointer;
          transition: all 0.3s;
        }
        .landing-indicators button.active {
          background: #3b82f6;
          width: 28px;
          border-radius: 6px;
        }
        .landing-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 16px;
          border-radius: 100px;
          font-size: 0.8rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          background: rgba(59,130,246,0.1);
          color: #3b82f6;
          margin-bottom: 20px;
        }
        .landing-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 14px 32px;
          border-radius: 100px;
          font-weight: 600;
          font-size: 1rem;
          text-decoration: none;
          transition: all 0.25s;
          cursor: pointer;
          border: none;
        }
        .landing-btn-primary {
          background: #3b82f6;
          color: #fff;
          box-shadow: 0 4px 20px rgba(59,130,246,0.3);
        }
        .landing-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(59,130,246,0.4); }
        .landing-btn-outline {
          background: transparent;
          color: #0f172a;
          border: 1.5px solid #e2e8f0;
        }
        .landing-btn-outline:hover { border-color: #3b82f6; color: #3b82f6; }
        .landing-buttons { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 28px; justify-content: center; }
        .particles { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
        .particle {
          position: absolute;
          width: 6px; height: 6px;
          border-radius: 50%;
          background: rgba(59,130,246,0.08);
          animation: landing-float linear infinite;
        }
        @keyframes landing-float {
          0% { transform: translateY(100vh) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(-10vh) rotate(720deg); opacity: 0; }
        }
      `}</style>

      <div className="landing-page" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>

        <div className="landing-progress">
          <div className="landing-progress-inner" ref={progressRef}></div>
        </div>

        <div className="particles" id="landing-particles"></div>

        <div style={{ position: "fixed", top: "24px", left: "32px", display: "flex", alignItems: "center", gap: "10px", zIndex: 100, fontWeight: 700, fontSize: "1.2rem", color: "#0f172a" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 28, height: 28, color: "#3b82f6" }}>
            <path d="M3 3v18h18"/><path d="M7 16l4-8 4 4 4-6"/>
          </svg>
          Drift
        </div>

        <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>

          {/* SLIDE 1: Hero */}
          <Slide active={current === 0} exit={current === 1}>
            <div className="landing-badge">&#9679; Now Available</div>
            <h1 style={{ textAlign: "center", maxWidth: 800, fontSize: "clamp(2rem,5vw,4rem)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em" }}>
              Know Every Dollar.<br />
              <span style={{ color: "#3b82f6" }}>Every Period.</span>
            </h1>
            <p style={{ textAlign: "center", marginTop: 16, fontSize: "clamp(0.95rem,1.4vw,1.15rem)", lineHeight: 1.7, color: "#64748b", maxWidth: 640 }}>
              Drift gives business owners, payroll administrators, and finance managers
              real-time visibility into payroll variances, headcount changes, and
              salary expenses — powered by AI.
            </p>
            <div className="landing-buttons">
              <button className="landing-btn landing-btn-primary" onClick={() => setModalOpen(true)}>&#9654; Get Early Access</button>
              <Link href="/login" className="landing-btn landing-btn-outline">Sign In</Link>
            </div>
            <ChartBars />
            <p style={{ fontSize: "0.8rem", marginTop: 8, color: "#64748b" }}>
              <span style={{ color: "#22c55e" }}>&#9650;</span> +12.4% &nbsp;&nbsp;
              <span style={{ color: "#f59e0b" }}>&#9660;</span> -3.2% &nbsp;&nbsp;
              <span style={{ color: "#64748b" }}>&#9644;</span> 84% unchanged
            </p>
          </Slide>

          {/* SLIDE 2: Variance & Headcount */}
          <Slide active={current === 1} exit={current === 2}>
            <div className="landing-badge">&#9878; For Business Owners &amp; Managers</div>
            <h2 style={{ textAlign: "center", maxWidth: 750, fontSize: "clamp(1.5rem,3vw,2.5rem)", fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em" }}>
              Spot Payroll Variances &amp; <span style={{ color: "#3b82f6" }}>Headcount Changes</span> Instantly
            </h2>
            <p style={{ textAlign: "center", maxWidth: 640, fontSize: "clamp(0.95rem,1.4vw,1.15rem)", lineHeight: 1.7, color: "#64748b" }}>
              Compare any two periods — weekly, bi-weekly, or monthly — and see exactly
              which employees changed, by how much, and why. No more digging through spreadsheets.
            </p>
            <ComparisonRows />
            <PeriodBadges />
          </Slide>

          {/* SLIDE 3: Monitoring */}
          <Slide active={current === 2} exit={current === 3}>
            <div className="landing-badge">&#128200; For Payroll Administrators</div>
            <h2 style={{ textAlign: "center", maxWidth: 750, fontSize: "clamp(1.5rem,3vw,2.5rem)", fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em" }}>
              Monitor <span style={{ color: "#3b82f6" }}>Total Payroll Expenses</span> Across Periods
            </h2>
            <p style={{ textAlign: "center", maxWidth: 640, fontSize: "clamp(0.95rem,1.4vw,1.15rem)", lineHeight: 1.7, color: "#64748b" }}>
              Track gross payroll, net pay, and every salary component in one dashboard.
              See total variance, department breakdowns, and individual contributor changes.
            </p>
            <FeatureCards />
          </Slide>

          {/* SLIDE 4: AI */}
          <Slide active={current === 3} exit={current === 4}>
            <div className="landing-badge">&#129302; AI-Powered</div>
            <h2 style={{ textAlign: "center", maxWidth: 750, fontSize: "clamp(1.5rem,3vw,2.5rem)", fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em" }}>
              Get an <span style={{ color: "#3b82f6" }}>AI Summary</span> of Your Payroll Changes
            </h2>
            <p style={{ textAlign: "center", maxWidth: 640, fontSize: "clamp(0.95rem,1.4vw,1.15rem)", lineHeight: 1.7, color: "#64748b" }}>
              Drift&apos;s AI engine automatically analyzes every comparison, highlights
              anomalies, flags unusual patterns, and generates a plain-English summary
              of what changed — so you don&apos;t have to hunt for insights.
            </p>
            <AiSummaryCard />
          </Slide>

          {/* SLIDE 5: CTA */}
          <Slide active={current === 4} exit={false}>
            <div className="landing-badge">&#128640; Get Started</div>
            <h2 style={{ textAlign: "center", maxWidth: 700, fontSize: "clamp(1.5rem,3vw,2.5rem)", fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em" }}>
              Stop Guessing.<br />
              <span style={{
                display: "inline-block",
                background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor:"transparent",
                backgroundClip: "text",
              }}>Start Drifting.</span>
            </h2>
            <p style={{ textAlign: "center", marginTop: 8, maxWidth: 640, fontSize: "clamp(0.95rem,1.4vw,1.15rem)", lineHeight: 1.7, color: "#64748b" }}>
              Upload your payroll data, compare any two periods, and let AI surface
              the insights that matter. Weekly, bi-weekly, or monthly — Drift works
              with your payroll cycle.
            </p>
            <div className="landing-buttons">
              <button className="landing-btn landing-btn-primary" onClick={() => setModalOpen(true)}>&#9654; Get Early Access</button>
              <button className="landing-btn landing-btn-outline" onClick={() => setModalOpen(true)}>Book a Demo</button>
            </div>
            <CompanyTicker />
          </Slide>

        </div>

        <div className="landing-indicators">
          {Array.from({ length: total }).map((_, i) => (
            <button
              key={i}
              className={current === i ? "active" : ""}
              onClick={() => { goTo(i); startTimeRef.current = Date.now(); }}
            />
          ))}
        </div>

        <div style={{ position: "fixed", bottom: 32, right: 32, zIndex: 100, display: "flex", gap: 8 }}>
          <button
            onClick={() => { goBack(); startTimeRef.current = Date.now(); }}
            style={{
              background: "#f1f5f9", border: "none", width: 38, height: 38,
              borderRadius: "50%", display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer", color: "#64748b",
              fontSize: "1.1rem", transition: "all 0.2s",
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = "#3b82f6"; e.currentTarget.style.color = "#fff"; }}
            onMouseOut={(e) => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.color = "#64748b"; }}
          >&#8592;</button>
          <button
            onClick={() => { advance(); startTimeRef.current = Date.now(); }}
            style={{
              background: "#f1f5f9", border: "none", width: 38, height: 38,
              borderRadius: "50%", display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer", color: "#64748b",
              fontSize: "1.1rem", transition: "all 0.2s",
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = "#3b82f6"; e.currentTarget.style.color = "#fff"; }}
            onMouseOut={(e) => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.color = "#64748b"; }}
          >&#8594;</button>
        </div>

      </div>

      <TrialRequestModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

/* Sub-components */

function Slide({ active, exit, children }: { active: boolean; exit: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`landing-slide ${active ? "active" : ""} ${exit ? "exit" : ""}`}
      style={active ? {} : exit ? {} : {}}
    >
      {children}
    </div>
  );
}

function ChartBars() {
  const bars = [
    { delay: "0.1s", h: "60%", g: "linear-gradient(to top, #3b82f6, #60a5fa)" },
    { delay: "0.2s", h: "85%", g: "linear-gradient(to top, #2563eb, #3b82f6)" },
    { delay: "0.3s", h: "45%", g: "linear-gradient(to top, #1d4ed8, #2563eb)" },
    { delay: "0.4s", h: "72%", g: "linear-gradient(to top, #3b82f6, #60a5fa)" },
    { delay: "0.5s", h: "55%", g: "linear-gradient(to top, #2563eb, #3b82f6)" },
    { delay: "0.6s", h: "90%", g: "linear-gradient(to top, #1d4ed8, #2563eb)" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 160, margin: "28px 0 16px", padding: "0 20px" }}>
      {bars.map((bar, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            borderRadius: "4px 4px 0 0",
            background: bar.g,
            minHeight: 8,
            height: bar.h,
            animation: `barRise 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) ${bar.delay} forwards`,
            transform: "scaleY(0)",
            transformOrigin: "bottom",
          }}
        />
      ))}
      <style>{`
        @keyframes barRise {
          from { transform: scaleY(0); transform-origin: bottom; }
          to { transform: scaleY(1); transform-origin: bottom; }
        }
      `}</style>
    </div>
  );
}

function ComparisonRows() {
  const rows = [
    { label: "Base Salary", prevW: 160, currW: 200, delta: "+$5,200", up: true },
    { label: "Bonus", prevW: 120, currW: 90, delta: "-$1,800", up: false },
    { label: "Benefits", prevW: 80, currW: 95, delta: "+$750", up: true },
    { label: "Headcount", prevW: 100, currW: 120, delta: "+3 employees", up: true },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 600, width: "100%", marginTop: 28 }}>
      {rows.map((row, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            opacity: 0,
            transform: "translateX(-20px)",
            animation: `fadeInRow 0.5s ease ${0.2 + i * 0.2}s forwards`,
          }}
        >
          <span style={{ width: 120, fontSize: "0.85rem", fontWeight: 500, color: "#64748b", flexShrink: 0 }}>{row.label}</span>
          <div style={{ height: 28, borderRadius: 6, background: "#e2e8f0", width: row.prevW, transition: "width 0.8s" }} />
          <div style={{ height: 28, borderRadius: 6, background: "#3b82f6", width: row.currW, transition: "width 0.8s" }} />
          <span style={{ width: 100, textAlign: "right", fontWeight: 700, fontSize: "0.9rem", flexShrink: 0, color: row.up ? "#22c55e" : "#f59e0b" }}>{row.delta}</span>
        </div>
      ))}
      <style>{`
        @keyframes fadeInRow {
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

function PeriodBadges() {
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
      {["Weekly", "Bi-Weekly", "Monthly"].map((p) => (
        <span key={p} style={{
          padding: "8px 18px",
          borderRadius: "100px",
          fontSize: "0.8rem",
          fontWeight: 600,
          background: "#f1f5f9",
          color: "#64748b",
          border: "1px solid #e2e8f0",
        }}>&#128197; {p}</span>
      ))}
    </div>
  );
}

function FeatureCards() {
  const cards = [
    { icon: "\u{1F4B0}", title: "Total Variance", desc: "+$48,200 vs last period — driven by new hires in Engineering" },
    { icon: "\u{1F465}", title: "Department View", desc: "Engineering +$32K, Sales +$12K, Marketing +$4K" },
    { icon: "\u{1F4C8}", title: "Component Drilldown", desc: "Bonuses up 18%, Benefits flat, Overtime down 5%" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, maxWidth: 900, width: "100%", marginTop: 32 }}>
      {cards.map((c, i) => (
        <div key={i} style={{
          background: "#f1f5f9",
          borderRadius: 12,
          padding: 24,
          textAlign: "center",
          transition: "transform 0.3s",
        }}
          onMouseOver={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; }}
          onMouseOut={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
        >
          <span style={{ fontSize: "2rem", marginBottom: 12, display: "block" }}>{c.icon}</span>
          <h3 style={{ fontSize: "clamp(1.1rem,1.8vw,1.5rem)", fontWeight: 600, marginBottom: 6 }}>{c.title}</h3>
          <p style={{ fontSize: "0.9rem", lineHeight: 1.6, color: "#64748b", margin: 0 }}>{c.desc}</p>
        </div>
      ))}
    </div>
  );
}

function AiSummaryCard() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 32, marginTop: 28, flexWrap: "wrap", justifyContent: "center" }}>
      <div style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 80, height: 80, borderRadius: "50%", background: "rgba(59,130,246,0.1)",
        position: "relative", marginBottom: 20,
      }}>
        <div style={{
          position: "absolute", inset: -8, borderRadius: "50%",
          border: "2px solid rgba(59,130,246,0.2)",
          animation: "pulseRing 2s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", inset: -16, borderRadius: "50%",
          border: "1.5px solid rgba(59,130,246,0.1)",
          animation: "pulseRing 2s ease-in-out 0.5s infinite",
        }} />
        <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 36, height: 36 }}>
          <path d="M12 2a4 4 0 0 1 4 4c0 2-2 4-4 4s-4-2-4-4 2-4 4-4z"/>
          <path d="M4 22v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2"/>
        </svg>
        <style>{`
          @keyframes pulseRing {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.1); opacity: 0.5; }
          }
        `}</style>
      </div>
      <div style={{ background: "#f1f5f9", borderRadius: 12, padding: "20px 28px", maxWidth: 400, textAlign: "left" }}>
        <p style={{ fontSize: "0.9rem", color: "#0f172a", fontWeight: 500, marginBottom: 4 }}>
          &#128172; AI Summary
        </p>
        <p style={{ fontSize: "0.85rem", lineHeight: 1.6, color: "#64748b", margin: 0 }}>
          &ldquo;Payroll increased 6.2% driven by 3 new Engineering hires. Two
          employees in Sales had bonus reductions exceeding 20%. One anomaly
          flagged: a net change without corresponding component change.&rdquo;
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <span style={{ background: "#fef3c7", color: "#92400e", padding: "3px 10px", borderRadius: "100px", fontSize: "0.7rem", fontWeight: 600 }}>3 anomalies</span>
          <span style={{ background: "#d1fae5", color: "#065f46", padding: "3px 10px", borderRadius: "100px", fontSize: "0.7rem", fontWeight: 600 }}>2 highlights</span>
        </div>
      </div>
    </div>
  );
}

function CompanyTicker() {
  const companies = ["Acme Corp", "Globex Inc", "Initech", "Umbrella Co", "Stark Ind"];
  return (
    <div style={{ display: "flex", gap: 48, marginTop: 40, opacity: 0.3, fontSize: "0.85rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>
      {companies.map((c) => <span key={c}>{c}</span>)}
    </div>
  );
}

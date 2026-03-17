"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PCDLoader } from "three/addons/loaders/PCDLoader.js";
import { getCurrentUser, getUserRole } from "@/services/authService";
import ChatBot from "@/src/components/ui/ChatBot";

type AppRole = "employee" | "manager" | "hr";

function routeForRole(role: AppRole) {
  if (role === "employee") return "/employee";
  if (role === "manager") return "/manager";
  return "/hr";
}

/* ─── styles ─────────────────────────────────────────────────────────────── */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');

.lp-root {
  --c-bg: #fdf2e9;
  --c-text: #4a2c2a;
  --c-muted: #8e6d6b;
  --c-accent: #e67e22;
  --c-accent2: #ff7f50;
  --c-golden: #f39c12;
  --c-border: rgba(142,109,107,0.18);
  --ease: cubic-bezier(0.2, 0.0, 0.2, 1);
  --serif: 'Playfair Display', serif;
  --mono: 'Space Mono', monospace;

  background: var(--c-bg);
  color: var(--c-text);
  font-family: var(--serif);
  -webkit-font-smoothing: antialiased;
  cursor: none;
  overflow-x: hidden;
}

.lp-root *, .lp-root *::before, .lp-root *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  cursor: none;
}

/* ── fixed header ── */
.lp-header {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.6rem 5rem;
  transition: background 0.4s ease, border-bottom 0.4s ease;
}
.lp-header.scrolled {
  background: rgba(253,242,233,0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--c-border);
}
.lp-brand {
  font-family: var(--serif);
  font-size: 1.5rem;
  font-weight: 400;
  font-style: italic;
  text-transform: uppercase;
  letter-spacing: -0.02em;
  color: var(--c-text);
  text-decoration: none;
}

/* ── hero ── */
.lp-hero {
  position: relative;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.lp-hero-canvas {
  position: absolute;
  inset: 0;
  z-index: 0;
}
.lp-hero-blur {
  position: absolute;
  inset: 0;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  z-index: 1;
  pointer-events: none;
  mask-image: radial-gradient(circle 220px at var(--x,50%) var(--y,50%), transparent 0%, black 100%);
  -webkit-mask-image: radial-gradient(circle 220px at var(--x,50%) var(--y,50%), transparent 0%, black 100%);
}
.lp-noise {
  position: absolute;
  inset: 0;
  z-index: 2;
  opacity: 0.13;
  pointer-events: none;
  mix-blend-mode: overlay;
  filter: contrast(120%);
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
.lp-hero-content {
  position: relative;
  z-index: 3;
  text-align: center;
  opacity: 0;
  animation: lpFadeUp 1.8s var(--ease) forwards 0.2s;
  padding: 4rem 5rem;
}
.lp-eyebrow {
  font-family: var(--mono);
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.28em;
  color: var(--c-accent);
  margin-bottom: 1.4rem;
}
.lp-hero-title {
  font-family: var(--serif);
  font-size: clamp(4rem, 10vw, 8rem);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: -0.05em;
  line-height: 0.92;
  color: var(--c-text);
  margin-bottom: 1.6rem;
}
.lp-hero-sub {
  font-family: var(--serif);
  font-style: italic;
  font-size: clamp(1rem, 2vw, 1.3rem);
  color: var(--c-muted);
  max-width: 480px;
  margin: 0 auto 3rem;
  line-height: 1.5;
}
.lp-scroll-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--mono);
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--c-muted);
  position: absolute;
  bottom: 3rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  animation: lpScrollBounce 2s ease-in-out infinite;
}
.lp-scroll-line {
  width: 1px;
  height: 40px;
  background: linear-gradient(to bottom, var(--c-accent), transparent);
}

/* ── sections shared ── */
.lp-section {
  padding: 8rem 5rem;
  position: relative;
}
.lp-section-label {
  font-family: var(--mono);
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--c-accent);
  margin-bottom: 1rem;
}
.lp-section-title {
  font-family: var(--serif);
  font-size: clamp(2.2rem, 5vw, 3.8rem);
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1.05;
  color: var(--c-text);
  max-width: 640px;
}
.lp-section-divider {
  width: 100%;
  height: 1px;
  background: var(--c-border);
  margin-bottom: 6rem;
}

/* ── features ── */
.lp-features-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0;
  margin-top: 5rem;
  border: 1px solid var(--c-border);
}
.lp-feature {
  padding: 3rem;
  border-right: 1px solid var(--c-border);
  border-bottom: 1px solid var(--c-border);
  transition: background 0.3s ease;
}
.lp-feature:nth-child(2n) { border-right: none; }
.lp-feature:nth-last-child(-n+2) { border-bottom: none; }
.lp-feature:hover { background: rgba(230,126,34,0.04); }
.lp-feature-num {
  font-family: var(--mono);
  font-size: 0.55rem;
  letter-spacing: 0.1em;
  color: var(--c-accent);
  margin-bottom: 1.2rem;
  opacity: 0.7;
}
.lp-feature-title {
  font-family: var(--serif);
  font-size: 1.5rem;
  font-weight: 400;
  color: var(--c-text);
  margin-bottom: 0.8rem;
  letter-spacing: -0.02em;
}
.lp-feature-desc {
  font-family: var(--mono);
  font-size: 0.72rem;
  line-height: 1.7;
  color: var(--c-muted);
}

/* ── roles ── */
.lp-roles-section {
  background: var(--c-text);
  padding: 8rem 5rem;
}
.lp-roles-section .lp-section-label { color: var(--c-golden); }
.lp-roles-section .lp-section-title { color: var(--c-bg); }
.lp-roles-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
  margin-top: 5rem;
  background: rgba(255,255,255,0.08);
}
.lp-role-card {
  background: var(--c-text);
  padding: 3rem 2.5rem;
  border: 1px solid rgba(253,242,233,0.1);
  transition: background 0.3s ease;
}
.lp-role-card:hover { background: rgba(230,126,34,0.12); }
.lp-role-index {
  font-family: var(--mono);
  font-size: 0.55rem;
  letter-spacing: 0.1em;
  color: var(--c-golden);
  margin-bottom: 1.5rem;
  opacity: 0.6;
}
.lp-role-name {
  font-family: var(--serif);
  font-size: 2rem;
  font-weight: 400;
  font-style: italic;
  color: var(--c-bg);
  margin-bottom: 1rem;
  letter-spacing: -0.02em;
}
.lp-role-desc {
  font-family: var(--mono);
  font-size: 0.7rem;
  line-height: 1.75;
  color: rgba(253,242,233,0.55);
  margin-bottom: 2rem;
}
.lp-role-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.lp-role-tag {
  font-family: var(--mono);
  font-size: 0.55rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--c-golden);
  border: 1px solid rgba(243,156,18,0.3);
  padding: 0.3rem 0.7rem;
}

/* ── stats ── */
.lp-stats-section {
  padding: 7rem 5rem;
  border-top: 1px solid var(--c-border);
  border-bottom: 1px solid var(--c-border);
}
.lp-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2rem;
  margin-top: 4rem;
}
.lp-stat {
  border-left: 2px solid var(--c-accent);
  padding-left: 1.5rem;
}
.lp-stat-num {
  font-family: var(--serif);
  font-size: 3rem;
  font-weight: 400;
  color: var(--c-text);
  letter-spacing: -0.04em;
  line-height: 1;
  margin-bottom: 0.5rem;
}
.lp-stat-label {
  font-family: var(--mono);
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--c-muted);
  line-height: 1.4;
}

/* ── CTA ── */
.lp-cta-section {
  padding: 10rem 5rem;
  text-align: center;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lp-cta-bg {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 60% 60% at 50% 50%, rgba(230,126,34,0.1) 0%, transparent 70%);
  pointer-events: none;
}
.lp-cta-glass {
  position: relative;
  z-index: 1;
  display: inline-block;
  max-width: 720px;
  width: 100%;
}
.lp-cta-title {
  font-family: var(--serif);
  font-size: clamp(2.5rem, 6vw, 5rem);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: -0.04em;
  line-height: 1;
  color: var(--c-text);
  margin-bottom: 1.5rem;
  position: relative;
  z-index: 1;
}
.lp-cta-sub {
  font-family: var(--serif);
  font-style: italic;
  font-size: 1.1rem;
  color: var(--c-muted);
  margin-bottom: 3.5rem;
  position: relative;
  z-index: 1;
}
.lp-cta-actions {
  display: flex;
  gap: 1.5rem;
  justify-content: center;
  position: relative;
  z-index: 1;
}
.lp-btn {
  font-family: var(--mono);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 1.2rem 3.5rem;
  border: none;
  transition: all 0.4s var(--ease);
  background: var(--c-accent);
  color: white;
  font-weight: 700;
  cursor: none;
  display: inline-block;
  text-decoration: none;
}
.lp-btn:hover {
  background: var(--c-accent2);
  box-shadow: 0 0 40px rgba(230,126,34,0.4);
  transform: translateY(-2px);
}
.lp-btn-ghost {
  font-family: var(--mono);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 1.2rem 3.5rem;
  border: 1px solid rgba(74,44,42,0.25);
  transition: all 0.4s var(--ease);
  background: transparent;
  color: var(--c-text);
  font-weight: 700;
  cursor: none;
  display: inline-block;
  text-decoration: none;
}
.lp-btn-ghost:hover {
  border-color: var(--c-accent);
  color: var(--c-accent);
  box-shadow: 0 0 24px rgba(230,126,34,0.15);
  transform: translateY(-2px);
}

/* ── footer ── */
.lp-footer {
  padding: 2.5rem 5rem;
  border-top: 1px solid var(--c-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.lp-footer-brand {
  font-family: var(--serif);
  font-style: italic;
  font-size: 1rem;
  color: var(--c-muted);
}
.lp-footer-meta {
  font-family: var(--mono);
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--c-muted);
  border-left: 1px solid var(--c-golden);
  padding-left: 1rem;
  line-height: 1.5;
}

/* ── cursor ── */
.lp-cursor-dot {
  position: fixed;
  top: 0; left: 0;
  width: 4px; height: 4px;
  background: var(--c-accent);
  z-index: 9999;
  pointer-events: none;
  transform: translate(-50%, -50%);
}
.lp-cursor-ring {
  position: fixed;
  top: 0; left: 0;
  width: 40px; height: 40px;
  border: 1px solid rgba(230,126,34,0.4);
  border-radius: 50%;
  z-index: 9999;
  pointer-events: none;
  transform: translate(-50%, -50%);
  transition: width 0.2s, height 0.2s, border-color 0.2s;
  mix-blend-mode: color-burn;
}
.lp-cursor-ring::before, .lp-cursor-ring::after {
  content: '';
  position: absolute;
  background: var(--c-accent);
}
.lp-cursor-ring::before { top: 50%; left: -20%; right: -20%; height: 1px; }
.lp-cursor-ring::after  { left: 50%; top: -20%; bottom: -20%; width: 1px; }

/* ── loading ── */
.lp-loading {
  position: fixed;
  inset: 0;
  background: var(--c-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--mono);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--c-muted);
}

/* ── animations ── */
@keyframes lpFadeUp {
  from { opacity: 0; transform: translateY(24px); filter: blur(8px); }
  to   { opacity: 1; transform: translateY(0);    filter: blur(0); }
}
@keyframes lpScrollBounce {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  50%       { transform: translateX(-50%) translateY(8px); }
}
.lp-reveal {
  opacity: 0;
  transform: translateY(32px);
  transition: opacity 0.9s var(--ease), transform 0.9s var(--ease);
}
.lp-reveal.visible {
  opacity: 1;
  transform: translateY(0);
}

/* ── responsive ── */
@media (max-width: 900px) {
  .lp-header { padding: 1.4rem 2rem; }
  .lp-section { padding: 5rem 2rem; }
  .lp-roles-section { padding: 5rem 2rem; }
  .lp-stats-section { padding: 5rem 2rem; }
  .lp-cta-section { padding: 6rem 2rem; }
  .lp-footer { padding: 2rem; flex-direction: column; gap: 1rem; text-align: center; }
  .lp-features-grid { grid-template-columns: 1fr; }
  .lp-feature:nth-child(n) { border-right: none; }
  .lp-feature:nth-last-child(-n+1) { border-bottom: none; }
  .lp-roles-grid { grid-template-columns: 1fr; }
  .lp-stats-grid { grid-template-columns: 1fr 1fr; }
.lp-cta-actions { flex-direction: column; align-items: center; }
}
`;

/* ─── component ──────────────────────────────────────────────────────────── */

export default function Home() {
  const router = useRouter();
  const canvasRef = useRef<HTMLDivElement>(null);
  const blurRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [checkingSession, setCheckingSession] = useState(false);
  const [sessionState, setSessionState] = useState<"guest" | "profile-missing">("guest");

  /* session check */
  // useEffect(() => {
  //   let cancelled = false;
  //   async function check() {
  //     try {
  //       const role = (await getUserRole()) as AppRole | null;
  //       if (!cancelled && role) { router.replace(routeForRole(role)); return; }
  //       const user = await getCurrentUser();
  //       if (!cancelled) setSessionState(user ? "profile-missing" : "guest");
  //     } finally {
  //       if (!cancelled) setCheckingSession(false);
  //     }
  //   }
  //   check();
  //   return () => { cancelled = true; };
  // }, [router]);

  /* inject styles */
  useEffect(() => {
    const id = "lp-styles";
    if (!document.getElementById(id)) {
      const el = document.createElement("style");
      el.id = id;
      el.textContent = CSS;
      document.head.appendChild(el);
    }
    return () => { document.getElementById(id)?.remove(); };
  }, []);

  /* three.js hero background */
  useEffect(() => {
    if (checkingSession) return;
    const container = canvasRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfdf2e9);

    const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.01, 40);
    camera.position.set(0, 0, 1.2);
    scene.add(camera);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.minDistance = 0.5;
    controls.maxDistance = 10;
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;

    let fallbackPoints: THREE.Points | null = null;

    function createFallback() {
      const n = 14000;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const c = new THREE.Color(0xe67e22);
      for (let i = 0; i < n; i++) {
        const r = 0.3 + Math.random() * 0.3;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        pos[i * 3 + 2] = r * Math.cos(phi);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const mat = new THREE.PointsMaterial({ size: 0.002, vertexColors: true, transparent: true, opacity: 0.55 });
      fallbackPoints = new THREE.Points(geo, mat);
      scene.add(fallbackPoints);
    }

    new PCDLoader().load(
      "https://threejs.org/examples/models/pcd/binary/Zaghetto.pcd",
      (points: THREE.Points) => {
        points.geometry.center();
        points.geometry.rotateX(Math.PI);
        (points.material as THREE.PointsMaterial).size = 0.0025;
        (points.material as THREE.PointsMaterial).color.setHex(0xe67e22);
        scene.add(points);
      },
      undefined,
      createFallback
    );

    scene.add(new THREE.AmbientLight(0xfff5e1, 0.8));
    const dir = new THREE.DirectionalLight(0xff7f50, 1.5);
    dir.position.set(5, 5, 5);
    scene.add(dir);

    let animId: number;
    const tick = () => {
      animId = requestAnimationFrame(tick);
      controls.update();
      if (fallbackPoints) fallbackPoints.rotation.y += 0.0004;
      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [checkingSession]);

  /* cursor + blur + scroll effects */
  useEffect(() => {
    if (checkingSession) return;

    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let cx = mx, cy = my;
    let rafId: number;

    const onMove = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY;
      if (dotRef.current) { dotRef.current.style.left = `${mx}px`; dotRef.current.style.top = `${my}px`; }
      if (blurRef.current) {
        blurRef.current.style.setProperty("--x", `${(mx / window.innerWidth) * 100}%`);
        blurRef.current.style.setProperty("--y", `${(my / window.innerHeight) * 100}%`);
      }
    };
    const animRing = () => {
      cx += (mx - cx) * 0.1; cy += (my - cy) * 0.1;
      if (ringRef.current) { ringRef.current.style.left = `${cx}px`; ringRef.current.style.top = `${cy}px`; }
      rafId = requestAnimationFrame(animRing);
    };
    animRing();
    document.addEventListener("mousemove", onMove);

    const grow = () => { if (!ringRef.current) return; ringRef.current.style.width = "60px"; ringRef.current.style.height = "60px"; ringRef.current.style.borderColor = "#e67e22"; };
    const shrink = () => { if (!ringRef.current) return; ringRef.current.style.width = "40px"; ringRef.current.style.height = "40px"; ringRef.current.style.borderColor = "rgba(230,126,34,0.4)"; };
    const interactives = document.querySelectorAll(".lp-btn, .lp-btn-ghost, .lp-brand");
    interactives.forEach(el => { el.addEventListener("mouseenter", grow); el.addEventListener("mouseleave", shrink); });

    /* header scroll */
    const onScroll = () => {
      if (headerRef.current) {
        headerRef.current.classList.toggle("scrolled", window.scrollY > 60);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    /* scroll reveal */
    const reveals = document.querySelectorAll(".lp-reveal");
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    reveals.forEach(el => io.observe(el));

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", onScroll);
      interactives.forEach(el => { el.removeEventListener("mouseenter", grow); el.removeEventListener("mouseleave", shrink); });
      io.disconnect();
    };
  }, [checkingSession]);

  // if (checkingSession) {
  //   return <div className="lp-loading">Resolving workspace...</div>;
  // }

  return (
    <>
    <div className="lp-root">

      {/* ── fixed header ── */}
      <header className="lp-header" ref={headerRef}>
        <span className="lp-brand">HR Console</span>
      </header>

      {/* ── hero ── */}
      <section className="lp-hero">
        <div ref={canvasRef} className="lp-hero-canvas" />
        <div ref={blurRef} className="lp-hero-blur" />
        <div className="lp-noise" />

        <div className="lp-hero-content">
          <p className="lp-eyebrow">Performance &amp; People Operations</p>
          <h1 className="lp-hero-title">HR Console</h1>
          <p className="lp-hero-sub">
            {sessionState === "profile-missing"
              ? "Your role profile is incomplete — contact HR, then re-login."
              : "Goals, growth, and governance — unified in one workspace."}
          </p>
          <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center" }}>
            <Link href="/login" className="lp-btn">
              {sessionState === "profile-missing" ? "Re-login" : "Sign In"}
            </Link>
            {sessionState === "guest" && (
              <Link href="/signup" className="lp-btn-ghost">Create Account</Link>
            )}
          </div>
        </div>

        <div className="lp-scroll-hint">
          <div className="lp-scroll-line" />
          Scroll
        </div>
      </section>

      {/* ── features ── */}
      <section className="lp-section">
        <div className="lp-reveal">
          <p className="lp-section-label">What it does</p>
          <h2 className="lp-section-title">Every workflow your team needs, in one place.</h2>
        </div>

        <div className="lp-features-grid" style={{ marginTop: "5rem" }}>
          {[
            { n: "01", title: "Goal Management", desc: "Create, draft, and submit goals through structured approval cycles. Track alignment from individual contributors up to org-level OKRs." },
            { n: "02", title: "Progress Updates", desc: "Log quantitative and qualitative progress updates tied to goals. Maintain a full audit trail reviewable by managers and HR." },
            { n: "03", title: "Check-in Workflows", desc: "Structured periodic check-ins between employees and managers. Scheduled, tracked, and archived — nothing falls through the cracks." },
            { n: "04", title: "Approval Queues", desc: "Goals and check-ins route through role-specific approval queues. Managers and HR can review, approve, or request revisions." },
            { n: "05", title: "Performance Cycles", desc: "Organize all activity within time-boxed performance cycles. View historical cycles and compare progress over time." },
            { n: "06", title: "Team Assignments", desc: "HR maps employees to managers, forming the access and reporting structure that governs all workflows in the system." },
          ].map(f => (
            <div key={f.n} className="lp-feature lp-reveal">
              <p className="lp-feature-num">{f.n}</p>
              <p className="lp-feature-title">{f.title}</p>
              <p className="lp-feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="lp-section-divider" />

      {/* ── roles ── */}
      <section className="lp-roles-section">
        <div className="lp-reveal">
          <p className="lp-section-label">Roles</p>
          <h2 className="lp-section-title" style={{ color: "var(--c-bg)" }}>Tailored experiences for every level of your org.</h2>
        </div>

        <div className="lp-roles-grid">
          {[
            {
              idx: "01 / Employee",
              name: "Employee",
              desc: "Manage your own goals, submit progress updates, and participate in check-ins. Track your growth across performance cycles with a clear timeline view.",
              tags: ["Goals", "Progress", "Check-ins", "Cycle Timeline"],
            },
            {
              idx: "02 / Manager",
              name: "Manager",
              desc: "Oversee your team's goals and progress. Run structured check-ins, process approvals, and get a unified view of team performance at a glance.",
              tags: ["Team Progress", "Approvals", "Check-ins", "Coaching"],
            },
            {
              idx: "03 / HR",
              name: "HR",
              desc: "Configure team structures, oversee the full governance queue, and monitor check-in compliance across the organisation. Full visibility, zero micromanagement.",
              tags: ["Team Assignments", "Governance", "Monitoring", "Drilldowns"],
            },
          ].map(r => (
            <div key={r.idx} className="lp-role-card lp-reveal">
              <p className="lp-role-index">{r.idx}</p>
              <p className="lp-role-name">{r.name}</p>
              <p className="lp-role-desc">{r.desc}</p>
              <div className="lp-role-tags">
                {r.tags.map(t => <span key={t} className="lp-role-tag">{t}</span>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── stats ── */}
      <section className="lp-stats-section">
        <div className="lp-reveal">
          <p className="lp-section-label">Built for scale</p>
          <h2 className="lp-section-title">Structured workflows that grow with your team.</h2>
        </div>

        <div className="lp-stats-grid">
          {[
            { num: "3", label: "Role-specific\ndashboards" },
            { num: "6+", label: "Core workflow\nmodules" },
            { num: "∞", label: "Performance\ncycles" },
            { num: "1", label: "Unified\nworkspace" },
          ].map(s => (
            <div key={s.num} className="lp-stat lp-reveal">
              <p className="lp-stat-num">{s.num}</p>
              <p className="lp-stat-label" style={{ whiteSpace: "pre-line" }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="lp-cta-section">
        <div className="lp-cta-bg" />
        <div className="lp-cta-glass lp-reveal">
          <p className="lp-eyebrow">Ready to begin</p>
          <h2 className="lp-cta-title">
            {sessionState === "profile-missing" ? "Your workspace awaits." : "Start your performance cycle."}
          </h2>
          <p className="lp-cta-sub">
            {sessionState === "profile-missing"
              ? "Contact HR to complete your role setup, then re-login to access your workspace."
              : "Sign in to your existing workspace or create a new account to get started."}
          </p>
          <div className="lp-cta-actions">
            <Link href="/login" className="lp-btn">
              {sessionState === "profile-missing" ? "Re-login" : "Sign In"}
            </Link>
            {sessionState === "guest" && (
              <Link href="/signup" className="lp-btn-ghost">Create Account</Link>
            )}
          </div>
        </div>
      </section>

      {/* ── footer ── */}
      <footer className="lp-footer">
        <span className="lp-footer-brand">HR Console</span>
        <div className="lp-footer-meta">
          PERFORMANCE_MGMT_v2<br />
          Employee · Manager · HR
        </div>
      </footer>

      {/* cursor */}
      <div ref={dotRef} className="lp-cursor-dot" />
      <div ref={ringRef} className="lp-cursor-ring" />
    </div>
    <ChatBot role="guest" theme="lp" />
    </>
  );
}

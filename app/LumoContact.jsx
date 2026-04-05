/**
 * LumoContact — self-contained LUMO studios Contact page
 *
 * Dependencies (add to your project):
 *   npm install three
 *
 * Usage:
 *   import LumoContact from './LumoContact';
 *   <LumoContact />
 *
 * The component injects its own <style> tag and Google Fonts link on mount
 * so it works without any separate CSS file.
 */

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PCDLoader } from 'three/addons/loaders/PCDLoader.js';

/* ─── styles ─────────────────────────────────────────────────────────────── */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Italianno&family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');

.lumo-root {
  --c-bg-base: #fdf2e9;
  --c-text-main: #4a2c2a;
  --c-text-muted: #8e6d6b;
  --c-accent: #e67e22;
  --c-secondary-accent: #ff7f50;
  --c-golden: #f39c12;
  --ease-fluid: cubic-bezier(0.2, 0.0, 0.2, 1);
  --font-serif: 'Playfair Display', serif;
  --font-mono: 'Space Mono', monospace;

  position: fixed;
  inset: 0;
  background-color: var(--c-bg-base);
  font-family: var(--font-serif);
  overflow: hidden;
  color: var(--c-text-main);
  -webkit-font-smoothing: antialiased;
  cursor: none;
}

.lumo-root *, .lumo-root *::before, .lumo-root *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  cursor: none;
}

.lumo-three {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.lumo-layer-sharp {
  position: absolute;
  inset: 0;
  background-color: transparent;
  z-index: 1;
  pointer-events: none;
}

.lumo-layer-blur {
  position: absolute;
  inset: 0;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  z-index: 2;
  pointer-events: none;
  mask-image: radial-gradient(circle 200px at var(--x, 50%) var(--y, 50%), transparent 0%, black 100%);
  -webkit-mask-image: radial-gradient(circle 200px at var(--x, 50%) var(--y, 50%), transparent 0%, black 100%);
}

.lumo-noise {
  position: absolute;
  inset: 0;
  z-index: 3;
  opacity: 0.15;
  pointer-events: none;
  mix-blend-mode: overlay;
  filter: contrast(120%);
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.6' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
}

.lumo-ui {
  position: relative;
  z-index: 10;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 4rem 5rem;
  pointer-events: none;
}

.lumo-nav-text {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-weight: 400;
  color: var(--c-text-main);
  pointer-events: auto;
  transition: color 0.3s ease;
  text-decoration: none;
}
.lumo-nav-text:hover {
  color: var(--c-accent);
  text-shadow: 0 0 8px rgba(230,126,34,0.4);
}

.lumo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  border-bottom: 1px solid rgba(142,109,107,0.2);
  padding-bottom: 1.5rem;
  pointer-events: auto;
}

.lumo-brand {
  font-family: var(--font-serif);
  font-size: 2rem;
  font-weight: 400;
  letter-spacing: -0.02em;
  text-transform: uppercase;
  font-style: italic;
  color: var(--c-text-main);
}

.lumo-content {
  position: absolute;
  top: 55%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  max-width: 800px;
  pointer-events: auto;
  opacity: 0;
  animation: lumoFadeIn 2s var(--ease-fluid) forwards 0.3s;
}

.lumo-contact-header {
  text-align: center;
  margin-bottom: 4rem;
}

.lumo-title {
  font-family: var(--font-serif);
  font-size: 4rem;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: -0.03em;
  color: var(--c-text-main);
  margin-bottom: 1rem;
}

.lumo-subtitle {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--c-accent);
}

.lumo-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3rem 4rem;
}

.lumo-form-group {
  position: relative;
  display: flex;
  flex-direction: column;
}
.lumo-form-group.full-width {
  grid-column: span 2;
}

.lumo-label {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--c-text-muted);
  margin-bottom: 0.75rem;
  transition: color 0.3s ease;
}

.lumo-input {
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(74,44,42,0.2);
  padding: 0.75rem 0;
  font-family: var(--font-serif);
  font-size: 1.2rem;
  color: var(--c-text-main);
  outline: none;
  transition: border-color 0.3s ease;
}

.lumo-input-highlight {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  width: 0;
  background: var(--c-accent);
  transition: width 0.6s var(--ease-fluid);
}
.lumo-input:focus ~ .lumo-input-highlight {
  width: 100%;
}

.lumo-submit-container {
  grid-column: span 2;
  display: flex;
  justify-content: center;
  margin-top: 2rem;
}

.lumo-btn {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 1.2rem 3.5rem;
  border: none;
  transition: all 0.4s var(--ease-fluid);
  background: var(--c-accent);
  color: white;
  font-weight: 700;
  cursor: none;
  display: inline-block;
}
.lumo-btn:hover {
  background: var(--c-secondary-accent);
  box-shadow: 0 0 30px rgba(230,126,34,0.4);
  transform: translateY(-2px);
}

.lumo-coords {
  position: absolute;
  bottom: 4rem;
  left: 5rem;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  color: var(--c-text-muted);
  border-left: 1px solid var(--c-golden);
  padding-left: 1rem;
  line-height: 1.4;
}
.lumo-coords::before {
  content: '||| || | |||';
  display: block;
  font-size: 0.6rem;
  letter-spacing: 2px;
  margin-bottom: 0.5rem;
  color: var(--c-accent);
  opacity: 0.8;
}

.lumo-cursor-dot {
  position: fixed;
  top: 0;
  left: 0;
  width: 4px;
  height: 4px;
  background-color: var(--c-accent);
  z-index: 9999;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.lumo-cursor-outline {
  position: fixed;
  top: 0;
  left: 0;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(230,126,34,0.4);
  border-radius: 50%;
  z-index: 9999;
  pointer-events: none;
  transform: translate(-50%, -50%);
  transition: width 0.2s, height 0.2s;
  mix-blend-mode: color-burn;
}
.lumo-cursor-outline::before,
.lumo-cursor-outline::after {
  content: '';
  position: absolute;
  background: var(--c-accent);
}
.lumo-cursor-outline::before {
  top: 50%; left: -20%; right: -20%; height: 1px;
}
.lumo-cursor-outline::after {
  left: 50%; top: -20%; bottom: -20%; width: 1px;
}

@keyframes lumoFadeIn {
  from { opacity: 0; transform: translate(-50%, -45%); filter: blur(10px); }
  to   { opacity: 1; transform: translate(-50%, -50%); filter: blur(0); }
}

@media (max-width: 768px) {
  .lumo-content { width: 90%; top: 50%; }
  .lumo-form { grid-template-columns: 1fr; gap: 2rem; }
  .lumo-form-group.full-width { grid-column: span 1; }
  .lumo-title { font-size: 2.5rem; }
  .lumo-ui { padding: 2rem; }
  .lumo-coords { display: none; }
}
`;

/* ─── component ──────────────────────────────────────────────────────────── */

export default function LumoContact() {
  const threeRef = useRef(null);
  const blurRef = useRef(null);
  const dotRef = useRef(null);
  const outlineRef = useRef(null);

  /* inject styles once */
  useEffect(() => {
    const id = 'lumo-contact-styles';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, []);

  /* three.js */
  useEffect(() => {
    const container = threeRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
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
    controls.autoRotateSpeed = 0.4;

    let fallbackPoints = null;

    function createFallback() {
      const n = 12000;
      const positions = new Float32Array(n * 3);
      const colors = new Float32Array(n * 3);
      const c = new THREE.Color(0xe67e22);
      for (let i = 0; i < n; i++) {
        const r = 0.35 + Math.random() * 0.25;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const mat = new THREE.PointsMaterial({ size: 0.002, vertexColors: true, transparent: true, opacity: 0.6 });
      fallbackPoints = new THREE.Points(geo, mat);
      scene.add(fallbackPoints);
    }

    new PCDLoader().load(
      'https://threejs.org/examples/models/pcd/binary/Zaghetto.pcd',
      (points) => {
        points.geometry.center();
        points.geometry.rotateX(Math.PI);
        points.material.size = 0.0025;
        points.material.color.setHex(0xe67e22);
        scene.add(points);
      },
      undefined,
      createFallback
    );

    scene.add(new THREE.AmbientLight(0xfff5e1, 0.8));
    const dir = new THREE.DirectionalLight(0xff7f50, 1.5);
    dir.position.set(5, 5, 5);
    scene.add(dir);

    let animId;
    const tick = () => {
      animId = requestAnimationFrame(tick);
      controls.update();
      if (fallbackPoints) fallbackPoints.rotation.y += 0.0005;
      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);

  /* blur layer + cursor */
  useEffect(() => {
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let cx = mouseX, cy = mouseY;
    let animId;

    const onMove = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (dotRef.current) {
        dotRef.current.style.left = `${mouseX}px`;
        dotRef.current.style.top = `${mouseY}px`;
      }
      if (blurRef.current) {
        blurRef.current.style.setProperty('--x', `${(mouseX / window.innerWidth) * 100}%`);
        blurRef.current.style.setProperty('--y', `${(mouseY / window.innerHeight) * 100}%`);
      }
    };

    const animCursor = () => {
      cx += (mouseX - cx) * 0.1;
      cy += (mouseY - cy) * 0.1;
      if (outlineRef.current) {
        outlineRef.current.style.left = `${cx}px`;
        outlineRef.current.style.top = `${cy}px`;
      }
      animId = requestAnimationFrame(animCursor);
    };
    animCursor();

    document.addEventListener('mousemove', onMove);

    const grow = () => {
      if (!outlineRef.current) return;
      outlineRef.current.style.width = '60px';
      outlineRef.current.style.height = '60px';
      outlineRef.current.style.borderColor = '#e67e22';
    };
    const shrink = () => {
      if (!outlineRef.current) return;
      outlineRef.current.style.width = '40px';
      outlineRef.current.style.height = '40px';
      outlineRef.current.style.borderColor = 'rgba(230,126,34,0.4)';
    };
    const targets = document.querySelectorAll('.lumo-btn, .lumo-nav-text, .lumo-input');
    targets.forEach(el => { el.addEventListener('mouseenter', grow); el.addEventListener('mouseleave', shrink); });

    return () => {
      cancelAnimationFrame(animId);
      document.removeEventListener('mousemove', onMove);
      targets.forEach(el => { el.removeEventListener('mouseenter', grow); el.removeEventListener('mouseleave', shrink); });
    };
  }, []);

  return (
    <div className="lumo-root">
      <div ref={threeRef} className="lumo-three" />
      <div className="lumo-layer-sharp" />
      <div ref={blurRef} className="lumo-layer-blur" />
      <div className="lumo-noise" />

      <div className="lumo-ui">
        <header className="lumo-header">
          <Link href="/" className="lumo-nav-text lumo-brand">LUMO studios</Link>
          <div style={{ display: 'flex', gap: '3rem' }}>
            <a href="#" className="lumo-nav-text">Projects</a>
            <a href="#" className="lumo-nav-text">Capabilities</a>
            <a href="#" className="lumo-nav-text" style={{ color: 'var(--c-accent)' }}>Contact</a>
          </div>
        </header>

        <div className="lumo-content">
          <div className="lumo-contact-header">
            <h1 className="lumo-title">Initiate Inquiry</h1>
            <p className="lumo-subtitle">Let&apos;s craft the future of your vision</p>
          </div>

          <form className="lumo-form">
            <div className="lumo-form-group">
              <label className="lumo-label">Identity</label>
              <input type="text" className="lumo-input" placeholder="Your Name" />
              <div className="lumo-input-highlight" />
            </div>
            <div className="lumo-form-group">
              <label className="lumo-label">Electronic Mail</label>
              <input type="email" className="lumo-input" placeholder="email@address.com" />
              <div className="lumo-input-highlight" />
            </div>
            <div className="lumo-form-group full-width">
              <label className="lumo-label">Project Scope</label>
              <input type="text" className="lumo-input" placeholder="Describe the objective" />
              <div className="lumo-input-highlight" />
            </div>
            <div className="lumo-submit-container">
              <button type="submit" className="lumo-btn">Transmit Data</button>
            </div>
          </form>
        </div>

        <div className="lumo-coords">
          52.3676° N, 4.9041° E / INQUIRY_PORTAL_v1
        </div>
      </div>

      <div ref={dotRef} className="lumo-cursor-dot" />
      <div ref={outlineRef} className="lumo-cursor-outline" />
    </div>
  );
}

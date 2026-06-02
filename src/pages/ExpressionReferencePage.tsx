import { useState, useEffect, useRef } from 'react';
import ExpressionReference, { SECTIONS } from '../components/ExpressionReference';

const INDIGO      = '#6366f1';
const INDIGO_DEEP = '#4f46e5';
const INDIGO_LIGHT = '#eef2ff';
const DARK_BG     = '#0f172a';
const BODY_TEXT   = '#1e293b';
const MUTED       = '#64748b';
const BORDER      = '#e2e8f0';

export default function ExpressionReferencePage() {
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);
  const contentRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver — highlight the TOC item whose section is in view
  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    SECTIONS.forEach(sec => {
      const el = document.getElementById(`ref-sec-${sec.id}`);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveId(sec.id); },
        { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach(o => o.disconnect());
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(`ref-sec-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8faff' }}>

      {/* ── Hero banner ─────────────────────────────────────────────────── */}
      <div style={{
        background: DARK_BG,
        padding: '40px 48px 36px',
        borderBottom: `3px solid ${INDIGO}`,
      }}>
        {/* Gradient top strip */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: 4,
          background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
          zIndex: 1,
        }} />

        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 20, padding: '3px 12px', marginBottom: 16,
          }}>
            <span style={{ color: INDIGO, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
              REFERENCE
            </span>
          </div>
          <h1 style={{
            margin: '0 0 8px',
            fontSize: 32, fontWeight: 800,
            color: '#fff', lineHeight: 1.2, letterSpacing: '-0.02em',
          }}>
            Expression Language
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: '#94a3b8', lineHeight: '22px', maxWidth: 580 }}>
            Complete reference for writing expressions in Rule nodes, Branch conditions,
            Scorecard bands, and Custom Output templates.
          </p>

          {/* Stat chips */}
          <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
            {[
              { label: '11 Sections' },
              { label: '25+ Functions' },
              { label: 'Live Validation' },
              { label: 'SQL-like Syntax' },
            ].map(chip => (
              <span key={chip.label} style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 20, padding: '4px 14px',
                fontSize: 12, color: '#e2e8f0', fontWeight: 500,
              }}>
                {chip.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body: TOC + Content ──────────────────────────────────────────── */}
      <div style={{
        maxWidth: 1100, margin: '0 auto',
        display: 'flex', alignItems: 'flex-start',
        padding: '32px 24px',
        gap: 32,
      }}>

        {/* ── Sticky TOC ─────────────────────────────────────────────────── */}
        <nav style={{
          width: 210, flexShrink: 0,
          position: 'sticky', top: 24,
          background: '#fff',
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: '16px 0',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          <div style={{
            padding: '0 16px 12px',
            fontSize: 10, fontWeight: 700, color: MUTED,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            borderBottom: `1px solid ${BORDER}`,
            marginBottom: 8,
          }}>
            Contents
          </div>
          {SECTIONS.map(sec => {
            const active = activeId === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => scrollTo(sec.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '6px 16px',
                  background: active ? INDIGO_LIGHT : 'transparent',
                  border: 'none', cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s',
                  borderLeft: active ? `3px solid ${INDIGO}` : '3px solid transparent',
                }}
              >
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: active ? INDIGO : '#cbd5e1',
                  fontFamily: 'monospace', flexShrink: 0,
                }}>
                  {sec.num}
                </span>
                <span style={{
                  fontSize: 12, color: active ? INDIGO_DEEP : BODY_TEXT,
                  fontWeight: active ? 600 : 400, lineHeight: '17px',
                }}>
                  {sec.title}
                </span>
              </button>
            );
          })}
        </nav>

        {/* ── Scrollable content ──────────────────────────────────────────── */}
        <div ref={contentRef} style={{ flex: 1, minWidth: 0 }}>
          {/* Quick-jump bar for mobile / narrow */}
          <div style={{
            background: '#fff', border: `1px solid ${BORDER}`,
            borderRadius: 10, padding: '10px 16px',
            marginBottom: 24, fontSize: 12, color: MUTED,
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          }}>
            <span style={{ fontWeight: 600, color: BODY_TEXT, marginRight: 4 }}>Jump to:</span>
            {SECTIONS.map(sec => (
              <button
                key={sec.id}
                onClick={() => scrollTo(sec.id)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, color: INDIGO, fontWeight: 500, padding: '2px 4px',
                  borderRadius: 4,
                }}
              >
                {sec.title}
              </button>
            ))}
          </div>

          <ExpressionReference />
        </div>
      </div>
    </div>
  );
}

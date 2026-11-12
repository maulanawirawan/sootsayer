// "Built with Kiro" shots: the real spec, steering, hooks, test output, parity
// output and MCP result, typeset from src/kiro.generated.json (collected by
// scripts/prepare-kiro.mjs from the repo and from commands run on it).
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { CHAR, EMBER, INK, MUTED, mono, sans } from '../fonts';
import K from '../kiro.generated.json';
import { FPS, type Placed } from '../timeline';
import { Captions } from '../ui/Caption';
import { Grain } from '../ui/Grain';
import { FRAME } from './AppShot';
import { CARD } from './BurnCard';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const GREEN = '#7fd0a8';
const FIRE = '#e2552b';

function Window({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: '#121318', border: '1px solid rgba(255,238,205,0.14)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(255,238,205,0.1)', background: '#17181e' }}>
        {['#e2552b', '#f5a524', '#6fb3a6'].map((c) => (
          <span key={c} style={{ width: 10, height: 10, borderRadius: 5, background: c, opacity: 0.8 }} />
        ))}
        <span style={{ fontFamily: mono, fontSize: 17, color: MUTED, marginLeft: 10 }}>{title}</span>
      </div>
      <div style={{ padding: '16px 20px', flex: 1, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

/** Lines appear one after another from `at`, `per` seconds apart. */
function Typed({ lines, t, at, per, color = INK, size = 19, render }: { lines: string[]; t: number; at: number; per: number; color?: string; size?: number; render?: (l: string, i: number) => React.ReactNode }) {
  return (
    <div style={{ fontFamily: mono, fontSize: size, lineHeight: 1.5, color, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {lines.map((l, i) => {
        const a = interpolate(t, [at + i * per, at + i * per + 0.25], [0, 1], clamp);
        if (a <= 0) return null;
        return (
          <div key={i} style={{ opacity: a }}>
            {render ? render(l, i) : l}
          </div>
        );
      })}
    </div>
  );
}

const EARS = /\b(WHEN|IF|THEN|WHILE|WHERE|THE SYSTEM SHALL|SHALL)\b/g;
function ears(l: string) {
  const parts = l.split(EARS);
  return parts.map((p, i) => (EARS.test(p) ? <span key={i} style={{ color: EMBER, fontWeight: 600 }}>{p}</span> : <span key={i}>{p}</span>));
}

function Spec({ t }: { t: number }) {
  const c = K.counts;
  const lines = K.req1.filter((l: string) => l.trim()).slice(0, 12);
  const stats: [number, string][] = [
    [c.specs, 'specs'],
    [c.requirements, 'requirements'],
    [c.criteria, 'acceptance criteria (EARS)'],
    [c.decisions, 'design decisions'],
    [c.tasks, 'tasks'],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 18, height: '100%' }}>
      <Window title=".kiro/specs/outlook-v2/requirements.md">
        <Typed lines={lines} t={t} at={0.6} per={0.32} size={18} render={(l) => ears(l)} />
      </Window>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {stats.map(([n, label], i) => {
            const a = interpolate(t, [1.0 + i * 0.35, 1.4 + i * 0.35], [0, 1], clamp);
            return (
              <div key={label} style={{ opacity: a, background: '#16171c', border: '1px solid rgba(255,238,205,0.12)', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 44, color: EMBER }}>{Math.round(n * a)}</div>
                <div style={{ fontFamily: sans, fontSize: 18, color: MUTED }}>{label}</div>
              </div>
            );
          })}
        </div>
        <Window title=".kiro/specs/outlook-v2/tasks.md" style={{ flex: 1 }}>
          <Typed lines={K.tasksV2.map((l: string) => l.replace(/^- /, ''))} t={t} at={3.2} per={0.42} size={17} render={(l) => <span>{l.startsWith('[x]') ? <span style={{ color: GREEN }}>✓ </span> : <span style={{ color: MUTED }}>○ </span>}{l.replace(/^\[[x ]\] /, '')}</span>} />
        </Window>
      </div>
    </div>
  );
}

function Hooks({ t, stamps }: { t: number; stamps: number[] }) {
  const rules = K.rules.filter((l: string) => /^\d\./.test(l.trim()));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 18, height: '100%' }}>
      <Window title=".kiro/steering/product.md · House rules">
        <Typed lines={rules} t={t} at={0.5} per={0.45} size={19} render={(l) => <span>{l.replace(/\*\*/g, '')}</span>} />
      </Window>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Window title=".kiro/hooks/*.json">
          <Typed
            lines={K.hooks.map((h: { name: string; trigger: string; matcher: string; action: string }) => `${h.trigger} ${h.matcher.replace(/\\\\/g, '\\')}\n  → ${h.name} (${h.action})`)}
            t={t}
            at={1.6}
            per={0.5}
            size={16}
          />
        </Window>
        <Window title="Hook findings during this build" style={{ flex: 1 }}>
          {K.findings.map((x: { file: string; what: string; fix: string }, i: number) => {
            const at = stamps[i] ?? 3.6 + i * 1.8; // the stamp lands here (the score uses the same times)
            const a = interpolate(t, [at - 0.7, at - 0.4], [0, 1], clamp);
            const slam = interpolate(t, [at, at + 0.16], [0, 1], { ...clamp, easing: Easing.out(Easing.back(2.2)) });
            const fixed = interpolate(t, [at + 0.75, at + 1.05], [0, 1], clamp);
            return (
              <div key={i} style={{ position: 'relative', opacity: a, marginBottom: 16, fontFamily: sans, fontSize: 21, lineHeight: 1.35 }}>
                <div style={{ fontFamily: mono, fontSize: 16, color: MUTED }}>{x.file}</div>
                <div style={{ color: INK, paddingRight: 190 }}>{x.what}</div>
                <div style={{ color: GREEN, opacity: fixed }}>✓ fixed: {x.fix}</div>
                {t >= at ? (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 6,
                      transform: `rotate(-7deg) scale(${1.6 - 0.6 * slam})`,
                      opacity: Math.min(1, slam * 1.4),
                      border: `3px solid ${FIRE}`,
                      color: FIRE,
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontFamily: mono,
                      fontWeight: 600,
                      fontSize: 18,
                      letterSpacing: 2,
                      boxShadow: `0 0 14px rgba(226,85,43,${0.35 * slam})`,
                    }}
                  >
                    CAUGHT BY HOOK
                  </div>
                ) : null}
              </div>
            );
          })}
        </Window>
      </div>
    </div>
  );
}

function Tests({ t }: { t: number }) {
  const props = K.tests.props.map((l: string) => l.replace(/^test /, '').replace(/ \.\.\. ok$/, ''));
  return (
    <div style={{ display: 'grid', gridTemplateRows: '1.1fr 1fr', gap: 18, height: '100%' }}>
      <Window title="cargo test --manifest-path engine/Cargo.toml   (proptest)">
        <Typed lines={props} t={t} at={0.4} per={0.28} size={19} render={(l) => <span><span style={{ color: GREEN }}>ok </span>{l.replace(/_/g, ' ')}</span>} />
        <Typed lines={K.tests.results} t={t} at={2.9} per={0.3} size={18} color={GREEN} />
      </Window>
      <Window title="node web/scripts/check-parity.mjs   (WebAssembly vs native CLI)">
        <Typed
          lines={K.parity}
          t={t}
          at={3.6}
          per={0.35}
          size={18}
          render={(l) => {
            const m = /^(identical)\s+(.+?)\s+wasm (\w+) cli (\w+)\s+(\d+) bytes/.exec(l);
            if (!m) return l;
            return (
              <span>
                <span style={{ color: GREEN }}>identical </span>
                <span style={{ color: INK }}>{m[2].padEnd(26)}</span>
                <span style={{ color: MUTED }}> wasm </span>
                <span style={{ color: EMBER }}>{m[3]}</span>
                <span style={{ color: MUTED }}> cli </span>
                <span style={{ color: EMBER }}>{m[4]}</span>
              </span>
            );
          }}
        />
      </Window>
    </div>
  );
}

function Mcp({ t }: { t: number }) {
  const text = K.mcp.text.split('\n').filter((l: string) => l.trim()).slice(0, 14);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.6fr', gap: 18, height: '100%' }}>
      <Window title=".kiro/settings/mcp.json · sootsayer">
        <div style={{ fontFamily: sans, fontSize: 19, color: MUTED, marginBottom: 12 }}>MCP tools (Python SDK v2, calling the Rust CLI)</div>
        {K.mcp.tools.map((name: string, i: number) => {
          const a = interpolate(t, [0.4 + i * 0.25, 0.7 + i * 0.25], [0, 1], clamp);
          const hot = name === 'daily_brief' && t > 2.4;
          return (
            <div key={name} style={{ opacity: a, fontFamily: mono, fontSize: 21, color: hot ? '#140d03' : INK, background: hot ? EMBER : 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,238,205,0.12)', borderRadius: 8, padding: '7px 12px', marginBottom: 10 }}>
              {name}
            </div>
          );
        })}
        <div style={{ fontFamily: sans, fontSize: 18, color: MUTED, marginTop: 16, opacity: interpolate(t, [3.0, 3.5], [0, 1], clamp) }}>
          + custom agent <span style={{ fontFamily: mono, color: INK }}>sootsayer-briefer</span>
          <br />+ Kiro power <span style={{ fontFamily: mono, color: INK }}>power-sootsayer</span>
        </div>
      </Window>
      <Window title={`sootsayer.${K.mcp.call}`}>
        <Typed lines={text} t={t} at={2.6} per={0.22} size={17} render={(l) => <span style={{ color: /^\d\./.test(l) ? INK : MUTED }}>{l}</span>} />
      </Window>
    </div>
  );
}

export function KiroShot({ shot, lead = 0 }: { shot: Placed; lead?: number }) {
  const f = useCurrentFrame() - lead;
  const t = f / FPS;
  const fadeIn = lead ? interpolate(f, [-lead, 0], [0, 1], clamp) : 1;
  const counts = `${K.counts.specs} specs · ${K.counts.requirements} requirements · ${K.counts.criteria} acceptance criteria · ${K.counts.tasks} tasks, in .kiro/specs/`;
  // with a chapter card first, the panel starts typing once the card is gone
  const pt = t - (shot.chapter ? CARD.seconds : 0);
  const body =
    shot.panel === 'spec' ? <Spec t={pt} /> : shot.panel === 'hooks' ? <Hooks t={pt} stamps={shot.stamps ?? []} /> : shot.panel === 'tests' ? <Tests t={pt} /> : <Mcp t={pt} />;
  const enter = interpolate(t, [-lead / FPS - 0.001, 0.5], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 40%, #191a1f 0%, ${CHAR} 70%)`, opacity: fadeIn }}>
      <div style={{ position: 'absolute', left: FRAME.x, top: FRAME.y, width: FRAME.w, height: FRAME.h, padding: 22, opacity: enter, transform: `translateY(${(1 - enter) * 12}px)` }}>
        {body}
      </div>
      <Captions t={t} captions={shot.captions ?? []} top={FRAME.y + FRAME.h + 22} sub={(s) => s.replace('{specCounts}', counts)} />
      <Grain frame={f} opacity={0.05} />
    </AbsoluteFill>
  );
}

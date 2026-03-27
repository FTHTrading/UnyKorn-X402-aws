import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

// ═══════════════════════════════════════════════════════════════
//  UnyKorn ICO — Shared Utilities
//  Toast notifications, animated counters, skeleton loading,
//  scroll-to-top, connection status, keyboard shortcuts
// ═══════════════════════════════════════════════════════════════

// ── Toast Notification System ─────────────────────────────────

export type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
}

interface ToastCtx {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastCtx>({ toasts: [], addToast: () => {}, removeToast: () => {} });

export function useToast() { return useContext(ToastContext); }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string, duration = 4000) => {
    const id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, type, message, duration }]);
    if (duration > 0) setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`} onClick={() => removeToast(t.id)}>
            <span className="toast-icon">
              {t.type === "success" ? "✓" : t.type === "error" ? "✕" : t.type === "warning" ? "⚠" : "ℹ"}
            </span>
            <span className="toast-msg">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ── Animated Counter ──────────────────────────────────────────

export function AnimatedCounter({ value, prefix = "", suffix = "", duration = 1200 }: {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!ref.current || hasAnimated.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const start = performance.now();
          const animate = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            setDisplay(Math.round(value * eased));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, duration]);

  return <span ref={ref}>{prefix}{display.toLocaleString()}{suffix}</span>;
}

// ── Skeleton Loading ──────────────────────────────────────────

export function Skeleton({ width, height = 16, radius = 4, className = "" }: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  className?: string;
}) {
  return (
    <div
      className={`skeleton-pulse ${className}`}
      style={{
        width: width ?? "100%",
        height,
        borderRadius: radius,
      }}
    />
  );
}

export function SkeletonRows({ rows = 5, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`skeleton-rows ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={14} width={`${70 + Math.random() * 30}%`} />
      ))}
    </div>
  );
}

// ── Back-to-Top Button ────────────────────────────────────────

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      className="back-to-top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
    >
      ↑
    </button>
  );
}

// ── API Connection Status ─────────────────────────────────────

export function useConnectionStatus() {
  const [status, setStatus] = useState<"connected" | "degraded" | "offline">("connected");

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("https://api.unykorn.org/", { signal: AbortSignal.timeout(5000) });
        if (!cancelled) setStatus(res.ok ? "connected" : "degraded");
      } catch {
        if (!cancelled) setStatus("offline");
      }
    }
    check();
    const t = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  return status;
}

export function ConnectionBadge({ status }: { status: "connected" | "degraded" | "offline" }) {
  const colors: Record<string, string> = { connected: "var(--green)", degraded: "var(--gold)", offline: "var(--red)" };
  const labels: Record<string, string> = { connected: "Live", degraded: "Slow", offline: "Offline" };

  return (
    <span className="conn-badge" style={{ color: colors[status] }}>
      <span className="conn-dot" style={{ background: colors[status] }} />
      {labels[status]}
    </span>
  );
}

// ── Risk Disclaimer Banner ────────────────────────────────────

export function RiskBanner() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const prev = typeof window !== "undefined" && window.localStorage.getItem("unykorn.risk_ack");
    if (prev === "1") setDismissed(true);
  }, []);

  function dismiss() {
    setDismissed(true);
    try { window.localStorage.setItem("unykorn.risk_ack", "1"); } catch {}
  }

  if (dismissed) return null;

  return (
    <div className="risk-banner">
      <span className="risk-banner-text">
        <strong>⚠ Risk Disclosure:</strong> Cryptocurrency investments are volatile and carry substantial risk of loss.
        UNY tokens are speculative. This is not financial advice. Only invest what you can afford to lose.
        By continuing, you acknowledge these risks.
      </span>
      <button className="risk-banner-btn" onClick={dismiss}>I Understand</button>
    </div>
  );
}

// ── Social Proof Feed ─────────────────────────────────────────

const ACTIVITY_TEMPLATES = [
  { action: "purchased", amounts: ["$500", "$1,000", "$2,500", "$5,000", "$10,000", "$25,000"] },
  { action: "claimed vesting", amounts: ["25,000 UNY", "50,000 UNY", "125,000 UNY"] },
  { action: "placed buy order", amounts: ["10,000 UNY", "25,000 UNY", "50,000 UNY"] },
  { action: "generated referral", amounts: ["code"] },
];

const FAKE_WALLETS = [
  "uny1_7f3a...x9k2", "uny1_b82c...m4n1", "uny1_e5d1...r7p3", "uny1_1a9f...t2v8",
  "0x8c47...3fA1", "0xd291...7eB4", "uny1_c6e8...q5w0", "0xf134...9dC6",
  "uny1_92b7...h3j5", "uny1_4d0e...k8l9", "0xa563...2bD7", "uny1_f1c4...s6m2",
];

function randomItem<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

export function SocialProofFeed() {
  const [events, setEvents] = useState<{ id: number; wallet: string; action: string; amount: string; time: string }[]>([]);

  useEffect(() => {
    // Seed initial events
    const initial = Array.from({ length: 4 }, (_, i) => {
      const tmpl = randomItem(ACTIVITY_TEMPLATES);
      return {
        id: i,
        wallet: randomItem(FAKE_WALLETS),
        action: tmpl.action,
        amount: randomItem(tmpl.amounts),
        time: `${Math.floor(Math.random() * 30) + 1}m ago`,
      };
    });
    setEvents(initial);

    // Drip new events
    let counter = 10;
    const t = setInterval(() => {
      const tmpl = randomItem(ACTIVITY_TEMPLATES);
      setEvents(prev => [
        {
          id: counter++,
          wallet: randomItem(FAKE_WALLETS),
          action: tmpl.action,
          amount: randomItem(tmpl.amounts),
          time: "just now",
        },
        ...prev.slice(0, 5),
      ]);
    }, 8000 + Math.random() * 12000);

    return () => clearInterval(t);
  }, []);

  return (
    <div className="social-feed">
      <div className="social-feed-header">
        <span className="dot" />
        Live Activity
      </div>
      <div className="social-feed-list">
        {events.map(e => (
          <div key={e.id} className="social-feed-item">
            <span className="social-feed-wallet">{e.wallet}</span>
            <span className="social-feed-action">{e.action}</span>
            <strong className="social-feed-amount">{e.amount}</strong>
            <span className="social-feed-time">{e.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CSV Export Helper ─────────────────────────────────────────

export function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Keyboard Shortcuts ────────────────────────────────────────

export function useKeyboardShortcuts(shortcuts: Record<string, () => void>) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Don't fire when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = [
        e.ctrlKey ? "ctrl" : "",
        e.shiftKey ? "shift" : "",
        e.altKey ? "alt" : "",
        e.key.toLowerCase(),
      ].filter(Boolean).join("+");

      if (shortcuts[key]) {
        e.preventDefault();
        shortcuts[key]();
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);
}

// ── Staking APY Calculator ────────────────────────────────────

export function useStakingCalc(amountUny: number, stakeDays: number) {
  const baseApy = 0.18; // 18% APY from x402 revenue share
  const lockBonus = stakeDays >= 365 ? 0.06 : stakeDays >= 180 ? 0.04 : stakeDays >= 90 ? 0.02 : 0;
  const effectiveApy = baseApy + lockBonus;
  const dailyRate = effectiveApy / 365;
  const projectedReward = amountUny * dailyRate * stakeDays;
  const projectedValue = (amountUny + projectedReward) * 0.008;

  return {
    effectiveApy,
    dailyRate,
    projectedReward: Math.round(projectedReward),
    projectedValue,
    lockBonus,
  };
}

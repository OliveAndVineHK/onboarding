"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

const FLASK_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";
const CODE_TTL_SECONDS = 60;
const MAX_ATTEMPTS = 5;

const maskEmail = (email: string) => {
  if (!email || !email.includes("@")) return email || "your email";
  const [local, domain] = email.split("@");
  if (local.length <= 1) return email;
  return `${local[0]}${"*".repeat(Math.max(local.length - 1, 3))}@${domain}`;
};

function ConfirmContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const inviteToken = searchParams.get("invite") || "";
  const emailDisplay = maskEmail(email);

  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(CODE_TTL_SECONDS);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
  const [resending, setResending] = useState(false);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const code = digits.join("");
  const codeExpired = secondsLeft === 0;
  const noAttempts = attemptsLeft === 0;
  const mustResend = codeExpired || noAttempts;
  const canVerify =
    code.length === 6 && !verifying && !mustResend;

  // Countdown — ticks once per second until 0, then stops.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  const onVerify = async () => {
    if (!canVerify) return;
    setError("");
    setVerifying(true);
    try {
      const res = await fetch(`${FLASK_BASE}/auth/email/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, invite: inviteToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status === "error") {
        // Decrement client-side attempts on any server-acknowledged failure.
        // Network errors (catch branch) don't count — the user never actually
        // submitted a wrong code in that case.
        setAttemptsLeft((a) => Math.max(0, a - 1));
        setError(data.message || "Verification failed.");
        setVerifying(false);
        return;
      }
      // Flask returns an absolute or relative redirect — both resolve fine.
      const target =
        typeof data.redirect_url === "string" && data.redirect_url
          ? new URL(data.redirect_url, FLASK_BASE).toString()
          : FLASK_BASE;
      window.location.href = target;
    } catch {
      setError("Network error — is the Flask server running?");
      setVerifying(false);
    }
  };

  const onResend = async () => {
    if (resending) return;
    setError("");
    setResending(true);
    try {
      const res = await fetch(`${FLASK_BASE}/auth/email/request-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status === "error") {
        setError(data.message || "Could not resend the code. Please try again.");
        setResending(false);
        return;
      }
      // Fresh code: clear the cells, restart the timer, refill attempts.
      setDigits(["", "", "", "", "", ""]);
      setActiveIdx(0);
      setSecondsLeft(CODE_TTL_SECONDS);
      setAttemptsLeft(MAX_ATTEMPTS);
      setResending(false);
      inputsRef.current[0]?.focus();
    } catch {
      setError("Network error — is the Flask server running?");
      setResending(false);
    }
  };

  const setDigit = (i: number, raw: string) => {
    const v = raw.replace(/\D/g, "").slice(-1);
    setDigits((cur) => {
      const next = [...cur];
      next[i] = v;
      return next;
    });
    if (v && i < 5) {
      inputsRef.current[i + 1]?.focus();
    }
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputsRef.current[i - 1]?.focus();
    }
  };

  return (
    <>
      <div className="topbar" data-screen-label="Top bar">
        <div className="topbar-inner">
          <div className="brand">
            <img className="brand-mark-img" src="/assets/minty-logo.png" alt="Minty" />
            <span>Minty</span>
          </div>
          <h1></h1>
          <div className="right" />
        </div>
      </div>

      <main className="confirm-page">
        <div className="confirm-card">
          <div className="confirm-emblem" aria-hidden="true">
            <span className="confirm-emblem-circle">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" />
                <rect x="9.5" y="11" width="5" height="5" rx="1" />
                <path d="M10.5 11V9.5a1.5 1.5 0 0 1 3 0V11" />
              </svg>
            </span>
            <span className="confirm-emblem-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 7l9 6 9-6" />
              </svg>
            </span>
          </div>

          <div className="page-head">
            <h2>Verification Code</h2>
            <p>
              We&apos;ve sent a 6-digit code to your email
              <br />
              <span className="confirm-email">{emailDisplay}</span>
            </p>
          </div>

          <div className="otp-row otp-row-empty">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputsRef.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                className={"otp-cell" + (i === activeIdx ? " is-active" : "")}
                value={d}
                onChange={(e) => setDigit(i, e.target.value)}
                onFocus={() => setActiveIdx(i)}
                onKeyDown={(e) => onKeyDown(i, e)}
                aria-label={`Digit ${i + 1} of 6`}
              />
            ))}
          </div>

          <button
            type="button"
            className="btn btn-primary btn-block confirm-verify"
            disabled={!canVerify}
            onClick={onVerify}
          >
            {verifying ? "Verifying…" : "Verify Now"}
          </button>
          {error && <div className="auth-error" role="alert">{error}</div>}

          <div className="confirm-status" aria-live="polite">
            {codeExpired ? (
              <span className="confirm-status-warn">Code expired — please resend.</span>
            ) : noAttempts ? (
              <span className="confirm-status-warn">No attempts left — please resend the code.</span>
            ) : (
              <>
                Code expires in{" "}
                <span className="confirm-status-time">
                  {`0:${String(secondsLeft).padStart(2, "0")}`}
                </span>
                {" · "}
                {attemptsLeft} attempt{attemptsLeft === 1 ? "" : "s"} left
              </>
            )}
          </div>

          <p className="confirm-resend">
            Didn&apos;t received the code?{" "}
            <a
              className="auth-link"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onResend();
              }}
              aria-disabled={resending}
              style={resending ? { opacity: 0.55, pointerEvents: "none" } : undefined}
            >
              {resending ? "Sending…" : "Resend Code"}
            </a>
          </p>
        </div>

        <div className="confirm-footer" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          <span>END - TO - END ENCRYPTED</span>
        </div>
      </main>

      <style>{`
        .confirm-page {
          min-height: calc(100vh - 60px);
          padding: 24px 16px 24px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: center;
        }
        .confirm-card {
          width: 100%;
          max-width: 380px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 22px;
          padding-top: 24px;
        }
        .confirm-card .page-head { margin-bottom: 0; }
        .confirm-card .page-head p { line-height: 1.55; }

        /* Shield-with-email emblem */
        .confirm-emblem {
          position: relative;
          width: 64px;
          height: 64px;
        }
        .confirm-emblem-circle {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: rgba(70, 216, 204, 0.12);
          color: var(--accent);
          display: grid;
          place-items: center;
        }
        .confirm-emblem-badge {
          position: absolute;
          right: -4px;
          bottom: -2px;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: var(--accent);
          color: #fff;
          display: grid;
          place-items: center;
          box-shadow: 0 0 0 2px var(--bg);
        }

        .confirm-email {
          color: var(--ink-2);
          font-weight: 600;
        }

        /* OTP row — empty cells, taller-than-wide, no surrounding card */
        .otp-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .otp-cell:nth-child(4) { margin-left: 12px; }
        .otp-cell {
          width: 40px;
          height: 56px;
          border-radius: 8px;
          border: 1px solid var(--line-strong);
          background: var(--bg);
          color: var(--ink);
          font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 22px;
          font-weight: 500;
          text-align: center;
          padding: 0;
          outline: none;
          transition: border-color .15s ease, color .15s ease, box-shadow .15s ease;
        }
        .otp-cell:focus,
        .otp-cell.is-active {
          border-color: var(--accent);
          color: var(--accent);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent) 16%, transparent);
        }

        .confirm-verify { margin-top: 16px; }
        .auth-error {
          color: var(--danger);
          font-size: 13px;
          text-align: center;
          margin-top: -8px;
        }

        .confirm-status {
          margin-top: -6px;
          font-size: 13px;
          color: var(--muted);
          text-align: center;
          font-variant-numeric: tabular-nums;
        }
        .confirm-status-time {
          color: var(--ink);
          font-weight: 600;
          font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .confirm-status-warn {
          color: var(--danger);
          font-weight: 600;
        }

        .confirm-resend {
          margin: 4px 0 0;
          text-align: center;
          font-size: 14px;
          color: var(--muted);
        }
        .auth-link {
          color: var(--accent-ink);
          font-weight: 600;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .auth-link:hover { color: var(--accent); }

        /* Bottom encrypted-channel footer */
        .confirm-footer {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--muted);
          font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 12px;
          letter-spacing: 0.08em;
          padding-bottom: 12px;
        }
      `}</style>
    </>
  );
}

function ConfirmFallback() {
  return (
    <div className="topbar" data-screen-label="Top bar">
      <div className="topbar-inner">
        <div className="brand">
          <img className="brand-mark-img" src="/assets/minty-logo.png" alt="Minty" />
          <span>Minty</span>
        </div>
        <h1></h1>
        <div className="right" />
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={<ConfirmFallback />}>
      <ConfirmContent />
    </Suspense>
  );
}

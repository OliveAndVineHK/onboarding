"use client";

import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

const FLASK_BASE = process.env.NEXT_PUBLIC_FLASK_URL || "http://localhost:5001";

function VerifyContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const inviteToken = searchParams.get("invite") || "";

  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const code = digits.join("");
  const canVerify = code.length === 6 && !verifying;

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
        setError(data.message || "Verification failed.");
        setVerifying(false);
        return;
      }
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

  const onResend = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (resending || !email) return;
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
        setError(data.message || "Could not resend code.");
      }
    } catch {
      setError("Network error — is the Flask server running?");
    } finally {
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

      <main className="auth-page">
        <div className="auth-card">
          <div className="page-head">
            <h2>Your Verification Code</h2>
            <p>
              To complete your secure sign-in process, please use the following
              unique authentication code.
            </p>
          </div>

          <div className="otp-card">
            <div className="otp-label">ONE - TIME PASSCODE</div>
            <div className="otp-row">
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
            <div className="otp-expires">Expires 3 minutes</div>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={!canVerify}
            onClick={onVerify}
          >
            {verifying ? "Verifying…" : "Verify Now"}
          </button>
          {error && <div className="auth-error" role="alert">{error}</div>}

          <p className="confirm-resend">
            Didn&apos;t receive the code?{" "}
            <a className="auth-link" href="#" onClick={onResend}>
              {resending ? "Resending…" : "Resend Code"}
            </a>
          </p>

          <div className="auth-divider" role="separator">
            <span>or</span>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-block auth-xero"
            onClick={() => { window.location.href = `${FLASK_BASE}/xero_auth`; }}
          >
            Log in with Xero
            <img src="/xero-logo.webp" alt="" className="auth-xero-logo" />
          </button>

          <div className="auth-notice security-alert">
            <span className="auth-notice-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 7.5-2" />
              </svg>
            </span>
            <div className="auth-notice-body">
              <div className="auth-notice-title">Security Alert</div>
              <p>
                If you didn&apos;t request this code, you can safely ignore this message.
              </p>
            </div>
          </div>
        </div>
      </main>

      <style>{`
        .auth-page {
          min-height: calc(100vh - 60px);
          padding: 24px 16px 48px;
          display: flex;
          justify-content: center;
        }
        .auth-card {
          width: 100%;
          max-width: 380px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          padding-top: 24px;
        }
        .auth-card .page-head { margin-bottom: 0; }

        .otp-card {
          background: rgba(70, 216, 204, 0.1);
          border: 1px solid color-mix(in oklab, var(--accent) 18%, var(--line));
          border-radius: var(--radius);
          padding: 18px 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .otp-label {
          font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 13px;
          letter-spacing: 0.08em;
          color: var(--muted);
        }
        .otp-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .otp-cell:nth-child(4) { margin-left: 12px; }
        .otp-cell {
          width: 40px;
          height: 48px;
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
        .otp-expires {
          font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 12px;
          color: var(--muted);
          margin-top: 2px;
        }
        .auth-error {
          color: var(--danger);
          font-size: 13px;
          text-align: center;
          margin-top: -8px;
        }
        .auth-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--muted);
          font-size: 13px;
          padding: 2px 0;
        }
        .auth-divider::before,
        .auth-divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: var(--line);
        }
        .auth-xero {
          background: var(--bg);
          color: var(--ink);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .auth-xero-logo {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          object-fit: cover;
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
        .auth-notice {
          display: flex;
          gap: 12px;
          padding: 14px 16px;
          border: 1px solid var(--line);
          border-radius: var(--radius);
          background: var(--bg);
        }
        .auth-notice.security-alert {
          background: rgba(70, 216, 204, 0.1);
          border: 0;
        }
        .auth-notice-icon {
          color: var(--accent);
          flex-shrink: 0;
          padding-top: 2px;
        }
        .auth-notice-body {
          font-size: 13px;
          line-height: 1.55;
          color: var(--ink-2);
        }
        .auth-notice-title {
          font-weight: 700;
          color: var(--ink);
          margin-bottom: 2px;
          font-size: 14px;
        }
        .auth-notice-body p {
          margin: 0;
          color: var(--muted);
        }
      `}</style>
    </>
  );
}

function VerifyFallback() {
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

export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyFallback />}>
      <VerifyContent />
    </Suspense>
  );
}

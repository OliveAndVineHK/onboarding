"use client";

import { useRef, useState } from "react";

const EMAIL_MASKED = "o***********@hk.com";

export default function ConfirmPage() {
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

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
              <span className="confirm-email">{EMAIL_MASKED}</span>
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
            onClick={() => {
              /* dummy — no verification wired yet */
            }}
          >
            Verify Now
          </button>

          <p className="confirm-resend">
            Didn&apos;t received the code?{" "}
            <a className="auth-link" href="#" onClick={(e) => e.preventDefault()}>
              Resend Code
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

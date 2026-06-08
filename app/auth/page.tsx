"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const FLASK_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite") || "";
  const prefilledEmail = searchParams.get("email") || "";
  const signupMode = searchParams.get("mode") === "signup";
  const prefilledFirstName = searchParams.get("fn") || "";
  const prefilledLastName = searchParams.get("ln") || "";
  const [email, setEmail] = useState(prefilledEmail);
  // Self-serve signup collects the name up front (the User model requires a
  // first/last name). In login/invite mode these stay as the prefilled values.
  const [firstName, setFirstName] = useState(prefilledFirstName);
  const [lastName, setLastName] = useState(prefilledLastName);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const namesValid = !signupMode || (firstName.trim() !== "" && lastName.trim() !== "");
  const canContinue = emailValid && namesValid && !sending;

  const emailLocked = Boolean(inviteToken && prefilledEmail);

  useEffect(() => {
    if (prefilledEmail) setEmail(prefilledEmail);
  }, [prefilledEmail]);

  const onContinue = async () => {
    if (!emailValid || sending) return;
    setError("");
    setSending(true);
    try {
      const res = await fetch(`${FLASK_BASE}/auth/email/request-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status === "error") {
        setError(data.message || "Could not send a code. Please try again.");
        setSending(false);
        return;
      }
      const qs = new URLSearchParams();
      if (inviteToken) qs.set("invite", inviteToken);
      qs.set("email", email);
      if (firstName) qs.set("fn", firstName);
      if (lastName) qs.set("ln", lastName);
      router.push(`/auth/confirm?${qs.toString()}`);
    } catch {
      setError("Network error — is the Flask server running?");
      setSending(false);
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
            <h2>{signupMode ? "Create your account" : "Welcome"}</h2>
            <p>
              {signupMode
                ? "Sign up with your email to get started."
                : "Start your journey with us today."}
            </p>
          </div>

          <div className="form-stack auth-form">
            {signupMode && (
              <>
                <div className="field">
                  <label htmlFor="auth-first-name">First name</label>
                  <input
                    id="auth-first-name"
                    type="text"
                    autoComplete="given-name"
                    placeholder="Jane"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="auth-last-name">Last name</label>
                  <input
                    id="auth-last-name"
                    type="text"
                    autoComplete="family-name"
                    placeholder="Doe"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="field">
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="jane@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={emailLocked}
                aria-readonly={emailLocked}
                title={emailLocked ? "This invite was sent to this address" : undefined}
              />
            </div>

            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={!canContinue}
              onClick={onContinue}
            >
              {sending
                ? "Sending code…"
                : signupMode
                ? "Continue with Email"
                : "Log in with OTP"}
            </button>
            {error && <div className="auth-error" role="alert">{error}</div>}
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
        /* Tighter than .page-head's default 36px because the email form
           sits right under the heading rather than across a step page. */
        .auth-card .page-head { margin-bottom: 0; }
        /* Override form-stack's 18px gap with a tighter 14px so the
           Continue button sits closer to the email input, matching the
           screenshot. Everything else (input padding 14px 16px,
           label 14px) comes from .form-stack untouched. */
        .auth-form { gap: 14px; }

        .auth-error {
          color: var(--danger);
          font-size: 13px;
          text-align: center;
          margin-top: -6px;
        }
      `}</style>
    </>
  );
}

// useSearchParams forces a Suspense boundary at build time. The fallback is
// the bare topbar so the page header is visible during the (very short)
// hydration window — searchParams resolve client-side immediately on mount.
function AuthFallback() {
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

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthFallback />}>
      <AuthContent />
    </Suspense>
  );
}
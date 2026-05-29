'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Icon from './Icon';
import NavMenu from './NavMenu';
import {
  StepCreateEntity,
  StepSelectModule,
  StepConnectXero,
  StepSalesSetting,
  StepAccountCode,
  StepOthers,
  StepBills,
  StepInvite,
  StepAllSet,
} from './OnboardingSteps';

// Baked-in defaults that used to live in TWEAK_DEFAULTS (tweaks-panel removed from prod build)
const ACCENT_DEFAULTS = {
  accent: '#36c3b4',
  accentInk: '#0f7a6e',
  accentSoft: '#e6f7f4',
};

// Scoped only to the Xero OAuth round-trip: we stash progress here right
// before leaving for Xero and restore it on return. Cleared immediately after,
// so it does NOT persist across an ordinary refresh.
const XERO_RESUME_KEY = 'minty_onboarding_xero_resume';

const STORAGE_KEY = 'minty_onboarding_session';

// No signature verification — client-side cache invalidation only.
function readJwtClaims(token) {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (padded.length % 4)) % 4);
    const payload = JSON.parse(atob(padded + padding));
    return { user_id: payload.user_id || null, exp: payload.exp || 0 };
  } catch {
    return null;
  }
}

const STEPS = [
  { id: 1, label: 'Basic Information', short: 'Basic Information', tiny: 'Basic' },
  { id: 2, label: 'Select Module', short: 'Select Module', tiny: 'Module' },
  { id: 3, label: 'Connect to Accounting System', short: 'Connect to Accounting System', tiny: 'Accounting' },
  { id: 4, label: 'Sales Setting', short: 'Sales Setting', tiny: 'Sales' },
  { id: 5, label: 'Account Code Setting', short: 'Account Code Setting', tiny: 'Account Code' },
  { id: 6, label: 'Others', short: 'Others', tiny: 'Others' },
  { id: 7, label: 'Bill Settings', short: 'Bill Settings', tiny: 'Bill' },
  { id: 8, label: 'User Invite', short: 'User Invite', tiny: 'Invite' },
  { id: 9, label: 'All Set', short: 'All Set', tiny: 'All Set' },
];

// Display-only structure: collapses Sales (4) + Account Code (5) into a single
// "Petty Cash Settings" segment with sub-items. Petty Cash and Bill segments
// only appear when their respective modules are selected on step 2.
function getDisplaySteps(modules) {
  const hasPetty = modules.includes('pettyCash');
  const hasBills = modules.includes('bills');
  const out = [
    { label: 'Basic Information', tiny: 'Basic', ids: [1] },
    { label: 'Select Module', tiny: 'Module', ids: [2] },
    { label: 'Connect to Accounting System', tiny: 'Accounting', ids: [3] },
  ];
  if (hasPetty) {
    out.push({
      label: 'Petty Cash Settings',
      tiny: 'Petty Cash',
      ids: [4, 5, 6],
      subs: [
        { id: 4, label: 'Sales' },
        { id: 5, label: 'Account Code' },
        { id: 6, label: 'Others' },
      ],
    });
  }
  if (hasBills) {
    out.push({ label: 'Bill Settings', tiny: 'Bill', ids: [7] });
  }
  out.push({ label: 'User Invite', tiny: 'Invite', ids: [8] });
  out.push({ label: 'All Set', tiny: 'All Set', ids: [9] });
  return out.map((d, i) => ({ idx: i + 1, ...d }));
}

// Flat list of step ids that are part of the active flow given the selected modules.
function getActiveStepIds(modules) {
  const hasPetty = modules.includes('pettyCash');
  const hasBills = modules.includes('bills');
  const ids = [1, 2, 3];
  if (hasPetty) ids.push(4, 5, 6);
  if (hasBills) ids.push(7);
  ids.push(8, 9);
  return ids;
}

const initialState = () => ({
  entity: {
    name: '',
    type: 'Private Limited',
    industry: 'Retail & E-commerce',
    country: 'Hong Kong',
    currency: 'Hong Kong Dollar',
    fyStart: 'Jan',
    phone: '',
    email: '',
  },
  modules: [],
  xero: { connected: false, org: '' },
  pettyCash: {
    float: 2000,
    claimLimit: 200,
    defaultAccount: '6420 · Office Supplies',
    requireReceipt: true,
    autoReplenish: false,
    notifyCustodian: true,
    electronicMethods: [],
    deliveryMethods: [],
    expenseCodes: { all: true, selected: {} },
    pcAccount: '',
    depositAccount: '',
    directorCode: '',
    cashSalesCode: '',
    discrepancyCode: '',
    directorContact: '',
    cashSaleContact: '',
    discrepancyContact: '',
    openingDate: (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    })(),
  },
  bills: {
    terms: 'Net 30',
    threshold: 5000,
    flow: 'Two-step',
    glAccount: '2100 · Accounts Payable',
    ocr: true,
    partial: true,
    dedupe: true,
  },
  invites: [],
});

// Validation rules for completion gate
function isStepComplete(id, state) {
  switch (id) {
    case 1: {
      const e = state.entity;
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email);
      const phoneDigits = e.phone.replace(/\D/g, '');
      const phoneOk = phoneDigits.length >= 8 && phoneDigits.length <= 11;
      return e.name.trim().length > 1 && phoneOk && emailOk;
    }
    case 2:
      return state.modules.length > 0;
    case 3:
      return true; // Accounting is optional
    case 4: {
      const b = state.pettyCash && state.pettyCash.openingBalance;
      return b !== undefined && b !== null && String(b).trim() !== '';
    }
    case 5:
      return true;
    case 6:
      return true;
    case 7:
      return true;
    case 8:
      return true;
    default:
      return false;
  }
}

function Stepper({ current, onClick, maxReached, displaySteps }) {
  const ref = useRef(null);
  const [hoverPettyCash, setHoverPettyCash] = useState(false);

  // (Step-entry / squish animations removed.)

  useEffect(() => {
    if (!ref.current) return;
    const check = () => {
      ref.current.querySelectorAll('.step .label').forEach((label) => {
        if (getComputedStyle(label).display === 'none') return;
        const inner = label.querySelector('.label-inner');
        if (!inner) return;
        const overflow = inner.scrollWidth - label.clientWidth;
        if (overflow > 1) {
          label.classList.add('is-overflow');
          inner.style.setProperty('--scroll-end', -overflow - 8 + 'px');
        } else {
          label.classList.remove('is-overflow');
          inner.style.removeProperty('--scroll-end');
        }
      });
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(ref.current);
    window.addEventListener('resize', check);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', check);
    };
  }, [current, maxReached]);

  // When the number of visible steps changes, trigger a brief jello squeeze
  // on existing (non-newly-mounted) tiles to match the grid reflow.
  const prevCountRef = useRef(displaySteps.length);
  const [pulseId, setPulseId] = useState(0);
  useEffect(() => {
    if (prevCountRef.current !== displaySteps.length) {
      setPulseId((n) => n + 1);
      prevCountRef.current = displaySteps.length;
    }
  }, [displaySteps.length]);

  return (
    <div className="stepper" ref={ref} data-screen-label="Stepper" style={{ '--step-count': displaySteps.length }}>
      {displaySteps.map((d) => {
        const isActive = d.ids.includes(current);
        const isDone = d.ids.every((i) => current > i);
        const status = isDone ? 'done' : isActive ? 'active' : 'todo';
        const firstId = d.ids[0];
        const reachable = firstId <= maxReached;
        const hasSubs = !!d.subs;
        const showSubs = hasSubs && (isActive || hoverPettyCash);
        return (
          <div
            key={d.ids[0]}
            data-step-key={d.ids[0]}
            data-pulse={pulseId}
            className={'step ' + status + (reachable ? '' : ' locked') + (hasSubs ? ' has-subs' : '')}
            onClick={() => reachable && onClick(firstId)}
            onMouseEnter={() => hasSubs && setHoverPettyCash(true)}
            onMouseLeave={() => hasSubs && setHoverPettyCash(false)}
            title={reachable ? undefined : 'Complete the previous steps first'}
          >
            {(isDone || !reachable) && <span className="num">{isDone ? <Icon.Check /> : <Icon.Lock />}</span>}
            <span className="label label-full">
              <span className="label-inner">{d.label}</span>
            </span>
            <span className="label label-tiny">
              <span className="label-inner">{d.tiny}</span>
            </span>
            {hasSubs && false && (
              <div className={'substep-popover' + (showSubs ? ' open' : '')}>
                {d.subs.map((sub) => {
                  const isSubActive = current === sub.id;
                  const isSubDone = current > sub.id;
                  const subReachable = sub.id <= maxReached;
                  return (
                    <button
                      type="button"
                      key={sub.id}
                      className={'substep' + (isSubActive ? ' active' : '') + (isSubDone ? ' done' : '')}
                      onClick={(e) => {
                        e.stopPropagation();
                        subReachable && onClick(sub.id);
                      }}
                      disabled={!subReachable}
                    >
                      <span className="substep-circle">{isSubDone && <Icon.CheckSm />}</span>
                      <span className="substep-label">{sub.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OnboardingApp() {
  const [current, setCurrent] = useState(1);
  const [state, setState] = useState(initialState);
  const [maxReached, setMaxReached] = useState(1);
  // Logged-in user, passed in by Module 1 on the launch URL after entity creation
  // (e.g. /?first=Dan&last=Smith or /?name=Dan%20Smith). No backend call needed.
  const [user, setUser] = useState({ first: '', last: '', name: '' });
  // Short-lived JWT from Module 1 used to create the entity on Step 1.
  const [token, setToken] = useState('');
  // Module 2 profile handoff URL (no entity context) passed in by Module 1.
  const [profileUrl, setProfileUrl] = useState('');
  const [accountOptions, setAccountOptions] = useState({ bank: [], cashSale: [], director: [], discrepancy: [], expense: [], contacts: [], bill: [] });

  const activeIds = useMemo(() => getActiveStepIds(state.modules), [state.modules]);
  const displaySteps = useMemo(() => getDisplaySteps(state.modules), [state.modules]);

  // Helper: find the next active step id after `c`, or stay if at end.
  const nextActiveId = (c) => {
    const i = activeIds.indexOf(c);
    if (i === -1 || i === activeIds.length - 1) return c;
    return activeIds[i + 1];
  };
  const prevActiveId = (c) => {
    const i = activeIds.indexOf(c);
    if (i <= 0) return c;
    return activeIds[i - 1];
  };

  const set = (patch) => setState((prev) => ({ ...prev, ...patch }));
  const next = () => {
    if (!isStepComplete(current, state)) return;
    setCurrent((c) => {
      const n = nextActiveId(c);
      setMaxReached((m) => Math.max(m, n));
      return n;
    });
  };
  // Dev-only skip: advances without validation (will be removed at the end)
  const skip = () => {
    setCurrent((c) => {
      const n = nextActiveId(c);
      setMaxReached((m) => Math.max(m, n));
      return n;
    });
  };
  const back = () => setCurrent((c) => prevActiveId(c));
  const goto = (id) => {
    if (!activeIds.includes(id)) return;
    if (id > maxReached) return;
    // Block forward jumps from a step that isn't complete (e.g. sub-step "Account Code" from "Sales")
    if (id > current && !isStepComplete(current, state)) {
      window.dispatchEvent(new CustomEvent('onb-validation-blocked', { detail: { from: current, to: id } }));
      return;
    }
    setCurrent(id);
  };
  const restart = () => {
    setState(initialState());
    setCurrent(1);
    setMaxReached(1);
  };

  // If the user toggles a module off after reaching a step belonging to it,
  // snap back to a still-active step so we never sit on a hidden one.
  useEffect(() => {
    if (!activeIds.includes(current)) {
      // walk backwards to the closest still-active id
      let target = 1;
      for (let i = current - 1; i >= 1; i--) {
        if (activeIds.includes(i)) {
          target = i;
          break;
        }
      }
      setCurrent(target);
    }
    // Also clamp maxReached so we don't leave it pointing at a removed step
    if (!activeIds.includes(maxReached)) {
      let mt = 1;
      for (let i = maxReached; i >= 1; i--) {
        if (activeIds.includes(i)) {
          mt = i;
          break;
        }
      }
      setMaxReached(Math.max(mt, current));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIds.join(',')]);

  // Without this gate the persist effect fires on first mount with the empty
  // initialState and overwrites the saved session before the load effect can
  // read it (effects run in declaration order, but setState calls from inside
  // them don't take effect until the next render).
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!hydratedRef.current) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ current, maxReached, state, token, profileUrl, user }),
      );
    } catch {
      /* ignore quota / serialization errors */
    }
  }, [current, maxReached, state, token, profileUrl, user]);

  // Pick up the logged-in user (and optionally the new entity name) from the
  // launch URL that Module 1 opens after the entity is created. Falls back to
  // nothing if absent, so running the app standalone still works.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { hydrateOnce(); } finally { hydratedRef.current = true; }
    function hydrateOnce() {
    const p = new URLSearchParams(window.location.search);

    // Returning from the real Xero OAuth round-trip (Module 1 → Xero → here).
    // Restore the progress we stashed before leaving and land on the
    // Accounting step (3). Cleared immediately so a later refresh won't resume.
    const xeroParam = (p.get('xero') || '').trim();
    if (xeroParam) {
      let resumed = null;
      try {
        resumed = JSON.parse(window.sessionStorage.getItem(XERO_RESUME_KEY) || 'null');
      } catch {
        /* ignore corrupt storage */
      }
      try {
        window.sessionStorage.removeItem(XERO_RESUME_KEY);
      } catch {
        /* ignore */
      }
      const today = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      // The Xero tenant/org name reported back by Xero (real connected entity).
      const xeroOrg = (p.get('org') || '').trim();
      if (resumed) {
        if (resumed.token) setToken(resumed.token);
        if (resumed.profileUrl) setProfileUrl(resumed.profileUrl);
        if (resumed.user) setUser(resumed.user);
        setState((prev) => ({
          ...prev,
          ...(resumed.state || {}),
          xero:
            xeroParam === 'connected'
              ? { connected: true, org: xeroOrg, lastConnected: today }
              : (resumed.state && resumed.state.xero) || prev.xero,
        }));
        setMaxReached((m) => Math.max(m, resumed.maxReached || 3, 3));
      } else if (xeroParam === 'connected') {
        setState((prev) => ({
          ...prev,
          xero: { connected: true, org: xeroOrg, lastConnected: today },
        }));
      }
      setCurrent(3);
      setMaxReached((m) => Math.max(m, 3));
      // Strip the params so an ordinary refresh doesn't re-trigger the resume.
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('xero');
        url.searchParams.delete('step');
        url.searchParams.delete('org');
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      } catch {
        /* ignore */
      }
      return;
    }

    const urlToken = (p.get('token') || '').trim();
    let saved = null;
    try {
      saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    } catch {
      /* ignore corrupt storage */
    }
    if (saved) {
      const savedClaims = readJwtClaims(saved.token);
      const urlClaims = readJwtClaims(urlToken);
      const now = Math.floor(Date.now() / 1000);
      const savedExpired = !!(savedClaims && savedClaims.exp && savedClaims.exp <= now);
      const differentUser = !!(urlClaims && savedClaims && urlClaims.user_id !== savedClaims.user_id);
      if (savedExpired || differentUser) {
        try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      } else {
        if (urlToken) setToken(urlToken);
        else if (saved.token) setToken(saved.token);
        if (saved.profileUrl) setProfileUrl(saved.profileUrl);
        if (saved.user) setUser(saved.user);
        if (saved.state) setState(saved.state);
        if (typeof saved.current === 'number' && saved.current >= 1) setCurrent(saved.current);
        if (typeof saved.maxReached === 'number' && saved.maxReached >= 1) {
          setMaxReached(saved.maxReached);
        }
        return;
      }
    }

    const first = (p.get('first') || '').trim();
    const last = (p.get('last') || '').trim();
    const name = (p.get('name') || '').trim();
    if (first || last || name) {
      setUser({ first, last, name: name || `${first} ${last}`.trim() });
    }
    const entityName = (p.get('entity_name') || p.get('entity') || '').trim();
    if (entityName) {
      setState((prev) => ({ ...prev, entity: { ...prev.entity, name: entityName } }));
    }
    const t = (p.get('token') || '').trim();
    if (t) setToken(t);
    const pu = (p.get('profile_url') || '').trim();
    if (pu) setProfileUrl(pu);
    }
  }, []);

  // Kick off the real Xero OAuth flow (Step 3), mirroring Module 1's
  // "Connect to Xero". Stashes progress so the round-trip returns here at the
  // Accounting step. When run standalone (no entity created), it simulates a
  // connection so the prototype still works.
  const connectXero = () => {
    const today = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    if (!state.entity.id) {
      set({ xero: { connected: true, org: state.entity.name || 'Olive & Vine Inc', lastConnected: today } });
      return;
    }
    try {
      window.sessionStorage.setItem(
        XERO_RESUME_KEY,
        JSON.stringify({ state, token, profileUrl, user, maxReached }),
      );
    } catch {
      /* ignore quota / serialization errors */
    }
    const base = (process.env.NEXT_PUBLIC_MODULE1_API_URL || 'http://localhost:5001').replace(/\/$/, '');
    window.location.href = `${base}/xero_connect?from=onboarding`;
  };

  // Create the entity in Module 1 (Step 1). Token-authenticated; no cookies.
  // When launched standalone (no token), it no-ops so the prototype still runs.
  const submitEntity = async () => {
    if (state.entity.id) return { ok: true }; // already created (revisiting step)
    if (!token) return { ok: true }; // standalone / no Module 1 handoff
    const base = (process.env.NEXT_PUBLIC_MODULE1_API_URL || 'http://localhost:5001').replace(/\/$/, '');
    try {
      const res = await fetch(`${base}/api/onboarding/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          entity_name: state.entity.name,
          country: state.entity.country,
          currency: state.entity.currency,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || 'Failed to create entity. Please try again.' };
      if (data.entity_id) {
        setState((prev) => ({ ...prev, entity: { ...prev.entity, id: data.entity_id } }));
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not reach the server. Please try again.' };
    }
  };

  const submitSalesMethods = async () => {
    if (!token || !state.entity.id) return { ok: true };
    const base = (process.env.NEXT_PUBLIC_MODULE1_API_URL || 'http://localhost:5001').replace(/\/$/, '');
    try {
      const res = await fetch(`${base}/api/onboarding/sales-methods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          entity_id: state.entity.id,
          electronic: state.pettyCash.electronicMethods || [],
          delivery: state.pettyCash.deliveryMethods || [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || 'Failed to save sales methods. Please try again.' };
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not reach the server. Please try again.' };
    }
  };

  const submitOpeningBalance = async () => {
    if (!token || !state.entity.id) return { ok: true };
    const p = state.pettyCash;
    const empty = p.openingBalance === undefined || p.openingBalance === null || String(p.openingBalance).trim() === '';
    if (empty) return { ok: true };
    const base = (process.env.NEXT_PUBLIC_MODULE1_API_URL || 'http://localhost:5001').replace(/\/$/, '');
    try {
      const res = await fetch(`${base}/api/onboarding/opening-balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          entity_id: state.entity.id,
          opening_date: p.openingDate,
          cash_addition: p.openingBalance,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || 'Failed to save opening balance. Please try again.' };
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not reach the server. Please try again.' };
    }
  };

  const accountLoadedRef = useRef(false);
  useEffect(() => {
    if ((current !== 5 && current !== 6) || accountLoadedRef.current) return;
    if (!token || !state.entity.id) return;
    accountLoadedRef.current = true;
    const base = (process.env.NEXT_PUBLIC_MODULE1_API_URL || 'http://localhost:5001').replace(/\/$/, '');
    fetch(`${base}/api/onboarding/account-codes?entity_id=${encodeURIComponent(state.entity.id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || !data.connected) return;
        const bank = data.bank_accounts || [];
        const cashSale = data.cash_sale_accounts || [];
        const director = data.director_accounts || [];
        const discrepancy = data.discrepancy_accounts || [];
        const expense = data.expense_codes || [];
        const contacts = data.contacts || [];
        setAccountOptions({ bank, cashSale, director, discrepancy, expense, contacts });

        const md = data.mapping_defaults || {};
        const cd = data.contact_defaults || {};
        const labelFor = (list, id) => {
          const found = id ? list.find((o) => o.id === id) : null;
          return found ? found.label : '';
        };
        let expenseCodesVal;
        if (data.default_all) {
          expenseCodesVal = { all: true, selected: {} };
        } else {
          const selMap = {};
          (data.selected_codes || []).forEach((c) => {
            selMap[c] = true;
          });
          expenseCodesVal = { all: false, selected: selMap };
        }
        setState((prev) => ({
          ...prev,
          pettyCash: {
            ...prev.pettyCash,
            expenseCodes: expenseCodesVal,
            pcAccount: prev.pettyCash.pcAccount || labelFor(bank, md.pettycash),
            depositAccount: prev.pettyCash.depositAccount || labelFor(bank, md.deposit),
            directorCode: prev.pettyCash.directorCode || labelFor(director, md.director),
            cashSalesCode: prev.pettyCash.cashSalesCode || labelFor(cashSale, md.cash_sale),
            discrepancyCode: prev.pettyCash.discrepancyCode || labelFor(discrepancy, md.discrepancy),
            directorContact: prev.pettyCash.directorContact || labelFor(contacts, cd.director),
            cashSaleContact: prev.pettyCash.cashSaleContact || labelFor(contacts, cd.cash_sale),
            discrepancyContact: prev.pettyCash.discrepancyContact || labelFor(contacts, cd.discrepancy),
          },
        }));
      })
      .catch(() => {
        /* leave the step empty if the fetch fails */
      });
  }, [current, token, state.entity.id]);

  const submitAccountCodes = async () => {
    if (!token || !state.entity.id) return { ok: true };
    const base = (process.env.NEXT_PUBLIC_MODULE1_API_URL || 'http://localhost:5001').replace(/\/$/, '');
    const p = state.pettyCash;
    const idFor = (list, label) => {
      const found = label ? (list || []).find((o) => o.label === label) : null;
      return found ? found.id : '';
    };
    const mapping = {
      pettycash: idFor(accountOptions.bank, p.pcAccount),
      deposit: idFor(accountOptions.bank, p.depositAccount),
      director: idFor(accountOptions.director, p.directorCode),
      cash_sale: idFor(accountOptions.cashSale, p.cashSalesCode),
      discrepancy: idFor(accountOptions.discrepancy, p.discrepancyCode),
    };
    const allCodes = (accountOptions.expense || []).map((e) => e.code);
    const ec = p.expenseCodes || { all: true, selected: {} };
    const isAll = ec.all !== false;
    const sel = ec.selected || {};
    const selectedCodes = allCodes.filter((c) => (isAll ? sel[c] !== false : sel[c] === true));
    try {
      const res = await fetch(`${base}/api/onboarding/account-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ entity_id: state.entity.id, expense_codes: selectedCodes, mapping }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || 'Failed to save account codes. Please try again.' };
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not reach the server. Please try again.' };
    }
  };

  const submitContacts = async () => {
    if (!token || !state.entity.id) return { ok: true };
    const base = (process.env.NEXT_PUBLIC_MODULE1_API_URL || 'http://localhost:5001').replace(/\/$/, '');
    const p = state.pettyCash;
    const idFor = (label) => {
      const found = label ? (accountOptions.contacts || []).find((o) => o.label === label) : null;
      return found ? found.id : '';
    };
    const contacts = {
      director: idFor(p.directorContact),
      cash_sale: idFor(p.cashSaleContact),
      discrepancy: idFor(p.discrepancyContact),
    };
    try {
      const res = await fetch(`${base}/api/onboarding/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ entity_id: state.entity.id, contacts }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || 'Failed to save contacts. Please try again.' };
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not reach the server. Please try again.' };
    }
  };

  const billLoadedRef = useRef(false);
  useEffect(() => {
    if (current !== 7 || billLoadedRef.current) return;
    if (!token || !state.entity.id) return;
    billLoadedRef.current = true;
    const base = (process.env.NEXT_PUBLIC_MODULE1_API_URL || 'http://localhost:5001').replace(/\/$/, '');
    fetch(`${base}/api/onboarding/bill-codes?entity_id=${encodeURIComponent(state.entity.id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || !data.connected) return;
        const bill = data.bill_codes || [];
        setAccountOptions((prev) => ({ ...prev, bill }));
        let billCodesVal;
        if (data.default_all) {
          billCodesVal = { all: true, selected: {} };
        } else {
          const selMap = {};
          (data.selected_codes || []).forEach((c) => {
            selMap[c] = true;
          });
          billCodesVal = { all: false, selected: selMap };
        }
        setState((prev) => ({ ...prev, bills: { ...prev.bills, billCodes: billCodesVal } }));
      })
      .catch(() => {
        /* leave the step empty if the fetch fails */
      });
  }, [current, token, state.entity.id]);

  const submitBills = async () => {
    if (!token || !state.entity.id) return { ok: true };
    const base = (process.env.NEXT_PUBLIC_MODULE1_API_URL || 'http://localhost:5001').replace(/\/$/, '');
    const allCodes = (accountOptions.bill || []).map((e) => e.code);
    const bc = state.bills.billCodes || { all: true, selected: {} };
    const isAll = bc.all !== false;
    const sel = bc.selected || {};
    const selectedCodes = allCodes.filter((c) => (isAll ? sel[c] !== false : sel[c] === true));
    try {
      const res = await fetch(`${base}/api/onboarding/bill-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ entity_id: state.entity.id, selected_codes: selectedCodes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || 'Failed to save bill account codes. Please try again.' };
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not reach the server. Please try again.' };
    }
  };

  const submitInvite = async ({ email, role }) => {
    // Standalone prototype (no Module 1 handoff): keep the invite local-only.
    if (!token || !state.entity.id) return { ok: true, invitation: { email, role } };
    const base = (process.env.NEXT_PUBLIC_MODULE1_API_URL || 'http://localhost:5001').replace(/\/$/, '');
    try {
      const res = await fetch(`${base}/api/onboarding/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ entity_id: state.entity.id, email, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || 'Failed to send invitation. Please try again.' };
      return { ok: true, invitation: data.invitation };
    } catch {
      return { ok: false, error: 'Could not reach the server. Please try again.' };
    }
  };

  const cancelInvite = async (invitationId) => {
    if (!token || !invitationId) return { ok: true };
    const base = (process.env.NEXT_PUBLIC_MODULE1_API_URL || 'http://localhost:5001').replace(/\/$/, '');
    try {
      const res = await fetch(`${base}/api/onboarding/invite/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ invitation_id: invitationId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || 'Failed to cancel invitation.' };
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not reach the server. Please try again.' };
    }
  };

  const invitesLoadedRef = useRef(false);
  useEffect(() => {
    if (current !== 8 || invitesLoadedRef.current) return;
    if (!token || !state.entity.id) return;
    invitesLoadedRef.current = true;
    const base = (process.env.NEXT_PUBLIC_MODULE1_API_URL || 'http://localhost:5001').replace(/\/$/, '');
    fetch(`${base}/api/onboarding/invite?entity_id=${encodeURIComponent(state.entity.id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || !Array.isArray(data.invitations)) return;
        setState((prev) => {
          // Keep any names typed this session (backend stores only email/role),
          // matching by email; fall back to email-derived initials otherwise.
          const known = {};
          (prev.invites || []).forEach((x) => {
            if (x.email) known[x.email.toLowerCase()] = x;
          });
          const invites = data.invitations.map((inv) => {
            const prior = known[(inv.email || '').toLowerCase()] || {};
            return {
              id: inv.id,
              email: inv.email,
              role: inv.role,
              first: prior.first || '',
              last: prior.last || '',
            };
          });
          return { ...prev, invites };
        });
      })
      .catch(() => {
        /* leave the list empty if the fetch fails */
      });
  }, [current, token, state.entity.id]);

  // Commits the deferred opening balance, then redirects to the Module 1
  // dashboard. Returns { ok, redirect } so All Set can show errors / stay put.
  const finishOnboarding = async () => {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    if (!token || !state.entity.id) return { ok: true, redirect: false };
    const result = await submitOpeningBalance();
    if (!result?.ok) return result;
    const base = (process.env.NEXT_PUBLIC_MODULE1_API_URL || 'http://localhost:5001').replace(/\/$/, '');
    window.location.href = `${base}/entity/${state.entity.id}`;
    return { ok: true, redirect: true };
  };

  const salesLoadedRef = useRef(false);
  useEffect(() => {
    if (current !== 4 || salesLoadedRef.current) return;
    if (!token || !state.entity.id) return;
    salesLoadedRef.current = true;
    const base = (process.env.NEXT_PUBLIC_MODULE1_API_URL || 'http://localhost:5001').replace(/\/$/, '');
    fetch(`${base}/api/onboarding/sales-methods?entity_id=${encodeURIComponent(state.entity.id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setState((prev) => ({
          ...prev,
          pettyCash: {
            ...prev.pettyCash,
            electronicMethods: Array.isArray(data.electronic) ? data.electronic : prev.pettyCash.electronicMethods,
            deliveryMethods: Array.isArray(data.delivery) ? data.delivery : prev.pettyCash.deliveryMethods,
          },
        }));
      })
      .catch(() => {
        /* keep local defaults if the fetch fails */
      });
  }, [current, token, state.entity.id]);

  // Avatar initials — prefer the connected user, fall back to entity name.
  const profileInitials = (() => {
    if (user.first || user.last) {
      return ((user.first[0] || '') + (user.last[0] || '')).toUpperCase() || 'DD';
    }
    const source = user.name || state.entity.name || '';
    const fromWords = source
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
    return fromWords || 'DD';
  })();
  const profileLabel = user.name || state.entity.name || 'Your entity';

  // Apply accent CSS vars from baked-in defaults
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--accent', ACCENT_DEFAULTS.accent);
    r.style.setProperty('--accent-ink', ACCENT_DEFAULTS.accentInk);
    r.style.setProperty('--accent-soft', ACCENT_DEFAULTS.accentSoft);
    r.style.setProperty('--accent-hover', ACCENT_DEFAULTS.accent);
  }, []);

  const stepProps = { state, set, next, back, skip, restart, submitEntity, connectXero, submitSalesMethods, accountOptions, submitAccountCodes, submitContacts, submitBills, submitInvite, cancelInvite, finishOnboarding };

  return (
    <>
      <div className="topbar" data-screen-label="Top bar">
        <div className="topbar-inner">
          <div className="brand">
            <img className="brand-mark-img" src="/assets/minty-logo.png" alt="Minty" />
            <span>Minty</span>
          </div>
          <h1>Getting Started</h1>
          <div className="right pl-0.5 sm:pl-2">
            <button
              type="button"
              className="avatar"
              title={profileLabel}
              aria-label="Open profile"
              onClick={() => {
                if (profileUrl) window.location.href = profileUrl;
              }}
            >
              {profileInitials}
            </button>
            {/* Nav stays Logout-only through onboarding; full menu populates on the final "All Set" step. */}
            <NavMenu companyName={state.entity.name || 'Minty'} showFullMenu={current === 9} />
          </div>
        </div>
      </div>

      <Stepper current={current} onClick={goto} maxReached={maxReached} displaySteps={displaySteps} />

      <main className="page" data-screen-label={`0${current} ${STEPS[current - 1].label}`}>
        {(current === 4 || current === 5 || current === 6) && (
          <aside className="pc-side-menu" aria-label="Petty Cash sub-steps">
            <div className="pc-side-title">Petty Cash Settings</div>
            <button type="button" className={'pc-side-item' + (current === 4 ? ' active' : '') + (current > 4 ? ' done' : '')} onClick={() => goto(4)}>
              <span className="substep-circle">{current > 4 && <Icon.CheckSm />}</span>
              <span className="substep-label">Sales</span>
            </button>
            <button
              type="button"
              className={'pc-side-item' + (current === 5 ? ' active' : '') + (current > 5 ? ' done' : '')}
              onClick={() => goto(5)}
              disabled={5 > maxReached}
            >
              <span className="substep-circle">{current > 5 && <Icon.CheckSm />}</span>
              <span className="substep-label">Account Code</span>
            </button>
            <button
              type="button"
              className={'pc-side-item' + (current === 6 ? ' active' : '') + (current > 6 ? ' done' : '')}
              onClick={() => goto(6)}
              disabled={6 > maxReached}
            >
              <span className="substep-circle">{current > 6 && <Icon.CheckSm />}</span>
              <span className="substep-label">Others</span>
            </button>
          </aside>
        )}
        {current === 1 && <StepCreateEntity {...stepProps} />}
        {current === 2 && <StepSelectModule {...stepProps} />}
        {current === 3 && <StepConnectXero {...stepProps} />}
        {current === 4 && <StepSalesSetting {...stepProps} />}
        {current === 5 && <StepAccountCode {...stepProps} />}
        {current === 6 && <StepOthers {...stepProps} />}
        {current === 7 && <StepBills {...stepProps} />}
        {current === 8 && <StepInvite {...stepProps} />}
        {current === 9 && <StepAllSet {...stepProps} />}
      </main>
    </>
  );
}

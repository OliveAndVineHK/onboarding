'use client';

// Themed dropdown — replaces native <select> for unified styling.
// `searchable` turns the field itself into a type-to-filter combobox
// (like Module 1 create-entity: type in the field, suggestions filter below).
import { useState, useRef, useEffect, useMemo } from 'react';

export default function MintySelect({ value, onChange, options, placeholder = 'Select an option', disabled = false, searchable = false }) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  // null = not typing (show the selected value); a string = the live search text.
  const [query, setQuery] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    if (!searchable || query === null || query.trim() === '') return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [searchable, query, options]);

  const close = () => {
    setOpen(false);
    setQuery(null);
  };
  const choose = (opt) => {
    onChange(opt);
    close();
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIdx >= 0 && filtered[activeIdx] !== undefined) choose(filtered[activeIdx]);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, activeIdx, filtered]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) setActiveIdx(Math.max(0, filtered.indexOf(value)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const display = value || placeholder;
  const hasValue = !!value;

  return (
    <div className={'mselect' + (open ? ' open' : '') + (disabled ? ' disabled' : '')} ref={rootRef}>
      {searchable ? (
        <div
          className="mselect-trigger"
          onClick={() => {
            if (disabled) return;
            setOpen(true);
            inputRef.current && inputRef.current.focus();
          }}
        >
          <input
            ref={inputRef}
            type="text"
            className={'mselect-input' + (hasValue || query !== null ? '' : ' placeholder')}
            value={query === null ? (value || '') : query}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            aria-haspopup="listbox"
            aria-expanded={open}
            onFocus={() => !disabled && setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActiveIdx(0);
            }}
          />
          <span className="mselect-caret" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </div>
      ) : (
        <button
          type="button"
          className="mselect-trigger"
          disabled={disabled}
          onClick={() => !disabled && setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={'mselect-value' + (hasValue ? '' : ' placeholder')}>{display}</span>
          <span className="mselect-caret" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>
      )}
      {open && (
        <div className="mselect-menu" role="listbox" ref={menuRef}>
          {filtered.length === 0 ? (
            <div className="mselect-empty">No matches</div>
          ) : (
            filtered.map((opt, i) => {
              const selected = opt === value;
              const active = i === activeIdx;
              return (
                <div
                  key={`${opt}-${i}`}
                  role="option"
                  aria-selected={selected}
                  className={'mselect-opt' + (selected ? ' selected' : '') + (active ? ' active' : '')}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => choose(opt)}
                >
                  <span className="mselect-opt-label">{opt}</span>
                  {selected && (
                    <span className="mselect-opt-check" aria-hidden>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

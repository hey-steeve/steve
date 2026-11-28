"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  baseSearchEntries,
  groupResults,
  searchApp,
  searchKindLabels,
} from "../search/search";
import "./search-bar.css";

const suggestions = [
  "Sleep",
  "Vault",
  "General practice",
  "Reminders",
] as const;

// A search pill that opens a full-screen search over the whole app.
export function SearchBar(props: { readonly tone?: "glass" | "light" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pillRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const entries = useMemo(() => baseSearchEntries(), []);
  const groups = groupResults(searchApp(query, entries));

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
    pillRef.current?.focus();
  }

  return (
    <>
      <button
        ref={pillRef}
        type="button"
        className={`app-search-pill app-search-pill-${props.tone ?? "light"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <SearchIcon />
        <span>Search</span>
      </button>
      {open
        ? createPortal(
            <div
              className="app-search"
              role="dialog"
              aria-modal="true"
              aria-label="Search Stevie"
            >
              <div className="app-search-head">
                <label className="app-search-field">
                  <SearchIcon />
                  <input
                    ref={inputRef}
                    type="search"
                    value={query}
                    placeholder="Challenges, practitioners, documents…"
                    aria-label="Search Stevie"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="app-search-cancel"
                  onClick={close}
                >
                  Cancel
                </button>
              </div>
              <div className="app-search-body" aria-live="polite">
                {query.trim() === "" ? (
                  <section>
                    <h2 className="app-search-group">Suggestions</h2>
                    <div className="app-search-chips">
                      {suggestions.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setQuery(item)}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </section>
                ) : groups.length === 0 ? (
                  <p className="app-search-empty">
                    No results for “{query.trim()}”.
                  </p>
                ) : (
                  groups.map((group) => (
                    <section key={group.kind}>
                      <h2 className="app-search-group">
                        {searchKindLabels[group.kind]}
                      </h2>
                      <ul className="app-search-list">
                        {group.items.map((item) => (
                          <li key={`${item.kind}-${item.title}`}>
                            <Link
                              className="app-search-item"
                              href={item.href}
                              onClick={() => setOpen(false)}
                            >
                              <strong>{item.title}</strong>
                              <span>{item.detail}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))
                )}
              </div>
            </div>,
            // The header is its own stacking context; render above the tab bar.
            document.body,
          )
        : null}
    </>
  );
}

function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

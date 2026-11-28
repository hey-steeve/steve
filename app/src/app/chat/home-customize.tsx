"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import {
  defaultHomeLayout,
  homeBlocks,
  loadHomeLayout,
  moveBlock,
  saveHomeLayout,
  toggleBlock,
  visibleBlocks,
  type HomeBlockId,
  type HomeLayout,
} from "../../chat/home-layout";
import { HomeChallengeCard, HomeSignalCard } from "./home-community";
import { HomeAppointmentCard, HomeSpaceCard, HomeTiles, HomeUpcomingCard } from "./home-view";
import "./home-customize.css";

// The home blocks, in the order the person chose, with the button that
// opens the customise sheet.
export function HomeBlocks(props: { readonly onDiscuss: () => void }) {
  const [layout, setLayout] = useState<HomeLayout>(defaultHomeLayout);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setLayout(loadHomeLayout());
  }, []);

  function change(next: HomeLayout) {
    setLayout(next);
    saveHomeLayout(next);
  }

  const render: Record<HomeBlockId, () => ReactNode> = {
    signal: () => <HomeSignalCard onDiscuss={props.onDiscuss} />,
    appointment: () => <HomeAppointmentCard />,
    challenge: () => <HomeChallengeCard />,
    space: () => <HomeSpaceCard />,
    upcoming: () => <HomeUpcomingCard />,
    tiles: () => <HomeTiles />,
  };

  return (
    <>
      {visibleBlocks(layout).map((id) => (
        <Fragment key={id}>{render[id]()}</Fragment>
      ))}
      <button type="button" className="home-customize-open" onClick={() => setEditing(true)}>
        Personnaliser l’accueil
      </button>
      {editing ? (
        <HomeCustomizeSheet
          layout={layout}
          onChange={change}
          onReset={() => change(defaultHomeLayout)}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}

// Sheet to reorder and hide the home blocks.
export function HomeCustomizeSheet(props: {
  readonly layout: HomeLayout;
  readonly onChange: (layout: HomeLayout) => void;
  readonly onReset: () => void;
  readonly onClose: () => void;
}) {
  const { layout, onChange, onClose } = props;
  const doneRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    doneRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="home-custom-layer">
      <button type="button" className="home-custom-backdrop" aria-label="Fermer" tabIndex={-1} onClick={onClose} />
      <section className="home-custom" role="dialog" aria-modal="true" aria-labelledby="home-custom-title">
        <header className="home-custom-head">
          <h2 id="home-custom-title">Personnaliser l’accueil</h2>
          <button ref={doneRef} type="button" className="home-custom-done" onClick={onClose}>
            OK
          </button>
        </header>
        <p className="home-custom-hint">Change l’ordre des blocs ou masque ceux dont tu n’as pas besoin.</p>
        <ol className="home-custom-list">
          {layout.order.map((id, index) => {
            const label = homeBlocks.find((block) => block.id === id)?.label ?? id;
            const shown = !layout.hidden.includes(id);
            return (
              <li key={id} className="home-custom-row" data-hidden={shown ? undefined : ""}>
                <span className="home-custom-label">{label}</span>
                <button
                  type="button"
                  className="home-custom-move"
                  aria-label={`Monter ${label}`}
                  disabled={index === 0}
                  onClick={() => onChange(moveBlock(layout, id, -1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="home-custom-move"
                  aria-label={`Descendre ${label}`}
                  disabled={index === layout.order.length - 1}
                  onClick={() => onChange(moveBlock(layout, id, 1))}
                >
                  ↓
                </button>
                <button
                  type="button"
                  role="switch"
                  className="home-custom-switch"
                  aria-checked={shown}
                  aria-label={`Afficher ${label}`}
                  onClick={() => onChange(toggleBlock(layout, id))}
                >
                  <span aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
        <button type="button" className="home-custom-reset" onClick={props.onReset}>
          Revenir à l’ordre par défaut
        </button>
      </section>
    </div>
  );
}

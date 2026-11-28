"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
import { useCommunity } from "../../community/store";
import { usePlan } from "../../community/plan";
import { AlanAppBar } from "../challenges/community-ui";
import { HomeChallengeCard, HomeSignalCard } from "./home-community";
import { MemoryCard } from "./home-memory";
import { HomeAppointmentCard, HomeSpaceCard, HomeTiles, HomeUpcomingCard } from "./home-view";
import "./home-customize.css";

// The home blocks, in the order the person chose, with the button that
// opens the customise sheet.
export function HomeBlocks(props: { readonly onDiscuss: () => void }) {
  const [layout, setLayout] = useState<HomeLayout>(defaultHomeLayout);
  const plan = usePlan();
  const community = useCommunity();
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
    memory: () => <MemoryCard />,
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
      <AlanAppBar plan={plan} berries={community.berries} />
      <button type="button" className="home-customize-open" onClick={() => setEditing(true)}>
        Customize home
      </button>
      {editing
        ? createPortal(
            <HomeCustomizeSheet
              layout={layout}
              onChange={change}
              onReset={() => change(defaultHomeLayout)}
              onClose={() => setEditing(false)}
            />,
            // The home cards are a stacking context below the tab bar.
            document.body,
          )
        : null}
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
      <button type="button" className="home-custom-backdrop" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <section className="home-custom" role="dialog" aria-modal="true" aria-labelledby="home-custom-title">
        <header className="home-custom-head">
          <h2 id="home-custom-title">Customize home</h2>
          <button ref={doneRef} type="button" className="home-custom-done" onClick={onClose}>
            OK
          </button>
        </header>
        <p className="home-custom-hint">Reorder the blocks or hide the ones you don’t need.</p>
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
                  aria-label={`Move up ${label}`}
                  disabled={index === 0}
                  onClick={() => onChange(moveBlock(layout, id, -1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="home-custom-move"
                  aria-label={`Move down ${label}`}
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
                  aria-label={`Show ${label}`}
                  onClick={() => onChange(toggleBlock(layout, id))}
                >
                  <span aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
        <button type="button" className="home-custom-reset" onClick={props.onReset}>
          Back to the default order
        </button>
      </section>
    </div>
  );
}

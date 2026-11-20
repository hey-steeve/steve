"use client";

import { designTokens, marmot } from "@steve/shared";
import { mountAvatar, type MountedAvatar } from "open-bot-avatar/dom";
import { useEffect, useRef, useState } from "react";
import { moments, type MomentId } from "../moments";

export default function Page() {
  const host = useRef<HTMLDivElement>(null);
  const avatar = useRef<MountedAvatar | null>(null);
  const [momentId, setMomentId] = useState<MomentId>("idle");

  useEffect(() => {
    const element = host.current;
    if (element === null) {
      return;
    }
    const mounted = mountAvatar(element, {
      definition: marmot,
      color: designTokens.color.primary,
      followPointer: true,
    });
    avatar.current = mounted;
    return () => {
      mounted.destroy();
      avatar.current = null;
    };
  }, []);

  return (
    <main>
      <section className="card">
        <h1>Steve</h1>
        <p>Marmot</p>
        <div ref={host} className="stage" />
        <div className="moments" role="group" aria-label="Moments">
          {moments.map((moment) => (
            <button
              key={moment.id}
              type="button"
              aria-pressed={moment.id === momentId}
              onClick={() => {
                setMomentId(moment.id);
                avatar.current?.update({
                  state: moment.state,
                  mood: moment.mood,
                });
              }}
            >
              {moment.label}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

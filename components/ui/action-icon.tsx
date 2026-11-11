"use client";

import { createContext, useContext, useState, type AriaAttributes, type ComponentType, type PointerEvent } from "react";

const ActionIconContext = createContext(false);

/** Buttons stay mounted; only their decorative animation graph is activated. */
function useActionIcon() {
  const [active, setActive] = useState(false);
  return {
    active,
    onFocus: () => setActive(true),
    onBlur: () => setActive(false),
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType === "mouse") setActive(true);
    },
    onPointerLeave: () => setActive(false),
    onPointerDown: () => setActive(true),
  };
}

type GlyphProps = { className?: string; "aria-hidden"?: AriaAttributes["aria-hidden"]; "data-icon"?: string };
type ActionIconProps = GlyphProps & {
  icon: ComponentType<GlyphProps>;
  animatedIcon: ComponentType<GlyphProps & { animate?: boolean }>;
  animate?: boolean;
};

/** Long question pages render a static glyph until hover, focus or press. */
function ActionIcon({ icon: StaticIcon, animatedIcon: AnimatedIcon, animate, ...props }: ActionIconProps) {
  const active = useContext(ActionIconContext);
  const playing = animate ?? active;
  const [initialized, setInitialized] = useState(false);
  if (playing && !initialized) setInitialized(true);
  // Once activated, keep the official instance so interrupted motion can settle.
  return initialized || playing ? (
    <AnimatedIcon animate={playing} aria-hidden {...props} />
  ) : (
    <StaticIcon aria-hidden {...props} />
  );
}

export { ActionIcon, ActionIconContext, useActionIcon };

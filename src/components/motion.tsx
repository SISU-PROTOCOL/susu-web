import { type ReactNode, useRef } from 'react';
import {
  domAnimation,
  LazyMotion,
  MotionConfig,
  m,
  useInView,
  useReducedMotion,
  type Variants,
} from 'framer-motion';

/**
 * The app's whole motion vocabulary, in one module.
 *
 * WHAT ANIMATION IS FOR HERE, AND WHAT IT IS NOT FOR
 * It marks arrival: a section coming into view, a list filling in, a page
 * replacing another. It is not used to report state — a pending transaction, a
 * waiting round or an unknown outcome is still stated in words, because a
 * movement cannot be read by a screen reader, and a member deciding whether
 * their money moved should never have to infer it from something sliding. The
 * same rule as the colour of a `Notice`: the meaning is in the text.
 *
 * WHY EVERYTHING GOES THROUGH `m` AND `LazyMotion`
 * `motion.div` pulls in every feature Framer Motion has — layout projection,
 * drag, gesture handling — for a project that only ever fades and nudges. `m`
 * with `domAnimation` ships the animation feature set alone. The main bundle
 * here is already over the size the build warns about, so the difference is not
 * academic, and the cost of the smaller import is one rule: within these
 * providers, use `m`, never `motion`.
 *
 * WHY REDUCED MOTION IS HONOURED TWICE
 * `MotionConfig reducedMotion="user"` is the baseline — it makes Framer Motion
 * itself drop transforms for a reader who has asked the operating system for
 * less movement. But a fading element that starts invisible still renders
 * invisible, and the fade is motion too. So each component below also checks
 * `useReducedMotion` and, when set, renders its children plainly with no initial
 * state at all: no fade, no shift, nothing to wait for. Both layers exist
 * because they fail differently — the config covers anything added later that
 * forgets, and the check covers the reader who is affected right now.
 *
 * WHY REVEALS ARE MARKED `data-reveal`
 * An element that begins at `opacity: 0` and is animated by script is invisible
 * if the script never runs. Everything below therefore carries a `data-reveal`
 * attribute, and `index.html` ships a `<noscript>` rule that un-hides them: a
 * page of blank sections is not an acceptable failure mode for a landing page.
 */

/** Decelerating, and short enough to feel like a response rather than a wait. */
const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];
const DURATION = 0.35;
const DISTANCE = 10;

const item: Variants = {
  rest: { opacity: 0, y: DISTANCE - 2 },
  shown: { opacity: 1, y: 0, transition: { duration: DURATION - 0.05, ease: EASE_OUT } },
};

const list: Variants = {
  rest: {},
  // The stagger is what makes a list read as a list rather than as one object:
  // rows arrive in the order they are written, which is the order they matter in.
  shown: { transition: { staggerChildren: 0.045 } },
};

/**
 * Mounts the motion configuration. Placed once, at the root.
 *
 * Deliberately not `strict`: strict mode throws when `motion.*` is used instead
 * of `m.*`, which would turn a future mistake into a blank page rather than a
 * larger bundle. The rule is written down above instead.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation}>{children}</LazyMotion>
    </MotionConfig>
  );
}

/**
 * Fades and lifts its children once they scroll into view.
 *
 * `once` on purpose: content that re-animates every time it passes the fold is a
 * party trick, and it makes scrolling back up feel broken.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -12% 0px' });
  const reduced = useReducedMotion();

  if (reduced === true) return <div className={className}>{children}</div>;

  return (
    <m.div
      ref={ref}
      data-reveal=""
      className={className}
      initial={{ opacity: 0, y: DISTANCE }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: DISTANCE }}
      transition={{ duration: DURATION, ease: EASE_OUT, delay }}
    >
      {children}
    </m.div>
  );
}

/** A page replacing another. Animates on mount rather than on scroll. */
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  if (reduced === true) return <div className={className}>{children}</div>;

  return (
    <m.div
      data-reveal=""
      className={className}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
    >
      {children}
    </m.div>
  );
}

/**
 * A list whose rows arrive in sequence.
 *
 * Renders a `ul`, and its children must be `StaggerItem`s — the sequencing works
 * by variant propagation from parent to child, so a row that is not one simply
 * appears immediately, which is a quiet failure rather than a broken page.
 */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const reduced = useReducedMotion();

  if (reduced === true) return <ul className={className}>{children}</ul>;

  return (
    <m.ul
      ref={ref}
      data-reveal=""
      className={className}
      variants={list}
      initial="rest"
      animate={inView ? 'shown' : 'rest'}
    >
      {children}
    </m.ul>
  );
}

/** One row of a `Stagger`. Renders an `li`. */
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();

  if (reduced === true) return <li className={className}>{children}</li>;

  return (
    <m.li data-reveal="" className={className} variants={item}>
      {children}
    </m.li>
  );
}

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MotionProvider, PageTransition, Reveal, Stagger, StaggerItem } from './motion';

/**
 * The reduced-motion branch is the one that cannot be reached from a test by
 * running the app, because it depends on an operating system setting. It is
 * therefore forced, by replacing the hook Framer Motion exposes for exactly that
 * question. Everything else in the module is left as the real thing, so these
 * assert the components that ship rather than a stand-in.
 */
const state = vi.hoisted(() => ({ reducedMotion: false }));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => state.reducedMotion };
});

afterEach(() => {
  state.reducedMotion = false;
});

/** Server-renders a tree the way the app mounts it: inside the provider. */
function render(node: ReactElement): string {
  return renderToString(<MotionProvider>{node}</MotionProvider>);
}

describe('the motion vocabulary', () => {
  it('renders its children on the server, so a page is never blank without script', () => {
    // The failure this guards against is a landing page whose sections start at
    // `opacity: 0` and stay there: the text must exist in the document that the
    // server sends, not only after an animation has run.
    const html = render(<Reveal>A contribution of 25 USDC</Reveal>);
    expect(html).toContain('A contribution of 25 USDC');
  });

  it('marks animated blocks with the attribute index.html un-hides', () => {
    expect(render(<Reveal>content</Reveal>)).toContain('data-reveal');
    expect(render(<Stagger>content</Stagger>)).toContain('data-reveal');
    expect(render(<StaggerItem>content</StaggerItem>)).toContain('data-reveal');
    expect(render(<PageTransition>content</PageTransition>)).toContain('data-reveal');
  });

  it('names that attribute in the no-script rule, so the two cannot drift apart', () => {
    // The attribute above and the rule in index.html are a contract between two
    // files that cannot import each other. Asserting the rule exists, and that it
    // targets the same attribute, is what keeps renaming one from silently
    // leaving the animation-free page invisible.
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('[data-reveal]');
    expect(html).toMatch(/\[data-reveal\]\s*\{[^}]*opacity:\s*1/);
  });

  it('keeps list semantics, because a list is read as a list', () => {
    // `Reveal` renders a `div`. That is why the landing page keeps its `li`
    // outside the reveal — a `div` between `ol` and `li` breaks the structure a
    // screen reader announces. `Stagger` and `StaggerItem` exist to animate lists
    // without that mistake, so they must stay a `ul` and an `li`.
    const html = render(
      <Stagger>
        <StaggerItem>first</StaggerItem>
      </Stagger>,
    );
    expect(html).toContain('<ul');
    expect(html).toContain('<li');
    expect(html).not.toContain('<div>first</div>');
  });

  it('renders plainly, with nothing to wait for, when motion is not wanted', () => {
    // Not merely "no transform": the point is that there is no initial hidden
    // state at all, so a reader who asked for less movement is never shown a
    // blank block that fills itself in.
    state.reducedMotion = true;

    const reveal = render(<Reveal className="mt-4">terms</Reveal>);
    expect(reveal).toContain('terms');
    expect(reveal).not.toContain('data-reveal');
    expect(reveal).not.toContain('opacity');

    const list = render(
      <Stagger>
        <StaggerItem>first</StaggerItem>
      </Stagger>,
    );
    expect(list).toContain('<ul');
    expect(list).toContain('<li');
    expect(list).not.toContain('data-reveal');
  });
});

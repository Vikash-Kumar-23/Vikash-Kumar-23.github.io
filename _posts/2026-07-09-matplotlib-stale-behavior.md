---
layout: post
title:  "Understanding Matplotlib's 'stale' Behavior and Designing an Overlay Layer"
date:   2026-07-09 08:30:00 +0530
categories: matplotlib architecture internals
---


### What is it?

Every artist in Matplotlib (lines, text, patches, axes — basically anything you can see on a figure) has a `stale` attribute. It is just a `True`/`False` flag stored as `self._stale`.

When something about an artist changes — say its color, its data, or its position — it marks itself `stale = True`. Once it actually gets drawn on screen, it is marked `stale = False` again.

### Why does it exist?

Without `stale`, Matplotlib would never update the screen automatically. Every time the user changed a property — a color, a line width, some data — the screen would just sit there frozen. The user would have to manually type `plt.draw()` at the end of every update just to see the change.

The `stale` flag handles this automatically. It lets Matplotlib group a bunch of updates together and only redraw the screen once when it is really needed, without the user having to ask for it.

### How does stale interact with requesting draws/updating figures?

<div style="margin: 2rem 0 0.5rem 0; width: 100%; max-width: 100%; overflow-x: auto; text-align: center;">
  <a href="/assets/images/updating%20figures.drawio.png" target="_blank" style="display: inline-block;">
    <img src="/assets/images/updating%20figures.drawio.png" alt="Stale updating figures flowchart" style="width: auto; max-height: 75vh; margin: 0;">
  </a>
</div>
<p style="text-align: center; font-size: 0.85em; color: #888; margin-bottom: 2rem;"><em>Click to open in full resolution</em></p>

Here is what happens step-by-step when you change something, like the color of a line:

1. The line realizes it has changed and marks itself as "stale" (needs updating).
2. It tells its parent, the Axes (the plot area), which also marks itself as stale.
3. The Axes tells the Figure (the whole window), which also marks itself as stale.
4. Now that the Figure knows something changed, it schedules a screen update.
5. Finally, Matplotlib redraws the screen to show your changes and resets all the "stale" flags back to `False`.

### How does a figure get and use the information?

When any child is added to a `Figure` — whether it's an `Axes`, a `SubFigure`, or just an artist — a callback called `_stale_figure_callback` gets attached to it. So when that child becomes stale, the figure immediately knows.

The Figure uses the information to do these things:
* It marks itself as "stale" so it knows something inside it has changed.
* It sends a message to the main window (the Canvas), asking it to redraw the screen.
* When the screen finally redraws, the Figure (and every single item inside it) wipes its "stale" flag clean so the system is fresh and ready for the next change.

### How do Axes get and use the information?

Same idea — when the user adds an artist to an `Axes`, a `_stale_axes_callback` gets attached so the axes knows when a child changes.


The Axes uses the information to do these things:
* It updates its own state by setting its internal flag to `self._stale = True`.
* It triggers its own callback (`_stale_figure_callback`) to pass the message up the chain, notifying its parent `Figure` that a redraw is needed.

### How do other Artists get and use the information?

Artists (like a Line2D or Text) do not actually receive stale information from anywhere because they are the bottom of the chain. Instead, they are the source of the information! They generate the stale signal whenever a user alters their data or appearance.

It updates its own internal state by setting its flag to self._stale = True.
It triggers its own stale_callback, which sends the stale signal up the chain to notify its parent (usually an Axes) that a redraw is needed.

### What role do callbacks use, when are they used?

Callbacks are what allow the stale flag to travel up the hierarchy from a single artist all the way to the canvas. There are three main ones:

1. `_stale_axes_callback` — goes from a child artist up to its `Axes`.
2. `_stale_figure_callback` — goes from an `Axes` (or any direct figure child) up to the `Figure`.
3. `_auto_draw_if_interactive` — goes from the `Figure` to the canvas to call `draw_idle()`.

These callbacks only fire when something becomes `stale = True`. Setting it back to `False` does not trigger anything.

---

### Extending behavior to Overlay Layers



Here is my proposed approach:

**1. Introduce a native `in_overlay` property:**
Instead of managing a separate list of overlay artists, I plan to add an `_in_overlay` flag directly to the base `Artist` class. An artist could be put into the overlay just by doing `line.set_in_overlay(True)`, which would feel natural and consistent with how `animated` works.

**2. Block stale from propagating:**
In the `stale` property setter on `Artist`, if the artist is an overlay artist, I plan to return early and not propagate the stale flag upward. This is exactly the same trick `animated=True` uses — the artist marks itself dirty but the figure never finds out, so no full redraw is triggered.

**3. Skip overlay artists in the main draw:**
In `Axes.draw()` and `Figure._get_draw_artists()`, I will add a check so overlay artists are excluded from the normal render loop (similar to how animated artists are skipped). This keeps the main figure draw fast.

**4. A lightweight manager to trigger overlay redraws:**
Finally, I will add an `OverlayManager` to the canvas with a single `update()` method. When an interactive tool moves an overlay artist, it would call `manager.update()` which then calls `canvas.draw_overlay()`. GUI backends that support it can implement this as a fast blit; others can fall back to a normal `draw_idle()`.


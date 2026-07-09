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

When a user does something like `line.set_color("red")`, here is what happens step by step:

1. The line marks itself `stale = True`.
2. It then notifies its parent `Axes` through a `stale_callback`, making the axes stale too.
3. The `Axes` does the same thing up to the `Figure`.
4. The `Figure` also has a callback (`_auto_draw_if_interactive`) that schedules the redraw automatically.
5. Eventually the draw event fires, `Figure.draw()` runs, everything gets rendered, and `stale` is reset to `False`.

One important exception: if an artist is marked `animated=True`, this whole chain stops. Animated artists are meant to be updated manually (for things like blitting), so they intentionally block the stale flag from propagating upwards.

### How does a figure get and use the information?

When any child is added to a `Figure` — whether it's an `Axes`, a `SubFigure`, or just an artist — a callback called `_stale_figure_callback` gets attached to it. So when that child becomes stale, the figure immediately knows.

When it actually draws, `Figure.draw(renderer)` runs the full render. One small but important detail: at the very end there is a `finally:` block that sets `self.stale = False`. This makes sure the flag gets cleared even if something crashes during rendering.

### How do Axes get and use the information?

Same idea — when the user adds an artist to an `Axes`, a `_stale_axes_callback` gets attached so the axes knows when a child changes.

There is a clever trick inside `Axes.draw(renderer)`: it sets `self._stale = True` directly on the private attribute instead of going through the property setter. This is intentional — it skips the callback. Why? Because during a draw, the axes might recalculate tick positions which would mark itself stale again, which would trigger another draw, and so on forever. Setting the raw attribute avoids that loop.

### How do other Artists get and use the information?

Almost every method that changes how an artist looks ends with `self.stale = True`. For example:
- `Text.set_fontsize()`
- `Line2D.set_data()`
- `Spine.set_bounds()`

On the other side, the base `Artist.draw(renderer)` is responsible for setting `self.stale = False` once drawing is done. It also skips drawing entirely if the artist is invisible.

One more thing: when a user calls `artist.remove()`, the `stale_callback` is set to `None`. This makes sense — a removed artist should not keep triggering redraws on a figure it is no longer part of.

### What role do callbacks use, when are they used?

Callbacks are what allow the stale flag to travel up the hierarchy from a single artist all the way to the canvas. There are three main ones:

1. `_stale_axes_callback` — goes from a child artist up to its `Axes`.
2. `_stale_figure_callback` — goes from an `Axes` (or any direct figure child) up to the `Figure`.
3. `_auto_draw_if_interactive` — goes from the `Figure` to the canvas to call `draw_idle()`.

These callbacks only fire when something becomes `stale = True`. Setting it back to `False` does not trigger anything.

They are set up as soon as a user adds things to the figure, and they get removed when an artist is pickled — because serializing a callback that holds a reference to a whole figure would cause all sorts of problems.

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


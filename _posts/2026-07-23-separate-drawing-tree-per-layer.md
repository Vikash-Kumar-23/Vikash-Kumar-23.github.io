---
layout: post
title:  "Separate the Drawing Tree"
date:   2026-07-23 22:26:00 +0530
categories: matplotlib architecture internals
---

### Separate the Drawing Tree
Instead of filtering artists from a single shared tree at draw time, It will be better
to giving each layer its own **registered artist list**. There would be two layers:

- **Base Layer**: holds all the standard plot artists — axes, spines, lines, text,
  patches. This is what gets drawn during a full figure redraw.
- **Overlay Layer**: holds all artists that have `in_overlay=True`. This is what gets
  drawn during a lightweight overlay-only redraw.

Each layer would know which artists belong to it. When `draw_overlay()` is called,
it does not need to search the whole figure tree — it just iterates its own list.

- Each layer would have its own **stale state**. When an overlay artist
changes, it notifies the overlay layer, and the overlay layer decides what to do
(call `draw_overlay()`). The base layer is never touched. This fixes the stale propagation
adding `draw_overlay_idle()` so that multiple rapid changes get batched into one repaint.

For the `animated=True` problem, the layers would handle animated and non-animated
artists separately. In the base layer, non-animated artists are drawn normally and
animated artists are drawn via the existing blit mechanism. In the overlay layer,
the same split would apply — non-animated overlay artists go into the regular
`draw_overlay()` pass, and animated overlay artists can be blitted into the overlay
buffer independently. This means `animated=True` and `in_overlay=True` would work
together without any conflict.

### The split is at the Canvas level

The `LayerManager` would live on the **Canvas** — the same level where the
existing `OverlayManager` lives today. It would hold two flat lists:
one for the base layer and one for the overlay layer.

**Why the Canvas level for the manager?**

The Canvas is the object that owns both rendering passes — the base draw and
the overlay draw. It already calls `draw()` for the base pass and `draw_overlay()`
for the overlay pass. Putting the `LayerManager` here means the two lists are
right next to the code that uses them.

**Artist class:**
- Remove the `in_overlay` special-case from inside the `stale` setter. Right now
  that block calls `draw_overlay()` directly, which is the synchronous problem.
  Instead, stale propagation would naturally reach the layer via the
  `stale_callback`
- When `set_in_overlay()` is called and the flag changes, the artist should be
  moved from one layer to the other automatically.

**Layer management:**
- `LayerManager.add_artist()` routes each artist to the correct layer based on
  its `in_overlay` flag.
- `LayerManager.move_artist()` handles the case where the flag changes after the
  artist is already registered.

### How Backend Compatibility Works

This is important: the fallback for non-supporting backends should live in the **base canvas class**, and the native fast implementation should live in the **backend-specific file**.

**Base canvas (fallback for all backends that don't support overlay):**

```python
class FigureCanvasBase:
    supports_overlay = False  # default

    def draw_overlay(self):
        self.draw_idle()  # fallback: just do a full redraw
```

**What happens when `supports_overlay` is False:**
- When an overlay artist becomes stale, the OverlayLayer calls canvas.draw_overlay(). The canvas handles the rest — the base canvas fallback calls draw_idle(), native backends render the overlay buffer directly.
- During the main draw pass, all artists (base + overlay) are rendered together in standard Z-order.
- The overlay artist still appears correctly on screen. It just falls back to standard full redrawing.

so According to the current approch draw_overlay() code is written in the native backend file (backend_qtagg.py). The fallback (which just calls draw_idle()) stays in the base canvas file (backend_bases.py).

---
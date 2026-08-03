---
layout: post
title: "Implementation Plan: Universal Layer Manager"
date: 2026-08-02 20:10:00 +0530
categories: matplotlib architecture internals gsoc
---

### 1. Core Strategy: A Mode Flag, Not a Separate Renderer

Instead of building a parallel rendering system, a simple **drawing mode flag** (`_draw_mode`) is added to the canvas. This flag is read by Matplotlib's existing artist filtering code at two key points in the pipeline:

* **Base pass** (`_draw_mode = 'base'`): The standard render loop runs exactly as before, but artists marked with `in_overlay=True` are temporarily filtered out. The result is a clean base layer with all axes, grids, and non-overlay data.
* **Overlay pass** (`_draw_mode = 'overlay'`): A second render pass runs including **only** overlay artists (`in_overlay=True`).

```python
# The canvas orchestrates both passes:
self._draw_mode = 'base'
self.figure.draw(self.renderer)   # Pass 1: base only

self._draw_mode = 'overlay'
self.draw_overlay()               # Pass 2: overlay only
```

---

### 2. How the Separation Actually Works: Three Drawing Modes

The `_draw_mode` flag is a string attribute on the canvas that controls artist filtering across rendering passes. Rather than just two states, the architecture relies on **three distinct drawing modes**:

| Mode | What Passes the Filter | Primary Use Case |
| :--- | :--- | :--- |
| `'base'` | All artists **except** overlay artists (`not in_overlay`) | Base layer pass (axes, grids, background) |
| `'overlay'` | **Only** overlay artists (`in_overlay == True`) | Overlay layer pass (interactive cursors/tooltips) |
| `'all'` | **Everything** (all non-animated artists) | Default safe mode & file exports (`savefig`) |

#### Setting the Mode in `draw_overlay()`

When `draw_overlay()` is called, it explicitly sets `_draw_mode = 'overlay'` so that only overlay items are rendered into the overlay layer:

```python
def draw_overlay(self):
    """Render ONLY overlay artists into separate buffer."""
    self._draw_mode = 'overlay'
    try:
        self.figure.draw(self.renderer)  # renders ONLY overlay artists
    finally:
        self._draw_mode = 'base'          # reset to default
```

#### Filter Point 1: `figure.py` — `_get_draw_artists()`

```python
# figure.py — _get_draw_artists()
draw_mode = getattr(self.figure.canvas, '_draw_mode', 'base')

if is_saving:
    artists = [a for a in artists]                      # Save / Full draw: include everything
elif draw_mode == 'overlay':
    artists = [a for a in artists if a.get_in_overlay()]   # Overlay pass: include ONLY overlay artists
else:  # draw_mode == 'base'
    artists = [a for a in artists if not a.get_in_overlay()] # Base pass: EXCLUDE overlay artists
```

#### Filter Point 2: `axes/_base.py` — Per-Axes Filter

Each axes object has its own filter that runs after `_get_draw_artists()`. It uses the exact same 3-mode structure:

```python
# axes/_base.py — inside the draw loop
canvas = self.get_figure(root=True).canvas
draw_mode = getattr(canvas, '_draw_mode', 'base')

if canvas.is_saving():
    artists = [a for a in artists]                      # Save / Full draw: include everything
elif draw_mode == 'overlay':
    artists = [a for a in artists if a.get_in_overlay()]   # Overlay pass: include ONLY overlay artists
else:  # draw_mode == 'base'
    artists = [a for a in artists if not a.get_in_overlay()] # Base pass: EXCLUDE overlay artists
```

#### The Complete Step Execution Flow

Here is what happens end-to-end when `canvas.draw()` is called:

```text
1.  canvas.draw() sets _draw_mode = 'base'
2.  figure.draw(renderer) is called
3.  _get_draw_artists() → excludes overlay artists
4.  Renderer draws only base artists → base image cached in RAM
5.  canvas.draw_overlay() is called
6.  _draw_mode = 'overlay'
7.  figure.draw(renderer) is called again
8.  _get_draw_artists() → includes ONLY overlay artists
9. Overlay layer composited over cached base image → screen
```

**Key insight:** Both passes use the **exact same rendering pipeline** — transforms, clipping, layout all work correctly because nothing is bypassed. The only difference is which artists pass through the filter.



---

### 3. Architecture & LayerManager Design

#### Where Does it Live?
The new `LayerManager` resides directly on the **Canvas** (`FigureCanvasBase`). 

* The **Figure** is the data owner holding all plot objects.
* The **Canvas** is the rendering manager controlling pixel buffers, window updates, and repaints.

Placing `LayerManager` on the Canvas ensures layer separation logic lives right where rendering happens.

#### Key Responsibilities:
* **State & Buffer Caching:** Manages layer drawing modes and retains base/overlay pixel caches for non-Qt backends.
* **Dynamic Tree Resolution:** Instead of maintaining static lists of artists (which can get out of sync when artists are added or removed), `LayerManager` queries the figure tree dynamically at draw time.
* **Zero Manual Bookkeeping:** Stores no static lists of overlay artists. The figure tree remains the single source of truth — eliminating registration hooks, memory leaks, and out-of-sync state bugs.

#### How It Connects Figure and Canvas:
`LayerManager` bridges the **Figure** (data owner) and the **Canvas** (rendering pipeline):

```text
  ┌─────────────────────────┐
  │         Figure          │  ← Single Source of Truth
  │   (owns all artists)    │
  └────────────┬────────────┘
               │
               ▼
  ┌─────────────────────────┐
  │      LayerManager       │  ← Manages layer modes,
  │  (canvas._layer_manager)│     buffer caches & invalidation
  └────────────┬────────────┘
               │
               ▼
  ┌─────────────────────────┐
  │      FigureCanvas       │  ← Controls rendering passes
  │   (draw / draw_overlay) │     & screen repaints
  └─────────────────────────┘
```

---

### 4. Supporting All Backends (Qt and Non-Qt)

#### A. Backends with Native Layer Support (Qt)
Native GUI windows can stack image layers. The base plot is retained in memory as an image, while Qt draws the overlay layer on top using hardware acceleration.

#### B. Backends without Native Layer Support
For backends unable to stack image windows natively, **RAM caching** is used:

1. **Capturing Raw RGBA Pixel Bytes (Two-Pass Draw):**
   * **Pass 1 — Base Layer:** `draw()` sets `_draw_mode = 'base'`. The existing Matplotlib pipeline runs normally, but `_get_draw_artists()` filters out all overlay artists. The resulting RGBA buffer from `RendererAgg` is captured by `LayerManager.store_base()` as `_base_cache`.
   * **Pass 2 — Overlay Layer:** `draw_overlay()` sets `_draw_mode = 'overlay'`. The pipeline runs again, but this time `_get_draw_artists()` includes only overlay artists. The resulting RGBA bytes are captured by `LayerManager.store_overlay()` as `_overlay_cache`.
   * After both passes, `_draw_mode` is always reset to `'base'` (the safe default).
2. **Tracking Image Dimensions and DPI:** Along with the pixel bytes, `LayerManager` records current figure dimensions and DPI settings as a validation signature (`_cache_sig`). This ensures cached buffers are only reused when figure dimensions match. If the user resizes the window, stored buffers are automatically cleared.
3. **Software Alpha Blending:** When an overlay item updates, `draw_overlay()` checks `is_cache_valid()`. If the cache is valid, it skips the base pass entirely — retrieving cached base bytes from memory without redrawing the base plot. Only the overlay pass runs (with `_draw_mode = 'overlay'`), and the updated overlay pixels are alpha-blended over stored base pixels in RAM, producing the final image sent to the screen display.

---

### 5. Preserving File Exports (`savefig`)

When saving a plot to disk using `fig.savefig()`, the layer separation mode is disabled. Matplotlib renders all items together in a single pass. This ensures saved files (such as PNG, PDF, or SVG) remain 100% identical to standard Matplotlib output.

---
layout: post
title: "New Approach for Matplotlib Overlays"
date: 2026-08-06 23:15:00 +0530
categories: matplotlib architecture internals gsoc
---
## Proposed Approach: Container-Managed Layers
The proposed solution shifts the responsibility of layer management directly to the `Figure`.

The plot is split into two layers:
1. **Base Layer**: Heavy, static elements (axes, grids, data lines, scatter points).
2. **Overlay Layer**: Light, interactive elements (cursors, tooltips).

### 1. Internal Layer Routing
The `Figure` now has two lists: `_artists_base_layer` and `_artists_overlay_layer`. 
When you create a UI element, you simply tell the figure to put it in the overlay layer:

```python
crosshair = Line2D([x, x], [0, 1], color='red')
fig.add_artist(crosshair, _overlay=True) 
```
The figure handles everything else.

### 2. Sequential Drawing
Currently, Matplotlib puts all artists into one big list, sorts them, and draws them together. 

In this new approach, `Figure.draw()` is split into strict steps:
1. First, call `_draw_base_layer()` to draw the main plot.
2. Second, call `_draw_overlay_layer()` to draw the UI elements directly on top.

Because the overlay is always drawn second, your cursor will never be accidentally hidden behind a data point.

## Next Steps in the Implementation

### 1. Layer Management at the Axes Level

* Initialize `_artists_base_layer` and `_artists_overlay_layer` inside `Axes`.
* Update `Axes.add_artist()` to support routing artists to the overlay list.
* Split `Axes.draw()` into separate `_draw_base_layer()` and `_draw_overlay_layer()` passes.
* Update `Figure` drawing methods to trigger these sub-layers sequentially.

### 2. Updating Stale Callbacks
When an overlay artist is updated (e.g., when a cursor moves), it marks itself as "stale". 
* The `stale` property logic in `Artist` needs to be updated.
* If a stale artist belongs to the overlay layer, it should trigger a fast `canvas.draw_overlay()` instead of marking the parent `Figure` stale. This stops the stale state from propagating up and triggering a slow redraw of the entire base layer.

### 3. Backend Caching
Finally, the fast path will be implemented natively in `FigureCanvasAgg`:
* Save the pixel buffer of the base layer right after `_draw_base_layer()` finishes.
* Implement a universal `draw_overlay()` method on the canvas that restores this saved background and only paints the overlay layer on top.


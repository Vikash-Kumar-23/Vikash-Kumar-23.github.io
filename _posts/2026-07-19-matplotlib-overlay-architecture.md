---
layout: post
title:  "The Fallback Architecture and Native QT backend"
date:   2026-07-19 08:16:07 +0530
categories: matplotlib architecture internals
---

## The Fallback Architecture

### 1. in_overlay Property

`in_overlay` property to the base Artist class. Users can now simply do:

```python
line.set_in_overlay(True)
```

This is similar to how `animated=True` works.

### 2. Blocking Stale Propagation

Matplotlib uses a stale flag to track what needs redrawing. Normally, changing a line makes it stale, which propagates to Axes, then to Figure, triggering a full redraw.

The stale setter was modified to check: if this artist is in the overlay AND the canvas supports native overlays, mark it dirty but don't tell the Figure. Instead, call draw_overlay() directly. This stops the expensive full redraw chain.

### 3. Filtering Overlay Artists

When the canvas draws itself normally, overlay artists shouldn't be in the background. A filter was added that skips any artist where in_overlay=True - but only when the backend supports native overlays (supports_overlay=True).

For backends where supports_overlay=False, overlay artists are not filtered. They behave like normal artists and go through standard stale propagation.

### 4. OverlayManager

An OverlayManager class was added to the Canvas. This provides an update() method that triggers canvas.draw_overlay().

**Why do we need update() if the stale setter already calls draw_overlay()?**

update() calls canvas.draw_overlay(). However, since the stale setter already calls draw_overlay() automatically, we did not really need it unless user want to update the overlay even if artist is not stale - update() method is currently redundant

<img src="/assets/images/fallback.png" alt="Fallback Architecture Flow" width="500">

If `supports_overlay` is False then the artists are drawn in normal draw.

---

## Qt Native Overlay Implementation

### 1. The draw_overlay() Override

The Qt backend overrides `draw_overlay()` to do actual drawing instead of just calling `draw_idle()`. When an overlay artist changes, this method is called automatically by the stale setter.

### 2. Finding Overlay Artists

The figure hierarchy is searched recursively to find all artists marked as overlay. This includes artists inside axes, subfigures, and any nested containers. All found artists are collected into a list and sorted by their z-order property to ensure correct visual layering when drawn.

### 3. Creating the Overlay Buffer

When `draw_overlay()` is called:
- A fresh RendererAgg buffer is created (starts transparent)
- Overlay artists are drawn into this buffer
- The buffer is converted to a Qt QImage

### 4. The Composite

In Qt's `paintEvent()`:
1. The main figure image is drawn
2. The overlay QImage is drawn on top

Since Qt supports transparency natively, the main figure shows through the overlay. When the cursor moves, only the overlay buffer is regenerated - not the entire figure. This makes updates extremely fast.


<img src="/assets/images/qt.png" alt="Qt backend Architecture Flow" width="500">

---

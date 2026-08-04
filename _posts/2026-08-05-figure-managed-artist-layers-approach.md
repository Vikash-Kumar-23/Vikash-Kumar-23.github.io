---
layout: post
title: "Proposed Architecture: Figure-Managed Artist Layers"
date: 2026-08-05 10:00:00 +0530
categories: matplotlib architecture internals gsoc
---


```python
fig.draw(renderer)                  # draw everything normally
fig.draw_layer(renderer, "base")    # draw only base artists
fig.draw_layer(renderer, "overlay") # draw only overlay artists
```

## Core Idea

Under this design, the figure owns the layer definitions:

```python
self._artist_layers = [
    ArtistLayer("base", lambda artist: not artist.get_in_overlay()),
    ArtistLayer("overlay", lambda artist: artist.get_in_overlay()),
]
```

These layers do not store artist objects directly. Instead, they store **filtering rules**.

As a result, artists remain in the standard Matplotlib artist tree, and layer membership is evaluated dynamically during drawing.

## Why This Helps

Normal drawing behavior stays completely unchanged:

```python
fig.draw(renderer)
```

still draws the full figure as usual.

Layer drawing is handled separately:

```python
fig.draw_layer(renderer, "overlay")
```

This temporarily activates the overlay layer filter and executes the standard Matplotlib draw pipeline. Because it reuses the main pipeline, all coordinate transforms, clipping, z-ordering, axes traversal, and rendering behaviors are naturally preserved.

## How Filtering Works

When no layer filter is active, all non-animated artists are drawn as normal.

When a layer filter is active:

- `"base"` includes artists where `in_overlay=False`
- `"overlay"` includes artists where `in_overlay=True`

Both `Figure` and `Axes` respect the active layer because the majority of plot artists reside inside axes containers.

During overlay layer drawing, figure and axes background patches are automatically skipped so that the overlay layer remains fully transparent.

## How `draw_layer()` Works Internally

When `draw_layer()` is invoked, the figure temporarily records which layer is active and executes `draw(renderer)` inside a `try...finally` block:

```python
def draw_layer(self, renderer, layer):
    old_layer = self._active_artist_layer
    self._active_artist_layer = self.get_artist_layer(layer)
    try:
        self.draw(renderer)
    finally:
        self._active_artist_layer = old_layer
```

1. **Activate Layer Filter:** `self.get_artist_layer(layer)` resolves the requested layer descriptor (e.g., `"overlay"`) from `self._artist_layers` and sets `self._active_artist_layer = overlay_layer`.
2. **Execute Normal Pipeline:** `self.draw(renderer)` runs the standard figure draw loop.
3. **Safe State Restoration:** In the `finally:` block, `self._active_artist_layer` is restored to `old_layer` (typically `None`), ensuring the figure always returns to its default state even if rendering raises an exception.

Crucially, `draw_layer()` does not construct a parallel renderer or a custom artist traversal loop. It reuses the existing Matplotlib drawing pipeline.

## Artist Filtering in the Normal Pipeline

Filtering is performed within the exact places Matplotlib already determines which artists to render.

### Figure-level filtering

In `figure.py`, `_get_draw_artists()` inspects whether an active layer filter is set.

- **Normal draw (`_active_artist_layer is None`):** All non-animated artists are included.
- **Layer draw (`_active_artist_layer` is `"base"` or `"overlay"`):** Only artists matching the active layer's rule are included.

Conceptually:

```python
if active_layer is None:
    artists = [a for a in artists if not a.get_animated()]
else:
    artists = [
        a for a in artists
        if not a.get_animated() and active_layer.contains(a)
    ]
```

### Axes-level filtering

`Axes.draw()` applies the matching logic because most visual artists live within axes.

For normal drawing:

```python
artists = [a for a in artists if not a.get_animated()]
```

For layer drawing:

```python
artists = [
    a for a in artists
    if not a.get_animated() and active_layer.contains(a)
]
```

This guarantees:

- `draw_layer("base")` -> axes render only base children
- `draw_layer("overlay")` -> axes render only overlay children

## Keeping Overlay Layers Transparent

When rendering only the overlay layer, background patches must be bypassed.

The expected overlay drawing behavior is:

- Render overlay artists
- Do not render figure background patch
- Do not render axes background patch

Conceptually:

```python
if active_layer is None or active_layer.name != "overlay":
    self.patch.draw(renderer)
```

This keeps the overlay layer transparent and ready for compositing.

## Complete Execution Flow

### Normal full draw

```text
fig.draw(renderer)
  -> _active_artist_layer = None
  -> Figure selects all normal non-animated artists
  -> Axes select all normal non-animated children
  -> figure patch and axes patches are drawn
  -> output is the complete figure
```

### Base-layer draw

```text
fig.draw_layer(renderer, "base")
  -> _active_artist_layer = base
  -> Figure selects base artists and needed containers
  -> Axes select only base children
  -> figure patch and axes patches are drawn
  -> output is the base layer
```

### Overlay-layer draw

```text
fig.draw_layer(renderer, "overlay")
  -> _active_artist_layer = overlay
  -> Figure selects overlay artists and needed containers
  -> Axes select only overlay children
  -> figure patch and axes patches are skipped
  -> output is transparent overlay content
```

## Future Backend Optimizations

This proposed first step provides the `draw_layer()` primitive without requiring backend compositing infrastructure immediately.

In subsequent phases, backends can build upon this primitive for high-performance rendering:

```text
1. Draw base layer into a cached buffer
2. Draw overlay layer into a transparent buffer
3. Composite base + overlay
4. Redraw only overlay when overlay artists change
```

Qt can leverage native overlay images/widgets, while non-Qt backends can incorporate software alpha-compositing.

## Summary

This proposal focuses on establishing one clean, central abstraction:

```text
Figure manages layers.
draw() draws everything.
draw_layer() draws one layer.
```


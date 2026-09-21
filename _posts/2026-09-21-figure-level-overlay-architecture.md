---
layout: post
title: "Figure-level Overlay Architecture with Layered Rendering"
date: 2026-09-21 15:18:00 +0530
categories: matplotlib
---

# Google Summer of Code 2026 Final Report

## Status

**Progress** - Implementation work is currently ongoing.

## Branches and Pull requests

* Implementation PR: [#32199](https://github.com/matplotlib/matplotlib/pull/32199)
* Alternative exploration PR: [#32002](https://github.com/matplotlib/matplotlib/pull/32002)

## Abstract

Currently, any interactive element in Matplotlib (such as the `Cursor` widget
that draws a crosshair) must be rendered as part of the main figure. This means
that even a tiny mouse movement triggers a full redraw of the entire figure,
including all artists, data, labels, and ticks. As a result, simple interactive
tools like crosshairs feel noticeably laggy over heavy data plots.

**Related Issue:** [#30515](https://github.com/matplotlib/matplotlib/issues/30515)

## Implementation

In this approach, layer membership is managed directly by the `Figure`.

* `Figure` keeps track of which artists belong to each layer using an internal
  dictionary (`_children_by_layer`).
* Individual artists do not know anything about layers.
* Artists can be added to a specific layer using the layer argument:
  `fig.add_artist(line, layer="overlay")`.
* Each layer is rendered into its own `RendererAgg` buffer (in QtAgg).

## Stale Tracking & Drawing Lifecycle

Stale state tracking is managed per layer: `_stale_layers[layer_name]` is set to
`True` only when an artist belonging to that specific layer becomes stale.

During a render pass in the QtAgg backend, the canvas checks each layer's stale
status. If a layer is marked dirty (or if the canvas was resized),
`fig._draw_layer()` re-renders only that layer into its dedicated `RendererAgg`
buffer and immediately resets `_stale_layers[layer_name] = False`.

Once all stale layer buffers are updated, `draw()` clears the top-level figure
staleness (`fig.stale = False`) before calling `self.update()` to schedule Qt's
`paintEvent()`. During `paintEvent()`, `QPainter` composites the clean layer
buffers sequentially onto the screen.

As a result, moving an interactive cursor flags only `_stale_layers["overlay"] = True`,
leaving the complex base plot cached and completely untouched in memory.

## Backward compatibility

* **Public API:** The new `layer` argument in `add_artist()` defaults to `None`,
  ensuring all unassigned artists are safely routed to the "base" layer. Similarly,
  calling `get_children()` without arguments continues to return every artist in
  the figure across all layers.
* **Backend Compatibility:** Fully backward compatible. For backends that do not
  support multi-pass layer caching (like standard PDF, SVG, PNG, or non-Qt
  backends), `Figure.draw()` simply renders each layer sequentially one after
  another.
* **Blitting Compatibility:** Ensuring compatibility with the existing blitting system (like `Cursor(useblit=True)`) requires special handling. Current blitting tools are unaware of the new `_layer_renderers` and draw their dynamic artists directly into `self.renderer`, bypassing the layer system entirely. To keep these widgets visible, a final compositing step happens at the very end of Qt's `paintEvent`. After all the new layers (base, patch, overlay) are painted to the screen, the existing `self.renderer` is converted to a `QImage` and alpha-blended on top of the final output. This guarantees that standard blitting continues to work seamlessly alongside the layered architecture.

### Whole flow in QtAgg backend

<img src="{{ '/assets/images/final1.png' | relative_url }}" alt="Whole flow in QtAgg backend" width="70%">

### Performance Trade-offs

* **Interactive performance:** For interactive elements, only the affected layer needs
  to be rendered. if the cursor lives in a separate layer, only that layer needs to
  be redrawn when the user moves the mouse. The base layer (with the heavy scatter data)
  is cached in `RendererAgg` buffer unchanged.

* **Resize and zoom performance:** These operations are slightly slower than before.
  When the window is resized, every layer has to be fully redrawn and each layer
  requires its own `RendererAgg` buffer. Where the old code had one buffer, the new
  code has one per layer.

### Related Posts

* [Layer vs Non-Layer Test Suite and Verification Audit](https://vikash-kumar-23.github.io/matplotlib/testing/architecture/gsoc/2026/09/13/layer-vs-non-layer-test-suite-and-verification-audit.html)
* [Benchmarking Matplotlib Interactive Cursor Performance Layers](https://vikash-kumar-23.github.io/matplotlib/benchmarking/performance/gsoc/2026/09/13/benchmarking-matplotlib-interactive-cursor-performance-layers.html)

## What is done till now

* **Multi-Pass Drawing Engine (`_draw_layer`)**: The standard `draw()` method has been fully redesigned. Drawing now takes place in several well-defined passes instead of drawing everything in one go. The `draw()` method iterates through the layers and invokes a new `_draw_layer()` function, ensuring that artists are drawn in proper order: the background layer (figure patch) first, then the base plot layer, and finally overlays (or any other layer set by the user).

* **Layer-Based Artist Lookup**: The `get_children()` method has been modified to make the API layer-aware. With this change, `_get_draw_artists` can request artists from a particular layer.

<img src="{{ '/assets/images/draw_flow.png' | relative_url }}" alt="Draw Flow" width="30%">

* **Layer-level Stale Flag**: There is no longer just one flag marking the entire figure as dirty; instead, stale flags are maintained on a per-layer (`_stale_layers`) level. If an overlay artist moves, only its layer is marked as stale. The `draw()` method uses these flags to re-render only the layers that are actually stale, saving a considerable amount of CPU cycles. After finishing the draw pass, it clears the stale flags.

### Usage Example

The following example moves a `Cursor` widget's crosshair lines into the
overlay layer. With 1,000,000 scatter points sitting in the base layer, moving
the mouse is smooth because only the two cursor lines are redrawn on each
mouse event.

```python
import matplotlib
matplotlib.use('QtAgg')
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.widgets import Cursor

x = np.random.normal(5, 2, 1000000)
y = np.random.normal(5, 2, 1000000)

fig, ax = plt.subplots(figsize=(10, 6))
ax.scatter(x, y, alpha=0.1, color='blue')

cursor = Cursor(ax, color='red', linewidth=1)

# Remove the cursor lines from the axes (default base layer)
cursor.lineh.remove()
cursor.linev.remove()

# Re-add them into the overlay layer
fig.add_artist(cursor.lineh, layer="overlay")
fig.add_artist(cursor.linev, layer="overlay")

plt.show()
```

## Future Work

While the core architecture is now in place, there are two major next steps to make this feature fully usable for end-users:

* **Updating built-in widgets to support layers:** Right now, to get a widget like `Cursor` into the overlay layer, you have to manually extract its line artists from the base axes and re-add them to the figure layer (as shown in the usage example above). In the future, Matplotlib's built-in interactive widgets (like `Cursor`, `SpanSelector`, and `RectangleSelector`) should be updated to natively accept a `layer="overlay"` parameter so they can handle this routing automatically.

* **Expanding layer caching to all interactive backends:** Currently, the performance boost from rendering isolated layer buffers is only implemented in the `QtAgg` backend. While the layered drawing sequence works across all backends, the other interactive backends (like `TkAgg`,`GTKAgg`, `MacOSX`, and `WebAgg`) still fall back to sequentially redrawing everything. A key next step will be porting this per-layer buffering system to the other interactive backends so all users get the same interactive speedup.

## Alternatives

### Artist-level flag (`in_overlay`)

Explored in [PR #32002](https://github.com/matplotlib/matplotlib/pull/32002)

Further detailed in [Matplotlib Artist-level Overlay Architecture](https://vikash-kumar-23.github.io/matplotlib/architecture/internals/2026/07/19/matplotlib-overlay-architecture.html).

* Each overlay artist has `in_overlay = True`.
* The `Figure` does not know about overlay. All artists remain in the same
  children list.
* When an overlay artist becomes stale, it bypasses the normal stale callback and
  directly calls `canvas.draw_overlay()`. Because the `Figure` has no concept of
  overlay, it cannot mark a specific layer as stale — so the interception has to
  happen inside the `Artist` itself.
* During drawing, the backend has to search through the figure using `figure.findobj()`
  and identify artists for which `get_in_overlay()` returns `True`.

This alternative was rejected because it does not provide proper layer separation.
The backend canvas classes have to look up individual artist attributes through
`findobj()` traversal of the entire scene graph.

Figure-managed layers ensures layer isolation. Figure is responsible for
maintaining the layer registry and staleness status, making it possible for
backends to operate as lightweight execution engines rendering isolated layer buffers.

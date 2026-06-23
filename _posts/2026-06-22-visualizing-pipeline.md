---
layout: post
title: "Visualizing Matplotlib's Rendering Pipeline: A Geometry Walkthrough"
date: 2026-06-22
---

## The Walkthrough Example

```python
import matplotlib.pyplot as plt
import numpy as np

# Generate some random data for the heatmap
DATA = np.random.rand(10, 10)

# Create a figure with the layout engine enabled
fig = plt.figure(figsize=(8, 5), layout="constrained")
ax = fig.add_subplot(111)

# Add a massive label to force the layout engine to make adjustments
ax.set_ylabel("A massive label to push layout", size=26)
ax.set_title("Heatmap with Colorbar", size=12)

# Plot the heatmap (which forces aspect="equal")
im = ax.imshow(DATA, cmap='viridis', interpolation='nearest', aspect='equal')

# Add the colorbar (which uses a locator)
cbar = fig.colorbar(im, ax=ax)

plt.show()
```

---



## Investigating the Current Matplotlib Pipeline

To understand how any example in Matplotlib works—whether it's a simple line plot, a heatmap with a colorbar, or a complex grid of subplots—it is incredibly helpful to visualize the general rendering pipeline. 

Below is a flowchart of the standard Matplotlib draw cycle. It shows the exact sequence of events that occurs internally whenever Matplotlib paints a figure to the screen.

{% include image.html url="/assets/images/pipeline_flowchart.png" alt="Matplotlib Rendering Pipeline Flowchart" %}



### How the Stage Images Were Generated

The following walkthrough traces how figure geometry changes during a standard Matplotlib draw call.

Using a simple heatmap example, I recorded the dimensions of the main axes and colorbar at several points in the rendering pipeline. The figures shown below were reconstructed from those measurements and illustrate how the layout evolves from the initial default geometry to the final rendered result.

### Stage 1–5 Walkthrough

For this investigation, we configured a figure with a heatmap (`aspect='equal'`), a standard colorbar, and a large y-label to necessitate layout engine adjustments. The following walkthrough details what happens to the figure at each step of the pipeline.

#### Stage 1: Figure Created
**Measured Geometry:** Heatmap Width = 496.0px, Colorbar Width = 93.0px

{% include image.html url="/assets/images/iii1.png" alt="Current Stage 1" %}

Before the rendering pipeline begins, the geometry exists in its default initial state. The layout engine has not yet executed, so the y-label extends beyond the window edges, and the heatmap fills the default axes rectangle.

#### Stage 2: Post `_get_draw_artists`
**Measured Geometry:** Heatmap Width = 385.0px, Colorbar Width = 19.2px

{% include image.html url="/assets/images/iii2.png" alt="Current Stage 2" %}

During the draw cycle, `_get_draw_artists()` executes *before* the layout engine. Within this step, `apply_aspect()` is called on the axes. The heatmap's aspect constraint enforces a square geometry based on the current bounds, and the colorbar locator evaluates its internal dimensions, adjusting to a narrower width.

#### Stage 3: Post `layout_engine.execute`
**Measured Geometry:** Heatmap Width = 700.6px, Colorbar Width = 105.1px

{% include image.html url="/assets/images/iii3.png" alt="Current Stage 3" %}

The layout engine explicitly runs *after* `_get_draw_artists()`. It shifts the axes rightward to accommodate the y-label text. However, the layout engine is only designed to prevent overlaps—it does not strictly preserve aspect ratios. During its adjustment, it expands the main axes horizontally to fill the available space, stretching the previously square heatmap back into a wide rectangle.

#### Stage 4: Artist Draw Phase (Heatmap)
**Measured Geometry:** Heatmap Width = 446.7px, Colorbar Width = 105.1px

{% include image.html url="/assets/images/iii4.png" alt="Current Stage 4" %}

The paint phase begins, and `Axes.draw()` is called sequentially for each artist. Because the layout engine distorted the axes shapes, they must be recalculated right before the ink hits the canvas. The first operation in the heatmap's `Axes.draw()` method is a second call to `apply_aspect()`, which forces the heatmap to shrink back into a perfect square within the new boundaries set by the layout engine. 

Because artists draw sequentially, the colorbar has not yet drawn itself at this exact moment. As a result, it retains the stretched out 105.1px width dictated by the preceding layout engine step.

#### Stage 5: Final `draw_event` (Colorbar Drawn)
**Measured Geometry:** Heatmap Width = 446.7px, Colorbar Width = 22.3px

{% include image.html url="/assets/images/iii5.png" alt="Current Stage 5" %}

When the colorbar's `Axes.draw()` method executes, it evaluates its locator against the newly squared heatmap. It recalculates its size and shrinks back down into a thin vertical strip next to the heatmap. Once this completes, the `draw_event` fires, and the rendering process is finished.

---

## The `_pre_render_event` Pipeline

While investigating the geometry transitions shown in the previous section, I experimented with a modified rendering order that introduces a `_pre_render_event` between geometry evaluation and the actual paint phase.

In the current Matplotlib pipeline, geometry continues to evolve during `Axes.draw()`. As shown in the trace above, there is a period where the heatmap has already updated its aspect ratio but the colorbar has not yet updated its locator. During this stage, different parts of the figure can temporarily disagree about the final layout.

The goal of this experiment was to explore what would happen if all geometry-related calculations were completed before any artist began drawing.

In this prototype pipeline:
* The layout engine runs first.
* Aspect ratios and locator evaluations are resolved before painting begins.
* A `_pre_render_event` is emitted after geometry has stabilized but before any pixels are drawn.
* Artists can query figure geometry during this event and receive the same dimensions that will ultimately appear on the canvas.

{% include image.html url="/assets/images/experimental_flowchart.png" alt="Experimental Rendering Pipeline Flowchart" %}

However, while this pipeline successfully synchronizes geometry, I have not yet found a compelling Matplotlib use case that strictly requires this event over existing tools like custom Artists.

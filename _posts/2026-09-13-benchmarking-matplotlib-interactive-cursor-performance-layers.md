---
layout: post
title: "Benchmarking Matplotlib Interactive Cursor Performance: Layer vs. Non-Layer"
date: 2026-09-13 14:00:00 +0530
categories: matplotlib benchmarking performance gsoc
tags: [matplotlib, python, benchmarking, overlay-manager, gsoc, rendering, pytest]
---

In this benchmark, we used `pytest-benchmark` to measure the exact performance differences of the interactive `Cursor` when using the new overlay (n-layer) architecture vs. the non-layer. 

By measuring the frame rates and latency, we can see exactly how much faster UI interactions are when they are decoupled from the static data plot.

## 1. Benchmark Source Code

Here is the complete benchmark script used to generate these results:

```python
import pytest
import numpy as np
import itertools
import matplotlib
matplotlib.use('QtAgg')
import matplotlib.pyplot as plt
from matplotlib.backend_bases import MouseEvent
from matplotlib.widgets import Cursor


# DATA GENERATION

@pytest.fixture(params=[
    10, 
    100000
], ids=["small", "large"])
def n_points(request):
    return request.param

@pytest.fixture
def plot_data(n_points):
    x = np.random.normal(5, 2, n_points)
    y = np.random.normal(5, 2, n_points)
    return x, y

# CURSOR MOVEMENT LOGIC
def simulate_single_mouse_move(fig, point_cycler):
    """Core function to be benchmarked: moves mouse to next point in the cycle."""
    x, y = next(point_cycler)
    event = MouseEvent('motion_notify_event', fig.canvas, x, y)
    fig.canvas.callbacks.process('motion_notify_event', event)
    fig.canvas.flush_events()

def get_cycler(ax):
    """Cycle the cursor position through a handful of points to ensure real movement."""
    bbox = ax.bbox
    POINTS = [
        (bbox.x0 + 10, bbox.y0 + 10),                                        # Bottom-left
        (bbox.x0 * 0.5 + bbox.x1 * 0.5, bbox.y0 * 0.5 + bbox.y1 * 0.5),   # Center
        (bbox.x1 - 10, bbox.y1 - 10)                                         # Top-right
    ]
    return itertools.cycle(POINTS)

@pytest.fixture
def no_layer_setup(plot_data):
    x, y = plot_data
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.scatter(x, y, alpha=0.5, color='blue')
    cursor = Cursor(ax, color='red', linewidth=1)

    fig.canvas.draw()
    fig.canvas.flush_events()

    yield fig, get_cycler(ax)
    plt.close(fig)


@pytest.fixture
def layers_setup(plot_data):
    x, y = plot_data
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.scatter(x, y, alpha=0.5, color='blue')

    cursor = Cursor(ax, color='red', linewidth=1)

    # Hack the normal cursor to put its lines into the new overlay layer!
    cursor.lineh.remove()
    cursor.linev.remove()
    fig.add_artist(cursor.lineh, layer="overlay")
    fig.add_artist(cursor.linev, layer="overlay")

    fig.canvas.draw()
    fig.canvas.flush_events()

    yield fig, get_cycler(ax)
    plt.close(fig)

def test_no_layer(benchmark, no_layer_setup):
    fig, point_cycler = no_layer_setup
    benchmark.group = "cursor_perf"
    benchmark(simulate_single_mouse_move, fig, point_cycler)

def test_layers(benchmark, layers_setup):
    fig, point_cycler = layers_setup
    benchmark.group = "cursor_perf"
    benchmark(simulate_single_mouse_move, fig, point_cycler)
```

### How the Benchmark Works

1. **The Setup (`layers_setup` & `no_layer_setup`)**: Pytest fixtures are used to generate two datasets (10 points and 100,000 points). For the layer test, the cursor lines are specifically removed from the base `Axes` and injected into the figure's `"overlay"` layer.
2. **The Mouse Simulator (`get_cycler`)**: Since a physical mouse cannot be manually moved during an automated test, an infinite loop of 3 pixel coordinates spread across the plot bounds is generated.
3. **The Measurement (`simulate_single_mouse_move`)**: `pytest-benchmark` runs this function. In each iteration, it grabs the next coordinate, fires a synthetic `MouseEvent`, and forces the canvas to render. This perfectly simulates a user rapidly sweeping a mouse across the graph.

---

## 2. Conclusion

![Benchmark Results]({{ '/assets/images/image1.png' | relative_url }})


Key takeaways from the benchmark results:
* In the layer approach, there is not much difference between the small and large rendering times (it only increases from 2.93 ms to 3.03 ms).
* In the no-layer approach, the time jumps significantly from 32.4 ms to 392.96 ms.
* For rendering the cursor in a heavy plot, the time difference between the no-layer and layer approaches is 392.96 ms - 3.03 ms.

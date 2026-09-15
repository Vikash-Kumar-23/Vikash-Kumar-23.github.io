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

def simulate_single_mouse_move(fig, point_cycler):
    """Simulate a mouse move event"""
    x, y = next(point_cycler)
    event = MouseEvent('motion_notify_event', fig.canvas, x, y)
    fig.canvas.callbacks.process('motion_notify_event', event)
    fig.canvas.flush_events()

def get_cycler(ax):
    """Return a cycle of mouse positions within the Axes"""
    bbox = ax.bbox
    points = [
        (bbox.x0 + 10, bbox.y0 + 10),
        (bbox.x0 * 0.5 + bbox.x1 * 0.5,bbox.y0 * 0.5 + bbox.y1 * 0.5),
        (bbox.x1 - 10, bbox.y1 - 10)
    ]
    return itertools.cycle(points)

@pytest.fixture
def no_layer_setup(plot_data):
    x, y = plot_data
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.scatter(x, y, alpha=0.5, color='blue')
    cursor = Cursor(ax, color='red', linewidth=1)

    plt.show(block=False)
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

    # Move cursor lines to the overlay layer
    cursor.lineh.remove()
    cursor.linev.remove()
    fig.add_artist(cursor.lineh, layer="overlay")
    fig.add_artist(cursor.linev, layer="overlay")

    plt.show(block=False)
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

![Benchmark Results - Dataset1]({{ '/assets/images/image4.png' | relative_url }})


Key takeaways from the benchmark results:
* In the layer approach, there is not much difference between the small and large rendering times.
* In the no-layer approach, the time jumps significantly.
* For rendering the cursor in a heavy plot, the time difference between the no-layer and layer approaches is very large.


---

## 3. Resize Benchmark Source Code

Here is the benchmark script used to measure figure resize performance:

```python
import matplotlib
matplotlib.use("QtAgg")

import matplotlib.pyplot as plt
import numpy as np
import pytest
from matplotlib.text import Text
from matplotlib.lines import Line2D


@pytest.fixture(params=[10, 100000], ids=["small", "large"])
def n_points(request):
    return request.param


@pytest.fixture
def plot_data(n_points):
    x = np.random.normal(5, 2, n_points)
    y = np.random.normal(5, 2, n_points)
    return x, y


@pytest.fixture
def no_layer_setup(plot_data):
    x, y = plot_data

    fig, ax = plt.subplots(figsize=(8, 6))
    ax.scatter(x, y, alpha=0.5, color="blue")
    title = Text(0.5, 0.95, "Resize benchmark", ha="center", transform=fig.transFigure)
    fig.add_artist(title)

    plt.show(block=False)
    fig.canvas.draw()
    fig.canvas.flush_events()

    yield fig

    plt.close(fig)


@pytest.fixture
def layers_setup(plot_data):
    x, y = plot_data

    fig, ax = plt.subplots(figsize=(8, 6))
    ax.scatter(x, y, alpha=0.5, color="blue")

    title = Text(0.5, 0.95, "Resize benchmark", ha="center", transform=fig.transFigure)
    fig.add_artist(title, layer="overlay")

    plt.show(block=False)
    fig.canvas.draw()
    fig.canvas.flush_events()

    yield fig

    plt.close(fig)


def resize_figure(fig):
    width, height = fig.get_size_inches()

    if width == 8:
        fig.set_size_inches(10, 8)
    else:
        fig.set_size_inches(8, 6)

    fig.canvas.draw()
    fig.canvas.flush_events()


def test_resize_no_layer(benchmark, no_layer_setup):
    fig = no_layer_setup
    benchmark.group = "resize_perf"
    benchmark(resize_figure, fig)


def test_resize_layers(benchmark, layers_setup):
    fig = layers_setup
    benchmark.group = "resize_perf"
    benchmark(resize_figure, fig)
```

---

## 4. Conclusion

![Resize Benchmark Results]({{ '/assets/images/image3.png' | relative_url }})

![Resize Benchmark Results]({{ '/assets/images/image6.png' | relative_url }})
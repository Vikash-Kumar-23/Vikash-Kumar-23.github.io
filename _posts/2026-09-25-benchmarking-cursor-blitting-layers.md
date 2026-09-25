---
layout: post
title: "Benchmarking Cursor: Blitting vs Layered Architecture"
date: 2026-09-25 10:00:00 +0530
categories: matplotlib benchmarking performance
---

# Benchmarking Matplotlib Interactive Cursor Performance

Plotting large datasets in Matplotlib, such as 100,000 scatter points, often causes interactive widgets like `Cursor` to lag. Because the whole figure is redrawn on every mouse movement, the frame rate drops significantly.

Matplotlib has solved this using **blitting**—saving the heavy background plot to a pixel buffer, and rapidly copying those pixels back to the screen before drawing the lightweight cursor lines on top.

However, the new **Layered Architecture** introduces an alternative. Instead of manually copying pixel buffers, we can assign the cursor artists to a dedicated `"overlay"` layer. The backend then caches each layer into its own buffer and composites them automatically.

In this post, we benchmark these approaches head-to-head.

## Our Goal

Our goal is to quantitatively measure the performance difference between:
1. **No Layers / No Blitting**: Redrawing everything from scratch on every mouse move.
2. **Blitting**: Using the `useblit=True` mechanism.
3. **Layered Architecture**: Manually moving the cursor artists into a separate `"overlay"` layer so the backend composites it using multi-pass caching.

We wrote a comprehensive test using `pytest-benchmark` to simulate mouse movements over a plot with 100,000 points.

## The Benchmark Code

Below is the complete benchmark suite used to test these scenarios:

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
    
    # Cursor without useblit and without layers
    cursor = Cursor(ax, color='red', useblit=False)

    plt.show(block=False)
    fig.canvas.draw()
    fig.canvas.flush_events()

    yield fig, get_cycler(ax)
    plt.close(fig)


@pytest.fixture
def blit_setup(plot_data):
    x, y = plot_data
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.scatter(x, y, alpha=0.5, color='blue')

    # Cursor with blitting
    cursor = Cursor(ax, color='red', useblit=True)

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


    cursor = Cursor(ax, color='red', useblit=False)

    # Manually move cursor lines to the overlay layer
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

def test_classic_blitting(benchmark, blit_setup):
    fig, point_cycler = blit_setup
    benchmark.group = "cursor_perf"
    benchmark(simulate_single_mouse_move, fig, point_cycler)

def test_layers(benchmark, layers_setup):
    fig, point_cycler = layers_setup
    benchmark.group = "cursor_perf"
    benchmark(simulate_single_mouse_move, fig, point_cycler)
```

## How It Works

By separating the tests into distinct fixtures, we can see exactly what happens under the hood:

* **test_no_layer**: Redraws the entire figure tree. As the number of scatter points increases, this slows down linearly.
* **test_classic_blitting**: uses blitting.
* **test_layers**: To fairly compare the performance of the new layer system VS blitting, we are running this code on a branch where the internal `useblit` behavior of the `Cursor` widget has NOT been modified. This ensures the blitting implementation still works exactly as it always has. Therefore, to test the layered architecture, we create a standard cursor and manually extract its artists into the overlay layer using:

  ```python
  cursor = Cursor(ax, color='red')

  # Move cursor lines to the overlay layer
  cursor.lineh.remove()
  cursor.linev.remove()
  fig.add_artist(cursor.lineh, layer="overlay")
  fig.add_artist(cursor.linev, layer="overlay")
  ```


## Conclusion

![Benchmark Results - Dataset1]({{ '/assets/images/image99.png' | relative_url }})

Based on the benchmark results, we can see a few clear takeaways:

* **Blitting is the fastest approach** across both small and large datasets.
* **Dataset size barely affects blitting**: The time it takes to blit over a small batch versus a large batch is almost identical.
* **The layered architecture is also very stable**: Just like blitting, the layered approach takes about the same amount of time regardless of how many points it's drawing over.
* **Standard redrawing (no layers) is by far the slowest.** It's already slower on small batches, but the performance really drops off on large ones. For the large dataset, standard redrawing is about **34.5x slower** than blitting, and **23.2x slower** than using layers.
---
layout: post
title: "Comparing Existing Rendering Approach vs New Layer System"
date: 2026-09-15 14:00:00 +0530
categories: matplotlib benchmarking performance gsoc
tags: [matplotlib, python, benchmarking, overlay-manager, gsoc, rendering]
---

### Benchmark

Two benchmarks were used to compare the existing rendering approach with the layer system.

**1. Cursor movement**

A scatter plot with 100,000 points is used, with 50 simulated mouse movements.

* **Without layers:** moving the cursor can cause the entire figure to be redrawn.
* **With `layer="overlay"`:** the cursor is rendered separately while the base plot can be reused.

The total time for 50 cursor updates is measured and converted into updates per second.

**2. Figure resize**

A second test uses 100,000 points and repeatedly resizes the figure between `8×6` and `10×8`, followed by `canvas.draw()`.

This represents a full redraw case, where the cached layers need to be rendered again.

Both benchmarks use the **QtAgg backend** and `time.perf_counter()` for timing. Initial rendering is performed before the timer starts so that setup time does not affect the results.

### 1. Cursor Movement Benchmark Code

```python
import time
import numpy as np
import matplotlib
# QtAgg
matplotlib.use('QtAgg')
import matplotlib.pyplot as plt
from matplotlib.backend_bases import MouseEvent
from matplotlib.widgets import Cursor

NUM_FRAMES = 50

def generate_data():
    x = np.random.normal(5, 2, 100000)
    y = np.random.normal(5, 2, 100000)
    return x, y

def simulate_mouse_moves(fig, ax):
    # Simulate the mouse moving diagonally across the plot in pixel coordinates
    bbox = ax.bbox
    xs = np.linspace(bbox.x0 + 10, bbox.x1 - 10, NUM_FRAMES)
    ys = np.linspace(bbox.y0 + 10, bbox.y1 - 10, NUM_FRAMES)
    
    start_time = time.perf_counter()
    
    for x, y in zip(xs, ys):
        event = MouseEvent('motion_notify_event', fig.canvas, x, y)
        fig.canvas.callbacks.process('motion_notify_event', event)
        fig.canvas.flush_events() 
        
    end_time = time.perf_counter()
    
    duration = end_time - start_time
    fps = NUM_FRAMES / duration
    return fps

def test_no_layer(x, y):
    print("Testing 1/2: No Layer (Redrawing everything)...")
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.scatter(x, y, alpha=0.5, color='blue')
    
    cursor = Cursor(ax, color='red', linewidth=1)
    
    plt.show(block=False)
    fig.canvas.draw()
    fig.canvas.flush_events()
    
    fps = simulate_mouse_moves(fig, ax)
    plt.close(fig)
    return fps

def test_layers(x, y):
    print("Testing 2/2: New Layer System (layer='overlay')...")
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.scatter(x, y,alpha=0.5, color='blue')
    
    cursor = Cursor(ax, color="red", linewidth=1)

    cursor.lineh.remove()
    cursor.linev.remove()

    fig.add_artist(cursor.lineh, layer="overlay")
    fig.add_artist(cursor.linev, layer="overlay")
    
    plt.show(block=False)
    fig.canvas.draw()
    fig.canvas.flush_events()
    
    fps = simulate_mouse_moves(fig, ax)
    plt.close(fig)
    return fps

print("=== Generating Heavy Data ===")
x, y = generate_data()
    

fps_none = test_no_layer(x, y)
print(f"-> Finished at {fps_none:.2f} FPS\n")

fps_layer = test_layers(x, y)
print(f"-> Finished at {fps_layer:.2f} FPS\n")
    
print("=======================================")
print("           FINAL RESULTS               ")
print("=======================================")
print(f"No Layer           : {fps_none:6.2f} FPS")
print(f"New Layer System   : {fps_layer:6.2f} FPS")
print("=======================================")
```

![Output]({{ '/assets/images/i1.png' | relative_url }})

### 2. Figure Resize Benchmark Code

```python
import time

import matplotlib
matplotlib.use("QtAgg")

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.text import Text


NUM_RESIZES = 50


def generate_data(n_points):
    x = np.random.normal(5, 2, n_points)
    y = np.random.normal(5, 2, n_points)
    return x, y


def resize_figure(fig):
    width, height = fig.get_size_inches()

    if width == 8:
        fig.set_size_inches(10, 8)
    else:
        fig.set_size_inches(8, 6)

    fig.canvas.draw()
    fig.canvas.flush_events()


def benchmark_resize(fig):
    start_time = time.perf_counter()

    for _ in range(NUM_RESIZES):
        resize_figure(fig)

    duration = time.perf_counter() - start_time

    avg_time = duration / NUM_RESIZES
    redraws_per_second = NUM_RESIZES / duration

    return avg_time, redraws_per_second


def test_no_layer(x, y):
    print("Testing 1/2: No Layer...")

    fig, ax = plt.subplots(figsize=(8, 6))

    ax.scatter(
        x,
        y,
        alpha=0.5,
        color="blue",
    )

    title = Text(
        0.5,
        0.95,
        "Resize benchmark",
        ha="center",
        transform=fig.transFigure,
    )

    fig.add_artist(title)

    plt.show(block=False)

    fig.canvas.draw()
    fig.canvas.flush_events()

    avg_time, redraws_per_second = benchmark_resize(fig)

    plt.close(fig)

    return avg_time, redraws_per_second


def test_layers(x, y):
    print("Testing 2/2: Overlay Layer...")

    fig, ax = plt.subplots(figsize=(8, 6))

    ax.scatter(
        x,
        y,
        alpha=0.5,
        color="blue",
    )

    title = Text(
        0.5,
        0.95,
        "Resize benchmark",
        ha="center",
        transform=fig.transFigure,
    )

    fig.add_artist(title, layer="overlay")

    plt.show(block=False)

    fig.canvas.draw()
    fig.canvas.flush_events()

    avg_time, redraws_per_second = benchmark_resize(fig)

    plt.close(fig)

    return avg_time, redraws_per_second



print("=== Generating Data ===")
x, y = generate_data(100000)

no_layer = test_no_layer(x, y)
layer = test_layers(x, y)

print("\n=== Results ===")
print(f"No Layer      : {no_layer[0] * 1000:.2f} ms/redraw ({no_layer[1]:.2f} redraws/s)")
print(f"Overlay Layer : {layer[0] * 1000:.2f} ms/redraw ({layer[1]:.2f} redraws/s)")
```

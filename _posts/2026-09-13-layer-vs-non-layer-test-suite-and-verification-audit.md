---
layout: post
title: "Layer vs. Non-Layer Test Suite & Overlay Verification Audit"
date: 2026-09-13 11:00:00 +0530
categories: matplotlib testing architecture gsoc
tags: [matplotlib, python, unit-testing, overlay-manager, gsoc, rendering]

---

## 1. Non-Layer Test Code

```python
import matplotlib
matplotlib.use('QtAgg')
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.widgets import Cursor

# Generate a heavy scatter plot with a large number of points
x = np.random.normal(5, 2, 1000000)
y = np.random.normal(5, 2, 1000000)

fig, ax = plt.subplots(figsize=(10, 6))
ax.scatter(x, y, alpha=0.1, color='blue')

cursor = Cursor(ax, color='red')

plt.show()
```

### What Happens Under the Hood in Non-Layer Mode:
1. **Initial Draw**: Matplotlib renders the 1,000,000 points and the cursor in a single pass.
2. **Mouse Motion**: Moving the mouse triggers the `Cursor` widget to update its position, setting `stale = True`.
3. **Stale Bubble-Up**: The `stale` state bubbles up to the parent `Figure`.
4. **Full Scene Redraw**: `Figure.draw()` forces a **complete re-render of all 1,000,000 scatter points** on every single mouse event pixel movement.
5. **Result**: Severe UI lag, frame drops, and sluggish cursor responsiveness.

---

### Screen recording of Non-Layer Test Code:

<video controls autoplay muted loop playsinline preload="metadata" width="100%">
  <source src="{{ '/assets/video/Figure_1.mp4?v=4' | relative_url }}" type="video/mp4">
  Your browser does not support the video tag.
</video>

---

## 2. Layer Test Code

Under the **Layer Architecture**, we move the interactive cursor lines from the standard `Axes` tree directly to the figure's dedicated `"overlay"` layer.

```python
import matplotlib
matplotlib.use('QtAgg')
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.widgets import Cursor

# Generate a heavy scatter plot with a large number of points
x = np.random.normal(5, 2, 1000000)
y = np.random.normal(5, 2, 1000000)

fig, ax = plt.subplots(figsize=(10, 6))
ax.scatter(x, y, alpha=0.1, color='blue')

# Create a normal cross-over cursor
cursor = Cursor(ax, color='red')

# First, we remove them from the standard Axes
cursor.lineh.remove()
cursor.linev.remove()

# Then, we add them directly to the figure's "overlay" layer
fig.add_artist(cursor.lineh, layer="overlay")
fig.add_artist(cursor.linev, layer="overlay")

plt.show()
```

### What Happens Under the Hood in Layer Mode:
**Separation of Layers**:
   - The 1,000,000 scatter points remain in the **Base Layer** (`"base"`).
   - The horizontal and vertical lines (`cursor.lineh`, `cursor.linev`) are added to `overlay layer` by `fig.add_artist(..., layer="overlay")`.

---

### Screen recording of Layer Test Code:
<video controls autoplay muted loop playsinline preload="metadata" width="100%">
  <source src="{{ '/assets/video/Figure_2.mp4?v=4' | relative_url }}" type="video/mp4">
  Your browser does not support the video tag.
</video>


## Conclusion

The layered implementation achieves a higher frame rate (FPS) than the non-layered one. This is because the layered approach only redraws the cursor during movement, whereas the non-layered approach must redraw all 1,000,000 scatter points every time the user moves the cursor.


## 3. Layer Test Code with blitting = True

Setting `useblit=True` improves performance by caching the static background (the scatter points) as an image. When the cursor moves, Matplotlib simply restores this background and redraws only the cursor lines, avoiding the heavy cost of re-rendering all 1,000,000 data points on every movement.

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

cursor = Cursor(ax, color='red', useblit=True)

plt.show()
```

### Screen recording of Non-Layer Test Code with blitting = True:
<video controls autoplay muted loop playsinline preload="metadata" width="100%">
  <source src="{{ '/assets/video/Figure_3.mp4?v=4' | relative_url }}" type="video/mp4">
  Your browser does not support the video tag.
</video>
---
layout: post
title: "Native Overlay Support Across Matplotlib Backends"
date: 2026-07-02 12:00:00 +0530
categories: gsoc matplotlib
---


### Backend Support Breakdown

| Backend | Native Layer API | Can composite without full redraw? |
|---------|-----------------|-----------------------------------|
| QtAgg | `QPainter` + `QImage` | ✅ Yes |
| GTKAgg | Cairo `ImageSurface` | ✅ Yes |
| macOS | CoreGraphics (C/ObjC) | ⚠️ Needs C-level changes |
| TkAgg | `tk.PhotoImage` | ⚠️ Widget stacking limitations |

*   **QtAgg** provides the **`QPainter` + `QImage`** API for layers. 
    * *What it does:* In `backend_qtagg.py`, the Agg pixel buffer gets converted to a `QImage` and drawn via `QPainter.drawImage()` inside `paintEvent()`. Interestingly, there's already an overlay-like pattern in the codebase — the `_draw_rect_callback` draws the zoom rubberband rectangle on top of the Agg buffer using the same `QPainter` instance!
    * *How I am thinking of using it for the overlay project:* I think we can follow that exact same pattern: render our overlay artists onto a second transparent `QImage` and draw it. Qt's default `CompositionMode_SourceOver` handles alpha blending natively, so this should work perfectly.
*   **GTKAgg** provides the **`Cairo` surface** API for layers. 
    * *What it does:* GTK 3/4 uses `on_draw_event(self, widget, ctx)` to handle drawing. It simply takes the main Agg pixel buffer, turns it into a `cairo.ImageSurface`, and paints it onto the screen using Cairo.
    * *How I am thinking of using it for the overlay project:* My plan is to create a second transparent `ImageSurface` for the overlay artists and paint it on top using the same Cairo context. The default Cairo operator does source-over alpha blending automatically, which makes this straightforward.
*   **macOS (Cocoa)** provides the **`CoreGraphics` / Quartz** API for layers. 
    * *What it does:* The actual pixel drawing happens entirely in C/Objective-C code inside `_macosx.m`.
    * *How I am thinking of using it for the overlay project:* To be honest, since the compositing lives down in the C extension, I am not entirely sure yet how to cleanly inject a Python-side overlay layer here. I will need to investigate this backend a lot more to figure out a good approach.
*   **TkAgg** uses a single **`tk.PhotoImage`** on a Canvas. 
    * *What it does:* The backend pushes the Agg RGBA buffer directly into a single `tk.PhotoImage`. Tk actually *does* support native pixel-wise alpha compositing at the C-level (`TK_PHOTO_COMPOSITE_OVERLAY`), and Matplotlib already uses this for partial blits!
    * *How I am thinking of using it for the overlay project:* Tkinter's high-level widget model is tricky here. There is no easy way to keep two independently-alpha-composited raster layers as separate live widgets (e.g., stacking a transparent canvas on top of another). Because of this, I'm still figuring out how to apply the dual-buffer concept here.

### What About Static APIs (PDF, SVG, PNG)?

When exporting to static formats via `savefig()` (using backends like `pdf`, `svg`, or `Agg`), there is no concept of a "hardware compositing event loop." The image just needs to be flattened into a single document. 

Because we add our overlay artists directly to the `Axes` (e.g., `ax.add_artist(..., animated=True)`), Matplotlib's core actually handles this automatically! 

When `savefig` runs, the `FigureCanvasBase` sets a special context manager (`is_saving = True`). During the rendering loop, `Axes.draw()` explicitly checks this flag (`if not canvas.is_saving(): hide_animated_artists()`). Because we are saving, the filter is bypassed, and the static APIs will naturally draw the animated overlay artists right into the final flattened image without any special code required on our end.

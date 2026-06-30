---
layout: post
title: "Phase 1: Architecting the Matplotlib Overlay System"
date: 2026-06-29 12:00:00 +0530
categories: gsoc matplotlib
---


### 1. Decoupling from Blitting

Kyle Sunden (mentor) provided important advice: *"Overlays, while similar, are not the same as blitting, and should not replace blitting."*

To ensure this, the new `OverlayManager` is an independent, opt-in layer. It does not use `_blit_backgrounds` or `supports_blit`. If a user has a widget that relies on standard blitting, it remains entirely unaffected. The overlay system acts as an alternative for GUI backends that support native compositing.

### 2. Overview of Phase 1 Code Changes

Before diving into the architecture, here is a high-level summary of the codebase modifications implemented during this phase:
*   **`backend_bases.py`**: Introduced the `OverlayManager` class to act as an independent registry for overlay artists, managing Z-order and garbage collection.
*   **`backend_bases.py (FigureCanvasBase)`**: Initialized the `_overlay_manager` on the base canvas and introduced the `supports_overlay = False` capability flag.
*   **`figure.py (Figure.clear)`**: Added a cleanup hook to automatically call `canvas._overlay_manager.clear()` whenever `plt.clf()` is invoked, ensuring no stale references persist when a figure is wiped.

### 3. Phase 1 Architecture Overview

I decided to put all the core logic into `backend_bases.py`. By doing this, I basically created a universal "brain" for the overlay system. Now, any GUI backend (like Qt, GTK, or MacOSX) can just plug into it and support native overlays without having to rewrite any complicated state-management code. 

* **The Central Registry:** The `OverlayManager` acts as the single source of truth. If an artist is in the overlay, the manager knows about it.
* **Independent Z-Order:** Since overlays don't mix with the base graph, the manager sorts its own artists dynamically. This gives the overlay layer its own independent Z-order queue.
* **Capability Flags:** I added a simple `supports_overlay` flag to the canvas. This lets the manager instantly know if the current backend can draw native overlays, or if it needs to fall back to the standard drawing method.

<div style="margin: 2rem 0 0.5rem 0; width: 100%; max-width: 100%; overflow-x: auto; border: 1px solid #ccc; border-radius: 8px;">
  <a href="/assets/images/overlay_architecture.png" target="_blank" style="display: inline-block;">
    <img src="/assets/images/overlay_architecture.png" alt="OverlayManager Architecture Diagram" style="width: auto; max-width: none; max-height: 75vh; display: block; margin: 0; border-radius: 8px;">
  </a>
</div>
<p style="text-align: center; font-size: 0.85em; color: #888; margin-bottom: 2rem;"><em>Scroll horizontally, or click to open in full resolution</em></p>


### 4. Backend Fallback Mechanism

Another consideration was how to handle scripts running on backends that do not support native overlays yet (like `TkAgg`). 

To manage this, I added a capability flag on the canvas: `FigureCanvasBase.supports_overlay = False`.

When an artist is registered via `overlay.add_artist(line)`, the manager checks this flag:
*   **On Fallback Backends (Phase 1):** If `supports_overlay` is False, it sets `animated=False`. This routes the drawing back to the standard `draw_idle()` layout engine, ensuring the crosshair remains visible.
*   **On Native Backends (Phase 2):** If `supports_overlay` is True, it sets `animated=True`. This prevents Matplotlib from drawing the artist during the standard background pass, leaving the rendering entirely to the native GUI backend.

### 5. Preventing Memory Leaks and Stale References

A challenge in maintaining a separate registry for overlay artists is keeping it synchronized with the main `Axes` tree. If a user removes a crosshair from their plot, but the `OverlayManager` still holds a reference to it, the backend will continue to draw the deleted artist, resulting in memory leaks and incorrect rendering.

Instead of trying to explicitly sync list states across the codebase, I implemented a dynamic cleanup mechanism using Python's `weakref` module. 

Before the backend draws the overlay layer, the manager verifies that every artist still exists in memory and remains attached to an Axes:


This ensures that deleted artists are safely ignored and dropped from the overlay list without requiring explicit removal by the user.

### 6. Phase 1 Rendering Pipeline

Because native GUI bindings have not been implemented yet, Phase 1 relies entirely on fallback mode. The flowchart below illustrates how the new `OverlayManager` successfully catches the interactive events, but is ultimately forced to route the drawing back through the heavy, standard Matplotlib pipeline.

{% include image.html url="/assets/images/phase1_flowchart.png" alt="Phase 1 Rendering Pipeline Flowchart" width="min(100%, 300px)" %}

This visualization clearly demonstrates the performance bottleneck we are currently facing. Because `draw_idle()` schedules a full `Figure.draw()`, every time the user moves their mouse, the entire layout engine recalculates the entire plot. 


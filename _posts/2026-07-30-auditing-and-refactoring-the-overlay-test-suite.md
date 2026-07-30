---
layout: post
title: "Auditing & Refactoring of Test Suite"
date: 2026-07-30
categories: [matplotlib, testing, architecture]
tags: [matplotlib, python, unit-testing, overlay-manager, gsoc]
---

## test_backend_bases.py

| # | Test Name | What It Tests | Refactoring Action |
| :--- | :--- | :--- | :--- |
| **1** | `test_overlay_setup_and_api` | Verifies that canvas has `_overlay_manager` and `in_overlay` is False by default. | **Merge Test 1 and 3 together**  |
| **2** | `test_overlay_artist_included_in_save` | Verifies `fig.savefig()` export includes overlay artists. | |
| **3** | `test_overlay_fallback_stale_propagates` | Verifies fallback stale propagation when `supports_overlay = False`. | **Merge Test 1 and 3 together**  |
| **4** | `test_animated_and_overlay_independence` | Verifies `animated=True` precedence over `in_overlay`. |  |
| **5** | `test_overlay_batches_multiple_updates` | Intended to test update batching, but property updates occur outside the `patch` block, and calls `draw_overlay()` inside `patch` which calls `draw_idle()` and passes without proving batching. | **Remove test case** |
| **6** | `test_overlay_draw_filtering_and_stale` | `supports_overlay` is set to `True`, but as `FigureCanvasBase` does not natively support overlay, it falls back to `draw_idle()` and skips drawing the overlay artist. | **Remove test case** *(Redundant; tests the same fallback behavior as Test 7)* |
| **7** | `test_draw_overlay_draws_only_overlay_artists` | `draw_overlay()` should render only overlay artists, but on fallback it triggers `draw_idle()`. |  |

---

## test_backend_qt.py

| # | Test Name | What It Tests | Refactoring Action |
| :--- | :--- | :--- | :--- |
| **1** | `test_qt_canvas_supports_overlay` | Verifies that Qt canvas supports overlay (`supports_overlay = True`). | **Merge Test 1 and 2 together** |
| **2** | `test_qt_draw_overlay_draws_only_overlay_artists` | Verifies that `draw_overlay()` draws only overlay lines and skips normal lines. | **Merge Test 1 and 2 together** |
| **3** | `test_qt_draw_overlay_clears_stale` | Verifies that updating an overlay artist marks it stale, and calling `draw_overlay()` clears the stale flag. | **Merge Test 3, 4, and 7 together** |
| **4** | `test_qt_draw_overlay_clears_on_removal` | Verifies that removing an artist from overlay deletes the overlay image buffer from memory. | **Merge Test 3, 4, and 7 together** |
| **5** | `test_qt_overlay_included_in_save` | Verifies that `savefig()` includes overlay lines in the saved file. | |
| **6** | `test_qt_animated_precedence` | Verifies that `animated=True` takes precedence over `in_overlay=True`. | |
| **7** | `test_qt_overlay_multiple_updates` | Shows that updating multiple properties calls `draw_overlay()` multiple times, so `draw_overlay_idle()` is required for batching. | **Merge Test 3, 4, and 7 together** |
| **8** | `test_qt_overlay_layer_isolation_image_comparison` | Visual test:  Mocks draw_overlay() and save only the artist present in the base layer | adding count call to draw_overlay to count number of times it gets calls| 
| **9** | `test_qt_overlay_full_render_image_comparison` | Visual test: saved image shows both normal and overlay lines. | **Removing the test case** |
| **10** | `test_qt_overlay_buffer_image_comparison` | Visual test: Loops through all child artists to mock non-overlay artists so only overlay lines are drawn. | Layer isolation is required so base layer and overlay layer can be drawn independently |
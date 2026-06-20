---
layout: default
title: Vikash Kumar - GSoC 2026 @ Matplotlib
---

<div class="hero">
  <div class="container">
    <h1 class="hero-title">Vikash Kumar</h1>
    <h2 class="hero-subtitle">Google Summer of Code 2026 @ Matplotlib</h2>
    <p class="hero-desc">Building the Overlay Layer API for Matplotlib to enable fast, responsive interactive tools without requiring full figure redraws.</p>
    <div class="hero-buttons">
      <a href="#updates" class="btn">View Blog</a>
      <a href="https://github.com/matplotlib/matplotlib" class="btn btn-outline">GitHub Repository</a>
      <a href="https://github.com/matplotlib/matplotlib/issues/30515" class="btn btn-outline">Issue #30515</a>
    </div>
  </div>
</div>

<div class="container">

  <section id="overview">
    <h2>Project Overview</h2>
    <p>The <strong>Overlay Layer API</strong> aims to improve the performance and responsiveness of interactive tools within Matplotlib. Currently, interactive tools such as crosshair cursors are drawn as part of the normal Matplotlib figure rendering pipeline. Because of this architectural design, every subtle mouse movement can trigger expensive figure redraws, which often causes noticeable visual lag and poor responsiveness for users attempting data exploration.</p>
    <p>To solve this limitation, this project introduces a backend-aware Overlay Layer API that allows interactive elements to be rendered independently from the main figure. By decoupling the overlay from the core canvas, we can paint and update dynamic UI elements without forcing the entire plot to re-render.</p>
    <p>This work fundamentally alters how interactivity scales, ensuring that interactive tool performance remains high regardless of how complex the underlying plot data may be.</p>
  </section>

  <section id="info">
    <h2>Project Information</h2>
    <div class="card-grid">
      <div class="card">
        <h3>Organization</h3>
        <p>NumFOCUS</p>
      </div>
      <div class="card">
        <h3>Project</h3>
        <p>Overlay Layer API for Matplotlib</p>
      </div>
      <div class="card">
        <h3>Mentors</h3>
        <ul>
          <li>Hannah Aizenman</li>
          <li>Elliott Sales de Andrade</li>
          <li>Kyle Sunden</li>
        </ul>
      </div>
    </div>
  </section>


  <section id="updates">
    <h2>Recent Updates</h2>
    <div class="card-grid">
      {% for post in site.posts %}
      <div class="card">
        <h3>{{ post.title }}</h3>
        <p>{{ post.excerpt | strip_html | truncate: 150 }}</p>
        <a href="{{ post.url | relative_url }}" class="btn">Read More</a>
      </div>
      {% else %}
      <p>No blog posts found yet.</p>
      {% endfor %}
    </div>
  </section>

  <section id="about">
    <h2>About</h2>
    <div class="card">
    </div>
  </section>

</div>

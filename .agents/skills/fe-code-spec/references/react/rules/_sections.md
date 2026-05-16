# Sections

This file defines React rule sections, their ordering, impact levels, and filename prefixes.

---

## 1. Eliminating Waterfalls (async)

**Impact:** CRITICAL  
**Description:** Sequential awaits add full round-trip latency. Start independent work early and await only when a branch needs the result.

## 2. Bundle Size Optimization (bundle)

**Impact:** CRITICAL  
**Description:** Smaller initial bundles improve first load, interaction readiness, and development feedback loops.

## 3. Server Rendering and Endpoint Performance (server)

**Impact:** HIGH  
**Description:** Server rendering, HTTP handlers, and server-to-client boundaries need parallel data fetching, bounded caching, safe request state, and small serialized payloads.

## 4. Client-Side Data Fetching (client)

**Impact:** MEDIUM-HIGH  
**Description:** Query cache reuse, deduplication, and efficient subscriptions reduce redundant network and browser work.

## 5. Re-render Optimization (rerender)

**Impact:** MEDIUM  
**Description:** Avoiding unnecessary renders prevents wasted computation and keeps input, scroll, and animation responsive.

## 6. Rendering Performance (rendering)

**Impact:** MEDIUM  
**Description:** Browser rendering optimizations reduce layout, paint, hydration, and resource-loading cost.

## 7. JavaScript Performance (js)

**Impact:** LOW-MEDIUM  
**Description:** Hot-path JavaScript optimizations matter when they remove repeated work from render, loops, or interaction paths.

## 8. Advanced Patterns (advanced)

**Impact:** LOW  
**Description:** Specialized React patterns for stable callbacks, one-time initialization, and advanced effects.

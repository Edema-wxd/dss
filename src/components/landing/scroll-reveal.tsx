"use client";

import { useEffect } from "react";

/**
 * Arms every `.reveal` / `.reveal-pop` element on the page: each rises (or
 * pops) in the first time it scrolls into view, staggered against such
 * siblings in the same parent.
 * Without JS (or with reduced motion) nothing is hidden.
 */
export function ScrollReveal() {
  // Arriving at "/#apply" from another page: the browser's own jump can run
  // before the section exists, so go there once the page has rendered.
  useEffect(() => {
    const target = window.location.hash && document.getElementById(window.location.hash.slice(1));
    if (target && Math.abs(target.getBoundingClientRect().top) > 4) {
      setTimeout(() => target.scrollIntoView({ block: "start", behavior: "instant" }), 0);
    }
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const items = Array.from(document.querySelectorAll<HTMLElement>(".reveal, .reveal-pop"));
    for (const el of items) {
      const siblings = Array.from(el.parentElement?.children ?? []).filter(
        (c) => c.classList.contains("reveal") || c.classList.contains("reveal-pop"),
      );
      const i = siblings.indexOf(el);
      // data-reveal-base holds a group back, e.g. list items waiting for their card
      const base = Number(el.dataset.revealBase ?? 0);
      if ((i > 0 || base) && !el.style.getPropertyValue("--reveal-delay")) {
        el.style.setProperty("--reveal-delay", `${base + Math.min(i, 6) * 90}ms`);
      }
      // anything already on screen at load stays put
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("is-revealed");
    }
    document.documentElement.classList.add("reveal-ready");

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-revealed");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    for (const el of items) if (!el.classList.contains("is-revealed")) io.observe(el);

    return () => {
      io.disconnect();
      document.documentElement.classList.remove("reveal-ready");
    };
  }, []);

  return null;
}

"use client";

import { useEffect, useState } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import { ChunkyArrow } from "./primitives";

/**
 * shadcn Carousel with the design's chunky arrow controls underneath.
 * From `lg` up the slides sit side by side in `gridClassName` instead.
 * `entrance` picks how slides arrive on scroll: rise (default) or a staggered pop.
 */
export function CardCarousel({
  label,
  slides,
  arrowTone = "text-white",
  gridClassName,
  entrance = "reveal",
}: {
  label: string;
  slides: React.ReactNode[];
  arrowTone?: string;
  gridClassName?: string;
  entrance?: "reveal" | "reveal-pop";
}) {
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!api) return;
    const sync = () => setIndex(api.selectedScrollSnap());
    sync();
    api.on("select", sync);
    api.on("reInit", sync);
    return () => {
      api.off("select", sync);
      api.off("reInit", sync);
    };
  }, [api]);

  return (
    <>
      <div role="region" aria-roledescription="carousel" aria-label={label} className={cn(entrance, "lg:hidden")}>
        <Carousel setApi={setApi} opts={{ align: "start" }} className="-mx-4">
          <CarouselContent className="ml-0 px-4 pb-3">
            {slides.map((slide, i) => (
              <CarouselItem
                key={i}
                aria-label={`${i + 1} of ${slides.length}`}
                className="basis-full pr-2 pl-0 last:pr-0 [&:not(:first-child)]:pl-2"
              >
                {slide}
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => api?.scrollPrev()}
            disabled={index === 0}
            aria-label="Previous"
            className="grid size-12 place-items-center transition-opacity disabled:opacity-35"
          >
            <ChunkyArrow direction="left" className={arrowTone} />
          </button>
          <span className="sr-only" aria-live="polite">
            {index + 1} of {slides.length}
          </span>
          <button
            type="button"
            onClick={() => api?.scrollNext()}
            disabled={index === slides.length - 1}
            aria-label="Next"
            className={cn("grid size-12 place-items-center transition-opacity disabled:opacity-35")}
          >
            <ChunkyArrow direction="right" className={arrowTone} />
          </button>
        </div>
      </div>
      <ul aria-label={label} className={cn("hidden lg:grid", gridClassName)}>
        {slides.map((slide, i) => (
          <li key={i} className={entrance}>
            {slide}
          </li>
        ))}
      </ul>
    </>
  );
}

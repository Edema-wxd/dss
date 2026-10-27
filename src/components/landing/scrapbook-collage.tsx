import Image from "next/image";
import type { CSSProperties } from "react";

/*
 * The strategist collage, assembled from its pieces: each one is tossed onto
 * the page once the collage scrolls into view. Array order is stacking order;
 * --draw-delay sets the order they land in.
 * Positions are % of the 1460×1380 artboard, and the piece PNGs are at its scale.
 */
const ARTBOARD = { w: 1460, h: 1380 };

type Piece = {
  src: string;
  w: number;
  h: number;
  left: number;
  top: number;
  /** where it's tossed in from, relative to its own size */
  from: [x: string, y: string, rotate: string];
  delay: number;
  className?: string;
};

const pieces: Piece[] = [
  { src: "pink-frame", w: 847, h: 862, left: 35.21, top: 6.45, from: ["34%", "-14%", "12deg"], delay: 0 },
  { src: "marketing-black", w: 751, h: 797, left: 40.55, top: 9.34, from: ["30%", "-10%", "9deg"], delay: 120 },
  { src: "halftone", w: 740, h: 760, left: 49.32, top: 44.86, from: ["32%", "26%", "16deg"], delay: 460 },
  { src: "marketing-grey", w: 751, h: 797, left: 40.55, top: 9.34, from: ["0%", "0%", "0deg"], delay: 620 },
  { src: "yellow-card", w: 820, h: 1009, left: -0.76, top: -0.87, from: ["-30%", "-12%", "-14deg"], delay: 200 },
  { src: "photo-card", w: 820, h: 1009, left: -0.76, top: -0.87, from: ["-36%", "8%", "-10deg"], delay: 320 },
  { src: "strategist-badge", w: 378, h: 480, left: 33.29, top: 58.77, from: ["-10%", "60%", "-18deg"], delay: 600 },
  { src: "hi-sticker", w: 374, h: 134, left: 25.82, top: 3.18, from: ["-40%", "-140%", "-20deg"], delay: 760 },
  { src: "invited-sticker", w: 432, h: 158, left: 7.53, top: 61.95, from: ["-60%", "120%", "16deg"], delay: 860 },
  { src: "clock-it-sticker", w: 283, h: 146, left: 72.88, top: 4.35, from: ["60%", "-140%", "22deg"], delay: 960 },
];

export function ScrapbookCollage({ className }: { className?: string }) {
  return (
    <div
      role="img"
      data-reveal-wait="images"
      aria-label="Janefrances C. Obiajulu, your strategist, with Digital Savvy Studios brand stickers"
      className={`reveal-stage relative aspect-[1460/1380] w-full ${className ?? ""}`}
    >
      {pieces.map((p) => {
        const width = (p.w / ARTBOARD.w) * 100;
        return (
          <Image
            key={p.src}
            src={`/images/scrapbook/${p.src}.png`}
            alt=""
            width={p.w}
            height={p.h}
            sizes={`(max-width: 600px) ${Math.round(width)}vw, ${Math.round((width / 100) * 640)}px`}
            className={`scrap-in absolute h-auto max-w-none ${p.className ?? ""}`}
            style={
              {
                left: `${p.left}%`,
                top: `${p.top}%`,
                width: `${width}%`,
                "--from-x": p.from[0],
                "--from-y": p.from[1],
                "--from-r": p.from[2],
                "--draw-delay": `${p.delay}ms`,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

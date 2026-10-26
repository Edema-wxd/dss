import Image from "next/image";
import { ChecklistDialog } from "./checklist-dialog";

export function SiteFooter() {
  return (
    <footer className="bg-ink px-6 pt-10 pb-12 text-white lg:px-10 lg:pt-[84px] lg:pb-[150px]">
      <div className="mx-auto max-w-xl lg:max-w-[1360px]">
        <a href="#top" aria-label="Back to top" className="inline-block">
          <Image
            src="/images/logo-pinkandwhite.svg"
            alt="Digital Savvy Studios"
            width={1689}
            height={1233}
            sizes="150px"
            className="h-auto w-[150px] lg:w-[146px]"
          />
        </a>
        <p
          aria-hidden
          className="group reveal font-display text-outline mt-6 text-[84px] transition-colors duration-500 leading-[0.92] font-medium tracking-[-0.04em] lg:mt-0 lg:text-[min(calc((100vw-80px)/9.4),144px)] lg:leading-[1.05] lg:whitespace-nowrap is-revealed"
        >
          Digital{" "}
          <span className="text-[#aaa] transition-colors duration-500 lg:group-hover:text-pink lg:group-hover:[-webkit-text-stroke-color:var(--color-pink)]">
            Savvy
          </span>{" "}
          Studios
        </p>
        <div className="lg:mt-9 lg:flex lg:items-baseline lg:justify-between lg:gap-8">
          <p className="mt-10 text-[13px] leading-[1.7] text-[#aaa] lg:mt-0">
            Digital Savvy Studios · Marketing, operations and brand strategy
            consultancy · Lagos, Nigeria
          </p>
          <p className="mt-5 text-[13px] leading-[1.7] text-white/75 lg:mt-0 lg:text-white">
            <ChecklistDialog
              trigger={
                <button
                  type="button"
                  className="text-left text-lime underline underline-offset-2"
                >
                  Get the free Launch Visibility Checklist
                </button>
              }
            />{" "}
            · Excellence, made visible.
          </p>
        </div>
      </div>
    </footer>
  );
}

import Image from "next/image";
import { ChecklistDialog } from "./checklist-dialog";

export function SiteFooter() {
  return (
    <footer className="bg-ink px-6 pt-10 pb-12 text-white">
      <div className="mx-auto max-w-xl">
        <Image
          src="/images/lockup-white.png"
          alt="Digital Savvy Studios"
          width={1689}
          height={1233}
          sizes="150px"
          className="h-auto w-[150px]"
        />
        <p aria-hidden className="font-display text-outline mt-6 text-[84px] leading-[0.92] font-medium tracking-[-0.04em]">
          Digital Savvy Studios
        </p>
        <p className="mt-10 text-[13px] leading-[1.7] text-white/75">
          Digital Savvy Studios · Marketing, operations and brand strategy consultancy · Lagos, Nigeria
        </p>
        <p className="mt-5 text-[13px] leading-[1.7] text-white/75">
          <ChecklistDialog
            trigger={
              <button type="button" className="text-left text-lime underline underline-offset-2">
                Get the free Launch Visibility Checklist
              </button>
            }
          />{" "}
          · Excellence, made visible.
        </p>
      </div>
    </footer>
  );
}

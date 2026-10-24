import Image from "next/image";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FinalCta() {
  return (
    <section aria-labelledby="final-cta-title" className="px-4 pt-4 pb-20">
      <div className="relative mx-auto max-w-xl rounded-[28px] border-2 border-ink bg-aqua px-5 pt-8 pb-28 text-center shadow-hard-lg">
        <Image
          src="/images/wifi-heart.png"
          alt=""
          width={360}
          height={284}
          sizes="84px"
          className="ml-6 w-[84px]"
        />
        <h2
          id="final-cta-title"
          className="mt-4 text-[40px] leading-[0.98] font-black tracking-[-0.04em]"
        >
          The next buyer is already looking you up.
        </h2>
        <p className="font-display mt-5 text-[36px] leading-[0.98] font-bold tracking-[-0.03em] text-pink italic">
          Make sure they call.
        </p>
        <a
          href="#apply"
          className={cn(buttonVariants({ variant: "lime", size: "xl" }), "mt-8 w-full max-w-[260px] text-sm")}
        >
          Apply for one of 8 sessions
        </a>
        <Image
          src="/images/cursor-pink.png"
          alt=""
          width={300}
          height={408}
          sizes="54px"
          className="absolute right-8 bottom-6 w-[54px]"
        />
      </div>
    </section>
  );
}

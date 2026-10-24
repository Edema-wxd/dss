import Image from "next/image";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FinalCta() {
  return (
    <section aria-labelledby="final-cta-title" className="px-4 pt-4 pb-20 lg:px-10 lg:pt-10 lg:pb-[90px]">
      <div className="reveal relative mx-auto max-w-xl rounded-[28px] border-2 border-ink bg-aqua px-5 pt-8 pb-28 text-center shadow-hard-lg lg:max-w-[1280px] lg:px-10 lg:pt-[76px] lg:pb-[58px]">
        <Image
          src="/images/wifi-heart.png"
          alt=""
          width={360}
          height={284}
          sizes="(min-width: 1024px) 112px, 84px"
          className="float hover-pop ml-6 w-[84px] [--float-delay:-1.8s] lg:absolute lg:-top-[46px] lg:left-5 lg:ml-0 lg:w-[112px]"
        />
        {/* on desktop the answer runs on from the headline, in one block */}
        <div className="lg:text-[min(5vw,72px)] lg:leading-[1.08]">
          <h2
            id="final-cta-title"
            className="mt-4 text-[40px] leading-[0.98] font-black tracking-[-0.04em] lg:mt-0 lg:inline lg:text-[length:inherit] lg:leading-[inherit]"
          >
            The next buyer is already <br className="max-lg:hidden" />
            looking you up.
          </h2>{" "}
          <p className="font-display mt-5 text-[36px] leading-[0.98] font-bold tracking-[-0.03em] text-pink italic lg:mt-0 lg:inline lg:whitespace-nowrap lg:text-[length:inherit] lg:leading-[inherit]">
            Make sure they call.
          </p>
        </div>
        <a
          href="#apply"
          className={cn(buttonVariants({ variant: "lime", size: "xl" }), "mt-8 w-full max-w-[260px] text-sm lg:mt-5 lg:h-[52px] lg:text-[15px]")}
        >
          Apply for one of 8 sessions →
        </a>
        <Image
          src="/images/cursor-pink.png"
          alt=""
          width={300}
          height={408}
          sizes="(min-width: 1024px) 64px, 54px"
          className="float hover-pop absolute right-8 bottom-6 w-[54px] [--float-delay:-3s] lg:right-7 lg:-bottom-[48px] lg:w-[64px]"
        />
      </div>
    </section>
  );
}

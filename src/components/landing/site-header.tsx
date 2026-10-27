import Image from "next/image";
import { getSlotStatus, slotsLeft } from "@/lib/slots";
import { SectionLink } from "./section-link";
import { SiteMenu } from "./site-menu";

export async function AnnouncementBar() {
  const slots = await getSlotStatus();
  const line = !slots.open
    ? "Applications are closed for now"
    : slots.remaining
      ? `${slots.remaining} ${slots.remaining === 1 ? "session" : "sessions"} open in ${slots.month}`
      : `${slots.month} is fully booked`;
  return (
    <div className="bg-ink px-2 py-2.5 text-center text-[11px] tracking-[-0.01em] leading-tight text-white lg:py-[11px] lg:text-[13px]">
      <span className="font-semibold text-lime">{line}</span>{" "}
      · Reviewed personally by Janefrances
    </div>
  );
}

export async function SiteHeader() {
  const slots = await getSlotStatus();
  return (
    <header className="relative z-20 mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 pt-5 lg:pt-[22px] lg:pr-[122px] lg:pl-[102px]">
      <SectionLink href="/#top" aria-label="Digital Savvy Studios home">
        <Image
          src="/images/logo-pinkandblack.svg"
          alt="Digital Savvy Studios"
          width={1262}
          height={468}
          priority
          sizes="(min-width: 1024px) 190px, 148px"
          // as wide as the row allows beside the slots pill and menu, up to 148px
          className="h-auto w-[min(148px,calc(100vw-251px))] lg:w-[190px]"
        />
      </SectionLink>
      <div className="flex items-center gap-3 lg:gap-7">
        <SectionLink
          href="/#apply"
          className="rounded-full border-2 border-ink bg-pink px-3.5 py-2.5 text-[10px] font-semibold text-white shadow-hard-sm lg:px-7 lg:py-[14px] lg:text-[15px] lg:shadow-hard-md"
        >
          {!slots.open
            ? "Applications closed"
            : slots.remaining
              ? `${slotsLeft(slots.remaining)} in ${slots.month}`
              : "Join the waitlist"}
        </SectionLink>
        <SiteMenu />
      </div>
    </header>
  );
}

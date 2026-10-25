import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// TODO: swap in the real booking link and WhatsApp number.
const bookingUrl = "#";
const whatsappUrl = "#";

export type ResponseKind = "priority" | "received" | "exploring" | "early";

/** Which screen an applicant sees, from their budget and timing answers. */
export function responseFor(investment: string, timing: string): ResponseKind {
  if (investment === "Under ₦800,000") return "early";
  if (timing === "Just exploring") return "exploring";
  if (timing === "Within 30 days" || timing === "1 to 3 months") return "priority";
  return "received";
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-block rounded-full border-2 border-ink bg-lime px-4 py-1.5 text-[12px] font-semibold tracking-[0.14em] uppercase">
      {children}
    </p>
  );
}

const cardClass = "rise-in rounded-[28px] border-2 border-ink bg-white p-6 lg:mx-auto lg:max-w-[560px] lg:px-9 lg:py-9";
const headingClass = "mt-5 text-[34px] leading-[1.02] font-black tracking-[-0.03em] lg:text-[32px]";
const bodyClass = "mt-5 text-[17px] leading-[1.75] lg:mt-4 lg:text-[16px] lg:leading-[1.6]";

/** The screen shown after the application is submitted. */
export function ApplyResponse({
  kind,
  firstName,
  company,
}: {
  kind: ResponseKind;
  firstName: string;
  company: string;
}) {
  if (kind === "exploring") {
    return (
      <div role="status" className="rise-in rounded-[28px] border-2 border-ink bg-white p-6 text-center shadow-hard-lg">
        <p className="font-display text-[30px] leading-tight font-bold">Application received.</p>
        <p className="mt-3 text-[15px] leading-relaxed text-slate">
          Janefrances reads every application personally. You&apos;ll hear back within one working day.
        </p>
      </div>
    );
  }

  if (kind === "early") {
    return (
      <div role="status" className={cardClass}>
        <Tag>Thank you, {firstName}</Tag>
        <h3 className={headingClass}>You&apos;re a little early, and that&apos;s fine.</h3>
        <p className={bodyClass}>
          Sessions are for founders ready to invest ₦800,000 or more a month, so we can give you
          advice you can act on straight away. We&apos;ll email you our Launch Visibility Checklist
          instead, so you can close the biggest gaps yourself.
        </p>
        <p className="text-[17px] leading-[1.75] lg:text-[16px] lg:leading-[1.6]">
          When your budget is ready, apply again and mention this application. We&apos;ll remember you.
        </p>
      </div>
    );
  }

  return (
    <div role="status" className={cardClass}>
      <Tag>{kind === "priority" ? "Priority review" : "Application received"}</Tag>
      <h3 className={headingClass}>
        Thank you, {firstName}.
        <br />
        We&apos;re on it.
      </h3>
      <p className={bodyClass}>
        {kind === "priority"
          ? "Given the scale of what you're planning, Janefrances will reach out to you personally within one working day."
          : "Janefrances reads every application personally. You'll hear from us within one working day."}
      </p>
      <ul className="list-disc pl-6 text-[17px] leading-[1.75] marker:text-pink lg:text-[16px] lg:leading-[1.6]">
        <li>We confirm your session and start studying {company}.</li>
        <li>We prepare your one-page review.</li>
        <li>We meet for 30 minutes and you leave with three moves.</li>
      </ul>
      <div className="mt-6 flex flex-col gap-4 lg:mt-5 lg:items-start">
        <a href={bookingUrl} className={cn(buttonVariants({ variant: "brand", size: "xl" }), "h-[52px] w-full lg:w-auto lg:px-7 lg:text-[15px]")}>
          Choose your session time
        </a>
        <a href={whatsappUrl} className={cn(buttonVariants({ variant: "paper", size: "xl" }), "h-[52px] w-full lg:w-auto lg:px-7 lg:text-[15px]")}>
          Message us on WhatsApp
        </a>
      </div>
    </div>
  );
}

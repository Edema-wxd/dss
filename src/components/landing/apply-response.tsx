import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { checklistPdf } from "@/lib/checklist";
import { ChecklistDialog } from "./checklist-dialog";

// TODO: swap in the real booking link, WhatsApp number and Visibility Brief link.
const bookingUrl = "#";
const whatsappUrl = "#";
const briefUrl = "#";

const buttonClass = "h-[52px] w-full lg:w-auto lg:px-7 lg:text-[15px]";

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
      <div role="status" className={cardClass}>
        <Tag>Application received</Tag>
        <h3 className={headingClass}>
          Thank you, {firstName}.
          <br />
          We&apos;ve noted your interest.
        </h3>
        <p className={bodyClass}>
          We keep Visibility Sessions for founders with a launch, raise or expansion in the next six
          months, so the advice can be put to work straight away. As you&apos;re still exploring, we
          won&apos;t schedule a session just yet.
        </p>
        <p className={bodyClass}>
          Your application will stay on file. In the meantime, we&apos;ll send you our Launch Visibility
          Checklist and The Visibility Brief, our occasional note on positioning and growth. When your
          next big moment comes into view, email us at{" "}
          <a href="mailto:hello@digitalsavvystudios.com" className="font-semibold text-pink underline underline-offset-2">
            hello@digitalsavvystudios.com
          </a>{" "}
          and we&apos;ll pick up from there.
        </p>
        <div className="mt-6 flex flex-col gap-4 lg:mt-5 lg:items-start">
          <a href={briefUrl} className={cn(buttonVariants({ variant: "brand", size: "xl" }), buttonClass)}>
            Read The Visibility Brief
          </a>
          <ChecklistDialog
            trigger={
              <Button variant="paper" size="xl" className={buttonClass}>
                Get the Visibility Checklist
              </Button>
            }
          />
        </div>
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
          advice you can act on straight away. Take our Launch Visibility Checklist instead, so you
          can close the biggest gaps yourself.
        </p>
        <p className="text-[17px] leading-[1.75] lg:text-[16px] lg:leading-[1.6]">
          When your budget is ready, apply again and mention this application. We&apos;ll remember you.
        </p>
        <div className="mt-6 flex flex-col gap-4 lg:mt-5 lg:items-start">
          <a
            href={checklistPdf}
            download
            className={cn(buttonVariants({ variant: "brand", size: "xl" }), buttonClass)}
          >
            Download the checklist (PDF)
          </a>
        </div>
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

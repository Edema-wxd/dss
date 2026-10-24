import { PlusIcon } from "lucide-react";
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { Accordion, AccordionContent, AccordionItem } from "@/components/ui/accordion";
import { Eyebrow } from "./primitives";

// TODO(copy): the design has the questions only. These answers are drafted
// from facts stated elsewhere on the page; confirm before launch.
const faqs = [
  {
    q: "Is it really free?",
    a: "Yes. The Visibility Session is a ₦250,000 brand review, and we give it free to 8 founders a month. There's nothing to pay and no card to enter.",
  },
  {
    q: "Is this a sales call in disguise?",
    a: "No. We do the homework before we meet and spend the 30 minutes showing you what we found. If we're a fit afterwards, most clients start with a 90-day Visibility Sprint, but you'll never be pushed into one.",
  },
  {
    q: "Who will I speak with?",
    a: "Janefrances C. Obiajulu, Founder and Creative Director of Digital Savvy Studios. She reviews every application personally.",
  },
  {
    q: "We're not ready to spend yet. Should we still apply?",
    a: "The session is built for founders investing, or ready to invest, ₦800,000 or more a month in marketing. If you're not there yet, the free Launch Visibility Checklist will help you close the biggest gaps yourself.",
  },
  {
    q: "How soon will my session be?",
    a: "We reply within one working day of your application. Sessions are confirmed in the order qualified applications arrive.",
  },
  {
    q: "We're outside Nigeria. Can we apply?",
    a: "[Confirm: whether founders outside Nigeria can apply, and how sessions run across time zones.]",
  },
];

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-4 px-4 py-14">
      <div className="mx-auto max-w-xl">
        <Eyebrow>Straight answers</Eyebrow>
        <div className="mt-5 flex items-center gap-3">
          <h2
            id="faq-title"
            className="rounded-[22px] rounded-bl-md border-2 border-ink bg-white px-5 py-3 text-[24px] font-bold shadow-hard"
          >
            Before you <span className="text-pink">apply.</span>
          </h2>
          <span aria-hidden className="flex gap-1 rounded-full border-2 border-ink bg-white px-4 py-3">
            <span className="size-2 rounded-full bg-ink" />
            <span className="size-2 rounded-full bg-ink" />
            <span className="size-2 rounded-full bg-ink" />
          </span>
        </div>

        <Accordion className="mt-6 gap-4">
          {faqs.map(({ q, a }) => (
            <AccordionItem
              key={q}
              value={q}
              className="rounded-[18px] border-2 border-ink bg-white not-last:border-2"
            >
              <AccordionPrimitive.Header className="flex">
                <AccordionPrimitive.Trigger className="group/faq font-display flex min-h-[72px] flex-1 items-center justify-between gap-4 px-6 py-4 text-left text-[17px] leading-tight font-bold outline-none focus-visible:ring-3 focus-visible:ring-pink/50 rounded-[16px]">
                  {q}
                  <PlusIcon
                    aria-hidden
                    className="size-5 shrink-0 text-pink transition-transform group-aria-expanded/faq:rotate-45"
                    strokeWidth={3}
                  />
                </AccordionPrimitive.Trigger>
              </AccordionPrimitive.Header>
              <AccordionContent className="px-6 pb-5 text-[15px] leading-[1.6] text-slate">
                {a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

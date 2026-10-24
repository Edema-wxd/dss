import { Apply } from "@/components/landing/apply";
import { BigMoments } from "@/components/landing/big-moments";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { FitCheck } from "@/components/landing/fit-check";
import { Hero } from "@/components/landing/hero";
import { LookupTest } from "@/components/landing/lookup-test";
import { ScrollReveal } from "@/components/landing/scroll-reveal";
import { Session } from "@/components/landing/session";
import { SiteFooter } from "@/components/landing/site-footer";
import { Strategist } from "@/components/landing/strategist";
import { Tickers } from "@/components/landing/tickers";

export default function Home() {
  return (
    <>
      <Hero />
      <main className="overflow-x-clip">
        <Tickers />
        <LookupTest />
        <Session />
        <BigMoments />
        <Strategist />
        <FitCheck />
        <Apply />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
      <ScrollReveal />
    </>
  );
}

import { motion } from "motion/react";
import { CalendarBlank, MapPin, TShirt, Ticket } from "@phosphor-icons/react";
import { Container } from "../../components/ui/Container.js";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { formatEventDate, formatPriceInPaise, useEventConfig } from "../../lib/hooks/useEventConfig.js";

const REVEAL = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.4 },
  transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }
};

const FALLBACK_EVENT_DATE_ISO = "2026-10-15T09:30:00.000Z";
const FALLBACK_VENUE = "Acharya Stadium";
const FALLBACK_PRICE_IN_PAISE = 15100;

export function Highlights() {
  const { config } = useEventConfig();
  const eventDateIso = config?.eventDate ?? FALLBACK_EVENT_DATE_ISO;
  const venue = config?.venue ?? FALLBACK_VENUE;
  const priceInPaise = config?.priceInPaise ?? FALLBACK_PRICE_IN_PAISE;

  return (
    <section id="highlights" className="py-20 sm:py-28">
      <Container>
        <motion.h2
          {...REVEAL}
          className="font-display text-3xl font-semibold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.85),0_4px_18px_rgba(0,0,0,0.55)] sm:text-4xl"
        >
          The essentials
        </motion.h2>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3 md:grid-rows-2">
          <motion.div {...REVEAL} className="md:col-span-2 md:row-span-2">
            <GlassPanel variant="solid" className="flex h-full flex-col gap-6 bg-midnight-800/80 p-8">
              <CalendarBlank size={36} weight="duotone" className="text-festival-gold" />
              <div className="flex flex-col gap-3">
                <p className="text-xs uppercase tracking-[0.14em] text-white/50">When and where</p>
                <p className="font-display text-4xl font-semibold leading-tight text-white sm:text-5xl">
                  {formatEventDate(eventDateIso)}
                </p>
                <p className="flex items-center gap-2 text-base text-festival-gold/90 font-medium">
                  <MapPin size={18} weight="fill" /> {venue}
                </p>
                <div className="mt-2 flex flex-col gap-1.5 border-t border-white/10 pt-4 text-sm text-white/60">
                  <p>Entry: <span className="text-white/85">3:00 PM – 5:00 PM</span> (gate closes 5:00 PM)</p>
                  <p>Event: <span className="text-white/85">4:00 PM – 9:00 PM</span></p>
                  <p className="mt-1 text-xs text-white/40">Entry is one-time only — once you exit, you cannot re-enter.</p>
                </div>
              </div>
            </GlassPanel>
          </motion.div>

          <motion.div {...REVEAL}>
            <GlassPanel variant="solid" className="flex h-full flex-col justify-between gap-6 bg-midnight-800/80 p-6">
              <Ticket size={28} weight="duotone" className="text-indigo-400" />
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-white/50">Dandiya Celebration Kit</p>
                <p className="mt-1 font-display text-2xl font-semibold text-white">
                  {formatPriceInPaise(priceInPaise)}
                </p>
                <p className="mt-2 text-xs text-white/50 leading-relaxed">
                  Receive your Dandiya Celebration Kit at the event venue.
                </p>
              </div>
            </GlassPanel>
          </motion.div>

          <motion.div {...REVEAL}>
            <GlassPanel variant="solid" className="flex h-full flex-col justify-between gap-6 bg-midnight-800/80 p-6">
              <TShirt size={28} weight="duotone" className="text-festival-magenta" />
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-white/50">Dress code</p>
                <p className="mt-1 text-sm text-white/75">
                  Traditional and festive. Chaniya cholis, kurtas, and comfortable footwear for raas.
                </p>
              </div>
            </GlassPanel>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}

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
            <GlassPanel variant="solid" className="flex h-full flex-col justify-between gap-8 bg-midnight-800/80 p-8">
              <CalendarBlank size={32} weight="duotone" className="text-festival-gold" />
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-white/50">When and where</p>
                <p className="mt-2 font-display text-2xl font-semibold text-white sm:text-3xl">
                  {formatEventDate(eventDateIso)}
                </p>
                <p className="mt-2 flex items-center gap-2 text-sm text-white/70">
                  <MapPin size={16} /> {venue}
                </p>
              </div>
            </GlassPanel>
          </motion.div>

          <motion.div {...REVEAL}>
            <GlassPanel variant="solid" className="flex h-full flex-col justify-between gap-6 bg-midnight-800/80 p-6">
              <Ticket size={28} weight="duotone" className="text-indigo-400" />
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-white/50">Entry fee</p>
                <p className="mt-1 font-display text-2xl font-semibold text-white">
                  {formatPriceInPaise(priceInPaise)}
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

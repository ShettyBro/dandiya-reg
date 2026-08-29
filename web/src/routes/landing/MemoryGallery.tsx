import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Container } from "../../components/ui/Container.js";
import { GALLERY_IMAGE_FILENAMES, galleryImageUrl } from "../../lib/gallery-manifest.js";

const SLOT_COUNT = 5;
const BASE_INTERVAL_MS = 4000;
const FADE_MS = 380;
const BLACKOUT_HOLD_MS = 100;

const STRIP_WIDTH = 1000;
const STRIP_HEIGHT = 100;
const STRIP_AMPLITUDE = 32;
const STRIP_CYCLES = 2.5;
const BULB_COUNT = 16;
const PENNANT_COUNT = 9;
const WAVE_ZONE_PX = 80;
const MIN_DROP_PX = 26;
const WIRE_INSET = 0.09;

function rowTToWireT(rowT: number): number {
  return (rowT - WIRE_INSET) / (1 - 2 * WIRE_INSET);
}

function waveY(t: number): number {
  return STRIP_HEIGHT / 2 - STRIP_AMPLITUDE * Math.sin(t * Math.PI * 2 * STRIP_CYCLES);
}

function buildWavePathD(sampleCount: number): string {
  const points = Array.from({ length: sampleCount + 1 }, (_, i) => {
    const t = i / sampleCount;
    const x = t * STRIP_WIDTH;
    const y = waveY(t);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M ${points.join(" L ")}`;
}

const WAVE_PATH_D = buildWavePathD(80);
const BULBS = Array.from({ length: BULB_COUNT }, (_, i) => {
  const t = i / (BULB_COUNT - 1);
  return { leftPercent: t * 100, topPercent: (waveY(t) / STRIP_HEIGHT) * 100, delay: i * 0.12 };
});
const PENNANTS = Array.from({ length: PENNANT_COUNT }, (_, i) => {
  const t = (i + 0.5) / PENNANT_COUNT;
  return {
    leftPercent: t * 100,
    topPercent: (waveY(t) / STRIP_HEIGHT) * 100,
    color: i % 2 === 0 ? "#ecc07a" : "#d63aa8"
  };
});

function posterMarginTop(slotIndex: number): number {
  const rowT = (slotIndex + 0.5) / SLOT_COUNT;
  const wireT = rowTToWireT(rowT);
  const waveFraction = waveY(wireT) / STRIP_HEIGHT;
  return MIN_DROP_PX + (WAVE_ZONE_PX - waveFraction * WAVE_ZONE_PX);
}

function FloatingDancers({ flip = false }: { flip?: boolean }) {
  return (
    <div
      className="absolute top-1/2 z-10 h-24 w-24 -translate-y-1/2 sm:h-28 sm:w-28"
      style={flip ? { left: "calc(100% + 0.25rem)" } : { right: "calc(100% + 0.25rem)" }}
    >
      <motion.img
        src="/dandiya-dancers.png"
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="h-full w-full object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.6)]"
        style={flip ? { transform: "scaleX(-1)" } : undefined}
        animate={{ y: [0, -14, 0, 8, 0] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function LedStrip() {
  return (
    <div className="relative h-20">
      <div className="absolute inset-y-0 left-[9%] right-[9%]">
        <svg
          viewBox={`0 0 ${STRIP_WIDTH} ${STRIP_HEIGHT}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
        >
          <path
            d={WAVE_PATH_D}
            fill="none"
            stroke="rgba(236,192,122,0.55)"
            strokeWidth="6"
            strokeLinecap="round"
            style={{ filter: "blur(6px)" }}
          />
          <path
            d={WAVE_PATH_D}
            fill="none"
            stroke="#ecc07a"
            strokeWidth="2.5"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {PENNANTS.map((pennant, i) => (
          <span
            key={i}
            className="absolute h-3 w-3 -translate-x-1/2"
            style={{
              left: `${pennant.leftPercent}%`,
              top: `${pennant.topPercent}%`,
              marginTop: "3px",
              backgroundColor: pennant.color,
              clipPath: "polygon(0 0, 100% 0, 50% 100%)"
            }}
          />
        ))}

        {BULBS.map((bulb, i) => (
          <motion.span
            key={i}
            className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-festival-gold"
            style={{
              left: `${bulb.leftPercent}%`,
              top: `${bulb.topPercent}%`,
              boxShadow: "0 0 16px 4px rgba(236,192,122,0.9)"
            }}
            animate={{ opacity: [0.4, 1, 0.4], scale: [0.85, 1.15, 0.85] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: bulb.delay }}
          />
        ))}

        <FloatingDancers />
        <FloatingDancers flip />
      </div>
    </div>
  );
}

function HangingPoster({
  slotIndex,
  slotStep,
  generation,
  staggerMs,
  marginTop
}: {
  slotIndex: number;
  slotStep: number;
  generation: number;
  staggerMs: number;
  marginTop: number;
}) {
  const total = GALLERY_IMAGE_FILENAMES.length;
  const [displayIndex, setDisplayIndex] = useState((slotIndex * slotStep) % total);
  const [blackout, setBlackout] = useState(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const timer = window.setTimeout(() => setBlackout(true), staggerMs);
    return () => window.clearTimeout(timer);
  }, [generation, staggerMs]);

  const filename = GALLERY_IMAGE_FILENAMES[displayIndex] ?? "";

  return (
    <div className="flex flex-1 flex-col items-center px-2.5 sm:px-4" style={{ marginTop }}>
      <div className="h-5 w-px bg-white/25" />
      <div className="h-2 w-2 shrink-0 rounded-full bg-festival-gold/80" />
      <motion.div
        className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border-[3px] border-festival-gold/70 bg-midnight-900"
        animate={{
          boxShadow: [
            "0 0 18px -2px rgba(236,192,122,0.45), 0 22px 48px -16px rgba(0,0,0,0.75)",
            "0 0 34px 4px rgba(236,192,122,0.85), 0 22px 48px -16px rgba(0,0,0,0.75)",
            "0 0 18px -2px rgba(236,192,122,0.45), 0 22px 48px -16px rgba(0,0,0,0.75)"
          ]
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <img
          src={galleryImageUrl(filename)}
          alt=""
          loading="eager"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <motion.div
          className="pointer-events-none absolute inset-0 bg-black"
          animate={{ opacity: blackout ? 1 : 0 }}
          transition={{ duration: FADE_MS / 1000, ease: "easeInOut" }}
          onAnimationComplete={() => {
            if (blackout) {
              window.setTimeout(() => {
                setDisplayIndex((generation + slotIndex * slotStep) % total);
                setBlackout(false);
              }, BLACKOUT_HOLD_MS);
            }
          }}
        />
      </motion.div>
    </div>
  );
}

export function MemoryGallery() {
  const slotStep = Math.max(1, Math.floor(GALLERY_IMAGE_FILENAMES.length / SLOT_COUNT));
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setGeneration((g) => g + 1), BASE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="py-20 sm:py-28">
      <Container>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
          className="mb-10 font-display text-3xl font-semibold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.85),0_4px_18px_rgba(0,0,0,0.55)] sm:text-4xl"
        >
          Last year, in frames
        </motion.h2>

        <LedStrip />

        <div className="flex items-start">
          {Array.from({ length: SLOT_COUNT }, (_, slotIndex) => (
            <HangingPoster
              key={slotIndex}
              slotIndex={slotIndex}
              slotStep={slotStep}
              generation={generation}
              staggerMs={slotIndex * 300}
              marginTop={posterMarginTop(slotIndex)}
            />
          ))}
        </div>
      </Container>
    </section>
  );
}

import { motion } from "motion/react";
import { ArrowRight, Buildings, ChalkboardTeacher, GraduationCap } from "@phosphor-icons/react";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import type { RegistrationType } from "./registrationTypes.js";

const CATEGORIES: Array<{
  type: RegistrationType;
  label: string;
  description: string;
  icon: typeof GraduationCap;
}> = [
  {
    type: "ACHARYA_STUDENT",
    label: "Acharya Student",
    description: "Currently enrolled at an Acharya institution",
    icon: GraduationCap
  },
  {
    type: "ACHARYA_FACULTY",
    label: "Acharya Faculty",
    description: "Faculty or staff at an Acharya institution",
    icon: ChalkboardTeacher
  },
  {
    type: "NON_ACHARYAN_STUDENT",
    label: "Non-Acharyan Student",
    description: "Student from any other college or university",
    icon: Buildings
  }
];

export function AreYouAcharyanStep({
  onSelect
}: {
  onSelect: (type: RegistrationType) => void;
}) {
  return (
    <GlassPanel className="p-6 sm:p-8">
      <h2 className="font-display text-xl font-semibold text-white">Choose your registration category</h2>
      <p className="mt-1 text-sm text-white/60">This decides which registration form you'll fill out.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CATEGORIES.map((category) => {
          const Icon = category.icon;
          return (
            <motion.button
              key={category.type}
              type="button"
              onClick={() => onSelect(category.type)}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.98 }}
              className="group flex flex-col items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left transition-colors hover:border-festival-gold/50 hover:bg-festival-gold/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-festival-gold/60"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-festival-gold/15 text-festival-gold transition-colors group-hover:bg-festival-gold/25">
                <Icon size={22} weight="duotone" />
              </span>

              <span className="flex w-full flex-col gap-1">
                <span className="font-display text-base font-semibold leading-snug text-white">
                  {category.label}
                </span>
                <span className="text-sm leading-snug text-white/60">{category.description}</span>
              </span>

              <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-festival-gold/80 transition-transform group-hover:translate-x-0.5">
                Select
                <ArrowRight size={14} weight="bold" />
              </span>
            </motion.button>
          );
        })}
      </div>
    </GlassPanel>
  );
}

import { motion } from "motion/react";
import { CaretRight, Buildings, ChalkboardTeacher, GraduationCap } from "@phosphor-icons/react";
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
    <GlassPanel variant="solid" className="p-6 sm:p-8">
      <h2 className="font-display text-xl font-semibold text-white">Choose your registration category</h2>
      <p className="mt-1 text-sm text-white/60">This decides which registration form you'll fill out.</p>

      <div className="mt-6 flex flex-col gap-3">
        {CATEGORIES.map((category) => {
          const Icon = category.icon;
          return (
            <motion.button
              key={category.type}
              type="button"
              onClick={() => onSelect(category.type)}
              whileHover={{ x: 3 }}
              whileTap={{ scale: 0.98 }}
              className="group flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-midnight-800 p-4 text-left transition-colors hover:border-festival-gold/50 hover:bg-midnight-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-festival-gold/60 sm:p-5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-festival-gold/15 text-festival-gold transition-colors group-hover:bg-festival-gold/25">
                <Icon size={22} weight="duotone" />
              </span>

              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-display text-base font-semibold leading-snug text-white">
                  {category.label}
                </span>
                <span className="text-sm leading-snug text-white/60">{category.description}</span>
              </span>

              <CaretRight
                size={20}
                weight="bold"
                className="shrink-0 text-white/30 transition-colors group-hover:text-festival-gold"
              />
            </motion.button>
          );
        })}
      </div>
    </GlassPanel>
  );
}

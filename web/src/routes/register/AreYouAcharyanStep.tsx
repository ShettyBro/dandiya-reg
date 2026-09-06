import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { cn } from "../../lib/cn.js";
import type { RegistrationType } from "./registrationTypes.js";

const CATEGORIES: Array<{
  type: RegistrationType;
  label: string;
  description: string;
}> = [
  {
    type: "ACHARYA_STUDENT",
    label: "Acharya Student",
    description: "Currently enrolled at an Acharya institution"
  },
  {
    type: "ACHARYA_FACULTY",
    label: "Acharya Faculty",
    description: "Faculty or staff at an Acharya institution"
  },
  {
    type: "NON_ACHARYAN_STUDENT",
    label: "Non-Acharyan Student",
    description: "Student from any other college or university"
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
        {CATEGORIES.map((category) => (
          <button
            key={category.type}
            type="button"
            onClick={() => onSelect(category.type)}
            className={cn(
              "flex flex-col items-start gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-5 text-left transition",
              "hover:border-festival-gold/50 hover:bg-festival-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-festival-gold/60"
            )}
          >
            <span className="font-display text-base font-semibold text-white">{category.label}</span>
            <span className="text-sm text-white/60">{category.description}</span>
          </button>
        ))}
      </div>
    </GlassPanel>
  );
}

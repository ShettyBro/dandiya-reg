import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { Button } from "../../components/ui/Button.js";
import type { RegistrationType } from "./registrationTypes.js";

export function AreYouAcharyanStep({
  onSelect
}: {
  onSelect: (type: RegistrationType) => void;
}) {
  return (
    <GlassPanel className="p-6 sm:p-8">
      <h2 className="font-display text-xl font-semibold text-white">Are you an Acharyan?</h2>
      <p className="mt-1 text-sm text-white/60">This decides which registration form you'll fill out.</p>

      <div className="mt-6 flex flex-col gap-4">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.1em] text-white/50">Yes, I'm an Acharyan</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="button" className="w-full sm:flex-1" onClick={() => onSelect("ACHARYA_STUDENT")}>
              Student
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:flex-1"
              onClick={() => onSelect("ACHARYA_FACULTY")}
            >
              Faculty
            </Button>
          </div>
        </div>

        <div className="h-px bg-white/10" />

        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.1em] text-white/50">No, I'm from another college</p>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => onSelect("NON_ACHARYAN_STUDENT")}
          >
            Continue as Non-Acharyan Student
          </Button>
        </div>
      </div>
    </GlassPanel>
  );
}

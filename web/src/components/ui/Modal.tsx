import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { X } from "@phosphor-icons/react";

export function Modal({
  open,
  onClose,
  children
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  // Rendered through a portal straight to <body> instead of inline where it's used — otherwise
  // it inherits whatever stacking context its parent page happens to be in (e.g. register-page's
  // <main> sits in a z-10 stacking context that loses to a later z-10 sibling like the footer, no
  // matter what z-index this modal declares internally), and on some pages/devices the modal
  // ended up rendering BEHIND page content instead of on top of it.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-midnight-950/80 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-card border border-white/15 bg-midnight-900 p-6 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.85)] sm:p-7"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 text-white/40 hover:text-white"
            >
              <X size={20} />
            </button>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

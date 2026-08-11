import type { LucideIcon } from "lucide-react";
import {
  MapPin,
  Plane,
  Wallet,
  Sliders,
  ListChecks,
  NotebookPen,
  Sparkles,
} from "lucide-react";

/**
 * The seven steps, in order.
 *
 * `shortLabel` is what the stepper shows; `title` and `description` head the
 * step itself. Field membership lives in `STEP_FIELDS` in the validation
 * module, so validation and presentation stay in their own files.
 */
export interface WizardStep {
  shortLabel: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Steps the traveler can finish without entering anything. */
  optional: boolean;
}

export const WIZARD_STEPS: WizardStep[] = [
  {
    shortLabel: "Destination",
    title: "Where are you going?",
    description: "The two ends of the trip and the dates in between.",
    icon: MapPin,
    optional: false,
  },
  {
    shortLabel: "Getting there",
    title: "How are you getting there?",
    description:
      "TripPilot schedules the journey, not just the destination — so it needs to know whether to search, recommend, or work around what you have already booked.",
    icon: Plane,
    optional: false,
  },
  {
    shortLabel: "Budget",
    title: "What are you spending?",
    description:
      "A total is enough. Set individual categories only where you already know the number.",
    icon: Wallet,
    optional: true,
  },
  {
    shortLabel: "Preferences",
    title: "How do you like to travel?",
    description: "This shapes how full each day gets and how you move around.",
    icon: Sliders,
    optional: false,
  },
  {
    shortLabel: "Must-dos",
    title: "What are you not willing to miss?",
    description:
      "These are requirements. The schedule is built around them, and suggestions give way to them.",
    icon: ListChecks,
    optional: true,
  },
  {
    shortLabel: "Notes",
    title: "Anything else?",
    description:
      "Occasions, people you are meeting, things to avoid — anything that should shape the plan.",
    icon: NotebookPen,
    optional: true,
  },
  {
    shortLabel: "Review",
    title: "Ready to build",
    description: "Check it over before TripPilot puts the days together.",
    icon: Sparkles,
    optional: false,
  },
];

export const STEP_COUNT = WIZARD_STEPS.length;

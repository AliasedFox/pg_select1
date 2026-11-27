import {
  BriefcaseIcon,
  CircleHelpIcon,
  InfoIcon,
  LifeBuoyIcon,
  type LucideIcon,
} from "lucide-react";

/** A page about pg_select1 rather than of the app, which anyone can open, signed in or not. */
export interface Resource {
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

/** The pages about pg_select1, in the order the header's Resources menu and the footer list them. */
export const RESOURCES: Resource[] = [
  { path: "/faq", label: "FAQ", description: "Answers to common questions", icon: CircleHelpIcon },
  { path: "/support", label: "Support", description: "Where to get help", icon: LifeBuoyIcon },
  { path: "/careers", label: "Careers", description: "Working on pg_select1", icon: BriefcaseIcon },
  {
    path: "/about",
    label: "About pg_select1",
    description: "What it is and who makes it",
    icon: InfoIcon,
  },
];

/** Answers the resource at `path`, if there's one. */
export function findResource(path: string): Resource | undefined {
  return RESOURCES.find((resource) => resource.path === path);
}

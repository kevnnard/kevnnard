import experience from "@/utils/experience.json";
import projects from "@/utils/projects.json";
import { stackOf, type TerminalData } from "./terminal.ts";

// Single source for everything the room displays: the same JSON the static
// homepage renders, so the 3D view never drifts from the portfolio.
export const roomData: TerminalData = { projects, experience };

export const featuredProjects = projects.filter((p) => p.isFeatured);
export const topStack = stackOf(roomData).slice(0, 12);
export const currentRoles = experience.filter((e) => e.isCurrent);

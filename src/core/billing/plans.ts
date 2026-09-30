import type { PlanId } from "../db/types";

export interface Plan {
  id: PlanId;
  name: string;
  price: string;
  blurb: string;
  features: string[];
  limits: {
    maxProjects: number; // total non-demo projects
    maxCommentsPerProject: number;
    maxManuscriptChars: number;
    monthlyTokenBudget: number; // AI tokens (input+output) per calendar month
  };
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    price: "$0",
    blurb: "Try PaperFix on one small project.",
    features: ["1 project", "Up to 5 reviewer comments", "Demo project included", "Revision report export"],
    limits: { maxProjects: 1, maxCommentsPerProject: 5, maxManuscriptChars: 40_000, monthlyTokenBudget: 60_000 },
  },
  single: {
    id: "single",
    name: "Single revision",
    price: "$29 once",
    blurb: "One complete revision round, no subscription.",
    features: ["1 additional project", "Up to 40 reviewer comments", "Response to Reviewers + report export", "JSON export"],
    // 2 = the free trial project + the paid one
    limits: { maxProjects: 2, maxCommentsPerProject: 40, maxManuscriptChars: 200_000, monthlyTokenBudget: 400_000 },
  },
  pro: {
    id: "pro",
    name: "Researcher Pro",
    price: "$19 / month",
    blurb: "For authors who revise several papers a year.",
    features: ["Up to 10 projects", "Up to 60 comments per project", "Priority analysis", "All exports"],
    limits: { maxProjects: 10, maxCommentsPerProject: 60, maxManuscriptChars: 200_000, monthlyTokenBudget: 1_500_000 },
  },
  lab: {
    id: "lab",
    name: "Lab",
    price: "$79 / month",
    blurb: "A research group with many manuscripts in flight.",
    features: ["Up to 60 projects", "Up to 100 comments per project", "Highest usage allowance", "All exports"],
    limits: { maxProjects: 60, maxCommentsPerProject: 100, maxManuscriptChars: 300_000, monthlyTokenBudget: 8_000_000 },
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "single", "pro", "lab"];

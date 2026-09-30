import { randomUUID } from "node:crypto";
import type { Db } from "@/core/db/store";
import { createProject } from "./service";

/**
 * Synthetic sample. The manuscript INTENTIONALLY omits the group-allocation procedure,
 * the ethics approval number and effect sizes, so the demo shows AUTHOR INPUT REQUIRED.
 * All study details are fictional.
 */
export const DEMO_MANUSCRIPT = `Effects of a Mindfulness Mobile App on Exam Stress in University Students: A Pilot Study

Abstract
This pilot study examined whether a four-week mindfulness mobile app reduced self-reported exam stress among undergraduate students. Sixty students took part and were divided into an app group and a waiting-list control group. Stress was measured with the Perceived Stress Scale before and after the intervention. Stress scores decreased in the app group and were unchanged in the control group.

Introduction
Exam periods are associated with elevated stress in university students. Mindfulness-based interventions have shown promise in reducing stress, but most existing programmes require in-person sessions, which limits scalability. Mobile applications could deliver mindfulness training at low cost. However, evidence from controlled studies of such apps in student populations remains limited. This pilot study aimed to test the feasibility and preliminary effect of a four-week mindfulness app.

Methods
Participants were undergraduate students at a single university who responded to a poster advertisement. Sixty students agreed to take part. Thirty students were in the app group and thirty were in the waiting-list control group. The app group used a guided mindfulness app for ten minutes per day for four weeks. The control group received the app after the study ended.
Stress was measured with the Perceived Stress Scale (PSS-10) at baseline and at week four. Participants completed the questionnaire online. Data were analysed with paired t-tests within each group and an independent-samples t-test on change scores between groups. The significance level was set at 0.05.
The study was approved by the university ethics committee and all participants gave written informed consent.

Results
Mean PSS-10 scores in the app group decreased from 24.1 (SD 5.2) at baseline to 19.8 (SD 5.6) at week four. In the control group, scores changed from 23.7 (SD 5.0) to 23.4 (SD 5.3). The difference in change scores between the groups was statistically significant (p = 0.003). Table 1 summarises the descriptive statistics for both groups.

Discussion
The results suggest that the mindfulness app reduced exam stress in this sample. The app may therefore be an effective way to prevent stress in all university students. Limitations include the small sample size and the short follow-up period. Future research should test the app in larger samples.

Conclusion
A four-week mindfulness app was associated with lower exam stress scores in a small sample of university students. Larger controlled studies are needed.

References
[References omitted in this sample]`;

export const DEMO_COMMENTS = `Reviewer 1
1. The sampling procedure is insufficiently described. It is unclear how participants were selected and assigned to the two groups.
2. Please report the ethics approval reference number and explain how informed consent was obtained.
3. The authors report p-values but no effect sizes or confidence intervals. Please add them.

Reviewer 2
1. The conclusion that the app "may be an effective way to prevent stress in all university students" is not supported by a small single-site pilot. Please temper the interpretation.
2. The introduction should discuss additional recent literature on digital mindfulness interventions.
3. The language throughout the manuscript needs careful proofreading.`;

export async function createDemoProject(db: Db, userId: string) {
  return createProject(db, userId, {
    id: randomUUID(),
    title: "Demo: Mindfulness app and exam stress",
    journalName: "Journal of Student Wellbeing (sample)",
    manuscript: { filename: "demo-manuscript.txt", text: DEMO_MANUSCRIPT, storagePath: null },
    reviewerComments: { filename: "demo-reviewer-comments.txt", text: DEMO_COMMENTS, storagePath: null },
    isDemo: true,
  });
}

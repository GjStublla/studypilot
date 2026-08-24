# StudyPilot beta pilot protocol

**Purpose:** Measure whether the rubric-aware browser-to-dashboard coaching loop is usable and useful for the target student audience. This protocol is for preparation; recruitment and collection require human approval.

## Controlled task

Each participant receives the same short rubric and the same deliberately weak paragraph. They must:

1. Sign in once and connect the extension to the dashboard.
2. Upload or select the provided rubric.
3. Open the study page and ask StudyPilot for feedback on the weak paragraph.
4. Answer one Socratic follow-up question.
5. Save one action item.
6. Open the dashboard and find the continued chat/session.

Use the same text-input fallback for every participant unless the protocol specifically compares microphone and text input. Do not vary the rubric, paragraph, prompt, or assessor instructions between participants.

## Consent and privacy

- Participation is voluntary and may stop at any time.
- Assign an anonymous participant ID before the task; do not put names or email addresses in the results file.
- Do not copy draft text, audio, screenshots, transcripts, or authentication data into the research file.
- Capture only the fixed numeric/boolean measures below and short usability notes.
- A quote may be used only when the participant explicitly approves the exact wording.
- Store recordings, if any, outside Git and delete them according to the approved consent plan.

## Fixed measures

- Task completion (`completed`): all six steps completed without facilitator intervention.
- Time to first useful feedback: seconds from prompt submission to the participant identifying one actionable revision.
- Before/after rubric score: same assessor and rubric, normalized to a 0–100 scale and recorded before and after the task. Use the same scoring guide for both measurements.
- Citation grounding: supported citations divided by citations checked.
- Error-free session: no unrecovered auth, network, indexing, model, or UI error.
- Median response latency: median milliseconds for the measured coaching requests.
- SUS score: standard ten-item System Usability Scale, scored consistently.

## Script and stop conditions

Read the same neutral instructions to every participant. Do not coach the participant toward a preferred answer. Stop and record a recoverable failure if authentication cannot be restored, a request cannot be retried, or the participant's data could be exposed to another account.

Recruit 10–15 students matching the target audience only after the deployed beta and clean-profile golden flow have been verified. Report sample size and limitations; do not present a small pilot as causal proof of learning improvement.

## Results-file gate

Before sharing or summarizing the research file, run:

```text
npm run validate:pilot -- docs/validation/pilot-results.csv
```

The command requires the fixed 11-column header, unique anonymous participant
IDs in the `P001`/`P002` format,
complete numeric/boolean values, supported-citation counts that cannot exceed
checked counts, rubric scores between 0 and 100, and no email, credential,
draft, audio, screenshot, transcript, or rubric content. The checked-in
header-only template exits successfully with an explicit “no participant rows”
status; use `--require-data` only after the approved pilot has actually produced
rows. The validator reports whether the row count is within the 10–15
participant target, but does not reject a smaller or larger approved sample;
report any deviation as a limitation rather than silently treating it as target
evidence.

After approved collection, generate the sanitized aggregate draft with:

```text
npm run summarize:pilot -- docs/validation/pilot-results.csv --require-data
```

Review the generated denominators and add only the team-owned dates, protocol
version, findings, limitations, and approved quotes to `pilot-summary.md`.

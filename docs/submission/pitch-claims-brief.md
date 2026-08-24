# StudyPilot pitch claims brief

**Status:** Human-owned draft/template. This is a preparation aid, not the
approved ceremony pitch.

Use this brief to keep the spoken pitch aligned with the report, demo script,
README, landing/legal copy, and canonical extension README. Replace bracketed
items only with evidence the team has actually approved. Do not turn local
tests into hosted availability or pilot outcomes into causal learning claims.

## Core story

**Problem:** Students move between a study page, a rubric, a coaching tool, and
their follow-up tasks. That context switching makes it easy to lose the
criterion behind the revision and the next action.

**Mechanism:** StudyPilot is a browser-first coaching loop. The student chooses
the page context and rubric, asks for feedback on a draft, answers a Socratic
follow-up, saves an action item, and can continue the same chat in the
dashboard when saving is enabled.

**Differentiator:** The product joins rubric grounding, student-controlled
context sharing, and cross-surface continuity in one workflow. It is not a
promise of higher grades or perfect citations.

## Evidence wording

Use the following evidence categories precisely:

- **Engineering evidence:** local tests, browser fixtures, accessibility checks,
  database policy tests, and clean-clone reproduction show implementation
  behavior and release discipline.
- **Hosted evidence:** say this only after the deployed URL, protected checks,
  and clean-profile flow have been verified by the team.
- **Pilot evidence:** say this only after the approved anonymous pilot rows are
  validated and the summary includes sample size and limitations.
- **Team evidence:** use only approved member roles/contributions and mentor or
  team sign-off.

Suggested qualified line while external gates remain open:

> “Our local engineering gates cover the workflow and privacy boundaries; the
> hosted demo and pilot outcome are the next validation steps.”

Replace that line only after the corresponding hosted or pilot evidence exists.

## Privacy and capability wording

Keep these points consistent across the pitch:

- Live microphone audio is processed by the hosted model path; it is not
  described as device-only processing.
- The student chooses the page context that is shared with coaching.
- Screenshot capture and dashboard persistence are separate controls and are
  off by default.
- Grounded answers may cite retrieved rubric or document evidence when it is
  available; the product does not promise timestamped lecture citations.
- Browser bundles do not contain model API keys or service-role secrets.

## Q&A prompts

**Why is this more than a generic chatbot?** Explain the rubric-scoped context,
Socratic follow-up, action item, and continuation path as one measurable task.

**How do you protect student control?** Explain chosen context, separate
default-off screenshot/persistence settings, authenticated server-side model
brokering, and the text-input fallback.

**What proves effectiveness?** Show the criterion-linked revision and saved
action in the demo. State the pilot result only when the validated summary is
available; otherwise describe the pilot as pending.

**What remains unfinished?** Name the deployed clean-profile run, pilot,
credential-history decision, remote CI, final media, contribution approvals,
and mentor/team sign-off that are still open.

## Final owner checklist

- [ ] Team replaces this draft with the approved pitch wording.
- [ ] Product/communications owner runs the sibling-aware claims validator and
      manually reviews the final pitch against the report and demo.
- [ ] Deployment owner supplies the hosted URL and clean-profile evidence.
- [ ] Pilot lead supplies the validated summary and limitations.
- [ ] Team lead and mentor approve the final wording and contribution answers.

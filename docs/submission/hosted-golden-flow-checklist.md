# Hosted golden-flow execution checklist

**Status:** Human-owned execution plan. No hosted run is claimed by this file.

Use this checklist after the web deployment, extension beta access, and demo
account have been approved. It turns the local fixture and two-minute script
into auditable evidence for the working-demo, effectiveness, UX, and
communication criteria.

## Required inputs and owners

- **Deployment owner:** verified HTTPS web URL, API/Supabase public values, and
  a clean-profile account path.
- **Extension/release owner:** approved beta or store install path and the
  exact extension commit to load.
- **Demo owner:** a synthetic account with one existing chat and one empty
  action-item slot; credentials stay outside Git and recordings.
- **Pilot/demo reviewer:** confirms the fixture, privacy settings, and spoken
  claims before recording.

Do not start until the deployment owner has confirmed the URL is not a local
fixture and the release owner has confirmed the extension build matches the
web commit under review.

## Preflight evidence

- [ ] Record the deployed URL and exact web/extension commit IDs in the private
      submission record.
- [ ] Open the URL from a fresh Chrome profile and confirm HTTPS, no loopback
      host, and no browser debug UI.
- [ ] Install the approved extension build without using a developer-only
      mock path.
- [ ] Sign in with the deterministic demo account; do not paste credentials in
      screenshots, recordings, Git, or chat.
- [ ] Confirm the [demo fixture](demo-fixture.md) is the only rubric,
      paragraph, and prompt content used.
- [ ] Set screenshot capture off. Enable dashboard persistence only for the
      checkpoint that proves the same chat/action item continues in the
      dashboard.
- [ ] Keep the text-input fallback ready. Use Live microphone only after the
      hosted Live path has been separately verified.

## Run A — clean profile

Use a new Chrome profile and record the checkpoint timestamp, pass/fail result,
and a short note in the private evidence record. Capture screenshots outside
Git only when a checkpoint fails or the submission owner explicitly needs a
still image.

| Checkpoint | Expected evidence | Result / timestamp |
|---|---|---|
| A1. Connect | Extension connects to the deployed dashboard/account without exposing another account's data. | [ ] |
| A2. Rubric | The active rubric is “Argument clarity mini-rubric.” | [ ] |
| A3. Context | The chosen study-page context and weak paragraph are visible to the student; no unrelated tab or personal data appears. | [ ] |
| A4. Coaching | The response identifies a rubric criterion and proposes an actionable revision. Do not claim perfect accuracy. | [ ] |
| A5. Socratic follow-up | The follow-up asks for reasoning/evidence without writing the paragraph for the student. | [ ] |
| A6. Action item | The exact fixture action item is saved successfully. | [ ] |
| A7. Continuity | With dashboard persistence enabled, the same chat and action item appear in the dashboard. | [ ] |
| A8. Privacy | Screenshot capture remains off unless deliberately enabled; no credential or personal data is recorded. | [ ] |

## Run B — repeatability

- [ ] Close the first profile and create a second clean Chrome profile.
- [ ] Repeat A1–A8 with the same fixture and neutral instructions.
- [ ] Record any difference, loading failure, auth failure, stale state, or
      recovery action. Do not silently retry until it passes.
- [ ] If either run fails, retain the failure note, fix the release blocker,
      and restart both runs; do not present a single passing run as repeatable.

## Demo and sign-off record

- [ ] The final recording follows the seven segments in [demo-script.md](demo-script.md)
      and remains at or below 1:58.
- [ ] Loading pauses, notifications, unrelated tabs, credentials, personal
      data, and debug UI are removed.
- [ ] A text-input fallback and backup recording/screenshots are stored in an
      approved private location.
- [ ] The team labels every spoken result as hosted, pilot, local engineering
      evidence, or limitation; no category is substituted for another.
- [ ] Deployment owner signs the URL and two-run record.
- [ ] Demo owner signs the recording and backup location.
- [ ] Team/mentor signs the final report, pitch, and checklist.

Until every checked item has an owner and evidence, the submission checklist
must keep the hosted/demo inputs pending.

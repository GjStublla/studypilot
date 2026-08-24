# StudyPilot pilot summary

**Status:** Template — no participant data collected yet.

Validate the source file before filling these fields:

```text
npm run validate:pilot -- docs/validation/pilot-results.csv
```

To generate a sanitized aggregate draft after approved collection, run:

```text
npm run summarize:pilot -- docs/validation/pilot-results.csv --require-data
```

The command writes Markdown to stdout only. The empty template is intentionally
not a result; `--require-data` refuses to claim a pilot without approved rows.
Copy only aggregate metrics and denominators into this summary, then add the
CSV row count, protocol version, dates, findings, limitations, and approved
quotes. Never paste participant names, contact details, draft content, audio,
screenshots, transcripts, credentials, or rubric text here.

## Sample

- Participants: [n, target-audience description; validator target is 10–15]
- Collection dates: [dates]
- Protocol version: [commit or date]

## Results

| Metric | Result | Denominator / note |
|---|---:|---|
| Task completion | [ ] | [ ] |
| Median time to useful feedback | [ ] seconds | [ ] |
| Mean before score | [ ] | normalized 0–100 rubric score; [n] rows |
| Mean after score | [ ] | normalized 0–100 rubric score; [n] rows |
| Grounding precision | [ ] | citations supported / checked |
| Error-free session rate | [ ] | [ ] |
| Median response latency | [ ] ms | [ ] |
| Mean SUS | [ ] | standard ten-item scoring |

## Findings

### Observed value

- [Evidence-backed observation]

### Friction and failures

- [Evidence-backed observation]

### Limitations

- [Sample size and recruitment limitation]
- [Assessor or task limitation]
- [No causal learning claim]

## Approved quotes

Only include up to two short quotes with explicit approval. If none are approved, write “No approved quotes.”

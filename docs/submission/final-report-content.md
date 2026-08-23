# StudyPilot final report content (draft)

Phase 2 starts the report with Overview, Problem, and Solution only. Later phases add development process, stack, architecture, features, challenges, and team contributions.

These sections describe what the beta does. They do not claim measured gains in learning, citation accuracy, speed, privacy, or reliability.

## 1. Project Overview

StudyPilot is a rubric-aware coaching loop across the browser and dashboard: it uses the page, the student's question, and an uploaded rubric to coach the next improvement, then carries the conversation and action items into the dashboard.

The beta has two connected surfaces:

- A Chrome extension panel on the study page the student is already using.
- A web dashboard for the same chats, sessions, rubrics, and action items.

Coaching in this beta uses the student's microphone and the page context they choose to share. When grounding is available, answers can cite retrieved rubric or uploaded-document evidence. The product does not promise timestamped lecture citations.

An account connection is required for real coaching. Sign in once to connect the extension and dashboard.

Live microphone audio is processed by Google Vertex AI while a session is active. Screenshots are sent only when the student enables them. Chat and session history save only when “Save to dashboard” is on. Those storage choices default off.

## 2. Problem Statement

Students often work in a browser tab with an assignment prompt or rubric nearby, then switch to a separate chatbot that cannot see the page or the rubric. Feedback in that setup is generic: it is not tied to the criterion the student is being graded on, and it does not continue in a durable workspace.

The problem this project takes on is operational, not a measured learning-outcome claim:

- Page context, the student's question, and the rubric live in different places.
- Coaching that happens in the browser is easy to lose when the tab closes.
- Next steps (what to revise, what to practice) are not carried into a dashboard the student can return to.

StudyPilot does not claim that students currently fail courses because of this split, or that any existing tool has a measured accuracy or speed deficit. It claims only that the workflow is fragmented.

## 3. Solution Overview

StudyPilot keeps one coaching loop across the two surfaces the student already uses.

1. The student signs in once to connect the extension and dashboard.
2. They open a study page and share the page context they choose (URL, selected text; screenshots only if enabled).
3. They ask a question or start a Live microphone session. Live audio is processed by Google Vertex AI while the session is active.
4. When a rubric or uploaded document has been indexed, answers can cite that retrieved evidence. If grounding is not available, the product does not invent a citation.
5. If “Save to dashboard” is on, the conversation and action items continue in the dashboard. If it is off, the session is not persisted there.

The solution is a connected coaching workflow, not a claim that students learn more, finish faster, or receive perfectly accurate citations. Those outcomes are out of scope until a later validation phase measures them.

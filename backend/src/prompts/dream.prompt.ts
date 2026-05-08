import { Session } from "../models/session";

export function buildDreamPrompt(sessions: Session[]): string {
  const projectIds = Array.from(
    new Set(sessions.map((session) => session.project_id).filter(Boolean)),
  );

  const sessionSummaries = sessions
    .map((session, index) => {
      return `
## Session ${index + 1}
- ID: ${session.id}
- Started: ${session.started_at.toISOString()}
- Ended: ${session.ended_at?.toISOString() ?? "ongoing"}
- Project: ${session.project_id ?? "none"}
- Transcript: ${session.transcript_path ?? "no transcript"}
`;
    })
    .join("\n");

  const projectIdList =
    projectIds.length > 0
      ? projectIds.map((projectId) => `  - "${projectId}"`).join("\n")
      : "  []";

  return `You are a context consolidation system for a development team.

Your task is to analyze the following work sessions from today and extract structured context.

# Sessions to Analyze

${sessionSummaries}

# Valid Project IDs

Use only these project IDs in project_ids. If no project applies, return an empty array.

${projectIdList}

# Your Task

Analyze these sessions and produce a YAML output with the following structure:

\`\`\`yaml
schema_version: "context-package/v1"

package:
  id: "pkg_${Date.now()}"
  title: "Brief title summarizing the work"
  type: "development_context"
  created_at: "${new Date().toISOString()}"

project_ids:
  - "project-id-if-identified"

summary: |
  A 2-3 sentence summary of what was accomplished.

decisions:
  - id: "dec_001"
    title: "Decision title"
    detail: "Why this decision was made"
    confidence: 0.9

tasks:
  - id: "task_001"
    title: "Task title"
    assignee: "person-name-if-known"
    status: "todo"
    priority: "high"

risks:
  - id: "risk_001"
    title: "Risk title"
    severity: "medium"
    mitigation: "How to mitigate"

open_questions:
  - id: "q_001"
    question: "What needs to be decided?"
    priority: "high"

observations:
  - type: "insight"
    content: "An interesting observation"
    relevance: "architecture"
    confidence: 0.8
    tags: ["performance", "database"]
\`\`\`

# Guidelines

1. Be concise: Only extract meaningful information
2. Be specific: Include concrete details, not vague statements
3. Confidence scores: 0.0-1.0, be honest about uncertainty
4. Project identification: Use only the valid project IDs listed above
5. Observations: Use for insights that do not fit other categories

# Output

Produce ONLY the YAML output, no additional text.`;
}

import { ContextPackage } from "../models/context-package";
import { Decision } from "../models/decision";
import { OpenQuestion } from "../models/open-question";
import { Risk } from "../models/risk";
import { Task } from "../models/task";

export interface BriefingData {
  packages: ContextPackage[];
  decisions: Decision[];
  tasks: Task[];
  risks: Risk[];
  questions: OpenQuestion[];
}

export function buildBriefingPrompt(data: BriefingData): string {
  const packagesSection =
    data.packages.length > 0
      ? data.packages
          .map(
            (pkg, index) => `
${index + 1}. **${pkg.title}**
   - Created: ${pkg.created_at.toISOString().split("T")[0]}
   - Summary: ${pkg.summary ?? "No summary"}
`,
          )
          .join("\n")
      : "  No recent work packages.";

  const decisionsSection =
    data.decisions.length > 0
      ? data.decisions
          .map(
            (decision, index) => `
${index + 1}. **${decision.title}**
   - Key: ${decision.decision_key}
   - Confidence: ${decision.confidence ?? "N/A"}
   - Detail: ${decision.detail ?? "No detail"}
`,
          )
          .join("\n")
      : "  No active decisions.";

  const tasksSection =
    data.tasks.length > 0
      ? data.tasks
          .map(
            (task, index) => `
${index + 1}. **${task.title}**
   - Status: ${task.status}
   - Priority: ${task.priority ?? "N/A"}
   - Assignee: ${task.assignee_id ?? "Unassigned"}
`,
          )
          .join("\n")
      : "  No pending tasks.";

  const risksSection =
    data.risks.length > 0
      ? data.risks
          .map(
            (risk, index) => `
${index + 1}. **${risk.title}**
   - Severity: ${risk.severity ?? "N/A"}
   - Mitigation: ${risk.mitigation ?? "No mitigation"}
`,
          )
          .join("\n")
      : "  No open risks.";

  const questionsSection =
    data.questions.length > 0
      ? data.questions
          .map(
            (question, index) => `
${index + 1}. **${question.question}**
   - Priority: ${question.priority ?? "N/A"}
   - Context: ${question.context ?? "No context"}
`,
          )
          .join("\n")
      : "  No open questions.";

  return `You are a team collaboration assistant generating a daily work briefing.

# Recent Work Context

${packagesSection}

# Active Decisions

${decisionsSection}

# Pending Tasks

${tasksSection}

# Open Risks

${risksSection}

# Open Questions

${questionsSection}

# Your Task

Generate a concise daily briefing (2-3 paragraphs) that includes:

1. **Recent Progress**: Summarize what has been accomplished recently
2. **Key Focus Areas**: Highlight the most important items that need attention
3. **Recommended Actions**: Suggest 2-3 concrete actions for today

# Guidelines

- Be concise and actionable
- Prioritize by importance and urgency
- Use a friendly, supportive tone
- Focus on what matters most

# Output

Produce a plain text briefing in Markdown format.`;
}

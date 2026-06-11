import type { ProjectData } from '@showcases/showcase';

export const data: ProjectData = {
  "name": "agentdesk",
  "title": "AgentDesk",
  "tagline": "A customer-operations agent that resolves requests via tool calls or hands off to a human when confidence is low.",
  "summary": "AgentDesk takes an inbound customer request and runs a tool-calling loop against a backend, then either resolves the request itself or escalates to a human when its confidence falls below a threshold. Confidence is the product of the provider's signal for its proposal and the fraction of tool calls that succeeded, so a weak signal or any failed call pulls it down. A React console gives an operator oversight of the queue, the tool trace, the proposed resolution, and the escalations awaiting a decision.",
  "category": "Agents and Language",
  "stack": [
    "Python",
    "React",
    "TypeScript",
    "Docker Compose",
    "Playwright",
    "pytest"
  ],
  "highlights": [
    "Confidence is the product of the provider's signal and tool-call completeness; a request at or above the default 0.7 threshold resolves automatically, below it escalates to a human",
    "The behavior is pinned by a decision table in tests (for example signal 0.9 with completeness 0.5 gives confidence 0.45 and escalates), and threshold tuning is proven at both the model and full-loop level",
    "Every handled request keeps a full transcript of each tool call, result or error, provider signal, and final decision, which a human can replay to approve or override",
    "Throughput measured locally at roughly 80000 to 110000 requests per second over batches of 2000 to 10000 on Python 3.13"
  ],
  "demoConcept": "Visualize a request moving through the tool-calling loop, each tool call returning success or error, while a confidence dial computes signal times completeness in real time and the request either drops into the resolved lane or the human-escalation queue depending on where the dial lands relative to a draggable threshold."
};

import type { ProjectData } from '@showcases/showcase';

export const data: ProjectData = {
  "name": "taskboard",
  "title": "TaskBoard",
  "tagline": "A collaborative Kanban board with real-time multi-user editing and conflict resolution over WebSocket.",
  "summary": "TaskBoard is a Spring Boot REST and WebSocket service storing boards and cards as MongoDB documents, with a React drag-and-drop frontend that broadcasts changes to every connected client. Board structure lives in one document where each column's cardOrder array is the source of truth for card placement and order. Concurrent moves of the same card are resolved through optimistic locking and a monotonic seq tie-break so the card is never duplicated or lost.",
  "category": "Web and Full-stack",
  "stack": [
    "Java",
    "Spring Boot",
    "MongoDB",
    "WebSocket/STOMP",
    "React",
    "TypeScript",
    "@dnd-kit",
    "Testcontainers"
  ],
  "highlights": [
    "Concurrent moves of one card resolve via the board document's optimistic @Version: one save wins, the loser re-reads and rebases, and the monotonic seq is the tie-break for the final column",
    "Two invariants hold across every operation: a card id appears in exactly one column's cardOrder, and the card's own columnId matches the column that lists it",
    "A FanoutBenchmark delivering one card-move to 500 subscriber queues sustains roughly 80,000 to 90,000 moves per second, about 40 million event deliveries per second across subscribers",
    "Presence tracking shows who is viewing the board and an activities collection feeds a live chronological feed of who did what"
  ],
  "demoConcept": "Show two cursors dragging the same card to different columns at once: optimistic-version conflict fires, the losing client re-reads and rebases, and the seq tie-break lands the card in a single column, while presence avatars and a live activity feed update across both viewers."
};

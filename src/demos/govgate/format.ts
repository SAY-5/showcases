// Small presentation helpers shared by the GovGate views. These are pure label
// and grouping helpers with no state of their own.

import type { Control, ControlStatus, Severity } from './types';

// Human label for a status, used in selectors and summaries.
export const STATUS_LABEL: Record<ControlStatus, string> = {
  met: 'Met',
  partial: 'Partial',
  'not-met': 'Not met',
  'n-a': 'N/A',
};

// The order statuses appear in the selector.
export const STATUS_ORDER: ControlStatus[] = ['met', 'partial', 'not-met', 'n-a'];

// Human label for a severity.
export const SEVERITY_LABEL: Record<Severity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

// Group controls by category, preserving first-seen order, for the grouped list.
export function groupByCategory(controls: Control[]): {
  category: string;
  controls: Control[];
}[] {
  const order: string[] = [];
  const map = new Map<string, Control[]>();
  for (const control of controls) {
    if (!map.has(control.category)) {
      order.push(control.category);
      map.set(control.category, []);
    }
    map.get(control.category)!.push(control);
  }
  return order.map((category) => ({
    category,
    controls: map.get(category)!,
  }));
}

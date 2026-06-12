import { useState } from 'react';
import '../styles/demo.css';
import './convoengine.css';
import type { ChoiceNode, FlowNode, MessageNode } from './convoengine/types';
import {
  addNode,
  addOption,
  deleteNode,
  deleteOption,
  resetFlow,
  setMessageNext,
  setNodeLabel,
  setNodeText,
  setOptionLabel,
  setOptionTarget,
  setStart,
  useFlow,
} from './convoengine/store';

// A target picker shared by message `next` and choice option targets. It lists
// every node in the flow plus an explicit "ends here" entry (null target).
function TargetSelect({
  value,
  nodes,
  selfId,
  onChange,
  label,
}: {
  value: string | null;
  nodes: FlowNode[];
  selfId: string;
  onChange: (to: string | null) => void;
  label: string;
}) {
  return (
    <label className="ceb__target">
      <span className="ceb__target-label">{label}</span>
      <select
        className="ceb__select"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      >
        <option value="">ends here</option>
        {nodes.map((n) => (
          <option key={n.id} value={n.id}>
            {n.label} ({n.id}){n.id === selfId ? ' [self]' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function MessageEditor({ node, nodes }: { node: MessageNode; nodes: FlowNode[] }) {
  return (
    <div className="ceb__body">
      <label className="ceb__field">
        <span className="ceb__field-label">Message text</span>
        <textarea
          className="ceb__textarea"
          value={node.text}
          rows={2}
          placeholder="What this step says"
          onChange={(e) => setNodeText(node.id, e.target.value)}
        />
      </label>
      <TargetSelect
        label="Then go to"
        value={node.next}
        nodes={nodes}
        selfId={node.id}
        onChange={(to) => setMessageNext(node.id, to)}
      />
    </div>
  );
}

function ChoiceEditor({ node, nodes }: { node: ChoiceNode; nodes: FlowNode[] }) {
  return (
    <div className="ceb__body">
      <label className="ceb__field">
        <span className="ceb__field-label">Prompt text</span>
        <textarea
          className="ceb__textarea"
          value={node.text}
          rows={2}
          placeholder="What this step asks"
          onChange={(e) => setNodeText(node.id, e.target.value)}
        />
      </label>
      <div className="ceb__options" role="group" aria-label="Choice options">
        {node.options.map((opt) => (
          <div className="ceb__option" key={opt.id}>
            <label className="ceb__field ceb__field--grow">
              <span className="ceb__field-label">Option label</span>
              <input
                className="ceb__input"
                value={opt.label}
                placeholder="Option label"
                onChange={(e) => setOptionLabel(node.id, opt.id, e.target.value)}
              />
            </label>
            <TargetSelect
              label="Leads to"
              value={opt.to}
              nodes={nodes}
              selfId={node.id}
              onChange={(to) => setOptionTarget(node.id, opt.id, to)}
            />
            <button
              type="button"
              className="ceb__icon-btn"
              aria-label={`Delete option ${opt.label}`}
              onClick={() => deleteOption(node.id, opt.id)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="demo__btn demo__btn--ghost"
        onClick={() => addOption(node.id)}
      >
        Add option
      </button>
    </div>
  );
}

function NodeCard({
  node,
  nodes,
  isStart,
}: {
  node: FlowNode;
  nodes: FlowNode[];
  isStart: boolean;
}) {
  return (
    <li className="ceb__node" data-kind={node.kind} data-start={isStart}>
      <div className="ceb__node-head">
        <span className="ceb__kind" data-kind={node.kind}>
          {node.kind}
        </span>
        <input
          className="ceb__input ceb__node-label"
          value={node.label}
          aria-label={`Label for node ${node.id}`}
          onChange={(e) => setNodeLabel(node.id, e.target.value)}
        />
        <code className="ceb__id">{node.id}</code>
        <div className="ceb__node-actions">
          <button
            type="button"
            className="ceb__pill"
            data-on={isStart}
            aria-pressed={isStart}
            onClick={() => setStart(node.id)}
          >
            {isStart ? 'Start node' : 'Set start'}
          </button>
          <button
            type="button"
            className="ceb__icon-btn"
            aria-label={`Delete node ${node.label}`}
            onClick={() => deleteNode(node.id)}
          >
            Delete
          </button>
        </div>
      </div>
      {node.kind === 'message' && <MessageEditor node={node} nodes={nodes} />}
      {node.kind === 'choice' && <ChoiceEditor node={node} nodes={nodes} />}
      {node.kind === 'end' && (
        <div className="ceb__body">
          <label className="ceb__field">
            <span className="ceb__field-label">Closing text</span>
            <textarea
              className="ceb__textarea"
              value={node.text}
              rows={2}
              placeholder="Final message"
              onChange={(e) => setNodeText(node.id, e.target.value)}
            />
          </label>
        </div>
      )}
    </li>
  );
}

export default function ConvoengineDemo() {
  const flow = useFlow();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="demo ceb" aria-label="conversation flow builder">
      <span className="demo__tag">Interactive demo</span>
      <h3 className="demo__title">Build a branching conversation flow</h3>
      <p className="demo__lede">
        Author a scripted support flow as a graph of nodes. Add message, choice,
        and end nodes, wire each option to the node it leads to, and pick the
        node the script starts from. Everything is saved in your browser.
      </p>

      <div className="ceb__toolbar" role="group" aria-label="Add nodes">
        <button
          type="button"
          className="demo__btn"
          onClick={() => addNode('message')}
        >
          Add message
        </button>
        <button
          type="button"
          className="demo__btn"
          onClick={() => addNode('choice')}
        >
          Add choice
        </button>
        <button
          type="button"
          className="demo__btn"
          onClick={() => addNode('end')}
        >
          Add end
        </button>
        <span className="demo__hint">
          start: <code className="ceb__id">{flow.start ?? 'none'}</code>
        </span>
        {confirmReset ? (
          <span className="ceb__confirm">
            Reset to the seed flow?
            <button
              type="button"
              className="demo__btn demo__btn--ghost"
              onClick={() => {
                resetFlow();
                setConfirmReset(false);
              }}
            >
              Confirm reset
            </button>
            <button
              type="button"
              className="demo__btn demo__btn--ghost"
              onClick={() => setConfirmReset(false)}
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="demo__btn demo__btn--ghost"
            onClick={() => setConfirmReset(true)}
          >
            Reset flow
          </button>
        )}
      </div>

      <ol className="ceb__nodes">
        {flow.nodes.length === 0 && (
          <li className="ceb__empty">
            No nodes yet. Add a message, choice, or end node to begin.
          </li>
        )}
        {flow.nodes.map((node) => (
          <NodeCard
            key={node.id}
            node={node}
            nodes={flow.nodes}
            isStart={node.id === flow.start}
          />
        ))}
      </ol>
    </div>
  );
}

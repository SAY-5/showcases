import { useMemo, useState } from 'react';
import '../styles/demo.css';
import './clientflow.css';
import {
  fieldByName,
  opsForType,
  schema,
  type Action,
  type Condition,
  type FieldDef,
  type FieldValue,
  type Operator,
  type Rule,
} from './clientflow/types';
import { describeAction, describeCondition } from './clientflow/engine';
import { useStore } from './clientflow/state';
import { addRule, deleteRule, toggleRule } from './clientflow/store';

// In-browser no-code rules engine. The schema, condition tree, actions, and the
// safe interpreter all run client-side; the rule set persists in localStorage.
// A rule is field <op> value with an action, and the builder only ever produces
// data the interpreter walks, never a string it runs as code.

type View = 'build' | 'run' | 'versions';

// Coerce the raw value box into the type the chosen field declares, so the
// stored condition value always matches the field type the engine validates.
function coerceValue(field: FieldDef, raw: string): FieldValue {
  if (field.type === 'number') return Number(raw) || 0;
  if (field.type === 'boolean') return raw === 'true';
  return raw;
}

export default function ClientflowDemo() {
  const state = useStore();
  const [view, setView] = useState<View>('build');

  return (
    <div className="demo" aria-label="clientflow rules engine">
      <span className="demo__tag">Interactive app</span>
      <h3 className="demo__title">Author, test, and version no-code rules</h3>
      <p className="demo__lede">
        Build a rule as a typed condition over the input schema with an action
        to fire. The interpreter walks the tree as plain data and never runs a
        rule as code. Publish snapshots the set into a retained version you can
        dry-run and activate.
      </p>

      <div className="cf__tabs" role="tablist" aria-label="rules engine views">
        <TabButton id="build" view={view} setView={setView} label="Builder" />
        <TabButton id="run" view={view} setView={setView} label="Test runner" />
        <TabButton id="versions" view={view} setView={setView} label="Versions" />
      </div>

      {view === 'build' && <Builder rules={state.draft} />}
      {view === 'run' && <RunPlaceholder />}
      {view === 'versions' && <VersionsPlaceholder />}
    </div>
  );
}

function TabButton({
  id,
  view,
  setView,
  label,
}: {
  id: View;
  view: View;
  setView: (v: View) => void;
  label: string;
}) {
  const active = view === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`cf__tab${active ? ' cf__tab--active' : ''}`}
      onClick={() => setView(id)}
    >
      {label}
    </button>
  );
}

function Builder({ rules }: { rules: Rule[] }) {
  return (
    <div className="cf__stage">
      <RuleForm />
      <div className="cf__list" aria-label="active draft rules">
        <div className="cf__list-head">
          Draft rules
          <span className="cf__count">{rules.length}</span>
        </div>
        {rules.length === 0 && (
          <p className="cf__empty">No rules yet. Add one above.</p>
        )}
        {rules.map((rule) => (
          <RuleRow key={rule.id} rule={rule} />
        ))}
      </div>
    </div>
  );
}

function RuleForm() {
  const [name, setName] = useState('');
  const [field, setField] = useState(schema[0].name);
  const [op, setOp] = useState<Operator>(opsForType(schema[0].type)[0]);
  const [value, setValue] = useState('');
  const [actionKind, setActionKind] = useState<Action['kind']>('flag');
  const [actionArg, setActionArg] = useState('');
  const [actionValue, setActionValue] = useState('');

  const def = useMemo(() => fieldByName(field) ?? schema[0], [field]);
  const ops = opsForType(def.type);

  function onFieldChange(next: string) {
    setField(next);
    const nd = fieldByName(next) ?? schema[0];
    setOp(opsForType(nd.type)[0]);
    setValue('');
  }

  function buildAction(): Action {
    if (actionKind === 'set') {
      const num = Number(actionValue);
      const value: FieldValue =
        actionValue.trim() !== '' && !Number.isNaN(num) ? num : actionValue;
      return { kind: 'set', key: actionArg.trim(), value };
    }
    if (actionKind === 'flag') return { kind: 'flag', name: actionArg.trim() };
    return { kind: 'route', to: actionArg.trim() };
  }

  function onAdd() {
    const cond: Condition = {
      kind: 'cmp',
      field: def.name,
      op,
      value: coerceValue(def, value),
    };
    addRule(name.trim() || 'Untitled rule', cond, buildAction());
    setName('');
    setValue('');
    setActionArg('');
    setActionValue('');
  }

  return (
    <form
      className="cf__form"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd();
      }}
      aria-label="add a rule"
    >
      <div className="cf__form-head">New rule</div>
      <div className="cf__form-row">
        <label className="cf__lbl cf__lbl--wide">
          <span className="cf__lbl-text">Name</span>
          <input
            className="cf__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="High value review"
          />
        </label>
      </div>

      <div className="cf__form-row">
        <span className="cf__when">when</span>
        <label className="cf__lbl">
          <span className="cf__lbl-text">Field</span>
          <select
            className="cf__select"
            value={field}
            onChange={(e) => onFieldChange(e.target.value)}
          >
            {schema.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="cf__lbl">
          <span className="cf__lbl-text">Operator</span>
          <select
            className="cf__select"
            value={op}
            onChange={(e) => setOp(e.target.value as Operator)}
          >
            {ops.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className="cf__lbl">
          <span className="cf__lbl-text">Value</span>
          <ValueInput def={def} value={value} onChange={setValue} />
        </label>
      </div>

      <div className="cf__form-row">
        <span className="cf__when">then</span>
        <label className="cf__lbl">
          <span className="cf__lbl-text">Action</span>
          <select
            className="cf__select"
            value={actionKind}
            onChange={(e) => setActionKind(e.target.value as Action['kind'])}
          >
            <option value="flag">flag</option>
            <option value="set">set</option>
            <option value="route">route</option>
          </select>
        </label>
        <label className="cf__lbl">
          <span className="cf__lbl-text">
            {actionKind === 'set' ? 'key' : actionKind === 'route' ? 'target' : 'name'}
          </span>
          <input
            className="cf__input"
            value={actionArg}
            onChange={(e) => setActionArg(e.target.value)}
            placeholder={actionKind === 'set' ? 'discount' : 'manual-review'}
          />
        </label>
        {actionKind === 'set' && (
          <label className="cf__lbl">
            <span className="cf__lbl-text">value</span>
            <input
              className="cf__input"
              value={actionValue}
              onChange={(e) => setActionValue(e.target.value)}
              placeholder="0.15"
            />
          </label>
        )}
      </div>

      <div className="cf__form-actions">
        <button type="submit" className="demo__btn">
          Add rule
        </button>
      </div>
    </form>
  );
}

function ValueInput({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  if (def.type === 'boolean') {
    return (
      <select
        className="cf__select"
        value={value || 'true'}
        onChange={(e) => onChange(e.target.value)}
        aria-label="value"
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  if (def.type === 'string' && def.options) {
    return (
      <select
        className="cf__select"
        value={value || def.options[0]}
        onChange={(e) => onChange(e.target.value)}
        aria-label="value"
      >
        {def.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      className="cf__input"
      type={def.type === 'number' ? 'number' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="value"
      placeholder={def.type === 'number' ? '500' : 'value'}
    />
  );
}

function RuleRow({ rule }: { rule: Rule }) {
  return (
    <div className="cf__rule" data-enabled={String(rule.enabled)}>
      <div className="cf__rule-main">
        <span className="cf__rule-name">{rule.name}</span>
        <span className="cf__rule-body">
          <span className="cf__kw">when</span> {describeCondition(rule.when)}{' '}
          <span className="cf__kw">then</span> {describeAction(rule.then)}
        </span>
      </div>
      <div className="cf__rule-tools">
        <button
          type="button"
          className="cf__chip"
          data-on={String(rule.enabled)}
          aria-pressed={rule.enabled}
          onClick={() => toggleRule(rule.id)}
        >
          {rule.enabled ? 'enabled' : 'off'}
        </button>
        <button
          type="button"
          className="cf__chip cf__chip--danger"
          aria-label={`delete ${rule.name}`}
          onClick={() => deleteRule(rule.id)}
        >
          delete
        </button>
      </div>
    </div>
  );
}

function RunPlaceholder() {
  return <p className="cf__empty">Test runner is in the next step.</p>;
}

function VersionsPlaceholder() {
  return <p className="cf__empty">Versioning is in the next step.</p>;
}

import { useState } from 'react';
import '../styles/demo.css';
import './taskboard.css';
import { COLUMN_ORDER, type ColumnId } from './taskboard/data';
import { useStore } from './taskboard/state';
import {
  addCard,
  deleteCard,
  editCard,
  invariantsHold,
} from './taskboard/store';

// In-browser TaskBoard. The whole board is one optimistic-locked document:
// columns own an ordered list of card ids and each card records its columnId.
// Cards persist in localStorage, so they survive a reload. Adding, editing,
// deleting, and moving a card all bump the document @Version. Concurrent moves
// of the same card race on that version: one save wins, the loser re-reads head
// and rebases, and a monotonic seq is the tie-break for the final column. Two
// invariants hold after any commit: a card id sits in exactly one column's
// cardOrder, and the card's columnId matches the column listing it.

type Draft = { title: string; note: string };
const EMPTY: Draft = { title: '', note: '' };

export default function TaskboardDemo() {
  const state = useStore();
  const { board } = state;
  const [composer, setComposer] = useState<ColumnId | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY);

  const total = Object.keys(board.cards).length;
  const ok = invariantsHold(board);

  function openComposer(col: ColumnId) {
    setComposer(col);
    setDraft(EMPTY);
  }

  function submitComposer(col: ColumnId) {
    if (!draft.title.trim()) return;
    addCard(draft.title, draft.note, col);
    setDraft(EMPTY);
    setComposer(null);
  }

  function startEdit(id: string, title: string, note: string) {
    setEditing(id);
    setEditDraft({ title, note });
  }

  function submitEdit(id: string) {
    if (!editDraft.title.trim()) return;
    editCard(id, editDraft.title, editDraft.note);
    setEditing(null);
  }

  return (
    <div className="demo" aria-label="TaskBoard application">
      <span className="demo__tag">Interactive app</span>
      <h3 className="demo__title">TaskBoard</h3>
      <p className="demo__lede">
        A working Kanban board that runs fully in the browser. Add, edit, and
        delete cards across three columns. The board is one optimistic-locked
        document and every change persists in localStorage, so it survives a
        reload.
      </p>

      <div className="tbk">
        <div className="tbk__bar">
          <span className="tbk__bar-meta" aria-live="polite">
            board @Version {board.version}
          </span>
          <span className="tbk__bar-meta">{total} cards</span>
          <span
            className={`tbk__inv ${ok ? 'tbk__inv--ok' : 'tbk__inv--bad'}`}
            aria-live="polite"
          >
            {ok ? 'invariants hold' : 'invariant broken'}
          </span>
        </div>

        <div className="tbk__board">
          {COLUMN_ORDER.map((colId) => {
            const col = board.columns.find((c) => c.id === colId);
            if (!col) return null;
            return (
              <section
                key={col.id}
                className="tbk__col"
                aria-label={`${col.label} column`}
              >
                <header className="tbk__col-head">
                  <h4 className="tbk__col-name">{col.label}</h4>
                  <span className="tbk__col-count" aria-label="card count">
                    {col.cardOrder.length}
                  </span>
                </header>

                <ul className="tbk__list">
                  {col.cardOrder.map((cardId) => {
                    const card = board.cards[cardId];
                    if (!card) return null;
                    if (editing === card.id) {
                      return (
                        <li key={card.id} className="tbk__card tbk__card--edit">
                          <CardForm
                            draft={editDraft}
                            setDraft={setEditDraft}
                            onSubmit={() => submitEdit(card.id)}
                            onCancel={() => setEditing(null)}
                            submitLabel="Save"
                          />
                        </li>
                      );
                    }
                    return (
                      <li key={card.id} className="tbk__card">
                        <div className="tbk__card-main">
                          <span className="tbk__card-id">{card.id}</span>
                          <span className="tbk__card-title">{card.title}</span>
                          {card.note && (
                            <span className="tbk__card-note">{card.note}</span>
                          )}
                        </div>
                        <div className="tbk__card-actions">
                          <button
                            type="button"
                            className="tbk__icon"
                            onClick={() =>
                              startEdit(card.id, card.title, card.note)
                            }
                            aria-label={`Edit ${card.title}`}
                          >
                            edit
                          </button>
                          <button
                            type="button"
                            className="tbk__icon tbk__icon--danger"
                            onClick={() => deleteCard(card.id)}
                            aria-label={`Delete ${card.title}`}
                          >
                            delete
                          </button>
                        </div>
                      </li>
                    );
                  })}
                  {col.cardOrder.length === 0 && (
                    <li className="tbk__empty">No cards</li>
                  )}
                </ul>

                {composer === col.id ? (
                  <div className="tbk__composer">
                    <CardForm
                      draft={draft}
                      setDraft={setDraft}
                      onSubmit={() => submitComposer(col.id)}
                      onCancel={() => setComposer(null)}
                      submitLabel="Add card"
                      autoFocus
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="tbk__add"
                    onClick={() => openComposer(col.id)}
                  >
                    + Add card
                  </button>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type CardFormProps = {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  autoFocus?: boolean;
};

function CardForm({
  draft,
  setDraft,
  onSubmit,
  onCancel,
  submitLabel,
  autoFocus,
}: CardFormProps) {
  return (
    <form
      className="tbk__form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <input
        className="tbk__input"
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        placeholder="Card title"
        aria-label="Card title"
        autoFocus={autoFocus}
      />
      <input
        className="tbk__input"
        value={draft.note}
        onChange={(e) => setDraft({ ...draft, note: e.target.value })}
        placeholder="Note (optional)"
        aria-label="Card note"
      />
      <div className="tbk__form-actions">
        <button
          type="submit"
          className="tbk__btn"
          disabled={!draft.title.trim()}
        >
          {submitLabel}
        </button>
        <button
          type="button"
          className="tbk__btn tbk__btn--ghost"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

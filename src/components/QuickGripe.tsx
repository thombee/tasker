import { Dispatch, useEffect, useRef, useState } from 'react';
import { TopAction } from '../model/store';

interface Props {
  dispatch: Dispatch<TopAction>;
}

// Always-present, out-of-the-way capture for a passing complaint — one tap,
// type, Enter, and it's in the gripe log without leaving whatever you're
// doing. The floating button sits in every mode.
export default function QuickGripe({ dispatch }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [flash, setFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function save() {
    if (text.trim()) {
      dispatch({ type: 'addGripe', text });
      setText('');
      setFlash(true);
      setTimeout(() => setFlash(false), 1200);
    }
    setOpen(false);
  }

  return (
    <div className="quick-gripe">
      {open ? (
        <div className="quick-gripe-box">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') {
                setText('');
                setOpen(false);
              }
            }}
            onBlur={save}
            placeholder="What's bugging you?"
          />
        </div>
      ) : (
        <button
          className={`quick-gripe-fab${flash ? ' flash' : ''}`}
          title="Log a gripe (goes to your Gripes list)"
          onClick={() => setOpen(true)}
        >
          {flash ? '✓' : '🗯'}
        </button>
      )}
    </div>
  );
}

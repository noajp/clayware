/** @vitest-environment jsdom */
//
// QuickAdd is the only way to add an Element — the in-list add row was removed
// in favour of the section "+", which opens this popup. So the thing worth
// pinning down is that it does not close itself after every create, and that
// what it keeps between creates is exactly the batch's shared context.
//
// This is the first test in the suite that renders a component. It exists
// because the behaviour it covers cannot be checked any other way: tsc and
// design-lint both pass on a version of this popup that closes on every Enter.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QuickAddElementPopup } from '@/ActivitySpace/execution/element/QuickAddElementPopup';
import { clearToasts, getToasts } from '@/Function/shared/toastStore';

// The created toast — the only evidence a create landed, now that the popup
// stays open.
const lastToast = () => getToasts().at(-1);

// The Type pill's icons are read from the Domains; this test has none.
vi.mock('@/Function/shared/elementTypeIcon', () => ({ useTypeIcons: () => new Map(), TypeMark: () => null }));

afterEach(() => { cleanup(); clearToasts(); });

function setup(overrides: Partial<Parameters<typeof QuickAddElementPopup>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <QuickAddElementPopup
      open
      onClose={onClose}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  const title = screen.getByPlaceholderText(/Element title/i) as HTMLTextAreaElement;
  const description = screen.getByPlaceholderText(/Add description/i) as HTMLTextAreaElement;
  return { onSubmit, onClose, title, description };
}

async function createWith(title: HTMLTextAreaElement, text: string, modifiers: object = {}) {
  fireEvent.change(title, { target: { value: text } });
  fireEvent.keyDown(title, { key: 'Enter', ...modifiers });
  // handleSubmit awaits onSubmit before touching state.
  await vi.waitFor(() => undefined);
}

describe('QuickAdd continuous create', () => {
  it('stays open after Enter and clears the title and description', async () => {
    const { onSubmit, onClose, title, description } = setup();
    fireEvent.change(description, { target: { value: 'shared context' } });

    await createWith(title, 'first');

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual([
      expect.objectContaining({ title: 'first', description: 'shared context' }),
    ]);

    // The point of the whole change: the popup is still here.
    expect(onClose).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(title.value).toBe(''));
    // The description belonged to the Element just made; text left behind
    // reads as "not saved yet".
    expect(description.value).toBe('');
  });

  it('saves to My Elements when no Object is picked and says so', async () => {
    const { onSubmit, title } = setup({ canSaveToPersonal: true, objects: [{ id: 'o1', name: 'Launch' }] });
    // The Save to pill names the real destination before the create...
    expect(screen.getByRole('button', { name: /My Elements/ })).toBeTruthy();

    await createWith(title, 'first');

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual([expect.objectContaining({ personal: true, objectId: null })]);
    // ...and the confirmation names it after.
    await vi.waitFor(() => expect(lastToast()).toMatchObject({ kind: 'success', message: 'Created in My Elements', detail: 'first' }));
  });

  it('names the Object it landed in and the Element, ID first', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      count: 1,
      created: [{ id: 'e7', title: 'first', displayId: 'ELE-7', status: 'todo', objectId: 'o1' }],
    });
    render(<QuickAddElementPopup open onClose={vi.fn()} onSubmit={onSubmit} defaultObjectId="o1" objects={[{ id: 'o1', name: 'Launch' }]} />);

    await createWith(screen.getByPlaceholderText(/Element title/i) as HTMLTextAreaElement, 'first');

    await vi.waitFor(() => expect(lastToast()).toMatchObject({
      message: 'Created in Launch', detail: 'ELE-7 – first', elementStatus: 'todo', action: { label: 'Open' },
    }));
  });

  it('closes on Cmd+Enter, the way out for wanting only one', async () => {
    const { onSubmit, onClose, title } = setup();

    await createWith(title, 'just the one', { metaKey: true });

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('closes on Ctrl+Enter too, for people not on a Mac', async () => {
    const { onClose, title } = setup();

    await createWith(title, 'just the one', { ctrlKey: true });

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('reports what the sitting has produced', async () => {
    const { title } = setup();

    expect(getToasts()).toHaveLength(0);

    await createWith(title, 'first');
    await vi.waitFor(() => expect(lastToast()?.detail).toBe('first'));

    await createWith(title, 'second');
    await vi.waitFor(() => expect(lastToast()?.detail).toBe('second'));
  });

  it('counts every line of a multi-line paste', async () => {
    const { onSubmit, title } = setup();

    await createWith(title, 'one\ntwo\nthree');

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toHaveLength(3);
    await vi.waitFor(() => expect(lastToast()?.detail).toBe('3 Elements'));
  });

  it('does not fire a second create while the first is still in flight', async () => {
    let release: () => void = () => {};
    const onSubmit = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { release = () => resolve(); }),
    );
    render(<QuickAddElementPopup open onClose={vi.fn()} onSubmit={onSubmit} />);
    const title = screen.getByPlaceholderText(/Element title/i);

    fireEvent.change(title, { target: { value: 'leaning on Enter' } });
    fireEvent.keyDown(title, { key: 'Enter' });
    fireEvent.keyDown(title, { key: 'Enter' });
    fireEvent.keyDown(title, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    release();
  });

  it('claims nothing and keeps the text when the create fails', async () => {
    // The confirmation is the only evidence the user gets that a create landed,
    // now that the popup no longer closes to say so. It must not fire on a
    // rejected submit, and the typed title has to survive so the attempt is
    // not silently lost.
    const onSubmit = vi.fn().mockRejectedValue(new Error('insert failed'));
    const onClose = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<QuickAddElementPopup open onClose={onClose} onSubmit={onSubmit} />);
    const title = screen.getByPlaceholderText(/Element title/i) as HTMLTextAreaElement;

    await createWith(title, 'this one will not land');

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(getToasts()).toHaveLength(0);
    await vi.waitFor(() => expect(screen.getByRole('status').textContent).toContain('Could not create it'));
    expect(title.value).toBe('this one will not land');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores Enter while an IME composition is open', async () => {
    const { onSubmit, title } = setup();

    fireEvent.change(title, { target: { value: 'にほんご' } });
    fireEvent.keyDown(title, { key: 'Enter', isComposing: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import { cleanNouns, nounTable, pluralOf, renameNouns } from '@/Function/i18n/spaceNouns';

describe('pluralOf', () => {
  it('gives English-looking names an English plural and leaves other scripts alone', () => {
    expect(pluralOf('Task')).toBe('Tasks');
    expect(pluralOf('Story')).toBe('Stories');
    expect(pluralOf('Process')).toBe('Processes');
    expect(pluralOf('Key day')).toBe('Key days');
    expect(pluralOf('タスク')).toBe('タスク');
  });
});

describe('nounTable', () => {
  it('is null when the Space keeps the built-in names', () => {
    expect(nounTable(null)).toBeNull();
    expect(nounTable({})).toBeNull();
    expect(nounTable({ element: '  ', object: 'Object' })).toBeNull();
  });

  it('fills a plural from the singular, and a Japanese singular from its plural', () => {
    expect(nounTable({ element: 'Task' })).toEqual({ Element: 'Task', Elements: 'Tasks' });
    expect(nounTable({ objects: 'プロジェクト' })).toEqual({ Object: 'プロジェクト', Objects: 'プロジェクト' });
    expect(nounTable({ strategy: 'Goal', strategies: 'Goals list' })).toEqual({ Strategy: 'Goal', Strategies: 'Goals list' });
  });
});

describe('renameNouns', () => {
  const en = nounTable({ element: 'Task', object: 'Project', strategy: 'Objective' });

  it('renames whole nouns only, singular and plural', () => {
    expect(renameNouns('Add Elements to this Object', en, 'en')).toBe('Add Tasks to this Project');
    expect(renameNouns('Strategies and Strategy', en, 'en')).toBe('Objectives and Objective');
    expect(renameNouns('ElementTemplate, SubElement, element', en, 'en')).toBe('ElementTemplate, SubElement, element');
    expect(renameNouns('My Elements', en, 'en')).toBe('My Tasks');
  });

  it('leaves placeholders for values untouched, and nothing when there is no table', () => {
    expect(renameNouns('{count} Elements in {name}', en, 'en')).toBe('{count} Tasks in {name}');
    expect(renameNouns('Add Elements', null, 'en')).toBe('Add Elements');
  });

  it('fixes a/an in English', () => {
    expect(renameNouns('Create an Element', en, 'en')).toBe('Create a Task');
    expect(renameNouns('A Strategy needs an Object.', en, 'en')).toBe('An Objective needs a Project.');
  });

  it('drops the spaces Japanese text sets around an English noun when the name is Japanese', () => {
    const ja = nounTable({ element: 'タスク', object: 'プロジェクト' });
    expect(renameNouns('この Object に Element を追加', ja, 'ja')).toBe('このプロジェクトにタスクを追加');
    expect(renameNouns('Element 3 件', ja, 'ja')).toBe('タスク 3 件');
    // An English name keeps the spacing.
    expect(renameNouns('この Object に追加', nounTable({ object: 'Project' }), 'ja')).toBe('この Project に追加');
  });
});

describe('cleanNouns', () => {
  it('trims, caps and drops empties and unknown keys', () => {
    expect(cleanNouns({ element: '  Task ', elements: '', object: 'x'.repeat(50) } as never)).toEqual({ element: 'Task', object: 'x'.repeat(40) });
  });
});

import { describe, expect, it } from 'vitest';

import {
  blockToMarkdown,
  filterBlockCommands,
  parseNoteMarkdown,
  serializeNoteBlocks,
} from './note-blocks';

describe('note-blocks', () => {
  it('convierte títulos, listas y citas en bloques y los devuelve iguales', () => {
    const markdown = '# Introducción\n\n- uno\n- dos\n\n> una cita';

    const blocks = parseNoteMarkdown(markdown);

    expect(blocks.map((block) => block.type)).toEqual([
      'heading1',
      'bullet',
      'bullet',
      'quote',
    ]);
    expect(serializeNoteBlocks(blocks)).toBe(markdown);
  });

  it('mantiene juntos los bloques de código y las tablas', () => {
    const markdown =
      '```ts\nconst a = 1;\nconst b = 2;\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |';

    const blocks = parseNoteMarkdown(markdown);

    expect(blocks.map((block) => block.type)).toEqual(['code', 'table']);
    expect(blocks[0].lang).toBe('ts');
    expect(blocks[0].text).toBe('const a = 1;\nconst b = 2;');
    expect(serializeNoteBlocks(blocks)).toBe(markdown);
  });

  it('respeta el orden de las imágenes respecto al texto', () => {
    const markdown = '![Uno](/media/notes/a?v=1)\n\ntexto entre imágenes\n\n![Dos](/media/notes/b?v=2)';

    const blocks = parseNoteMarkdown(markdown);

    expect(blocks.map((block) => block.type)).toEqual(['image', 'paragraph', 'image']);
    expect(blocks.filter((block) => block.type === 'image').map((block) => block.url)).toEqual([
      '/media/notes/a?v=1',
      '/media/notes/b?v=2',
    ]);
    expect(serializeNoteBlocks(blocks)).toBe(markdown);
  });

  it('serializa el contenido vacío sin bloques sobrantes', () => {
    expect(serializeNoteBlocks(parseNoteMarkdown(''))).toBe('');
    expect(blockToMarkdown({ id: 'x', type: 'divider', text: '' })).toBe('---');
  });

  it('filtra los comandos «/» por nombre y por alias', () => {
    expect(filterBlockCommands('tabla').map((command) => command.type)).toEqual(['table']);
    expect(filterBlockCommands('h2').map((command) => command.type)).toEqual(['heading2']);
    expect(filterBlockCommands('codigo').map((command) => command.type)).toEqual(['code']);
    expect(filterBlockCommands('').length).toBe(filterBlockCommands(' ').length);
    expect(filterBlockCommands('zzz')).toEqual([]);
  });
});

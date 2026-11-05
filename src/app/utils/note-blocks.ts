/**
 * Un apunte se guarda en el backend como Markdown, pero en el editor se trabaja
 * con bloques (título, párrafo, lista, código, tabla, imagen…), como en Notion.
 * Aquí viven la conversión en los dos sentidos y los comandos «/».
 */

export type NoteBlockType =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bullet'
  | 'number'
  | 'quote'
  | 'code'
  | 'table'
  | 'divider'
  | 'image'
  | 'pdf';

export interface NoteBlock {
  id: string;
  type: NoteBlockType;
  /** Texto del bloque. En las imágenes es el texto alternativo. */
  text: string;
  /** Solo imágenes: ruta o URL de la imagen. */
  url?: string;
  /** Solo código: lenguaje del bloque. */
  lang?: string;
}

export interface BlockCommand {
  type: NoteBlockType;
  label: string;
  hint: string;
  icon: string;
  alias: string;
  keywords: string[];
}

/** Plantilla inicial de una tabla nueva (se edita como Markdown). */
export const TABLE_TEMPLATE = '| Columna 1 | Columna 2 |\n| --- | --- |\n|  |  |';

export const BLOCK_COMMANDS: readonly BlockCommand[] = [
  {
    type: 'paragraph',
    label: 'Texto',
    hint: 'Un párrafo normal',
    icon: 'lucideType',
    alias: 'texto',
    keywords: ['texto', 'parrafo', 'paragraph', 'p', 'normal'],
  },
  {
    type: 'heading1',
    label: 'Título 1',
    hint: 'Encabezado grande',
    icon: 'lucideHeading1',
    alias: 'h1',
    keywords: ['h1', 'titulo 1', 'titulo', 'encabezado', 'heading'],
  },
  {
    type: 'heading2',
    label: 'Título 2',
    hint: 'Encabezado mediano',
    icon: 'lucideHeading2',
    alias: 'h2',
    keywords: ['h2', 'titulo 2', 'subtitulo', 'encabezado'],
  },
  {
    type: 'heading3',
    label: 'Título 3',
    hint: 'Encabezado pequeño',
    icon: 'lucideHeading3',
    alias: 'h3',
    keywords: ['h3', 'titulo 3', 'subtitulo', 'encabezado'],
  },
  {
    type: 'bullet',
    label: 'Lista con viñetas',
    hint: 'Puntos sin numerar',
    icon: 'lucideList',
    alias: 'lista',
    keywords: ['lista', 'vinetas', 'bullet', 'ul', 'puntos'],
  },
  {
    type: 'number',
    label: 'Lista numerada',
    hint: 'Pasos en orden',
    icon: 'lucideListOrdered',
    alias: 'numerada',
    keywords: ['numerada', 'numero', 'ordered', 'ol', 'pasos'],
  },
  {
    type: 'quote',
    label: 'Cita',
    hint: 'Texto destacado a la izquierda',
    icon: 'lucideQuote',
    alias: 'cita',
    keywords: ['cita', 'quote', 'blockquote', 'destacado'],
  },
  {
    type: 'code',
    label: 'Código',
    hint: 'Bloque monoespaciado',
    icon: 'lucideCode',
    alias: 'code',
    keywords: ['codigo', 'code', 'pre', 'fragmento'],
  },
  {
    type: 'table',
    label: 'Tabla',
    hint: 'Filas y columnas en Markdown',
    icon: 'lucideTable',
    alias: 'tabla',
    keywords: ['tabla', 'table', 'filas', 'columnas'],
  },
  {
    type: 'divider',
    label: 'Divisor',
    hint: 'Línea para separar secciones',
    icon: 'lucideMinus',
    alias: 'divisor',
    keywords: ['divisor', 'separador', 'linea', 'hr', 'divider'],
  },
  {
    type: 'image',
    label: 'Imagen',
    hint: 'Sube una foto al apunte',
    icon: 'lucideImage',
    alias: 'imagen',
    keywords: ['imagen', 'image', 'img', 'foto', 'captura'],
  },
  {
    type: 'pdf',
    label: 'PDF',
    hint: 'Adjunta un documento en PDF',
    icon: 'lucideFileText',
    alias: 'pdf',
    keywords: ['pdf', 'documento', 'document', 'archivo'],
  },
];

let blockSequence = 0;

export function createBlock(
  type: NoteBlockType,
  text = '',
  extra: Partial<NoteBlock> = {},
): NoteBlock {
  blockSequence += 1;
  return { id: `blk-${blockSequence.toString(36)}-${Date.now().toString(36)}`, type, text, ...extra };
}

/** Convierte el Markdown guardado en bloques editables. */
export function parseNoteMarkdown(markdown: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  const lines = (markdown || '').replace(/\r\n/g, '\n').split('\n');
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join('\n');
    paragraph = [];
    if (text.trim()) blocks.push(createBlock('paragraph', text));
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    // Bloque de código ```...```
    const fence = trimmed.match(/^```(\w*)\s*$/);
    if (fence) {
      flushParagraph();
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        body.push(lines[index]);
        index += 1;
      }
      blocks.push(createBlock('code', body.join('\n'), { lang: fence[1] || '' }));
      continue;
    }

    // Tabla: filas consecutivas que empiezan por «|»
    if (trimmed.startsWith('|')) {
      flushParagraph();
      const rows = [trimmed];
      while (index + 1 < lines.length && lines[index + 1].trim().startsWith('|')) {
        index += 1;
        rows.push(lines[index].trim());
      }
      blocks.push(createBlock('table', rows.join('\n')));
      continue;
    }

    const image = trimmed.match(/^!\[(.*?)\]\((\S+?)\)$/);
    if (image) {
      flushParagraph();
      blocks.push(createBlock('image', image[1], { url: image[2] }));
      continue;
    }

    // PDF adjunto: enlace del apunte a la ruta de archivos de la API.
    const pdf = trimmed.match(/^\[(.+?)\]\((\/media\/notes\/files\/\S+?)\)$/);
    if (pdf) {
      flushParagraph();
      blocks.push(createBlock('pdf', pdf[1], { url: pdf[2] }));
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      const level = Math.min(3, heading[1].length);
      blocks.push(
        createBlock(`heading${level}` as NoteBlockType, heading[2].trim()),
      );
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      blocks.push(createBlock('divider'));
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      blocks.push(createBlock('bullet', bullet[1]));
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ordered) {
      flushParagraph();
      blocks.push(createBlock('number', ordered[1]));
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      blocks.push(createBlock('quote', quote[1]));
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  return blocks.length ? blocks : [createBlock('paragraph')];
}

/** Markdown de un solo bloque. */
export function blockToMarkdown(block: NoteBlock): string {
  const text = (block.text || '').replace(/\s+$/, '');

  switch (block.type) {
    case 'heading1':
      return text ? `# ${text}` : '';
    case 'heading2':
      return text ? `## ${text}` : '';
    case 'heading3':
      return text ? `### ${text}` : '';
    case 'bullet':
      return text
        .split('\n')
        .map((line) => `- ${line}`.trimEnd())
        .join('\n');
    case 'number':
      return text
        .split('\n')
        .map((line) => `1. ${line}`.trimEnd())
        .join('\n');
    case 'quote':
      return text
        .split('\n')
        .map((line) => `> ${line}`.trimEnd())
        .join('\n');
    case 'code':
      return `\`\`\`${block.lang || ''}\n${(block.text || '').replace(/\n$/, '')}\n\`\`\``;
    case 'table':
      return text;
    case 'divider':
      return '---';
    case 'image':
      return block.url ? `![${block.text || 'Imagen'}](${block.url})` : '';
    case 'pdf':
      return block.url ? `[${block.text || 'PDF'}](${block.url})` : '';
    default:
      return text;
  }
}

/**
 * Markdown completo del apunte (los bloques vacíos no se guardan). Los ítems de
 * una misma lista van pegados: con una línea en blanco entre ellos, Markdown los
 * renderiza como listas separadas.
 */
export function serializeNoteBlocks(blocks: NoteBlock[]): string {
  const parts = blocks
    .map((block) => ({ type: block.type, value: blockToMarkdown(block) }))
    .filter((part) => part.value.trim().length > 0);

  let markdown = '';
  parts.forEach((part, index) => {
    if (index === 0) {
      markdown = part.value;
      return;
    }
    const previous = parts[index - 1];
    const tightList =
      previous.type === part.type &&
      (part.type === 'bullet' || part.type === 'number' || part.type === 'quote');
    markdown += `${tightList ? '\n' : '\n\n'}${part.value}`;
  });

  return markdown;
}

/** Comandos «/» que coinciden con lo que se está escribiendo. */
export function filterBlockCommands(query: string): BlockCommand[] {
  const term = normalize(query);
  if (!term) return [...BLOCK_COMMANDS];
  return BLOCK_COMMANDS.filter((command) =>
    [command.label, command.type, command.alias, ...command.keywords].some((value) =>
      normalize(value).includes(term),
    ),
  );
}

function normalize(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

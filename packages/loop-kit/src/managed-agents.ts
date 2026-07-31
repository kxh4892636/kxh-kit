const MANAGED_BLOCK_NAMES = ["GENERAL RULES", "LOOP KIT"] as const;

interface ManagedBlock {
  end: number;
  innerEnd: number;
  innerStart: number;
  name: (typeof MANAGED_BLOCK_NAMES)[number];
  start: number;
  text: string;
}

const findMarkers = (content: string, marker: string): RegExpMatchArray[] => {
  const pattern = new RegExp(`^<!-- ${marker} -->[\\t ]*(?=\\r?$)`, "gm");
  return [...content.matchAll(pattern)];
};

const readManagedBlock = (
  content: string,
  name: ManagedBlock["name"],
): ManagedBlock | undefined => {
  const starts = findMarkers(content, `${name} START`);
  const ends = findMarkers(content, `${name} END`);

  if (starts.length === 0 && ends.length === 0) {
    return undefined;
  }
  if (starts.length !== 1 || ends.length !== 1) {
    throw new Error(`Invalid ${name} markers: expected one START and one END marker`);
  }

  const [startMarker] = starts;
  const [endMarker] = ends;
  const start = startMarker?.index;
  const endStart = endMarker?.index;

  if (start === undefined || endStart === undefined || start >= endStart) {
    throw new Error(`Invalid ${name} markers: START must precede END`);
  }

  const end = endStart + (endMarker?.[0].length ?? 0);
  const innerStart = start + (startMarker?.[0].length ?? 0);
  return {
    end,
    innerEnd: endStart,
    innerStart,
    name,
    start,
    text: content.slice(start, end),
  };
};

const normalizeNewlines = (content: string, newline: string): string => {
  return content.replaceAll("\r\n", "\n").replaceAll("\n", newline);
};

const validateNoOverlap = (blocks: ManagedBlock[]): void => {
  const ordered = [...blocks].sort(
    (left: ManagedBlock, right: ManagedBlock): number => left.start - right.start,
  );
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous !== undefined && current !== undefined && previous.end > current.start) {
      throw new Error(`Managed AGENTS.md blocks overlap: ${previous.name} and ${current.name}`);
    }
  }
};

const readPresentManagedBlocks = (content: string): ManagedBlock[] => {
  const blocks = MANAGED_BLOCK_NAMES.map((name: ManagedBlock["name"]): ManagedBlock | undefined =>
    readManagedBlock(content, name),
  ).filter((block: ManagedBlock | undefined): block is ManagedBlock => block !== undefined);
  validateNoOverlap(blocks);
  return blocks;
};

export const extractManagedBlocks = (content: string): ManagedBlock[] => {
  const blocks = MANAGED_BLOCK_NAMES.map((name: ManagedBlock["name"]): ManagedBlock => {
    const block = readManagedBlock(content, name);
    if (block === undefined) {
      throw new Error(`Source AGENTS.md is missing the ${name} block`);
    }
    return block;
  });
  validateNoOverlap(blocks);
  return blocks.sort((left: ManagedBlock, right: ManagedBlock): number => left.start - right.start);
};

export const createManagedAgentsFile = (source: string): string => {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  return `${extractManagedBlocks(source)
    .map((block: ManagedBlock): string => block.text)
    .join(`${newline}${newline}`)}${newline}`;
};

export const mergeManagedAgents = (source: string, target: string): string => {
  const sourceBlocks = extractManagedBlocks(source);
  readPresentManagedBlocks(target);
  const newline = target.includes("\r\n") ? "\r\n" : "\n";
  let merged = target;

  for (const sourceBlock of sourceBlocks) {
    const targetBlock = readManagedBlock(merged, sourceBlock.name);
    if (targetBlock === undefined) {
      const separator = merged.endsWith(`${newline}${newline}`)
        ? ""
        : merged.endsWith(newline)
          ? newline
          : `${newline}${newline}`;
      merged = `${merged}${separator}${normalizeNewlines(sourceBlock.text, newline)}${newline}`;
      continue;
    }

    const sourceInner = source.slice(sourceBlock.innerStart, sourceBlock.innerEnd);
    merged = `${merged.slice(0, targetBlock.innerStart)}${normalizeNewlines(sourceInner, newline)}${merged.slice(targetBlock.innerEnd)}`;
  }

  return merged;
};

export interface NumberPrefixParserResult {
  filename: string;
  numberPrefix?: number;
}

const ignoredPrefixPattern = /^\d+[-_.]\d+/;
const numberPrefixPattern = /^(?<numberPrefix>\d+)\s*[-_.]+\s*(?<suffix>[^-_.\s].*)$/;

export const defaultNumberPrefixParser = (params: {
  filename: string;
}): NumberPrefixParserResult => {
  const { filename } = params;
  if (ignoredPrefixPattern.test(filename)) {
    return { filename };
  }

  const match = numberPrefixPattern.exec(filename);
  if (!match?.groups) {
    return { filename };
  }

  return {
    filename: match.groups.suffix ?? filename,
    numberPrefix: Number.parseInt(match.groups.numberPrefix ?? "", 10),
  };
};

export const stripNumberPrefix = (params: { filename: string }): string => {
  return defaultNumberPrefixParser(params).filename;
};

export const stripPathNumberPrefixes = (params: { filePath: string }): string => {
  const { filePath } = params;
  return filePath
    .split("/")
    .map((segment) => stripNumberPrefix({ filename: segment }))
    .join("/");
};

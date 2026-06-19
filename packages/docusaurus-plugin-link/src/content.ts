import { parseMarkdownFile } from "@docusaurus/utils";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { LinkDocFrontMatter, LinkDocSource, LinkRoute, LinkRouteOptions } from "./path.ts";
import { createLinkRoute } from "./path.ts";

export interface DuplicateId {
  id: string;
  sourceFilePaths: string[];
}

export interface CreateLinkRoutesOptions extends LinkRouteOptions {
  failOnDuplicateId: boolean;
}

export type ParseFrontMatter = NonNullable<
  Parameters<typeof parseMarkdownFile>[0]["parseFrontMatter"]
>;

const isMarkdownFile = (params: { filePath: string }): boolean => {
  const { filePath } = params;
  return filePath.endsWith(".md") || filePath.endsWith(".mdx");
};

const toPosixPath = (params: { filePath: string }): string => {
  const { filePath } = params;
  return filePath.split(path.sep).join(path.posix.sep);
};

const normalizeFrontMatter = (params: {
  frontMatter: Record<string, unknown>;
  sourceFilePath: string;
}): LinkDocFrontMatter => {
  const { frontMatter, sourceFilePath } = params;
  const id = frontMatter.id;
  if (id !== undefined && (typeof id !== "string" || id.trim() === "")) {
    throw new Error(`Document "${sourceFilePath}" front matter id must be a non-empty string.`);
  }

  const slug = frontMatter.slug;
  if (slug !== undefined && typeof slug !== "string") {
    throw new Error(`Document "${sourceFilePath}" front matter slug must be a string.`);
  }

  const parseNumberPrefixes = frontMatter.parse_number_prefixes;
  if (parseNumberPrefixes !== undefined && typeof parseNumberPrefixes !== "boolean") {
    throw new Error(
      `Document "${sourceFilePath}" front matter parse_number_prefixes must be a boolean.`,
    );
  }

  return {
    id,
    slug,
    parse_number_prefixes: parseNumberPrefixes,
  };
};

const collectMarkdownFiles = async (params: { dirPath: string }): Promise<string[]> => {
  const { dirPath } = params;
  const entries = await readdir(dirPath, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        return collectMarkdownFiles({ dirPath: entryPath });
      }

      return entry.isFile() && isMarkdownFile({ filePath: entryPath }) ? [entryPath] : [];
    }),
  );

  return nestedFiles.flat().sort();
};

export const readMarkdownDoc = async (params: {
  contentPath: string;
  filePath: string;
  siteDir: string;
  parseFrontMatter: ParseFrontMatter;
}): Promise<LinkDocSource> => {
  const { contentPath, filePath, siteDir, parseFrontMatter } = params;
  const fileContent = await readFile(filePath, "utf-8");
  const { frontMatter } = await parseMarkdownFile({
    filePath,
    fileContent,
    parseFrontMatter,
  });

  const sourceFilePath = toPosixPath({ filePath: path.relative(siteDir, filePath) });

  return {
    source: toPosixPath({ filePath: path.relative(contentPath, filePath) }),
    sourceFilePath,
    frontMatter: normalizeFrontMatter({
      frontMatter,
      sourceFilePath,
    }),
  };
};

export const findDuplicateIds = (params: { routes: LinkRoute[] }): DuplicateId[] => {
  const routesById = new Map<string, LinkRoute[]>();
  params.routes.forEach((route) => {
    routesById.set(route.id, [...(routesById.get(route.id) ?? []), route]);
  });

  return [...routesById.entries()]
    .filter(([, routes]) => routes.length > 1)
    .map(([id, routes]) => ({
      id,
      sourceFilePaths: routes.map((route) => route.sourceFilePath).sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
};

export const formatDuplicateIdError = (params: { duplicates: DuplicateId[] }): string => {
  const duplicateDetails = params.duplicates
    .map((duplicate) => {
      const files = duplicate.sourceFilePaths.map((filePath) => `  - ${filePath}`).join("\n");
      return `- ${duplicate.id}\n${files}`;
    })
    .join("\n");

  return `Duplicate Docusaurus docs front matter id values found:\n${duplicateDetails}`;
};

export const createLinkRoutes = (params: {
  docs: LinkDocSource[];
  options: CreateLinkRoutesOptions;
}): LinkRoute[] => {
  const routes = params.docs
    .map((doc) => createLinkRoute({ doc, options: params.options }))
    .filter((route): route is LinkRoute => route !== null);

  const duplicates = findDuplicateIds({ routes });
  if (duplicates.length === 0) {
    return routes;
  }

  if (params.options.failOnDuplicateId) {
    throw new Error(formatDuplicateIdError({ duplicates }));
  }

  const duplicateIds = new Set(duplicates.map((duplicate) => duplicate.id));
  console.warn(formatDuplicateIdError({ duplicates }));
  return routes.filter((route) => !duplicateIds.has(route.id));
};

export const loadLinkRoutes = async (params: {
  siteDir: string;
  contentPath: string;
  parseFrontMatter: ParseFrontMatter;
  options: CreateLinkRoutesOptions;
}): Promise<LinkRoute[]> => {
  const markdownFiles = await collectMarkdownFiles({ dirPath: params.contentPath });
  const docs = await Promise.all(
    markdownFiles.map((filePath) =>
      readMarkdownDoc({
        contentPath: params.contentPath,
        filePath,
        siteDir: params.siteDir,
        parseFrontMatter: params.parseFrontMatter,
      }),
    ),
  );

  return createLinkRoutes({
    docs,
    options: params.options,
  });
};

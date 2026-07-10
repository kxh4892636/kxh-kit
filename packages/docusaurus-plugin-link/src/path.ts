import { isValidPathname, normalizeUrl, resolvePathname } from "@docusaurus/utils";
import { addLeadingSlash, addTrailingSlash } from "@docusaurus/utils-common";
import path from "node:path";
import { stripPathNumberPrefixes } from "./number-prefix.ts";

export interface LinkDocFrontMatter {
  id?: string;
  slug?: string;
  parse_number_prefixes?: boolean;
}

export interface LinkDocSource {
  source: string;
  sourceFilePath: string;
  frontMatter: LinkDocFrontMatter;
}

export interface LinkRoute {
  id: string;
  path: string;
  targetPermalink: string;
  sourceFilePath: string;
}

export interface LinkRouteOptions {
  baseUrl: string;
  routeBasePath: string;
  shortRouteBasePath: string;
}

const getSourceDirName = (params: { source: string }): string => {
  const { source } = params;
  return path.posix.dirname(source);
};

const isCategoryIndex = (params: { source: string; sourceDirName: string }): boolean => {
  const { source, sourceDirName } = params;
  const fileName = path.posix.parse(source).name.toLowerCase();
  const directories = sourceDirName.split(path.posix.sep).reverse();
  const eligibleDocIndexNames = ["index", "readme", directories[0]?.toLowerCase()];

  return eligibleDocIndexNames.includes(fileName);
};

const getDirNameSlug = (params: {
  sourceDirName: string;
  shouldParseNumberPrefixes: boolean;
}): string => {
  const { sourceDirName, shouldParseNumberPrefixes } = params;
  if (sourceDirName === ".") {
    return "/";
  }

  const dirName = shouldParseNumberPrefixes
    ? stripPathNumberPrefixes({ filePath: sourceDirName })
    : sourceDirName;

  return addLeadingSlash(addTrailingSlash(dirName));
};

export const getDocSlug = (params: {
  baseID: string;
  frontMatterSlug?: string;
  source: string;
  sourceDirName: string;
  shouldParseNumberPrefixes: boolean;
}): string => {
  const { baseID, frontMatterSlug, source, sourceDirName, shouldParseNumberPrefixes } = params;

  const computeSlug = (): string => {
    if (frontMatterSlug?.startsWith("/")) {
      return frontMatterSlug;
    }

    const dirNameSlug = getDirNameSlug({
      sourceDirName,
      shouldParseNumberPrefixes,
    });

    if (!frontMatterSlug && isCategoryIndex({ source, sourceDirName })) {
      return dirNameSlug;
    }

    const baseSlug = frontMatterSlug ?? baseID;
    return resolvePathname(baseSlug, dirNameSlug);
  };

  const slug = computeSlug();
  if (!isValidPathname(slug)) {
    throw new Error(`Invalid computed Docusaurus slug "${slug}" for document "${source}".`);
  }

  return slug;
};

export const createDocPermalink = (params: {
  doc: LinkDocSource;
  baseUrl: string;
  routeBasePath: string;
}): string => {
  const { doc, baseUrl, routeBasePath } = params;
  const { id, slug, parse_number_prefixes: parseNumberPrefixes = true } = doc.frontMatter;
  if (!id) {
    throw new Error(`Document "${doc.sourceFilePath}" does not have a front matter id.`);
  }

  if (id.includes("/")) {
    throw new Error(`Document front matter id "${id}" cannot include slash.`);
  }

  const sourceDirName = getSourceDirName({ source: doc.source });
  const docSlug = getDocSlug({
    baseID: id,
    ...(slug === undefined ? {} : { frontMatterSlug: slug }),
    source: doc.source,
    sourceDirName,
    shouldParseNumberPrefixes: parseNumberPrefixes,
  });

  return normalizeUrl([baseUrl, routeBasePath, docSlug]);
};

export const createShortRoutePath = (params: {
  baseUrl: string;
  shortRouteBasePath: string;
  id: string;
}): string => {
  const { baseUrl, shortRouteBasePath, id } = params;
  return normalizeUrl([baseUrl, shortRouteBasePath, id]);
};

export const createLinkRoute = (params: {
  doc: LinkDocSource;
  options: LinkRouteOptions;
}): LinkRoute | null => {
  const { doc, options } = params;
  const { id } = doc.frontMatter;
  if (!id) {
    return null;
  }

  return {
    id,
    path: createShortRoutePath({
      baseUrl: options.baseUrl,
      shortRouteBasePath: options.shortRouteBasePath,
      id,
    }),
    targetPermalink: createDocPermalink({
      doc,
      baseUrl: options.baseUrl,
      routeBasePath: options.routeBasePath,
    }),
    sourceFilePath: doc.sourceFilePath,
  };
};

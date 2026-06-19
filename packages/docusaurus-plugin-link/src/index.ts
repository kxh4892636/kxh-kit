import { Joi } from "@docusaurus/utils-validation";
import path from "node:path";
import type { LinkRoute } from "./path.ts";
import type { ParseFrontMatter } from "./content.ts";
import { loadLinkRoutes } from "./content.ts";

export interface LinkPluginOptions {
  docsPath: string;
  routeBasePath: string;
  shortRouteBasePath: string;
  failOnDuplicateId: boolean;
}

export type LinkPluginUserOptions = Partial<LinkPluginOptions>;

interface LoadContext {
  siteDir: string;
  baseUrl: string;
  siteConfig: {
    markdown: {
      parseFrontMatter: ParseFrontMatter;
    };
  };
}

interface RouteConfig {
  path: string;
  component: string;
  exact?: boolean;
  priority?: number;
  props?: {
    target: string;
  };
  metadata?: {
    sourceFilePath?: string;
  };
}

interface ContentLoadedActions {
  addRoute: (route: RouteConfig) => void;
}

interface DocusaurusPlugin<Content> {
  name: string;
  getPathsToWatch: () => string[];
  loadContent: () => Promise<Content>;
  contentLoaded: (params: { content: Content; actions: ContentLoadedActions }) => Promise<void>;
}

interface OptionValidationContext<UserOptions, Options> {
  options: UserOptions;
  validate: (schema: unknown, options: UserOptions) => Options;
}

const pluginName = "@kxh-awesome/docusaurus-plugin-link";

const defaultOptions: LinkPluginOptions = {
  docsPath: "docs",
  routeBasePath: "docs",
  shortRouteBasePath: "/",
  failOnDuplicateId: true,
};

const getContentPath = (params: { siteDir: string; docsPath: string }): string => {
  const { siteDir, docsPath } = params;
  return path.resolve(siteDir, docsPath);
};

const pluginLink = async (
  context: LoadContext,
  options: LinkPluginOptions,
): Promise<DocusaurusPlugin<LinkRoute[]>> => {
  const contentPath = getContentPath({
    siteDir: context.siteDir,
    docsPath: options.docsPath,
  });

  const routeOptions = {
    baseUrl: context.baseUrl,
    routeBasePath: options.routeBasePath,
    shortRouteBasePath: options.shortRouteBasePath,
    failOnDuplicateId: options.failOnDuplicateId,
  };

  return {
    name: pluginName,

    getPathsToWatch() {
      return [path.join(contentPath, "**/*.{md,mdx}")];
    },

    async loadContent() {
      return loadLinkRoutes({
        siteDir: context.siteDir,
        contentPath,
        parseFrontMatter: context.siteConfig.markdown.parseFrontMatter,
        options: routeOptions,
      });
    },

    async contentLoaded({ content, actions }) {
      content.forEach((route) => {
        actions.addRoute({
          path: route.path,
          component: `${pluginName}/redirect`,
          exact: true,
          props: {
            target: route.targetPermalink,
          },
          priority: 100,
          metadata: {
            sourceFilePath: route.sourceFilePath,
          },
        });
      });
    },
  };
};

const optionsSchema = Joi.object<LinkPluginOptions>({
  docsPath: Joi.string().default(defaultOptions.docsPath),
  routeBasePath: Joi.string().default(defaultOptions.routeBasePath),
  shortRouteBasePath: Joi.string().default(defaultOptions.shortRouteBasePath),
  failOnDuplicateId: Joi.boolean().default(defaultOptions.failOnDuplicateId),
});

export const validateOptions = ({
  validate,
  options,
}: OptionValidationContext<LinkPluginUserOptions, LinkPluginOptions>): LinkPluginOptions => {
  return validate(optionsSchema, options);
};

export default pluginLink;
export type { LinkRoute } from "./path.ts";

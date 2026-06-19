import { expect, test } from "vite-plus/test";
import { createLinkRoutes } from "../src/content.ts";
import type { LinkDocSource } from "../src/path.ts";

const createDoc = (
  params: Partial<LinkDocSource> & Pick<LinkDocSource, "source">,
): LinkDocSource => {
  return {
    sourceFilePath: `docs/${params.source}`,
    frontMatter: {},
    ...params,
  };
};

const defaultOptions = {
  baseUrl: "/",
  routeBasePath: "docs",
  shortRouteBasePath: "/",
  failOnDuplicateId: true,
};

test("maps a front matter id to a short route and canonical docs permalink", () => {
  const [route] = createLinkRoutes({
    docs: [
      createDoc({
        source: "20-SOP/002-如何解决问题.md",
        frontMatter: {
          id: "379be6e9-8a54-4f17-9af1-3f4d0a6f13c3",
        },
      }),
    ],
    options: defaultOptions,
  });

  expect(route).toMatchObject({
    path: "/379be6e9-8a54-4f17-9af1-3f4d0a6f13c3",
    targetPermalink: "/docs/SOP/379be6e9-8a54-4f17-9af1-3f4d0a6f13c3",
  });
});

test("skips markdown without front matter id", () => {
  const routes = createLinkRoutes({
    docs: [
      createDoc({
        source: "20-SOP/README.md",
      }),
    ],
    options: defaultOptions,
  });

  expect(routes).toEqual([]);
});

test("throws on duplicate raw front matter ids and includes conflicting files", () => {
  expect(() =>
    createLinkRoutes({
      docs: [
        createDoc({
          source: "20-SOP/a.md",
          frontMatter: { id: "duplicate-id" },
        }),
        createDoc({
          source: "30-Life/b.md",
          frontMatter: { id: "duplicate-id" },
        }),
      ],
      options: defaultOptions,
    }),
  ).toThrowError(/duplicate-id[\s\S]*docs\/20-SOP\/a.md[\s\S]*docs\/30-Life\/b.md/);
});

test("strips nested numeric directory prefixes like docusaurus-plugin-content-docs", () => {
  const [route] = createLinkRoutes({
    docs: [
      createDoc({
        source: "60-计算机/20-JavaScript/30-前端/example.md",
        frontMatter: {
          id: "nested-id",
        },
      }),
    ],
    options: defaultOptions,
  });

  expect(route?.targetPermalink).toBe("/docs/计算机/JavaScript/前端/nested-id");
});

test("front matter slug overrides the computed docs path", () => {
  const [route] = createLinkRoutes({
    docs: [
      createDoc({
        source: "20-SOP/002-如何解决问题.md",
        frontMatter: {
          id: "slug-id",
          slug: "/custom/path",
        },
      }),
    ],
    options: defaultOptions,
  });

  expect(route?.targetPermalink).toBe("/docs/custom/path");
});

test("honors parse_number_prefixes false for directory slugs", () => {
  const [route] = createLinkRoutes({
    docs: [
      createDoc({
        source: "20-SOP/example.md",
        frontMatter: {
          id: "prefix-id",
          parse_number_prefixes: false,
        },
      }),
    ],
    options: defaultOptions,
  });

  expect(route?.targetPermalink).toBe("/docs/20-SOP/prefix-id");
});

test("preserves category index routing for README docs with ids", () => {
  const [route] = createLinkRoutes({
    docs: [
      createDoc({
        source: "20-SOP/README.md",
        frontMatter: {
          id: "category-id",
        },
      }),
    ],
    options: defaultOptions,
  });

  expect(route?.targetPermalink).toBe("/docs/SOP/");
});

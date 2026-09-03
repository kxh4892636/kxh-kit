import type { LookupAddress, LookupOptions } from "node:dns";

import { describe, expect, it, vi } from "vitest";

import {
  createPinnedLookup,
  requestPinned,
  resolvePublicAddresses,
  type AddressResolver,
  type PinnedLookup,
  type PinnedResponse,
  type PublicAddress,
  type PinnedTransport,
} from "./public-network.js";

const answer = (address: string, family: 4 | 6): LookupAddress => ({ address, family });
const publicAnswer = (address: string, family: 4 | 6): PublicAddress => ({ address, family });

describe("public address resolution", (): void => {
  it("returns a complete public answer set", async (): Promise<void> => {
    const resolver: AddressResolver = async (): Promise<LookupAddress[]> => [
      answer("8.8.8.8", 4),
      answer("1.1.1.1", 4),
    ];

    await expect(
      resolvePublicAddresses("example.com", new AbortController().signal, resolver),
    ).resolves.toEqual([answer("8.8.8.8", 4), answer("1.1.1.1", 4)]);
  });

  it("rejects mixed public and private answers before returning either", async (): Promise<void> => {
    const resolver: AddressResolver = async (): Promise<LookupAddress[]> => [
      answer("8.8.8.8", 4),
      answer("127.0.0.1", 4),
    ];

    await expect(
      resolvePublicAddresses("example.com", new AbortController().signal, resolver),
    ).rejects.toThrow("blocked URL");
  });

  it("rejects an active DNS64 prefix that maps to private IPv4", async (): Promise<void> => {
    const resolver: AddressResolver = async (hostname: string): Promise<LookupAddress[]> =>
      hostname === "ipv4only.arpa"
        ? [answer("2001:4860:64::c000:aa", 6), answer("2001:4860:64::c000:ab", 6)]
        : [answer("2001:4860:64::7f00:1", 6)];

    await expect(
      resolvePublicAddresses("example.com", new AbortController().signal, resolver),
    ).rejects.toThrow("blocked URL");
  });

  it("makes an in-flight resolver cancellable without exposing its reason", async (): Promise<void> => {
    const resolver: AddressResolver = async (): Promise<LookupAddress[]> =>
      new Promise<LookupAddress[]>((): void => undefined);
    const controller = new AbortController();
    const resolution = resolvePublicAddresses("example.com", controller.signal, resolver);
    controller.abort("private reason");

    await expect(resolution).rejects.toThrow("aborted");
  });
});

describe("pinned connector lookup", (): void => {
  it("returns only the previously validated addresses", async (): Promise<void> => {
    const addresses: PublicAddress[] = [
      publicAnswer("8.8.8.8", 4),
      publicAnswer("2001:4860:4860::8888", 6),
    ];
    const lookup = createPinnedLookup(addresses);
    const result = await new Promise<string | LookupAddress[]>(
      (
        resolve: (value: string | LookupAddress[]) => void,
        reject: (reason?: unknown) => void,
      ): void => {
        lookup(
          "attacker-controlled.example",
          { all: true } as LookupOptions,
          (error: NodeJS.ErrnoException | null, selected: string | LookupAddress[]): void => {
            if (error === null) {
              resolve(selected);
            } else {
              reject(error);
            }
          },
        );
      },
    );

    expect(result).toEqual(addresses);
  });

  it("fails when the connector requests an unvalidated family", (): void => {
    const callback =
      vi.fn<
        (
          error: NodeJS.ErrnoException | null,
          address: string | LookupAddress[],
          family?: number,
        ) => void
      >();
    createPinnedLookup([publicAnswer("8.8.8.8", 4)])(
      "example.com",
      { family: 6 } as LookupOptions,
      callback,
    );

    expect(callback.mock.calls[0]?.[0]).toMatchObject({ code: "ENOTFOUND" });
  });

  it("passes a validated-only lookup into the selected transport", async (): Promise<void> => {
    const addresses = [publicAnswer("8.8.8.8", 4), publicAnswer("1.1.1.1", 4)];
    const transport: PinnedTransport = async (
      _url: URL,
      lookup: PinnedLookup,
      _headers: Readonly<Record<string, string>>,
      _signal: AbortSignal,
    ): Promise<PinnedResponse> => {
      await new Promise<void>((resolve: () => void, reject: (reason?: unknown) => void): void => {
        lookup(
          "must-not-resolve.example",
          { all: true } as LookupOptions,
          (error: NodeJS.ErrnoException | null, selected: string | LookupAddress[]): void => {
            if (error === null) {
              expect(selected).toEqual(addresses);
              resolve();
            } else {
              reject(error);
            }
          },
        );
      });
      return {
        response: new Response("ok", { headers: { "content-type": "text/plain" } }),
        close: async (): Promise<void> => undefined,
      };
    };

    const pinned = await requestPinned(
      new URL("https://must-not-resolve.example/"),
      addresses,
      {},
      new AbortController().signal,
      transport,
    );

    expect(await pinned.response.text()).toBe("ok");
  });
});

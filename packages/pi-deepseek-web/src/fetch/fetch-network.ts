import type { LookupAddress, LookupOptions } from "node:dns";
import { lookup as systemLookup } from "node:dns/promises";
import { isIP } from "node:net";

import { Agent, fetch as undiciFetch } from "undici";

import { fetchFailure, isFetchFailure } from "./fetch-policy.js";

export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export interface PinnedResponse {
  readonly response: Response;
  readonly close: () => Promise<void>;
}

export type AddressResolver = (
  hostname: string,
  options: { readonly all: true; readonly order: "verbatim" },
) => Promise<LookupAddress[]>;

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

export interface FetchNetwork {
  readonly resolve: (hostname: string, signal: AbortSignal) => Promise<ResolvedAddress[]>;
  readonly request: (
    url: URL,
    addresses: readonly ResolvedAddress[],
    headers: Readonly<Record<string, string>>,
    signal: AbortSignal,
  ) => Promise<PinnedResponse>;
}

export type PinnedLookup = (
  hostname: string,
  options: LookupOptions,
  callback: LookupCallback,
) => void;

export type PinnedTransport = (
  url: URL,
  lookup: PinnedLookup,
  headers: Readonly<Record<string, string>>,
  signal: AbortSignal,
) => Promise<PinnedResponse>;

const stripIpv6Brackets = (input: string): string =>
  input.startsWith("[") && input.endsWith("]") ? input.slice(1, -1) : input;

const raceWithSignal = async <Value>(
  promise: Promise<Value>,
  signal: AbortSignal,
): Promise<Value> => {
  if (signal.aborted) {
    throw fetchFailure("aborted");
  }
  return new Promise<Value>(
    (resolve: (value: Value) => void, reject: (reason?: unknown) => void): void => {
      const abort = (): void => reject(fetchFailure("aborted"));
      signal.addEventListener("abort", abort, { once: true });
      void promise
        .then(resolve, reject)
        .finally((): void => signal.removeEventListener("abort", abort));
    },
  );
};

const resolveAddresses = async (
  hostname: string,
  signal: AbortSignal,
  resolver: AddressResolver,
): Promise<LookupAddress[]> => {
  const unbracketed = stripIpv6Brackets(hostname);
  const literalFamily = isIP(unbracketed);
  if (literalFamily !== 0) {
    return [{ address: unbracketed, family: literalFamily }];
  }
  try {
    return await raceWithSignal(resolver(unbracketed, { all: true, order: "verbatim" }), signal);
  } catch (error: unknown) {
    if (isFetchFailure(error)) {
      throw error;
    }
    throw fetchFailure("DNS resolution failed");
  }
};

export const resolvePinnedAddresses = async (
  hostname: string,
  signal: AbortSignal,
  resolver: AddressResolver = systemLookup,
): Promise<ResolvedAddress[]> => {
  const resolved = await resolveAddresses(hostname, signal, resolver);
  if (resolved.length === 0) {
    throw fetchFailure("DNS resolution failed");
  }
  return resolved.map((entry: LookupAddress): ResolvedAddress => {
    if ((entry.family !== 4 && entry.family !== 6) || isIP(entry.address) !== entry.family) {
      throw fetchFailure("DNS resolution failed");
    }
    return { address: entry.address, family: entry.family };
  });
};

export const createPinnedLookup =
  (addresses: readonly ResolvedAddress[]): PinnedLookup =>
  (hostname: string, options: LookupOptions, callback: LookupCallback): void => {
    const family =
      typeof options.family === "number"
        ? options.family
        : options.family === "IPv4"
          ? 4
          : options.family === "IPv6"
            ? 6
            : 0;
    const eligible =
      family === 0
        ? addresses
        : addresses.filter((address: ResolvedAddress): boolean => address.family === family);
    const selected = eligible[0];
    if (selected === undefined) {
      const error = Object.assign(new Error("no validated address for requested family"), {
        code: "ENOTFOUND",
        hostname,
      });
      callback(error, options.all === true ? [] : "", family);
      return;
    }
    if (options.all === true) {
      callback(
        null,
        eligible.map((address: ResolvedAddress): LookupAddress => ({ ...address })),
      );
      return;
    }
    callback(null, selected.address, selected.family);
  };

const requestThroughUndici: PinnedTransport = async (
  url: URL,
  lookup: PinnedLookup,
  headers: Readonly<Record<string, string>>,
  signal: AbortSignal,
): Promise<PinnedResponse> => {
  const dispatcher = new Agent({
    autoSelectFamily: true,
    connect: { lookup },
  });
  try {
    const response = await undiciFetch(url, {
      method: "GET",
      redirect: "manual",
      headers,
      signal,
      dispatcher,
    });
    return {
      response: response as unknown as Response,
      close: async (): Promise<void> => dispatcher.close(),
    };
  } catch (error: unknown) {
    await dispatcher.close();
    throw error;
  }
};

export const requestPinned = async (
  url: URL,
  addresses: readonly ResolvedAddress[],
  headers: Readonly<Record<string, string>>,
  signal: AbortSignal,
  transport: PinnedTransport = requestThroughUndici,
): Promise<PinnedResponse> => transport(url, createPinnedLookup(addresses), headers, signal);

export const fetchNetwork: FetchNetwork = {
  resolve: async (hostname: string, signal: AbortSignal): Promise<ResolvedAddress[]> =>
    resolvePinnedAddresses(hostname, signal),
  request: requestPinned,
};

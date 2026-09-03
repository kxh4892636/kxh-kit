import type { LookupAddress, LookupOptions } from "node:dns";
import { lookup as systemLookup } from "node:dns/promises";
import { isIP } from "node:net";

import ipaddr from "ipaddr.js";
import { Agent, fetch as undiciFetch } from "undici";

import { fetchFailure, isFetchFailure, isPublicIpAddress } from "./fetch-policy.js";

const RFC6052_PREFIX_LENGTHS = [32, 40, 48, 56, 64, 96] as const;
const IPV4ONLY_DISCOVERY_HOST = "ipv4only.arpa";
const IPV4ONLY_SENTINELS = new Set(["192.0.0.170", "192.0.0.171"]);

export interface PublicAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

interface Nat64Prefix {
  readonly bytes: readonly number[];
  readonly length: (typeof RFC6052_PREFIX_LENGTHS)[number];
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

export interface PublicNetwork {
  readonly resolve: (hostname: string, signal: AbortSignal) => Promise<PublicAddress[]>;
  readonly request: (
    url: URL,
    addresses: readonly PublicAddress[],
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

const embeddedIpv4Address = (
  bytes: readonly number[],
  prefixLength: Nat64Prefix["length"],
): string | undefined => {
  if (prefixLength === 96) {
    return bytes.slice(12, 16).join(".");
  }
  if (bytes[8] !== 0) {
    return undefined;
  }
  const prefixBytes = prefixLength / 8;
  const beforeReservedOctet = 8 - prefixBytes;
  return [
    ...bytes.slice(prefixBytes, prefixBytes + beforeReservedOctet),
    ...bytes.slice(9, 9 + 4 - beforeReservedOctet),
  ].join(".");
};

const discoverNat64Prefixes = async (
  signal: AbortSignal,
  resolver: AddressResolver,
): Promise<Nat64Prefix[]> => {
  const discovered = await raceWithSignal(
    resolver(IPV4ONLY_DISCOVERY_HOST, { all: true, order: "verbatim" }),
    signal,
  );
  const prefixes: Nat64Prefix[] = [];
  const seen = new Set<string>();
  for (const entry of discovered) {
    if (entry.family !== 6 || isIP(entry.address) !== 6) {
      continue;
    }
    const bytes = ipaddr.parse(entry.address).toByteArray();
    for (const length of RFC6052_PREFIX_LENGTHS) {
      const embedded = embeddedIpv4Address(bytes, length);
      if (embedded === undefined || !IPV4ONLY_SENTINELS.has(embedded)) {
        continue;
      }
      const prefixBytes = bytes.slice(0, length / 8);
      const key = `${String(length)}:${prefixBytes.join(".")}`;
      if (!seen.has(key)) {
        seen.add(key);
        prefixes.push({ bytes: prefixBytes, length });
      }
    }
  }
  return prefixes;
};

const translatedIpv4Address = (
  input: string,
  prefixes: readonly Nat64Prefix[],
): string | undefined => {
  if (isIP(input) !== 6) {
    return undefined;
  }
  const bytes = ipaddr.parse(input).toByteArray();
  for (const prefix of prefixes) {
    if (prefix.bytes.every((byte: number, index: number): boolean => bytes[index] === byte)) {
      const embedded = embeddedIpv4Address(bytes, prefix.length);
      if (embedded !== undefined) {
        return embedded;
      }
    }
  }
  return undefined;
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

export const resolvePublicAddresses = async (
  hostname: string,
  signal: AbortSignal,
  resolver: AddressResolver = systemLookup,
): Promise<PublicAddress[]> => {
  const resolved = await resolveAddresses(hostname, signal, resolver);
  if (resolved.length === 0) {
    throw fetchFailure("DNS resolution failed");
  }
  const hasIpv6 = resolved.some(
    (entry: LookupAddress): boolean => entry.family === 6 && isIP(entry.address) === 6,
  );
  let nat64Prefixes: Nat64Prefix[] = [];
  try {
    nat64Prefixes = hasIpv6 ? await discoverNat64Prefixes(signal, resolver) : [];
  } catch (error: unknown) {
    if (isFetchFailure(error)) {
      throw error;
    }
    throw fetchFailure("DNS resolution failed");
  }
  return resolved.map((entry: LookupAddress): PublicAddress => {
    if ((entry.family !== 4 && entry.family !== 6) || isIP(entry.address) !== entry.family) {
      throw fetchFailure("DNS resolution failed");
    }
    const translatedIpv4 = translatedIpv4Address(entry.address, nat64Prefixes);
    if (
      !isPublicIpAddress(entry.address) ||
      (translatedIpv4 !== undefined && !isPublicIpAddress(translatedIpv4))
    ) {
      throw fetchFailure("blocked URL");
    }
    return { address: ipaddr.parse(entry.address).toString(), family: entry.family };
  });
};

export const createPinnedLookup =
  (addresses: readonly PublicAddress[]): PinnedLookup =>
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
        : addresses.filter((address: PublicAddress): boolean => address.family === family);
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
        eligible.map((address: PublicAddress): LookupAddress => ({ ...address })),
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
  addresses: readonly PublicAddress[],
  headers: Readonly<Record<string, string>>,
  signal: AbortSignal,
  transport: PinnedTransport = requestThroughUndici,
): Promise<PinnedResponse> => transport(url, createPinnedLookup(addresses), headers, signal);

export const publicNetwork: PublicNetwork = {
  resolve: async (hostname: string, signal: AbortSignal): Promise<PublicAddress[]> =>
    resolvePublicAddresses(hostname, signal),
  request: requestPinned,
};

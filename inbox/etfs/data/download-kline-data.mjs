#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const endpoint = "https://hongsehuojian.com/fundex-quote/line/kline";

const targets = [
  {
    name: "红利低波100",
    securityCode: "930955.CSI",
    fileName: "红利低波100.json",
  },
  {
    name: "中证红利质量",
    securityCode: "932315.CSI",
    fileName: "中证红利质量.json",
  },
];

const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
};

const buildUrl = (target, now) => {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({
    securityCode: target.securityCode,
    count: "-2000",
    begin: formatLocalDate(now),
    period: "week",
    adjust: "1",
    ts: String(now.getTime()),
  }).toString();
  return url;
};

const fetchJson = async (target, now) => {
  const url = buildUrl(target, now);
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`${target.name} 下载失败: HTTP ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  try {
    JSON.parse(text);
  } catch (error) {
    throw new Error(`${target.name} 返回内容不是合法 JSON: ${error.message}`);
  }

  return {
    url,
    text,
  };
};

const downloadAll = async () => {
  const now = new Date();
  for (const target of targets) {
    const { url, text } = await fetchJson(target, now);
    const outputPath = join(__dirname, target.fileName);
    await writeFile(outputPath, `${text}\n`, "utf8");
    console.log(`${target.name} -> ${outputPath}`);
    console.log(`  ${url.toString()}`);
  }
};

downloadAll().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const BASE_URL = 'https://huatuo.bytedance.net';
const ENV_PROJECT_ID = process.env.HUATUO_PROJECT_ID || '';

function parseArgs(argv) {
  const args = {
    repo: '',
    mrId: '',
    projectId: '',
    branch: '',
    fromBranch: '',
    filePath: '',
    devicePlatform: '',
    deviceModel: '',
    appId: '',
    appVersion: '',
    state: 'all',
    json: false,
    includeCovered: true,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i] || '';
    switch (arg) {
      case '--url':
        applyUrl(args, next());
        break;
      case '--repo':
      case '--git-repo':
        args.repo = next();
        break;
      case '--mr-id':
      case '--mrId':
        args.mrId = next();
        break;
      case '--branch':
      case '--to-branch':
      case '--toBranch':
        args.branch = next();
        break;
      case '--from-branch':
      case '--fromBranch':
        args.fromBranch = next();
        break;
      case '--project-id':
      case '--projectId':
        args.projectId = next();
        break;
      case '--file-path':
      case '--filePath':
        args.filePath = next();
        break;
      case '--device-platform':
        args.devicePlatform = next();
        break;
      case '--device-model':
        args.deviceModel = next();
        break;
      case '--app-id':
        args.appId = next();
        break;
      case '--app-version':
        args.appVersion = next();
        break;
      case '--state':
        args.state = next();
        break;
      case '--json':
        args.json = true;
        break;
      case '--no-covered':
        args.includeCovered = false;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function applyUrl(args, rawUrl) {
  const url = new URL(rawUrl);
  const params = url.searchParams;
  args.projectId = params.get('projectId') || args.projectId;
  args.repo = params.get('repo') || args.repo;
  args.mrId = params.get('mrId') || args.mrId;
  args.branch = params.get('toBranch') || params.get('branch') || args.branch;
  args.fromBranch = params.get('fromBranch') || args.fromBranch;
  args.filePath = params.get('filePath') || args.filePath;
  args.devicePlatform = params.get('devicePlatform') || args.devicePlatform;
  args.deviceModel = params.get('deviceModel') || args.deviceModel;
  args.appId = params.get('appId') || args.appId;
  args.appVersion = params.get('appVersion') || args.appVersion;
}

function usage() {
  return `Usage:
  HUATUO_PROJECT_ID=<id> node huatuo_coverage_report.mjs
  node huatuo_coverage_report.mjs --project-id <id> --branch feature/example
  node huatuo_coverage_report.mjs --repo <repo-path> --mr-id <id>
  node huatuo_coverage_report.mjs --repo <repo-path> --mr-id <id> --file-path src/example.ts
  node huatuo_coverage_report.mjs --url 'https://ehome.bytedance.net/huatuo/development/coverage-list?...'

Options:
  --url <url>              Parse Huatuo coverage-list URL
  --repo <repo>            Git repo, defaults to current git remote when available
  --branch <branch>        Query branch coverage, defaults to current git branch when --mr-id is absent
  --from-branch <branch>   Base branch for branch coverage; if omitted, resolve from Huatuo branch list
  --mr-id <id>             MR id
  --project-id <id>        Project id; branch mode requires this or HUATUO_PROJECT_ID
  --file-path <path>       Restrict report to one file
  --json                   Print structured JSON
  --no-covered             Omit covered line list from Markdown
`;
}

function query(params) {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    parts.push(`${key}=${encodeURIComponent(value ?? '')}`);
  }
  return parts.join('&');
}

async function getJson(path) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: {
      accept: 'application/json'
    }
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return getJsonWithBytedcli(url, `Huatuo returned non-JSON response (${response.status}): ${text.slice(0, 300)}`);
  }
  if (!response.ok || json.status !== 0) {
    return getJsonWithBytedcli(url, `Huatuo API failed (${response.status}): ${JSON.stringify(json).slice(0, 500)}`);
  }
  return json.data;
}

function getJsonWithBytedcli(url, directError) {
  let output;
  try {
    output = execFileSync('bytedcli', ['--json', 'insearch', 'get', url], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 20 * 1024 * 1024
    });
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr).trim() : '';
    const details = stderr || error.message;
    throw new Error(`${directError}; bytedcli fallback failed: ${details}`);
  }

  let wrapper;
  try {
    wrapper = JSON.parse(output);
  } catch {
    throw new Error(`${directError}; bytedcli returned non-JSON output: ${output.slice(0, 300)}`);
  }

  if (wrapper.status !== 'success') {
    throw new Error(`${directError}; bytedcli failed: ${JSON.stringify(wrapper.error || wrapper).slice(0, 500)}`);
  }

  const body = wrapper.data?.body;
  if (!body || body.status !== 0) {
    throw new Error(`${directError}; Huatuo via bytedcli failed: ${JSON.stringify(body).slice(0, 500)}`);
  }

  return body.data;
}

async function resolveRepo(args) {
  if (args.repo) return args.repo;
  const inferredRepo = inferRepoFromGitRemote();
  if (!args.projectId || !args.mrId) return inferredRepo;

  const data = await getJson(
    `/api/jsCoverage/mr?${query({
      projectId: args.projectId,
      limit: 200,
      state: args.state || 'all'
    })}`
  );
  const list = Array.isArray(data) ? data : [];
  const item = list.find((entry) => String(entry.mrId || entry.projMrId) === String(args.mrId));
  return item?.gitRepo || item?.projGitrepo || inferredRepo;
}

function inferRepoFromGitRemote() {
  try {
    const remoteUrl = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (!remoteUrl) return '';
    const normalized = remoteUrl
      .replace(/^git@[^:]+:/, '')
      .replace(/^https?:\/\/[^/]+\//, '')
      .replace(/\.git$/, '');
    return normalized.includes('/') ? normalized : '';
  } catch {
    return '';
  }
}

function getCurrentBranch() {
  try {
    return execFileSync('git', ['branch', '--show-current'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return '';
  }
}

function flattenFiles(packageList = []) {
  const files = [];
  for (const pkg of packageList) {
    for (const child of pkg.children || []) {
      files.push({
        packageLabel: pkg.label || '',
        label: child.label,
        path: child.path,
        addLines: Number(child.addLines || 0),
        insertLines: Number(child.insertLines || 0),
        coverLines: Number(child.coverLines || 0),
        coverRatio: child.coverRatio || '--',
        ignoreLines: child.ignoreLines || [],
        ignoreReason: child.ignoreReason || ''
      });
    }
  }
  return files;
}

function parseAuthor(committors) {
  if (!committors) return '';
  if (typeof committors === 'object') return committors.name || committors.username || '';
  try {
    const parsed = JSON.parse(committors);
    return parsed.name || parsed.username || '';
  } catch {
    return String(committors);
  }
}

async function fetchFiles(args, repo) {
  return getJson(
    `/api/jsCoverage/mr/files?${query({
      gitRepo: repo,
      mrId: args.mrId,
      devicePlatform: args.devicePlatform,
      deviceModel: args.deviceModel,
      appId: args.appId,
      appVersion: args.appVersion
    })}`
  );
}

async function fetchBranchRecord(args) {
  const projectId = args.projectId || ENV_PROJECT_ID;
  const data = await getJson(
    `/api/jsCoverage/branch?${query({
      projectId,
      toBranch: args.branch
    })}`
  );
  const list = Array.isArray(data) ? data : [];
  return (
    list.find(
      (entry) =>
        String(entry.toBranch || '') === String(args.branch) &&
        (!args.repo || String(entry.gitRepo || entry.projGitrepo || '') === String(args.repo)) &&
        (!args.fromBranch || String(entry.fromBranch || '') === String(args.fromBranch))
    ) ||
    list.find((entry) => String(entry.toBranch || '') === String(args.branch)) ||
    null
  );
}

async function fetchBranchFiles(args, repo, fromBranch) {
  return getJson(
    `/api/jsCoverage/branch/files?${query({
      gitRepo: repo,
      fromBranch,
      toBranch: args.branch,
      devicePlatform: args.devicePlatform,
      deviceModel: args.deviceModel,
      appId: args.appId,
      appVersion: args.appVersion
    })}`
  );
}

async function fetchCode(args, repo, filePath) {
  const common = {
    gitRepo: repo,
    mrId: args.mrId,
    devicePlatform: args.devicePlatform,
    deviceModel: args.deviceModel,
    appId: args.appId,
    appVersion: args.appVersion
  };

  // Huatuo has accepted raw slashes for filePath in observed responses. Try encoded first,
  // then raw path if the response is unexpectedly empty.
  const encodedData = await getJson(`/api/jsCoverage/mr/code?${query({ ...common, filePath })}`);
  let lines = normalizeLines(encodedData);
  if (lines.length > 0) return lines;

  const rawPath = `/api/jsCoverage/mr/code?${query(common)}&filePath=${filePath}`;
  const rawData = await getJson(rawPath);
  lines = normalizeLines(rawData);
  return lines;
}

async function fetchBranchCode({ args, repo, fromBranch, filePath }) {
  const common = {
    gitRepo: repo,
    fromBranch,
    toBranch: args.branch,
    devicePlatform: args.devicePlatform,
    deviceModel: args.deviceModel,
    appId: args.appId,
    appVersion: args.appVersion
  };

  const encodedData = await getJson(`/api/jsCoverage/branch/code?${query({ ...common, filePath })}`);
  let lines = normalizeLines(encodedData);
  if (lines.length > 0) return lines;

  const rawPath = `/api/jsCoverage/branch/code?${query(common)}&filePath=${filePath}`;
  const rawData = await getJson(rawPath);
  lines = normalizeLines(rawData);
  return lines;
}

function normalizeLines(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.lineCodes)) return data.lineCodes;
  if (data && typeof data === 'object') {
    const numericKeys = Object.keys(data).filter((key) => /^\d+$/.test(key));
    if (numericKeys.length) {
      return numericKeys.sort((a, b) => Number(a) - Number(b)).map((key) => data[key]);
    }
  }
  return [];
}

function classifyLines(lines) {
  const normalize = (line) => ({
    lineNum: Number(line.lineNum),
    code: String(line.code || '').trim()
  });

  return {
    coveredLines: lines.filter((line) => line.isInsertLine && line.isCoverageLine && !line.isIgnoreLine).map(normalize),
    uncoveredLines: lines
      .filter((line) => line.isInsertLine && !line.isCoverageLine && !line.isIgnoreLine)
      .map(normalize),
    addedOnlyLines: lines
      .filter((line) => line.isAddLine && !line.isInsertLine && !line.isCoverageLine && !line.isIgnoreLine)
      .map(normalize),
    ignoredLines: lines.filter((line) => line.isIgnoreLine).map(normalize)
  };
}

function selectReportFiles(files, filePath) {
  const selectedFiles = filePath
    ? files.filter((file) => file.path === filePath)
    : files.filter((file) => file.insertLines > file.coverLines);
  return selectedFiles.length ? selectedFiles : files;
}

async function buildMrReport(args) {
  if (!args.mrId) {
    throw new Error('Missing required --mr-id');
  }

  const repo = await resolveRepo(args);
  const mrData = await fetchFiles(args, repo);
  const files = flattenFiles(mrData.packageList);
  const reportFiles = selectReportFiles(files, args.filePath);

  const fileReports = [];
  for (const file of reportFiles) {
    const lines = await fetchCode(args, repo, file.path);
    fileReports.push({
      ...file,
      totalCodeLines: lines.length,
      ...classifyLines(lines)
    });
  }

  const uncoveredCount = fileReports.reduce((sum, file) => sum + file.uncoveredLines.length, 0);

  return {
    mode: 'mr',
    repo,
    mrId: String(mrData.mrId || args.mrId),
    title: mrData.title || '',
    author: parseAuthor(mrData.committors),
    branch: mrData.branch || '',
    overall: {
      addLines: Number(mrData.addLines || 0),
      insertLines: Number(mrData.insertLines || 0),
      coverLines: Number(mrData.coverLines || 0),
      coverRatio: mrData.coverRatio || '--',
      uncoveredLines: uncoveredCount
    },
    files: fileReports
  };
}

async function buildBranchReport(args) {
  if (!args.branch) {
    args.branch = getCurrentBranch();
  }
  if (!args.branch) {
    throw new Error('Missing --branch and unable to detect current git branch');
  }
  if (!args.projectId) {
    args.projectId = ENV_PROJECT_ID;
  }
  if (!args.projectId) {
    throw new Error('Missing --project-id; branch mode requires a project id or HUATUO_PROJECT_ID');
  }
  if (!args.repo) {
    args.repo = inferRepoFromGitRemote();
  }
  if (!args.repo) {
    throw new Error('Missing --repo and unable to infer repo from git remote');
  }

  const branchRecord = await fetchBranchRecord(args);
  if (!branchRecord && !args.fromBranch) {
    throw new Error(`No Huatuo branch coverage record found for projectId=${args.projectId}, toBranch=${args.branch}`);
  }

  const repo = args.repo || branchRecord?.gitRepo || branchRecord?.projGitrepo || inferRepoFromGitRemote();
  if (!repo) {
    throw new Error('Missing --repo and unable to infer repo from git remote');
  }
  const fromBranch = args.fromBranch || branchRecord?.fromBranch;
  if (!fromBranch) {
    throw new Error(`Missing --from-branch and unable to resolve it from Huatuo for ${args.branch}`);
  }

  const branchData = await fetchBranchFiles(args, repo, fromBranch);
  const files = flattenFiles(branchData.packageList);
  const reportFiles = selectReportFiles(files, args.filePath);

  const fileReports = [];
  for (const file of reportFiles) {
    const lines = await fetchBranchCode({
      args,
      repo,
      fromBranch,
      filePath: file.path
    });
    fileReports.push({
      ...file,
      totalCodeLines: lines.length,
      ...classifyLines(lines)
    });
  }

  const uncoveredCount = fileReports.reduce((sum, file) => sum + file.uncoveredLines.length, 0);

  return {
    mode: 'branch',
    repo,
    projectId: String(args.projectId),
    fromBranch,
    toBranch: args.branch,
    title: branchData.title || branchRecord?.title || '',
    commitIds: branchData.commitIds || '',
    overall: {
      addLines: Number(branchData.addLines || branchRecord?.addLines || 0),
      insertLines: Number(branchData.insertLines || branchRecord?.insertLines || 0),
      coverLines: Number(branchData.coverLines || branchRecord?.coverLines || 0),
      coverRatio: branchData.coverRatio || branchRecord?.coverRatio || '--',
      uncoveredLines: uncoveredCount
    },
    files: fileReports
  };
}

async function buildReport(args) {
  return args.mrId ? buildMrReport(args) : buildBranchReport(args);
}

function lineList(lines) {
  if (!lines.length) return '无';
  return lines.map((line) => `- L${line.lineNum} \`${line.code}\``).join('\n');
}

function toMarkdown(report, includeCovered) {
  const parts = [];
  parts.push('## 覆盖率结果');
  parts.push('');
  if (report.mode === 'branch') {
    parts.push(`分支: ${report.toBranch}`);
    parts.push(`基准分支: ${report.fromBranch}`);
    parts.push(`ProjectId: ${report.projectId}`);
  } else {
    parts.push(`MR: ${report.mrId}`);
  }
  parts.push(`仓库: ${report.repo}`);
  if (report.title) parts.push(`标题: ${report.title}`);
  if (report.author) parts.push(`提交人: ${report.author}`);
  parts.push('');
  parts.push(`整体覆盖率: ${report.overall.coverRatio} (${report.overall.coverLines}/${report.overall.insertLines})`);
  parts.push(`新增行数: +${report.overall.addLines}`);
  parts.push(`未覆盖插桩行数: ${report.overall.uncoveredLines}`);

  for (const file of report.files) {
    parts.push('');
    parts.push('## 文件明细');
    parts.push('');
    parts.push(file.path);
    parts.push(`- 文件覆盖率: ${file.coverRatio} (${file.coverLines}/${file.insertLines})`);
    parts.push(`- 新增行数: +${file.addLines}`);
    parts.push(`- 未覆盖插桩行数: ${file.uncoveredLines.length}`);
    parts.push('');
    parts.push('## 未覆盖行');
    parts.push('');
    parts.push(lineList(file.uncoveredLines));
    if (includeCovered) {
      parts.push('');
      parts.push('## 覆盖行');
      parts.push('');
      parts.push(lineList(file.coveredLines));
    }
  }

  parts.push('');
  parts.push('## 结论');
  parts.push('');
  if (report.overall.insertLines === 0) {
    parts.push('当前没有可统计覆盖率的插桩行。');
  } else {
    parts.push(
      report.overall.uncoveredLines
        ? `当前有 ${report.overall.uncoveredLines} 行未覆盖插桩代码。`
        : '当前无未覆盖插桩行。'
    );
  }

  return parts.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const report = await buildReport(args);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${toMarkdown(report, args.includeCovered)}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

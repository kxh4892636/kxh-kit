/**
 * `check-domain.mjs` 的文本输出与命令行参数：只负责呈现，规则不在这里。
 * @module @kxh4892636/pi-toolkit/nano-flow/scripts/lib/report
 */

const formatIssues = (issues) =>
  issues.map((issue) => `${issue.path}: [${issue.rule}] ${issue.message}`).join("\n");

const formatText = (result) => {
  const lines = [];
  if (result.ok) {
    lines.push("领域文档校验通过。");
  } else {
    lines.push(`领域文档校验失败，共 ${result.errors.length} 项：`);
    lines.push(formatIssues(result.errors));
  }
  if (result.warnings.length > 0) {
    lines.push(`警告 ${result.warnings.length} 项：`);
    lines.push(formatIssues(result.warnings));
  }
  if (result.fixed.length > 0) {
    lines.push(`已自动修复 ${result.fixed.length} 项：`);
    lines.push(formatIssues(result.fixed));
  }
  if (result.updated.length > 0) {
    lines.push(`已更新索引 ${result.updated.length} 个：`);
    lines.push(result.updated.map((file) => `- ${file}`).join("\n"));
  }
  return lines.join("\n");
};

const parseArgs = (argv) => {
  const options = { rootDirectory: argv[0] ?? process.cwd(), json: false, strict: true };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--domains") options.domainsPath = argv[(index += 1)];
    else if (arg === "--limits") {
      try {
        options.limits = JSON.parse(argv[(index += 1)] ?? "{}");
      } catch {
        options.limits = {};
      }
    } else if (arg === "--domain") options.domain = argv[(index += 1)];
    else if (arg === "--plan") options.plan = argv[(index += 1)];
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--no-strict") options.strict = false;
  }
  return options;
};

export { formatIssues, formatText, parseArgs };

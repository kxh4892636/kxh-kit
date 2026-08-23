import packageMetadata from "../../../package.json" with { type: "json" };
import type { BuiltinCommand } from "../../cli/types";
import { generatedSkills } from "./generated-skill-manifest";
import { createNpmPackageManager } from "./npm-package-manager";
import { createSelfCommand } from "./self-command";

const selfCommand: BuiltinCommand = createSelfCommand(generatedSkills, {
  currentVersion: packageMetadata.version,
  packageManager: createNpmPackageManager(),
});

export default selfCommand;

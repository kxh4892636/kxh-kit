import type { BuiltinCommand } from "../../cli/types";
import { generatedSkills } from "./generated-skill-manifest";
import { createSelfCommand } from "./self-command";

const selfCommand: BuiltinCommand = createSelfCommand(generatedSkills);

export default selfCommand;

import { existsSync } from "fs";
import path from "path";

// Resolve a template view path, falling back to default if the template file does not exist
export function resolveTemplate(templateKey = "default") {
  const templatePath = path.join(
    process.cwd(),
    "views",
    "templates",
    `${templateKey}.ejs`
  );
  return existsSync(templatePath)
    ? `templates/${templateKey}`
    : "templates/default";
}

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

function compareKeys(sourceName, source, translationName, translation) {
  const sourceKeys = Object.keys(source).sort();
  const translationKeys = Object.keys(translation).sort();
  const missing = sourceKeys.filter((key) => !(key in translation));
  const stale = translationKeys.filter((key) => !(key in source));

  if (missing.length || stale.length) {
    const details = [
      missing.length ? `Missing in ${translationName}: ${missing.join(", ")}` : "",
      stale.length ? `Stale in ${translationName}: ${stale.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(`${sourceName} and ${translationName} are out of sync.\n${details}`);
  }

  return sourceKeys.length;
}

const packageSource = await readJson("package.nls.json");
const packageFrench = await readJson("package.nls.fr.json");
const runtimeSource = await readJson("l10n/bundle.l10n.json");
const runtimeFrench = await readJson("l10n/bundle.l10n.fr.json");

const packageCount = compareKeys(
  "package.nls.json",
  packageSource,
  "package.nls.fr.json",
  packageFrench,
);
const runtimeCount = compareKeys(
  "l10n/bundle.l10n.json",
  runtimeSource,
  "l10n/bundle.l10n.fr.json",
  runtimeFrench,
);

console.log(`Localization bundles are synchronized (${packageCount} manifest strings, ${runtimeCount} runtime strings).`);

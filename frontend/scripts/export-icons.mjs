import { writeFileSync } from "node:fs";
import * as simpleIcons from "simple-icons";

const catalog = [];

for (const icon of Object.values(simpleIcons)) {
  catalog.push({
    provider: "simple-icons",
    key: icon.slug,
    title: icon.title,
    hex: icon.hex,
    monochromeAllowed: false,
  });
}

catalog.sort((first, second) => first.title.localeCompare(second.title, "en"));

writeFileSync("/catalog-output/simple-icons.json", JSON.stringify(catalog));

console.log("Icon metadata exported: " + catalog.length);

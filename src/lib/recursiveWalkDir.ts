import fs from "fs";
import path from "path";

// TODO move to separate packages, as this function is duplicated in remark-wiki-link
export async function * recursiveWalkDir(dir: string): AsyncGenerator<string, void, undefined> {
  const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
  const files = dirents
    .filter((dirent) => dirent.isFile())
    .map((dirent) => path.join(dir, dirent.name));
  for (const f of files) {
    yield f;
  }
  const dirs = dirents
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => path.join(dir, dirent.name));
  for (const d of dirs) {
    for await (const f of recursiveWalkDir(d)) {
      yield f;
    }
  }
}

import { processFile } from "./process.js";
import { recursiveWalkDir } from "./recursiveWalkDir.js";
import micromatch from "micromatch";
export async function* indexFolder(folderPath, pathToUrlResolver, config, ignorePatterns) {
    const computedFields = config.computedFields || [];
    const schemas = config.schemas;
    for await (const filePath of recursiveWalkDir(folderPath)) {
        if (!shouldIncludeFile({
            filePath,
            ignorePatterns,
            includeGlob: config.include,
            excludeGlob: config.exclude,
        })) {
            continue;
        }
        const currPhysicalFileFileObjectsGenerator = processFile(folderPath, filePath, pathToUrlResolver, computedFields, config);
        for await (const fileObject of currPhysicalFileFileObjectsGenerator) {
            // 20260802: tk: schemas verification is dropped because it relies on
            // first path component of file path to decide its type.
            yield fileObject;
        }
    }
}
export function shouldIncludeFile({ filePath, ignorePatterns, includeGlob, excludeGlob, }) {
    const normalizedFilePath = filePath.replace(/\\/g, "/");
    if (ignorePatterns &&
        ignorePatterns.some((pattern) => pattern.test(normalizedFilePath))) {
        return false;
    }
    // Check if the file should be included based on includeGlob
    if (includeGlob &&
        includeGlob.length > 0 &&
        !includeGlob.some((pattern) => micromatch.isMatch(normalizedFilePath, pattern))) {
        return false;
    }
    // Check if the file should be excluded based on excludeGlob
    if (excludeGlob &&
        excludeGlob.some((pattern) => micromatch.isMatch(normalizedFilePath, pattern))) {
        return false;
    }
    return true;
}

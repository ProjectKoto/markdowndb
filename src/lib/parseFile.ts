import matter from "gray-matter";
import markdown from "remark-parse";
import { Plugin, unified } from "unified";
import { selectAll } from "unist-util-select";
import * as path from "path";
import gfm from "remark-gfm";
import remarkWikiLink from "@portaljs/remark-wiki-link";
import { Root } from "remark-parse/lib";
import { MetaData, Task } from "./schema";

export function parseFile(metadata: { [key: string]: any }, sourceWithoutMatter: string, options?: ParsingOptions) {

  // Obsidian style tags i.e. tags: tag1, tag2, tag3
  if (metadata.tags && typeof metadata.tags === "string") {
    metadata.tags = metadata.tags.split(",").map((tag: string) => tag.trim());
  }

  const ast = processAST(sourceWithoutMatter, options);

  const referencedTags = extractTagsFromBody(ast);
  metadata.referencedTags = metadata.referencedTags ? [...metadata.referencedTags, ...referencedTags] : referencedTags;

  if (!metadata?.tags) {
    metadata.tags = [];
  }

  // Links
  const links = extractWikiLinks(ast, options);
  metadata.tags = Array.from(new Set(metadata.tags));
  metadata.referencedTags = Array.from(new Set(metadata.referencedTags));

  const tasks = extractTasks(ast, metadata);
  metadata.tasks = tasks;

  return {
    ast,
    links,
  };
}

// Exported for testing
export function processAST(source: string, options?: ParsingOptions) {
  const userRemarkPlugins: Array<Plugin> = options?.remarkPlugins || [];

  const processor = unified()
    .use(markdown)
    .use([
      gfm,
      [
        remarkWikiLink,
        { pathFormat: "obsidian-short", permalinks: options?.permalinks },
      ],
      ...(userRemarkPlugins || []),
    ]);

  const ast = processor.parse(source);
  return ast;
}

export interface ParsingOptions {
  from?: string;
  remarkPlugins?: Array<Plugin>; // remark plugins that add custom nodes to the AST
  extractors?: LinkExtractors; // mapping from custom node types (e.g. added by above plugins) to functions that should handle them
  permalinks?: string[];
}

export const extractTagsFromBody = (ast: Root) => {
  let tags: string[] = [];

  const nodes = selectAll("*", ast);
  for (let index = 0; index < nodes.length; index++) {
    const node: any = nodes[index];
    const textContent = node.value;
    if (textContent && node.type !== "code" && node.type !== "inlineCode") {
      const textTags = extractTags(textContent);
      tags = tags.concat(textTags);
    }
  }

  return tags;
};

function extractTags(text: string) {
  let tags: any = [];
  // const textTags = text.match(/(?:^|\s+|\n+|\r+)#([a-zA-Z0-9_\-/\p{L}]+)/gu);
  const textTags = text.match(/(?:^|\s+|\n+|\r+)#(?:[^#"'\s]*[^#"'\s0-9][^#"'\s]*)/g);
  if (textTags) {
    tags = tags.concat(
      textTags
        .filter((tag) => isValidTag(tag.trim().slice(1)))
        .map((tag) => tag.trim().slice(1))
    ); // Extract tags and remove the '#'
  }

  return tags;
};

function isValidTag(tag: string) {
  // Check if the tag follows the specified rules
  return (
    tag.length > 1 &&
    true
    // /[a-zA-Z_\-/\p{L}]+/gu.test(tag) && // At least one non-numerical character
    // !/\s/.test(tag) && // No blank spaces
    // /[a-zA-Z0-9_\-/\p{L}]+/gu.test(tag) // Valid characters: alphabetical letters, numbers, underscore, hyphen, forward slash, and any letter in any language
  );
}

export interface LinkExtractors {
  [test: string]: (node: any) => WikiLink;
}

export interface WikiLink {
  from: string;
  to: string;
  toRaw: string; // raw link to
  text: string;
  embed: boolean; // is it an embed link (default: false)
  internal: boolean; // default true (external means http etc - not inside the contentbase)
}

export const extractWikiLinks = (ast: Root, options?: ParsingOptions) => {
  let wikiLinks: WikiLink[] = [];
  const from = options?.from || "";
  const userExtractors: LinkExtractors = options?.extractors || {};
  const directory = path.dirname(from);

  const extractors: LinkExtractors = {
    link: (node: any) => {
      const to = !node.url.startsWith("http")
        ? node.url.startsWith("/")
          ? node.url.slice(1)
          : path.posix.join(directory, node.url)
        : node.url;
      return {
        from: from,
        to: to,
        toRaw: node.url,
        text: node.children?.[0]?.value || "",
        embed: false,
        internal: !node.url.startsWith("http"),
      };
    },
    image: (node: any) => ({
      from: from,
      to: node.url.startsWith("/")
        ? node.url.slice(1)
        : path.posix.join(directory, node.url),
      toRaw: node.url,
      text: node.alt || "",
      embed: true,
      internal: !node.url.startsWith("http"),
    }),
    wikiLink: (node) => {
      const linkType = node.data.isEmbed ? "embed" : "normal";
      let linkSrc = "";
      let text = "";

      if (node.data.hName === "img" || node.data.hName === "iframe") {
        linkSrc = node.data.hProperties.src;
        text = node.children?.[0]?.value || "";
      } else if (node.data.hName === "a") {
        linkSrc = node.data.hProperties.href;
        text = node.children?.[0]?.value || "";
      } else {
        linkSrc = node.data.permalink;
        text = node.children?.[0]?.value || "";
      }
      const to = !linkSrc.startsWith("http")
        ? linkSrc.startsWith("/")
          ? linkSrc.slice(1)
          : path.posix.join(directory, linkSrc)
        : linkSrc;

      return {
        from: from,
        to: to,
        toRaw: linkSrc,
        text,
        embed: linkType === "embed",
        internal: !linkSrc.startsWith("http"),
      };
    },
    ...userExtractors,
  };

  Object.entries(extractors).forEach(([test, extractor]) => {
    const nodes = selectAll(test, ast);
    const extractedWikiLinks: WikiLink[] = nodes.map((node) => extractor(node));
    wikiLinks = wikiLinks.concat(extractedWikiLinks);
  });

  // const uniqueLinks = [...new Set(allLinks)];
  return wikiLinks;
};

export const extractTasks = (ast: Root, metadata: { [key: string]: any }) => {
  const nodes = selectAll("*", ast);
  const tasks: Task[] = [];
  const isKanban = metadata["kanban-list"] === "board";
  let list: string | null = null;
  nodes.map((node: any) => {
    if (node.type === "listItem") {
      const description = recursivelyExtractText(node).trim();
      const metadata = extractAllTaskMetadata(description);
      const checked = node.checked !== null && node.checked !== undefined ? node.checked : null;
      const created = metadata.created !== null && metadata.created !== undefined ? metadata.created : null;
      const due = metadata.due !== null && metadata.due !== undefined ? metadata.due : null;
      const completion = metadata.completion !== null && metadata.completion !== undefined ? metadata.completion : null;
      const scheduled = metadata.scheduled !== null && metadata.scheduled !== undefined ? metadata.scheduled : null;
      const start = metadata.start !== null && metadata.start !== undefined ? metadata.start : null;

      if (checked !== null) {
        tasks.push({
          description,
          checked,
          created,
          due,
          completion,
          scheduled,
          start,
          list,
          metadata: metadata,
        });
      }
    } else if (isKanban && node.type === "heading") {
      if (node.depth == 2) {
        list = node.children[0]?.value || null;
      }
    }
  });

  return tasks;
};

function recursivelyExtractText(node: any) {
  if (node.value) {
    return node.value;
  } else if (node.children) {
    return node.children.map(recursivelyExtractText).join(" ");
  } else {
    return "";
  }
};

export function extractAllTaskMetadata(description: string) : MetaData  {
  // Extract metadata fields from the description with the form [field:: value]
  // where field is the name of the metadata without spaces and value is the value of the metadata
  // There can be multiple metadata fields in the description
  const metadataRegex = /\[(.*?)::(.*?)\]/g;
  const matches = description.match(metadataRegex);
  if (matches) {
    const metadata: MetaData = {};
    matches.forEach((match) => {
      // extract field and value from groups in the match
      const allMatches = match.matchAll(metadataRegex).next().value;
      if (allMatches === undefined) {
        return;
      }
      const field = allMatches[1].trim();
      const value = allMatches[2].trim();
      metadata[field] = value;
    }); // Add closing parenthesis here
    const tags = extractTags(description);
    metadata["tags"] = tags;
    return metadata;
  } else {
    return {};
  } 




  
}

// links = extractWikiLinks({
//   source,
//   // TODO pass slug instead of file path as hrefs/srcs are sluggified too
//   // (where will we get it from?)
//   filePath: tempSluggify(`/${filePath}`),
//   ...extractWikiLinksConfig,
// }).map((link) => {
//   const linkEncodedPath = Buffer.from(
//     JSON.stringify(link),
//     "utf-8"
//   ).toString();
//   const linkId = crypto
//     .createHash("sha1")
//     .update(linkEncodedPath)
//     .digest("hex");
//   return {
//     _id: linkId,
//     from: fileId,
//     to: link.to,
//     link_type: link.linkType,
//   };
// });

// SLUGGIFY
// if (filename != "index") {
//   if (pathToFileFolder) {
//     _url_path = `${pathToFileFolder}/${filename}`;
//   } else {
//     //  The file is in the root folder
//     _url_path = filename;
//   }
// } else {
//   _url_path = pathToFileFolder;
// }

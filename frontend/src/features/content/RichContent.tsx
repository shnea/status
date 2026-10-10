import { createElement, Fragment, type ReactNode } from "react";
import { parseDocument, type EditorDocument } from "@shnea/editor";
import { AttachmentContent } from "@/features/files/AttachmentContent";
import type { JSONContent } from "@tiptap/core";

export function hasContent(content: EditorDocument | null): boolean {
  if (!content) return false;

  const meaningful = (node: JSONContent): boolean =>
    Boolean(node.text?.trim()) ||
    ["attachment", "externalImage", "horizontalRule", "table"].includes(node.type || "") ||
    Boolean(node.content?.some(meaningful));

  return meaningful(content.content);
}

function safeHref(value: string): string | undefined {
  if (/\s/u.test(value)) return undefined;

  for (const character of value) {
    const code = character.charCodeAt(0);

    if (code < 32 || code === 127) return undefined;
  }

  try {
    const url = new URL(value);

    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}

function markedText(node: JSONContent): ReactNode {
  let value: ReactNode = node.text;

  for (const mark of node.marks || []) {
    switch (mark.type) {
      case "bold":
        value = <strong>{value}</strong>;
        break;
      case "italic":
        value = <em>{value}</em>;
        break;
      case "underline":
        value = <u>{value}</u>;
        break;
      case "strike":
        value = <s>{value}</s>;
        break;
      case "code":
        value = <code>{value}</code>;
        break;
      case "link": {
        const href = safeHref(String(mark.attrs?.href || ""));

        if (href)
          value = (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {value}
            </a>
          );
        break;
      }
    }
  }

  return value;
}

function renderNode(
  node: JSONContent,
  fileBase: string,
  print: boolean,
  downloadBase: string,
): ReactNode {
  const children = node.content?.map((child, index) => (
    <Fragment key={index}>{renderNode(child, fileBase, print, downloadBase)}</Fragment>
  ));

  switch (node.type) {
    case "doc":
      return children;
    case "text":
      return markedText(node);
    case "paragraph":
      return <p>{children}</p>;
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));

      return createElement("h" + level, null, children);
    }

    case "hardBreak":
      return <br />;
    case "horizontalRule":
      return <hr />;
    case "blockquote":
      return <blockquote>{children}</blockquote>;
    case "codeBlock":
      return (
        <pre>
          <code>{children}</code>
        </pre>
      );
    case "bulletList":
      return <ul>{children}</ul>;
    case "orderedList":
      return <ol start={Number(node.attrs?.start) || 1}>{children}</ol>;
    case "listItem":
      return <li>{children}</li>;
    case "taskList":
      return <ul data-type="taskList">{children}</ul>;
    case "taskItem":
      return (
        <li data-type="taskItem">
          <input
            type="checkbox"
            checked={Boolean(node.attrs?.checked)}
            disabled
            aria-label="완료 여부"
          />
          <div>{children}</div>
        </li>
      );
    case "table":
      return (
        <div data-table-scroll>
          <table>
            <tbody>{children}</tbody>
          </table>
        </div>
      );
    case "tableRow":
      return <tr>{children}</tr>;
    case "tableCell":
      return (
        <td colSpan={Number(node.attrs?.colspan) || 1} rowSpan={Number(node.attrs?.rowspan) || 1}>
          {children}
        </td>
      );
    case "tableHeader":
      return (
        <th colSpan={Number(node.attrs?.colspan) || 1} rowSpan={Number(node.attrs?.rowspan) || 1}>
          {children}
        </th>
      );
    case "externalImage": {
      const source = safeHref(String(node.attrs?.source || ""));
      const alt = String(node.attrs?.alt || "");

      if (print) return source ? <a href={source}>{alt || source}</a> : <span>{alt}</span>;

      return source && /^https?:\/\//i.test(source) ? (
        <img src={source} alt={alt} loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <span>{alt || String(node.attrs?.source || "")}</span>
      );
    }

    case "attachment":
      if (print) {
        const fileId = String(node.attrs?.fileId || "");
        const name = String(node.attrs?.name || "첨부 파일");

        return node.attrs?.kind === "image" ? (
          <figure>
            <img src={fileBase + fileId + "/content/preview"} alt={name} />
          </figure>
        ) : (
          <p>
            <a href={downloadBase + fileId + "/content/download"}>{name}</a>
          </p>
        );
      }

      return (
        <AttachmentContent
          content={{
            format: "shnea-editor",
            version: 3,
            content: { type: "doc", content: [node] },
          }}
          fileBase={fileBase}
        />
      );
    case "mediaRow":
      if (print) return <div data-media-row>{children}</div>;

      return (
        <AttachmentContent
          content={{
            format: "shnea-editor",
            version: 3,
            content: { type: "doc", content: [node] },
          }}
          fileBase={fileBase}
        />
      );

    default:
      return children;
  }
}

export function RichContent({
  content,
  fileBase,
  className,
  print = false,
  downloadBase = fileBase,
}: {
  content: EditorDocument | null;
  fileBase: string;
  className: string;
  print?: boolean;
  downloadBase?: string;
}) {
  if (!content || !hasContent(content)) return null;

  const document = parseDocument(content);

  return (
    <div className={className}>{renderNode(document.content, fileBase, print, downloadBase)}</div>
  );
}

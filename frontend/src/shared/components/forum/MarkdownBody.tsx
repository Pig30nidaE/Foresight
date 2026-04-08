"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "del", "s", "u",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "a", "img",
  "table", "thead", "tbody", "tr", "th", "td",
  "hr", "sup", "sub", "details", "summary",
];

const ALLOWED_ATTR = [
  "href", "src", "alt", "title", "width", "height",
  "target", "rel", "class", "id",
];

type Props = {
  children: string;
  className?: string;
};

export default function MarkdownBody({ children, className }: Props) {
  const sanitized = useMemo(
    () =>
      DOMPurify.sanitize(children, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        ALLOW_DATA_ATTR: false,
      }),
    [children],
  );

  return (
    <div className={`markdown-body ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          img: ({ node: _node, ...props }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              {...props}
              loading="lazy"
              className="my-2 max-w-full rounded-lg border border-chess-border/30"
              style={{ maxHeight: "600px", objectFit: "contain" }}
              alt={props.alt ?? ""}
            />
          ),
          a: ({ node: _node, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className="text-chess-accent underline underline-offset-2 hover:brightness-110"
            />
          ),
          pre: ({ node: _node, ...props }) => (
            <pre
              {...props}
              className="my-2 overflow-x-auto rounded-lg bg-chess-surface/60 p-3 text-sm leading-relaxed dark:bg-chess-elevated/40"
            />
          ),
          code: ({ node: _node, className: codeClass, children: codeChildren, ...props }) => {
            const isInline = !codeClass;
            return isInline ? (
              <code
                {...props}
                className="rounded bg-chess-surface/60 px-1.5 py-0.5 text-[0.9em] dark:bg-chess-elevated/40"
              >
                {codeChildren}
              </code>
            ) : (
              <code {...props} className={codeClass}>
                {codeChildren}
              </code>
            );
          },
          table: ({ node: _node, ...props }) => (
            <div className="my-3 overflow-x-auto">
              <table
                {...props}
                className="min-w-full border-collapse border border-chess-border/40 text-sm"
              />
            </div>
          ),
          th: ({ node: _node, ...props }) => (
            <th
              {...props}
              className="border border-chess-border/40 bg-chess-surface/40 px-3 py-1.5 text-left font-semibold dark:bg-chess-elevated/30"
            />
          ),
          td: ({ node: _node, ...props }) => (
            <td {...props} className="border border-chess-border/40 px-3 py-1.5" />
          ),
          blockquote: ({ node: _node, ...props }) => (
            <blockquote
              {...props}
              className="my-2 border-l-4 border-chess-accent/50 pl-4 italic text-chess-muted"
            />
          ),
        }}
      >
        {sanitized}
      </ReactMarkdown>
    </div>
  );
}

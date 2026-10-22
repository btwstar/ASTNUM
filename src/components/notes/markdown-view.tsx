"use client";

/**
 * MarkdownView — live preview for note bodies.
 * react-markdown with manual prose-like styling (no typography plugin —
 * headings/lists/strong/em/blockquote are styled via component overrides).
 */
import React from "react";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";

const mdComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-5 text-2xl font-bold leading-snug first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-xl font-bold leading-snug first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-3 text-lg font-semibold leading-snug first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1 mt-3 text-base font-semibold leading-snug first:mt-0">{children}</h4>
  ),
  p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 ps-6 leading-relaxed">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 ps-6 leading-relaxed">{children}</ol>
  ),
  li: ({ children }) => <li className="marker:text-primary/70">{children}</li>,
  strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic text-foreground/90">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-s-2 border-primary/50 bg-primary/5 ps-3 py-1 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-border" />,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
      {children}
    </a>
  ),
  pre: ({ children }) => (
    <pre className="slim-scroll my-3 overflow-x-auto rounded-xl bg-muted/70 p-3 text-sm leading-relaxed">
      {children}
    </pre>
  ),
  code: ({ className, children }) => {
    const text = String(children ?? "");
    const isBlock = Boolean(className?.includes("language-")) || text.includes("\n");
    if (isBlock) return <code className="font-mono text-[0.9em]">{children}</code>;
    return (
      <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-primary">
        {children}
      </code>
    );
  },
};

export function MarkdownView({ source }: { source: string }) {
  if (!source.trim()) return null;
  return (
    <div className="min-h-40 text-base text-foreground/90">
      <Markdown components={mdComponents}>{source}</Markdown>
    </div>
  );
}

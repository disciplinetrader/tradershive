"use client";

/**
 * Heavy markdown renderer, isolated behind a dynamic-import boundary.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `streamdown` + `@streamdown/code` pull Shiki, whose grammar set alone
 * accounts for ~11 MB of emitted JS (emacs-lisp, wolfram, angular-ts,
 * asciidoc…). `@streamdown/math` pulls KaTeX. Previously all of this sat in
 * the *static* import graph of `ai-elements/message.tsx`, so every consumer
 * of `<Message>` — including the route shell — had to resolve those modules
 * before it could render a single chat bubble.
 *
 * Keeping the import here means the bundler emits one async chunk that is
 * only fetched when an assistant message actually renders. Shiki still
 * lazy-loads individual grammars on demand, so an English-language answer
 * with one TS snippet downloads one grammar, not two hundred.
 *
 * The `mermaid` plugin is deliberately NOT registered: it statically pulls
 * mermaid + cytoscape + the mermaid parser (~3.9 MB raw / ~800 kB gzip) and
 * a trading coach never emits flowcharts. Re-add it here (and only here) if
 * that assumption ever changes.
 */

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import type { ComponentProps } from "react";
import { Streamdown } from "streamdown";

import { cn } from "@/lib/utils";

export type MarkdownResponseProps = ComponentProps<typeof Streamdown>;

/** Stable identity — a new object each render would reset Streamdown plugins. */
const streamdownPlugins = { cjk, code, math };

export default function MarkdownResponse({ className, ...props }: MarkdownResponseProps) {
  return (
    <Streamdown
      className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
      plugins={streamdownPlugins}
      {...props}
    />
  );
}

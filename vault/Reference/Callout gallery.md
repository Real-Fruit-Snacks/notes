---
title: Callout gallery
publish: true
date: 2026-06-09
description: Every Obsidian callout type, showing the styled colour variants.
tags: [reference, demo]
---

# Callout gallery

All the callout flavours the renderer styles, each with a **custom title** (the text
after the `[!type]` marker). Part of the [[Markdown guide]] set.

## Note family

> [!note] Keep a daily note
> The default callout — used for general asides.

> [!info] Builds run on every push
> Same blue family as note, for informational context.

## Tip family

> [!tip] Press / to search
> Green, for hints and best practices.

## Warning family

> [!warning] This overwrites the output folder
> Peach, to flag something the reader should be careful about.

## Danger family

> [!danger] This cannot be undone
> Red, for destructive or breaking things.

> [!error] Build failed: missing frontmatter
> Also red — for failures.

> [!bug] Heading links break with duplicate titles
> Red as well, for known issues.

## Example family

> [!example] Resolving a wikilink
> Mauve, for worked examples.

## Variations

A callout can omit the title — then the **type name** is used as the heading:

> [!tip]
> No title given, so this just reads "Tip".

Callouts can contain **rich content**, including `code`, lists, and links:

> [!note] What goes in a callout
> - A list item with a [[Code samples|link]]
> - Another item
>
> ```python
> print("code inside a callout")
> ```

An unknown type falls back to the default styling but keeps its custom title:

> [!fllibble] Made-up callout type
> Unknown callout types still render as a tidy box.

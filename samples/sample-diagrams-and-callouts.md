---
title: "Diagrams, Callouts & Extended Syntax Showcase"
author: "MarkdownDesk Test Suite"
date: "2026-10-16"
tags:
  - mermaid
  - callouts
  - highlight
description: "Showcase document testing Mermaid diagrams, GitHub alert callouts, and inline highlights in MarkdownDesk."
---

# Diagrams, Callouts & Extended Syntax Showcase

This document tests the visual rendering and two-way roundtripping of **Mermaid diagrams**, **GitHub alert callouts**, and **highlighted text**.

---

## 1. Mermaid Flowchart

```mermaid
flowchart TD
    Start([User opens file]) --> Check{Is it Markdown?}
    Check -- Yes --> Parse[Marked parses body]
    Check -- No --> Raw[Display raw text]
    Parse --> Sanitize[DOMPurify sanitizes]
    Sanitize --> RenderSvg[Mermaid renders SVGs]
    RenderSvg --> Editor[Display in WYSIWYG editor]
    Editor --> Save[Save document]
    Save --> Turndown[Turndown serializes cleanly]
```

---

## 2. Mermaid Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Editor as Webview Editor
    participant Native as Native Host (Tauri/AppKit)
    participant Disk as Local File System

    User->>Editor: Edit text & press ⌘S / Ctrl+S
    Editor->>Native: Send save event with Markdown
    Native->>Disk: Atomic write to temporary sibling file
    Disk-->>Native: File synced to disk
    Native->>Disk: Rename temp to target destination
    Native-->>Editor: Update title & clear dirty state
    Editor-->>User: Document saved successfully
```

---

## 3. GitHub Alert Callouts

> [!NOTE]
> **Helpful Note**: Useful information that users should know, even when skimming content.

> [!TIP]
> **Pro Tip**: Helpful advice for doing things better or more easily. Try toggling **Source View** with **⌘⇧M** (Mac) or **Ctrl+Shift+M** (Linux).

> [!IMPORTANT]
> **Crucial Information**: Key information users need to know to achieve their goal.

> [!WARNING]
> **Urgent Info**: Urgent info that needs immediate user attention to avoid problems.

> [!CAUTION]
> **Advises Caution**: Advises of risks or negative outcomes of certain actions.

---

## 4. Text Highlighting

You can highlight important passages using `==text==`:

* This is a ==critical requirement== that must not be overlooked.
* Multiple highlights: ==first item== and ==second item== in the same sentence.
* Combined with bold: ==**very important notice**==.

---

## 5. Roundtrip Test Instructions

1. Switch between **Rich Text** and **Source** view using **⌘⇧M** (or **Ctrl+Shift+M**).
2. Make a small edit in any paragraph above.
3. Save the document with **⌘S** (or **Ctrl+S**).
4. Verify that all diagrams, callouts, and highlights preserve their exact Markdown syntax!


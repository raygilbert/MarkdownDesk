# MarkdownDesk

An open-source, Mac-first Markdown editor with a single rich-text page, a Markdown source view, printing, and PDF export. Markdown files stay plain text and remain usable from the CLI.

This is an early prototype.

## Run on macOS

Requirements: macOS 13 or later, Apple Command Line Tools (or Xcode), Node.js 20 or later, and npm. The app itself needs no network connection or Node.js after it has been built.

```sh
npm ci
npm run build
open build/MarkdownDesk.app
```

Create a blank document with **New** or **⌘N**, write your notes, then choose **Save** or **⌘S** to name the Markdown file and choose its folder. Open an existing file through **File → Open** or from the Terminal:

```sh
open -a "$PWD/build/MarkdownDesk.app" "/absolute/path/to/note.md"
```

Use **File → Export PDF** for a paginated PDF, or **File → Print** for the macOS print dialog. Toggle the Markdown source view with **⌘⇧M**. The toolbar groups paragraph style, emphasis, blocks, and links; **New**, **Open**, and **Save** are always visible above it.

If the local Swift compiler and selected macOS SDK are mismatched, set `MARKDOWNDESK_SDK` to an installed compatible SDK path before building. The build script automatically chooses the macOS 26 SDK for Swift 6.3 Command Line Tools when available.

## Run on Linux (AppImage)

Requirements: Linux (x86_64), Node.js 20 or later, npm, Rust/Cargo, and WebKitGTK (`webkit2gtk-4.1` or `webkitgtk-6.0`).

```sh
npm ci
npm run appimage
```

The standalone AppImage is generated in:
```
src-tauri/target/release/bundle/appimage/MarkdownDesk_0.1.0_amd64.AppImage
```

Run it directly or pass a Markdown file from the command line:
```sh
./src-tauri/target/release/bundle/appimage/MarkdownDesk_0.1.0_amd64.AppImage "/path/to/note.md"
```

## Make a Mac installer

To make a disk image for your own Mac:

```sh
npm ci
npm run dmg
```

The output is in `dist/`. Open the `.dmg` and drag **MarkdownDesk** to **Applications**. This disk image is unsigned and intended for testing. Its filename includes the CPU architecture; the current build produces an Apple silicon image on an Apple silicon Mac.

GitHub Actions also builds this unsigned installer on every push and pull request. Open a successful **macOS installer** run in the repository's **Actions** tab and download the **MarkdownDesk-macos-unsigned** artifact. Extract the downloaded ZIP to get the `.dmg`. The workflow builds and tests the app, verifies the disk image, and retains the artifact for 14 days. Downloaded unsigned builds may need manual approval from macOS before opening; they are not public releases.

For a public download, sign and notarize the app and disk image with an Apple **Developer ID Application** certificate. Store notarization credentials in your Keychain with `xcrun notarytool store-credentials`, then run:

```sh
export MARKDOWNDESK_SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export MARKDOWNDESK_NOTARY_PROFILE="MarkdownDesk"
./scripts/package-dmg.sh release
```

The release script builds and tests a separate app copy, signs it with hardened runtime, creates the disk image, waits for Apple notarization, staples the ticket, and validates it. Keep signing credentials out of the repository. Publish only the resulting signed image as a GitHub Release asset. See Apple's [distribution](https://developer.apple.com/documentation/technologyoverviews/distribution) and [notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) guidance.

## Current scope

- Opens and saves UTF-8 `.md`, `.markdown`, and plain-text files.
- Rich view displays headings, emphasis, links, lists, tables, task lists, code blocks, quotes, images, and horizontal rules.
- YAML front matter is retained during rich edits. A file saved without editing keeps its original Markdown text.
- The source view supports exact Markdown editing, including syntax the rich view does not handle.
- Auto-update and cross-platform releases are not included.

Rich-text editing converts the document through HTML when saving. This can normalize whitespace, Markdown syntax choices, or advanced constructs such as footnotes, math, diagrams, embedded HTML, and nested tables. For those documents, edit in source view. Keep your files under version control or backed up while using this prototype.

The build and automated Markdown tests pass. Opening files from the toolbar and the CLI, saving a rich-text edit, and exporting one-page and two-page PDFs were checked in the Mac app. Print uses the same AppKit document view as PDF export.

## Develop

```sh
npm ci
npm run build
npm test
```

The native shell is written in Swift/AppKit and uses WebKit. Browser-side Markdown conversion uses [Marked](https://marked.js.org/), [DOMPurify](https://github.com/cure53/DOMPurify), [Turndown](https://github.com/mixmark-io/turndown), and [Turndown GFM](https://github.com/mixmark-io/turndown/tree/master/packages/turndown-plugin-gfm). Their license files are bundled in `Contents/Resources/Licenses`.

Contributions are welcome. Please open an issue before starting a large feature; the document model and lossless editing approach are still evolving.

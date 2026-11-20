# MarkdownDesk

An open-source, Mac-first Markdown editor with a single rich-text page, a Markdown source view, printing, and PDF export. Markdown files stay plain text and remain usable from the CLI.

macOS is the primary platform: it has the native Swift/AppKit app, the preview downloads, and most of the testing. Linux is also supported through a [Tauri](https://tauri.app/) shell that shares the same editor. Linux users build it from source for now; see [Run on Linux](#run-on-linux).

This is an early prototype.

## Download the macOS preview

Get the newest **unsigned Apple silicon `.dmg`** from [GitHub Releases](https://github.com/raygilbert/MarkdownDesk/releases). Open the latest **Preview** release and download the `.dmg` under **Assets**. Open the disk image and drag **MarkdownDesk** to **Applications**.

Preview releases are for testing. They are not signed or notarized with an Apple Developer ID, so macOS may require manual approval before opening the app. A release workflow builds and verifies each preview when a maintainer pushes a matching `v0.1.0-preview.N` tag on `main`.

For a build from an individual commit, the [macOS installer GitHub Action](https://github.com/raygilbert/MarkdownDesk/actions/workflows/mac-build.yml) still uploads a **MarkdownDesk-macos-unsigned** artifact on every push and pull request. These Actions artifacts are ZIP downloads retained for 14 days.

## Run on macOS

Requirements: macOS 13 or later, Apple Command Line Tools (or Xcode), Node.js 20 or later, and npm. The app itself needs no network connection or Node.js after it has been built.

```sh
npm ci
npm run build
open build/MarkdownDesk.app
```

For a persistent Dock shortcut, install the built app outside a synced project folder before pinning it:

```sh
mkdir -p "$HOME/Applications"
ditto --noextattr build/MarkdownDesk.app "$HOME/Applications/MarkdownDesk.app"
```

Pin the copy in `~/Applications`, and copy it again after rebuilding. A Dock shortcut to an app inside a Dropbox synced build folder may show a blank icon after the app closes.

Create a blank document with **New** or **⌘N**, write your notes, then choose **Save** or **⌘S** to name the Markdown file and choose its folder. Open an existing file through **File → Open** or from the Terminal:

```sh
open -a "$PWD/build/MarkdownDesk.app" "/absolute/path/to/note.md"
```

Use **File → Export PDF** for a paginated PDF, or **File → Print** for the macOS print dialog. Toggle the Markdown source view with **⌘⇧M**. The toolbar groups paragraph style, emphasis, blocks, and links; **New**, **Open**, and **Save** are always visible above it.

If the local Swift compiler and selected macOS SDK are mismatched, set `MARKDOWNDESK_SDK` to an installed compatible SDK path before building. The build script automatically chooses the macOS 26 SDK for Swift 6.3 Command Line Tools when available.

## Make a Mac installer

To make a disk image for your own Mac:

```sh
npm ci
npm run dmg
```

The output is in `dist/`. Open the `.dmg` and drag **MarkdownDesk** to **Applications**. This disk image is unsigned and intended for testing. Its filename includes the CPU architecture; the current build produces an Apple silicon image on an Apple silicon Mac.

The automatic CI build is available through the [Actions link above](#download-the-macos-preview). The workflow builds and tests the app before uploading the verified disk image.

For a public download, sign and notarize the app and disk image with an Apple **Developer ID Application** certificate. Store notarization credentials in your Keychain with `xcrun notarytool store-credentials`, then run:

```sh
export MARKDOWNDESK_SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export MARKDOWNDESK_NOTARY_PROFILE="MarkdownDesk"
./scripts/package-dmg.sh release
```

The release script builds and tests a separate app copy, signs it with hardened runtime, creates the disk image, waits for Apple notarization, staples the ticket, and validates it. Keep signing credentials out of the repository. Publish the resulting signed image as a normal GitHub Release; keep unsigned builds labeled as previews. See Apple's [distribution](https://developer.apple.com/documentation/technologyoverviews/distribution) and [notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) guidance.

## Run on Linux

Linux support was contributed by [@mbidewell](https://github.com/mbidewell). It uses a Tauri v2 shell around the same web editor as the Mac app. There are no prebuilt Linux downloads yet, so build it from source.

Requirements: Linux (x86_64), Node.js 20 or later, npm, Rust/Cargo, and WebKitGTK 4.1 (`webkit2gtk-4.1`) with the other packages in Tauri's [Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux).

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

On Linux, `npm run build` builds both an AppImage and a `.deb` package under `src-tauri/target/release/bundle/`.

The Linux app has the same editor, toolbar, and File, Edit, Format, and View menus. Differences from the Mac app:

- Keyboard shortcuts use **Ctrl** where the Mac uses **⌘** (for example **Ctrl+S** to save and **Ctrl+Shift+M** for source view).
- Printing and PDF export share one command, **File → Print / Export PDF…** (**Ctrl+P**). To make a PDF, choose a print-to-file or PDF printer in the print dialog.

## Current scope

- Opens and saves UTF-8 `.md`, `.markdown`, and plain-text files.
- Rich view displays headings, emphasis, links, lists, tables, task lists, code blocks, quotes, images, and horizontal rules.
- YAML front matter is retained during rich edits. A file saved without editing keeps its original Markdown text.
- The source view supports exact Markdown editing, including syntax the rich view does not handle.
- Auto-update, prebuilt Linux packages, and Windows support are not included.

Rich-text editing converts the document through HTML when saving. This can normalize whitespace, Markdown syntax choices, or advanced constructs such as footnotes, math, diagrams, embedded HTML, and nested tables. For those documents, edit in source view. Keep your files under version control or backed up while using this prototype.

The build and automated Markdown tests pass. Opening files from the toolbar and the CLI, saving a rich-text edit, and exporting one-page and two-page PDFs were checked in the Mac app. Print uses the same AppKit document view as PDF export. The Linux build is tested less than the Mac app; please report Linux problems in Issues.

## Develop

```sh
npm ci
npm run build
npm test
```

There are two native shells around one shared web editor in `Web/`:

- **macOS:** `Sources/MarkdownDesk.swift`, written in Swift/AppKit with WebKit. `npm run build` on a Mac runs `scripts/build.sh`.
- **Linux:** `src-tauri/`, written in Rust with Tauri v2 and WebKitGTK. `npm run build` on Linux runs `tauri build`.

Changes to the editor itself affect both platforms. The automated tests in `test/` exercise the web layer, not either native shell. Browser-side Markdown conversion uses [Marked](https://marked.js.org/), [DOMPurify](https://github.com/cure53/DOMPurify), [Turndown](https://github.com/mixmark-io/turndown), and [Turndown GFM](https://github.com/mixmark-io/turndown/tree/master/packages/turndown-plugin-gfm). In the Mac app, their license files are bundled in `Contents/Resources/Licenses`.

Contributions are welcome. Please open an issue before starting a large feature; the document model and lossless editing approach are still evolving.

## Support the project

MarkdownDesk is free and open source. If you find it useful and want to support its development, you can [buy me a coffee](https://buymeacoffee.com/raymondgilbert).

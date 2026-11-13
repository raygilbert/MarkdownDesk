import AppKit
import UniformTypeIdentifiers
import WebKit

final class EditorController: NSObject, NSApplicationDelegate, NSWindowDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var fileURL: URL?
    private var pendingURL: URL?
    private var ready = false
    private var dirty = false { didSet { window?.isDocumentEdited = dirty } }

    func applicationDidFinishLaunching(_ notification: Notification) {
        if let iconURL = Bundle.main.url(forResource: "MarkdownDesk", withExtension: "icns"),
           let icon = NSImage(contentsOf: iconURL) {
            NSApp.applicationIconImage = icon
        }
        makeMenu()

        let content = WKUserContentController()
        for name in ["ready", "changed", "openLink", "command"] { content.add(self, name: name) }
        let config = WKWebViewConfiguration()
        config.userContentController = content
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1040, height: 760),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "Untitled.md"
        window.minSize = NSSize(width: 700, height: 450)
        window.center()
        window.contentView = webView
        window.delegate = self
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        guard let index = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") else {
            showError("The editor resources are missing from the app bundle.")
            return
        }
        webView.loadFileURL(index, allowingReadAccessTo: URL(fileURLWithPath: "/", isDirectory: true))
        if pendingURL == nil,
           let path = CommandLine.arguments.dropFirst().first(where: {
               !$0.hasPrefix("-") && FileManager.default.fileExists(atPath: $0)
           }) {
            pendingURL = URL(fileURLWithPath: path)
        }
    }

    func application(_ sender: NSApplication, openFiles filenames: [String]) {
        guard let first = filenames.first else { return }
        let url = URL(fileURLWithPath: first)
        if ready { open(url) } else { pendingURL = url }
        sender.reply(toOpenOrPrint: .success)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard dirty else { return .terminateNow }
        confirmChanges { allowed in
            if allowed { sender.reply(toApplicationShouldTerminate: true) }
            else { sender.reply(toApplicationShouldTerminate: false) }
        }
        return .terminateLater
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        guard dirty else { return true }
        confirmChanges { [weak self] allowed in
            if allowed { self?.window.close() }
        }
        return false
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.name {
        case "ready":
            ready = true
            if let url = pendingURL { pendingURL = nil; open(url) }
        case "changed": dirty = true
        case "openLink":
            guard let string = message.body as? String, let url = URL(string: string) else { return }
            let scheme = url.scheme?.lowercased() ?? ""
            if ["https", "http", "mailto"].contains(scheme) {
                NSWorkspace.shared.open(url)
            } else if scheme == "file" {
                if ["md", "markdown", "txt"].contains(url.pathExtension.lowercased()) {
                    open(url)
                } else {
                    NSWorkspace.shared.open(url)
                }
            }
        case "command":
            guard let command = message.body as? String else { return }
            switch command {
            case "new": newDocument(nil)
            case "open": openDocument(nil)
            case "save": save(nil)
            default: break
            }
        default: break
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.navigationType == .linkActivated {
            if let url = navigationAction.request.url {
                switch url.scheme?.lowercased() {
                case "https", "http", "mailto": NSWorkspace.shared.open(url)
                case "file" where ["md", "markdown"].contains(url.pathExtension.lowercased()): open(url)
                default: break
                }
            }
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    private func jsString(_ value: String) -> String {
        let data = try! JSONSerialization.data(withJSONObject: [value], options: [.fragmentsAllowed])
        let array = String(decoding: data, as: UTF8.self)
        return String(array.dropFirst().dropLast())
    }

    private func loadMarkdown(_ text: String, name: String, base: String, focus: Bool = false) {
        let command = "editorAPI.setMarkdown(\(jsString(text)), \(jsString(name)), \(jsString(base)));" +
            (focus ? "editorAPI.focusEditor();" : "")
        webView.evaluateJavaScript(command, completionHandler: nil)
    }

    private func open(_ url: URL) {
        confirmChanges { [weak self] allowed in
            guard allowed, let self else { return }
            do {
                var encoding = String.Encoding.utf8
                let text = try String(contentsOf: url, usedEncoding: &encoding)
                self.fileURL = url
                self.window.title = url.lastPathComponent
                self.window.representedURL = url
                self.dirty = false
                self.loadMarkdown(text, name: url.lastPathComponent,
                                  base: url.deletingLastPathComponent().absoluteString)
            } catch { self.showError("Could not open \(url.lastPathComponent): \(error.localizedDescription)") }
        }
    }

    private func confirmChanges(_ completion: @escaping (Bool) -> Void) {
        guard dirty else { completion(true); return }
        let alert = NSAlert()
        alert.messageText = "Save changes to \(window.title)?"
        alert.informativeText = "Your edits will be lost if you discard them."
        alert.addButton(withTitle: "Save")
        alert.addButton(withTitle: "Discard")
        alert.addButton(withTitle: "Cancel")
        switch alert.runModal() {
        case .alertFirstButtonReturn: saveDocument(completion: completion)
        case .alertSecondButtonReturn: dirty = false; completion(true)
        default: completion(false)
        }
    }

    @objc private func newDocument(_ sender: Any?) {
        confirmChanges { [weak self] allowed in
            guard allowed, let self else { return }
            self.fileURL = nil
            self.window.title = "Untitled.md"
            self.window.representedURL = nil
            self.dirty = false
            self.loadMarkdown("", name: "Untitled.md", base: "file:///", focus: true)
        }
    }

    @objc private func openDocument(_ sender: Any?) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.init(filenameExtension: "md")!, .init(filenameExtension: "markdown")!, .plainText]
        panel.allowsMultipleSelection = false
        if panel.runModal() == .OK, let url = panel.url { open(url) }
    }

    @objc private func save(_ sender: Any?) { saveDocument(completion: nil) }
    @objc private func saveAs(_ sender: Any?) { saveDocument(asNewFile: true, completion: nil) }

    private func saveDocument(asNewFile: Bool = false, completion: ((Bool) -> Void)?) {
        let destination: URL
        if !asNewFile, let fileURL { destination = fileURL }
        else {
            let panel = NSSavePanel()
            panel.allowedContentTypes = [.init(filenameExtension: "md")!]
            panel.nameFieldStringValue = fileURL?.lastPathComponent ?? "Untitled.md"
            guard panel.runModal() == .OK, let url = panel.url else { completion?(false); return }
            destination = url
        }
        webView.evaluateJavaScript("editorAPI.getMarkdown()") { [weak self] result, error in
            guard let self, let text = result as? String, error == nil else {
                self?.showError("Could not read the editor contents.")
                completion?(false)
                return
            }
            do {
                try text.write(to: destination, atomically: true, encoding: .utf8)
                self.fileURL = destination
                self.window.title = destination.lastPathComponent
                self.window.representedURL = destination
                self.dirty = false
                self.loadMarkdown(text, name: destination.lastPathComponent,
                                  base: destination.deletingLastPathComponent().absoluteString)
                completion?(true)
            } catch {
                self.showError("Could not save \(destination.lastPathComponent): \(error.localizedDescription)")
                completion?(false)
            }
        }
    }

    @objc private func printDocument(_ sender: Any?) {
        withPrintView { view, info in
            let operation = NSPrintOperation(view: view, printInfo: info)
            operation.showsPrintPanel = true
            operation.showsProgressPanel = true
            operation.run()
        }
    }

    @objc private func exportPDF(_ sender: Any?) {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.pdf]
        panel.nameFieldStringValue = (fileURL?.deletingPathExtension().lastPathComponent ?? "Untitled") + ".pdf"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        withPrintView { [weak self] view, info in
            info.jobDisposition = .save
            info.dictionary()[NSPrintInfo.AttributeKey.jobSavingURL] = url
            let operation = NSPrintOperation(view: view, printInfo: info)
            operation.showsPrintPanel = false
            operation.showsProgressPanel = true
            if !operation.run() { self?.showError("PDF export failed.") }
        }
    }

    private func withPrintView(_ action: @escaping (NSTextView, NSPrintInfo) -> Void) {
        webView.evaluateJavaScript("editorAPI.getPrintHTML()") { [weak self] result, error in
            guard let self, let html = result as? String, error == nil else {
                self?.showError("Could not prepare the document for printing.")
                return
            }
            do {
                let info = NSPrintInfo.shared.copy() as! NSPrintInfo
                info.topMargin = 52
                info.bottomMargin = 52
                info.leftMargin = 58
                info.rightMargin = 58
                let width = max(300, info.paperSize.width - info.leftMargin - info.rightMargin)
                let options: [NSAttributedString.DocumentReadingOptionKey: Any] = [
                    .documentType: NSAttributedString.DocumentType.html,
                    .characterEncoding: String.Encoding.utf8.rawValue
                ]
                let attributed = try NSAttributedString(data: Data(html.utf8), options: options,
                                                         documentAttributes: nil)
                let view = NSTextView(frame: NSRect(x: 0, y: 0, width: width, height: 1000))
                view.isEditable = false
                view.isVerticallyResizable = true
                view.isHorizontallyResizable = false
                view.maxSize = NSSize(width: width, height: .greatestFiniteMagnitude)
                view.textContainerInset = .zero
                view.textContainer?.widthTracksTextView = true
                view.textContainer?.containerSize = NSSize(width: width, height: .greatestFiniteMagnitude)
                view.textStorage?.setAttributedString(attributed)
                view.layoutManager?.ensureLayout(for: view.textContainer!)
                let usedHeight = view.layoutManager?.usedRect(for: view.textContainer!).height ?? 1000
                view.frame.size.height = max(100, usedHeight + 12)
                action(view, info)
            } catch {
                self.showError("Could not prepare the document for printing: \(error.localizedDescription)")
            }
        }
    }

    @objc private func toggleSource(_ sender: Any?) { webView.evaluateJavaScript("editorAPI.toggleSource()") }
    @objc private func format(_ sender: NSMenuItem) {
        guard let action = sender.representedObject as? String else { return }
        webView.evaluateJavaScript("editorAPI.format(\(jsString(action)))")
    }

    private func showError(_ message: String) {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = message
        alert.runModal()
    }

    private func makeMenu() {
        let main = NSMenu()
        NSApp.mainMenu = main

        let appItem = NSMenuItem()
        main.addItem(appItem)
        let appMenu = NSMenu(title: "MarkdownDesk")
        appItem.submenu = appMenu
        appMenu.addItem(withTitle: "About MarkdownDesk", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit MarkdownDesk", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        let fileItem = NSMenuItem()
        main.addItem(fileItem)
        let file = NSMenu(title: "File")
        fileItem.submenu = file
        file.addItem(withTitle: "New", action: #selector(newDocument(_:)), keyEquivalent: "n").target = self
        file.addItem(withTitle: "Open…", action: #selector(openDocument(_:)), keyEquivalent: "o").target = self
        file.addItem(.separator())
        file.addItem(withTitle: "Save", action: #selector(save(_:)), keyEquivalent: "s").target = self
        let saveAs = file.addItem(withTitle: "Save As…", action: #selector(saveAs(_:)), keyEquivalent: "S")
        saveAs.keyEquivalentModifierMask = [.command, .shift]
        saveAs.target = self
        file.addItem(.separator())
        file.addItem(withTitle: "Export PDF…", action: #selector(exportPDF(_:)), keyEquivalent: "e").target = self
        file.addItem(withTitle: "Print…", action: #selector(printDocument(_:)), keyEquivalent: "p").target = self

        let editItem = NSMenuItem()
        main.addItem(editItem)
        let edit = NSMenu(title: "Edit")
        editItem.submenu = edit
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        let formatItem = NSMenuItem()
        main.addItem(formatItem)
        let formatMenu = NSMenu(title: "Format")
        formatItem.submenu = formatMenu
        for (title, action, key) in [("Bold", "bold", "b"), ("Italic", "italic", "i"),
                                     ("Heading 1", "h1", "1"), ("Heading 2", "h2", "2"),
                                     ("Heading 3", "h3", "3"), ("Paragraph", "paragraph", "0"),
                                     ("Bulleted List", "unordered", ""), ("Numbered List", "ordered", ""),
                                     ("Block Quote", "quote", ""), ("Code Block", "code", ""),
                                     ("Link…", "link", "k")] {
            let item = formatMenu.addItem(withTitle: title, action: #selector(format(_:)), keyEquivalent: key)
            item.target = self
            item.representedObject = action
        }
        let viewItem = NSMenuItem()
        main.addItem(viewItem)
        let viewMenu = NSMenu(title: "View")
        viewItem.submenu = viewMenu
        let sourceItem = viewMenu.addItem(withTitle: "Toggle Markdown Source", action: #selector(toggleSource(_:)), keyEquivalent: "m")
        sourceItem.keyEquivalentModifierMask = [.command, .shift]
        sourceItem.target = self
    }
}

let app = NSApplication.shared
let controller = EditorController()
app.delegate = controller
app.setActivationPolicy(.regular)
app.run()

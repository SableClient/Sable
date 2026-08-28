import UIKit
import UniformTypeIdentifiers

// Stages incoming shares into the app group container
// (share_inbox/<batchId>/share.json + files), then opens the main app via
// sable://share. UIApplication.open only compiles while
// APPLICATION_EXTENSION_API_ONLY stays unset (see ios-project.yml).
final class ShareViewController: UIViewController {
    private var processing = false

    // group.<app identifier>, derived from our own bundle id.
    private var appGroupId: String {
        let bundleId = Bundle.main.bundleIdentifier ?? ""
        return "group." + bundleId.split(separator: ".").dropLast().joined(separator: ".")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.isHidden = true
        view.backgroundColor = .clear
        view.isOpaque = false
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !processing else { return }
        processing = true
        stageShare()
    }

    private struct StagedItem {
        let kind: String
        var text: String?
        var fileName: String?
        var mime: String?
    }

    private func stageShare() {
        guard
            let container = FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: appGroupId)
        else {
            NSLog("[share-extension] app group container unavailable: \(appGroupId)")
            complete()
            return
        }

        let batchId = "\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString)"
        let batchDir = container.appendingPathComponent("share_inbox/\(batchId)", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: batchDir, withIntermediateDirectories: true)
        } catch {
            NSLog("[share-extension] cannot create batch dir: \(error)")
            complete()
            return
        }

        let attachments = (extensionContext?.inputItems as? [NSExtensionItem] ?? [])
            .flatMap { $0.attachments ?? [] }

        var items: [StagedItem] = []
        var fileIndex = 0
        let group = DispatchGroup()
        let lock = NSLock()
        let append: (StagedItem) -> Void = { item in
            lock.lock()
            items.append(item)
            lock.unlock()
        }

        for provider in attachments {
            let types = [UTType.movie, UTType.image, UTType.fileURL, UTType.url, UTType.plainText]
            guard let type = types.first(where: {
                provider.hasItemConformingToTypeIdentifier($0.identifier)
            }) else { continue }

            lock.lock()
            let index = fileIndex
            fileIndex += 1
            lock.unlock()

            group.enter()
            if type == .image || type == .movie {
                provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, error in
                    defer { group.leave() }
                    if let error {
                        NSLog("[share-extension] load file failed for \(type.identifier): \(error)")
                        return
                    }
                    guard let url else {
                        NSLog("[share-extension] no file returned for \(type.identifier)")
                        return
                    }
                    self.stageFile(at: url, index: index, into: batchDir, append: append)
                }
                continue
            }
            provider.loadItem(forTypeIdentifier: type.identifier, options: nil) { item, error in
                defer { group.leave() }
                if let error {
                    NSLog("[share-extension] loadItem failed for \(type.identifier): \(error)")
                    return
                }
                switch type {
                case .url:
                    if let url = item as? URL {
                        if url.isFileURL {
                            self.stageFile(at: url, index: index, into: batchDir, append: append)
                        } else {
                            append(StagedItem(kind: "url", text: url.absoluteString))
                        }
                    }
                case .plainText:
                    if let text = item as? String {
                        append(StagedItem(kind: "text", text: text))
                    }
                default:
                    self.stagePayload(
                        item, provider: provider, type: type, index: index, into: batchDir,
                        append: append)
                }
            }
        }

        group.notify(queue: .main) {
            self.finishStaging(items: items, batchDir: batchDir)
        }
    }

    private func stagePayload(
        _ item: NSSecureCoding?, provider: NSItemProvider, type: UTType, index: Int,
        into batchDir: URL, append: (StagedItem) -> Void
    ) {
        if let url = item as? URL {
            stageFile(at: url, index: index, into: batchDir, append: append)
        } else if let data = item as? Data {
            let resolved =
                provider.registeredTypeIdentifiers
                .compactMap { UTType($0) }
                .first { $0.isSubtype(of: type) || $0 == type } ?? type
            let ext = resolved.preferredFilenameExtension ?? "bin"
            let name = "shared-\(index).\(ext)"
            writeData(data, name: name, mime: mimeType(for: resolved), into: batchDir, append: append)
        } else {
            NSLog("[share-extension] unsupported payload \(String(describing: item))")
        }
    }

    private func stageFile(at url: URL, index: Int, into batchDir: URL, append: (StagedItem) -> Void) {
        let sanitized = sanitize(url.lastPathComponent)
        let name = "\(index)-\(sanitized)"
        let destination = batchDir.appendingPathComponent(name)
        do {
            try FileManager.default.copyItem(at: url, to: destination)
        } catch {
            NSLog("[share-extension] copy failed: \(error)")
            return
        }
        let type = UTType(filenameExtension: url.pathExtension)
        append(StagedItem(kind: "file", fileName: name, mime: type.map(mimeType(for:))))
    }

    private func writeData(
        _ data: Data, name: String, mime: String?, into batchDir: URL,
        append: (StagedItem) -> Void
    ) {
        let destination = batchDir.appendingPathComponent(name)
        do {
            try data.write(to: destination)
        } catch {
            NSLog("[share-extension] write failed: \(error)")
            return
        }
        append(StagedItem(kind: "file", fileName: name, mime: mime))
    }

    private func mimeType(for type: UTType) -> String {
        type.preferredMIMEType ?? "application/octet-stream"
    }

    private func sanitize(_ name: String) -> String {
        let cleaned = name
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "\\", with: "_")
            .replacingOccurrences(of: "\0", with: "")
        let capped = String(cleaned.suffix(120))
        return capped.isEmpty || capped == "." || capped == ".." ? "shared" : capped
    }

    private func finishStaging(items: [StagedItem], batchDir: URL) {
        guard !items.isEmpty else {
            try? FileManager.default.removeItem(at: batchDir)
            complete()
            return
        }

        let manifest: [String: Any] = [
            "version": 1,
            "items": items.map { item in
                var entry: [String: Any] = ["kind": item.kind]
                if let text = item.text { entry["text"] = text }
                if let fileName = item.fileName { entry["fileName"] = fileName }
                if let mime = item.mime { entry["mime"] = mime }
                return entry
            },
        ]
        do {
            let data = try JSONSerialization.data(withJSONObject: manifest)
            try data.write(to: batchDir.appendingPathComponent("share.json"))
        } catch {
            NSLog("[share-extension] manifest write failed: \(error)")
            try? FileManager.default.removeItem(at: batchDir)
            complete()
            return
        }

        openHostApp()
        // Completing immediately can cancel the open on some iOS builds.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            self.complete()
        }
    }

    // extensionContext.open never calls its completion for share extensions.
    private func openHostApp() {
        guard let url = URL(string: "sable://share") else { return }
        var responder: UIResponder? = self
        while let current = responder {
            if let application = current as? UIApplication {
                application.open(url, options: [:], completionHandler: nil)
                return
            }
            responder = current.next
        }
        NSLog("[share-extension] no UIApplication in responder chain")
    }

    private func complete() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
}

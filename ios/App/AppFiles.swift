import WebKit
import UniformTypeIdentifiers

/// Serves the app's own copy of the web app (the `web` folder in the bundle, made by make-web.py) at btl://app/,
/// and, under btl://app/__open/, the files handed over by other apps while the page reads them.
final class AppFiles: NSObject, WKURLSchemeHandler {
    static let scheme = "btl"
    static let home = URL(string: "btl://app/index.html")!
    private static let web = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
    private static let handed = FileManager.default.temporaryDirectory.appendingPathComponent("handed", isDirectory: true)
    private static let types = ["html": "text/html", "js": "text/javascript", "mjs": "text/javascript", "css": "text/css", "json": "application/json",
                                "svg": "image/svg+xml", "woff2": "font/woff2", "wasm": "application/wasm", "aff": "text/plain", "dic": "text/plain"]

    /// A copy of a handed-over file, kept until the page has read it. Returns the address the page fetches it from.
    static func hold(_ file: URL) -> (url: URL, folder: URL)? {
        let folder = handed.appendingPathComponent(UUID().uuidString, isDirectory: true), name = file.lastPathComponent
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try FileManager.default.copyItem(at: file, to: folder.appendingPathComponent(name))
        } catch { return nil }
        var c = URLComponents(); c.scheme = scheme; c.host = "app"; c.path = "/__open/" + folder.lastPathComponent + "/" + name
        guard let url = c.url else { return nil }
        return (url, folder)
    }
    static func mimeType(_ ext: String) -> String {
        let e = ext.lowercased()
        return types[e] ?? UTType(filenameExtension: e)?.preferredMIMEType ?? "application/octet-stream"
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return task.didFailWithError(URLError(.badURL)) }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let open = path.hasPrefix("/__open/"), root = (open ? Self.handed : Self.web).standardizedFileURL
        let file = root.appendingPathComponent(String(path.dropFirst(open ? 8 : 1))).standardizedFileURL
        // (only what is inside the folder: no ../ out of it)
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file, options: .mappedIfSafe) else {
            task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/plain", "Content-Length": "0"])!)
            task.didReceive(Data()); task.didFinish(); return
        }
        var type = Self.mimeType(file.pathExtension)
        if type.hasPrefix("text/") || type == "application/json" { type += "; charset=utf-8" }
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": type, "Content-Length": String(data.count), "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*"])!)
        task.didReceive(data); task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}       // (everything is sent at once in start, so there is nothing to stop)
}

import ExpoModulesCore
import PDFKit

/// Reads the text of a PDF on the device with PDFKit. Nothing leaves the phone.
///
/// `extractText(uri, password)` resolves to:
///   { status: "ok", pages: [[line, ...], ...], text: "..." }
///   { status: "password_required" }  when the PDF is locked and no password was given
///   { status: "wrong_password" }     when the given password does not unlock it
public class EpfPdfModule: Module {
  public func definition() -> ModuleDefinition {
    Name("EpfPdf")

    AsyncFunction("extractText") { (uri: String, password: String?) -> [String: Any] in
      guard let url = Self.fileURL(from: uri) else {
        throw InvalidPdfException("Not a file link: \(uri)")
      }
      let scoped = url.startAccessingSecurityScopedResource()
      defer { if scoped { url.stopAccessingSecurityScopedResource() } }

      guard let doc = PDFDocument(url: url) else {
        throw InvalidPdfException("This file could not be opened as a PDF.")
      }

      if doc.isLocked {
        guard let password = password, !password.isEmpty else {
          return ["status": "password_required"]
        }
        if !doc.unlock(withPassword: password) {
          return ["status": "wrong_password"]
        }
      }

      var pages: [[String]] = []
      for index in 0..<doc.pageCount {
        guard let page = doc.page(at: index) else { continue }
        var lines: [String] = []
        // Line-by-line selections keep table rows together, which makes the
        // passbook much easier to parse than the page's plain string.
        if let selection = page.selection(for: page.bounds(for: .mediaBox)) {
          for line in selection.selectionsByLine() {
            if let s = line.string?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty {
              lines.append(s)
            }
          }
        }
        if lines.isEmpty, let s = page.string {
          lines = s.components(separatedBy: .newlines).filter { !$0.isEmpty }
        }
        pages.append(lines)
      }

      return ["status": "ok", "pages": pages, "text": doc.string ?? ""]
    }
  }

  private static func fileURL(from uri: String) -> URL? {
    if uri.hasPrefix("file://"), let url = URL(string: uri) { return url }
    if uri.hasPrefix("/") { return URL(fileURLWithPath: uri) }
    return nil
  }
}

internal final class InvalidPdfException: GenericException<String> {
  override var reason: String { param }
}

import SwiftUI
import SafariServices

struct SafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}

private struct WebLink: Identifiable { let url: URL; var id: String { url.absoluteString } }

/// "Read full article" opens the original in the in-app browser. Required on every article, AI and quick item.
struct ReadFullArticleButton: View {
    var url: String
    var track: Track = .tech
    var compact = false
    @State private var link: WebLink?

    var body: some View {
        if let u = validURL {
            Button {
                Haptics.tap()
                link = WebLink(url: u)
            } label: {
                Label("Read full article", systemImage: "arrow.up.right.square")
                    .frame(maxWidth: compact ? nil : .infinity)
            }
            .buttonStyle(AccentButtonStyle(accent: DT.accent(track)))
            .accessibilityHint("Opens the original article in an in-app browser")
            .fullScreenCover(item: $link) { l in
                SafariView(url: l.url).ignoresSafeArea()
            }
        } else {
            Text("Original link unavailable").font(.footnote).foregroundStyle(DT.textMuted)
        }
    }

    private var validURL: URL? {
        guard let u = URL(string: url), let s = u.scheme?.lowercased(), s == "http" || s == "https" else { return nil }
        return u
    }
}

/// "Source name  ·  28 Oct 2026  ·  12 min"
struct SourceLine: View {
    var source: String
    var publishedAt: String?
    var minutes: Int?
    var capped = false
    var body: some View {
        let parts = [source.isEmpty ? nil : source, DateText.short(publishedAt),
                     minutes.map { capped ? "20+ min" : "\($0) min" }].compactMap { $0 }
        Text(parts.joined(separator: "  ·  "))
            .font(.footnote.weight(.medium))
            .foregroundStyle(DT.textMuted)
    }
}

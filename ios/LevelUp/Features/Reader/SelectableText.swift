import SwiftUI
import UIKit

/// Selectable paragraph. The edit menu gains "Save word" so any selected word or phrase can be saved for review.
struct SelectableText: UIViewRepresentable {
    var text: String
    var size: CGFloat
    var serif: Bool
    var monospaced = false
    var onSave: (String) -> Void

    func makeUIView(context: Context) -> UITextView {
        let tv = UITextView()
        tv.isEditable = false
        tv.isSelectable = true
        tv.isScrollEnabled = false
        tv.backgroundColor = .clear
        tv.textContainerInset = .zero
        tv.textContainer.lineFragmentPadding = 0
        tv.delegate = context.coordinator
        tv.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return tv
    }

    func updateUIView(_ tv: UITextView, context: Context) {
        context.coordinator.onSave = onSave
        let font: UIFont
        if monospaced {
            font = .monospacedSystemFont(ofSize: size * 0.85, weight: .regular)
        } else if serif, let d = UIFont.systemFont(ofSize: size).fontDescriptor.withDesign(.serif) {
            font = UIFont(descriptor: d, size: size)
        } else {
            font = .systemFont(ofSize: size)
        }
        let para = NSMutableParagraphStyle()
        para.lineSpacing = size * 0.38   // roughly the web app's 1.75 reading line height
        tv.attributedText = NSAttributedString(string: text, attributes: [
            .font: font, .foregroundColor: DT.uiReadingText, .paragraphStyle: para
        ])
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        let w = proposal.width ?? 320
        let s = uiView.sizeThatFits(CGSize(width: w, height: .greatestFiniteMagnitude))
        return CGSize(width: w, height: ceil(s.height))
    }

    func makeCoordinator() -> Coordinator { Coordinator(onSave: onSave) }

    final class Coordinator: NSObject, UITextViewDelegate {
        var onSave: (String) -> Void
        init(onSave: @escaping (String) -> Void) { self.onSave = onSave }

        func textView(_ textView: UITextView, editMenuForTextIn range: NSRange, suggestedActions: [UIMenuElement]) -> UIMenu? {
            guard range.length > 0 else { return UIMenu(children: suggestedActions) }
            let selected = (textView.text as NSString).substring(with: range)
            let save = UIAction(title: "Save word", image: UIImage(systemName: "plus.circle")) { [weak self] _ in
                self?.onSave(selected)
            }
            return UIMenu(children: [save] + suggestedActions)
        }
    }
}

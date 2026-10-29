import AVFoundation

/// Text-to-speech for word pronunciation and shadowing model sentences.
@MainActor
final class SpeechOutput {
    static let shared = SpeechOutput()
    private let synth = AVSpeechSynthesizer()

    func speak(_ text: String, rate: Float = AVSpeechUtteranceDefaultSpeechRate * 0.9) {
        guard !text.isEmpty else { return }
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        synth.stopSpeaking(at: .immediate)
        let u = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice(language: "en-US")
        u.rate = rate
        synth.speak(u)
    }

    func stop() { synth.stopSpeaking(at: .immediate) }
}

import AVFoundation
import Speech
import Observation

/// Receives microphone buffers on the audio thread: writes the file, feeds the recogniser, reports level.
private final class AudioTap: @unchecked Sendable {
    let file: AVAudioFile
    let request: SFSpeechAudioBufferRecognitionRequest?
    let onLevel: @Sendable (Float) -> Void

    init(file: AVAudioFile, request: SFSpeechAudioBufferRecognitionRequest?, onLevel: @escaping @Sendable (Float) -> Void) {
        self.file = file; self.request = request; self.onLevel = onLevel
    }

    func handle(_ buffer: AVAudioPCMBuffer) {
        try? file.write(from: buffer)
        request?.append(buffer)
        guard let ch = buffer.floatChannelData?[0] else { return }
        let n = Int(buffer.frameLength)
        guard n > 0 else { return }
        var sum: Float = 0
        for i in 0..<n { sum += ch[i] * ch[i] }
        let rms = (sum / Float(n)).squareRoot()
        onLevel(min(1, rms * 8))   // rough 0...1 for the orb
    }
}

struct RecordingResult {
    var transcript: String
    var duration: Double
    var fileURL: URL?
}

/// Records the mic to a file while transcribing live. Degrades to audio-only when speech is unavailable.
@Observable @MainActor
final class SpeechRecorder {
    enum State { case idle, recording }

    private(set) var state: State = .idle
    private(set) var transcript = ""
    private(set) var level: Float = 0
    private(set) var elapsed: Double = 0
    private(set) var micDenied = false
    private(set) var speechUnavailable = false
    private(set) var errorMessage: String?
    private(set) var lastFile: URL?

    @ObservationIgnored private let engine = AVAudioEngine()
    @ObservationIgnored private var task: SFSpeechRecognitionTask?
    @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var startedAt = Date()
    @ObservationIgnored private var ticker: Task<Void, Never>?
    @ObservationIgnored private var player: AVAudioPlayer?

    var isRecording: Bool { state == .recording }

    static var recordingsDirectory: URL {
        let d = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Recordings", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    func start() async {
        errorMessage = nil
        guard await requestMic() else { micDenied = true; errorMessage = "Microphone access is off. Enable it in Settings to record."; return }
        micDenied = false
        let speechOK = await requestSpeech()
        speechUnavailable = !speechOK
        transcript = ""; elapsed = 0; level = 0
        stopPlayback()
        SpeechOutput.shared.stop()

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try session.setActive(true)

            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            let url = Self.recordingsDirectory.appendingPathComponent("\(UUID().uuidString).m4a")
            let file = try AVAudioFile(forWriting: url, settings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: format.sampleRate,
                AVNumberOfChannelsKey: format.channelCount
            ])

            var req: SFSpeechAudioBufferRecognitionRequest?
            if speechOK, let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")), recognizer.isAvailable {
                let r = SFSpeechAudioBufferRecognitionRequest()
                r.shouldReportPartialResults = true
                if recognizer.supportsOnDeviceRecognition { r.requiresOnDeviceRecognition = true }
                req = r
                task = recognizer.recognitionTask(with: r) { [weak self] result, _ in
                    guard let text = result?.bestTranscription.formattedString else { return }
                    Task { @MainActor in self?.transcript = text }
                }
            } else {
                speechUnavailable = true
            }
            request = req

            let tap = AudioTap(file: file, request: req) { [weak self] lv in
                Task { @MainActor in self?.level = lv }
            }
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in tap.handle(buffer) }
            engine.prepare()
            try engine.start()

            lastFile = url
            startedAt = Date()
            state = .recording
            ticker = Task { [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 250_000_000)
                    guard let self else { return }
                    self.elapsed = Date().timeIntervalSince(self.startedAt)
                }
            }
        } catch {
            errorMessage = "Could not start recording: \(error.localizedDescription)"
            teardown()
        }
    }

    func stop() async -> RecordingResult {
        let duration = Date().timeIntervalSince(startedAt)
        teardown()
        // The recogniser delivers its final words shortly after the audio ends.
        try? await Task.sleep(nanoseconds: 600_000_000)
        task?.finish(); task = nil; request = nil
        return RecordingResult(transcript: transcript, duration: duration, fileURL: lastFile)
    }

    private func teardown() {
        ticker?.cancel(); ticker = nil
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        state = .idle
        level = 0
    }

    func play(_ url: URL) {
        stopPlayback()
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        try? AVAudioSession.sharedInstance().setActive(true)
        player = try? AVAudioPlayer(contentsOf: url)
        player?.play()
    }

    func stopPlayback() { player?.stop(); player = nil }

    private func requestMic() async -> Bool {
        await withCheckedContinuation { cont in
            AVAudioApplication.requestRecordPermission { cont.resume(returning: $0) }
        }
    }

    private func requestSpeech() async -> Bool {
        let status = SFSpeechRecognizer.authorizationStatus()
        if status == .authorized { return true }
        if status != .notDetermined { return false }
        return await withCheckedContinuation { cont in
            SFSpeechRecognizer.requestAuthorization { cont.resume(returning: $0 == .authorized) }
        }
    }
}

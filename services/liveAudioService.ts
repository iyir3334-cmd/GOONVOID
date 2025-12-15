
// Live Audio Transcription Service - DISABLED
// This service previously used Gemini Live API for audio transcription
// It has been disabled after removing the Gemini API dependency

export class LiveTranscriptionService {
    constructor(private onText: (text: string) => void, private onError: (err: string) => void) { }

    async start(stream: MediaStream) {
        console.warn("[LiveTranscriptionService] This service has been disabled after removing Gemini API");
        this.onError("Live transcription is currently unavailable.");
    }

    stop() {
        // No-op
    }
}

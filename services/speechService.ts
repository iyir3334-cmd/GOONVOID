
export interface SpeechConfig {
    onResult: (text: string) => void;
    onEnd: () => void;
    onError: (error: string) => void;
}

let recognition: any = null;
let isRunning = false;
let restartTimer: any = null;

export const isSpeechSupported = () => {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
};

export const startSpeechRecognition = (config: SpeechConfig) => {
    if (!isSpeechSupported()) {
        config.onError("Browser does not support Speech Recognition (Chrome recommended).");
        return;
    }

    // Prevent multiple instances
    if (recognition && isRunning) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US'; // Default to English for goon captions
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        console.log("[SpeechService] Recognition started");
        isRunning = true;
    };

    recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        // We prefer final results, but interim is faster for "Hypno" feel.
        // We filter for length to avoid capturing random noise/breathing.
        const textToProcess = finalTranscript || interimTranscript;
        
        // Gooner Logic: Filter for phrases with substance (>= 5 words)
        // This helps filter out simple "Ah", "Oh", "Yeah" noise common in adult videos.
        const words = textToProcess.trim().split(/\s+/);
        
        if (words.length >= 4) { 
            // Normalize text for Hypno style
            const hypnoText = textToProcess.toUpperCase().trim();
            config.onResult(hypnoText);
        }
    };

    recognition.onerror = (event: any) => {
        console.warn("[SpeechService] Error", event.error);
        if (event.error === 'not-allowed') {
            config.onError("Microphone access denied. Enable it to sync captions.");
            stopSpeechRecognition();
        } else if (event.error === 'network') {
            config.onError("Network error: Cannot reach speech servers. Check connection or firewall.");
            stopSpeechRecognition();
        } else if (event.error === 'aborted') {
            // Expected when stopping manually
        } else if (event.error === 'no-speech') {
            // Ignore no-speech, let it loop in onend
        } else {
             // For other fatal errors
             console.log("Speech Error:", event.error);
             // We don't stop for 'language-not-supported' or 'audio-capture' immediately unless persistent,
             // but usually safer to just log.
        }
    };

    recognition.onend = () => {
        console.log("[SpeechService] Recognition ended");
        isRunning = false;
        
        // Auto-restart if we didn't explicitly stop it (Continuous listening)
        // We check 'recognition' variable (it is set to null in stopSpeechRecognition)
        if (recognition) {
            clearTimeout(restartTimer);
            restartTimer = setTimeout(() => {
                try {
                    // Double check if it wasn't stopped during the timeout
                    if (recognition) {
                        recognition.start();
                    }
                } catch (e) {
                    console.log("Restart failed", e);
                    stopSpeechRecognition();
                }
            }, 100);
        } else {
            config.onEnd();
        }
    };

    try {
        recognition.start();
    } catch (e) {
        console.error("Failed to start recognition", e);
        config.onError("Failed to start speech engine.");
    }
};

export const stopSpeechRecognition = () => {
    if (recognition) {
        const tempRec = recognition;
        recognition = null; // Flag to prevent auto-restart in onend
        try {
            tempRec.stop();
        } catch(e) { console.log("Stop failed", e); }
        isRunning = false;
        clearTimeout(restartTimer);
    }
};

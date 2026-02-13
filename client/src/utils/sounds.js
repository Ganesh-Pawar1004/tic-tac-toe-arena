// Simple sound generator using Web Audio API
// No external files needed - works 100% offline

export const playGameSound = (type) => {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        switch (type) {
            case 'move':
                // Quick click sound
                oscillator.frequency.value = 800;
                gainNode.gain.value = 0.15;
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.08);
                break;

            case 'win':
                // Happy ascending tones (C-E-G chord)
                oscillator.frequency.value = 523; // C
                gainNode.gain.value = 0.2;
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.12);

                setTimeout(() => {
                    const osc2 = audioContext.createOscillator();
                    const gain2 = audioContext.createGain();
                    osc2.connect(gain2);
                    gain2.connect(audioContext.destination);
                    osc2.frequency.value = 659; // E
                    gain2.gain.value = 0.2;
                    osc2.start();
                    osc2.stop(audioContext.currentTime + 0.12);
                }, 120);

                setTimeout(() => {
                    const osc3 = audioContext.createOscillator();
                    const gain3 = audioContext.createGain();
                    osc3.connect(gain3);
                    gain3.connect(audioContext.destination);
                    osc3.frequency.value = 784; // G
                    gain3.gain.value = 0.2;
                    osc3.start();
                    osc3.stop(audioContext.currentTime + 0.15);
                }, 240);
                break;

            case 'loss':
                // Sad descending tone
                oscillator.frequency.value = 400;
                gainNode.gain.value = 0.2;
                oscillator.type = 'sawtooth';
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.4);
                break;

            case 'draw':
                // Neutral mid tone
                oscillator.frequency.value = 440; // A
                gainNode.gain.value = 0.15;
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.2);
                break;

            case 'countdown':
                // Short high beep
                oscillator.frequency.value = 1200;
                gainNode.gain.value = 0.12;
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.06);
                break;

            default:
                oscillator.frequency.value = 440;
                gainNode.gain.value = 0.1;
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.1);
        }
    } catch (err) {
        console.log('Audio generation failed:', err);
    }
};

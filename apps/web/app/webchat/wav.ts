/**
 * Converte a gravação do navegador (WebM/Opus no Chrome, MP4 no Safari) em WAV PCM 16 kHz mono — formato
 * que os modelos de transcrição aceitam oficialmente. O Gemini não suporta WebM e, recebendo um, devolvia
 * "transcrições" inventadas ("estrada", "00:00"). 16 kHz mono basta para voz: 60 s ≈ 1,9 MB.
 */
const TARGET_RATE = 16_000;
/** Abaixo disso (RMS de amostras entre -1 e 1) a gravação é silêncio: microfone mudo ou errado. */
const SILENCE_RMS = 0.005;

export interface WavResult {
  blob: Blob;
  seconds: number;
  silent: boolean;
}

export async function toWav16kMono(recording: Blob): Promise<WavResult> {
  const bytes = await recording.arrayBuffer();
  const Ctx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(bytes);
  } finally {
    void ctx.close();
  }

  const length = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
  const offline = new OfflineAudioContext(1, length, TARGET_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination); // mistura os canais em mono
  source.start();
  const samples = (await offline.startRendering()).getChannelData(0);

  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) sumSquares += samples[i] * samples[i];
  const rms = Math.sqrt(sumSquares / samples.length);

  return { blob: encodeWav(samples, TARGET_RATE), seconds: decoded.duration, silent: rms < SILENCE_RMS };
}

function encodeWav(samples: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // tamanho do bloco fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // bytes por segundo
  view.setUint16(32, 2, true); // bytes por amostra
  view.setUint16(34, 16, true); // bits por amostra
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

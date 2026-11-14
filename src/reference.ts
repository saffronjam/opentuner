import e2 from "./samples/E2.mp3?url";
import a2 from "./samples/A2.mp3?url";
import d3 from "./samples/D3.mp3?url";
import g3 from "./samples/G3.mp3?url";
import b3 from "./samples/B3.mp3?url";
import e4 from "./samples/E4.mp3?url";
import e5 from "./samples/E5.mp3?url";
const samples = [
  { midi: 40, frequency: 82.5718163649868, url: e2 },
  { midi: 45, frequency: 110.07938005483496, url: a2 },
  { midi: 50, frequency: 146.95589704239873, url: d3 },
  { midi: 55, frequency: 196.33813195359346, url: g3 },
  { midi: 59, frequency: 247.8559137199614, url: b3 },
  { midi: 64, frequency: 330.3954799678516, url: e4 },
  { midi: 76, frequency: 660.9635485483268, url: e5 },
];
export function referenceFor(midi: number) {
  const sample = samples.reduce((best, s) =>
    Math.abs(s.midi - midi) < Math.abs(best.midi - midi) ? s : best,
  );
  return { ...sample, rate: (440 * 2 ** ((midi - 69) / 12)) / sample.frequency };
}
export class ReferencePlayer {
  private context: AudioContext | null = null;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private source: AudioBufferSourceNode | null = null;
  private generation = 0;
  async play(midi: number, suppress: (milliseconds: number) => void) {
    const generation = ++this.generation;
    this.source?.stop();
    this.source = null;
    this.context ??= new AudioContext();
    const context = this.context;
    await context.resume();
    const sample = referenceFor(midi);
    let buffer = this.buffers.get(sample.url);
    if (!buffer) {
      buffer = fetch(sample.url)
        .then((r) => {
          if (!r.ok) throw new Error("Reference sound unavailable");
          return r.arrayBuffer();
        })
        .then((data) => context.decodeAudioData(data));
      this.buffers.set(sample.url, buffer);
      buffer.catch(() => this.buffers.delete(sample.url));
    }
    const decoded = await buffer;
    if (generation !== this.generation) return;
    const source = context.createBufferSource();
    source.buffer = decoded;
    source.playbackRate.value = sample.rate;
    source.connect(context.destination);
    this.source = source;
    suppress((decoded.duration / sample.rate) * 1000 + 300);
    source.start();
    source.onended = () => {
      source.disconnect();
      if (this.source === source) this.source = null;
    };
  }
  stop() {
    this.generation++;
    this.source?.stop();
    this.source = null;
  }
}

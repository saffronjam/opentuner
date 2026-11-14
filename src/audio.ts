import captureSource from "./capture.worklet.js?raw";
import type { Reading } from "./tuning";
export class AudioEngine {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private worker: Worker | null = null;
  private capture: AudioWorkletNode | null = null;
  private generation = 0;
  private busy = false;
  private mutedUntil = 0;
  private wake: WakeLockSentinel | null = null;
  async start(onReading: (r: Reading) => void, onEnded: () => void) {
    this.stop();
    const generation = this.generation;
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error("Use HTTPS to enable the microphone.");
    const context = new AudioContext();
    this.context = context;
    try {
      // Start resuming synchronously when called from a user gesture.
      void context.resume().catch(() => {});
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch (error) {
        if (!["NotSupportedError", "OverconstrainedError"].includes((error as Error).name))
          throw error;
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      if (generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      await Promise.race([
        context.resume(),
        new Promise<void>((resolve) => setTimeout(resolve, 350)),
      ]);
      if (context.state !== "running")
        throw new DOMException("Tap to enable audio", "InteractionRequiredError");
      stream.getTracks().forEach((t) => t.addEventListener("ended", onEnded));
      const captureURL = URL.createObjectURL(
        new Blob([captureSource], { type: "text/javascript" }),
      );
      try {
        await context.audioWorklet.addModule(captureURL);
      } finally {
        URL.revokeObjectURL(captureURL);
      }
      if (generation !== this.generation) return;
      const capture = new AudioWorkletNode(context, "capture");
      this.capture = capture;
      const worker = new Worker(new URL("./detector.worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker = worker;
      worker.onerror = onEnded;
      worker.onmessage = (e) => {
        this.busy = false;
        if (generation !== this.generation) return;
        capture.port.postMessage(e.data.buffer, [e.data.buffer]);
        if (performance.now() > this.mutedUntil) onReading(e.data);
      };
      capture.port.onmessage = (e) => {
        if (this.busy || performance.now() < this.mutedUntil) {
          capture.port.postMessage(e.data.buffer, [e.data.buffer]);
          return;
        }
        this.busy = true;
        worker.postMessage(
          { samples: e.data, rate: context.sampleRate, time: performance.now(), generation },
          [e.data.buffer],
        );
      };
      const silence = context.createGain();
      silence.gain.value = 0;
      context
        .createMediaStreamSource(stream)
        .connect(capture)
        .connect(silence)
        .connect(context.destination);
      try {
        this.wake = (await navigator.wakeLock?.request("screen")) ?? null;
        if (generation !== this.generation) {
          await this.wake?.release();
          this.wake = null;
        }
      } catch {
        /* Optional platform feature. */
      }
    } catch (error) {
      if (generation === this.generation) this.stop();
      throw error;
    }
  }
  suppressFor(milliseconds: number) {
    this.mutedUntil = performance.now() + milliseconds;
  }
  chime() {
    const c = this.context;
    if (!c) return;
    this.mutedUntil = performance.now() + 550;
    const o = c.createOscillator(),
      g = c.createGain();
    o.frequency.setValueAtTime(660, c.currentTime);
    o.frequency.setValueAtTime(880, c.currentTime + 0.09);
    g.gain.setValueAtTime(0.035, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.24);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.25);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  stop() {
    this.generation++;
    this.busy = false;
    this.capture?.disconnect();
    this.capture = null;
    this.worker?.terminate();
    this.worker = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.context?.close();
    this.context = null;
    void this.wake?.release();
    this.wake = null;
  }
}

import { PitchDetector } from "pitchy";
const detector = PitchDetector.forFloat32Array(4096);
self.onmessage = (
  e: MessageEvent<{ samples: Float32Array; rate: number; time: number; generation: number }>,
) => {
  const { samples, rate, time, generation } = e.data;
  let mean = 0;
  for (const v of samples) mean += v;
  mean /= samples.length;
  let power = 0;
  for (let i = 0; i < samples.length; i++) {
    samples[i] -= mean;
    power += samples[i] * samples[i];
  }
  const [frequency, clarity] =
    power / samples.length > 0.000003 ? detector.findPitch(samples, rate) : [0, 0];
  self.postMessage(
    { frequency, clarity, time, generation, buffer: samples.buffer },
    { transfer: [samples.buffer] },
  );
};

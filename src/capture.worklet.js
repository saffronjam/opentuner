class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(4096);
    this.position = 0;
    this.total = 0;
    this.hop = 0;
    this.free = [new Float32Array(4096), new Float32Array(4096)];
    this.port.onmessage = (e) => this.free.push(new Float32Array(e.data));
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input)
      for (const sample of input) {
        this.ring[this.position] = sample;
        this.position = (this.position + 1) % 4096;
        this.total++;
        this.hop++;
        if (this.total >= 4096 && this.hop >= 1024) {
          this.hop = 0;
          const frame = this.free.pop();
          if (frame) {
            for (let i = 0; i < 4096; i++) frame[i] = this.ring[(this.position + i) % 4096];
            this.port.postMessage(frame, [frame.buffer]);
          }
        }
      }
    return true;
  }
}
registerProcessor("capture", Capture);

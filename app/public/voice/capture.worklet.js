// Batches render quanta into 40 ms mono Float32 blocks at 24 kHz for the main thread.
const BLOCK = 960;

class SteveCapture extends AudioWorkletProcessor {
  block = new Float32Array(BLOCK);
  filled = 0;
  muted = false;
  // Mute generation set by the main thread. Tags every posted block.
  gen = 0;

  constructor() {
    super();
    // A mute transition drops the partial block so muted samples never
    // complete a later frame.
    this.port.onmessage = ({ data }) => {
      if (data?.type !== "mute") return;
      this.muted = data.muted === true;
      this.gen = data.gen;
      this.filled = 0;
    };
  }

  process(inputs) {
    if (this.muted) return true;
    const channel = inputs[0]?.[0];
    for (let i = 0; channel && i < channel.length; i++) {
      this.block[this.filled++] = channel[i];
      if (this.filled === BLOCK) {
        this.port.postMessage({ gen: this.gen, samples: this.block }, [this.block.buffer]);
        this.block = new Float32Array(BLOCK);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor("steve-capture", SteveCapture);

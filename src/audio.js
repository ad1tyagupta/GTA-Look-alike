export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineGain = null;
    this.engineOsc = null;
    this.sirenGain = null;
    this.sirenOsc = null;
    this.ambientGain = null;
    this.ambientOscA = null;
    this.ambientOscB = null;
    this.ambienceNoise = null;
    this.ambienceNoiseFilter = null;
    this.enabled = false;
  }

  ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.17;
    this.master.connect(this.ctx.destination);

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.master);
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc.frequency.value = 70;
    this.engineOsc.connect(this.engineGain);
    this.engineOsc.start();

    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenGain.connect(this.master);
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = "square";
    this.sirenOsc.frequency.value = 420;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenOsc.start();

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0;
    this.ambientGain.connect(this.master);

    this.ambientOscA = this.ctx.createOscillator();
    this.ambientOscA.type = "triangle";
    this.ambientOscA.frequency.value = 110;
    this.ambientOscA.connect(this.ambientGain);
    this.ambientOscA.start();

    this.ambientOscB = this.ctx.createOscillator();
    this.ambientOscB.type = "sine";
    this.ambientOscB.frequency.value = 220;
    this.ambientOscB.connect(this.ambientGain);
    this.ambientOscB.start();

    const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * 0.18;
    this.ambienceNoise = this.ctx.createBufferSource();
    this.ambienceNoise.buffer = noiseBuffer;
    this.ambienceNoise.loop = true;
    this.ambienceNoiseFilter = this.ctx.createBiquadFilter();
    this.ambienceNoiseFilter.type = "lowpass";
    this.ambienceNoiseFilter.frequency.value = 480;
    this.ambienceNoise.connect(this.ambienceNoiseFilter);
    this.ambienceNoiseFilter.connect(this.ambientGain);
    this.ambienceNoise.start();
  }

  unlock() {
    this.ensure();
    if (!this.ctx) return;
    this.enabled = true;
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  update({ speed = 0, wanted = 0, districtId = "residential" }) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(60 + speed * 0.42, now, 0.08);
    this.engineGain.gain.setTargetAtTime(Math.min(0.08, speed / 2200), now, 0.09);
    this.sirenOsc.frequency.setTargetAtTime(420 + Math.sin(now * 7) * 140, now, 0.04);
    this.sirenGain.gain.setTargetAtTime(wanted > 0.75 ? Math.min(0.06, wanted * 0.016) : 0, now, 0.08);

    const districtProfile =
      districtId === "downtown"
        ? { toneA: 74, toneB: 148, noiseCutoff: 760, gain: 0.018 }
        : districtId === "industrial"
          ? { toneA: 54, toneB: 92, noiseCutoff: 420, gain: 0.016 }
          : { toneA: 182, toneB: 264, noiseCutoff: 1180, gain: 0.012 };
    this.ambientOscA.frequency.setTargetAtTime(districtProfile.toneA + Math.sin(now * 0.9) * 6, now, 0.35);
    this.ambientOscB.frequency.setTargetAtTime(districtProfile.toneB + Math.cos(now * 0.7) * 9, now, 0.35);
    this.ambienceNoiseFilter.frequency.setTargetAtTime(districtProfile.noiseCutoff + wanted * 90, now, 0.45);
    this.ambientGain.gain.setTargetAtTime(districtProfile.gain + Math.min(0.012, wanted * 0.003), now, 0.3);
  }

  burst(freq, duration, type = "triangle", gainValue = 0.08) {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = gainValue;
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
    osc.stop(this.ctx.currentTime + duration);
  }

  playShot() {
    this.burst(420, 0.12, "square", 0.045);
  }

  playHit() {
    this.burst(180, 0.16, "triangle", 0.05);
  }

  playMissionSuccess() {
    if (!this.enabled || !this.ctx) return;
    this.burst(520, 0.18, "triangle", 0.06);
    setTimeout(() => this.burst(740, 0.24, "triangle", 0.05), 90);
  }

  playMissionFail() {
    this.burst(180, 0.25, "sawtooth", 0.07);
  }

  playCash() {
    this.burst(680, 0.14, "triangle", 0.04);
  }

  playUiBlip() {
    this.burst(520, 0.08, "triangle", 0.03);
  }
}

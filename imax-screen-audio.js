// IMAX screen L/C/R software audio matrix.
// Stereo playback uses a phantom-centre matrix; hardware multi-channel output
// remains dependent on browser, OS and the connected audio device.
(() => {
  const video = document.getElementById('imax-video');
  if (!video) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const state = { enabled: true, left: 1, center: 0.75, right: 1 };
  let context = null;
  const graphs = new WeakMap();
  const attached = new Set();

  function ensureContext() {
    if (!AudioContextClass) throw new Error('Web Audio is not supported in this browser');
    if (!context) context = new AudioContextClass({ latencyHint: 'playback' });
    return context;
  }

  function connectMediaElement(media) {
    if (!media || graphs.has(media)) return;
    const ctx = ensureContext();
    const source = ctx.createMediaElementSource(media);
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);
    const left = ctx.createGain();
    const right = ctx.createGain();
    const centerFromLeft = ctx.createGain();
    const centerFromRight = ctx.createGain();
    const master = ctx.createGain();

    source.connect(splitter);
    splitter.connect(left, 0);
    splitter.connect(right, 1);
    splitter.connect(centerFromLeft, 0);
    splitter.connect(centerFromRight, 1);
    left.connect(merger, 0, 0);
    right.connect(merger, 0, 1);
    // Fold a controlled mono centre image into both stereo outputs.
    centerFromLeft.connect(merger, 0, 1);
    centerFromRight.connect(merger, 0, 0);
    merger.connect(master);
    master.connect(ctx.destination);

    const graph = { source, splitter, merger, left, right, centerFromLeft, centerFromRight, master };
    graphs.set(media, graph);
    attached.add(media);
    applyLevels(graph);
  }

  function applyLevels(graph) {
    const t = context ? context.currentTime : 0;
    const ramp = (node, value) => {
      node.gain.cancelScheduledValues(t);
      node.gain.setTargetAtTime(state.enabled ? value : 0, t, 0.035);
    };
    ramp(graph.left, state.left * 0.82);
    ramp(graph.right, state.right * 0.82);
    ramp(graph.centerFromLeft, state.center * 0.22);
    ramp(graph.centerFromRight, state.center * 0.22);
    ramp(graph.master, 1);
  }

  function updateAll() {
    attached.forEach(media => {
      const graph = graphs.get(media);
      if (graph) applyLevels(graph);
    });
    const stateLabel = document.getElementById('screen-audio-state');
    if (stateLabel) stateLabel.textContent = state.enabled ? 'ACTIVE' : 'BYPASSED';
  }

  function setLevel(channel, value) {
    if (!['left', 'center', 'right'].includes(channel)) return;
    state[channel] = Math.max(0, Math.min(1.5, Number(value) / 100));
    updateAll();
  }

  function resume() {
    if (context && context.state === 'suspended') context.resume().catch(() => {});
  }

  try {
    connectMediaElement(video);
    const manager = window.imaxAudioTrackManager;
    if (manager && manager.audioElement) connectMediaElement(manager.audioElement);
  } catch (error) {
    console.warn('IMAX screen audio engine unavailable:', error);
    const stateLabel = document.getElementById('screen-audio-state');
    if (stateLabel) stateLabel.textContent = 'UNAVAILABLE';
  }

  document.addEventListener('pointerdown', resume, { passive: true });
  video.addEventListener('playing', resume);
  const trackAudio = window.imaxAudioTrackManager && window.imaxAudioTrackManager.audioElement;
  if (trackAudio) trackAudio.addEventListener('playing', resume);

  ['left', 'center', 'right'].forEach(channel => {
    const input = document.getElementById('screen-audio-' + channel);
    if (!input) return;
    input.addEventListener('input', () => setLevel(channel, input.value));
  });
  const reset = document.getElementById('screen-audio-reset');
  if (reset) reset.addEventListener('click', () => {
    state.left = 1; state.center = 0.75; state.right = 1;
    ['left', 'center', 'right'].forEach(channel => {
      const input = document.getElementById('screen-audio-' + channel);
      if (input) input.value = String(Math.round(state[channel] * 100));
    });
    updateAll();
  });

  window.imaxScreenAudio = {
    setEnabled(enabled) { state.enabled = !!enabled; updateAll(); },
    setLevel,
    getState() { return { ...state, contextState: context ? context.state : 'unavailable' }; }
  };
})();

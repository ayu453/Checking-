// Automatic IMAX audio routing.
// Preserve stereo playback while folding discrete 5.1 centre/dialogue and surround
// channels into stereo when the browser exposes them to Web Audio.
(() => {
  const video = document.getElementById('imax-video');
  if (!video) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
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
    const splitter = ctx.createChannelSplitter(6);
    const merger = ctx.createChannelMerger(2);
    const master = ctx.createGain();
    const channelGains = Array.from({ length: 6 }, () => ctx.createGain());

    source.connect(splitter);

    // L/R: full level. Centre: dialogue is sent equally to both sides.
    // LFE: subtle low-frequency support. Surrounds retain their side image
    // with a small opposite-side bleed for ordinary stereo headphones/speakers.
    const routes = [
      [[0, 0, 1]],
      [[1, 0, 1]],
      [[2, 0, 0.707], [2, 0, 0]], // centre routes are wired below to both outputs
      [[3, 0, 0.30]],
      [[4, 0, 0.707], [4, 1, 0.16]],
      [[5, 1, 0.707], [5, 0, 0.16]]
    ];

    splitter.connect(channelGains[0], 0);
    channelGains[0].connect(merger, 0, 0);
    splitter.connect(channelGains[1], 1);
    channelGains[1].connect(merger, 0, 1);

    splitter.connect(channelGains[2], 2);
    channelGains[2].connect(merger, 0, 0);
    channelGains[2].connect(merger, 0, 1);

    splitter.connect(channelGains[3], 3);
    channelGains[3].connect(merger, 0, 0);
    channelGains[3].connect(merger, 0, 1);

    splitter.connect(channelGains[4], 4);
    channelGains[4].connect(merger, 0, 0);
    channelGains[4].connect(merger, 0, 1);

    splitter.connect(channelGains[5], 5);
    channelGains[5].connect(merger, 0, 1);
    channelGains[5].connect(merger, 0, 0);

    merger.connect(master);
    master.connect(ctx.destination);

    const graph = { source, splitter, merger, master, channelGains };
    graphs.set(media, graph);
    attached.add(media);
    applyAutomaticMix(graph);
  }

  function applyAutomaticMix(graph) {
    const now = context.currentTime;
    const levels = [0.92, 0.92, 0.82, 0.22, 0.58, 0.58];
    graph.channelGains.forEach((gain, index) => {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(levels[index], now, 0.06);
    });
    graph.master.gain.setTargetAtTime(1, now, 0.06);
  }

  function resume() {
    if (context && context.state === 'suspended') context.resume().catch(() => {});
  }

  function attachAvailableAudio() {
    try {
      connectMediaElement(video);
      const manager = window.imaxAudioTrackManager;
      if (manager && manager.audioElement) {
        connectMediaElement(manager.audioElement);
        manager.audioElement.addEventListener('playing', resume);
      }
    } catch (error) {
      // Never leave the media element permanently silent if Web Audio setup fails.
      console.warn('Automatic IMAX audio routing unavailable; using native playback:', error);
    }
  }

  attachAvailableAudio();
  document.addEventListener('pointerdown', resume, { passive: true });
  video.addEventListener('playing', resume);
  video.addEventListener('play', resume);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resume();
  });

  window.imaxScreenAudio = {
    getState() {
      return {
        mode: 'automatic',
        channels: 'stereo-fold-down-with-5.1-dialogue-preservation',
        contextState: context ? context.state : 'unavailable',
        connectedSources: attached.size
      };
    }
  };
})();

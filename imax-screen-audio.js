// IMAX automatic audio pass-through.
// Let the browser perform standards-based speaker downmixing so centre-channel
// dialogue is not lost when a 5.1 source is played on stereo headphones/speakers.
(() => {
  const video = document.getElementById('imax-video');
  if (!video) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let context = null;
  const graphs = new WeakMap();
  const attached = new Set();

  function ensureContext() {
    if (!AudioContextClass) return null;
    if (!context) context = new AudioContextClass({ latencyHint: 'playback' });
    return context;
  }

  function connectMediaElement(media) {
    if (!media || graphs.has(media)) return;
    const ctx = ensureContext();
    if (!ctx) return;

    try {
      const source = ctx.createMediaElementSource(media);
      const output = ctx.createGain();
      // Ask Web Audio to use speaker-aware channel conversion to stereo.
      // This preserves the centre dialogue channel instead of discarding it.
      output.channelCount = 2;
      output.channelCountMode = 'explicit';
      output.channelInterpretation = 'speakers';
      source.connect(output);
      output.connect(ctx.destination);
      graphs.set(media, { source, output });
      attached.add(media);
    } catch (error) {
      // If this element was already connected elsewhere, do not break native playback.
      console.warn('IMAX audio pass-through could not attach; retaining native audio:', error);
    }
  }

  function resume() {
    if (context && context.state === 'suspended') {
      context.resume().catch(error => console.warn('IMAX audio context resume failed:', error));
    }
  }

  connectMediaElement(video);

  // The extracted alternate-track audio element is created by the track manager.
  // Wait for it if it is not available at initial script execution.
  function connectTrackAudio() {
    const manager = window.imaxAudioTrackManager;
    if (manager && manager.audioElement) {
      connectMediaElement(manager.audioElement);
      manager.audioElement.addEventListener('playing', resume);
      return true;
    }
    return false;
  }
  if (!connectTrackAudio()) {
    let attempts = 0;
    const poll = () => {
      if (connectTrackAudio() || ++attempts > 30) return;
      setTimeout(poll, 100);
    };
    poll();
  }

  document.addEventListener('pointerdown', resume, { passive: true });
  video.addEventListener('playing', resume);
  video.addEventListener('play', resume);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resume();
  });

  window.imaxScreenAudio = {
    getState() {
      return {
        mode: 'automatic-speaker-aware-pass-through',
        downmix: 'browser-managed-dialogue-preserving',
        contextState: context ? context.state : 'unavailable',
        connectedSources: attached.size
      };
    }
  };
})();

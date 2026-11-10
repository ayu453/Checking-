// IMAX audio-track switching for locally uploaded MP4/MKV files.
// Uses FFmpeg WebAssembly to demux embedded audio streams and keeps the chosen
// stream synchronized with the existing HTML video element.
(() => {
  const video = document.getElementById('imax-video');
  const input = document.getElementById('video-file-input');
  const menu = document.getElementById('audio-track-menu');
  const list = document.getElementById('audio-track-list');
  const trigger = document.querySelector('[data-player-action="audio"]');
  const closeButton = document.getElementById('audio-track-close');
  const status = (message) => {
    const pill = document.getElementById('status-pill');
    if (pill) pill.textContent = message;
  };
  if (!video || !input || !menu || !list || !trigger) return;

  let selectedFile = null;
  let ffmpeg = null;
  let ffmpegPromise = null;
  let inputName = null;
  let tracks = [];
  let selectedStreamIndex = null;
  let audioUrl = null;
  let externalAudioActive = false;
  let muted = video.muted;
  const audio = document.createElement('audio');
  audio.preload = 'auto';
  audio.playsInline = true;

  const languageNames = {
    eng: 'English', en: 'English', hin: 'Hindi', hi: 'Hindi',
    jpn: 'Japanese', ja: 'Japanese', spa: 'Spanish', es: 'Spanish',
    fra: 'French', fre: 'French', fr: 'French', deu: 'German', ger: 'German',
    de: 'German', ita: 'Italian', it: 'Italian', por: 'Portuguese',
    pt: 'Portuguese', kor: 'Korean', ko: 'Korean', rus: 'Russian',
    ru: 'Russian', ara: 'Arabic', ar: 'Arabic', und: 'Unspecified'
  };
  const setMessage = (message) => {
    list.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'audio-track-message';
    p.textContent = message;
    list.appendChild(p);
  };
  const setMenuOpen = (open) => {
    menu.classList.toggle('hidden', !open);
    trigger.setAttribute('aria-expanded', String(open));
  };
  const revokeAudioUrl = () => {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = null;
  };
  const formatTrack = (track, position) => {
    const tags = track.tags || {};
    const rawLanguage = String(tags.language || '').toLowerCase();
    const language = languageNames[rawLanguage] || (rawLanguage && rawLanguage !== 'und' ? rawLanguage.toUpperCase() : 'Unknown language');
    const title = tags.title ? String(tags.title) : '';
    return title ? title + ' · ' + language : language + ' · Track ' + (position + 1);
  };
  const renderTracks = () => {
    list.innerHTML = '';
    const original = document.createElement('button');
    original.type = 'button';
    original.className = 'audio-track-option';
    original.textContent = 'Original / default audio' + (!externalAudioActive ? '  ✓' : '');
    original.setAttribute('aria-pressed', String(!externalAudioActive));
    original.disabled = !externalAudioActive;
    original.addEventListener('click', selectOriginalTrack);
    list.appendChild(original);
    tracks.forEach((track, position) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'audio-track-option';
      button.textContent = formatTrack(track, position) + (track.index === selectedStreamIndex ? '  ✓' : '');
      button.setAttribute('aria-pressed', String(track.index === selectedStreamIndex));
      button.disabled = track.index === selectedStreamIndex;
      button.addEventListener('click', () => selectTrack(track));
      list.appendChild(button);
    });
  };

  async function loadFFmpeg() {
    if (ffmpeg) return ffmpeg;
    if (ffmpegPromise) return ffmpegPromise;
    ffmpegPromise = (async () => {
      setMessage('Loading audio engine. The first load may take a little time…');
      status('AUDIO ENGINE · LOADING');
      const [{ FFmpeg }, { toBlobURL, fetchFile }] = await Promise.all([
        import('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js'),
        import('https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/dist/esm/index.js')
      ]);
      const engine = new FFmpeg();
      engine.on('log', ({ message }) => {
        if (/error/i.test(message)) console.warn('[IMAX audio]', message);
      });
      const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
      // GitHub Pages is a different origin from jsDelivr. FFmpeg's default
      // worker URL points back to the CDN and browsers block that cross-origin
      // Worker constructor. Serve the worker from a same-origin blob URL.
      const classWorkerURL = await toBlobURL(
        'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/worker.js',
        'text/javascript'
      );
      await engine.load({
        classWorkerURL,
        coreURL: await toBlobURL(base + '/ffmpeg-core.js', 'text/javascript'),
        wasmURL: await toBlobURL(base + '/ffmpeg-core.wasm', 'application/wasm')
      });
      engine.__fetchFile = fetchFile;
      ffmpeg = engine;
      return engine;
    })().catch((error) => {
      ffmpegPromise = null;
      throw error;
    });
    return ffmpegPromise;
  }

  async function inspectFile() {
    if (!selectedFile) {
      setMessage('Upload a local MP4 or MKV video first. Sample videos do not expose local audio streams.');
      status('AUDIO TRACKS · UPLOAD A VIDEO');
      return;
    }
    if (!/\.(mp4|m4v|mkv|mov|webm)$/i.test(selectedFile.name)) {
      setMessage('Embedded audio-track switching currently supports MP4, MKV, MOV and WebM uploads.');
      return;
    }
    try {
      const engine = await loadFFmpeg();
      setMessage('Reading embedded audio streams…');
      if (!inputName) {
        const ext = (selectedFile.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
        inputName = 'imax-source.' + ext;
        await engine.writeFile(inputName, await engine.__fetchFile(selectedFile));
      }
      const outputName = 'imax-streams.json';
      try { await engine.deleteFile(outputName); } catch (_) {}
      const code = await engine.ffprobe([
        '-v', 'error', '-show_entries',
        'stream=index,codec_type:stream_tags=language,title',
        '-of', 'json', inputName, '-o', outputName
      ]);
      if (code !== 0) throw new Error('Could not inspect the uploaded media streams.');
      const raw = await engine.readFile(outputName).catch(() => null);
      let probe;
      if (raw) probe = JSON.parse(new TextDecoder().decode(raw));
      else {
        // Some ffmpeg.wasm builds do not create the named ffprobe output file.
        throw new Error('The media probe did not return stream metadata.');
      }
      tracks = (probe.streams || []).filter((stream) => stream.codec_type === 'audio');
      if (!tracks.length) {
        setMessage('No embedded audio tracks were found in this video.');
        status('AUDIO TRACKS · NONE FOUND');
        return;
      }
      if (selectedStreamIndex !== null && !tracks.some((track) => track.index === selectedStreamIndex)) {
        selectedStreamIndex = null;
        externalAudioActive = false;
        video.muted = muted;
      }
      renderTracks();
      status('AUDIO TRACKS · ' + tracks.length + ' FOUND');
    } catch (error) {
      console.error('[IMAX audio tracks]', error);
      setMessage('Could not read audio tracks: ' + (error && error.message ? error.message : 'unknown error') + '. Try a supported MP4 or MKV file.');
      status('AUDIO TRACKS · ERROR');
    }
  }

  async function selectTrack(track) {
    if (!ffmpeg || !inputName) return;
    const wasPlaying = !video.paused;
    video.pause();
    list.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    setMessage('Preparing ' + formatTrack(track, tracks.indexOf(track)) + '…');
    status('AUDIO TRACK · EXTRACTING');
    try {
      const outputName = 'imax-selected-audio.m4a';
      try { await ffmpeg.deleteFile(outputName); } catch (_) {}
      const code = await ffmpeg.exec([
        '-i', inputName, '-map', '0:' + track.index,
        '-vn', '-sn', '-dn', '-c:a', 'aac', '-b:a', '192k',
        '-f', 'ipod', outputName
      ]);
      if (code !== 0) throw new Error('FFmpeg could not extract this audio stream.');
      const data = await ffmpeg.readFile(outputName);
      revokeAudioUrl();
      audioUrl = URL.createObjectURL(new Blob([data], { type: 'audio/mp4' }));
      audio.src = audioUrl;
      audio.volume = video.volume;
      audio.muted = muted;
      audio.playbackRate = video.playbackRate;
      audio.loop = video.loop;
      await new Promise((resolve, reject) => {
        audio.addEventListener('loadedmetadata', resolve, { once: true });
        audio.addEventListener('error', () => reject(new Error('The extracted audio could not be decoded.')), { once: true });
        audio.load();
      });
      audio.currentTime = Math.min(video.currentTime, Math.max(0, audio.duration - 0.05));
      selectedStreamIndex = track.index;
      externalAudioActive = true;
      video.muted = true;
      renderTracks();
      status('AUDIO · ' + formatTrack(track, tracks.indexOf(track)).toUpperCase());
      if (wasPlaying) {
        try { await video.play(); }
        catch (_) { status('AUDIO TRACK READY · TAP PLAY'); }
      }
    } catch (error) {
      console.error('[IMAX audio extract]', error);
      setMessage('Could not activate this track: ' + (error && error.message ? error.message : 'unknown error'));
      status('AUDIO TRACK · FAILED');
      if (wasPlaying) video.play().catch(() => {});
      renderTracks();
    }
  }

  function selectOriginalTrack() {
    revokeAudioUrl();
    externalAudioActive = false;
    selectedStreamIndex = null;
    video.muted = muted;
    status('AUDIO · ORIGINAL TRACK');
    setMenuOpen(false);
  }

  function syncAudio(force = false) {
    if (!externalAudioActive || !audio.src || !Number.isFinite(video.currentTime)) return;
    const drift = Math.abs(audio.currentTime - video.currentTime);
    if (force || drift > 0.28) {
      try { audio.currentTime = Math.min(video.currentTime, Math.max(0, audio.duration || video.currentTime)); } catch (_) {}
    }
    audio.playbackRate = video.playbackRate;
    audio.volume = video.volume;
    audio.muted = muted;
    audio.loop = video.loop;
  }

  video.addEventListener('playing', () => {
    if (externalAudioActive) {
      syncAudio(true);
      audio.play().catch(() => status('AUDIO TRACK · TAP PLAY TO START SOUND'));
    }
  });
  video.addEventListener('pause', () => { if (externalAudioActive) audio.pause(); });
  video.addEventListener('seeking', () => syncAudio(true));
  video.addEventListener('timeupdate', () => syncAudio(false));
  video.addEventListener('ratechange', () => { if (externalAudioActive) audio.playbackRate = video.playbackRate; });
  video.addEventListener('volumechange', () => {
    if (externalAudioActive) {
      audio.volume = video.volume;
      audio.muted = muted;
    }
  });
  video.addEventListener('ended', () => { if (externalAudioActive && !video.loop) audio.pause(); });
  input.addEventListener('change', (event) => {
    const previousInputName = inputName;
    selectedFile = event.target.files && event.target.files[0] || null;
    inputName = null;
    tracks = [];
    selectedStreamIndex = null;
    externalAudioActive = false;
    revokeAudioUrl();
    muted = video.muted;
    video.muted = false;
    if (ffmpeg && previousInputName) { try { ffmpeg.deleteFile(previousInputName); } catch (_) {} }
    setMessage(selectedFile ? 'Video loaded. Open Audio tracks to scan embedded streams.' : 'Upload a video to detect audio tracks.');
  });
  trigger.addEventListener('click', () => {
    setMenuOpen(menu.classList.contains('hidden'));
    if (!menu.classList.contains('hidden')) inspectFile();
  });
  if (closeButton) closeButton.addEventListener('click', () => setMenuOpen(false));
  document.addEventListener('pointerdown', (event) => {
    if (!menu.classList.contains('hidden') && !menu.contains(event.target) && !trigger.contains(event.target)) setMenuOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMenuOpen(false);
  });

  window.imaxAudioTrackManager = {
    openTrackPicker() {
      setMenuOpen(true);
      inspectFile();
    },
    setVolume(value) {
      video.volume = value;
      if (value > 0) muted = false;
      if (externalAudioActive) {
        audio.volume = value;
        audio.muted = muted;
        video.muted = true;
      } else video.muted = muted;
    },
    toggleMute() {
      muted = !muted;
      if (externalAudioActive) {
        audio.muted = muted;
        video.muted = true;
      } else video.muted = muted;
      return muted;
    },
    setPlaybackRate(value) {
      video.playbackRate = value;
      if (externalAudioActive) audio.playbackRate = value;
    },
    get muted() { return muted; },
    get externalAudioActive() { return externalAudioActive; }
  };
  window.addEventListener('beforeunload', revokeAudioUrl);
})();

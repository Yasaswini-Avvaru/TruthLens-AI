import { useEffect, useRef, useState } from 'react';
import { ArrowRight, FileSearch, ShieldCheck, Sparkles, ExternalLink, LoaderCircle, Mic, Pause, Play, Square, Volume2, Send } from 'lucide-react';
import './evidence.css';

const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE_URL || 'https://truthlens-ai-egl2.onrender.com');

async function readApiJson(response, operation) {
  const responseText = await response.text();
  try {
    return JSON.parse(responseText);
  } catch {
    const responseKind = responseText.trim() ? 'non-JSON content' : 'an empty response';
    throw new Error(`${operation} returned ${responseKind} (HTTP ${response.status}). Check the backend terminal for the cause, then try again.`);
  }
}

const features = [
  { icon: FileSearch, title: 'Evidence first', description: 'Claims are checked against sources so you can see what supports or challenges them.' },
  { icon: ShieldCheck, title: 'Honest uncertainty', description: 'Results make room for missing context and inconclusive evidence.' },
  { icon: Sparkles, title: 'Built for everyone', description: 'Clear explanations are the foundation for accessible verification.' },
];

export default function App() {
  const [claim, setClaim] = useState('');
  const [language, setLanguage] = useState('auto');
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState(readLocalHistory);
  const [languageIssue, setLanguageIssue] = useState(null);
  const [responseLanguages, setResponseLanguages] = useState([
    { tag: 'en', name: 'English' }, { tag: 'te', name: 'Telugu' }, { tag: 'hi', name: 'Hindi' }, { tag: 'ta', name: 'Tamil' }, { tag: 'kn', name: 'Kannada' },
  ]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [inputMode, setInputMode] = useState('text');
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState('');
  const [mediaErrorInfo, setMediaErrorInfo] = useState(null);
  const [voiceCapabilities, setVoiceCapabilities] = useState(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [conversationId, setConversationId] = useState('');
  const [question, setQuestion] = useState('');
  const [voiceTurns, setVoiceTurns] = useState([]);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState('');
  const [recording, setRecording] = useState(false);
  const [claimRecording, setClaimRecording] = useState(false);
  const [claimAudioBusy, setClaimAudioBusy] = useState(false);
  const [claimAudioError, setClaimAudioError] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioState, setAudioState] = useState('idle');
  const [schemeQuestion, setSchemeQuestion] = useState('');
  const [schemeResult, setSchemeResult] = useState(null);
  const [schemeError, setSchemeError] = useState('');
  const [schemeBusy, setSchemeBusy] = useState(false);
  const [schemeRecording, setSchemeRecording] = useState(false);
  const [schemeAudioUrl, setSchemeAudioUrl] = useState('');
  const schemeRecorderRef = useRef(null);
  const schemeStreamRef = useRef(null);
  const schemeTimerRef = useRef(null);
  const schemeAudioRef = useRef(null);
  const claimRecorderRef = useRef(null);
  const claimStreamRef = useRef(null);
  const claimTimerRef = useRef(null);
  const audioRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const recordingTimerRef = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/languages`).then((response) => response.json()).then((data) => {
      if (data.success && Array.isArray(data.responseLanguages) && data.responseLanguages.length) setResponseLanguages(data.responseLanguages);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/voice/capabilities`).then((response) => response.json()).then((data) => {
      if (data.success) setVoiceCapabilities(data);
    }).catch(() => setVoiceCapabilities({ configured: false, speechToText: false, textToSpeech: false, outputLanguages: [] }));
  }, []);

  useEffect(() => () => {
    if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
    if (claimTimerRef.current) clearTimeout(claimTimerRef.current);
    claimStreamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current?.getTracks().forEach((track) => track.stop());
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  useEffect(() => () => { if (schemeAudioUrl) URL.revokeObjectURL(schemeAudioUrl); }, [schemeAudioUrl]);
  useEffect(() => {
    if (schemeAudioUrl) schemeAudioRef.current?.play().catch(() => {});
  }, [schemeAudioUrl]);
  useEffect(() => () => {
    if (schemeTimerRef.current) clearTimeout(schemeTimerRef.current);
    schemeStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);
  useEffect(() => {
    if (!mediaFile || !mediaFile.type.startsWith('image/')) { setMediaPreview(''); return undefined; }
    const url = URL.createObjectURL(mediaFile);
    setMediaPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [mediaFile]);

  useEffect(() => {
    if (audioUrl) audioRef.current?.play().then(() => setAudioState('playing')).catch(() => setAudioState('paused'));
  }, [audioUrl]);

  function stopPlayback() {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    window.speechSynthesis?.cancel();
    setAudioState('paused');
  }

  function rememberVerification(verification) {
    if (!verification) return;
    setHistory((previous) => {
      const verificationKey = verification.id || verification.createdAt;
      const next = [verification, ...previous.filter((item) => (item.id || item.createdAt) !== verificationKey)].slice(0, 20);
      try { localStorage.setItem('truthlens-verification-history-v1', JSON.stringify(next)); } catch { /* Browser storage may be unavailable. */ }
      return next;
    });
  }

  async function playAudioEndpoint(path, body) {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl('');
    const response = await fetch(`${API_BASE}${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { method: 'POST' });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Spoken audio is unavailable. The written response remains available.');
    }
    const nextUrl = URL.createObjectURL(await response.blob());
    setAudioUrl(nextUrl);
    setAudioState('idle');
  }

  async function enterVoiceMode(report = result) {
    stopPlayback();
    setVoiceNotice('');
    if (!report?.id) {
      setVoiceMode(true);
      setVoiceNotice('This report was not saved, so a persistent voice conversation cannot start. You can still use the written report.');
      return;
    }
    const voiceLanguage = report.responseLanguage?.mode === 'manual' ? report.responseLanguage.tag : 'auto';
    setVoiceBusy(true);
    try {
      const response = await fetch(`${API_BASE}/api/voice/verification/${report.id}/conversations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ responseLanguage: voiceLanguage }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Voice mode could not be started.');
      setConversationId(data.conversation.id);
      setVoiceMode(true);
      if (data.speechAvailable) await playAudioEndpoint(`/api/voice/verification/${report.id}/speech`, { responseLanguage: voiceLanguage });
      else setVoiceNotice(data.speechUnavailableReason || 'Speech is unavailable for this language. The report is available as text.');
    } catch (voiceError) { setVoiceMode(true); setVoiceNotice(voiceError.message); }
    finally { setVoiceBusy(false); }
  }

  async function submitSpokenClaim(audio) {
    setClaimAudioBusy(true);
    setClaimAudioError('');
    setVoiceTranscript(null);
    setError('');
    setResult(null);
    setVoiceMode(false);
    try {
      const response = await fetch(`${API_BASE}/api/verification/transcribe-audio`, { method: 'POST', headers: { 'Content-Type': audio.type || 'audio/webm' }, body: audio });
      const data = await readApiJson(response, 'Speech transcription');
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Spoken claim could not be checked.');
      }
      setClaim(data.transcript);
      setInputMode('text');
      setVoiceTranscript({ text: data.transcript, detection: data.detectedLanguage });
      document.getElementById('verify')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (requestError) { setClaimAudioError(requestError.message || 'Speech verification is unavailable.'); }
    finally { setClaimAudioBusy(false); }
  }

  async function toggleClaimRecording() {
    if (claimRecording && claimRecorderRef.current) { claimRecorderRef.current.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setClaimAudioError('Microphone recording is not supported in this browser.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      claimStreamRef.current = stream;
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
      const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        clearTimeout(claimTimerRef.current);
        stream.getTracks().forEach((track) => track.stop());
        claimStreamRef.current = null;
        claimRecorderRef.current = null;
        setClaimRecording(false);
        const audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (audio.size > (voiceCapabilities?.maxAudioBytes || 10 * 1024 * 1024)) setClaimAudioError('Recording is too large. Please record a shorter claim.');
        else if (audio.size) submitSpokenClaim(audio);
      };
      claimRecorderRef.current = recorder;
      recorder.start();
      setClaimRecording(true);
      setClaimAudioError('');
      claimTimerRef.current = setTimeout(() => recorder.state === 'recording' && recorder.stop(), (voiceCapabilities?.maxRecordingSeconds || 30) * 1000);
    } catch (recordError) {
      claimStreamRef.current?.getTracks().forEach((track) => track.stop());
      setClaimAudioError(recordError.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow microphone access and try again.' : 'Microphone could not be started.');
    }
  }

  async function sendVoiceTurn({ text, audio }) {
    if (!conversationId) { setVoiceNotice('A saved report is required to keep this conversation linked to its evidence.'); return; }
    setVoiceBusy(true);
    setVoiceNotice('');
    stopPlayback();
    try {
      const endpoint = audio
        ? `${API_BASE}/api/voice/conversations/${conversationId}/audio-turns`
        : `${API_BASE}/api/voice/conversations/${conversationId}/turns`;
      const response = await fetch(endpoint, audio
        ? { method: 'POST', headers: { 'Content-Type': audio.type || 'audio/webm' }, body: audio }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'The follow-up could not be processed.');
      setVoiceTurns((turns) => [...turns, { role: 'user', text: data.turn.userText }, { role: 'assistant', text: data.turn.assistantText }]);
      setQuestion('');
      if (data.speechAvailable && data.turn.assistantTurnId) {
        await playAudioEndpoint(`/api/voice/conversations/${conversationId}/turns/${data.turn.assistantTurnId}/speech`);
      } else setVoiceNotice('Your answer is shown as text. Spoken output is not configured for this language.');
    } catch (voiceError) { setVoiceNotice(voiceError.message); }
    finally { setVoiceBusy(false); }
  }

  async function toggleRecording() {
    if (recording && recorderRef.current) { recorderRef.current.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setVoiceNotice('Audio recording is not supported in this browser. Use the question box instead.');
      return;
    }
    try {
      stopPlayback();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
      const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        clearTimeout(recordingTimerRef.current);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        const audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (audio.size > (voiceCapabilities?.maxAudioBytes || 10 * 1024 * 1024)) setVoiceNotice('Recording is too large. Please record a shorter question.');
        else if (audio.size) sendVoiceTurn({ audio });
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      recordingTimerRef.current = setTimeout(() => recorder.state === 'recording' && recorder.stop(), (voiceCapabilities?.maxRecordingSeconds || 30) * 1000);
    } catch (recordError) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setVoiceNotice(recordError.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow microphone access or type your question.' : 'Microphone could not be started. You can type your question instead.');
    }
  }

  async function endVoiceMode() {
    stopPlayback();
    if (recording && recorderRef.current?.state === 'recording') recorderRef.current.stop();
    if (conversationId) await fetch(`${API_BASE}/api/voice/conversations/${conversationId}`, { method: 'DELETE' }).catch(() => {});
    setVoiceMode(false);
    setConversationId('');
    setVoiceTurns([]);
  }

  async function askScheme({ question: askedQuestion, audio }) {
    setSchemeBusy(true);
    setSchemeError('');
    setSchemeResult(null);
    if (schemeAudioUrl) URL.revokeObjectURL(schemeAudioUrl);
    setSchemeAudioUrl('');
    try {
      const response = await fetch(`${API_BASE}/api/schemes/${audio ? 'ask-audio' : 'ask'}${audio ? `?responseLanguage=${encodeURIComponent(language)}` : ''}`, audio
        ? { method: 'POST', headers: { 'Content-Type': audio.type || 'audio/webm' }, body: audio }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: askedQuestion, responseLanguage: language }) });
      const data = await readApiJson(response, 'Scheme assistant');
      if (!response.ok || !data.success) throw new Error(data.error || 'The scheme assistant could not answer this question.');
      setSchemeResult({ ...data.result, speechAvailable: data.speechAvailable });
      if (data.transcript) setSchemeQuestion(data.transcript);
      if (data.speechAvailable && data.result.id) {
        const speechResponse = await fetch(`${API_BASE}/api/schemes/${data.result.id}/speech`, { method: 'POST' });
        if (!speechResponse.ok) {
          const speechError = await speechResponse.json().catch(() => ({}));
          throw new Error(speechError.error || 'The written answer is ready; speech playback is unavailable.');
        }
        const nextUrl = URL.createObjectURL(await speechResponse.blob());
        setSchemeAudioUrl(nextUrl);
      }
    } catch (requestError) { setSchemeError(requestError.message || 'Scheme assistant is unavailable.'); }
    finally { setSchemeBusy(false); }
  }

  async function toggleSchemeRecording() {
    if (schemeRecording && schemeRecorderRef.current) { schemeRecorderRef.current.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setSchemeError('Microphone recording is not supported in this browser. Type your question instead.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      schemeStreamRef.current = stream;
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
      const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        clearTimeout(schemeTimerRef.current);
        stream.getTracks().forEach((track) => track.stop());
        schemeStreamRef.current = null;
        schemeRecorderRef.current = null;
        setSchemeRecording(false);
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size) askScheme({ audio: blob });
      };
      schemeRecorderRef.current = recorder;
      recorder.start();
      setSchemeRecording(true);
      schemeTimerRef.current = setTimeout(() => recorder.state === 'recording' && recorder.stop(), (voiceCapabilities?.maxRecordingSeconds || 30) * 1000);
    } catch (recordError) {
      schemeStreamRef.current?.getTracks().forEach((track) => track.stop());
      setSchemeError(recordError.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow access or type your question.' : 'Microphone could not be started. Type your question instead.');
    }
  }

  async function submitClaim(event) {
    event.preventDefault();
    if (inputMode !== 'text' && !mediaFile) { setError('Choose a file to verify.'); return; }
    const speechLanguageDetection = inputMode === 'text' ? voiceTranscript?.detection : null;
    setError('');
    setMediaErrorInfo(null);
    setResult(null);
    setVoiceTranscript(null);
    setLanguageIssue(null);
    setLoading(true);
    try {
      const response = inputMode === 'text'
        ? await fetch(`${API_BASE}/api/verification/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: claim, responseLanguage: language, ...(speechLanguageDetection ? { speechLanguageDetection } : {}) }) })
        : await fetch(`${API_BASE}/api/verification/${inputMode}`, (() => { const form = new FormData(); form.append('file', mediaFile); form.append('responseLanguage', language); return { method: 'POST', body: form }; })());
      const data = await readApiJson(response, 'Verification');
      if (!response.ok || !data.success) {
        if (data.languageDetection) setLanguageIssue({ originalText: data.originalText || claim, detection: data.languageDetection });
        if (data.extraction) setMediaErrorInfo({ ...data, inputType: inputMode, originalFilename: mediaFile?.name });
        throw new Error(data.error || 'Verification failed. Please try again.');
      }
      setResult(data.result);
      rememberVerification(data.result);
    } catch (requestError) {
      setError(requestError.message || 'The verification service could not be reached.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <nav className="nav wrap" aria-label="Main navigation">
        <a className="brand" href="#home" aria-label="TruthLens AI home"><span className="brand-mark">T</span><span>TRUTHLENS <b>AI</b></span></a>
        <div className="nav-links"><a href="#verify">Verify</a><a href="#voice-assistant">Voice Assistant</a><a href="#scam-detection">Scam alerts</a><a href="#scheme-assistant">Government schemes</a><a href="#history">History</a><a href="#about">About</a></div>
        <a className="nav-cta" href="#verify">Start verifying <ArrowRight size={16} /></a>
      </nav>

      <section className="hero wrap" id="home">
        <div className="hero-copy">
          <span className="eyebrow"><span className="pulse" /> EVIDENCE-LED VERIFICATION</span>
          <h1>The truth deserves<br />to be <span>verified.</span></h1>
          <p className="hero-description">A clearer way to check online claims. Explore evidence, understand uncertainty, and make up your own mind.</p>
          <div className="hero-actions"><a className="button primary" href="#verify">Start fact checking <ArrowRight size={17} /></a><a className="button secondary" href="#features">Explore features</a></div>
          <p className="trust-note"><ShieldCheck size={15} /> Evidence over assumptions. Uncertainty made visible.</p>
        </div>
        <div className="visual-card" aria-label="Verification report preview">
          <div className="card-top"><span className="window-dots"><i /><i /><i /></span><span>VERIFICATION PREVIEW</span><span className="live-dot" /></div>
          <div className="scan-graphic"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="scan-core"><ShieldCheck size={35}/></div><span className="scan-line"/></div>
          <div className="preview-claim"><span className="muted-label">SUBMITTED CLAIM</span><p>“A claim worth checking starts with evidence.”</p></div>
          <div className="preview-status"><span className="status-icon"><FileSearch size={16}/></span><div><b>Evidence review</b><small>Sources and context appear here</small></div><span className="status-pill">READY</span></div>
          <div className="card-glow" />
        </div>
      </section>

      <section className="feature-section wrap" id="features">
        <div className="section-heading"><span className="eyebrow">A BETTER WAY TO CHECK</span><h2>Clarity starts with <span>good evidence.</span></h2><p>TRUTHLENS AI is designed to make verification understandable, transparent, and useful.</p></div>
        <div className="feature-grid">{features.map(({ icon: Icon, title, description }, index) => <article className="feature-card" key={title}><span className="feature-icon"><Icon size={19}/></span><span className="feature-index">0{index + 1}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
      </section>

      <section className="workflow wrap" id="how-it-works"><div><span className="eyebrow">HOW IT WORKS</span><h2>From claim to<br/><span>context.</span></h2></div><p>Submit a claim, review relevant evidence, and get a clear report that explains what is known—and what still needs checking.</p><div className="workflow-steps"><span><b>01</b> Submit a claim</span><span><b>02</b> Review evidence</span><span><b>03</b> Understand the result</span></div></section>

      <section className="voice-home wrap" id="voice-assistant"><span className="eyebrow">VOICE ASSISTANT</span><h2>Speak to check. <span>Listen to understand.</span></h2><p>Speak a factual claim. Review its transcript and detected language before sending it through verification.</p><div className="voice-only-controls"><button className={`voice-claim-mic${claimRecording ? ' is-recording' : ''}`} type="button" onClick={toggleClaimRecording} disabled={claimAudioBusy || !voiceCapabilities?.speechToText} aria-label={claimRecording ? 'Stop recording and transcribe' : 'Speak a claim to verify'}>{claimAudioBusy ? <LoaderCircle className="spin" size={30}/> : claimRecording ? <Square size={30}/> : <Mic size={32}/>}</button><div><b>{claimRecording ? 'Listening… tap to transcribe' : claimAudioBusy ? 'Transcribing speech…' : 'Tap the microphone and speak'}</b><small>Recording limit: {voiceCapabilities?.maxRecordingSeconds || 30} seconds</small></div><label htmlFor="voice-response-language">Response language</label><select id="voice-response-language" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="auto">Automatic (detected)</option>{responseLanguages.map(({ tag, name }) => <option key={tag} value={tag}>{name}</option>)}</select></div>{claimAudioError && <p className="voice-notice" role="status">{claimAudioError}</p>}<a className="voice-text-fallback" href="#verify">Type a claim instead</a></section>

      <section className="voice-home wrap scam-home" id="scam-detection"><span className="eyebrow">SCAM WARNING SIGNS</span><h2>Check suspicious <span>messages and links.</span></h2><p>Text, screenshots, and supported videos receive a cautious warning-sign screen. Indicators are not proof of fraud; review the cited evidence and official links.</p><a className="button secondary" href="#verify">Analyze a message or media <ArrowRight size={16}/></a></section>

      <section className="verify-section wrap" id="verify">
        <div className="verify-box">
          <span className="eyebrow">CLAIM VERIFICATION</span>
          <h2>Pause the scroll.<br/><span>Check the claim.</span></h2>
          <p>Paste a factual claim. We’ll search for sources and explain what the available evidence supports, challenges, or leaves uncertain.</p>
          <div className="input-mode-tabs" role="tablist" aria-label="Choose verification input"><button type="button" role="tab" aria-selected={inputMode === 'text'} onClick={() => { setInputMode('text'); setMediaFile(null); setError(''); }}>Text</button><button type="button" role="tab" aria-selected={inputMode === 'image'} onClick={() => { setInputMode('image'); setMediaFile(null); setError(''); }}>Image / screenshot</button><button type="button" role="tab" aria-selected={inputMode === 'video'} onClick={() => { setInputMode('video'); setMediaFile(null); setError(''); }}>Video</button></div>
          <form className="claim-form" onSubmit={submitClaim}>
            {inputMode === 'text' ? <><label htmlFor="claim-input">Claim or message to verify</label><textarea id="claim-input" value={claim} onChange={(event) => setClaim(event.target.value)} maxLength={10000} required placeholder="Paste text in any language supported by the configured models…" /></> : <><label htmlFor="media-input">Choose {inputMode === 'image' ? 'an image or screenshot' : 'a video'}</label><input className="media-file-input" id="media-input" type="file" accept={inputMode === 'image' ? '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp' : '.mp4,.webm,video/mp4,video/webm'} onChange={(event) => setMediaFile(event.target.files?.[0] || null)} required/><small className="media-limit">{inputMode === 'image' ? 'JPG, PNG, WEBP · max 10 MB' : 'MP4, WEBM · max 100 MB, 2 minutes'}</small>{mediaPreview && <img className="selected-image-preview" src={mediaPreview} alt="Selected screenshot preview"/>}</>}
            <div className="form-controls"><span className="char-count">{inputMode === 'text' ? `${claim.length}/10,000` : mediaFile?.name || 'Media is processed temporarily'}</span><label className="language-label" htmlFor="language">Response language</label><select id="language" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="auto">Automatic (detected)</option>{responseLanguages.map(({ tag, name }) => <option key={tag} value={tag}>{name}</option>)}</select><button className="button primary" type="submit" disabled={loading || (inputMode === 'text' ? !claim.trim() : !mediaFile)}>{loading ? <><LoaderCircle className="spin" size={16}/> {inputMode === 'text' ? 'Checking claims' : 'Extracting and checking'}</> : <>Verify {inputMode === 'text' ? 'claim' : inputMode} <ArrowRight size={17}/></>}</button></div>
          </form>
          {voiceTranscript && <div className="notice language-notice transcript-preview" role="status"><b>Speech transcript — review before verification</b><p>Detected language: <b>{voiceTranscript.detection?.dominantLanguage?.name || 'not detected confidently'}</b>{voiceTranscript.detection?.dominantLanguage?.tag ? ` (${voiceTranscript.detection.dominantLanguage.tag})` : ''}{Number.isFinite(voiceTranscript.detection?.detectedLanguages?.[0]?.confidence) ? ` · detection confidence ${Math.round(voiceTranscript.detection.detectedLanguages[0].confidence * 100)}%` : ''}</p><blockquote>{voiceTranscript.text}</blockquote><p>The transcript is in the text box above. Edit it if needed, then select <b>Verify claim</b>.</p><button className="button secondary" type="button" onClick={() => setVoiceTranscript(null)}>Dismiss transcript preview</button></div>}
          {error && <div className="notice error-notice" role="alert">{error}</div>}
          {mediaErrorInfo && <MediaExtraction result={mediaErrorInfo} previewUrl={mediaPreview}/>}
          {languageIssue && <div className="notice language-notice" role="status"><b>Detected language: {languageIssue.detection.dominantLanguage?.name || 'uncertain'}</b><p>Your original text has been retained. Verification stopped because the configured models do not support this language confidently.</p><pre>{languageIssue.originalText}</pre></div>}
          {result && <article className="result-card" aria-live="polite">
            <div className="language-summary"><span>Detected input language(s): <b>{result.languageDetection.detectedLanguages.map((item) => item.name).join(', ')}</b></span><span>Dominant: <b>{result.languageDetection.dominantLanguage.name}</b></span><span>Report language: <b>{result.responseLanguage.name}</b>{result.responseLanguage.mode === 'manual' ? ' (selected)' : ' (automatic)'}</span></div>
            {result.inputType && result.inputType !== 'text' && <MediaExtraction result={result} previewUrl={mediaPreview}/>}
            <details className="original-text"><summary>{result.inputType && result.inputType !== 'text' ? 'Complete extracted original text' : 'Original submitted text'}</summary><p>{result.originalText}</p></details>
            <div className="result-heading"><div><span className="muted-label">VERDICT</span><h3>{result.verdict}</h3></div><div className="confidence"><span className="muted-label">EVIDENCE COVERAGE</span><b>{result.confidence}%</b></div></div>
            <div className="confidence-track"><span style={{ width: `${result.confidence}%` }}/></div>
            {!result.claimResults?.length && <><p className="result-summary">{result.summary}</p><p className="result-explanation">{result.detailedExplanation}</p></>}
            {result.claimResults?.length > 0 ? <section className="claim-comparison" aria-label="Claim-by-claim evidence comparison"><h4>Claim-by-claim evidence</h4>{result.claimResults.map((item, index) => <article className="claim-evidence-card" key={`${item.claimText}-${index}`}><div className="claim-evidence-heading"><span>Claim {index + 1}</span><b>{item.verdict}</b></div><blockquote>{item.claimText}</blockquote>{item.origins?.length > 0 && <p className="claim-origin">Found in: {item.origins.map((origin) => `${origin.type.replaceAll('_', ' ')}${Number.isFinite(origin.timestamp) ? ` at ${formatTimestamp(origin.timestamp)}` : ''}`).join(', ')}</p>}<p>{item.summary}</p><p className="claim-detail">{item.detailedExplanation}</p><div className="claim-evidence-columns"><EvidenceList title="Supporting evidence" items={item.supportingEvidence}/><EvidenceList title="Contradicting evidence" items={item.contradictingEvidence}/></div><EvidenceList title="Other retrieved sources" items={item.sources.filter((source) => ![...item.supportingEvidence, ...item.contradictingEvidence].some((cited) => cited.url === source.url))}/><p className="claim-coverage">Evidence coverage: {item.confidence}% <span>(coverage indicator, not probability)</span></p>{item.limitations?.length > 0 && <ul className="claim-limitations">{item.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>}</article>)}</section> : <><EvidenceList title="Evidence supporting the claim" items={result.supportingEvidence}/><EvidenceList title="Evidence challenging the claim" items={result.contradictingEvidence}/><EvidenceList title="Other retrieved sources" items={result.sources.filter((source) => ![...result.supportingEvidence, ...result.contradictingEvidence].some((cited) => cited.url === source.url))}/></>}
            <div className="result-foot"><b>{result.saved ? 'Saved to history' : 'Temporary report'}</b><span>Checked {new Date(result.createdAt).toLocaleString()}</span></div>
            {result.limitations?.length > 0 && <div className="limitations"><b>Limitations</b><ul>{result.limitations.map((item) => <li key={item}>{item}</li>)}</ul></div>}
            {result.scamAnalysis && <ScamIndicators analysis={result.scamAnalysis}/>}
            <section className="voice-panel" aria-label="Voice assistant">
              <div className="voice-panel-heading"><div><span className="feature-icon"><Volume2 size={19}/></span><div><b>Listen and ask</b><small>Hear this report and ask follow-up questions.</small></div></div>
                {!voiceMode ? <button className="button primary voice-main-button" type="button" onClick={enterVoiceMode} disabled={voiceBusy || !voiceCapabilities}>{voiceBusy ? <LoaderCircle className="spin" size={18}/> : <Volume2 size={19}/>} Voice mode</button> : <button className="button secondary" type="button" onClick={endVoiceMode}>End voice mode</button>}
              </div>
              {voiceMode && <>
                {audioUrl && <div className="voice-playback" aria-label="Spoken response controls"><audio ref={audioRef} src={audioUrl} onPlay={() => setAudioState('playing')} onPause={() => setAudioState('paused')} onEnded={() => setAudioState('ended')} /><button type="button" onClick={() => audioState === 'playing' ? audioRef.current?.pause() : audioRef.current?.play()} aria-label={audioState === 'playing' ? 'Pause audio' : 'Resume audio'}>{audioState === 'playing' ? <Pause size={20}/> : <Play size={20}/>}</button><button type="button" onClick={() => { if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play(); } }} aria-label="Replay audio"><Volume2 size={20}/> Replay</button><button type="button" onClick={stopPlayback} aria-label="Stop audio"><Square size={17}/></button><span>{audioState === 'playing' ? 'Speaking' : 'Audio ready'}</span></div>}
                {voiceNotice && <p className="voice-notice" role="status">{voiceNotice}</p>}
                {voiceTurns.length > 0 && <div className="voice-transcript" aria-live="polite">{voiceTurns.map((turn, index) => <p key={`${index}-${turn.role}`}><b>{turn.role === 'user' ? 'You' : 'TruthLens'}:</b> {turn.text}</p>)}</div>}
                {conversationId && <div className="voice-input-row"><button className={`mic-button${recording ? ' is-recording' : ''}`} type="button" onClick={toggleRecording} disabled={voiceBusy || !voiceCapabilities?.speechToText} aria-label={recording ? 'Stop and send recording' : 'Ask a question by voice'} title={!voiceCapabilities?.speechToText ? 'Speech recognition is not configured' : ''}>{voiceBusy ? <LoaderCircle className="spin" size={25}/> : recording ? <Square size={24}/> : <Mic size={25}/>}</button><form onSubmit={(event) => { event.preventDefault(); if (question.trim()) sendVoiceTurn({ text: question.trim() }); }}><input aria-label="Ask a follow-up question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={5000} placeholder={recording ? 'Recording… press the microphone to send' : 'Ask about this result…'} disabled={recording || voiceBusy}/><button type="submit" aria-label="Send question" disabled={!question.trim() || voiceBusy}><Send size={18}/></button></form><span className="voice-limit">Up to {voiceCapabilities?.maxRecordingSeconds || 30}s</span></div>}
                <p className="voice-hint">{voiceCapabilities?.configured ? 'Speech uses the configured provider. Your microphone recording is sent for transcription and is not saved as an audio file.' : 'Speech provider is not configured. You can still ask a written follow-up.'}</p>
              </>}
            </section>
          </article>}
        </div>
      </section>

      <section className="scheme-section wrap" id="scheme-assistant"><div className="scheme-box"><span className="eyebrow">GOVERNMENT SCHEME ASSISTANT</span><h2>Check official <span>scheme information.</span></h2><p>Ask about eligibility, benefits, documents, application steps, deadlines, or a suspicious link. Answers use search results from Indian government and NIC domains.</p>
        <form className="scheme-form" onSubmit={(event) => { event.preventDefault(); if (schemeQuestion.trim()) askScheme({ question: schemeQuestion.trim() }); }}><label htmlFor="scheme-question">Your question</label><textarea id="scheme-question" value={schemeQuestion} onChange={(event) => setSchemeQuestion(event.target.value)} maxLength={5000} placeholder="For example: Is this scheme announcement genuine?"/><div className="scheme-controls"><button className={`scheme-mic${schemeRecording ? ' is-recording' : ''}`} type="button" onClick={toggleSchemeRecording} disabled={schemeBusy || !voiceCapabilities?.speechToText} aria-label={schemeRecording ? 'Stop and send question' : 'Ask the scheme assistant by voice'}>{schemeBusy ? <LoaderCircle className="spin" size={24}/> : schemeRecording ? <Square size={23}/> : <Mic size={24}/>}</button><span className="scheme-mic-caption">{schemeRecording ? 'Recording · tap to send' : 'Ask by voice'}</span><button className="button primary" type="submit" disabled={schemeBusy || !schemeQuestion.trim()}>{schemeBusy ? <LoaderCircle className="spin" size={16}/> : <Send size={16}/>} Ask official sources</button></div></form>
        {schemeError && <div className="notice error-notice" role="alert">{schemeError}</div>}
        {schemeResult && <article className="scheme-result" aria-live="polite"><h3>{schemeResult.schemeName || 'Official source review'}</h3><p className="scheme-answer">{schemeResult.answer}</p>{schemeResult.eligibility && <InfoSection title="Eligibility" value={schemeResult.eligibility} />}{schemeResult.benefits && <InfoSection title="Benefits" value={schemeResult.benefits} />}{schemeResult.requiredDocuments && <InfoSection title="Required documents" value={schemeResult.requiredDocuments} />}{schemeResult.applicationSteps && <InfoSection title="Application steps" value={schemeResult.applicationSteps} />}{schemeResult.deadlines && <InfoSection title="Deadlines" value={schemeResult.deadlines} />}{schemeResult.officialApplicationUrl && <p className="official-application-link"><b>Official application page:</b> <a href={schemeResult.officialApplicationUrl} target="_blank" rel="noreferrer">{schemeResult.officialApplicationUrl} <ExternalLink size={13}/></a></p>}{schemeResult.riskNotes && <p className="scheme-risk-note">{schemeResult.riskNotes}</p>}<EvidenceList title="Official sources used" items={schemeResult.sources || []}/>{schemeResult.limitations?.map((item) => <p className="scheme-limitation" key={item}>{item}</p>)}{schemeAudioUrl && <div className="scheme-audio"><audio ref={schemeAudioRef} src={schemeAudioUrl} controls aria-label="Spoken government scheme answer"/><button type="button" onClick={() => { if (schemeAudioRef.current) { schemeAudioRef.current.currentTime = 0; schemeAudioRef.current.play(); } }} aria-label="Replay scheme answer"><Volume2 size={18}/> Replay</button></div>}{schemeResult.speechAvailable === false && <p className="scheme-limitation">Spoken output is not configured for this language or the answer is not saved; the written answer remains available.</p>}</article>}
      </div></section>
      <section className="history-section wrap" id="history"><div className="history-box"><span className="eyebrow">RECENT CHECKS</span><h2>Your verification <span>history.</span></h2><p>Saved on this browser only. Uploaded media files are not kept here; history contains report text and evidence links.</p>{history.length ? <ul className="history-list">{history.map((item) => <li key={item.id || item.createdAt}><button type="button" onClick={() => { setResult(item); setInputMode('text'); document.getElementById('verify')?.scrollIntoView({ behavior: 'smooth' }); }}><span className={`history-verdict verdict-${(item.verdict || 'inconclusive').toLowerCase()}`}>{item.verdict}</span><span>{item.claim}</span><small>{new Date(item.createdAt).toLocaleString()}</small></button></li>)}</ul> : <p>No saved checks on this browser yet. Verified reports will appear here.</p>}</div></section>
      <footer className="footer wrap" id="about"><a className="brand" href="#home"><span className="brand-mark">T</span><span>TRUTHLENS <b>AI</b></span></a><p>Don't just believe. Verify with AI.</p><span>Built around evidence and honest uncertainty.</span></footer>
    </main>
  );
}

function MediaExtraction({ result, previewUrl }) {
  const extraction = result.extraction || {};
  const frames = extraction.frameOcr?.frames || [];
  return <section className="media-extraction" aria-label="Extracted media text">
    {previewUrl && result.inputType === 'image' && <img className="selected-image-preview" src={previewUrl} alt="Uploaded image being analyzed"/>}
    <h4>{result.inputType === 'video' ? 'Video extraction' : 'Image text extraction'}</h4>
    {result.inputType === 'image' ? <><p>Text extraction: <b>{extraction.ocr?.status || 'unknown'}</b></p><pre>{extraction.ocr?.originalText || 'No text extracted.'}</pre></> : <>
      <p>Speech transcription: <b>{extraction.transcription?.status || 'unavailable'}</b></p>{extraction.transcription?.error && <p>{extraction.transcription.error}</p>}{extraction.transcription?.originalText && <pre>{extraction.transcription.originalText}</pre>}
      <p>On-screen text: <b>{extraction.frameOcr?.status || 'unavailable'}</b></p>{frames.map((frame, index) => <div className="video-frame-text" key={`${frame.timestamp}-${index}`}><b>Frame at {formatTimestamp(frame.timestamp)}</b><pre>{frame.originalText || 'No readable text found in this frame.'}</pre></div>)}
    </>}
    {extraction.forensics && <p className="capability-unavailable">Manipulation analysis: unavailable. {extraction.forensics.reason}</p>}
    <p className="media-file-name">File: {result.originalFilename || 'Uploaded media'}{result.mediaMetadata?.durationSeconds ? ` · ${result.mediaMetadata.durationSeconds} seconds` : ''}</p>
  </section>;
}

function ScamIndicators({ analysis }) {
  const titles = { high: 'Strong warning signs', medium: 'Some warning signs', low: 'Limited warning signs', inconclusive: 'Scam screening inconclusive', no_clear_indicators: 'No clear warning signs found' };
  return <section className="scam-panel" aria-label="Scam warning signs">
    <h4>Scam warning signs</h4>
    {analysis.status !== 'complete' ? <p>Screening unavailable: {analysis.reason || 'No result was returned.'}</p> : <>
      <b className={`risk-level risk-${analysis.riskLevel}`}>{titles[analysis.riskLevel] || 'Screening inconclusive'}</b>
      {analysis.riskLevel === 'no_clear_indicators' && <p>No clear warning signs were found in this submission. This does not prove that the message or link is safe or genuine.</p>}
      {analysis.indicators?.length > 0 && <ul>{analysis.indicators.map((indicator, index) => <li key={`${indicator.category}-${index}`}><b>{indicator.category.replaceAll('_', ' ')}</b><p>{indicator.description}</p><blockquote>{indicator.evidenceText}</blockquote>{indicator.sources?.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} <ExternalLink size={12}/></a>)}</li>)}</ul>}
      {analysis.recommendedPrecautions?.length > 0 && <><b className="precautions-title">Safer next steps</b><ul>{analysis.recommendedPrecautions.map((item) => <li key={item}>{item}</li>)}</ul></>}
      {analysis.limitation && <small>{analysis.limitation}</small>}
    </>}
  </section>;
}

function formatTimestamp(seconds) {
  if (!Number.isFinite(seconds)) return 'time unavailable';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

function InfoSection({ title, value }) { return <section className="scheme-info"><h4>{title}</h4><p>{value}</p></section>; }

function readLocalHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem('truthlens-verification-history-v1') || '[]');
    return Array.isArray(saved) ? saved.filter((item) => item && typeof item.claim === 'string').slice(0, 20) : [];
  } catch { return []; }
}

function EvidenceList({ title, items }) {
  return <section className="evidence-list"><h4>{title}</h4>{items.length ? <ul>{items.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title} <ExternalLink size={13}/></a>{source.domain && <small className="domain-indicator">{source.domain} · domain type: {source.domainType || 'other'} (automated clue, not a reliability verdict)</small>}<p>{source.snippet}</p>{source.publishedDate && <small>Published {source.publishedDate}</small>}</li>)}</ul> : <p className="no-evidence">No retrieved source was cited for this category. This alone does not prove the claim false.</p>}</section>;
}

import { Injectable } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { VoiceRecorder } from 'capacitor-voice-recorder';

@Injectable({ providedIn: 'root' })
export class MediaService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: BlobPart[] = [];
  private isRecording = false;
  private stream: MediaStream | null = null;
  private webMime = 'audio/webm;codecs=opus';

  constructor() {}

  /* -------------------- IMAGE -------------------- */
  async takePhoto(): Promise<string> {
    const image = await Camera.getPhoto({
      quality: 80,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
    });
    return image.dataUrl!;
  }

  async chooseFromGallery(): Promise<string> {
    const image = await Camera.getPhoto({
      quality: 80,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Photos,
    });
    return image.dataUrl!;
  }

  /* -------------------- AUDIO RECORD -------------------- */
  async recordAudio(): Promise<void> {
  if (this.isRecording) throw new Error('Already recording');

  if (Capacitor.isNativePlatform()) {
    const perm = await VoiceRecorder.requestAudioRecordingPermission();
    if (!perm.value) throw new Error('Microphone permission denied');
    await VoiceRecorder.startRecording();       // starts immediately on native
    this.isRecording = true;
    return;                                     // resolves when recording has started
  }

  // Web
  const constraints: MediaStreamConstraints = {
    audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
  };
  this.stream = await navigator.mediaDevices.getUserMedia(constraints);

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  const supported = candidates.find((c) => (window as any).MediaRecorder?.isTypeSupported?.(c));
  this.webMime = supported ?? 'audio/webm';

  this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: this.webMime });
  this.audioChunks = [];

  // Resolve only when the recorder actually starts
  await new Promise<void>((resolve, reject) => {
    const onStart = () => {
      this.mediaRecorder!.removeEventListener('start', onStart);
      this.isRecording = true;
      resolve();
    };
    const onError = (e: any) => {
      this.mediaRecorder?.removeEventListener('start', onStart);
      console.error('MediaRecorder error', e);
      this.cleanup();
      reject(e);
    };

    this.mediaRecorder!.addEventListener('start', onStart);
    this.mediaRecorder!.addEventListener('error', onError);

    this.mediaRecorder!.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.audioChunks.push(e.data);
    };

    try {
      this.mediaRecorder!.start(); // no timeslice → capture from the exact start
    } catch (err) {
      onError(err);
    }
  });
}


  async stopRecording(): Promise<string> {
    if (!this.isRecording) throw new Error('Not currently recording');

    if (Capacitor.isNativePlatform()) {
      const result = await VoiceRecorder.stopRecording();
      this.isRecording = false;

      const b64 = result?.value?.recordDataBase64;
      const mime = result?.value?.mimeType || 'audio/aac';
      if (!b64) throw new Error('No audio captured');

      const dataUrl = `data:${mime};base64,${b64}`;
      const blob = await this.dataUrlToBlob(dataUrl);
      const objectUrl = URL.createObjectURL(blob);

      // Optional: persist to filesystem
      try {
        const ext = mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : 'aac';
        await Filesystem.writeFile({
          path: `voice_recording_${Date.now()}.${ext}`,
          data: b64,
          directory: Directory.Data,
        });
      } catch { /* ignore */ }

      return objectUrl;
    }

    // Web
    const url = await new Promise<string>((resolve, reject) => {
      if (!this.mediaRecorder) {
        this.cleanup();
        return reject(new Error('No active recorder'));
      }

      this.mediaRecorder.onstop = async () => {
        try {
          if (!this.audioChunks.length) throw new Error('No audio data recorded');
          const mime = this.webMime.includes('ogg') ? 'audio/ogg' : 'audio/webm';
          const blob = new Blob(this.audioChunks, { type: mime });
          const objectUrl = URL.createObjectURL(blob);
          this.cleanup();
          resolve(objectUrl);
        } catch (err) {
          this.cleanup();
          reject(err);
        }
      };

      this.mediaRecorder!.stop();
    });

    return url;
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  /* -------------------- PICK AUDIO FILE -------------------- */
  async pickAudioFile(): Promise<{ url: string; base64?: string; mimeType: string; fileName?: string }> {
    const result = await FilePicker.pickFiles({ types: ['audio/*'] });
    if (!result.files?.length) throw new Error('No audio selected');
    const f = result.files[0];

    // Web: Blob available
    if ((f as any).blob) {
      const blob: Blob = (f as any).blob;
      const url = URL.createObjectURL(blob);
      const base64 = await this.blobToDataUrl(blob);
      return { url, base64, mimeType: f.mimeType || blob.type || 'audio/mpeg', fileName: f.name };
    }

    // Base64 provided by plugin
    if ((f as any).data) {
      const dataUrl = (f as any).data.startsWith('data:')
        ? (f as any).data
        : `data:${f.mimeType || 'audio/mpeg'};base64,${(f as any).data}`;
      const blob = await this.dataUrlToBlob(dataUrl);
      const url = URL.createObjectURL(blob);
      return { url, base64: dataUrl, mimeType: f.mimeType || 'audio/mpeg', fileName: f.name };
    }

    // Native path → convert for WebView playback
    if (f.path) {
      const webviewUrl = Capacitor.convertFileSrc(f.path);
      return { url: webviewUrl, mimeType: f.mimeType || 'audio/mpeg', fileName: f.name };
    }

    throw new Error('Unsupported file payload from picker');
  }

  /* -------------------- INTERNAL -------------------- */
  private cleanup() {
    this.isRecording = false;
    this.audioChunks = [];
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  private async dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const res = await fetch(dataUrl);
    return await res.blob();
  }
}

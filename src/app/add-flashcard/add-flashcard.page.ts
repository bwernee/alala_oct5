import { Component, ViewChild, ElementRef, ChangeDetectorRef, OnInit } from '@angular/core';
import { Platform, ModalController, NavController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { MediaService } from '../services/media.service';
import { FirebaseService } from '../services/firebase.service';

// Native file persistence for images/audio
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

type UUID = string;

interface UserCategory {
  id: UUID;
  name: string;
  description?: string;
  emoji?: string;
  createdAt: number;
}

type BuiltinCat = 'people' | 'objects' | 'places';

interface BuiltinCard {
  label: string;
  image: string | null;
  audio: string | null;
  duration: number;
}

const CATEGORIES_KEY = 'alala_custom_categories_v1';
const CARDS_PREFIX   = 'alala_cards_';

// ---- Encoding shim (works across Capacitor versions) ----
const FS_BASE64: any = ((): any => {
  try {
    // If enum exists and has BASE64, use it
    // @ts-ignore
    if (Encoding && (Encoding as any).BASE64) return (Encoding as any).BASE64;
  } catch {}
  // Fallback to literal string; we’ll cast to any when we pass it
  return 'base64';
})();

@Component({
  selector: 'app-add-flashcard',
  templateUrl: './add-flashcard.page.html',
  styleUrls: ['./add-flashcard.page.scss'],
  standalone: false,
})
export class AddFlashcardPage implements OnInit {
  name = '';
  image: string | null = null;
  audio: string | null = null;

  // Built-in category (default)
  category: BuiltinCat = 'people';

  // Target selection
  activeTarget: 'builtin' | 'custom' = 'builtin';
  customCategories: UserCategory[] = [];
  selectedCustomCategoryId: string | null = null;

  // From navigation (pre-select a custom target)
  defaultCategoryId: string | null = null;
  defaultCategoryName: string | null = null;

  isRecording = false;
  recordingTime = '00:00';
  private recordingInterval: any;
  private recordingStartTime = 0;

  isPlaying = false;
  currentTime = 0;
  audioDuration: number = 0;

  isSaving = false;

  @ViewChild('audioPlayer', { static: false }) audioPlayer!: ElementRef<HTMLAudioElement>;

  constructor(
    private platform: Platform,
    private modalCtrl: ModalController,
    private nav: NavController,
    public  mediaService: MediaService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute,
    private firebaseService: FirebaseService
  ) {}

  ngOnInit() {
    const st = (this.router.getCurrentNavigation()?.extras?.state || {}) as any;
    const stateId: string | undefined = st.defaultCategoryId;
    const stateName: string | undefined = st.defaultCategoryName;
    const qpId = this.route.snapshot.queryParamMap.get('defaultCategoryId') || undefined;
    const qpBuiltin = this.route.snapshot.queryParamMap.get('defaultCategory');

    this.defaultCategoryId = (stateId || qpId || null);
    this.defaultCategoryName = stateName || null;

    this.customCategories = this.getAllCategories();

    if (this.defaultCategoryId && this.customCategories.some(c => c.id === this.defaultCategoryId)) {
      this.activeTarget = 'custom';
      this.selectedCustomCategoryId = this.defaultCategoryId;
    } else if (qpBuiltin && ['people','objects','places'].includes(qpBuiltin)) {
      this.activeTarget = 'builtin';
      this.category = qpBuiltin as BuiltinCat;
    }
  }

  /* ---------- Modal ---------- */
  private async safeDismiss(result?: any): Promise<void> {
    try {
      const top = await this.modalCtrl.getTop();
      if (top) {
        await top.dismiss(result);
      } else {
        this.nav.back();
      }
    } catch {
      this.nav.back();
    }
  }
  public closeModal(result?: any): Promise<void> {
    return this.safeDismiss(result);
  }

  /* ---------- Storage helpers for custom categories ---------- */
  private getAllCategories(): UserCategory[] {
    try {
      const raw = localStorage.getItem(CATEGORIES_KEY);
      return raw ? (JSON.parse(raw) as UserCategory[]) : [];
    } catch {
      return [];
    }
  }

  private cardsKeyFor(id: string): string {
    return `${CARDS_PREFIX}${id}`;
  }

  /* ---------- Target switching ---------- */
  selectTarget(t: 'builtin' | 'custom') {
    this.activeTarget = t;
    if (t === 'builtin') {
      this.selectedCustomCategoryId = null;
    } else {
      if (!this.selectedCustomCategoryId && this.customCategories.length > 0) {
        this.selectedCustomCategoryId = this.customCategories[0].id;
      }
    }
  }

  selectCustomCategory(id: string) {
    this.activeTarget = 'custom';
    this.selectedCustomCategoryId = id;
  }

  clearCustomSelection() {
    if (this.activeTarget !== 'builtin') this.activeTarget = 'builtin';
    this.selectedCustomCategoryId = null;
  }

  /* ---------- Image ---------- */
  async takePhoto() {
    try { this.image = await this.mediaService.takePhoto(); }
    catch (e) { console.error(e); alert('Failed to take a photo.'); }
  }
  async selectImage() {
    try { this.image = await this.mediaService.chooseFromGallery(); }
    catch (e) { console.error(e); alert('Failed to select image.'); }
  }

  /* ---------- Audio: file ---------- */
  async selectAudio() {
    try {
      const asset = await this.mediaService.pickAudioFile();
      if (asset && (asset as any).base64) {
        this.audio = (asset as any).base64; // data URL
      } else if (asset?.url?.startsWith('blob:')) {
        this.audio = await this.blobUrlToDataUrl(asset.url);
      } else {
        this.audio = asset.url;
      }
      await this.updateAccurateDuration(this.audio!);
    } catch (err) {
      console.error('Audio selection failed', err);
      alert('Audio selection failed or was cancelled.');
    }
  }

  private async blobUrlToDataUrl(blobUrl: string): Promise<string> {
    const res = await fetch(blobUrl);
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  /* ---------- Audio: record ---------- */
  async recordAudio() {
    if (this.isRecording) {
      try {
        clearInterval(this.recordingInterval);
        const stopAt = Date.now();
        const url = await this.mediaService.stopRecording();

        this.isRecording = false;
        this.recordingTime = '00:00';
        this.audio = url;

        const measured = (stopAt - this.recordingStartTime) / 1000;
        await this.updateAccurateDuration(this.audio, measured);
      } catch (e) {
        console.error(e);
      }
      return;
    }
    try {
      await this.mediaService.recordAudio();
      this.isRecording = true;
      this.recordingStartTime = Date.now();
      this.recordingInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
        const mm = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const ss = (elapsed % 60).toString().padStart(2, '0');
        this.recordingTime = `${mm}:${ss}`;
      }, 250);
    } catch (e) {
      console.error(e);
    }
  }

  startNewRecording() {
    this.audio = null;
    this.isPlaying = false;
    this.currentTime = 0;
    this.audioDuration = 0;
    this.recordAudio();
  }

  /* ---------- Player ---------- */
  togglePlayback() {
    if (!this.audioPlayer) return;
    const el = this.audioPlayer.nativeElement;
    if (this.isPlaying) {
      el.pause();
      this.isPlaying = false;
    } else {
      el.play().then(() => this.isPlaying = true).catch(err => {
        console.error('Audio play failed:', err);
        this.isPlaying = false;
      });
    }
  }
  seekAudio(ev: any) {
    if (!this.audioPlayer) return;
    const t = Number(ev.detail.value ?? 0);
    if (isFinite(t)) this.audioPlayer.nativeElement.currentTime = t;
  }
  onAudioLoaded() {
    const d = this.audioPlayer?.nativeElement?.duration ?? 0;
    if (isFinite(d) && d > 0) { this.audioDuration = d; this.cdr.markForCheck(); }
  }
  onTimeUpdate() {
    if (this.audioPlayer) {
      const t = this.audioPlayer.nativeElement.currentTime;
      this.currentTime = isFinite(t) ? t : 0;
    }
  }
  onAudioEnded() {
    this.isPlaying = false;
    this.currentTime = 0;
    if (this.audioPlayer) this.audioPlayer.nativeElement.currentTime = 0;
  }
  onAudioPause() { this.isPlaying = false; }
  onAudioPlay()  { this.isPlaying = true;  }
  removeAudio() {
    this.audio = null;
    this.isPlaying = false;
    this.currentTime = 0;
    this.audioDuration = 0;
  }
  formatTime(n: number) {
    if (!isFinite(n) || isNaN(n) || n < 0) return '00:00';
    const m = Math.floor(n / 60);
    const s = Math.floor(n % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  /* ---------- Duration helpers ---------- */
  private async updateAccurateDuration(url: string, measuredSeconds?: number) {
    const decoded = await this.tryDecodeDuration(url);
    if (decoded && isFinite(decoded) && decoded > 0) {
      this.audioDuration = decoded;
    } else {
      const meta = await this.computeDetachedDuration(url);
      this.audioDuration = meta ?? 0;
    }
    if (measuredSeconds && isFinite(this.audioDuration)) {
      if (measuredSeconds - this.audioDuration > 0.25) {
        this.audioDuration = Math.max(this.audioDuration, measuredSeconds);
      }
    }
  }

  private async tryDecodeDuration(url: string): Promise<number | null> {
    try {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      const decode = (data: ArrayBuffer) =>
        new Promise<AudioBuffer>((resolve, reject) => {
          const ret = (ctx as any).decodeAudioData(
            data,
            (b: AudioBuffer) => resolve(b),
            (e: any) => reject(e)
          );
          if (ret && typeof (ret as Promise<AudioBuffer>).then === 'function') {
            (ret as Promise<AudioBuffer>).then(resolve).catch(reject);
          }
        });
      const audioBuffer = await decode(buf);
      const dur = audioBuffer?.duration ?? 0;
      try { ctx.close(); } catch {}
      return dur && isFinite(dur) ? dur : null;
    } catch {
      return null;
    }
  }

  private async computeDetachedDuration(url: string): Promise<number | null> {
    return new Promise<number | null>((resolve) => {
      const el = new Audio();
      el.preload = 'metadata';
      el.src = url;
      const cleanup = () => { el.src = ''; };
      el.onloadedmetadata = () => {
        if (isFinite(el.duration) && el.duration > 0) {
          const d = el.duration; cleanup(); resolve(d);
        } else {
          el.onseeked = () => {
            const d = isFinite(el.duration) ? el.duration : 0;
            cleanup(); resolve(d || null);
          };
          try { el.currentTime = 1e6; }
          catch { cleanup(); resolve(null); }
        }
      };
      el.onerror = () => { cleanup(); resolve(null); };
    });
  }

  /* ---------- Media persistence helpers ---------- */
  private async shrinkDataUrl(dataUrl: string, maxDim = 1280, quality = 0.8): Promise<string> {
    if (!dataUrl.startsWith('data:image/')) return dataUrl;

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });

    let { width, height } = img;
    if (width <= maxDim && height <= maxDim) return dataUrl;

    const ratio = width / height;
    if (width > height) {
      width = maxDim; height = Math.round(width / ratio);
    } else {
      height = maxDim; width = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality) || dataUrl;
  }

  private dataUrlToBase64(dataUrl: string): string {
    const i = dataUrl.indexOf(',');
    return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  }

  private async persistDataUrlToFilesystem(dataUrl: string, prefix: 'img' | 'aud', fallbackExt: string): Promise<string> {
    try {
      const match = /^data:([^;]+)/.exec(dataUrl);
      const mime = match?.[1] || '';
      const extFromMime =
        mime.includes('jpeg') ? 'jpg' :
        mime.includes('jpg')  ? 'jpg' :
        mime.includes('png')  ? 'png' :
        mime.includes('webp') ? 'webp' :
        mime.includes('ogg')  ? 'ogg' :
        mime.includes('webm') ? 'webm' :
        mime.includes('mp3')  ? 'mp3' :
        mime.includes('m4a')  ? 'm4a' :
        mime.includes('aac')  ? 'aac' : fallbackExt;

      const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}.${extFromMime}`;
      const dataToWrite = prefix === 'img' ? await this.shrinkDataUrl(dataUrl) : dataUrl;
      const base64 = this.dataUrlToBase64(dataToWrite);

      // NOTE: cast to any to satisfy differing Capacitor types across versions
      const write = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Data,
        encoding: FS_BASE64 as any,
        recursive: true
      } as any);

      return Capacitor.convertFileSrc((write as any).uri || (write as any).path || '');
    } catch (e) {
      console.warn('persistDataUrlToFilesystem failed; trying tiny fallback', e);
      if (prefix === 'img') {
        try {
          const tiny = await this.shrinkDataUrl(dataUrl, 640, 0.7);
          const base64 = this.dataUrlToBase64(tiny);
          const fallbackName = `${prefix}_tiny_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
          const writeTiny = await Filesystem.writeFile({
            path: fallbackName,
            data: base64,
            directory: Directory.Data,
            encoding: FS_BASE64 as any,
            recursive: true
          } as any);
          return Capacitor.convertFileSrc((writeTiny as any).uri || (writeTiny as any).path || '');
        } catch (e2) {
          console.error('Tiny image fallback failed; using original data URL', e2);
          return dataUrl; // last resort
        }
      }
      return dataUrl;
    }
  }

  private async ensurePersistentSrc(src: string | null, prefix: 'img' | 'aud', fallbackExt: string): Promise<string | null> {
    if (!src) return null;

    if (/^(https?:|capacitor:|file:)/i.test(src)) return src;
    const isWeb = Capacitor.getPlatform() === 'web';

    if (isWeb) {
      if (prefix === 'img' && src.startsWith('data:image/')) {
        return await this.shrinkDataUrl(src, 1280, 0.8);
      }
      return src;
    }

    if (src.startsWith('data:')) {
      return await this.persistDataUrlToFilesystem(src, prefix, fallbackExt);
    }

    return src;
  }

  /* ---------- Safe localStorage ops with quota handling ---------- */
  private safeGetArray<T = any>(key: string): T[] {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]') as T[];
    } catch {
      return [];
    }
  }

  private async normalizeMedia(list: BuiltinCard[]): Promise<BuiltinCard[]> {
    const out: BuiltinCard[] = [];
    for (const item of list) {
      const normImage = item.image ? await this.ensurePersistentSrc(item.image, 'img', 'jpg') : null;
      const normAudio = item.audio ? await this.ensurePersistentSrc(item.audio, 'aud', 'm4a') : null;
      out.push({
        label: item.label,
        image: normImage || null,
        audio: normAudio || null,
        duration: Number(item.duration || 0)
      });
    }
    return out;
  }

  private trySaveWithTrim(key: string, arr: any[], minKeep = 1): void {
    let copy = arr.slice();
    while (copy.length >= minKeep) {
      try {
        localStorage.setItem(key, JSON.stringify(copy));
        return;
      } catch (e) {
        copy.splice(0, Math.min(3, copy.length - minKeep));
        if (copy.length < minKeep) break;
      }
    }
    try {
      const lastOne = arr.slice(-minKeep);
      localStorage.setItem(key, JSON.stringify(lastOne));
    } catch (e2) {
      console.error('Still cannot save after trimming. Storage is full.', e2);
      throw e2;
    }
  }

  /* ---------- Save ---------- */
  async saveFlashcard() {
    if (this.isSaving) return;
    if (!this.name || !this.image) {
      alert('Please enter a name and select a photo.');
      return;
    }
    if (this.activeTarget === 'custom' && !this.selectedCustomCategoryId) {
      alert('Please choose one of your categories.');
      return;
    }

    this.isSaving = true;

    try {
      const imageSrc = await this.ensurePersistentSrc(this.image, 'img', 'jpg');
      const audioSrc = await this.ensurePersistentSrc(this.audio, 'aud', 'm4a');

      const newCard: BuiltinCard = {
        label: this.name,
        image: imageSrc,
        audio: audioSrc || null,
        duration: this.audio ? this.audioDuration : 0
      };

      if (this.activeTarget === 'builtin') {
        const storageKey = `${this.category}Cards` as const;
        // Scope to user
        const uid = localStorage.getItem('userId') || 'anon';
        const scopedKey = `${storageKey}_${uid}`;
        let existing = this.safeGetArray<BuiltinCard>(scopedKey);
        existing = await this.normalizeMedia(existing);
        existing.push(newCard);
        this.trySaveWithTrim(scopedKey, existing, 1);

        // Also save to Firebase for cross-device sync
        try {
          await this.firebaseService.createFlashcard({
            type: 'photo',
            label: this.name,
            src: imageSrc!,
            audio: audioSrc || null,
            duration: this.audio ? this.audioDuration : 0,
            category: this.category
          } as any);
        } catch (err) {
          console.warn('Failed to save flashcard to Firebase', err);
        }

        // Notify app listeners (same-device realtime)
        window.dispatchEvent(new CustomEvent('flashcard-added', {
          detail: {
            kind: 'builtin',
            category: this.category,
            card: newCard
          }
        }));
      } else {
        const targetId = this.selectedCustomCategoryId as string;
        const key = this.cardsKeyFor(targetId);
        const now = Date.now();
        const existingCustom = this.safeGetArray<any>(key);

        const customCard = {
          id: `${now.toString(36)}_${Math.random().toString(36).slice(2,8)}`,
          categoryId: targetId,
          type: 'photo' as const,
          src: imageSrc,
          label: this.name,
          audio: audioSrc || null,
          duration: this.audio ? this.audioDuration : 0,
          createdAt: now
        };
        existingCustom.push(customCard);
        this.trySaveWithTrim(key, existingCustom, 1);

        // Also save to Firebase for cross-device sync
        try {
          await this.firebaseService.createFlashcard({
            type: 'photo',
            label: this.name,
            src: imageSrc!,
            audio: audioSrc || null,
            duration: this.audio ? this.audioDuration : 0,
            categoryId: targetId
          } as any);
        } catch (err) {
          console.warn('Failed to save custom flashcard to Firebase', err);
        }

        // Notify app listeners (same-device realtime)
        window.dispatchEvent(new CustomEvent('flashcard-added', {
          detail: {
            kind: 'custom',
            customCategoryId: targetId,
            card: customCard
          }
        }));
      }

      // Navigate back to the originating list (People/Objects/Places or Custom Category)
      try {
        if (this.activeTarget === 'builtin') {
          const dest = this.category === 'people' ? '/people' : this.category === 'objects' ? '/objects' : '/places';
          await this.safeDismiss();
          this.router.navigate([dest]);
        } else if (this.selectedCustomCategoryId) {
          await this.safeDismiss();
          this.router.navigate(['/category', this.selectedCustomCategoryId]);
        } else {
          await this.closeModal();
        }
      } catch {
        await this.closeModal();
      }
    } catch (e) {
      console.error(e);
      alert('Failed to save. Storage is full — the newest item was kept. Consider deleting a few older flashcards.');
    } finally {
      this.isSaving = false;
    }
  }
}

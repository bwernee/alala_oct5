import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChild,
  ViewChildren,
  NgZone,
} from '@angular/core';
import { ActionSheetController, AlertController, Platform } from '@ionic/angular';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

interface VideoMeta {
  id: string;
  path: string;
  label?: string;
  createdAt: number;
  poster?: string;
}
interface VideoView extends VideoMeta { src: string; }

const STORAGE_KEY = 'alala_videos_v1';

@Component({
  selector: 'app-video-memories',
  templateUrl: './video-memories.page.html',
  styleUrls: ['./video-memories.page.scss'],
  standalone: false,
})
export class VideoMemoriesPage implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('cameraInput') cameraInput!: ElementRef<HTMLInputElement>;
  @ViewChild('galleryInput') galleryInput!: ElementRef<HTMLInputElement>;
  @ViewChild('reels') reelsEl?: ElementRef<HTMLElement>;
  @ViewChildren('vidRef') vidRefs!: QueryList<ElementRef<HTMLVideoElement>>;
  @ViewChild('detailVideoRef') detailVideoRef!: ElementRef<HTMLVideoElement>;

  isPatientMode = false;
  private patientModeListener?: (e: any) => void;

  /** Source list (real items, newest first) */
  videos: VideoView[] = [];

  /** Display list for infinite loop: [last, ...videos, first] */
  displayVideos: VideoView[] = [];

  /** Per-REAL-index playback progress */
  progress: Array<{ current: number; duration: number }> = [];

  /** Inline edit */
  editingIndex: number | null = null;   // REAL index
  editLabel = '';

  /** Title expand/collapse (Patient Mode only) — uses DISPLAY index */
  private expandedTitleIndex: number | null = null;

  /** Scroll helpers */
  private cancelPressed = false;
  private scrollEndTimer: any = null;
  private isJumping = false;
  private currentDisplayIndex = 0;

  /** Gallery functionality */
  showDetailModal = false;
  selectedVideo: VideoView | null = null;
  selectedVideoIndex = -1;
  isDetailVideoPlaying = false;
  detailVideoCurrent = 0;
  detailVideoDuration = 0;

  constructor(
    private _plt: Platform,
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
    private actionSheetCtrl: ActionSheetController,
    private alertCtrl: AlertController,
  ) {}

  /* ---------- Lifecycle ---------- */

  async ngOnInit() {
    this.syncPatientMode();
    this.patientModeListener = (e: any) => {
      this.zone.run(() => {
        this.isPatientMode = !!e?.detail;
        this.cdr.detectChanges();
      });
    };
    window.addEventListener('patientMode-changed', this.patientModeListener);
    await this.restoreFromStorage();
    this.rebuildDisplay();
    this.prepareProgress();
  }

  ngAfterViewInit(): void {
    // Ensure each <video> loops and autoresumes
    this.vidRefs.forEach(ref => {
      const v = ref.nativeElement;
      v.muted = true;
      v.loop = true;
      v.addEventListener('ended', () => { v.currentTime = 0; v.play().catch(() => {}); });
    });

    // Start at first REAL item (display index 1) when looping is active
    setTimeout(() => {
      const startDisplay = this.videos.length > 1 ? 1 : 0;
      this.jumpToPage(startDisplay);
    }, 0);
  }

  ionViewWillEnter() {
    this.syncPatientMode();
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    if (this.patientModeListener) {
      window.removeEventListener('patientMode-changed', this.patientModeListener);
    }
  }

  private syncPatientMode() {
    this.isPatientMode = localStorage.getItem('patientMode') === 'true';
  }

  /* ---------- Infinite display helpers ---------- */

  private rebuildDisplay() {
    if (this.videos.length <= 1) {
      this.displayVideos = this.videos.slice();
    } else {
      const first = this.videos[0];
      const last = this.videos[this.videos.length - 1];
      this.displayVideos = [last, ...this.videos, first];
    }
    this.cdr.detectChanges();
  }

  /** Map DISPLAY index -> REAL index in `videos` */
  realIndex(displayIndex: number): number {
    const n = this.videos.length;
    if (n <= 1) return Math.max(0, Math.min(displayIndex, n - 1));
    if (displayIndex === 0) return n - 1;       // head clone = last real
    if (displayIndex === n + 1) return 0;       // tail clone = first real
    return displayIndex - 1;                    // middle = shift by -1
  }

  private reelsHeight(): number {
    return this.reelsEl?.nativeElement.clientHeight || 0;
  }

  onReelsScroll() {
    if (this.isJumping) return;
    if (this.scrollEndTimer) clearTimeout(this.scrollEndTimer);
    // snap settle debounce
    this.scrollEndTimer = setTimeout(() => this.onScrollSettled(), 120);
  }

  private onScrollSettled() {
    const el = this.reelsEl?.nativeElement;
    if (!el) return;
    const h = this.reelsHeight();
    if (h <= 0) return;

    // which "page" are we closest to?
    const page = Math.round(el.scrollTop / h);
    const n = this.videos.length;

    if (n > 1) {
      // If we landed on a clone, instantly jump to the matching real page
      if (page === 0) { this.jumpToPage(n); return; }       // head clone -> last real
      if (page === n + 1) { this.jumpToPage(1); return; }   // tail clone -> first real
    }

    this.currentDisplayIndex = page;
    this.autoplayVisible(page);
  }

  private jumpToPage(page: number) {
    const el = this.reelsEl?.nativeElement;
    const h = this.reelsHeight();
    if (!el || h <= 0) return;
    this.isJumping = true;
    el.scrollTo({ top: page * h, behavior: 'auto' });
    this.currentDisplayIndex = page;
    this.autoplayVisible(page);
    // allow scroll handler again on next frame
    setTimeout(() => { this.isJumping = false; }, 0);
  }

  private autoplayVisible(displayIndex: number) {
    this.vidRefs?.forEach((ref, i) => {
      const v = ref.nativeElement;
      if (i === displayIndex) v.play().catch(() => {});
      else v.pause();
    });
  }

  /* ---------- Add flow ---------- */

  async openAddMenu() {
    if (this.isPatientMode) return;
    const sheet = await this.actionSheetCtrl.create({
      header: 'Add Video',
      buttons: [
        { text: 'Record with Camera', icon: 'camera', handler: () => this.cameraInput?.nativeElement.click() },
        { text: 'Pick from Files',   icon: 'folder-open', handler: () => this.galleryInput?.nativeElement.click() },
        { text: 'Cancel', role: 'cancel', icon: 'close' },
      ],
    });
    await sheet.present();
  }

  onCancelMouseDown() { this.cancelPressed = true; }

  onInputBlur(realIdx: number) {
    if (this.cancelPressed) {
      this.cancelPressed = false;
      this.cancelEdit();
      return;
    }
    this.saveEdit(realIdx);
  }

  async onFilePicked(event: Event, _source: 'camera' | 'gallery') {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files.length) return;

    const file = input.files[0];
    const suggested = (file.name || '').replace(/\.[^.]+$/, '');
    const label = await this.promptForName('Add video name (optional)', suggested);

    const saved = await this.saveVideoFile(file, (label ?? '').trim() || undefined);

    // Newest first
    this.videos.unshift(saved);
    this.prepareProgress();
    this.rebuildDisplay();

    this.cdr.detectChanges();

    // jump to the (new) first real item
    setTimeout(() => this.jumpToPage(this.videos.length > 1 ? 1 : 0), 0);

    input.value = '';
    await this.persistMetadata();
  }

  /* ---------- Inline title editing ---------- */

  startEdit(displayIdx: number) {
    if (this.isPatientMode) return;
    const ri = this.realIndex(displayIdx);
    this.editingIndex = ri;
    this.editLabel = (this.videos[ri].label || '').trim();
  }

  onEditLabelInput(ev: any) {
    const val = ev?.detail?.value ?? ev?.target?.value ?? '';
    this.editLabel = val;
  }

  async saveEdit(realIdx: number) {
    if (this.editingIndex !== realIdx) return;
    const newLabel = (this.editLabel || '').trim();
    this.videos[realIdx].label = newLabel || undefined;
    this.editingIndex = null;
    this.editLabel = '';
    await this.persistMetadata();
    this.cdr.detectChanges();
  }

  cancelEdit() {
    this.editingIndex = null;
    this.editLabel = '';
  }

  /* ---------- Title expand/collapse (TikTok-like) ---------- */

  isTitleExpanded(displayIdx: number): boolean {
    return this.expandedTitleIndex === displayIdx;
  }

  onTitleTap(displayIdx: number) {
    if (!this.isPatientMode) {
      this.startEdit(displayIdx);
      return;
    }
    this.expandedTitleIndex = (this.expandedTitleIndex === displayIdx) ? null : displayIdx;
  }

  /* ---------- Delete video (file + metadata) ---------- */

  async deleteVideo(displayIdx: number) {
    if (this.isPatientMode) return;
    const ri = this.realIndex(displayIdx);
    const item = this.videos[ri];
    if (!item) return;

    const confirm = await this.alertCtrl.create({
      header: 'Delete video?',
      message: 'This will remove the video from your device.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive' },
      ],
      backdropDismiss: true,
    });
    await confirm.present();
    const res = await confirm.onDidDismiss();
    if (res.role !== 'destructive') return;

    try { await Filesystem.deleteFile({ path: item.path, directory: Directory.Data }); } catch {}

    this.videos.splice(ri, 1);
    this.prepareProgress();
    this.rebuildDisplay();

    if (this.expandedTitleIndex === displayIdx) this.expandedTitleIndex = null;

    await this.persistMetadata();
    this.cdr.detectChanges();

    // Keep scroll stable
    setTimeout(() => this.jumpToPage(this.videos.length > 1 ? 1 : 0), 0);
  }

  /* ---------- Video controls ---------- */

  onLoadedMeta(displayIdx: number) {
    const v = this.getVideo(displayIdx);
    if (!v) return;
    const dur = isFinite(v.duration) ? v.duration : 0;
    const ri = this.realIndex(displayIdx);
    this.ensureProgressIndex(ri);
    this.progress[ri].duration = dur > 0 ? dur : 0;
  }

  onTimeUpdate(displayIdx: number) {
    const v = this.getVideo(displayIdx);
    if (!v) return;
    const ri = this.realIndex(displayIdx);
    this.ensureProgressIndex(ri);
    this.progress[ri].current = v.currentTime || 0;
    if (!this.progress[ri].duration && isFinite(v.duration)) {
      this.progress[ri].duration = v.duration || 0;
    }
  }

  onSeek(ev: CustomEvent, displayIdx: number) {
    const value = (ev.detail as any).value ?? 0;
    const v = this.getVideo(displayIdx);
    if (!v) return;
    v.currentTime = Number(value) || 0;
    const ri = this.realIndex(displayIdx);
    this.ensureProgressIndex(ri);
    this.progress[ri].current = v.currentTime;
  }

  onVideoTap(displayIdx: number) {
    const v = this.getVideo(displayIdx);
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  isPlaying(displayIdx: number): boolean {
    const v = this.getVideo(displayIdx);
    return !!v && !v.paused && !v.ended && v.currentTime > 0;
  }

  formatTime(sec: number): string {
    if (!sec || !isFinite(sec)) return '0:00';
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    const m = Math.floor(sec / 60);
    return `${m}:${s}`;
  }

  /* ---------- Storage helpers ---------- */

  private prepareProgress() {
    this.progress = this.videos.map(() => ({ current: 0, duration: 0 }));
  }

  private async persistMetadata() {
    const toSave: VideoMeta[] = this.videos.map(({ id, path, label, createdAt, poster }) => ({
      id, path, label, createdAt, poster,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  }

  private async restoreFromStorage() {
    const raw = localStorage.getItem(STORAGE_KEY);
    let metas: VideoMeta[] = [];
    try { metas = raw ? (JSON.parse(raw) as VideoMeta[]) : []; } catch { metas = []; }

    const views: VideoView[] = [];
    for (const meta of metas) {
      const src = await this.pathToSrc(meta.path);
      views.push({ ...meta, src });
    }
    // newest first
    this.videos = views.sort((a, b) => b.createdAt - a.createdAt);
  }

  private async saveVideoFile(file: File, label?: string): Promise<VideoView> {
    const base64 = await this.fileToBase64(file);
    const extMatch = file.name?.match(/\.[^.]+$/);
    const ext = extMatch ? extMatch[0] : '.mp4';
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const relPath = `videos/${id}${ext}`;

    await Filesystem.mkdir({ path: 'videos', directory: Directory.Data, recursive: true }).catch(() => {});
    await Filesystem.writeFile({ path: relPath, data: base64, directory: Directory.Data, recursive: true });

    const src = await this.pathToSrc(relPath);
    const createdAt = Date.now();
    const meta: VideoMeta = { id, path: relPath, label, createdAt };

    const existingRaw = localStorage.getItem(STORAGE_KEY);
    const list: VideoMeta[] = existingRaw ? (JSON.parse(existingRaw) as VideoMeta[]) : [];
    list.unshift(meta);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

    return { ...meta, src };
  }

  private async pathToSrc(relPath: string): Promise<string> {
    if (Capacitor.isNativePlatform()) {
      const uri = await Filesystem.getUri({ path: relPath, directory: Directory.Data });
      return Capacitor.convertFileSrc ? Capacitor.convertFileSrc(uri.uri) : uri.uri;
    } else {
      const res = await Filesystem.readFile({ path: relPath, directory: Directory.Data });
      if (typeof res.data !== 'string') {
        const blob = res.data as Blob;
        return URL.createObjectURL(blob);
      }
      const b64 = res.data as string;
      const byteString = atob(b64);
      const len = byteString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = byteString.charCodeAt(i);
      const mime = relPath.endsWith('.webm') ? 'video/webm'
               : relPath.endsWith('.mov')  ? 'video/quicktime'
               : relPath.endsWith('.mkv')  ? 'video/x-matroska'
               :                               'video/mp4';
      const blob = new Blob([bytes], { type: mime });
      return URL.createObjectURL(blob);
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read error'));
      reader.onload = () => {
        const result = (reader.result as string) || '';
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.readAsDataURL(file);
    });
  }

  private getVideo(displayIdx: number): HTMLVideoElement | null {
    const ref = this.vidRefs?.get(displayIdx);
    return ref?.nativeElement ?? null;
  }

  private ensureProgressIndex(realIdx: number) {
    if (!this.progress[realIdx]) this.progress[realIdx] = { current: 0, duration: 0 };
  }

  private async promptForName(header: string, value: string): Promise<string | null> {
    const alert = await this.alertCtrl.create({
      header,
      inputs: [{ name: 'label', type: 'text', placeholder: '(optional)', value }],
      buttons: [{ text: 'Skip', role: 'cancel' }, { text: 'Save', role: 'confirm' }],
      backdropDismiss: true,
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss();
    if (role !== 'confirm') return null;
    return (data?.values?.label ?? '') as string;
  }

  // ===== Gallery functionality =====
  openDetailView(video: VideoView, index: number) {
    this.selectedVideo = video;
    this.selectedVideoIndex = index;
    this.showDetailModal = true;
    this.editLabel = video.label || '';
  }

  closeDetailView() {
    this.showDetailModal = false;
    this.selectedVideo = null;
    this.selectedVideoIndex = -1;
    this.isDetailVideoPlaying = false;
    this.detailVideoCurrent = 0;
    this.detailVideoDuration = 0;
  }

  onDetailVideoLoaded() {
    const video = this.detailVideoRef?.nativeElement;
    if (video) {
      this.detailVideoDuration = video.duration || 0;
    }
  }

  onDetailVideoTimeUpdate() {
    const video = this.detailVideoRef?.nativeElement;
    if (video) {
      this.detailVideoCurrent = video.currentTime || 0;
    }
  }

  toggleDetailVideoPlay() {
    const video = this.detailVideoRef?.nativeElement;
    if (!video) return;

    if (this.isDetailVideoPlaying) {
      video.pause();
      this.isDetailVideoPlaying = false;
    } else {
      video.play().then(() => {
        this.isDetailVideoPlaying = true;
      }).catch(() => {
        this.isDetailVideoPlaying = false;
      });
    }
  }

  onDetailVideoSeek(event: CustomEvent) {
    const video = this.detailVideoRef?.nativeElement;
    if (!video) return;

    const value = Number(event.detail?.value || 0);
    video.currentTime = value;
    this.detailVideoCurrent = value;
  }

  async deleteVideoFromGallery(index: number) {
    if (this.isPatientMode) return;

    const video = this.videos[index];
    if (!video) return;

    const alert = await this.alertCtrl.create({
      header: 'Delete Video',
      message: `Remove "${video.label || 'this video'}" from your memories?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive', handler: () => this.performDeleteVideo(index) }
      ]
    });
    await alert.present();
  }

  private async performDeleteVideo(index: number) {
    try {
      const video = this.videos[index];
      if (!video) return;

      // Remove file from filesystem
      try { 
        await Filesystem.deleteFile({ path: video.path, directory: Directory.Data }); 
      } catch {}

      // Update local arrays
      this.videos.splice(index, 1);
      this.rebuildDisplay();
      this.prepareProgress();

      // Close detail view if this was the selected video
      if (this.selectedVideo && this.selectedVideo.id === video.id) {
        this.closeDetailView();
      }

      // Persist changes
      await this.persistMetadata();
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Failed to delete video:', error);
    }
  }
}

import { Component, OnDestroy, OnInit } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';

// Built-in categories remain
type BuiltinCategory = 'people' | 'places' | 'objects';
// Allow customs to be tagged distinctly (we don't use this for styling here)
type Category = BuiltinCategory | 'custom' | string;

interface RawCard {
  id?: string;
  label?: string;
  name?: string;
  image?: string;
  photo?: string;
  photoUrl?: string;
  imagePath?: string;
  audio?: string;
  audioUrl?: string;
  audioPath?: string;
  category?: string;
  createdAt?: number | string;
}

// Custom-category stored card shape (from your CustomCategoryPage)
interface RawCustomCard {
  id: string;
  categoryId: string;
  type: 'photo' | 'video' | 'manual';
  src: string;         // image/video url
  label?: string;
  audio?: string | null;
  duration?: number;
  createdAt: number;
}

interface UnifiedCard {
  id: string;
  label: string;
  image: string;
  audio?: string;
  category: Category;
  createdAt?: number;
  // distinguish origin so we can delete/update correctly
  origin: { kind: 'builtin'; key: 'peopleCards' | 'placesCards' | 'objectsCards' }
        | { kind: 'custom'; customId: string };
}

const CATEGORIES_KEY = 'alala_custom_categories_v1';
const CARDS_PREFIX   = 'alala_cards_';

@Component({
  selector: 'app-photo-memories',
  templateUrl: './photo-memories.page.html',
  styleUrls: ['./photo-memories.page.scss'],
  standalone: false
})
export class PhotoMemoriesPage implements OnInit, OnDestroy {
  isPatientMode = false;

  cards: UnifiedCard[] = [];
  idx = -1;

  // Audio/timeline
  private audio?: HTMLAudioElement;
  isPlaying = false;
  duration = 0;  // seconds
  current  = 0;  // seconds

   constructor(
    private alertCtrl: AlertController,
    private toastCtrl: ToastController
  ) {}

  private onPatientModeChange = (e?: any) => {
    const v = e?.detail ?? localStorage.getItem('patientMode');
    this.isPatientMode = (v === true || v === 'true');
  };

  ngOnInit(): void {
    this.isPatientMode = localStorage.getItem('patientMode') === 'true';
    this.loadAll();
    if (this.cards.length > 0) this.idx = 0;

    // React to Patient Mode changes app-wide
    window.addEventListener('patientMode-changed', this.onPatientModeChange as any);
    window.addEventListener('storage', (ev: StorageEvent) => {
      if (ev.key === 'patientMode') this.onPatientModeChange();
    });
  }

  ionViewWillEnter(): void {
    // Refresh patient mode and data each time we enter
    this.isPatientMode = localStorage.getItem('patientMode') === 'true';
    const prev = this.currentCard?.id;
    this.loadAll();
    if (this.cards.length === 0) { this.idx = -1; this.stopAudio(); return; }
    const keep = prev ? this.cards.findIndex(c => c.id === prev) : -1;
    this.idx = keep >= 0 ? keep : Math.min(Math.max(this.idx, 0), this.cards.length - 1);
  }

  ngOnDestroy(): void {
    this.stopAudio();
    window.removeEventListener('patientMode-changed', this.onPatientModeChange as any);
  }

  // ===== Derived =====
  get hasCard(): boolean { return this.idx >= 0 && this.idx < this.cards.length; }
  get currentCard(): UnifiedCard | null { return this.hasCard ? this.cards[this.idx] : null; }

  imgSrc(card: UnifiedCard | null): string {
    return card?.image || 'assets/img/placeholder.png';
  }

  // ===== Load & normalize: Builtins + Custom Categories =====
  private loadAll() {
    // Builtins
    const people  = this.readBuiltin('peopleCards',  'people');
    const places  = this.readBuiltin('placesCards',  'places');
    const objects = this.readBuiltin('objectsCards', 'objects');

    // Customs
    const customs = this.readAllCustoms();

    const all = [...people, ...places, ...objects, ...customs];

    // Sort newest first if createdAt exists
    all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    this.cards = all;
  }

  private readBuiltin(key: 'peopleCards' | 'placesCards' | 'objectsCards', cat: BuiltinCategory): UnifiedCard[] {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw) as RawCard[];
      return arr
        .map((c, i) => this.normalizeBuiltin(c, cat, key, i))
        .filter((x): x is UnifiedCard => !!x && !!x.label && !!x.image);
    } catch {
      return [];
    }
  }

  private normalizeBuiltin(
    c: RawCard,
    category: BuiltinCategory,
    originKey: 'peopleCards' | 'placesCards' | 'objectsCards',
    i: number
  ): UnifiedCard | null {
    const id    = (c.id || `${originKey}-${i}-${Date.now()}`).toString();
    const label = (c.label || c.name || '').toString().trim();
    const image = (c.image || c.photo || c.photoUrl || c.imagePath || '').toString().trim();
    const audio = (c.audio || c.audioUrl || c.audioPath || '').toString().trim();
    if (!label || !image) return null;

    let createdAt: number | undefined;
    if (c.createdAt) {
      const n = typeof c.createdAt === 'string' ? Date.parse(c.createdAt) : c.createdAt;
      if (!Number.isNaN(n)) createdAt = typeof n === 'number' ? n : undefined;
    }

    return {
      id,
      label,
      image,
      audio: audio || undefined,
      category,
      createdAt,
      origin: { kind: 'builtin', key: originKey }
    };
    }

  private readAllCustoms(): UnifiedCard[] {
    // 1) Load the list of user categories
    const cats = this.getAllUserCategories();
    if (cats.length === 0) return [];

    // 2) For each, read its cards and keep only photos (to match People-like UI)
    const all: UnifiedCard[] = [];
    for (const c of cats) {
      const rawList = this.readCustomCards(c.id);
      const photos = rawList.filter(it => it.type === 'photo');
      for (const p of photos) {
        const id = p.id;
        const label = (p.label || 'Untitled').toString();
        const image = (p.src || '').toString();
        if (!id || !image) continue;

        // createdAt is already numeric per your writer
        const createdAt = typeof p.createdAt === 'number' ? p.createdAt : Date.now();

        all.push({
          id,
          label,
          image,
          audio: p.audio || undefined,
          category: 'custom',
          createdAt,
          origin: { kind: 'custom', customId: c.id }
        });
      }
    }
    return all;
  }

  private getAllUserCategories(): Array<{ id: string; name: string }> {
    try {
      const raw = localStorage.getItem(CATEGORIES_KEY);
      const arr = raw ? JSON.parse(raw) as Array<{ id: string; name: string }> : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  private readCustomCards(categoryId: string): RawCustomCard[] {
    try {
      const raw = localStorage.getItem(`${CARDS_PREFIX}${categoryId}`);
      return raw ? JSON.parse(raw) as RawCustomCard[] : [];
    } catch { return []; }
  }

  private saveCustomCards(categoryId: string, list: RawCustomCard[]) {
    localStorage.setItem(`${CARDS_PREFIX}${categoryId}`, JSON.stringify(list));
  }

  // ===== Navigation =====
  prev() {
    if (!this.hasCard) return;
    this.stopAudio();
    this.idx = (this.idx - 1 + this.cards.length) % this.cards.length;
  }

  next() {
    if (!this.hasCard) return;
    this.stopAudio();
    this.idx = (this.idx + 1) % this.cards.length;
  }

  // ===== Audio + timeline =====
  async togglePlay() {
    const card = this.currentCard;
    if (!card?.audio) { await this.toast('No audio for this memory', 'warning'); return; }

    // Recreate audio when switching cards
    if (!this.audio || this.audio.src !== card.audio) {
      this.stopAudio();
      this.audio = new Audio(card.audio);
      this.audio.preload = 'metadata';
      this.audio.addEventListener('loadedmetadata', () => {
        this.duration = this.audio?.duration ?? 0;
      });
      this.audio.addEventListener('timeupdate', () => {
        this.current = this.audio?.currentTime ?? 0;
      });
      this.audio.addEventListener('ended', () => {
        this.isPlaying = false;
        this.current = 0;
      });
    }

    if (this.isPlaying) {
      this.audio.pause();
      this.isPlaying = false;
    } else {
      try {
        await this.audio.play();
        this.isPlaying = true;
      } catch {
        this.isPlaying = false;
        await this.toast('Unable to play audio', 'danger');
      }
    }
  }

  onSeek(ev: CustomEvent) {
    if (!this.audio) return;
    const val = Number((ev as any).detail?.value || 0);
    this.audio.currentTime = val;
    this.current = val;
  }

  private stopAudio() {
    if (this.audio) {
      try { this.audio.pause(); } catch {}
      try { this.audio.src = ''; } catch {}
      this.audio = undefined;
    }
    this.isPlaying = false;
    this.duration = 0;
    this.current = 0;
  }

  // ===== Delete (supports builtins + custom) =====
  async deleteCurrent() {
    if (this.isPatientMode || !this.currentCard) return;

    const alert = await this.alertCtrl.create({
      header: 'Delete Memory',
      message: `Remove "${this.currentCard.label}" from its category?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive', handler: () => this.performDelete() }
      ]
    });
    await alert.present();
  }

  private async performDelete() {
    const card = this.currentCard;
    if (!card) return;

    try {
      if (card.origin.kind === 'builtin') {
        // Remove from people/places/objects
        const raw = localStorage.getItem(card.origin.key);
        if (raw) {
          const arr = JSON.parse(raw) as RawCard[];
          const i = arr.findIndex(x =>
            (x.id && x.id === card.id) ||
            ((x.label || x.name) === card.label &&
             (x.image || x.photo || x.photoUrl || x.imagePath) === card.image)
          );
          if (i >= 0) {
            arr.splice(i, 1);
            localStorage.setItem(card.origin.key, JSON.stringify(arr));
          }
        }
      } else {
        // Remove from a custom category list
        const customId = card.origin.customId;
        const list = this.readCustomCards(customId);
        const idx = list.findIndex(x => x.id === card.id);
        if (idx >= 0) {
          list.splice(idx, 1);
          this.saveCustomCards(customId, list);
        }
      }

      // Update in-memory list/index
      this.cards.splice(this.idx, 1);
      if (this.cards.length === 0) {
        this.idx = -1;
        this.stopAudio();
      } else if (this.idx >= this.cards.length) {
        this.idx = 0;
      }

      await this.toast('Memory deleted', 'success');
    } catch {
      await this.toast('Delete failed', 'danger');
    }
  }

  // ===== Toast helper =====
  private async toast(message: string, color: 'success' | 'warning' | 'danger' | 'primary' = 'primary') {
    const t = await this.toastCtrl.create({
      message,
      color,
      duration: 1700,
      position: 'bottom'
    });
    await t.present();
  }
}

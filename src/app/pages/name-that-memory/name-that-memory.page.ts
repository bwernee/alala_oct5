import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseService } from '../../services/firebase.service';
import { ProgressPage } from '../progress/progress.page';

type Category = 'people' | 'places' | 'objects' | string;

interface RawCard {
  id?: string;
  label?: string;
  name?: string;
  image?: string;
  photo?: string;
  photoUrl?: string;
  imagePath?: string;
  category?: string;
}
interface GameCard {
  id?: string;
  label: string;
  image: string;
  category: Category;
}

/* ===== Custom categories storage keys ===== */
const CATEGORIES_KEY = 'alala_custom_categories_v1';
const CARDS_PREFIX   = 'alala_cards_';

interface CustomCategory {
  id: string;
  name: string;
  description?: string;
  emoji?: string;
  createdAt?: number;
}
interface RawCustomCard {
  id: string;
  categoryId: string;
  type: 'photo' | 'video' | 'manual';
  src: string;
  label?: string;
  audio?: string | null;
  duration?: number;
  createdAt?: number;
}

type Selection =
  | { type: 'builtin'; value: 'people' | 'places' | 'objects' }
  | { type: 'custom'; value: string };

@Component({
  selector: 'app-name-that-memory',
  templateUrl: './name-that-memory.page.html',
  styleUrls: ['./name-that-memory.page.scss'],
  standalone: false,
})
export class NameThatMemoryPage implements OnInit, OnDestroy {
  /* Header */
  isPatientMode = false;

  /* Category picker */
  isCategoryPickerOpen = false;
  userCategories: CustomCategory[] = [];
  selectedFilter: Selection | null = null; // MUST choose a category

  /* Counts for picker */
  counts: {
    people: number;
    places: number;
    objects: number;
    custom: Record<string, number>;
  } = { people: 0, places: 0, objects: 0, custom: {} };

  /* Data pools */
  allCards: GameCard[] = [];
  gameCards: GameCard[] = [];

  /* Round state */
  currentCard: GameCard | null = null;
  options: string[] = [];
  currentQuestion = 0;
  totalQuestions = 10;
  correctAnswers = 0;

  /* UI state */
  showResult = false;
  isCorrect = false;
  showGameComplete = false;

  /* Control */
  private shouldCompleteAfterResult = false;

  /* Tracking */
  skipCount = 0;
  skippedCardIds: string[] = [];
  private askedLabels = new Set<string>();
  private gameStartTime = 0;

  /* Live watcher for categories while modal is open */
  private categoriesWatchTimer: any = null;
  private lastCategoriesHash = '';

  private readonly DEFAULT_NAMES = [
    'Aurelia','Thaddeus','Isolde','Cassian','Mirella',
    'Osric','Linnea','Percival','Elowen','Soren',
    'Calliope','Evander','Brielle','Lucian','Marisol'
  ];

  constructor(private router: Router, private firebaseService: FirebaseService) {}

  /* ===== Lifecycle ===== */
  ngOnInit() {
    this.loadPatientModeFromStorage();
    this.userCategories = this.getAllUserCategories();
    this.computeCounts();
    this.openCategoryPicker(); // force a category choice before playing
  }

  ionViewWillEnter() {
    this.userCategories = this.getAllUserCategories();
    this.computeCounts();
    this.openCategoryPicker();
  }

  ngOnDestroy() {
    this.stopCategoriesWatcher();
  }

  /* ===== Header helpers ===== */
  togglePatientMode() {
    this.isPatientMode = !this.isPatientMode;
    try { localStorage.setItem('patientMode', JSON.stringify(this.isPatientMode)); } catch {}
  }
  private loadPatientModeFromStorage() {
    try {
      const raw = localStorage.getItem('patientMode');
      this.isPatientMode = raw ? JSON.parse(raw) : false;
    } catch { this.isPatientMode = false; }
  }

  /* =========================
   * Category Picker Controls
   * ========================= */
  openCategoryPicker() {
    this.isCategoryPickerOpen = true;
    this.startCategoriesWatcher();
  }
  closeCategoryPicker() {
    this.isCategoryPickerOpen = false;
    this.stopCategoriesWatcher();
  }
  closePickerToHome() {
    this.closeCategoryPicker();
    this.router.navigate(['/home']);
  }

  chooseBuiltin(builtin: 'people' | 'places' | 'objects') {
    this.selectedFilter = { type: 'builtin', value: builtin };
    this.closeCategoryPicker();
    this.setupNewRun();
  }
  chooseCustom(categoryId: string) {
    this.selectedFilter = { type: 'custom', value: categoryId };
    this.closeCategoryPicker();
    this.setupNewRun();
  }

  /* ---- live refresh while modal open ---- */
  private startCategoriesWatcher() {
    this.lastCategoriesHash = this.readCategoriesHash();
    this.stopCategoriesWatcher(); // safety
    this.categoriesWatchTimer = setInterval(() => {
      const h = this.readCategoriesHash();
      if (h !== this.lastCategoriesHash) {
        this.lastCategoriesHash = h;
        this.userCategories = this.getAllUserCategories();
        this.computeCounts();
      }
    }, 1000);
  }
  private stopCategoriesWatcher() {
    if (this.categoriesWatchTimer) {
      clearInterval(this.categoriesWatchTimer);
      this.categoriesWatchTimer = null;
    }
  }
  private readCategoriesHash(): string {
    try {
      const raw = localStorage.getItem(CATEGORIES_KEY) || '[]';
      return `${raw.length}:${raw}`;
    } catch { return '0'; }
  }

  /* ============== Game setup (category-only) ============== */
  private setupNewRun() {
    // Require a category
    if (!this.selectedFilter) {
      this.openCategoryPicker();
      return;
    }

    // Build pool according to selected category ONLY
    this.allCards = this.loadCardsByFilter(this.selectedFilter);

    // De-duplicate by (label,image,category)
    const seen = new Set<string>();
    this.gameCards = this.allCards.filter(c => {
      const key = `${c.category}::${(c.label || '').toLowerCase()}::${c.image}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return !!c.label && !!c.image;
    });

    const uniqueCount = new Set(this.gameCards.map(c => c.label.toLowerCase())).size;
    this.totalQuestions = Math.min(10, Math.max(uniqueCount, 0));

    // reset runtime state
    this.currentCard = null;
    this.options = [];
    this.currentQuestion = 0;
    this.correctAnswers = 0;
    this.skipCount = 0;
    this.skippedCardIds = [];
    this.showResult = false;
    this.isCorrect = false;
    this.showGameComplete = false;
    this.shouldCompleteAfterResult = false;
    this.askedLabels.clear();
    this.gameStartTime = Date.now();

    if (this.gameCards.length > 0 && this.totalQuestions > 0) {
      this.startNewQuestion();
    }
  }

  private loadCardsByFilter(filter: Selection): GameCard[] {
    const people = this.readCardsWithFallbacks('people');
    const places = this.readCardsWithFallbacks('places');
    const objects = this.readCardsWithFallbacks('objects');

    if (filter.type === 'builtin') {
      const cat = filter.value;
      const map: Record<'people' | 'places' | 'objects', GameCard[]> = {
        people, places, objects
      };
      return map[cat].map(c => ({ ...c, category: cat }));
    }

    // custom single category id
    if (filter.type === 'custom') {
      const id = filter.value;
      const cats = this.getAllUserCategories();
      const cat = cats.find(c => c.id === id);
      if (!cat) return [];
      const raw = this.readCustomCards(id).filter(c => c.type === 'photo');
      return raw
        .filter(r => !!r.label && !!r.src)
        .map(r => ({
          id: r.id,
          label: (r.label || 'Untitled').toString().trim(),
          image: (r.src || '').toString().trim(),
          category: (cat.name || 'custom').toString().trim().toLowerCase()
        }));
    }

    return [];
  }

  /* --------- Data loading & normalization --------- */
  private readCardsWithFallbacks(category: Category): GameCard[] {
    const keys = this.buildKeyCandidates(category);
    const result: GameCard[] = [];
    const seen = new Set<string>();

    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      let arr: RawCard[] = [];
      try { arr = JSON.parse(raw); } catch { arr = []; }
      if (!Array.isArray(arr)) continue;

      for (const r of arr) {
        const card = this.normalizeCard(r, category);
        if (!card.label || !card.image) continue;
        const k = `${card.label.toLowerCase()}::${card.image}`;
        if (seen.has(k)) continue;
        seen.add(k);
        result.push(card);
      }
    }
    return result;
  }

  private buildKeyCandidates(cat: string): string[] {
    const singular = cat.endsWith('s') ? cat.slice(0, -1) : cat;
    return [
      `${cat}Cards`, `${singular}Cards`,
      cat, `${cat}_cards`, `${singular}_cards`,
      `${cat}List`, `${singular}List`,
    ];
  }

  private normalizeCard(r: RawCard, category: Category): GameCard {
    const label = (r.label || r.name || '').toString().trim();
    const image = (r.image ?? r.photoUrl ?? r.photo ?? r.imagePath ?? '').toString();
    return { id: r.id, label, image, category };
  }

  /* ======== Custom category helpers ======== */
  private getAllUserCategories(): CustomCategory[] {
    try {
      const raw = localStorage.getItem(CATEGORIES_KEY);
      const arr = raw ? (JSON.parse(raw) as CustomCategory[]) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  private readCustomCards(categoryId: string): RawCustomCard[] {
    try {
      const raw = localStorage.getItem(`${CARDS_PREFIX}${categoryId}`);
      return raw ? (JSON.parse(raw) as RawCustomCard[]) : [];
    } catch { return []; }
  }

  /** Convert all custom photo cards into GameCard[] using each category's name */
  private loadCustomGameCards(): GameCard[] {
    const cats = this.getAllUserCategories();
    if (cats.length === 0) return [];

    const list: GameCard[] = [];
    for (const cat of cats) {
      const raw = this.readCustomCards(cat.id).filter(c => c.type === 'photo');
      for (const r of raw) {
        const label = (r.label || 'Untitled').toString().trim();
        const image = (r.src || '').toString().trim();
        if (!label || !image) continue;

        list.push({
          id: r.id,
          label,
          image,
          category: (cat.name || 'custom').toString().trim().toLowerCase()
        });
      }
    }
    return list;
  }

  /* --------- Game flow --------- */
  private startNewQuestion() {
    if (this.currentQuestion >= this.totalQuestions || this.gameCards.length === 0) {
      this.endGame();
      return;
    }

    this.currentQuestion += 1;

    // pick a card we haven’t asked yet (by label) if possible
    const pool = this.gameCards.filter(c => !this.askedLabels.has(c.label));
    const base = pool.length ? pool : this.gameCards;
    const card = base[Math.floor(Math.random() * base.length)];
    this.askedLabels.add(card.label);
    this.currentCard = card;

    // Build options: correct + 3 distractors (from the SAME category pool)
    const correct = card.label;
    const allOtherLabels = this.gameCards
      .filter(c => c.label !== correct)
      .map(c => c.label);

    // Filter near-duplicates
    const filtered = allOtherLabels.filter(l => !this.isSimilar(l, correct));
    const poolNames = this.shuffle([...filtered]);

    // Fill to 3 distractors; if too few names in user data, add DEFAULT_NAMES (dedup/similarity checked)
    const userAllLabels = new Set(this.gameCards.map(c => this.normalizeToken(c.label)));
    const defaultFillers = this.DEFAULT_NAMES
      .filter(n => !this.isSimilarToAny(n, userAllLabels))
      .filter(n => !this.isSimilar(n, correct));
    while (poolNames.length < 3 && defaultFillers.length > 0) {
      poolNames.push(defaultFillers.shift()!);
    }

    const four = [correct, ...poolNames.slice(0, 3)];
    this.options = this.shuffle(four);
    this.showResult = false;
    this.isCorrect = false;
    this.shouldCompleteAfterResult = false;
  }

  selectAnswer(choice: string) {
    if (!this.currentCard) return;
    const correct = this.currentCard.label;
    this.isCorrect = this.isSimilar(choice, correct) || choice === correct;
    if (this.isCorrect) this.correctAnswers++;

    // Always show result (even on last question).
    this.shouldCompleteAfterResult = (this.currentQuestion >= this.totalQuestions);
    this.showResult = true;
  }

  skipCurrent() {
    if (!this.currentCard) return;
    this.skipCount++;
    if (this.currentCard.id) this.skippedCardIds.push(this.currentCard.id);

    if (this.currentQuestion >= this.totalQuestions) {
      this.endGame();
    } else {
      this.startNewQuestion();
    }
  }

  continueGame() {
    this.showResult = false;

    if (this.shouldCompleteAfterResult || this.currentQuestion >= this.totalQuestions) {
      this.shouldCompleteAfterResult = false;
      this.endGame();
    } else {
      this.startNewQuestion();
    }
  }

  private getCategoryName(): string {
    if (!this.selectedFilter) return 'unknown';
    if (this.selectedFilter.type === 'builtin') {
      return this.selectedFilter.value;
    } else {
      // For custom categories, find the name
      const customCategory = this.userCategories.find(c => c.id === this.selectedFilter!.value);
      return customCategory ? customCategory.name.toLowerCase() : 'custom';
    }
  }

  private async endGame() {
    // Calculate total time in seconds
    const totalTimeSeconds = this.gameStartTime > 0 ? Math.round((Date.now() - this.gameStartTime) / 1000) : 0;

    // Save session data to Firebase and localStorage
    const sessionData = {
      category: this.getCategoryName(),
      totalQuestions: this.totalQuestions,
      correctAnswers: this.correctAnswers,
      skipped: this.skipCount,
      totalTime: totalTimeSeconds,
      timestamp: Date.now()
    };

    // Save to Firebase using the progress page helper
    try {
      await ProgressPage.saveGameSession(this.firebaseService, sessionData);
      console.log('✅ Name That Memory session saved to Firebase');
    } catch (error) {
      console.error('❌ Error saving Name That Memory session:', error);
    }

    // Keep the old localStorage format for backward compatibility
    try {
      const key = 'nameThatMemoryHistory';
      const history: any[] = JSON.parse(localStorage.getItem(key) || '[]');
      history.push({
        endedAt: new Date().toISOString(),
        totalQuestions: this.totalQuestions,
        correctAnswers: this.correctAnswers,
        skipCount: this.skipCount,
        skippedCardIds: this.skippedCardIds,
        filter: this.selectedFilter
      });
      localStorage.setItem(key, JSON.stringify(history));
    } catch {}

    this.showResult = false;
    this.showGameComplete = true;
  }

  finishGame() {
    this.showGameComplete = false;
    this.showResult = false;
    this.shouldCompleteAfterResult = false;
    this.router.navigate(['/home']);
  }

  playAgain() {
    // Keep the same category and restart
    this.setupNewRun();
  }

  /* --------- Progress helpers --------- */
  private getAnsweredCount(): number {
    if (this.totalQuestions <= 0) return 0;
    if (this.showGameComplete) return this.totalQuestions;
    if (this.showResult) return this.currentQuestion;
    return Math.max(0, this.currentQuestion - 1);
  }

  get progressPct(): number {
    if (this.totalQuestions <= 0) return 0;
    const pct = (this.getAnsweredCount() / this.totalQuestions) * 100;
    return Math.min(100, Math.max(0, Math.round(pct)));
  }

  /* --------- Template helpers --------- */
  imgSrc(card: GameCard | null): string {
    if (!card) return '';
    return card.image;
  }

  /* --------- Utils --------- */
  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private normalizeToken(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]/g, '');
  }

  private isSimilar(a: string, b: string): boolean {
    const na = this.normalizeToken(a);
    const nb = this.normalizeToken(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (na.includes(nb) || nb.includes(na)) {
      if (Math.abs(na.length - nb.length) <= 2) return true;
    }
    const d = this.levenshtein(na, nb);
    if (Math.max(na.length, nb.length) <= 5) return d <= 1;
    return d <= 2;
  }

  private isSimilarToAny(name: string, normalizedUserSet: Set<string>): boolean {
    const n = this.normalizeToken(name);
    if (normalizedUserSet.has(n)) return true;
    for (const u of normalizedUserSet) {
      const d = this.levenshtein(n, u);
      if (Math.max(n.length, u.length) <= 5 ? d <= 1 : d <= 2) return true;
      if (n.includes(u) || u.includes(n)) {
        if (Math.abs(n.length - u.length) <= 2) return true;
      }
    }
    return false;
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  }

  /* --------- Counts for picker --------- */
  private computeCounts() {
    const people = this.readCardsWithFallbacks('people');
    const places = this.readCardsWithFallbacks('places');
    const objects = this.readCardsWithFallbacks('objects');

    const customCounts: Record<string, number> = {};
    const cats = this.getAllUserCategories();
    for (const c of cats) {
      const list = this.readCustomCards(c.id).filter(r => r.type === 'photo' && r.label && r.src);
      customCounts[c.id] = list.length;
    }

    this.counts = {
      people: people.length,
      places: places.length,
      objects: objects.length,
      custom: customCounts
    };
  }
}

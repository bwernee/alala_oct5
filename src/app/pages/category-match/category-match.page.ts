import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseService } from '../../services/firebase.service';
import { ProgressPage } from '../progress/progress.page';

type Category = string;

interface RawCard {
  id?: string;
  label?: string;   // name/title for the image
  name?: string;
  image?: string;
  photo?: string;
  photoUrl?: string;
  imagePath?: string;
  category?: string; // user-entered category (preferred if present)
}

interface GameCard {
  id?: string;
  label: string;     // still used as the photo's name/caption/alt
  image: string;
  category: Category; // used for the quiz answer (normalized)
}

/* ===== Custom categories ===== */
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

@Component({
  selector: 'app-category-match',
  templateUrl: './category-match.page.html',
  styleUrls: ['./category-match.page.scss'],
  standalone: false,
})
export class CategoryMatchPage implements OnInit {
  // ===== Header (match Home) =====
  isPatientMode = false;

  // data
  gameCards: GameCard[] = [];
  allCategories: string[] = []; // display labels (Title Case), unique

  // round state
  currentCard: GameCard | null = null;
  options: string[] = []; // category display labels
  currentQuestion = 0;
  totalQuestions = 10;
  correctAnswers = 0;

  // UI state
  showResult = false;
  isCorrect = false;
  showGameComplete = false;

  // completion control (show result first on last Q)
  private shouldCompleteAfterResult = false;

  // tracking
  skipCount = 0;
  skippedCardIds: string[] = [];
  private askedLabels = new Set<string>();

  // Defaults used if user categories are too few
  private readonly DEFAULT_CATEGORIES = ['People', 'Places', 'Objects', 'Events'];

  constructor(private router: Router, private firebaseService: FirebaseService) {}

  // ===== Header helpers =====
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

  ngOnInit() {
    this.loadPatientModeFromStorage();
    this.setupNewRun();
  }

  // Ensure fresh state when re-entering after Exit
  ionViewWillEnter() {
    this.setupNewRun();
  }

  private setupNewRun() {
    this.loadAllCardsAndCategories();

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

    if (this.gameCards.length > 0 && this.totalQuestions > 0) {
      this.startNewQuestion();
    }
  }

  // --------- Data loading & normalization ---------
  private loadAllCardsAndCategories() {
    // Keep your legacy/local keys scan
    const merged: GameCard[] = [];
    const seen = new Set<string>();

    const keysToScan = [
      // legacy/builtin-like keys
      'peopleCards','personCards','people','people_cards','person_cards','peopleList','personList',
      'placesCards','placeCards','places','places_cards','place_cards','placesList','placeList',
      'objectsCards','objectCards','objects','objects_cards','object_cards','objectsList','objectList',
      // generic fallbacks
      'cards','memories','memoryCards'
    ];

    const pushCard = (r: RawCard, fallbackCategory: string | null) => {
      const label = (r.label || r.name || '').toString().trim();
      const image = (r.image ?? r.photoUrl ?? r.photo ?? r.imagePath ?? '').toString();
      const rawCat = (r.category ?? fallbackCategory ?? '').toString().trim();
      const cat = this.normalizeCategoryForStorage(rawCat) || 'uncategorized';
      if (!label) return;
      const key = `${label.toLowerCase()}::${image}::${cat}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push({ id: r.id, label, image, category: cat });
    };

    for (const key of keysToScan) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      let arr: RawCard[] = [];
      try { arr = JSON.parse(raw); } catch { arr = []; }
      if (!Array.isArray(arr)) continue;

      let fallback: string | null = null;
      if (/people|person/i.test(key)) fallback = 'people';
      else if (/place/i.test(key))     fallback = 'places';
      else if (/object/i.test(key))    fallback = 'objects';

      for (const r of arr) pushCard(r, fallback);
    }

    // ✅ Add customs (photo cards mapped to their category names)
    const { cards: customCards, categories: customDisplayCats } = this.loadCustomGameCardsAndCats();
    for (const c of customCards) {
      const key = `${c.label.toLowerCase()}::${c.image}::${c.category}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(c);
      }
    }

    this.gameCards = merged;

    // Build category display list (title case), merging defaults & customs
    const userCats = Array.from(
      new Set(
        merged.map(c => this.displayCategory(c.category)).filter(Boolean)
      )
    );
    const mergedCats = Array.from(new Set([
      ...userCats,
      ...customDisplayCats,       // ✅ include custom category names
      ...this.DEFAULT_CATEGORIES  // keep your defaults as fillers
    ]));
    this.allCategories = mergedCats.slice(0);
  }

  /* ======== Custom category helpers ======== */
  private getAllUserCategories(): CustomCategory[] {
    try {
      const raw = localStorage.getItem(CATEGORIES_KEY);
      const arr = raw ? JSON.parse(raw) as CustomCategory[] : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  private readCustomCards(categoryId: string): RawCustomCard[] {
    try {
      const raw = localStorage.getItem(`${CARDS_PREFIX}${categoryId}`);
      return raw ? JSON.parse(raw) as RawCustomCard[] : [];
    } catch { return []; }
  }

  /** Read all custom photo cards and convert into GameCard[] with the category name used as answer */
  private loadCustomGameCardsAndCats(): { cards: GameCard[]; categories: string[] } {
    const cats = this.getAllUserCategories();
    if (cats.length === 0) return { cards: [], categories: [] };

    const cards: GameCard[] = [];
    const categories = new Set<string>();

    for (const cat of cats) {
      const display = this.displayCategory(cat.name || 'Custom');
      categories.add(display);

      const raw = this.readCustomCards(cat.id).filter(c => c.type === 'photo');

      for (const r of raw) {
        const label = (r.label || 'Untitled').toString().trim();
        const image = (r.src || '').toString().trim();
        if (!label || !image) continue;

        // Store normalized category internally, display via displayCategory()
        const norm = this.normalizeCategoryForStorage(cat.name || 'custom');
        cards.push({
          id: r.id,
          label,
          image,
          category: norm
        });
      }
    }

    return { cards, categories: Array.from(categories) };
  }

  private displayCategory(cat: string): string {
    // Turn "people" -> "People", "special events" -> "Special Events"
    const cleaned = (cat || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
    if (!cleaned) return 'Uncategorized';
    return cleaned.replace(/\b\w/g, m => m.toUpperCase());
  }
  private normalizeCategoryForStorage(cat: string): string {
    return (cat || '')
      .toString()
      .trim()
      .toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ');
  }

  // --------- Game flow ---------
  private startNewQuestion() {
    if (this.currentQuestion >= this.totalQuestions || this.gameCards.length === 0) {
      this.endGame();
      return;
    }

    this.currentQuestion += 1;

    // pick a card we haven’t asked yet (by label) if possible
    const pool = this.gameCards.filter(c => !this.askedLabels.has(c.label));
    const card = (pool.length ? pool : this.gameCards)[
      Math.floor(Math.random() * (pool.length ? pool.length : this.gameCards.length))
    ];
    this.askedLabels.add(card.label);
    this.currentCard = card;

    // Build options: correct category (display) + 3 distractor categories (from allCategories)
    const correctDisplay = this.displayCategory(card.category);
    const otherCats = this.allCategories.filter(c => this.normalizeToken(c) !== this.normalizeToken(correctDisplay));

    // Filter near duplicates like "Place" vs "Places"
    const filtered = otherCats.filter(c => !this.isSimilar(c, correctDisplay));
    const poolCats = this.shuffle([...filtered]);

    // Fill to 3 distractors; if too few, re-add from defaults that aren't similar
    const defaultFillers = this.DEFAULT_CATEGORIES
      .filter(dc => this.normalizeToken(dc) !== this.normalizeToken(correctDisplay))
      .filter(dc => !this.isSimilar(dc, correctDisplay));
    while (poolCats.length < 3 && defaultFillers.length > 0) {
      const next = defaultFillers.shift()!;
      if (!poolCats.some(x => this.normalizeToken(x) === this.normalizeToken(next))) {
        poolCats.push(next);
      }
    }

    const four = [correctDisplay, ...poolCats.slice(0, 3)];
    this.options = this.shuffle(four);
    this.showResult = false;
    this.isCorrect = false;
    this.shouldCompleteAfterResult = false;
  }

  selectAnswer(choice: string) {
    if (!this.currentCard) return;
    const correctDisplay = this.displayCategory(this.currentCard.category);
    this.isCorrect = this.isSimilar(choice, correctDisplay) || this.normalizeToken(choice) === this.normalizeToken(correctDisplay);
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

  private async endGame() {
    // Save session data to Firebase and localStorage
    const sessionData = {
      category: 'category-match',
      totalQuestions: this.totalQuestions,
      correctAnswers: this.correctAnswers,
      skipped: this.skipCount,
      totalTime: 0, // You may want to add time tracking
      timestamp: Date.now()
    };

    // Save to Firebase using the progress page helper
    try {
      await ProgressPage.saveGameSession(this.firebaseService, sessionData);
      console.log('✅ Category Match session saved to Firebase');
    } catch (error) {
      console.error('❌ Error saving Category Match session:', error);
    }

    // Keep the old localStorage format for backward compatibility
    try {
      const key = 'categoryMatchHistory';
      const history: any[] = JSON.parse(localStorage.getItem(key) || '[]');
      history.push({
        endedAt: new Date().toISOString(),
        totalQuestions: this.totalQuestions,
        correctAnswers: this.correctAnswers,
        skipCount: this.skipCount,
        skippedCardIds: this.skippedCardIds,
        categoriesUsed: this.allCategories
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
    this.setupNewRun();
  }

  // --------- Progress helpers ---------
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

  // --------- Template helpers ---------
  imgSrc(card: GameCard | null): string {
    if (!card) return 'assets/img/placeholder.png';
    return card.image || 'assets/img/placeholder.png';
  }

  // --------- Utils ---------
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
}

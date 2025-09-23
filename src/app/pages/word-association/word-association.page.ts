import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseService } from '../../services/firebase.service';
import { ProgressPage } from '../progress/progress.page';

interface WordQuestion {
  word: string;
  answer: string;
  emoji: string;
  options: string[];
}

@Component({
  selector: 'app-word-association',
  templateUrl: './word-association.page.html',
  styleUrls: ['./word-association.page.scss'],
  standalone: false
})
export class WordAssociationPage implements OnInit {
  Math = Math;

  wordQuestions: WordQuestion[] = [
    {
      word: 'Sun',
      answer: 'Moon',
      emoji: '☀️',
      options: ['Moon', 'Car', 'Book', 'Chair']
    },
    {
      word: 'Hot',
      answer: 'Cold',
      emoji: '🔥',
      options: ['Cold', 'Green', 'Fast', 'Loud']
    },
    {
      word: 'Cat',
      answer: 'Dog',
      emoji: '🐱',
      options: ['Dog', 'Tree', 'Phone', 'Shoe']
    },
    {
      word: 'Day',
      answer: 'Night',
      emoji: '🌅',
      options: ['Night', 'Apple', 'Water', 'Music']
    },
    {
      word: 'Happy',
      answer: 'Sad',
      emoji: '😊',
      options: ['Sad', 'Blue', 'Heavy', 'Square']
    },
    {
      word: 'Big',
      answer: 'Small',
      emoji: '🐘',
      options: ['Small', 'Red', 'Sweet', 'Quiet']
    },
    {
      word: 'Up',
      answer: 'Down',
      emoji: '⬆️',
      options: ['Down', 'Circle', 'Soft', 'Bright']
    },
    {
      word: 'Salt',
      answer: 'Pepper',
      emoji: '🧂',
      options: ['Pepper', 'Window', 'Clock', 'Flower']
    }
  ];

  currentQuestion: WordQuestion = this.wordQuestions[0];
  currentOptions: string[] = [];
  currentQuestionNumber: number = 1;
  totalQuestions: number = 8;
  selectedAnswer: string = '';
  showResult: boolean = false;
  isCorrect: boolean = false;
  score: number = 0;
  correctAnswers: number = 0;
  gameStarted: boolean = false;
  gameCompleted: boolean = false;
  usedQuestions: number[] = [];

  constructor(private router: Router, private firebaseService: FirebaseService) { }

  ngOnInit() {
  }

  startGame() {
    this.gameStarted = true;
    this.resetGame();
    this.loadNextQuestion();
  }

  resetGame() {
    this.currentQuestionNumber = 1;
    this.score = 0;
    this.correctAnswers = 0;
    this.gameCompleted = false;
    this.usedQuestions = [];
    this.showResult = false;
    this.selectedAnswer = '';
  }

  loadNextQuestion() {
    // Get a random question that hasn't been used
    let questionIndex;
    do {
      questionIndex = Math.floor(Math.random() * this.wordQuestions.length);
    } while (this.usedQuestions.includes(questionIndex) && this.usedQuestions.length < this.wordQuestions.length);

    this.usedQuestions.push(questionIndex);
    this.currentQuestion = this.wordQuestions[questionIndex];
    
    // Shuffle the options
    this.currentOptions = [...this.currentQuestion.options];
    this.shuffleArray(this.currentOptions);
    
    this.selectedAnswer = '';
    this.showResult = false;
  }

  shuffleArray(array: string[]) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  selectAnswer(answer: string) {
    if (this.showResult) return;
    
    this.selectedAnswer = answer;
    this.isCorrect = answer === this.currentQuestion.answer;
    
    if (this.isCorrect) {
      this.correctAnswers++;
      this.score += 100;
    }
    
    this.showResult = true;
  }

  nextQuestion() {
    if (this.currentQuestionNumber >= this.totalQuestions) {
      this.gameCompleted = true;
      this.calculateFinalScore();
    } else {
      this.currentQuestionNumber++;
      this.loadNextQuestion();
    }
  }

  async calculateFinalScore() {
    // Bonus points for accuracy
    const accuracyBonus = Math.round((this.correctAnswers / this.totalQuestions) * 200);
    this.score += accuracyBonus;

    // Save session data to Firebase
    const sessionData = {
      category: 'word-association',
      totalQuestions: this.totalQuestions,
      correctAnswers: this.correctAnswers,
      skipped: 0, // Word association doesn't have skip functionality
      totalTime: 0, // You may want to add time tracking
      timestamp: Date.now()
    };

    // Save to Firebase using the progress page helper
    try {
      await ProgressPage.saveGameSession(this.firebaseService, sessionData);
      console.log('✅ Word Association session saved to Firebase');
    } catch (error) {
      console.error('❌ Error saving Word Association session:', error);
    }
  }

  goHome() {
    this.router.navigate(['/mini-games']);
  }
}

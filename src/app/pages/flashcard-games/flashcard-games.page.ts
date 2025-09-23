import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-flashcard-games',
  templateUrl: './flashcard-games.page.html',
  styleUrls: ['./flashcard-games.page.scss'],
  standalone: false
})
export class FlashcardGamesPage implements OnInit {

  constructor(private router: Router) { }

  ngOnInit() {
  }

  selectCategory(category: string) {
    this.router.navigate(['/name-that-memory', category]);
  }
}
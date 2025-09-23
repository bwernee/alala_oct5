// src/app/services/people.service.ts
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class PeopleService {
  private peopleCards: any[] = [
    {
      label: 'Daughter Anna',
      image: 'assets/people/daughter.png',
      audio: 'assets/audio/daughter.mp3',
    },
    
    {
      label: 'Sister Sheila',
      image: 'assets/people/aunt.jpg',
      audio: 'assets/audio/sister.mp3',
    },
    {
      label: 'Brother Joe',
      image: 'assets/people/brother.jpg',
      audio: 'assets/people/brother.mp3',
    }
    
  ];

  getCards() {
    return this.peopleCards;
  }

  addCard(card: any) {
    this.peopleCards.push(card);
  }

  deleteCard(index: number) {
    this.peopleCards.splice(index, 1);
  }
}

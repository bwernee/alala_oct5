import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-mini-games',
  templateUrl: './mini-games.page.html',
  styleUrls: ['./mini-games.page.scss'],
  standalone: false
})
export class MiniGamesPage implements OnInit {

  constructor(private router: Router) { }

  ngOnInit() {
  }

}
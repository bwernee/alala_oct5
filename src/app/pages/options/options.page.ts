import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';


@Component({
  selector: 'app-options',
  templateUrl: './options.page.html',
  styleUrls: ['./options.page.scss'],
 standalone: false
})
export class OptionsPage implements OnInit {

  constructor(private router: Router) { }

  ngOnInit() {
  }

  selectCategory(category: string) {
    this.router.navigate(['/name-that-memory'], { queryParams: { category } });
  }
}
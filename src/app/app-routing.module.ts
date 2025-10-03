import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadChildren: () => import('./pages/login/login.module').then(m => m.LoginPageModule)
  },
  {
    path: 'signup',
    loadChildren: () => import('./pages/signup/signup.module').then(m => m.SignupPageModule)
  },
  {
    path: 'home',
    loadChildren: () => import('./pages/home/home.module').then(m => m.HomePageModule)
  },
  {
    path: 'settings',
    loadChildren: () => import('./pages/settings/settings.module').then(m => m.SettingsPageModule)
  },
  {
    path: 'people',
    loadChildren: () => import('./pages/people/people.module').then( m => m.PeoplePageModule)
  },
  {
    path: 'objects',
    loadChildren: () => import('./pages/objects/objects.module').then( m => m.ObjectsPageModule)
  },
  {
    path: 'places',
    loadChildren: () => import('./pages/places/places.module').then( m => m.PlacesPageModule)
  },
  
    {
    path: 'progress',
    loadChildren: () => import('./pages/progress/progress.module').then( m => m.ProgressPageModule)
  },
  {
    path: 'mini-games',
    loadChildren: () => import('./pages/mini-games/mini-games.module').then( m => m.MiniGamesPageModule)
  },
  {
    path: 'memory-matching',
    loadChildren: () => import('./pages/memory-matching/memory-matching.module').then( m => m.MemoryMatchingPageModule)
  },
  {
    path: 'color-sequence',
    loadChildren: () => import('./pages/color-sequence/color-sequence.module').then( m => m.ColorSequencePageModule)
  },
  {
    path: 'word-association',
    loadChildren: () => import('./pages/word-association/word-association.module').then( m => m.WordAssociationPageModule)
  },
  {
    path: 'category-match',
    loadChildren: () => import('./pages/category-match/category-match.module').then( m => m.CategoryMatchPageModule)
  },
  {
    path: 'name-that-memory',
    loadChildren: () => import('./pages/name-that-memory/name-that-memory.module').then( m => m.NameThatMemoryPageModule)
  },
  {
    path: 'photo-memories',
    loadChildren: () => import('./pages/photo-memories/photo-memories.module').then( m => m.PhotoMemoriesPageModule)
  },
  {
    path: 'video-memories',
    loadChildren: () => import('./pages/video-memories/video-memories.module').then( m => m.VideoMemoriesPageModule)
  },
  {
    path: 'add-flashcard',
    loadChildren: () => import('./add-flashcard/add-flashcard.module').then( m => m.AddFlashcardPageModule)
  },
  { path: 'category/:id', loadChildren: () => import('./pages/custom-category/custom-category.module').then(m => m.CustomCategoryModule) },
  {
    path: 'options',
    loadChildren: () => import('./pages/options/options.module').then( m => m.OptionsPageModule)
  }




];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }

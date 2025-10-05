import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { FirebaseService } from '../../services/firebase.service';

@Component({
  selector: 'app-progress',
  templateUrl: './progress.page.html',
  styleUrls: ['./progress.page.scss'],
  standalone: false
})
export class ProgressPage implements OnInit {
  @ViewChild('accuracyChart', { static: false }) accuracyChart!: ElementRef;

  selectedPeriod: string = 'today';
  customStartDate: string = '';
  customEndDate: string = '';
  isPatientMode = false;
  
  chart: any;
  chartLoaded = false;
  isLoading = true;

  // Add Firebase connection status properties
  isFirebaseConnected: boolean = false;
  dataSource: string = 'Loading...';

  overallStats = {
    accuracy: 0,
    avgTimePerCard: 0,
    totalCards: 0,
    skippedCards: 0
  };

  categoryStats: any[] = [
    { name: 'People',        icon: '👤', accuracy: 0, cardsPlayed: 0, avgTime: 0 },
    { name: 'Places',        icon: '📍', accuracy: 0, cardsPlayed: 0, avgTime: 0 },
    { name: 'Objects',       icon: '📦', accuracy: 0, cardsPlayed: 0, avgTime: 0 },
    { name: 'Category Match',icon: '🧩', accuracy: 0, cardsPlayed: 0, avgTime: 0 }
  ];

  recentSessions: any[] = [];
  insights: any[] = [];
  hasDataForPeriod: boolean = false;

  constructor(private firebaseService: FirebaseService) {}

  async ngOnInit() {
    await this.loadChartJS();
    await this.loadProgressData();
    this.generateInsights();
    if (this.chartLoaded) {
      await this.createChart();
    }
  }

  async loadChartJS() {
    try {
      // Check if Chart.js is already loaded
      if ((window as any).Chart) {
        this.chartLoaded = true;
        console.log('📈 Chart.js already loaded');
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
      script.onload = () => {
        this.chartLoaded = true;
        console.log('📈 Chart.js loaded successfully');
      };
      script.onerror = () => {
        console.error('Failed to load Chart.js');
        this.chartLoaded = false;
      };
      document.head.appendChild(script);
    } catch (error) {
      console.error('Failed to load Chart.js:', error);
      this.chartLoaded = false;
    }
  }

  async loadProgressData() {
    try {
      console.log('📊 Loading progress data...');
      this.isLoading = true;
      
      // Always try Firebase first
      try {
        console.log('📊 Loading from Firebase...');
        const sessions = await this.firebaseService.getUserGameSessions();
        console.log(`📊 Found ${sessions.length} Firebase sessions`);
        
        if (sessions.length > 0) {
          this.calculateOverallStats(sessions);
          this.calculateCategoryStats(sessions);
          this.loadRecentSessions(sessions);
          this.dataSource = 'Firebase';
          this.isFirebaseConnected = true;
          this.isLoading = false;
          return;
        }
      } catch (firebaseError) {
        console.log('📊 Firebase not available, trying localStorage...');
        this.isFirebaseConnected = false;
      }
      
      // Fallback to localStorage (scoped per-user to avoid leakage)
      console.log('📊 Loading from localStorage...');
      const uid = localStorage.getItem('userId');
      const localData = uid ? localStorage.getItem(`gameSessions:${uid}`) : null;
      if (localData) {
        const sessions = JSON.parse(localData);
        console.log(`📊 Found ${sessions.length} localStorage sessions`);
        
        this.calculateOverallStats(sessions);
        this.calculateCategoryStats(sessions);
        this.loadRecentSessions(sessions);
        this.dataSource = 'Local Storage';
      } else {
        console.log('📊 No progress data found - user needs to play games first');
        this.dataSource = 'No Data';
      }
      
      this.isLoading = false;
    } catch (error) {
      console.error('Error loading progress data:', error);
      this.dataSource = 'Error';
      this.isLoading = false;
    }
  }

  calculateOverallStats(sessions: any[]) {
    if (sessions.length === 0) {
      this.overallStats = {
        accuracy: 0,
        avgTimePerCard: 0,
        totalCards: 0,
        skippedCards: 0
      };
      return;
    }

    const totalQuestions = sessions.reduce((sum, s) => sum + s.totalQuestions, 0);
    const totalCorrect = sessions.reduce((sum, s) => sum + s.correctAnswers, 0);
    const totalTime = sessions.reduce((sum, s) => sum + s.totalTime, 0);
    const totalSkipped = sessions.reduce((sum, s) => sum + s.skipped, 0);

    this.overallStats = {
      accuracy: Math.round((totalCorrect / totalQuestions) * 100) || 0,
      avgTimePerCard: Math.round(totalTime / totalQuestions) || 0,
      totalCards: totalQuestions,
      skippedCards: totalSkipped
    };

    console.log(`📊 Overall Stats: ${totalCorrect}/${totalQuestions} = ${this.overallStats.accuracy}%`);
    console.log(`📊 Sessions used for overall:`, sessions.length);
  }

  calculateCategoryStats(sessions: any[]) {
    // Reset baseline
    this.categoryStats = [
      { name: 'People',        icon: '👤', accuracy: 0, cardsPlayed: 0, avgTime: 0 },
      { name: 'Places',        icon: '📍', accuracy: 0, cardsPlayed: 0, avgTime: 0 },
      { name: 'Objects',       icon: '📦', accuracy: 0, cardsPlayed: 0, avgTime: 0 },
      { name: 'Category Match',icon: '🧩', accuracy: 0, cardsPlayed: 0, avgTime: 0 }
    ];

    const byName = (name: string) => this.categoryStats.find(c => c.name === name)!;

    const accumulate = (catName: string, sArr: any[]) => {
      if (sArr.length === 0) return;
      let totalQuestions = 0, totalCorrect = 0, totalTime = 0;
      sArr.forEach(s => {
        totalQuestions += s.totalQuestions || 0;
        totalCorrect  += s.correctAnswers || 0;
        totalTime     += s.totalTime || 0;
      });
      const row = byName(catName);
      row.cardsPlayed = totalQuestions;
      row.accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
      row.avgTime = totalQuestions > 0 ? Math.round(totalTime / totalQuestions) : 0;
    };

    const norm = (s: any) => (s.category || '').toLowerCase();
    const peopleSessions  = sessions.filter(s => norm(s) === 'people'  || norm(s) === 'name-that-memory-people');
    const placesSessions  = sessions.filter(s => norm(s) === 'places'  || norm(s) === 'name-that-memory-places');
    const objectsSessions = sessions.filter(s => norm(s) === 'objects' || norm(s) === 'name-that-memory-objects');
    const cmSessions      = sessions.filter(s => norm(s) === 'category-match');

    accumulate('People', peopleSessions);
    accumulate('Places', placesSessions);
    accumulate('Objects', objectsSessions);
    accumulate('Category Match', cmSessions);
  }

  loadRecentSessions(sessions: any[]) {
    if (sessions.length === 0) {
      console.log('📊 No quiz sessions found - user needs to take quizzes first');
      this.recentSessions = [];
      return;
    }

    this.recentSessions = sessions
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5)
      .map(session => ({
        date: new Date(session.timestamp),
        category: this.formatCategoryName(session.category),
        accuracy: Math.round((session.correctAnswers / session.totalQuestions) * 100),
        correctAnswers: session.correctAnswers,
        totalQuestions: session.totalQuestions,
        duration: Math.round(session.totalTime / 60),
        skipped: session.skipped
      }));

    console.log(`📊 Loaded ${this.recentSessions.length} recent sessions`);
  }

  private formatCategoryName(category: string): string {
    if (!category) return 'Unknown';

    // Handle special cases
    if (category.toLowerCase() === 'category-match') {
      return 'Category Match';
    }

    // Handle hyphenated names
    return category
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  async createChart() {
    if (!this.accuracyChart || !this.chartLoaded || !(window as any).Chart) {
      console.log('Chart creation skipped - missing requirements');
      return;
    }

    try {
      const ctx = this.accuracyChart.nativeElement.getContext('2d');
      const chartData = await this.getChartData();

      // Destroy existing chart if it exists
      if (this.chart) {
        this.chart.destroy();
      }

      this.chart = new (window as any).Chart(ctx, {
        type: 'line',
        data: chartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'bottom'
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              ticks: {
                callback: function(value: any) {
                  return value + '%';
                }
              }
            }
          },
          elements: {
            line: {
              tension: 0.4
            }
          }
        }
      });
      
      console.log('📈 Chart created successfully');
    } catch (error) {
      console.error('Error creating chart:', error);
    }
  }

  async getChartData() {
    console.log(`📈 Getting chart data for period: ${this.selectedPeriod}`);
    console.log(`📈 Data source: ${this.dataSource}`);
    console.log(`📈 Firebase connected: ${this.isFirebaseConnected}`);      

    try {
      // Get filtered sessions based on selected period
      const allSessions = await this.getGameSessionData();
      if (allSessions.length === 0) {
        console.log('📈 No data for selected period');
        this.hasDataForPeriod = false;
        return {
          labels: ['No Data'],
          datasets: [
            { label: 'People', data: [0], borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.2)' },
            { label: 'Places', data: [0], borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.2)' },
            { label: 'Objects', data: [0], borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.2)' },
            { label: 'Category Match', data: [0], borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.2)' }
          ]
        };
      }

      console.log(`📈 Found ${allSessions.length} sessions for chart`);

      // Build per-category datasets
      const cats = [
        { key: 'people', label: 'People', color: '#3b82f6' },
        { key: 'places', label: 'Places', color: '#10b981' },
        { key: 'objects', label: 'Objects', color: '#f59e0b' },
        { key: 'category-match', label: 'Category Match', color: '#ef4444' }
      ];

      // Create date range and map label formatting
      const dateRange = this.getChartDateRange(allSessions);
      const labels = dateRange.map(date => {
        const d = new Date(date);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      });

      const datasets = cats.map(cat => {
        const catSessions = allSessions.filter(s => ((s.category || '').toLowerCase()) === cat.key
          || (cat.key !== 'category-match' && (s.category || '').toLowerCase() === `name-that-memory-${cat.key}`));
        const grouped = this.groupSessionsByDate(catSessions);
        const data = dateRange.map(date => {
          const dayData = grouped[date] || [];
          if (dayData.length === 0) return 0;
          const totalCorrect = dayData.reduce((sum: number, session: any) => sum + (session.correctAnswers || 0), 0);
          const totalQuestions = dayData.reduce((sum: number, session: any) => sum + (session.totalQuestions || 0), 0);
          return totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
        });
        return {
          label: cat.label,
          data,
          borderColor: cat.color,
          backgroundColor: `${cat.color}33`, // translucent fill
          fill: false,
          tension: 0.4
        } as any;
      });

      const chartData = { labels, datasets };

      console.log('📈 Chart data generated:', chartData);
      this.hasDataForPeriod = true;
      return chartData;
    } catch (error) {
      console.error('Error generating chart data:', error);
      return { labels: ['Error'], datasets: [] } as any;
    }
  }

  getChartDateRange(filteredSessions: any[]): string[] {
    const { start, end } = this.getDateRange();
    console.log(`📈 Date range for ${this.selectedPeriod}: ${start.toISOString()} to ${end.toISOString()}`);
    
    const dates: string[] = [];
    const groupedData = this.groupSessionsByDate(filteredSessions);
    
    // Generate date labels based on period
    if (this.selectedPeriod === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dates.push(today.toISOString().split('T')[0]);
    } else if (this.selectedPeriod === 'week') {
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        dates.push(date.toISOString().split('T')[0]);
      }
    } else if (this.selectedPeriod === 'month') {
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        dates.push(date.toISOString().split('T')[0]);
      }
    } else if (this.selectedPeriod === 'custom') {
      const startDate = new Date(this.customStartDate);
      const endDate = new Date(this.customEndDate);
      const currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        dates.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
      }
    } else if (this.selectedPeriod === 'all') {
      // Get all unique dates from sessions
      const uniqueDates = [...new Set(filteredSessions.map(s => 
        new Date(s.timestamp).toISOString().split('T')[0]
      ))].sort();
      dates.push(...uniqueDates);
    }
    
    return dates;
  }

  groupSessionsByDate(sessions: any[]) {
    const grouped: { [key: string]: any[] } = {};
    
    sessions.forEach(session => {
      const date = new Date(session.timestamp).toISOString().split('T')[0];
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(session);
    });
    
    return grouped;
  }

  async updateChart() {
    if (this.chart) {
      console.log('📈 Updating chart for period:', this.selectedPeriod);    
      const chartData = await this.getChartData();
      
      this.chart.data.labels = chartData.labels;
      this.chart.data.datasets[0].data = chartData.data;
      this.chart.update('active'); // Force animation update
    }
  }

  async forceRefresh() {
    console.log('🔄 Force refreshing progress data...');
    
    try {
      // Clear localStorage cache
      localStorage.removeItem('gameSessions');
      
      // Reload from Firebase
      const localData = localStorage.getItem('gameSessions');
      if (localData) {
        const sessions = JSON.parse(localData);
        console.log(`🔄 Found ${sessions.length} cached sessions`);
      }
      
      // Reload all data
      await this.loadProgressData();
      this.generateInsights();
      
      if (this.chart) {
        await this.updateChart();
      }
      
      console.log('✅ Progress data refreshed');
    } catch (error) {
      console.error('❌ Error refreshing progress data:', error);
    }
  }

  generateInsights() {
    this.insights = [];

    // Overall accuracy insight
    if (this.overallStats.accuracy >= 80) {
      this.insights.push({
        icon: '🎯',
        title: 'Excellent Accuracy',
        message: `Great job! Your accuracy of ${this.overallStats.accuracy}% shows strong memory retention.`
      });
    } else if (this.overallStats.accuracy >= 60) {
      this.insights.push({
        icon: '👍',
        title: 'Good Progress',
        message: `You're doing well with ${this.overallStats.accuracy}% accuracy. Keep practicing!`
      });
    } else if (this.overallStats.accuracy > 0) {
      this.insights.push({
        icon: '💪',
        title: 'Keep Practicing',
        message: 'Practice makes perfect! Try focusing on accuracy over speed.'
      });
    }

    // Time insight
    if (this.overallStats.avgTimePerCard > 10) {
      this.insights.push({
        icon: '⏰',
        title: 'Take Your Time',
        message: 'No rush! Taking time to think helps with memory formation.'
      });
    }

    // Category insight
    if (this.categoryStats.length > 0) {
      const bestCategory = this.categoryStats.reduce((best, current) => 
        current.accuracy > best.accuracy ? current : best
      );
      
      if (bestCategory.accuracy > 0) {
        this.insights.push({
          icon: '🌟',
          title: 'Strongest Category',
          message: `You excel at ${bestCategory.name} with ${bestCategory.accuracy}% accuracy!`
        });
      }
    }
  }

  getAccuracyClass(accuracy: number): string {
    if (accuracy >= 80) return 'excellent';
    if (accuracy >= 60) return 'good';
    return 'needs-improvement';
  }

  async exportData() {
    try {
      const allData = {
        overallStats: this.overallStats,
        categoryStats: this.categoryStats,
        recentSessions: this.recentSessions,
        exportDate: new Date().toISOString(),
        source: 'firebase'
      };

      const dataStr = JSON.stringify(allData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(dataBlob);
      link.download = `progress-report-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
    } catch (error) {
      console.error('Error exporting data:', error);
    }
  }

  // Static method for other pages to save game sessions
  static async saveGameSession(firebaseService: FirebaseService, sessionData: {
    category: string;
    totalQuestions: number;
    correctAnswers: number;
    skipped: number;
    totalTime: number;
    timestamp?: number;
  }) {
    try {
      const sessionWithTimestamp = {
        ...sessionData,
        timestamp: sessionData.timestamp || Date.now()
      };

      // Save to Firebase
      await firebaseService.saveGameSession(sessionWithTimestamp);
      
      // Also save to localStorage as backup (per-user key)
      const uid = localStorage.getItem('userId');
      const key = uid ? `gameSessions:${uid}` : 'gameSessions';
      const sessions = JSON.parse(localStorage.getItem(key) || '[]');
      sessions.push(sessionWithTimestamp);
      localStorage.setItem(key, JSON.stringify(sessions));
      
    } catch (error) {
      console.error('Error saving game session:', error);
      // Fallback to localStorage only
      const uid = localStorage.getItem('userId');
      const key = uid ? `gameSessions:${uid}` : 'gameSessions';
      const sessions = JSON.parse(localStorage.getItem(key) || '[]');
      sessions.push(sessionData);
      localStorage.setItem(key, JSON.stringify(sessions));
    }
  }


  getDateRange() {
    const now = new Date();
    let start: Date, end: Date;

    switch (this.selectedPeriod) {
      case 'today':
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
        break;
      case 'week':
        start = new Date(now);
        start.setDate(start.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
        break;
      case 'month':
        start = new Date(now);
        start.setDate(start.getDate() - 29);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
        break;
      case 'custom':
        start = new Date(this.customStartDate);
        end = new Date(this.customEndDate);
        break;
      case 'all':
        start = new Date(0);
        end = new Date();
        break;
      default:
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
    }

    return { start, end };
  }

  async getGameSessionData() {
    try {
      if (this.isFirebaseConnected) {
        const allSessions = await this.firebaseService.getUserGameSessions();
        return this.filterSessionsByPeriod(allSessions);
      } else {
        const localData = localStorage.getItem('gameSessions');
        if (localData) {
          const sessions = JSON.parse(localData);
          return this.filterSessionsByPeriod(sessions);
        }
      }
    } catch (error) {
      console.error('Error getting game session data:', error);
    }
    return [];
  }

  filterSessionsByPeriod(sessions: any[]) {
    const { start, end } = this.getDateRange();
    return sessions.filter(session => {
      const sessionDate = new Date(session.timestamp);
      return sessionDate >= start && sessionDate <= end;
    });
  }

  onPeriodChange() {
    this.updateChart();
  }

  onCustomDateChange() {
    if (this.customStartDate && this.customEndDate) {
      this.updateChart();
    }
  }

  togglePatientMode() {
    this.isPatientMode = !this.isPatientMode;
    console.log('Patient mode toggled:', this.isPatientMode);
  }
}
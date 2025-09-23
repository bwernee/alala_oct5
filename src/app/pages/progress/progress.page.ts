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

  categoryStats = [
    {
      name: 'People',
      icon: '👨‍👩‍👧‍👦',
      accuracy: 0,
      cardsPlayed: 0,
      avgTime: 0
    },
    {
      name: 'Places',
      icon: '🏡',
      accuracy: 0,
      cardsPlayed: 0,
      avgTime: 0
    },
    {
      name: 'Objects',
      icon: '🧸',
      accuracy: 0,
      cardsPlayed: 0,
      avgTime: 0
    },
    {
      name: 'Category Match',
      icon: '🎯',
      accuracy: 0,
      cardsPlayed: 0,
      avgTime: 0
    }
  ];

  recentSessions: any[] = [];
  insights: any[] = [];
  hasDataForPeriod: boolean = false;

  constructor(private firebaseService: FirebaseService) {}

  async ngOnInit() {
    await this.loadChartJS();
    await this.checkFirebaseConnection();
    await this.loadProgressData();
    this.generateInsights();

    if (this.chartLoaded) {
      setTimeout(() => {
        this.createChart();
      }, 100);
    }
  }

  async ionViewDidEnter() {
    // Reload all data when user returns to this page (e.g., after playing a quiz)
    console.log('📈 View entered, reloading all progress data');
    await this.loadProgressData();
    this.generateInsights();

    // Update chart with fresh data
    if (this.chartLoaded && this.chart) {
      console.log('📈 Updating chart with fresh data');
      this.updateChart();
    }
  }

  async loadChartJS() {
    try {
      const chartModule = await import('chart.js');
      const { Chart, registerables } = chartModule;
      Chart.register(...registerables);
      (window as any).Chart = Chart;
      this.chartLoaded = true;
    } catch (error) {
      console.warn('Chart.js not available, charts will be disabled');
      this.chartLoaded = false;
    }
  }

  togglePatientMode() {
    this.isPatientMode = !this.isPatientMode;
  }

  async checkFirebaseConnection() {
    try {
      const user = this.firebaseService.getCurrentUser();
      if (user) {
        // Try to fetch a small amount of data to test connection
        await this.firebaseService.getUserGameSessions();
        this.isFirebaseConnected = true;
        this.dataSource = 'Firebase (Cloud)';
        console.log('✅ Firebase connection successful');
      } else {
        this.isFirebaseConnected = false;
        this.dataSource = 'Local Storage (Offline)';
        console.log('❌ No authenticated user');
      }
    } catch (error) {
      this.isFirebaseConnected = false;
      this.dataSource = 'Local Storage (Offline)';
      console.error('❌ Firebase connection failed:', error);
    }
  }

  async onPeriodChange() {
    console.log('Period changed to:', this.selectedPeriod);

    // Set default dates for custom range
    if (this.selectedPeriod === 'custom' && !this.customStartDate) {
      const today = new Date();
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      this.customStartDate = weekAgo.toISOString();
      this.customEndDate = today.toISOString();
    }

    // Reload all data and update chart
    await this.loadProgressData();
    this.generateInsights();

    if (this.chart) {
      await this.updateChart();
    }
  }

  async onCustomDateChange() {
    if (this.customStartDate && this.customEndDate) {
      console.log('Custom date range:', this.customStartDate, 'to', this.customEndDate);
      await this.loadProgressData();
      this.generateInsights();

      if (this.chart) {
        await this.updateChart();
      }
    }
  }

  getDateRange(): { start: Date, end: Date } {
    const now = new Date();
    let start: Date;
    let end: Date = now;

    switch (this.selectedPeriod) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        console.log(`📅 Today filter: ${start.toLocaleDateString()} ${start.toLocaleTimeString()} to ${end.toLocaleDateString()} ${end.toLocaleTimeString()}`);
        break;
      case 'week':
        // Get the next 7 days from today (today + 6 days ahead)
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        end = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
        end.setHours(23, 59, 59, 999);
        console.log(`📅 Week filter: ${start.toLocaleDateString()} to ${end.toLocaleDateString()}`);
        break;
      case 'month':
        // Show the entire current month (from 1st to last day of current month)
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        console.log(`📅 Month filter: ${start.toLocaleDateString()} to ${end.toLocaleDateString()}`);
        break;
      case 'custom':
        if (this.customStartDate) {
          start = new Date(this.customStartDate);
          start.setHours(0, 0, 0, 0); // Start of day
        } else {
          start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        }
        if (this.customEndDate) {
          end = new Date(this.customEndDate);
          end.setHours(23, 59, 59, 999); // End of day
        } else {
          end = now;
        }
        break;
      case 'all':
      default:
        start = new Date(0); // Beginning of time
        break;
    }

    return { start, end };
  }

  async loadProgressData() {
    try {
      this.isLoading = true;
      console.log('📊 Loading progress data...');

      // For now, always use local storage to avoid Firebase issues
      console.log('📊 Using local storage data');
      this.isFirebaseConnected = false;
      this.dataSource = 'Local Storage';
      this.loadLocalProgressData();

    } catch (error) {
      console.error('❌ Error loading progress data:', error);
      this.isFirebaseConnected = false;
      this.dataSource = 'Local Storage (Error)';
      this.loadLocalProgressData();
    } finally {
      this.isLoading = false;
    }
  }

  async getGameSessionData() {
    try {
      // Use local storage data for now
      const allSessions = this.getAllLocalGameSessionData();
      const { start, end } = this.getDateRange();

      // Filter sessions by date range
      const filteredSessions = allSessions.filter((session: any) => {
        // Handle both ISO string timestamps and numeric timestamps
        let sessionDate: Date;
        if (typeof session.timestamp === 'string') {
          sessionDate = new Date(session.timestamp);
        } else if (typeof session.timestamp === 'number') {
          sessionDate = new Date(session.timestamp);
        } else {
          console.warn('Invalid timestamp format:', session.timestamp);
          return false; // Skip this session
        }

        // Check if the date is valid
        if (isNaN(sessionDate.getTime())) {
          console.warn('Invalid date:', session.timestamp);
          return false;
        }

        return sessionDate >= start && sessionDate <= end;
      });

      console.log(`📊 Date range: ${start.toISOString()} to ${end.toISOString()}`);
      console.log(`📊 Filtered ${filteredSessions.length}/${allSessions.length} sessions for ${this.selectedPeriod}`);
      if (filteredSessions.length > 0) {
        console.log('📊 Sample filtered session dates:', filteredSessions.slice(0, 3).map((s: any) => new Date(s.timestamp).toISOString()));
      }

      // Special debugging for today
      if (this.selectedPeriod === 'today') {
        const todayString = new Date().toISOString().split('T')[0];
        const todaySessions = allSessions.filter((s: any) => {
          const sessionDate = new Date(s.timestamp).toISOString().split('T')[0];
          return sessionDate === todayString;
        });
        console.log(`📊 Today (${todayString}) sessions found: ${todaySessions.length}`);
        if (todaySessions.length > 0) {
          console.log('📊 Today session details:', todaySessions.map((s: any) => ({
            timestamp: s.timestamp,
            date: new Date(s.timestamp).toISOString(),
            correct: s.correctAnswers,
            total: s.totalQuestions
          })));
        }
      }
      return filteredSessions;

    } catch (error) {
      console.error('Error loading game sessions:', error);
      return this.getLocalGameSessionData();
    }
  }

  getLocalGameSessionData() {
    try {
      const sessions = localStorage.getItem('gameSessions');
      const allSessions = sessions ? JSON.parse(sessions) : [];

      // Apply the same date filtering as Firebase data
      const { start, end } = this.getDateRange();
      const filteredSessions = allSessions.filter((session: any) => {
        // Handle both ISO string timestamps and numeric timestamps
        let sessionDate: Date;
        if (typeof session.timestamp === 'string') {
          sessionDate = new Date(session.timestamp);
        } else if (typeof session.timestamp === 'number') {
          sessionDate = new Date(session.timestamp);
        } else {
          console.warn('Invalid timestamp format:', session.timestamp);
          return false; // Skip this session
        }

        // Check if the date is valid
        if (isNaN(sessionDate.getTime())) {
          console.warn('Invalid date:', session.timestamp);
          return false;
        }

        return sessionDate >= start && sessionDate <= end;
      });

      console.log(`📊 Local data: Filtered ${filteredSessions.length}/${allSessions.length} sessions for ${this.selectedPeriod}`);
      console.log(`📊 Local date range: ${start.toISOString()} to ${end.toISOString()}`);

      if (filteredSessions.length > 0) {
        console.log('📊 Sample local session dates:', filteredSessions.slice(0, 3).map((s: any) => new Date(s.timestamp).toISOString()));
      }

      return filteredSessions;
    } catch (error) {
      console.error('Error loading local game sessions:', error);
      return [];
    }
  }

  async migrateLocalDataToFirebase(localSessions: any[]) {
    try {
      console.log('Migrating local data to Firebase...');
      for (const session of localSessions) {
        await this.firebaseService.saveGameSession(session);
      }
      console.log('Migration completed successfully');
    } catch (error) {
      console.error('Error migrating data to Firebase:', error);
    }
  }



  loadLocalProgressData() {
    // For overall stats, we want ALL data regardless of period
    const allGameData = this.getAllLocalGameSessionData();
    this.calculateOverallStats(allGameData);
    this.calculateCategoryStats(allGameData);
    this.loadRecentSessions(allGameData);
  }

  getAllLocalGameSessionData() {
    try {
      const sessions = localStorage.getItem('gameSessions');
      return sessions ? JSON.parse(sessions) : [];
    } catch (error) {
      console.error('Error loading all local game sessions:', error);
      return [];
    }
  }

  async saveProgressSummary() {
    try {
      const progressSummary = {
        overallStats: this.overallStats,
        categoryStats: this.categoryStats,
        lastCalculated: new Date().toISOString()
      };
      
      await this.firebaseService.saveUserProgress(progressSummary);
    } catch (error) {
      console.error('Error saving progress summary:', error);
    }
  }

  calculateOverallStats(sessions: any[]) {
    if (sessions.length === 0) {
      this.overallStats = { accuracy: 0, avgTimePerCard: 0, totalCards: 0, skippedCards: 0 };
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
    // Reset all categories to 0 first
    this.categoryStats.forEach(category => {
      category.cardsPlayed = 0;
      category.accuracy = 0;
      category.avgTime = 0;
    });

    // Only calculate stats for categories that have actual data
    this.categoryStats.forEach(category => {
      const categoryName = category.name.toLowerCase();

      // Get sessions for this specific category
      const categorySessions = sessions.filter(s => {
        const sessionCategory = s.category?.toLowerCase() || '';

        // Match exact category names or name-that-memory with specific categories
        if (categoryName === 'people') {
          return sessionCategory === 'people' || sessionCategory === 'name-that-memory-people';
        } else if (categoryName === 'places') {
          return sessionCategory === 'places' || sessionCategory === 'name-that-memory-places';
        } else if (categoryName === 'objects') {
          return sessionCategory === 'objects' || sessionCategory === 'name-that-memory-objects';
        } else if (categoryName === 'category match') {
          // Include category-match sessions for the Category Match category
          console.log(`📊 Checking category-match session: ${sessionCategory}`);
          return sessionCategory === 'category-match';
        }

        return sessionCategory === categoryName;
      });

      // Only calculate if there are actual sessions for this category
      if (categorySessions.length > 0) {
        let totalQuestions = 0;
        let totalCorrect = 0;
        let totalTime = 0;

        categorySessions.forEach(session => {
          totalQuestions += session.totalQuestions || 0;
          totalCorrect += session.correctAnswers || 0;
          totalTime += session.totalTime || 0;
        });

        category.cardsPlayed = totalQuestions;
        category.accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
        category.avgTime = totalQuestions > 0 ? Math.round(totalTime / totalQuestions) : 0;

        console.log(`📊 ${category.name}: ${totalCorrect}/${totalQuestions} = ${category.accuracy}%`);
      }
      // If no sessions for this category, stats remain 0
    });

    console.log('📊 Category stats:', this.categoryStats.map(c => `${c.name}: ${c.cardsPlayed} cards, ${c.accuracy}%`));
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
      console.log('Chart creation failed - missing requirements');
      return;
    }

    const ctx = this.accuracyChart.nativeElement.getContext('2d');
    const chartData = await this.getChartData();

    // Destroy existing chart if it exists
    if (this.chart) {
      this.chart.destroy();
    }

    this.chart = new (window as any).Chart(ctx, {
      type: 'line',
      data: {
        labels: chartData.labels,
        datasets: [{
          label: 'Accuracy %',
          data: chartData.data,
          borderColor: '#667eea',
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#667eea',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: function(value: any) {
                return value + '%';
              }
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.1)'
            }
          },
          x: {
            grid: {
              color: 'rgba(0, 0, 0, 0.1)'
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#ffffff',
            bodyColor: '#ffffff',
            borderColor: '#667eea',
            borderWidth: 1,
            callbacks: {
              label: function(context: any) {
                if (context.parsed.y === 0) {
                  return 'No quiz sessions for this date';
                }
                return `Accuracy: ${context.parsed.y}%`;
              }
            }
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        },
        elements: {
          point: {
            hoverRadius: 8
          }
        }
      }
    });

    console.log('📈 Chart created successfully');
  }

  async getChartData() {
    console.log(`📈 Getting chart data for period: ${this.selectedPeriod}`);
    console.log(`📈 Data source: ${this.dataSource}`);
    console.log(`📈 Firebase connected: ${this.isFirebaseConnected}`);

    // Get sessions filtered by the selected period (same as stats)
    const filteredSessions = await this.getGameSessionData();
    console.log(`📈 Filtered sessions: ${filteredSessions.length}`);

    if (filteredSessions.length > 0) {
      console.log(`📈 Sample session data:`, filteredSessions.slice(0, 2).map((s: any) => ({
        timestamp: s.timestamp,
        date: new Date(s.timestamp).toISOString(),
        correct: s.correctAnswers,
        total: s.totalQuestions
      })));
    }

    // Always get the appropriate date range, even if no data
    const dateRange = this.getChartDateRange(filteredSessions);
    console.log(`📈 Date range: ${dateRange}`);

    if (dateRange.length === 0) {
      console.log('📈 No date range, returning empty chart');
      return { labels: [], data: [] };
    }

    // Group sessions by date
    const groupedData = this.groupSessionsByDate(filteredSessions);
    console.log(`📈 Grouped data keys: ${Object.keys(groupedData)}`);

    const chartData = {
      labels: dateRange.map(date => {
        // Parse the date string properly to avoid timezone issues
        const [year, month, day] = date.split('-').map(Number);
        const d = new Date(year, month - 1, day); // month is 0-indexed
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }),
      data: dateRange.map(date => {
        const sessions = groupedData[date];
        if (!sessions || sessions.length === 0) {
          console.log(`📈 ${date}: No sessions found - showing 0%`);
          return 0; // Show 0% when no data for better visualization
        }
        const totalQuestions = sessions.reduce((sum: number, s: any) => sum + s.totalQuestions, 0);
        const totalCorrect = sessions.reduce((sum: number, s: any) => sum + s.correctAnswers, 0);
        const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
        console.log(`📈 ${date}: ${totalCorrect}/${totalQuestions} = ${accuracy}%`);
        return accuracy;
      })
    };

    // Always show chart regardless of data availability
    this.hasDataForPeriod = true;
    console.log(`📈 Final chart data:`, chartData);
    return chartData;
  }



  getChartDateRange(filteredSessions: any[]): string[] {
    const { start, end } = this.getDateRange();
    console.log(`📈 Date range for ${this.selectedPeriod}: ${start.toISOString()} to ${end.toISOString()}`);

    // Group the filtered sessions to see what dates have data
    const groupedData = this.groupSessionsByDate(filteredSessions);
    const hasDataDates = Object.keys(groupedData).sort((a, b) =>
      new Date(a).getTime() - new Date(b).getTime()
    );

    if (this.selectedPeriod === 'today') {
      // Use local date to avoid timezone issues
      const todayDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
      console.log(`📈 Today chart date: ${todayDate}`);
      console.log(`📈 Start date object: ${start.toString()}`);
      console.log(`📈 Sessions for today: ${hasDataDates.includes(todayDate) ? 'YES' : 'NO'}`);
      return [todayDate];
    } else if (this.selectedPeriod === 'week') {
      // Show all 7 days of the week (from start to end)
      const weekDates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        weekDates.push(dateStr);
      }
      console.log(`📈 Week dates: ${weekDates}`);
      return weekDates;
    } else if (this.selectedPeriod === 'month') {
      // Show all days of the current month (like week filter but for entire month)
      const monthDates: string[] = [];
      const current = new Date(start);
      while (current <= end) {
        const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
        monthDates.push(dateStr);
        current.setDate(current.getDate() + 1);
      }
      console.log(`📈 Month dates: ${monthDates.length} days from ${monthDates[0]} to ${monthDates[monthDates.length - 1]}`);
      return monthDates;
    } else if (this.selectedPeriod === 'custom') {
      // For custom, show all dates in the range that have data, or the range itself if no data
      if (hasDataDates.length > 0) {
        return hasDataDates;
      } else {
        // Show the custom date range even if no data
        const customDates: string[] = [];
        const current = new Date(start);
        while (current <= end) {
          const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
          customDates.push(dateStr);
          current.setDate(current.getDate() + 1);
        }
        return customDates.slice(0, 31); // Limit to 31 days for performance
      }
    } else if (this.selectedPeriod === 'all') {
      // Show all dates that have data
      return hasDataDates;
    }

    return hasDataDates;
  }



  groupSessionsByDate(sessions: any[]) {
    const grouped: { [key: string]: any[] } = {};

    sessions.forEach(session => {
      // Handle both ISO string timestamps and numeric timestamps
      let sessionDate: Date;
      if (typeof session.timestamp === 'string') {
        sessionDate = new Date(session.timestamp);
      } else if (typeof session.timestamp === 'number') {
        sessionDate = new Date(session.timestamp);
      } else {
        console.warn('Invalid timestamp format:', session.timestamp);
        return; // Skip this session
      }

      // Use a consistent date format for grouping
      const dateKey = sessionDate.toISOString().split('T')[0]; // YYYY-MM-DD format

      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(session);
    });

    return grouped;
  }

  async updateChart() {
    if (this.chart) {
      console.log('📈 Updating chart for period:', this.selectedPeriod);
      const chartData = await this.getChartData();
      console.log('📈 Chart data received:', chartData);

      this.chart.data.labels = chartData.labels;
      this.chart.data.datasets[0].data = chartData.data;
      this.chart.update('active'); // Force animation update

      console.log('📈 Chart updated successfully with', chartData.labels.length, 'data points');
    } else {
      console.warn('📈 Chart not initialized yet');
    }
  }

  // Force refresh all data and chart (useful for debugging)
  async forceRefresh() {
    console.log('🔄 Force refreshing all data...');

    // Debug: Check what's in localStorage
    const localData = localStorage.getItem('gameSessions');
    if (localData) {
      const sessions = JSON.parse(localData);
      console.log(`🔍 LocalStorage has ${sessions.length} sessions:`);
      sessions.forEach((s: any, i: number) => {
        const sessionDate = new Date(s.timestamp);
        console.log(`  ${i + 1}. ${sessionDate.toISOString()} (${sessionDate.toLocaleDateString()}) - ${s.correctAnswers}/${s.totalQuestions} (${s.category})`);
      });

      // Check today's date
      const today = new Date();
      const todayString = today.toISOString().split('T')[0];
      console.log(`🔍 Today is: ${todayString} (${today.toLocaleDateString()})`);

      // Check for today's sessions
      const todaySessions = sessions.filter((s: any) => {
        const sessionDate = new Date(s.timestamp).toISOString().split('T')[0];
        return sessionDate === todayString;
      });
      console.log(`🔍 Today's sessions: ${todaySessions.length}`);

    } else {
      console.log('🔍 No data in localStorage');
    }

    await this.loadProgressData();
    this.generateInsights();
    if (this.chart) {
      await this.updateChart();
    }
  }

  generateInsights() {
    this.insights = [];

    // Accuracy insight
    if (this.overallStats.accuracy >= 80) {
      this.insights.push({
        icon: '🎉',
        title: 'Excellent Performance!',
        message: `Great job! Your accuracy of ${this.overallStats.accuracy}% shows strong memory retention.`
      });
    } else if (this.overallStats.accuracy >= 60) {
      this.insights.push({
        icon: '👍',
        title: 'Good Progress',
        message: `You're doing well with ${this.overallStats.accuracy}% accuracy. Keep practicing!`
      });
    } else {
      this.insights.push({
        icon: '💪',
        title: 'Room for Improvement',
        message: 'Consider reviewing cards more frequently to improve recognition.'
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
      
      // Also save to localStorage as backup
      const sessions = JSON.parse(localStorage.getItem('gameSessions') || '[]');
      sessions.push(sessionWithTimestamp);
      localStorage.setItem('gameSessions', JSON.stringify(sessions));
      
    } catch (error) {
      console.error('Error saving game session:', error);
      // Fallback to localStorage only
      const sessions = JSON.parse(localStorage.getItem('gameSessions') || '[]');
      sessions.push(sessionData);
      localStorage.setItem('gameSessions', JSON.stringify(sessions));
    }
  }

  // Add this method for testing
  async testFirebaseConnection() {
    try {
      console.log('🧪 Testing Firebase connection...');
      
      // Test saving a session
      const testSession = {
        category: 'test',
        totalQuestions: 1,
        correctAnswers: 1,
        totalTime: 10,
        skipped: 0,
        timestamp: Date.now()
      };
      
      await this.firebaseService.saveGameSession(testSession);
      console.log('✅ Test session saved to Firebase');
      
      // Test loading sessions
      const sessions = await this.firebaseService.getUserGameSessions();
      console.log('✅ Sessions loaded from Firebase:', sessions.length);
      
      alert('Firebase connection test successful! Check console for details.');
      
    } catch (error) {
      console.error('❌ Firebase test failed:', error);
      alert('Firebase connection test failed! Check console for details.');
    }
  }
}











import { Component, OnInit, OnDestroy, signal, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef, AfterViewChecked, DoCheck } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { CommonModule, NgClass } from '@angular/common';
import { Router } from '@angular/router';
import { DataFlowService } from '../../services/data-flow.service';
import { ApiService } from '../../services/api.service';
import { NavigationService } from '../../services/navigation.service';
import { PlotlyService } from '../../services/plotly.service';
import { AnalysisRequest, AnalysisResult } from '../../models/interfaces';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [
    CommonModule,
    NgClass,
    MatTableModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    FormsModule
  ],
  template: `
    <div class="content-wrapper">
      @if (loading()) {
        <div class="loading-state">
          <div class="spinner"></div>
          <h2>Analisi in corso...</h2>
          <p>I tuoi dati sono in elaborazione</p>
          @if (analysisId()) {
            <div class="analysis-info">
              <p><strong>ID Analisi:</strong> {{ analysisId() }}</p>
              <p><strong>Stato:</strong> {{ getStatusDisplayName(analysisStatus()) }}</p>
            </div>
          }
        </div>
      } @else if (error()) {
        <div class="error-state">
          <div class="error-icon">⚠</div>
          <h2>Errore durante l'analisi</h2>
          <p>{{ error() }}</p>
          <button class="retry-btn" (click)="retryAnalysis()">Riprova</button>
        </div>
      } @else if (resultsReady() && !showResults()) {
        <div class="results-ready-state">
          <div class="ready-icon">✅</div>
          <h2>Analisi Completata!</h2>
          <p>I risultati della tua analisi sono pronti per essere visualizzati.</p>
          @if (analysisId()) {
            <div class="analysis-info">
              <p><strong>ID Analisi:</strong> {{ analysisId() }}</p>
            </div>
          }
          <button class="view-results-btn" (click)="viewResults()">
            Visualizza Risultati
          </button>
        </div>
      } @else if (results() && showResults()) {
        <div class="results-content">
          <div class="page-header">
            <h1>Risultati dell'Analisi</h1>
            <p>Ecco i risultati delle tue analisi</p>
          </div>

          <!-- Main Section Navigation -->
          <div class="section-navigation">
            <ul class="section-tabs">
              <li class="section-tab" [class.active]="selectedSection === 'bivariate'" (click)="selectSection('bivariate')">
                <span class="section-icon">📊</span>
                <span class="section-label">Analisi Bivariate</span>
                <span class="section-count">({{ getBivariateTests().length }})</span>
              </li>
              <li class="section-tab" [class.active]="selectedSection === 'multivariate'" (click)="selectSection('multivariate')">
                <span class="section-icon">🔬</span>
                <span class="section-label">Analisi Multivariate</span>
                <span class="section-count">({{ getMultivariateTests().length }})</span>
              </li>
              <li class="section-tab" [class.active]="selectedSection === 'summary'" (click)="selectSection('summary')">
                <span class="section-icon">📋</span>
                <span class="section-label">Riepilogo</span>
              </li>
            </ul>
          </div>

          <!-- Bivariate Tests Section -->
          @if (selectedSection === 'bivariate' && getBivariateTests().length > 0) {
            <div class="test-section">
              <div class="section-header">
                <h2>Analisi Bivariate</h2>
                <p>Test di correlazione e associazione tra variabili</p>
              </div>
              <div class="test-tabset">
                <ul class="test-tabs">
                  @for (testKey of getBivariateTests(); track testKey) {
                    <li class="test-tab" [class.active]="selectedBivariateTab === testKey" (click)="selectBivariateTab(testKey)">
                      {{ getTestDisplayName(testKey) }}
                    </li>
                  }
                </ul>
                <div class="test-tab-content">
                  @if (selectedBivariateTab) {
                    <!-- Linear Regression Special Layout -->
                    @if (isLinearRegressionTest(selectedBivariateTab)) {
                      <div class="test-card">
                        <h3>{{ getTestDisplayName(selectedBivariateTab) }}</h3>
                        
                        <!-- Linear Regression Formula -->
                        @if (getLinearRegressionFormula(selectedBivariateTab)) {
                          <div class="regression-formula">
                            <h4>Formula del Modello</h4>
                            <div class="formula-display">
                              {{ getLinearRegressionFormula(selectedBivariateTab) }}
                            </div>
                          </div>
                        }
                        
                        <!-- Main Linear Regression Results -->
                        <div class="regression-section">
                          <h4>Risultati Regressione Lineare</h4>
                          <div class="test-layout" style="display: flex; gap: 32px; align-items: flex-start;">
                            <div class="test-table" style="flex: 2;">
                              <table mat-table [dataSource]="tableDataSource" matSort #sort="matSort" class="mat-elevation-z1" style="width: 100%;">
                                <!-- Dynamic Columns -->
                                @for (column of displayedColumns; track column) {
                                  <ng-container [matColumnDef]="column">
                                    <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ getColumnDisplayName(column) }}</th>
                                    <td mat-cell *matCellDef="let row" [style.text-align]="isNumericColumn(column) ? 'right' : 'left'">
                                      {{ formatCellValue(row[column], column) }}
                                    </td>
                                  </ng-container>
                                }
                                <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                                <tr mat-row *matRowDef="let row; columns: displayedColumns;" [ngClass]="getRowClass(row)"></tr>
                              </table>
                              <mat-paginator [pageSize]="10" [pageSizeOptions]="[5, 10, 25, 50]" showFirstLastButtons></mat-paginator>
                            </div>
                            <div class="manhattan-plot" [attr.id]="'manhattan-plot-' + selectedBivariateTab" style="flex: 1; min-width: 300px; height: 400px;"></div>
                          </div>
                        </div>
                        
                        <!-- Results without Influentials (if present) -->
                        @if (hasInfluentialRemovedData(selectedBivariateTab)) {
                          <div class="regression-section">
                            <h4>Risultati senza Valori Influenti</h4>
                            <div class="test-layout" style="display: flex; gap: 32px; align-items: flex-start;">
                              <div class="test-table" style="flex: 2;">
                                <table mat-table [dataSource]="influentialRemovedDataSource" matSort #influentialSort="matSort" class="mat-elevation-z1" style="width: 100%;">
                                  <!-- Dynamic Columns for influential removed data -->
                                  @for (column of influentialRemovedColumns; track column) {
                                    <ng-container [matColumnDef]="column">
                                      <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ getColumnDisplayName(column) }}</th>
                                      <td mat-cell *matCellDef="let row" [style.text-align]="isNumericColumn(column) ? 'right' : 'left'">
                                        {{ formatCellValue(row[column], column) }}
                                      </td>
                                    </ng-container>
                                  }
                                  <tr mat-header-row *matHeaderRowDef="influentialRemovedColumns"></tr>
                                  <tr mat-row *matRowDef="let row; columns: influentialRemovedColumns;" [ngClass]="getRowClass(row)"></tr>
                                </table>
                                <mat-paginator #influentialPaginator [pageSize]="10" [pageSizeOptions]="[5, 10, 25, 50]" showFirstLastButtons></mat-paginator>
                              </div>
                              <div class="manhattan-plot" [attr.id]="'manhattan-plot-no-influential-' + selectedBivariateTab" style="flex: 1; min-width: 300px; height: 400px;"></div>
                            </div>
                          </div>
                        }
                      </div>
                    } @else {
                      <!-- Standard Test Layout -->
                      <div class="test-card">
                        <h3>{{ getTestDisplayName(selectedBivariateTab) }}</h3>
                        <div class="test-layout" style="display: flex; gap: 32px; align-items: flex-start;">
                          <div class="test-table" style="flex: 2;">
                            <table mat-table [dataSource]="tableDataSource" matSort #sort="matSort" class="mat-elevation-z1" style="width: 100%;">
                              <!-- Dynamic Columns -->
                              @for (column of displayedColumns; track column) {
                                <ng-container [matColumnDef]="column">
                                  <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ getColumnDisplayName(column) }}</th>
                                  <td mat-cell *matCellDef="let row" [style.text-align]="isNumericColumn(column) ? 'right' : 'left'">
                                    {{ formatCellValue(row[column], column) }}
                                  </td>
                                </ng-container>
                              }
                              <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                              <tr mat-row *matRowDef="let row; columns: displayedColumns;" [ngClass]="getRowClass(row)"></tr>
                            </table>
                            <mat-paginator [pageSize]="10" [pageSizeOptions]="[5, 10, 25, 50]" showFirstLastButtons></mat-paginator>
                          </div>
                          <div class="manhattan-plot" [attr.id]="'manhattan-plot-' + selectedBivariateTab" style="flex: 1; min-width: 300px; height: 400px;"></div>
                        </div>
                      </div>
                    }
                  }
                </div>
              </div>
            </div>
          }

          <!-- Multivariate Tests Section -->
          @if (selectedSection === 'multivariate' && getMultivariateTests().length > 0) {
            <div class="test-section">
              <div class="section-header">
                <h2>Analisi Multivariate</h2>
                <p>Modelli complessi e analisi multidimensionali</p>
              </div>
              <div class="test-tabset">
                <ul class="test-tabs">
                  @for (testKey of getMultivariateTests(); track testKey) {
                    <li class="test-tab" [class.active]="selectedMultivariateTab === testKey" (click)="selectMultivariateTab(testKey)">
                      {{ getTestDisplayName(testKey) }}
                    </li>
                  }
                </ul>
                <div class="test-tab-content">
                  @if (selectedMultivariateTab) {
                    <div class="test-card">
                      <h3>{{ getTestDisplayName(selectedMultivariateTab) }}</h3>
                      
                      <!-- Ridge/Lasso/Elastic Net Header Info -->
                      @if (isRegularizationMethod(selectedMultivariateTab)) {
                        <div class="regularization-info">
                          <div class="info-cards">
                            <div class="info-card">
                              <span class="info-label">Lambda Scelto</span>
                              <span class="info-value">{{ getChosenLambda(selectedMultivariateTab) }}</span>
                            </div>
                            @if (selectedMultivariateTab === 'elasticNet') {
                              <div class="info-card">
                                <span class="info-label">Alpha Scelto</span>
                                <span class="info-value">{{ getChosenAlpha(selectedMultivariateTab) }}</span>
                              </div>
                            }
                            <div class="info-card">
                              <span class="info-label">Metrica Migliore</span>
                              <span class="info-value">{{ getBestMetric(selectedMultivariateTab) }}</span>
                            </div>
                          </div>
                        </div>
                      }
                      
                      <div class="test-layout" style="display: flex; gap: 32px; align-items: flex-start;">
                        <div class="test-table" style="flex: 2;">
                          <table mat-table [dataSource]="tableDataSource" matSort #sort="matSort" class="mat-elevation-z1" style="width: 100%;">
                            <!-- Dynamic Columns -->
                            @for (column of displayedColumns; track column) {
                              <ng-container [matColumnDef]="column">
                                <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ getColumnDisplayName(column) }}</th>
                                <td mat-cell *matCellDef="let row" [style.text-align]="isNumericColumn(column) ? 'right' : 'left'">
                                  {{ formatCellValue(row[column], column) }}
                                </td>
                              </ng-container>
                            }
                            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                            <tr mat-row *matRowDef="let row; columns: displayedColumns;" [ngClass]="getRowClass(row)"></tr>
                          </table>
                          <mat-paginator [pageSize]="10" [pageSizeOptions]="[5, 10, 25, 50]" showFirstLastButtons></mat-paginator>
                        </div>
                        <div class="feature-importance-plot" [attr.id]="'feature-plot-' + selectedMultivariateTab" style="flex: 1; min-width: 300px; height: 400px;">
                          @if (isRegularizationMethod(selectedMultivariateTab)) {
                            <!-- Feature importance plot will be rendered here -->
                          } @else {
                            <!-- Manhattan plot for other multivariate methods -->
                            <div [attr.id]="'manhattan-plot-' + selectedMultivariateTab" style="width: 100%; height: 100%;"></div>
                          }
                        </div>
                      </div>
                    </div>
                  }
                </div>
              </div>
            </div>
          }

          <!-- Summary Section -->
          @if (selectedSection === 'summary') {
            <div class="test-section">
              <div class="section-header">
                <h2>Riepilogo dell'Analisi</h2>
                <p>Panoramica generale dei risultati ottenuti</p>
              </div>
              <div class="test-tabset">
                <ul class="test-tabs">
                  <li class="test-tab active">
                    Riepilogo Generale
                  </li>
                </ul>
                <div class="test-tab-content">
                  <div class="test-card">
                    <h3>Riepilogo Generale</h3>
                    <div class="summary-content">
                      <div class="summary-placeholder">
                        <div class="placeholder-icon">📈</div>
                        <h4>Sezione Riepilogo</h4>
                        <p>Questa sezione conterrà un riepilogo completo di tutti i risultati dell'analisi.</p>
                        <p class="placeholder-note">Funzionalità in fase di sviluppo...</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          }

          <!-- Empty State -->
          @if ((selectedSection === 'bivariate' && getBivariateTests().length === 0) || 
               (selectedSection === 'multivariate' && getMultivariateTests().length === 0)) {
            <div class="empty-section">
              <div class="empty-icon">🔍</div>
              <h3>Nessun risultato trovato</h3>
              <p>Non sono stati trovati risultati per questa categoria di test.</p>
            </div>
          }

          <div class="actions">
            <button class="download-btn" (click)="downloadResults()">
              Scarica Report
            </button>
            <button class="new-analysis-btn" (click)="startNewAnalysis()">
              Nuova Analisi
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .content-wrapper {
      width: 100%;
      min-height: 100vh;
      box-sizing: border-box;
      padding: 24px 16px;
      margin: 0;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      background: #f8fafc;
    }
    .loading-state, .error-state {
      text-align: center;
      padding: 80px 20px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
    }
    .results-ready-state {
      text-align: center;
      padding: 80px 20px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #86efac;
    }
    .ready-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.8;
    }
    .analysis-info {
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 6px;
      padding: 16px;
      margin: 16px auto;
      max-width: 400px;
    }
    .analysis-info p {
      margin: 4px 0;
      font-size: 14px;
      color: #0c4a6e;
    }
    .view-results-btn {
      padding: 12px 32px;
      background: #10b981;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      margin-top: 16px;
    }
    .view-results-btn:hover {
      background: #059669;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    }
    .spinner {
      width: 50px;
      height: 50px;
      border: 3px solid #bae6fd;
      border-top-color: #0284c7;
      border-radius: 50%;
      margin: 0 auto 24px;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .error-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.8;
    }
    .page-header {
      margin-bottom: 32px;
    }
    .page-header h1 {
      margin: 0 0 8px 0;
      color: #0c4a6e;
      font-size: 28px;
      font-weight: 600;
    }
    .page-header p {
      margin: 0;
      color: #475569;
      font-size: 16px;
    }
    h2 {
      color: #0f172a;
      margin: 0 0 8px 0;
      font-size: 20px;
      font-weight: 500;
    }
    .results-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 24px;
      margin-bottom: 32px;
    }
    .result-card {
      background: white;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
    }
    .result-card.full-width {
      grid-column: 1 / -1;
    }
    .result-card h3 {
      color: #0f172a;
      margin: 0 0 20px 0;
      font-size: 18px;
      font-weight: 500;
    }
    .result-card h4 {
      color: #334155;
      margin: 0 0 16px 0;
      font-size: 16px;
      font-weight: 500;
    }
    /* Statistics Styles */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
    }
    .stat-item {
      background: #f0f9ff;
      padding: 16px;
      border-radius: 6px;
      text-align: center;
      border: 1px solid #bae6fd;
    }
    .stat-label {
      display: block;
      font-size: 13px;
      color: #64748b;
      margin-bottom: 4px;
    }
    .stat-value {
      display: block;
      font-size: 20px;
      font-weight: 600;
      color: #0f172a;
    }
    /* Test Results Styles */
    .test-item {
      background: #f0f9ff;
      padding: 16px;
      border-radius: 6px;
      margin-bottom: 12px;
      border: 1px solid #bae6fd;
    }
    .test-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .test-name {
      font-weight: 500;
      color: #0f172a;
    }
    .significant-badge {
      background: #10b981;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
    }
    .test-details {
      display: flex;
      gap: 16px;
      font-size: 13px;
      color: #64748b;
    }
    /* Plot Styles */
    .plots-container {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
      gap: 24px;
    }
    .plot-wrapper {
      background: #f8fafc;
      padding: 20px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }
    .plot {
      width: 100%;
      height: 400px;
    }
    /* Raw Data */
    .toggle-btn {
      padding: 8px 16px;
      background: #f0f9ff;
      border: 1px solid #93c5fd;
      border-radius: 6px;
      color: #0284c7;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 16px;
    }
    .toggle-btn:hover {
      background: #e0f2fe;
      border-color: #60a5fa;
    }
    .raw-data {
      background: #f0f9ff;
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 13px;
      margin: 0;
      border: 1px solid #bae6fd;
      color: #1e293b;
      font-family: 'SF Mono', Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
      max-height: 400px;
      overflow-y: auto;
    }
    /* Actions */
    .actions {
      display: flex;
      gap: 16px;
      justify-content: center;
    }
    .download-btn, .new-analysis-btn, .retry-btn {
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .download-btn {
      background: #06b6d4;
      color: white;
    }
    .download-btn:hover {
      background: #0891b2;
      box-shadow: 0 4px 12px rgba(6, 182, 212, 0.2);
    }
    .new-analysis-btn {
      background: #0284c7;
      color: white;
    }
    .new-analysis-btn:hover {
      background: #0369a1;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.2);
    }
    .retry-btn {
      background: #f87171;
      color: white;
    }
    .retry-btn:hover {
      background: #ef4444;
      box-shadow: 0 4px 12px rgba(248, 113, 113, 0.2);
    }

    /* Section Navigation Styles */
    .section-navigation {
      margin-bottom: 32px;
    }
    .section-tabs {
      display: flex;
      gap: 16px;
      margin-bottom: 24px;
      list-style: none;
      padding: 0;
      justify-content: center;
    }
    .section-tab {
      padding: 16px 24px;
      background: white;
      border: 2px solid #bae6fd;
      border-radius: 12px;
      color: #0284c7;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      min-width: 180px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .section-tab:hover {
      border-color: #06b6d4;
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.1);
    }
    .section-tab.active {
      background: linear-gradient(135deg, #06b6d4 0%, #0284c7 100%);
      color: white;
      border-color: #06b6d4;
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(6, 182, 212, 0.3);
    }
    .section-icon {
      font-size: 24px;
    }
    .section-label {
      font-weight: 600;
    }
    .section-count {
      font-size: 13px;
      opacity: 0.8;
    }

    /* Section Content Styles */
    .test-section {
      margin-bottom: 32px;
    }
    .section-header {
      margin-bottom: 24px;
      text-align: center;
    }
    .section-header h2 {
      color: #0f172a;
      margin: 0 0 8px 0;
      font-size: 24px;
      font-weight: 600;
    }
    .section-header p {
      color: #64748b;
      margin: 0;
      font-size: 16px;
    }

    /* Summary Section Styles */
    .summary-content {
      padding: 24px;
    }
    .summary-placeholder {
      text-align: center;
      max-width: 500px;
      margin: 0 auto;
    }
    .placeholder-icon {
      font-size: 64px;
      margin-bottom: 24px;
    }
    .summary-placeholder h4 {
      color: #0f172a;
      margin: 0 0 16px 0;
      font-size: 24px;
      font-weight: 600;
    }
    .summary-placeholder p {
      color: #64748b;
      margin: 0 0 12px 0;
      font-size: 16px;
      line-height: 1.6;
    }
    .placeholder-note {
      color: #94a3b8 !important;
      font-style: italic;
      font-size: 14px !important;
    }

    /* Empty State Styles */
    .empty-section {
      background: white;
      border-radius: 12px;
      padding: 48px;
      text-align: center;
      box-shadow: 0 4px 16px rgba(0,0,0,0.08);
      border: 2px solid #e5e7eb;
    }
    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.6;
    }
    .empty-section h3 {
      color: #6b7280;
      margin: 0 0 8px 0;
      font-size: 20px;
      font-weight: 500;
    }
    .empty-section p {
      color: #9ca3af;
      margin: 0;
      font-size: 14px;
    }

    /* Tabset styles */
    .test-tabset {
      margin-bottom: 32px;
    }
    .test-tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      list-style: none;
      padding: 0;
      border-bottom: 2px solid #bae6fd;
    }
    .test-tab {
      padding: 10px 24px;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-bottom: none;
      border-radius: 6px 6px 0 0;
      color: #0284c7;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .test-tab.active {
      background: #06b6d4;
      color: white;
      border-color: #06b6d4;
      font-weight: 600;
    }
    .test-tab-content {
      background: white;
      border-radius: 0 0 8px 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
      border-top: none;
      padding: 24px;
    }

    /* Regularization Method Info Styles */
    .regularization-info {
      margin-bottom: 24px;
      padding: 16px;
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border-radius: 8px;
      border: 1px solid #bae6fd;
    }
    .info-cards {
      display: flex;
      gap: 16px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .info-card {
      background: white;
      padding: 12px 16px;
      border-radius: 6px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      border: 1px solid #e2e8f0;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 120px;
    }
    .info-label {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 4px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .info-value {
      font-size: 16px;
      color: #0f172a;
      font-weight: 600;
    }

    /* Table Styles */
    .significant-pvalue {
      background-color: #dbeafe !important; /* Light blue for p-value < 0.05 */
    }
    
    .significant-pvalue:hover {
      background-color: #bfdbfe !important;
    }

    .significant-fdr {
      background-color: #dcfce7 !important; /* Light green for FDR < 0.05 */
    }
    
    .significant-fdr:hover {
      background-color: #bbf7d0 !important;
    }

    .mat-mdc-table {
      background: white;
    }

    .mat-mdc-header-cell {
      font-weight: 600;
      color: #374151;
    }

    /* Linear Regression Specific Styles */
    .regression-formula {
      margin-bottom: 24px;
      padding: 16px;
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border-radius: 8px;
      border: 1px solid #bae6fd;
    }
    .regression-formula h4 {
      margin: 0 0 12px 0;
      color: #0f172a;
      font-size: 16px;
      font-weight: 600;
    }
    .formula-display {
      font-family: 'SF Mono', Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
      font-size: 14px;
      color: #0c4a6e;
      background: white;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      font-weight: 500;
    }
    .regression-section {
      margin-bottom: 32px;
      padding: 16px;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .regression-section h4 {
      margin: 0 0 16px 0;
      color: #0f172a;
      font-size: 18px;
      font-weight: 600;
      padding-bottom: 8px;
      border-bottom: 2px solid #bae6fd;
    }
  `]
})
export class ResultsComponent implements OnInit, AfterViewInit, AfterViewChecked, DoCheck, OnDestroy {
  // Angular Material table/filter/sort logic - now dynamic
  displayedColumns: string[] = [];
  @ViewChild('distributionPlot') distributionPlot?: ElementRef;
  @ViewChild('correlationPlot') correlationPlot?: ElementRef;
  @ViewChild('boxPlot') boxPlot?: ElementRef;
  @ViewChild('scatterPlot') scatterPlot?: ElementRef;

  tableDataSource = new MatTableDataSource<any>([]);
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort; 

  // Linear regression specific data sources
  influentialRemovedDataSource = new MatTableDataSource<any>([]);
  @ViewChild('influentialPaginator') influentialPaginator!: MatPaginator;
  @ViewChild('influentialSort') influentialSort!: MatSort;
  influentialRemovedColumns: string[] = []; 

  loading = signal(true);
  error = signal<string | null>(null);
  results = signal<AnalysisResult | null>(null);
  showRawData = signal(false);
  
  // Analysis status management
  analysisId = signal<string | null>(null);
  analysisStatus = signal<'pending' | 'running' | 'completed' | 'failed'>('pending');
  resultsReady = signal(false);
  showResults = signal(false);
  
  selectedTab: string | null = null;
  private lastTab: string | null = null;
  
  // Section management
  selectedSection: 'bivariate' | 'multivariate' | 'summary' = 'bivariate';
  selectedBivariateTab: string | null = null;
  selectedMultivariateTab: string | null = null;

  constructor(
    private router: Router,
    private dataFlowService: DataFlowService,
    private apiService: ApiService,
    private navigationService: NavigationService,
    private plotlyService: PlotlyService,
    private cdr: ChangeDetectorRef
  ) {}



  selectTab(tabName: string) {
    if (this.selectedTab === tabName) return;
    // Prima pulisci il vecchio plot se esiste
    const oldPlotContainer = document.getElementById('manhattan-plot-' + this.selectedTab);
    if (oldPlotContainer) {
      this.plotlyService.purge(oldPlotContainer);
    }
    // Also clean up influential-removed plot if it exists
    const oldInfluentialPlotContainer = document.getElementById('manhattan-plot-no-influential-' + this.selectedTab);
    if (oldInfluentialPlotContainer) {
      this.plotlyService.purge(oldInfluentialPlotContainer);
    }
    
    this.selectedTab = tabName;
    
    // Update table structure and data for the new tab
    this.updateTableForCurrentTab();
    
    this.cdr.detectChanges();
    // Crea il nuovo plot
    setTimeout(() => {
      this.createPlots();
      this.lastTab = tabName;
    }, 100);
  }

  updateTableDataSource() {
    console.log('[DIAGNOSTICS] updateTableDataSource - Starting data source update');
    console.log('[DIAGNOSTICS] updateTableDataSource - selectedTab:', this.selectedTab);
    
    const data = this.getTestData(this.selectedTab || '');
    console.log('[DIAGNOSTICS] updateTableDataSource - Retrieved data length:', data.length);
    console.log('[DIAGNOSTICS] updateTableDataSource - Sample data:', data[0]);
    
    this.tableDataSource.data = data;
    console.log('[DIAGNOSTICS] updateTableDataSource - Data assigned to table data source');
    
    // Force change detection and reconnect paginator/sort
    setTimeout(() => {
      if (this.paginator) {
        console.log('[DIAGNOSTICS] updateTableDataSource - Connecting paginator');
        this.tableDataSource.paginator = this.paginator;
        this.paginator.firstPage(); // Reset to first page
      } else {
        console.log('[DIAGNOSTICS] updateTableDataSource - No paginator available');
      }
      if (this.sort) {
        console.log('[DIAGNOSTICS] updateTableDataSource - Connecting sort');
        this.tableDataSource.sort = this.sort;
        this.sort.active = ''; // Reset sorting
        this.sort.direction = '';
      } else {
        console.log('[DIAGNOSTICS] updateTableDataSource - No sort available');
      }
      console.log('[DIAGNOSTICS] updateTableDataSource - Forcing change detection');
      this.cdr.detectChanges();
    }, 0);
    
    console.log('[DIAGNOSTICS] updateTableDataSource - Data source update completed');
  }

  updateTableForCurrentTab() {
    console.log('[DIAGNOSTICS] updateTableForCurrentTab - Starting table update');
    console.log('[DIAGNOSTICS] updateTableForCurrentTab - selectedTab:', this.selectedTab);
    
    if (!this.selectedTab) {
      console.log('[DIAGNOSTICS] updateTableForCurrentTab - No selected tab, returning');
      return;
    }
    
    // Get the columns for the current test
    console.log('[DIAGNOSTICS] updateTableForCurrentTab - Getting columns for test');
    this.displayedColumns = this.getColumnsForTest(this.selectedTab);
    console.log('[DIAGNOSTICS] updateTableForCurrentTab - Displayed columns:', this.displayedColumns);
    
    // Update the data source with proper reinitialization
    console.log('[DIAGNOSTICS] updateTableForCurrentTab - Updating table data source');
    this.updateTableDataSource();
    
    // Handle linear regression tests with influential removed data
    if (this.isLinearRegressionTest(this.selectedTab)) {
      console.log('[DIAGNOSTICS] updateTableForCurrentTab - Handling linear regression influential data');
      this.updateInfluentialRemovedTable(this.selectedTab);
    }
    
    // Force view update to ensure Material Table recognizes new structure
    console.log('[DIAGNOSTICS] updateTableForCurrentTab - Forcing change detection');
    this.cdr.detectChanges();
    console.log('[DIAGNOSTICS] updateTableForCurrentTab - Table update completed');
  }

  getColumnsForTest(testName: string): string[] {
    console.log(`[DIAGNOSTICS] getColumnsForTest - Getting columns for test: ${testName}`);
    
    const testData = this.getTestData(testName);
    if (!testData || testData.length === 0) {
      console.log(`[DIAGNOSTICS] getColumnsForTest - No data for test ${testName}, returning empty array`);
      return [];
    }
    
    console.log(`[DIAGNOSTICS] getColumnsForTest - Test data length: ${testData.length}`);
    
    // Get all unique keys from the first few rows to determine columns
    const sampleSize = Math.min(5, testData.length);
    const allKeys = new Set<string>();
    
    console.log(`[DIAGNOSTICS] getColumnsForTest - Analyzing ${sampleSize} sample rows`);
    
    for (let i = 0; i < sampleSize; i++) {
      const row = testData[i];
      if (row) {
        const rowKeys = Object.keys(row);
        console.log(`[DIAGNOSTICS] getColumnsForTest - Row ${i} keys:`, rowKeys);
        rowKeys.forEach(key => allKeys.add(key));
      }
    }
    
    const columns = Array.from(allKeys);
    console.log(`[DIAGNOSTICS] getColumnsForTest - Final columns for ${testName}:`, columns);
    return columns;
  }

  getColumnDisplayName(columnKey: string): string {
    // Map internal column names to user-friendly display names
    const columnMap: { [key: string]: string } = {
      'variable': 'Variable',
      'Variable': 'Variable',
      'gene': 'Gene',
      'feature': 'Feature',
      'estimate': 'Estimate',
      'logFC': 'Log FC',
      'coefficient': 'Coefficient',
      'Coefficient': 'Coefficient',
      'pValue': 'p-value',
      'pval': 'p-value',
      'p_value': 'p-value',
      'fdr': 'FDR',
      'adj_pval': 'Adj. p-value',
      'padj': 'Adj. p-value',
      'statistic': 'Statistic',
      'tstat': 't-statistic',
      'zstat': 'z-statistic',
      'correlation': 'Correlation',
      'importance': 'Importance',
      'decision': 'Decision',
      'rank': 'Rank',
      'sign': 'Sign'
    };
    
    return columnMap[columnKey] || this.formatColumnName(columnKey);
  }

  private formatColumnName(columnKey: string): string {
    // Convert camelCase or snake_case to Title Case
    return columnKey
      .replace(/([A-Z])/g, ' $1') // camelCase to space separated
      .replace(/_/g, ' ') // snake_case to space separated
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .trim();
  }

  isNumericColumn(columnKey: string): boolean {
    // Define which columns should be treated as numeric for right alignment
    const numericColumns = [
      'estimate', 'logFC', 'coefficient', 'Coefficient', 'pValue', 'pval', 'p_value',
      'fdr', 'adj_pval', 'padj', 'statistic', 'tstat', 'zstat',
      'correlation', 'importance', 'rank', 'sign'
    ];
    return numericColumns.includes(columnKey);
  }

  formatCellValue(value: any, columnKey: string): string {
    if (value === null || value === undefined) {
      return '';
    }
    
    // Special handling for sign column
    if (columnKey === 'sign') {
      if (value === 1) return '+';
      if (value === -1) return '-';
      if (value === 0) return '0';
      return value.toString();
    }
    
    // Special formatting for different column types
    if (this.isNumericColumn(columnKey)) {
      const numValue = Number(value);
      if (!isNaN(numValue)) {
        // Use scientific notation for very large or very small numbers
        if (Math.abs(numValue) >= 1e6 || (Math.abs(numValue) <= 1e-6 && numValue !== 0)) {
          return numValue.toExponential(2);
        }
        
        // Different precision for different types of values using standard notation
        if (columnKey.includes('pValue') || columnKey.includes('fdr') || 
            columnKey.includes('pval') || columnKey.includes('padj')) {
          return numValue.toFixed(6); // 6 decimals for p-values in standard notation
        } else if (columnKey.includes('correlation')) {
          return numValue.toFixed(3); // 3 decimals for correlations
        } else if (columnKey === 'Coefficient' || columnKey === 'coefficient') {
          return numValue.toFixed(4); // 4 decimals for coefficients
        } else if (columnKey === 'importance') {
          return numValue.toFixed(2); // 2 decimals for importance
        } else {
          return numValue.toFixed(4); // 4 decimals for other numeric values
        }
      }
    }
    
    // For boolean or categorical values
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    
    return value.toString();
  }

  getRowClass(row: any): string {
    // Dynamic row styling based on significance
    const classes: string[] = [];
    
    // Check for FDR significance first (higher priority - light green)
    const fdrFields = ['fdr', 'adj_pval', 'padj'];
    for (const field of fdrFields) {
      if (row[field] !== undefined && row[field] !== null) {
        const fdrVal = Number(row[field]);
        if (!isNaN(fdrVal) && fdrVal < 0.05) {
          classes.push('significant-fdr');
          return classes.join(' '); // Return early, FDR takes priority
        }
      }
    }
    
    // Check for p-value significance (light blue)
    const pValueFields = ['pValue', 'pval', 'p_value'];
    for (const field of pValueFields) {
      if (row[field] !== undefined && row[field] !== null) {
        const pVal = Number(row[field]);
        if (!isNaN(pVal) && pVal < 0.05) {
          classes.push('significant-pvalue');
          break;
        }
      }
    }
    
    // Check for decision-based significance (e.g., Boruta results)
    if (row.decision && (row.decision === 'Confirmed' || row.decision === 'Important')) {
      classes.push('significant-fdr'); // Use green for confirmed features
    }
    
    return classes.join(' ');
  }

  ngOnInit() {
    console.log('[DIAGNOSTICS] ngOnInit - Component initialization started');
    
    // Check prerequisites
    const fileData = this.dataFlowService.fileData();
    const preprocessingOptions = this.dataFlowService.preprocessingOptions();
    const analysisOptions = this.dataFlowService.analysisOptions();

    console.log('[DIAGNOSTICS] Prerequisites check:', {
      hasFileData: !!fileData,
      hasPreprocessingOptions: !!preprocessingOptions,
      hasAnalysisOptions: !!analysisOptions,
      fileData: fileData ? { fileName: fileData.fileName, fileSize: fileData.fileSize } : null,
      preprocessingOptions: preprocessingOptions,
      analysisOptions: analysisOptions
    });

    if (!fileData || !preprocessingOptions || !analysisOptions) {
      console.log('[DIAGNOSTICS] Missing prerequisites, navigating to upload');
      this.navigationService.navigateToStep('upload');
      return;
    }

    // First try to load existing results before starting a new analysis
    console.log('[DIAGNOSTICS] Prerequisites satisfied, loading existing results');
    this.loadExistingResults();
  }

  private loadExistingResults() {
    console.log('[DIAGNOSTICS] loadExistingResults - Starting to load existing results');
    
    // Try to load existing results based on current session
    let userId = window.sessionStorage.getItem('userId');
    if (!userId) {
      userId = 'MasterTest';
      window.sessionStorage.setItem('userId', userId);
      console.log('[DIAGNOSTICS] No userId found, set to default: MasterTest');
    } else {
      console.log('[DIAGNOSTICS] Found existing userId:', userId);
    }

    const analysisOptions = this.dataFlowService.analysisOptions();
    const preprocessingOptions = this.dataFlowService.preprocessingOptions();
    const sessionId = (analysisOptions?.sessionId || preprocessingOptions?.sessionId || window.sessionStorage.getItem('sessionId') || crypto.randomUUID()) as string;
    const analysisId = `${userId}_${sessionId}`;

    console.log('[DIAGNOSTICS] Session details:', {
      userId,
      sessionId,
      analysisId,
      analysisOptionsSessionId: analysisOptions?.sessionId,
      preprocessingOptionsSessionId: preprocessingOptions?.sessionId,
      storageSessionId: window.sessionStorage.getItem('sessionId')
    });

    console.log('[DIAGNOSTICS] Attempting to load existing results for analysisId:', analysisId);

    // Set the analysis ID for display
    this.analysisId.set(analysisId);
    this.loading.set(true);
    this.error.set(null);

    // Try to get existing results
    this.apiService.getAnalysisResults(analysisId).subscribe({
      next: (result: AnalysisResult) => {
        console.log('[DIAGNOSTICS] API Response received:', {
          resultId: result.id,
          resultStatus: result.status,
          resultTimestamp: result.timestamp,
          hasResults: !!result.results,
          resultType: typeof result.results
        });
        
        console.log('[DIAGNOSTICS] Full API result structure:', result);
        console.log('[DIAGNOSTICS] Result.results keys:', result.results ? Object.keys(result.results) : 'null');
        
        // Validate results structure - handle nested results
        let actualResults = result.results;
        
        // Check if results is nested (has a nested results property)
        if (actualResults && typeof actualResults === 'object' && actualResults.results) {
          console.log('[DIAGNOSTICS] Detected nested results structure, using inner results');
          actualResults = actualResults.results;
        }
        
        console.log('[DIAGNOSTICS] Actual results after nesting check:', {
          hasActualResults: !!actualResults,
          actualResultsType: typeof actualResults,
          actualResultsKeys: actualResults ? Object.keys(actualResults) : 'null'
        });
        
        if (!actualResults) {
          console.log('[DIAGNOSTICS] No results found in existing data, starting new analysis');
          this.submitAnalysis();
          return;
        }

        // Check if we have any test data
        const testKeys = Object.keys(actualResults);
        console.log('[DIAGNOSTICS] Available tests in existing results:', testKeys);
        
        // Check each test for data property
        for (const testKey of testKeys) {
          const testData = actualResults[testKey];
          console.log(`[DIAGNOSTICS] Test ${testKey}:`, {
            hasData: !!testData?.data,
            dataLength: testData?.data?.length || 0,
            testName: testData?.testName,
            dataType: typeof testData?.data,
            sampleDataPoint: testData?.data?.[0]
          });
        }
        
        if (testKeys.length === 0) {
          console.log('[DIAGNOSTICS] No test data found in existing results, starting new analysis');
          this.submitAnalysis();
          return;
        }

        // Create a properly structured result object
        const properResult: AnalysisResult = {
          ...result,
          results: actualResults
        };

        console.log('[DIAGNOSTICS] Created proper result object:', {
          id: properResult.id,
          status: properResult.status,
          hasResults: !!properResult.results,
          resultsKeys: properResult.results ? Object.keys(properResult.results) : 'null'
        });

        // Load existing results
        this.loading.set(false);
        this.results.set(properResult);
        this.analysisStatus.set('completed');
        this.resultsReady.set(true);
        console.log('[DIAGNOSTICS] Results set in component, ready to show');
        this.navigationService.updateNavigationStatus();
      },
      error: (err: any) => {
        console.log('[DIAGNOSTICS] API error when loading existing results:', {
          message: err.message,
          status: err.status,
          error: err
        });
        console.log('[DIAGNOSTICS] No existing results found, starting new analysis');
        // If no existing results found, start a new analysis
        this.submitAnalysis();
      }
    });
  }

  ngAfterViewInit() {
    // Create plots after view is initialized and results are loaded
    const results = this.results();
    const showResults = this.showResults();
    if (results?.results && showResults) {
      this.initializeDefaultSelections();
      setTimeout(() => this.createPlots(), 0);
    }
    
    // Initialize table components
    setTimeout(() => {
      if (this.paginator) {
        this.tableDataSource.paginator = this.paginator;
      }
      if (this.sort) {
        this.tableDataSource.sort = this.sort;
      }
    }, 100);
  }

  private initializeDefaultSelections() {
    console.log('[DIAGNOSTICS] initializeDefaultSelections - Starting initialization');
    
    const currentResults = this.results();
    console.log('[DIAGNOSTICS] Current results state:', {
      hasResults: !!currentResults,
      resultsId: currentResults?.id,
      resultsStatus: currentResults?.status,
      hasResultsData: !!currentResults?.results,
      resultsDataType: typeof currentResults?.results
    });
    
    if (currentResults?.results) {
      console.log('[DIAGNOSTICS] Results data keys:', Object.keys(currentResults.results));
      
      // Log each test's structure
      Object.keys(currentResults.results).forEach(testKey => {
        const test = currentResults.results[testKey];
        console.log(`[DIAGNOSTICS] Test ${testKey}:`, {
          hasData: !!test?.data,
          dataLength: test?.data?.length || 0,
          testName: test?.testName,
          dataStructure: test?.data?.[0] ? Object.keys(test.data[0]) : 'no data'
        });
      });
    }
    
    const bivariateTests = this.getBivariateTests();
    const multivariateTests = this.getMultivariateTests();
    
    console.log('[DIAGNOSTICS] Test categorization results:', {
      bivariateTests,
      multivariateTests,
      bivariateCount: bivariateTests.length,
      multivariateCount: multivariateTests.length
    });
    
    // Set default section based on available tests
    if (bivariateTests.length > 0) {
      this.selectedSection = 'bivariate';
      this.selectedBivariateTab = bivariateTests[0];
      this.selectedTab = this.selectedBivariateTab;
      console.log('[DIAGNOSTICS] Selected bivariate section with tab:', this.selectedBivariateTab);
    } else if (multivariateTests.length > 0) {
      this.selectedSection = 'multivariate';
      this.selectedMultivariateTab = multivariateTests[0];
      this.selectedTab = this.selectedMultivariateTab;
      console.log('[DIAGNOSTICS] Selected multivariate section with tab:', this.selectedMultivariateTab);
    } else {
      this.selectedSection = 'summary';
      this.selectedTab = null;
      console.log('[DIAGNOSTICS] No tests found, selected summary section');
    }
    
    if (this.selectedTab) {
      this.lastTab = this.selectedTab;
      console.log('[DIAGNOSTICS] About to update table for current tab:', this.selectedTab);
      this.updateTableForCurrentTab();
      console.log('[DIAGNOSTICS] Table updated for current tab:', this.selectedTab);
    }
    
    console.log('[DIAGNOSTICS] initializeDefaultSelections completed');
  }

  ngAfterViewChecked() {
    // Se la tab è cambiata, aggiorna il plot solo se non è già stato fatto
    if (this.selectedTab && this.selectedTab !== this.lastTab) {
      const plotContainer = document.getElementById('manhattan-plot-' + this.selectedTab);
      if (plotContainer && !plotContainer.hasChildNodes()) {
        setTimeout(() => this.createPlots(), 100);
      }
    }
  }

  // Aggiorna la tab selezionata quando arrivano nuovi risultati
  ngDoCheck() {
    const results = this.results();
    const showResults = this.showResults();
    if (results?.results && showResults && (!this.selectedTab || !this.selectedSection)) {
      this.initializeDefaultSelections();
      
      // Ensure table components are properly connected after initialization
      setTimeout(() => {
        if (this.paginator) {
          this.tableDataSource.paginator = this.paginator;
        }
        if (this.sort) {
          this.tableDataSource.sort = this.sort;
        }
      }, 50);
    }
  }

  private submitAnalysis() {
    const fileData = this.dataFlowService.fileData();
    const preprocessingOptions = this.dataFlowService.preprocessingOptions();
    const analysisOptions = this.dataFlowService.analysisOptions();

    if (!fileData || !preprocessingOptions || !analysisOptions) {
      return;
    }

    // Use processed file if available, otherwise use original
    const fileToAnalyze = fileData.processedFile || fileData.file;

    // Recupera sessionId e userId
    let userId = window.sessionStorage.getItem('userId');
    if (!userId) {
      userId = 'MasterTest';
      window.sessionStorage.setItem('userId', userId);
    }
    const sessionId = (analysisOptions.sessionId || preprocessingOptions.sessionId || window.sessionStorage.getItem('sessionId') || crypto.randomUUID()) as string;
    const analysisId = `${userId}_${sessionId}`;
    
    const request: AnalysisRequest = {
      sessionId,
      userId,
      file: fileToAnalyze || undefined,
      fileData: fileData,
      preprocessingOptions: { ...preprocessingOptions, sessionId: sessionId, userId: userId },
      analysisOptions: { ...analysisOptions, sessionId: sessionId, userId: userId }
    };

    // Set analysis ID and status
    this.analysisId.set(analysisId);
    this.analysisStatus.set('running');
    this.loading.set(true);
    this.error.set(null);

    // Submit analysis and poll for status/results
    this.apiService.submitAnalysis(request).subscribe({
      next: (_submitResult: any) => {
        // Start polling for analysis status
        this.pollAnalysisStatus(analysisId);
      },
      error: (err: any) => {
        this.loading.set(false);
        this.analysisStatus.set('failed');
        this.error.set(err.message || 'Si è verificato un errore durante l\'invio dell\'analisi');
      }
    });
  }

  private pollAnalysisStatus(analysisId: string) {
    // Polling for status every 60 seconds (instead of 2 seconds)
    const pollInterval = 60000; // 60 seconds
    
    const poll = () => {
      this.apiService.getAnalysisStatus(analysisId).subscribe({
        next: (response: AnalysisResult) => {
          console.log('[DIAGNOSTICS] Polling response:', {
            status: response.status,
            analysisId: analysisId,
            timestamp: new Date().toISOString()
          });
          
          // Update analysis status
          if (response.status === 'pending') {
            this.analysisStatus.set('pending');
            // Continue polling
            setTimeout(poll, pollInterval);
          } else if (response.status === 'completed') {
            this.analysisStatus.set('completed');
            // Results are ready, but don't show them immediately
            if (response.results) {
              // Process results directly from status response
              console.log('[DIAGNOSTICS] Results found in status response, marking as ready...');
              this.loading.set(false);
              this.results.set(response);
              this.resultsReady.set(true);
              this.navigationService.updateNavigationStatus();
            } else {
              // Fallback to separate results call if needed
              console.log('[DIAGNOSTICS] No results in status response, fetching separately...');
              this.getAnalysisResults(analysisId);
            }
          } else if (response.status === 'error' || response.status === 'failed') {
            this.loading.set(false);
            this.analysisStatus.set('failed');
            this.error.set(response.error || 'L\'analisi è fallita. Riprova.');
          } else {
            // Unknown status, continue polling
            setTimeout(poll, pollInterval);
          }
        },
        error: (err: any) => {
          console.error('[DIAGNOSTICS] Polling error:', err);
          this.loading.set(false);
          this.analysisStatus.set('failed');
          this.error.set(err.message || 'Errore durante il controllo dello stato dell\'analisi');
        }
      });
    };
    
    // Start the first poll immediately
    poll();
  }

  private getAnalysisResults(analysisId: string) {
    this.apiService.getAnalysisResults(analysisId).subscribe({
      next: (result: AnalysisResult) => {
        console.log('[Diagnostica] Risultato API getAnalysisResults:', result);
        
        // Validate results structure
        if (!result.results) {
          console.error('Invalid results structure:', result);
          this.error.set('Struttura dei risultati non valida');
          this.loading.set(false);
          return;
        }

        // Check if we have any test data
        const testKeys = Object.keys(result.results);
        console.log('Available tests:', testKeys);
        
        if (testKeys.length === 0) {
          console.error('No test results found');
          this.error.set('Nessun risultato di test trovato');
          this.loading.set(false);
          return;
        }

        this.loading.set(false);
        this.results.set(result);
        this.analysisStatus.set('completed');
        this.resultsReady.set(true);
        this.navigationService.updateNavigationStatus();
      },
      error: (err: any) => {
        this.loading.set(false);
        this.error.set(err.message || 'Errore nel recupero dei risultati dell\'analisi');
      }
    });
  }

  private createPlots() {
    const results = this.results()?.results;
    if (!results || !this.selectedTab) return;
    
    const test = results[this.selectedTab];
    if (!test?.data || test.data.length === 0) return;
    
    console.log(`Creating plots for test: ${this.selectedTab}`);
    console.log('Test data structure:', test);
    
    const selectedTab = this.selectedTab; // Store in local variable for null safety
    
    // Wait for the DOM to be updated with the new tab content
    setTimeout(() => {
      // Handle different plot types based on test type and section
      if (this.isRegularizationMethod(selectedTab)) {
        // Use the improved feature importance plot for regularization methods
        this.createFeatureImportancePlot();
      } else if (this.isFeatureSelectionMethod(selectedTab)) {
        // For multivariate feature selection methods (RFE, Boruta, Random Forest)
        // These are in the multivariate section and use Manhattan plots
        this.createManhattanPlot(selectedTab, test.data, 'manhattan-plot-' + selectedTab);
      } else if (this.isTTestType(selectedTab)) {
        // For t-tests, create both Manhattan plot and additional plots
        this.createManhattanPlot(selectedTab, test.data, 'manhattan-plot-' + selectedTab);
        
        // Also create volcano plot if we have estimate data
        if (test.data[0]?.estimate !== undefined) {
          this.createVolcanoPlotForTest(selectedTab, test.data);
        }
      } else if (this.isAnovaType(selectedTab)) {
        // For ANOVA tests, create Manhattan plot
        this.createManhattanPlot(selectedTab, test.data, 'manhattan-plot-' + selectedTab);
      } else if (this.isCorrelationType(selectedTab)) {
        // For correlation tests, create Manhattan plot
        this.createManhattanPlot(selectedTab, test.data, 'manhattan-plot-' + selectedTab);
      } else {
        // Default: Manhattan plot for any test with p-values
        this.createManhattanPlot(selectedTab, test.data, 'manhattan-plot-' + selectedTab);
      }
      
      // For linear regression tests, also create the influential-removed plot if data exists
      if (this.isLinearRegressionTest(selectedTab) && this.hasInfluentialRemovedData(selectedTab)) {
        const influentialRemovedData = this.getInfluentialRemovedData(selectedTab);
        this.createManhattanPlot(selectedTab, influentialRemovedData, 'manhattan-plot-no-influential-' + selectedTab);
      }
    }, 250); // Increased timeout to ensure DOM is ready
  }

  private createManhattanPlot(testKey: string, data: any[], containerId: string) {
    console.log(`[DEBUG] createManhattanPlot called with:`, {
      testKey,
      containerId,
      dataLength: data?.length,
      isFeatureSelection: this.isFeatureSelectionMethod(testKey),
      selectedSection: this.selectedSection
    });
    
    const plotContainer = document.getElementById(containerId);
    console.log(`[DEBUG] Plot container search result:`, {
      containerId,
      containerFound: !!plotContainer,
      containerElement: plotContainer
    });
    
    if (!plotContainer) {
      console.warn('Plot container not found:', containerId);
      // For debugging, let's also check what containers are available
      const allContainersWithPlot = Array.from(document.querySelectorAll('[id*="plot"]')).map(el => el.id);
      console.log('[DEBUG] Available plot containers:', allContainersWithPlot);
      return;
    }

    try {
      console.log(`Creating Manhattan plot for ${testKey} with ${data.length} data points`);
      
      if (!data || data.length === 0) {
        console.error('No data available for plotting');
        return;
      }

      // Filter data to include only valid rows
      let invalidCount = 0;
      const validData = data.filter((row: any) => {
        // Detect p-value column dynamically
        const pValueFields = ['pValue', 'pval', 'p_value'];
        const pValueField = pValueFields.find(field => row[field] !== undefined && row[field] !== null);
        
        if (!pValueField) return false;
        
        const p = Number(row[pValueField]);
        const hasVariable = row.variable && row.variable.toString().trim() !== '';
        
        const isValid = !isNaN(p) && p > 0 && hasVariable;
        if (!isValid) {
          invalidCount++;
          if (invalidCount <= 5) { // Log only first 5 invalid rows to avoid console spam
            console.warn('Invalid data point:', {
              row,
              variable: `${row.variable} (${typeof row.variable})`,
              pValueField,
              pValue: `${row[pValueField]} (${typeof row[pValueField]})`,
              parsedPValue: p,
              hasVariable
            });
          }
        }
        return isValid;
      });

      console.log('Data validation summary:', {
        totalPoints: data.length,
        validPoints: validData.length,
        invalidPoints: invalidCount,
        validationRate: `${((validData.length / data.length) * 100).toFixed(1)}%`,
        availableColumns: Object.keys(data[0] || {})
      });

      if (validData.length === 0) {
        console.error('No valid data points found for plotting');
        return;
      }
      
      // Detect the actual p-value column name
      const pValueFields = ['pValue', 'pval', 'p_value'];
      const pValueColumn = pValueFields.find(field => validData[0][field] !== undefined) || 'pValue';
      
      console.log('Using p-value column:', pValueColumn);
      console.log('Sample data point:', validData[0]);

      const test = this.results()?.results?.[testKey];
      const plotTitle = containerId.includes('no-influential') 
        ? `Manhattan Plot (No Influentials) - ${test?.testName || testKey}`
        : `Manhattan Plot - ${test?.testName || testKey}`;

      this.plotlyService.createManhattanPlot(
        plotContainer,
        validData,
        {
          title: plotTitle,
          xaxis: 'Variables',
          yaxis: '-log10(p-value)',
          significanceLine: true,
          significanceThreshold: -Math.log10(0.05),
          variableColumn: 'Variable',
          pValueColumn: pValueColumn
        }
      );
    } catch (error) {
      console.error('Error creating manhattan plot:', error);
      // Mostra un messaggio di errore nel container del plot
      plotContainer.innerHTML = `
        <div style="height: 100%; display: flex; align-items: center; justify-content: center; color: #ef4444; text-align: center;">
          <div>
            <p>Errore nella creazione del manhattan plot.</p>
            <p>Verifica che i dati contengano valori validi per variable e p-value.</p>
          </div>
        </div>
      `;
    }
  }

  private createFeatureImportancePlot() {
    const results = this.results()?.results;
    if (!results || !this.selectedTab) return;
    
    const test = results[this.selectedTab];
    if (!test?.data || test.data.length === 0) return;
    
    const plotContainer = document.getElementById('feature-plot-' + this.selectedTab);
    if (!plotContainer) {
      console.warn('Feature plot container not found for tab:', this.selectedTab);
      return;
    }

    // Use the PlotlyService method
    this.plotlyService.createFeatureImportancePlot(
      plotContainer,
      test.data,
      {
        title: `Feature Importance - ${test.testName || this.selectedTab}`,
        topN: 20,
        variableColumn: 'Variable',
        importanceColumn: 'importance',
        signColumn: 'sign'
      }
    ).catch(error => {
      console.error('Error creating feature importance plot:', error);
      plotContainer.innerHTML = `
        <div style="height: 100%; display: flex; align-items: center; justify-content: center; color: #ef4444; text-align: center;">
          <div>
            <p>Error creating feature importance plot.</p>
            <p>Check console for details.</p>
          </div>
        </div>
      `;
    });
  }

  private createVolcanoPlotForTest(testKey: string, data: any[]) {
    // Check if we should create a volcano plot (only if there's a second plot container)
    const volcanoContainer = document.getElementById('volcano-plot-' + testKey);
    if (!volcanoContainer) {
      return; // No volcano plot container, skip
    }

    const test = this.results()?.results?.[testKey];
    this.plotlyService.createVolcanoPlot(
      volcanoContainer,
      data,
      {
        title: `Volcano Plot - ${test?.testName || testKey}`,
        estimateColumn: 'estimate',
        pValueColumn: 'pValue',
        variableColumn: 'Variable',
        fdrColumn: 'fdr'
      }
    ).catch(error => {
      console.error('Error creating volcano plot:', error);
    });
  }

  getStatistics(): any[] {
    const stats = this.results()?.results?.statistics;
    if (!stats) return [];

    return Object.entries(stats).map(([key, value]) => ({
      name: this.formatStatName(key),
      value: typeof value === 'number' ? value.toFixed(2) : value
    }));
  }

  getTestResults(): any[] {
    const tests = this.results()?.results?.testResults;
    if (!tests) return [];

    return Object.values(tests).map((test: any) => ({
      name: test.name || 'Test',
      pValue: test.pValue?.toFixed(4) || 'N/A',
      statistic: test.statistic?.toFixed(3) || test.fStatistic?.toFixed(3) || 'N/A',
      significant: test.significant || false
    }));
  }

  hasScatterData(): boolean {
    return !!this.results()?.results?.plots?.scatter;
  }

  private formatStatName(key: string): string {
    const names: any = {
      mean: 'Media',
      median: 'Mediana',
      stdDev: 'Dev. Standard',
      min: 'Minimo',
      max: 'Massimo',
      count: 'Conteggio'
    };
    return names[key] || key;
  }

  private generateDistributionData(): number[] {
    // Generate random normal distribution for demo
    const data = [];
    for (let i = 0; i < 200; i++) {
      data.push(this.randomNormal(45, 12));
    }
    return data;
  }

  private generateBoxPlotData(): any[] {
    return [
      { name: 'Gruppo A', values: Array.from({length: 50}, () => this.randomNormal(40, 10)) },
      { name: 'Gruppo B', values: Array.from({length: 50}, () => this.randomNormal(50, 15)) },
      { name: 'Gruppo C', values: Array.from({length: 50}, () => this.randomNormal(45, 8)) }
    ];
  }

  private generateScatterData(): any {
    const x = Array.from({length: 100}, () => Math.random() * 100);
    const y = x.map(val => val * 0.8 + this.randomNormal(0, 10));
    return { x, y };
  }

  private randomNormal(mean: number, stdDev: number): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return mean + stdDev * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  toggleRawData() {
    this.showRawData.update(v => !v);
  }

  retryAnalysis() {
    this.submitAnalysis();
  }

  getStatusDisplayName(status: string): string {
    const statusMap: { [key: string]: string } = {
      'pending': 'In attesa',
      'running': 'In esecuzione',
      'completed': 'Completata',
      'failed': 'Fallita'
    };
    return statusMap[status] || status;
  }

  viewResults() {
    this.showResults.set(true);
    // Initialize UI after showing results
    setTimeout(() => {
      this.initializeDefaultSelections();
      this.createPlots();
    }, 100);
  }

  downloadResults() {
    const data = JSON.stringify(this.results(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'analysis-results.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  startNewAnalysis() {
    if (confirm('Vuoi iniziare una nuova analisi? I dati attuali verranno persi.')) {
      // Reset all state
      this.analysisId.set(null);
      this.analysisStatus.set('pending');
      this.resultsReady.set(false);
      this.showResults.set(false);
      this.results.set(null);
      this.loading.set(false);
      this.error.set(null);
      
      this.navigationService.resetWorkflow();
    }
  }

  ngOnDestroy() {
    // Clean up Plotly plots
    if (this.distributionPlot?.nativeElement) {
      this.plotlyService.purge(this.distributionPlot.nativeElement);
    }
    if (this.correlationPlot?.nativeElement) {
      this.plotlyService.purge(this.correlationPlot.nativeElement);
    }
    if (this.boxPlot?.nativeElement) {
      this.plotlyService.purge(this.boxPlot.nativeElement);
    }
    if (this.scatterPlot?.nativeElement) {
      this.plotlyService.purge(this.scatterPlot.nativeElement);
    }
  }

  // Debug helper methods
  getResultsKeys(): string {
    const results = this.results()?.results;
    return results ? Object.keys(results).join(', ') : 'none';
  }

  isNumber(val: any): boolean {
    return typeof val === 'number' && !isNaN(val);
  }

  formatNumberCell(val: any): string {
    if (typeof val === 'number' && !isNaN(val)) {
      return val.toFixed(3);
    }
    return val !== undefined && val !== null ? val.toString() : '';
  }

  // Restituisce i nomi dei test presenti nei risultati
  getTestNames(): string[] {
    const res = this.results()?.results;
    console.log('[DIAGNOSTICS] getTestNames - results object:', res);
    console.log('[DIAGNOSTICS] getTestNames - results type:', typeof res);
    
    if (res) {
      const allKeys = Object.keys(res);
      console.log('[DIAGNOSTICS] getTestNames - all result keys:', allKeys);
      
      // Check each key for valid test structure
      const validTests = allKeys.filter(key => {
        const test = res[key];
        const hasData = test?.data;
        const dataLength = test?.data?.length || 0;
        console.log(`[DIAGNOSTICS] getTestNames - checking key ${key}:`, {
          hasTest: !!test,
          hasData,
          dataLength,
          testStructure: test ? Object.keys(test) : 'no test'
        });
        return hasData;
      });
      
      console.log('[DIAGNOSTICS] getTestNames - valid tests with data:', validTests);
      return validTests;
    }
    
    console.log('[DIAGNOSTICS] getTestNames - no results found, returning empty array');
    return [];
  }

  // Restituisce i dati per un test specifico
  getTestData(testName: string): any[] {
    console.log(`[DIAGNOSTICS] getTestData - Getting data for test: ${testName}`);
    
    const res = this.results()?.results;
    if (!res) {
      console.log('[DIAGNOSTICS] getTestData - No results object found');
      return [];
    }
    
    const test = res[testName];
    if (!test) {
      console.log(`[DIAGNOSTICS] getTestData - No test found for name: ${testName}`);
      console.log('[DIAGNOSTICS] getTestData - Available test names:', Object.keys(res));
      return [];
    }
    
    if (!test.data) {
      console.log(`[DIAGNOSTICS] getTestData - Test ${testName} exists but has no data property`);
      console.log(`[DIAGNOSTICS] getTestData - Test structure:`, Object.keys(test));
      return [];
    }
    
    console.log(`[DIAGNOSTICS] getTestData - Found ${test.data.length} rows for test: ${testName}`);
    console.log(`[DIAGNOSTICS] getTestData - Sample data point:`, test.data[0]);
    return test.data;
  }

  // Restituisce il nome visualizzato del test
  getTestDisplayName(testKey: string): string {
    const test = this.results()?.results?.[testKey];
    return test?.testName || testKey;
  }

  // Methods for regularization methods (Ridge, Lasso, Elastic Net)
  isRegularizationMethod(testKey: string): boolean {
    return ['ridge', 'lasso', 'elasticNet'].includes(testKey);
  }

  // Methods for feature selection methods (RFE, Boruta, Random Forest)
  isFeatureSelectionMethod(testKey: string): boolean {
    return ['randomForest', 'boruta', 'rfe'].includes(testKey);
  }

  getChosenLambda(testKey: string): string {
    const test = this.results()?.results?.[testKey];
    if (test?.chosen_lambda !== undefined) {
      return Number(test.chosen_lambda).toFixed(4);
    }
    return 'N/A';
  }

  getChosenAlpha(testKey: string): string {
    const test = this.results()?.results?.[testKey];
    if (test?.chosen_alpha !== undefined) {
      return Number(test.chosen_alpha).toFixed(4);
    }
    return 'N/A';
  }

  getBestMetric(testKey: string): string {
    const test = this.results()?.results?.[testKey];
    if (test?.best_metric !== undefined) {
      return Number(test.best_metric).toFixed(4);
    }
    return 'N/A';
  }

  // Methods for categorizing tests by type
  getBivariateTests(): string[] {
    const testNames = this.getTestNames();
    console.log('[DIAGNOSTICS] getBivariateTests - All available test names:', testNames);
    
    // Exact test keys from the API response for bivariate tests
    const bivariateTestKeys = [
      'student-t', 'welch-t', 'wilcoxon', 'anova', 'welch-anova', 
      'kruskal-wallis', 'pearson', 'spearman', 'linearregression'
    ];
    
    console.log('[DIAGNOSTICS] getBivariateTests - Looking for these bivariate patterns:', bivariateTestKeys);
    
    // Use exact matching since test names come directly from JSON keys
    const filteredTests = testNames.filter(test => {
      const isMatch = bivariateTestKeys.includes(test);
      console.log(`[DIAGNOSTICS] getBivariateTests - Test ${test}: matches bivariate pattern = ${isMatch}`);
      return isMatch;
    });
    
    console.log('[DIAGNOSTICS] getBivariateTests - Filtered bivariate tests:', filteredTests);
    return filteredTests;
  }

  // Test type classification methods
  isTTestType(testKey: string): boolean {
    const tTestKeywords = ['student-t', 'welch-t', 't-test', 'ttest'];
    return tTestKeywords.some(keyword => testKey.toLowerCase().includes(keyword));
  }

  isAnovaType(testKey: string): boolean {
    const anovaKeywords = ['anova', 'welch-anova', 'kruskal-wallis'];
    return anovaKeywords.some(keyword => testKey.toLowerCase().includes(keyword));
  }

  isCorrelationType(testKey: string): boolean {
    const corrKeywords = ['pearson', 'spearman', 'correlation'];
    return corrKeywords.some(keyword => testKey.toLowerCase().includes(keyword));
  }

  isNonParametricTest(testKey: string): boolean {
    const nonParamKeywords = ['wilcoxon', 'kruskal-wallis', 'spearman'];
    return nonParamKeywords.some(keyword => testKey.toLowerCase().includes(keyword));
  }

  // Linear Regression specific methods
  isLinearRegressionTest(testKey: string): boolean {
    const linearRegressionKeywords = ['linearregression', 'linear-regression', 'linear_regression', 'lm', 'regression', 'lr'];
    return linearRegressionKeywords.some(keyword => testKey.toLowerCase().includes(keyword));
  }

  getLinearRegressionFormula(testKey: string): string | null {
    const test = this.results()?.results?.[testKey];
    if (test?.formula) {
      return test.formula;
    }
    // If no formula is provided by the API, we can construct a generic one
    if (this.isLinearRegressionTest(testKey)) {
      return 'outcome ~ covariates + omic_variables';
    }
    return null;
  }

  hasInfluentialRemovedData(testKey: string): boolean {
    const test = this.results()?.results?.[testKey];
    return !!(test?.data_removed_influentials && test.data_removed_influentials.length > 0);
  }

  getInfluentialRemovedData(testKey: string): any[] {
    const test = this.results()?.results?.[testKey];
    return test?.data_removed_influentials || [];
  }

  updateInfluentialRemovedTable(testKey: string) {
    if (!this.hasInfluentialRemovedData(testKey)) return;
    
    console.log('[DIAGNOSTICS] updateInfluentialRemovedTable - Starting for test:', testKey);
    
    const data = this.getInfluentialRemovedData(testKey);
    console.log('[DIAGNOSTICS] updateInfluentialRemovedTable - Retrieved data length:', data.length);
    console.log('[DIAGNOSTICS] updateInfluentialRemovedTable - Sample data:', data[0]);
    
    this.influentialRemovedDataSource.data = data;
    console.log('[DIAGNOSTICS] updateInfluentialRemovedTable - Data assigned to influential data source');
    
    // Get columns for influential removed data (similar pattern to main table)
    if (data.length > 0) {
      const sampleSize = Math.min(5, data.length);
      const allKeys = new Set<string>();
      
      for (let i = 0; i < sampleSize; i++) {
        Object.keys(data[i] || {}).forEach(key => allKeys.add(key));
      }
      
      this.influentialRemovedColumns = Array.from(allKeys);
      console.log('[DIAGNOSTICS] updateInfluentialRemovedTable - Columns determined:', this.influentialRemovedColumns);
    }
    
    // Connect paginator and sort after view init (similar to main table)
    setTimeout(() => {
      if (this.influentialPaginator) {
        console.log('[DIAGNOSTICS] updateInfluentialRemovedTable - Connecting paginator');
        this.influentialRemovedDataSource.paginator = this.influentialPaginator;
      } else {
        console.log('[DIAGNOSTICS] updateInfluentialRemovedTable - No paginator available');
      }
      
      if (this.influentialSort) {
        console.log('[DIAGNOSTICS] updateInfluentialRemovedTable - Connecting sort');
        this.influentialRemovedDataSource.sort = this.influentialSort;
      } else {
        console.log('[DIAGNOSTICS] updateInfluentialRemovedTable - No sort available');
      }
    });
  }

  getMultivariateTests(): string[] {
    const testNames = this.getTestNames();
    console.log('[DIAGNOSTICS] getMultivariateTests - All available test names:', testNames);
    
    // Exact test keys from the API response for multivariate tests
    const multivariateTestKeys = [
      'ridge', 'lasso', 'elasticNet', 'randomForest', 'boruta', 'rfe'
    ];
    
    console.log('[DIAGNOSTICS] getMultivariateTests - Looking for these multivariate patterns:', multivariateTestKeys);
    
    const filteredTests = testNames.filter(test => {
      const isMatch = multivariateTestKeys.includes(test);
      console.log(`[DIAGNOSTICS] getMultivariateTests - Test ${test}: matches multivariate pattern = ${isMatch}`);
      return isMatch;
    });
    
    console.log('[DIAGNOSTICS] getMultivariateTests - Filtered multivariate tests:', filteredTests);
    return filteredTests;
  }

  // Section management methods
  selectSection(section: 'bivariate' | 'multivariate' | 'summary') {
    if (this.selectedSection === section) return;
    
    // Clean up previous plots
    this.cleanupPlots();
    
    this.selectedSection = section;
    
    // Reset tab selections when switching sections
    if (section === 'bivariate') {
      const bivariateTests = this.getBivariateTests();
      this.selectedBivariateTab = bivariateTests.length > 0 ? bivariateTests[0] : null;
      this.selectedTab = this.selectedBivariateTab;
    } else if (section === 'multivariate') {
      const multivariateTests = this.getMultivariateTests();
      this.selectedMultivariateTab = multivariateTests.length > 0 ? multivariateTests[0] : null;
      this.selectedTab = this.selectedMultivariateTab;
    } else {
      this.selectedTab = null;
    }
    
    if (this.selectedTab) {
      this.updateTableForCurrentTab();
      this.cdr.detectChanges();
      setTimeout(() => this.createPlots(), 100);
    }
  }

  selectBivariateTab(tabName: string) {
    this.selectedBivariateTab = tabName;
    this.selectTab(tabName);
  }

  selectMultivariateTab(tabName: string) {
    this.selectedMultivariateTab = tabName;
    this.selectTab(tabName);
  }

  private cleanupPlots() {
    // Clean up all existing plots when switching sections
    const allTestNames = this.getTestNames();
    allTestNames.forEach(testName => {
      const plotContainer = document.getElementById('manhattan-plot-' + testName);
      if (plotContainer) {
        this.plotlyService.purge(plotContainer);
      }
      
      // Also clean up influential-removed plots for linear regression
      const influentialPlotContainer = document.getElementById('manhattan-plot-no-influential-' + testName);
      if (influentialPlotContainer) {
        this.plotlyService.purge(influentialPlotContainer);
      }
    });
  }
}

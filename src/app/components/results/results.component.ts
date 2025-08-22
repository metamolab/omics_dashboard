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
import { SessionService } from '../../services/session.service';
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
          <div class="error-icon">⚠️</div>
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
              @if (getBivariateTests().length > 0) {
                <li class="section-tab" [class.active]="selectedSection === 'bivariate'" (click)="selectSection('bivariate')">
                  <span class="section-icon">📊</span>
                  <span class="section-label">Analisi Bivariate</span>
                  <span class="section-count">({{ getBivariateTests().length }})</span>
                </li>
              }
              @if (getMultivariateTests().length > 0) {
                <li class="section-tab" [class.active]="selectedSection === 'multivariate'" (click)="selectSection('multivariate')">
                  <span class="section-icon">🔬</span>
                  <span class="section-label">Analisi Multivariate</span>
                  <span class="section-count">({{ getMultivariateTests().length }})</span>
                </li>
              }
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
                              <mat-paginator [pageSize]="15" [pageSizeOptions]="[5, 10, 15, 25, 50]" showFirstLastButtons></mat-paginator>
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
                                <mat-paginator #influentialPaginator [pageSize]="15" [pageSizeOptions]="[5, 10, 15, 25, 50]" showFirstLastButtons></mat-paginator>
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
                                  <th mat-header-cell *matHeaderCellDef mat-sort-header style="text-align: left !important;">{{ getColumnDisplayName(column) }}</th>
                                  <td mat-cell *matCellDef="let row" [style.text-align]="isNumericColumn(column) ? 'right' : 'left'">
                                    {{ formatCellValue(row[column], column) }}
                                  </td>
                                </ng-container>
                              }
                              <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                              <tr mat-row *matRowDef="let row; columns: displayedColumns;" [ngClass]="getRowClass(row)"></tr>
                            </table>
                            <mat-paginator [pageSize]="15" [pageSizeOptions]="[5, 10, 15, 25, 50]" showFirstLastButtons></mat-paginator>
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
                      
                      <!-- Method-specific Header Info -->
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
                              <span class="info-label">{{ getMethodInfoLabel(selectedMultivariateTab) }}</span>
                              <span class="info-value">{{ getMethodInfoValue(selectedMultivariateTab) }}</span>
                            </div>
                          </div>
                        </div>
                      }
                      
                      @if (selectedMultivariateTab === 'randomForest') {
                        <div class="regularization-info">
                          <div class="info-cards">
                            <div class="info-card">
                              <span class="info-label">Numero di Alberi</span>
                              <span class="info-value">{{ getRandomForestTrees(selectedMultivariateTab) }}</span>
                            </div>
                            <div class="info-card">
                              <span class="info-label">mtry Utilizzato</span>
                              <span class="info-value">{{ getRandomForestMtry(selectedMultivariateTab) }}</span>
                            </div>
                            <div class="info-card">
                              <span class="info-label">{{ getMethodInfoLabel(selectedMultivariateTab) }}</span>
                              <span class="info-value">{{ getMethodInfoValue(selectedMultivariateTab) }}</span>
                            </div>
                          </div>
                        </div>
                      }
                      
                      @if (selectedMultivariateTab === 'boruta') {
                        <div class="regularization-info">
                          <div class="info-cards">
                            <div class="info-card">
                              <span class="info-label">Caratteristiche Confermate</span>
                              <span class="info-value">{{ getBorutaConfirmedFeatures(selectedMultivariateTab) }}</span>
                            </div>
                            <div class="info-card">
                              <span class="info-label">mtry Utilizzato</span>
                              <span class="info-value">{{ getBorutaMtry(selectedMultivariateTab) }}</span>
                            </div>
                            <div class="info-card">
                              <span class="info-label">Numero di Alberi</span>
                              <span class="info-value">{{ getBorutaTrees(selectedMultivariateTab) }}</span>
                            </div>
                            <div class="info-card">
                              <span class="info-label">{{ getMethodInfoLabel(selectedMultivariateTab) }}</span>
                              <span class="info-value">{{ getMethodInfoValue(selectedMultivariateTab) }}</span>
                            </div>
                          </div>
                        </div>
                      }
                      
                      @if (selectedMultivariateTab === 'rfe') {
                        <div class="regularization-info">
                          <div class="info-cards">
                            <div class="info-card">
                              <span class="info-label">Dimensioni Sottoinsiemi Testati</span>
                              <span class="info-value">{{ getRFESubsetSizesTested(selectedMultivariateTab) }}</span>
                            </div>
                            <div class="info-card">
                              <span class="info-label">Dimensione Ottimale</span>
                              <span class="info-value">{{ getRFEOptimalSize(selectedMultivariateTab) }}</span>
                            </div>
                            <div class="info-card">
                              <span class="info-label">{{ getMethodInfoLabel(selectedMultivariateTab) }}</span>
                              <span class="info-value">{{ getMethodInfoValue(selectedMultivariateTab) }}</span>
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
                          <mat-paginator [pageSize]="15" [pageSizeOptions]="[5, 10, 15, 25, 50]" showFirstLastButtons></mat-paginator>
                        </div>
                        <!-- Remove the feature importance plot for Boruta -->
                        @if (selectedMultivariateTab !== 'boruta') {
                          <div class="feature-importance-plot" [attr.id]="'feature-plot-' + selectedMultivariateTab" style="flex: 1; min-width: 300px; height: 400px;">
                            @if (hasImportanceData(selectedMultivariateTab)) {
                              <!-- Feature importance plot will be rendered here for all methods with importance data -->
                            } @else {
                              <!-- Manhattan plot for methods without importance data -->
                              <div [attr.id]="'manhattan-plot-' + selectedMultivariateTab" style="width: 100%; height: 100%;"></div>
                            }
                          </div>
                        }
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

          <!-- Empty State or No Tests Found -->
          @if ((selectedSection === 'bivariate' && getBivariateTests().length === 0) || 
               (selectedSection === 'multivariate' && getMultivariateTests().length === 0)) {
            <div class="empty-section">
              <div class="empty-icon">🔍</div>
              <h3>Nessun risultato trovato</h3>
              <p>Non sono stati trovati risultati per questa categoria di test.</p>
            </div>
          }

          <!-- Global fallback for completely empty results -->
          @if (!hasAnyTests()) {
            <div class="empty-section">
              <div class="empty-icon">⚠️</div>
              <h3>Nessun Test Disponibile</h3>
              <p>L'analisi è stata completata ma non sono stati trovati test riconosciuti.</p>
              <p class="placeholder-note">Questo potrebbe indicare un problema nell'elaborazione dei risultati.</p>
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

    /* Table Styles - Updated with stronger, more distinguishable colors and black text */
    .significant-highly {
      background-color: #fecaca !important; /* Stronger red for p < 0.001 */
      border-left: 6px solid #dc2626 !important;
      color: #000000 !important;
    }
    
    .significant-highly:hover {
      background-color: #fca5a5 !important;
      box-shadow: 0 2px 8px rgba(220, 38, 38, 0.2) !important;
    }

    .significant-very {
      background-color: #fed7aa !important; /* Stronger orange for p < 0.01 */
      border-left: 6px solid #f97316 !important;
      color: #000000 !important;
    }
    
    .significant-very:hover {
      background-color: #fdba74 !important;
      box-shadow: 0 2px 8px rgba(249, 115, 22, 0.2) !important;
    }

    .significant-moderate {
      background-color: #fef3c7 !important; /* Stronger yellow for p < 0.05 */
      border-left: 6px solid #f59e0b !important;
      color: #000000 !important;
    }
    
    .significant-moderate:hover {
      background-color: #fde68a !important;
      box-shadow: 0 2px 8px rgba(245, 158, 11, 0.2) !important;
    }

    .significant-confirmed {
      background-color: #bbf7d0 !important; /* Stronger green for confirmed features */
      border-left: 6px solid #22c55e !important;
      color: #000000 !important;
    }
    
    .significant-confirmed:hover {
      background-color: #86efac !important;
      box-shadow: 0 2px 8px rgba(34, 197, 94, 0.2) !important;
    }

    .mat-mdc-table {
      background: white;
    }

    .mat-mdc-header-cell {
      font-weight: 600;
      color: #374151;
      text-align: left !important;
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
  forceNewAnalysis = signal(false); // Flag to force new analysis instead of loading existing
  
  // Cached test lists to prevent constant re-evaluation
  testNames = signal<string[]>([]);
  
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
    private sessionService: SessionService,
    private cdr: ChangeDetectorRef
  ) {}

  // Navigation methods
  selectSection(section: 'bivariate' | 'multivariate' | 'summary') {
    this.selectedSection = section;
    console.log('[DIAGNOSTICS] Section changed to:', section);
    
    // Reset tab selections when changing sections
    if (section === 'bivariate') {
      this.selectedMultivariateTab = null;
    } else if (section === 'multivariate') {
      this.selectedBivariateTab = null;
    }
    
    // Auto-select first available test in new section
    setTimeout(() => {
      if (section === 'bivariate') {
        const bivariateTests = this.getBivariateTests();
        if (bivariateTests.length > 0 && !this.selectedBivariateTab) {
          this.selectBivariateTab(bivariateTests[0]);
        }
      } else if (section === 'multivariate') {
        const multivariateTests = this.getMultivariateTests();
        if (multivariateTests.length > 0 && !this.selectedMultivariateTab) {
          this.selectMultivariateTab(multivariateTests[0]);
        }
      }
    }, 100);
  }

  selectBivariateTab(testKey: string) {
    console.log('[DIAGNOSTICS] Selecting bivariate tab:', testKey);
    this.selectedBivariateTab = testKey;
    this.selectedTab = testKey;
    this.updateTableForCurrentTab();
    setTimeout(() => this.createPlots(), 250);
  }

  selectMultivariateTab(testKey: string) {
    console.log('[DIAGNOSTICS] Selecting multivariate tab:', testKey);
    this.selectedMultivariateTab = testKey;
    this.selectedTab = testKey;
    this.updateTableForCurrentTab();
    setTimeout(() => this.createPlots(), 250);
  }



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
    
    // Determine the current tab based on the selected section
    let currentTab: string | null = null;
    if (this.selectedSection === 'bivariate' && this.selectedBivariateTab) {
      currentTab = this.selectedBivariateTab;
    } else if (this.selectedSection === 'multivariate' && this.selectedMultivariateTab) {
      currentTab = this.selectedMultivariateTab;
    }
    
    console.log('[DIAGNOSTICS] updateTableDataSource - currentTab:', currentTab);
    
    const data = this.getTestData(currentTab || '');
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
    
    // Determine the current tab based on the selected section
    let currentTab: string | null = null;
    if (this.selectedSection === 'bivariate' && this.selectedBivariateTab) {
      currentTab = this.selectedBivariateTab;
    } else if (this.selectedSection === 'multivariate' && this.selectedMultivariateTab) {
      currentTab = this.selectedMultivariateTab;
    }
    
    console.log('[DIAGNOSTICS] updateTableForCurrentTab - currentTab:', currentTab, 'section:', this.selectedSection);
    
    if (!currentTab) {
      console.log('[DIAGNOSTICS] updateTableForCurrentTab - No selected tab, returning');
      return;
    }
    
    // Get the columns for the current test
    console.log('[DIAGNOSTICS] updateTableForCurrentTab - Getting columns for test');
    this.displayedColumns = this.getColumnsForTest(currentTab);
    console.log('[DIAGNOSTICS] updateTableForCurrentTab - Displayed columns:', this.displayedColumns);
    
    // Update the data source with proper reinitialization
    console.log('[DIAGNOSTICS] updateTableForCurrentTab - Updating table data source');
    this.updateTableDataSource();
    
    // Handle linear regression tests with influential removed data
    if (this.isLinearRegressionTest(currentTab)) {
      console.log('[DIAGNOSTICS] updateTableForCurrentTab - Handling linear regression influential data');
      this.updateInfluentialRemovedTable(currentTab);
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
      'P.value': 'p-value',
      'Pr(>|t|)': 'p-value',
      'p.value': 'p-value',
      'pvalue': 'p-value',
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
      'estimate', 'logFC', 'coefficient', 'Coefficient', 'pValue', 'pval', 'p_value', 'P.value', 'Pr(>|t|)', 'p.value', 'pvalue',
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
        let formattedValue = '';
        
        // Use scientific notation for very large or very small numbers
        if (Math.abs(numValue) >= 1e6 || (Math.abs(numValue) <= 1e-6 && numValue !== 0)) {
          formattedValue = numValue.toExponential(2);
        } else {
          // Different precision for different types of values using standard notation
          if (columnKey.includes('pValue') || columnKey.includes('fdr') || 
              columnKey.includes('pval') || columnKey.includes('padj') ||
              columnKey.includes('P.value') || columnKey.includes('Pr(>|t|)') ||
              columnKey.includes('p.value') || columnKey.includes('pvalue')) {
            formattedValue = numValue.toFixed(6); // 6 decimals for p-values in standard notation
          } else if (columnKey.includes('correlation')) {
            formattedValue = numValue.toFixed(3); // 3 decimals for correlations
          } else if (columnKey === 'Coefficient' || columnKey === 'coefficient') {
            formattedValue = numValue.toFixed(4); // 4 decimals for coefficients
          } else if (columnKey === 'importance') {
            formattedValue = numValue.toFixed(2); // 2 decimals for importance
          } else {
            formattedValue = numValue.toFixed(4); // 4 decimals for other numeric values
          }
        }
        
        // Add asterisk for significant FDR values (â‰¤ 0.05)
        if ((columnKey === 'fdr' || columnKey === 'adj_pval' || columnKey === 'padj') && numValue <= 0.05) {
          formattedValue += ' *';
        }
        
        return formattedValue;
      }
    }
    
    // For boolean or categorical values
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    
    return value.toString();
  }

  getRowClass(row: any): string {
    // Dynamic row styling based on significance thresholds matching Manhattan plots
    const classes: string[] = [];
    
    // Get p-value from any available p-value column
    const pValueFields = ['pValue', 'pval', 'p_value', 'P.value', 'Pr(>|t|)', 'p.value', 'pvalue'];
    let pVal: number | null = null;
    
    for (const field of pValueFields) {
      if (row[field] !== undefined && row[field] !== null) {
        const parsedPVal = Number(row[field]);
        if (!isNaN(parsedPVal)) {
          pVal = parsedPVal;
          break;
        }
      }
    }
    
    // Apply color coding based on p-value thresholds matching Manhattan plot colors
    if (pVal !== null) {
      if (pVal < 0.001) {
        classes.push('significant-highly'); // Dark red for p < 0.001
      } else if (pVal < 0.01) {
        classes.push('significant-very'); // Orange for p < 0.01
      } else if (pVal < 0.05) {
        classes.push('significant-moderate'); // Yellow for p < 0.05
      }
    }
    
    // Check for decision-based significance (e.g., Boruta results)
    if (row.decision && (row.decision === 'Confirmed' || row.decision === 'Important')) {
      classes.push('significant-confirmed'); // Green for confirmed features
    }
    
    return classes.join(' ');
  }

  ngOnInit() {
    console.log('[DIAGNOSTICS] ngOnInit - Component initialization started');
    
    // Notify navigation service that we're entering analysis state (disable backward navigation)
    this.navigationService.setAnalysisActiveState(true);
    
    // Check if we have an analysisId from recovery workflow
    const recoveryAnalysisId = this.dataFlowService.analysisId();
    
    if (recoveryAnalysisId) {
      console.log('[DIAGNOSTICS] Recovery mode detected with analysisId:', recoveryAnalysisId);
      // In recovery mode, skip prerequisites check and load results directly
      this.analysisId.set(recoveryAnalysisId);
      this.loading.set(true);
      this.error.set(null);
      
      // Load the results for the recovered analysis directly
      this.apiService.getAnalysisResults(recoveryAnalysisId).subscribe({
        next: (result: AnalysisResult) => {
          console.log('[DIAGNOSTICS] Successfully loaded recovered analysis results:', result);
          this.handleLoadedResults(result, false); // false = don't start new analysis on missing data
        },
        error: (err: any) => {
          console.error('[DIAGNOSTICS] Error loading recovered analysis results:', err);
          this.loading.set(false);
          this.error.set(err.message || 'Errore nel caricamento dei risultati dell\'analisi recuperata');
        }
      });
      return;
    }
    
    // Normal workflow: Check prerequisites
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

    // Check if we should force a new analysis (e.g., after clicking "New Analysis")
    if (this.forceNewAnalysis()) {
      console.log('[DIAGNOSTICS] Force new analysis flag set, starting fresh analysis');
      this.forceNewAnalysis.set(false); // Reset the flag
      this.submitAnalysis();
      return;
    }

    // First try to load existing results before starting a new analysis
    console.log('[DIAGNOSTICS] Prerequisites satisfied, starting workflow');
    this.loadExistingResults();
  }

  /**
   * No longer needed - using direct method calls instead of cached signals
   */
  private updateCachedTestLists() {
    // This method is kept for compatibility but does nothing
    // since we're using direct method calls now
    console.log('[DIAGNOSTICS] updateCachedTestLists - using direct methods, no caching needed');
  }

  private generateAnalysisId(): string {
    // Use the centralized session service for consistent ID generation
    const analysisId = this.sessionService.generateAnalysisId();
    
    console.log('[DIAGNOSTICS] Generated analysisId using session service:', {
      analysisId,
      sessionInfo: this.sessionService.getSessionInfo()
    });

    return analysisId;
  }

  private loadExistingResults() {
    console.log('[DIAGNOSTICS] loadExistingResults - Starting to load existing results');
    
    // First check if there's a pre-set analysisId from recovery
    const presetAnalysisId = this.dataFlowService.analysisId();
    if (presetAnalysisId) {
      console.log('[DIAGNOSTICS] Found preset analysisId from recovery:', presetAnalysisId);
      this.analysisId.set(presetAnalysisId);
      this.loading.set(true);
      this.error.set(null);
      
      // For recovery mode, load results directly
      this.apiService.getAnalysisResults(presetAnalysisId).subscribe({
        next: (result: AnalysisResult) => {
          console.log('[DIAGNOSTICS] Successfully loaded recovered analysis results:', result);
          this.handleLoadedResults(result, false); // false = don't start new analysis on missing data
        },
        error: (err: any) => {
          console.error('[DIAGNOSTICS] Error loading recovered analysis results:', err);
          this.loading.set(false);
          this.error.set(err.message || 'Errore nel caricamento dei risultati dell\'analisi');
        }
      });
      return;
    }
    
    // Generate analysis ID for normal workflow
    const analysisId = this.generateAnalysisId();
    console.log('[DIAGNOSTICS] Generated analysisId for normal workflow:', analysisId);

    // Set the analysis ID for display and update global state
    this.analysisId.set(analysisId);
    this.dataFlowService.setAnalysisId(analysisId);
    this.dataFlowService.setRecoveryMode(false);
    this.loading.set(true);
    this.error.set(null);

    // For new analyses, don't try to load existing results - just start the analysis
    console.log('[DIAGNOSTICS] Starting new analysis');
    this.submitAnalysis();
  }

  private handleLoadedResults(result: AnalysisResult, startNewAnalysisOnMissing: boolean = true) {
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
      console.log('[DIAGNOSTICS] No results found in existing data');
      if (startNewAnalysisOnMissing) {
        console.log('[DIAGNOSTICS] Starting new analysis');
        this.submitAnalysis();
      } else {
        console.log('[DIAGNOSTICS] Not starting new analysis, showing error');
        this.loading.set(false);
        this.error.set('Nessun risultato trovato per questa analisi');
      }
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
      console.log('[DIAGNOSTICS] No test data found in existing results');
      if (startNewAnalysisOnMissing) {
        console.log('[DIAGNOSTICS] Starting new analysis');
        this.submitAnalysis();
      } else {
        console.log('[DIAGNOSTICS] Not starting new analysis, showing error');
        this.loading.set(false);
        this.error.set('Nessun dato di test trovato per questa analisi');
      }
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

    // Load existing results - simple approach like recovery
    this.loading.set(false);
    this.results.set(properResult);
    this.analysisStatus.set('completed');
    this.resultsReady.set(true);
    this.showResults.set(true); // Automatically show results
    
    console.log('[DIAGNOSTICS] Results loaded successfully:', {
      hasResults: !!this.results(),
      resultsKeys: this.results()?.results ? Object.keys(this.results()!.results) : [],
      bivariateTests: this.getBivariateTests(),
      multivariateTests: this.getMultivariateTests(),
      totalTests: this.getTotalTestCount(),
      hasAnyTests: this.hasAnyTests()
    });
    
    this.navigationService.updateNavigationStatus();
    
    // Initialize UI immediately
    this.initializeDefaultSelections();
    
    // Create plots after a short delay
    setTimeout(() => {
      this.createPlots();
    }, 100);
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
    console.log('[DIAGNOSTICS] initializeDefaultSelections - Starting');
    
    const bivariateTests = this.getBivariateTests();
    const multivariateTests = this.getMultivariateTests();
    
    console.log('[DIAGNOSTICS] Available tests:', {
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
      console.log('[DIAGNOSTICS] Selected bivariate section with test:', this.selectedBivariateTab);
    } else if (multivariateTests.length > 0) {
      this.selectedSection = 'multivariate';
      this.selectedMultivariateTab = multivariateTests[0];
      this.selectedTab = this.selectedMultivariateTab;
      console.log('[DIAGNOSTICS] Selected multivariate section with test:', this.selectedMultivariateTab);
    } else {
      this.selectedSection = 'summary';
      this.selectedTab = null;
      console.log('[DIAGNOSTICS] No tests found, selected summary section');
    }
    
    if (this.selectedTab) {
      this.lastTab = this.selectedTab;
      this.updateTableForCurrentTab();
      console.log('[DIAGNOSTICS] Updated table for current tab:', this.selectedTab);
    }
    
    console.log('[DIAGNOSTICS] initializeDefaultSelections completed - Final state:', {
      selectedSection: this.selectedSection,
      selectedTab: this.selectedTab,
      selectedBivariateTab: this.selectedBivariateTab,
      selectedMultivariateTab: this.selectedMultivariateTab
    });
  }

  ngAfterViewChecked() {
    // Se la tab è cambiata, aggiorna il plot solo se non è già stato fatto
    if (this.selectedTab && this.selectedTab !== this.lastTab) {
      const plotContainer = document.getElementById('manhattan-plot-' + this.selectedTab);
      if (plotContainer && !plotContainer.hasChildNodes()) {
        setTimeout(() => this.createPlots(), 100);
      }
      this.lastTab = this.selectedTab;
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

    // Generate consistent analysis ID
    const analysisId = this.generateAnalysisId();
    console.log('[DIAGNOSTICS] Using analysisId for submission:', analysisId);
    
    // Extract userId and sessionId from analysisId
    const [userId, sessionId] = analysisId.split('_', 2);
    
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
    
    // Update global state to reflect new analysis (clears recovery mode)
    this.dataFlowService.setAnalysisId(analysisId);
    this.dataFlowService.setRecoveryMode(false);

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
    // Polling for status every 30 seconds
    const pollInterval = 30000; // 30 seconds
    
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
            // Analysis completed successfully - show button to view results
            console.log('[DIAGNOSTICS] Analysis completed successfully');
            this.loading.set(false);
            this.analysisStatus.set('completed');
            this.resultsReady.set(true);
            this.showResults.set(false); // Don't show results yet, show button instead
          } else if (response.status === 'error') {
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

  // Method called when user clicks "View Results" button
  private getAnalysisResults(analysisId: string) {
    // This method is now simplified - just delegate to viewResults logic
    this.apiService.getAnalysisResults(analysisId).subscribe({
      next: (result: AnalysisResult) => {
        console.log('[DIAGNOSTICS] getAnalysisResults - Successfully loaded results:', result);
        this.handleLoadedResults(result, false);
      },
      error: (err: any) => {
        console.error('[DIAGNOSTICS] getAnalysisResults - Error loading results:', err);
        this.loading.set(false);
        this.error.set(err.message || 'Errore nel recupero dei risultati dell\'analisi');
      }
    });
  }

  private createPlots() {
    const results = this.results()?.results;
    if (!results) return;
    
    console.log('[DIAGNOSTICS] createPlots called with:', {
      hasResults: !!results,
      selectedSection: this.selectedSection,
      selectedBivariateTab: this.selectedBivariateTab,
      selectedMultivariateTab: this.selectedMultivariateTab
    });
    
    // Determine which tab is currently selected based on the section
    let selectedTab: string | null = null;
    if (this.selectedSection === 'bivariate' && this.selectedBivariateTab) {
      selectedTab = this.selectedBivariateTab;
    } else if (this.selectedSection === 'multivariate' && this.selectedMultivariateTab) {
      selectedTab = this.selectedMultivariateTab;
    }
    
    if (!selectedTab) {
      console.log('[DIAGNOSTICS] No tab selected for current section');
      return;
    }
    
    const test = results[selectedTab];
    if (!test?.data || test.data.length === 0) {
      console.log('[DIAGNOSTICS] No test data found for tab:', selectedTab);
      return;
       }
    
 }
    
    console.log(`[DIAGNOSTICS] Creating plots for test: ${selectedTab} in section: ${this.selectedSection}`);
    console.log('Test data structure:', {
      testName: test.testName,
      dataLength: test.data.length,
      sampleData: test.data[0]
    });
    
    // Wait for the DOM to be updated with the new tab content
    setTimeout(() => {
      // Handle different plot types based on test type and section
      if (selectedTab === 'boruta') {
        // Create Boruta boxplot
        this.createBorutaBoxplot(selectedTab);
      } else if (this.hasImportanceData(selectedTab)) {
        // Use feature importance plot for all multivariate methods with importance data
        this.createFeatureImportancePlot(selectedTab);
      } else if (this.isLinearRegressionTest(selectedTab)) {
        // Use the dedicated linear regression Manhattan plot for linear regression tests
        this.createLinearRegressionManhattanPlot(selectedTab, test.data, 'manhattan-plot-' + selectedTab);
      } else if (this.isFeatureSelectionMethod(selectedTab) || this.getMultivariateTests().includes(selectedTab)) {
        // For multivariate methods without importance data (and feature selection methods that don't have importance)
        // These use Manhattan plots
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
        this.createLinearRegressionManhattanPlot(selectedTab, influentialRemovedData, 'manhattan-plot-no-influential-' + selectedTab);
      }
    }, 250); // Increased timeout to ensure DOM is ready
  }

  private createLinearRegressionManhattanPlot(testKey: string, data: any[], containerId: string) {
    console.log(`[DEBUG] createLinearRegressionManhattanPlot called with:`, {
      testKey,
      containerId,
      dataLength: data?.length
    });
    
    const plotContainer = document.getElementById(containerId);
    if (!plotContainer) {
      console.warn('Plot container not found:', containerId);
      return;
    }

    try {
      console.log(`Creating Linear Regression Manhattan plot for ${testKey} with ${data.length} data points`);
      
      if (!data || data.length === 0) {
        console.error('No data available for linear regression plotting');
        return;
      }

      // Use the dedicated linear regression Manhattan plot from PlotlyService
      this.plotlyService.createLinearRegressionManhattanPlot(
        plotContainer,
        data,
        {
          title: containerId.includes('no-influential') 
            ? `Linear Regression Manhattan Plot (No Influentials) - ${testKey}`
            : `Linear Regression Manhattan Plot - ${testKey}`,
          xaxis: 'Variables',
          yaxis: '-log10(p-value)',
          significanceLine: true,
          significanceThreshold: -Math.log10(0.05)
        }
      );
    } catch (error) {
      console.error('Error creating linear regression manhattan plot:', error);
      plotContainer.innerHTML = `
        <div style="height: 100%; display: flex; align-items: center; justify-content: center; color: #ef4444; text-align: center;">
          <div>
            <p>Errore nella creazione del linear regression manhattan plot.</p>
            <p>Verifica che i dati contengano valori validi per variable e p-value.</p>
          </div>
        </div>
      `;
    }
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
      const pValueFields = ['pValue', 'pval', 'p_value', 'P.value', 'Pr(>|t|)', 'p.value', 'pvalue'];
      const pValueField = pValueFields.find(field => row[field] !== undefined && row[field] !== null);        if (!pValueField) return false;
        
        const p = Number(row[pValueField]);
        
        // Detect variable column dynamically - check for common variable column names
        const possibleVariableColumns = ['Variable', 'variable', 'gene', 'feature'];
        const variableColumn = possibleVariableColumns.find(col => row[col] !== undefined && row[col] !== null);
        const hasVariable = variableColumn && row[variableColumn] && row[variableColumn].toString().trim() !== '';
        
        const isValid = !isNaN(p) && p > 0 && hasVariable;
        if (!isValid) {
          invalidCount++;
          if (invalidCount <= 5) { // Log only first 5 invalid rows to avoid console spam
            console.warn('Invalid data point:', {
              row,
              variableColumn,
              variable: variableColumn ? `${row[variableColumn]} (${typeof row[variableColumn]})` : 'undefined',
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
      const pValueFields = ['pValue', 'pval', 'p_value', 'P.value', 'Pr(>|t|)', 'p.value', 'pvalue'];
      const pValueColumn = pValueFields.find(field => validData[0][field] !== undefined) || 'pValue';
      
      // Detect the actual variable column name
      const possibleVariableColumns = ['Variable', 'variable', 'gene', 'feature'];
      const variableColumn = possibleVariableColumns.find(col => validData[0][col] !== undefined) || 'Variable';
      
      console.log('Using columns:', {
        pValueColumn,
        variableColumn,
        availableColumns: Object.keys(validData[0] || {})
      });
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
          variableColumn: variableColumn,
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

  private createFeatureImportancePlot(selectedTab: string) {
    const results = this.results()?.results;
    if (!results) return;
    
    const test = results[selectedTab];
    if (!test?.data || test.data.length === 0) return;
    
    const plotContainer = document.getElementById('feature-plot-' + selectedTab);
    if (!plotContainer) {
      console.warn('Feature plot container not found for tab:', selectedTab);
      return;
    }

    // Auto-detect importance column
    const firstRow = test.data[0];
    let importanceColumn = 'importance';
    if ('Importance' in firstRow) {
      importanceColumn = 'Importance';
    } else if ('importance' in firstRow) {
      importanceColumn = 'importance';
    }

    // Auto-detect variable column
    let variableColumn = 'Variable';
    if ('variable' in firstRow) {
      variableColumn = 'variable';
    } else if ('Variable' in firstRow) {
      variableColumn = 'Variable';
    } else if ('feature' in firstRow) {
      variableColumn = 'feature';
    } else if ('gene' in firstRow) {
      variableColumn = 'gene';
    }

    // Use the PlotlyService method
    this.plotlyService.createFeatureImportancePlot(
      plotContainer,
      test.data,
      {
        title: `Feature Importance - ${test.testName || selectedTab}`,
        topN: 20,
        variableColumn: variableColumn,
        importanceColumn: importanceColumn,
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

  private createBorutaBoxplot(selectedTab: string) {
    const plotContainer = document.getElementById('boruta-boxplot-' + selectedTab);
    if (!plotContainer) {
      console.warn('Boruta boxplot container not found:', 'boruta-boxplot-' + selectedTab);
      return;
    }

    const test = this.results()?.results?.[selectedTab];
    if (!test?.data || !Array.isArray(test.data) || test.data.length === 0) {
      console.error('No Boruta data available for plotting');
      plotContainer.innerHTML = `
        <div style="height: 100%; display: flex; align-items: center; justify-content: center; color: #ef4444; text-align: center;">
          <div>
            <p>No Boruta data available for plotting.</p>
            <p style="font-size: 12px;">This plot shows feature importance distributions from Boruta analysis.</p>
          </div>
        </div>
      `;
      return;
    }

    console.log('Creating Boruta boxplot with data:', test.data);

    // Prepare data for individual feature boxplots (typical Boruta format)
    const borutaFeatures = test.data.map((item: any) => ({
      variable: item.Variable || item.variable || item.feature,
      meanImp: item.meanImp || item.mean_importance || item.importance || 0,
      medianImp: item.medianImp || item.median_importance || 0,
      minImp: item.minImp || item.min_importance || 0,
      maxImp: item.maxImp || item.max_importance || 0,
      normHits: item.normHits || item.norm_hits || 0,
      decision: item.decision || item.Decision || 'Unknown',
      // For real Boruta data, this would be the importance values across all runs
      importanceHistory: item.importanceHistory || item.importance_history || []
    }));

    // Color mapping for Boruta decisions
    const decisionColors = {
      'Confirmed': '#16a085',    // Darker green
      'Tentative': '#f39c12',    // Orange
      'Rejected': '#e74c3c',     // Red
      'Unknown': '#95a5a6'       // Gray
    };

    // Sort features: Confirmed first, then Tentative, then Rejected, within each group by importance
    const sortedFeatures = borutaFeatures.sort((a: any, b: any) => {
      const orderMap = { 'Confirmed': 0, 'Tentative': 1, 'Rejected': 2, 'Unknown': 3 };
      const orderA = orderMap[a.decision as keyof typeof orderMap] ?? 3;
      const orderB = orderMap[b.decision as keyof typeof orderMap] ?? 3;
      
      if (orderA !== orderB) return orderA - orderB;
      return b.meanImp - a.meanImp; // Sort by importance within decision group
    });

    const traces: any[] = [];

    // Create individual boxplot for each feature
    sortedFeatures.forEach((feature: any, index: number) => {
      const color = decisionColors[feature.decision as keyof typeof decisionColors] || '#95a5a6';
      
      // Create importance distribution data
      let yValues: number[];
      
      if (feature.importanceHistory && feature.importanceHistory.length > 0) {
        // Use actual importance history if available
        yValues = feature.importanceHistory;
      } else {
        // Generate synthetic distribution from min/mean/max values for visualization
        const q1 = feature.minImp + (feature.meanImp - feature.minImp) * 0.25;
        const q3 = feature.meanImp + (feature.maxImp - feature.meanImp) * 0.25;
        
        yValues = [
          feature.minImp,
          q1,
          feature.meanImp,
          q3,
          feature.maxImp,
          // Add some variance around the mean
          feature.meanImp * 0.9,
          feature.meanImp * 1.1,
          feature.meanImp * 0.95,
          feature.meanImp * 1.05
        ].filter(val => val !== undefined && val !== null && !isNaN(val));
      }

      traces.push({
        y: yValues,
        type: 'box',
        name: feature.variable,
        x: [feature.variable],
        marker: { 
          color: color,
          opacity: 0.7,
          line: { 
            color: color, 
            width: 2 
          }
        },
        boxpoints: 'outliers',
        jitter: 0.3,
        pointpos: 0,
        showlegend: false,
        hovertemplate: `
          <b>%{x}</b><br>
          Decision: ${feature.decision}<br>
          Mean Importance: ${feature.meanImp.toFixed(3)}<br>
          Median: ${feature.medianImp.toFixed(3)}<br>
          Norm Hits: ${feature.normHits}<br>
          <extra></extra>
        `
      });
    });

    // Add shadow features if available
    if (test.shadowStats) {
      const shadowFeatures = ['shadowMin', 'shadowMean', 'shadowMax'];
      shadowFeatures.forEach(shadowType => {
        if (test.shadowStats[shadowType]) {
          const shadowData = test.shadowStats[shadowType];
          const shadowValues = shadowData.values || [shadowData.importance || shadowData.meanImp || 0];
          
          traces.push({
            y: shadowValues,
            type: 'box',
            name: shadowType.replace('shadow', 'Shadow '),
            x: [shadowType.replace('shadow', 'Shadow ')],
            marker: { 
              color: '#34495e',
              opacity: 0.8,
              line: { 
                color: '#2c3e50', 
                width: 2 
              }
            },
            boxpoints: 'outliers',
            showlegend: true,
            hovertemplate: `
              <b>%{x}</b><br>
              Shadow Feature<br>
              Importance: %{y}<br>
              <extra></extra>
            `
          });
        }
      });
    }

    // Add legend entries for decision types
    const uniqueDecisions = [...new Set(sortedFeatures.map((f: any) => f.decision))];
    uniqueDecisions.forEach(decision => {
      if (decision !== 'Unknown') {
        traces.push({
          x: [null],
          y: [null],
          type: 'scatter',
          mode: 'markers',
          marker: {
            size: 12,
            color: decisionColors[decision as keyof typeof decisionColors],
            symbol: 'square',
            line: {
              color: 'white',
              width: 1
            }
          },
          name: `${decision} Features`,
          showlegend: true,
          hoverinfo: 'skip'
        });
      }
    });

    const layout = {
      title: {
        text: 'Boruta Feature Selection - Importance Distribution',
        font: { 
          size: 16, 
          family: 'Arial, sans-serif',
          color: '#2c3e50'
        }
      },
      xaxis: {
        title: {
          text: 'Features',
          font: { size: 12, color: '#2c3e50' }
        },
        tickfont: { size: 9, color: '#2c3e50' },
        tickangle: -45,
        automargin: true,
        gridcolor: '#ecf0f1',
        linecolor: '#bdc3c7'
      },
      yaxis: {
        title: {
          text: 'Variable Importance',
          font: { size: 12, color: '#2c3e50' }
        },
        tickfont: { size: 11, color: '#2c3e50' },
        gridcolor: '#ecf0f1',
        linecolor: '#bdc3c7',
        zeroline: true,
        zerolinecolor: '#95a5a6'
      },
      showlegend: true,
      legend: {
        x: 1.02,
        y: 1,
        xanchor: 'left',
        yanchor: 'top',
        bgcolor: 'rgba(255, 255, 255, 0.9)',
        bordercolor: '#bdc3c7',
        borderwidth: 1,
        font: { size: 10 }
      },
      margin: { l: 70, r: 140, t: 70, b: 120 },
      paper_bgcolor: 'white',
      plot_bgcolor: '#fafafa',
      hovermode: 'closest',
      boxgap: 0.5,
      boxgroupgap: 0.1,
      font: {
        family: 'Arial, sans-serif',
        size: 11,
        color: '#2c3e50'
      }
    };

    const config = {
      responsive: true,
      displayModeBar: true,
      modeBarButtonsToRemove: [
        'pan2d', 'select2d', 'lasso2d', 'resetScale2d', 'autoScale2d'
      ],
      displaylogo: false,
      toImageButtonOptions: {
        format: 'png',
        filename: 'boruta_plot',
        height: 500,
        width: 800,
        scale: 1
      }
    };

    // Use PlotlyService to create the plot
    this.plotlyService.createPlot(plotContainer, traces, layout, config)
      .catch(error => {
        console.error('Error creating Boruta boxplot:', error);
        plotContainer.innerHTML = `
          <div style="height: 100%; display: flex; align-items: center; justify-content: center; color: #ef4444; text-align: center;">
            <div>
              <p>Error creating Boruta plot.</p>
              <p style="font-size: 12px;">${error.message}</p>
              <p style="font-size: 10px; margin-top: 8px;">Please check console for details.</p>
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
    const analysisId = this.analysisId();
    if (!analysisId) {
      console.error('[DIAGNOSTICS] No analysis ID available for viewing results');
      return;
    }
    
    console.log('[DIAGNOSTICS] User clicked view results, fetching results for:', analysisId);
    this.loading.set(true);
    this.error.set(null);
    
    // Fetch results using the same logic as recovery
    this.apiService.getAnalysisResults(analysisId).subscribe({
      next: (result: AnalysisResult) => {
        console.log('[DIAGNOSTICS] Successfully loaded analysis results:', result);
        this.handleLoadedResults(result, false); // false = don't start new analysis on missing data
      },
      error: (err: any) => {
        console.error('[DIAGNOSTICS] Error loading analysis results:', err);
        this.loading.set(false);
        this.error.set(err.message || 'Errore nel caricamento dei risultati dell\'analisi');
      }
    });
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
      this.forceNewAnalysis.set(true); // Force new analysis instead of loading existing
      
      // Reset the data flow service (this will properly handle session reset via SessionService)
      this.dataFlowService.resetData();
      
      // Reset navigation workflow
      this.navigationService.resetWorkflow();
    }
  }

  // Debug method to test multivariate displays - can be removed in production
  private createTestMultivariateData(): AnalysisResult {
    const sampleResults: AnalysisResult = {
      id: 'test-multivariate',
      timestamp: new Date(),
      status: 'completed',
      results: {
        randomForest: {
          testName: 'Random Forest',
          ntree: 500,
          chosen_mtry: 3,
          best_metric: 0.1234,
          data: [
            { Variable: 'GENE1', importance: 0.85, rank: 1 },
            { Variable: 'GENE2', importance: 0.72, rank: 2 },
            { Variable: 'GENE3', importance: 0.68, rank: 3 }
          ]
        },
        boruta: {
          testName: 'Boruta Feature Selection',
          ntree: 500,
          iterations: 75,
          maxRuns: 100,
          data: [
            { 
              Variable: 'GENE1', 
              decision: 'Confirmed', 
              meanImp: 0.85, 
              medianImp: 0.83, 
              minImp: 0.75, 
              maxImp: 0.95, 
              normHits: 98,
              importanceHistory: [0.85, 0.87, 0.83, 0.89, 0.82, 0.84, 0.86]
            },
            { 
              Variable: 'GENE2', 
              decision: 'Tentative', 
              meanImp: 0.62, 
              medianImp: 0.60, 
              minImp: 0.45, 
              maxImp: 0.78, 
              normHits: 65,
              importanceHistory: [0.62, 0.58, 0.65, 0.60, 0.67, 0.59, 0.64]
            },
            { 
              Variable: 'GENE3', 
              decision: 'Rejected', 
              meanImp: 0.35, 
              medianImp: 0.33, 
              minImp: 0.25, 
              maxImp: 0.45, 
              normHits: 15,
              importanceHistory: [0.35, 0.32, 0.38, 0.33, 0.36, 0.31, 0.37]
            }
          ],
          shadowStats: {
            shadowMin: { importance: 0.42, values: [0.40, 0.41, 0.43, 0.42, 0.44] },
            shadowMean: { importance: 0.48, values: [0.46, 0.47, 0.49, 0.48, 0.50] },
            shadowMax: { importance: 0.54, values: [0.52, 0.53, 0.55, 0.54, 0.56] }
          }
        },
        ridge: {
          testName: 'Ridge Regression',
          chosen_lambda: 0.0045,
          best_metric: 0.0876,
          data: [
            { Variable: 'GENE1', coefficient: 0.234, pValue: 0.001 },
            { Variable: 'GENE2', coefficient: -0.156, pValue: 0.023 }
          ]
        },
        lasso: {
          testName: 'Lasso Regression',
          chosen_lambda: 0.0032,
          best_metric: 0.0892,
          data: [
            { Variable: 'GENE1', coefficient: 0.187, pValue: 0.002 },
            { Variable: 'GENE4', coefficient: 0.098, pValue: 0.045 }
          ]
        },
        elasticNet: {
          testName: 'Elastic Net',
          chosen_lambda: 0.0038,
          chosen_alpha: 0.5,
          best_metric: 0.0885,
          data: [
            { Variable: 'GENE1', coefficient: 0.201, pValue: 0.001 },
            { Variable: 'GENE2', coefficient: -0.132, pValue: 0.018 }
          ]
        },
        rfe: {
          testName: 'Recursive Feature Elimination',
          selected_size: 5,
          best_metric: 0.0823,
          optimization: [
            { Variables: 2, RMSE: 0.125 },
            { Variables: 3, RMSE: 0.098 },
            { Variables: 5, RMSE: 0.082 },
            { Variables: 8, RMSE: 0.089 },
            { Variables: 10, RMSE: 0.095 }
          ],
          data: [
            { Variable: 'GENE1', rank: 1, selected: true },
            { Variable: 'GENE2', rank: 2, selected: true },
            { Variable: 'GENE3', rank: 3, selected: true }
          ]
        }
      }
    };
    
    return sampleResults;
  }

  // Temporary test method - remove in production
  testMultivariateDisplay() {
    const testData = this.createTestMultivariateData();
    this.results.set(testData);
    this.showResults.set(true);
    this.resultsReady.set(true);
    this.loading.set(false);
    console.log('[DEBUG] Test multivariate data loaded:', testData);
  }

  ngOnDestroy() {
    // Reset analysis active state to allow navigation when leaving results
    this.navigationService.setAnalysisActiveState(false);
    
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
          testName: test?.testName,
          dataType: typeof test?.data,
          sampleDataPoint: test?.data?.[0]
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

  // Check if a multivariate method has importance data
  hasImportanceData(testKey: string): boolean {
    const test = this.results()?.results?.[testKey];
    if (!test?.data || !Array.isArray(test.data) || test.data.length === 0) {
      return false;
    }
    
    // Check if any row has an importance column (case-insensitive)
    const firstRow = test.data[0];
    if (!firstRow) return false;
    
    const keys = Object.keys(firstRow);
    return keys.some(key => 
      key.toLowerCase() === 'importance' || 
      key === 'Importance' || 
      key === 'importance'
    );
  }

  // Regularization methods - Lambda and Alpha values
  getChosenLambda(method: string): string {
    const test = this.results()?.results?.[method];
    if (!test) return 'N/A';
    
    if (test.chosen_lambda !== undefined && test.chosen_lambda !== null) {
      const lambda = parseFloat(test.chosen_lambda);
      return isNaN(lambda) ? 'N/A' : lambda.toExponential(3);
    }
    
    return 'N/A';
  }

  getChosenAlpha(method: string): string {
    const test = this.results()?.results?.[method];
    if (!test || method !== 'elasticNet') return 'N/A';
    
    if (test.chosen_alpha !== undefined && test.chosen_alpha !== null) {
      const alpha = parseFloat(test.chosen_alpha);
      return isNaN(alpha) ? 'N/A' : alpha.toFixed(2);
    }
    
    return 'N/A';
  }

  // Enhanced methods for analysis timing information
  getAnalysisStartTime(): string {
    const results = this.results();
    if (results?.time_start) {
      return new Date(results.time_start).toLocaleString();
    }
    return 'N/A';
  }

  getAnalysisEndTime(): string {
    const results = this.results();
    if (results?.time_end) {
      return new Date(results.time_end).toLocaleString();
    }
    return 'N/A';
  }

  getAnalysisDuration(): string {
    const results = this.results();
    if (results?.time_start && results?.time_end) {
      const start = new Date(results.time_start);
      const end = new Date(results.time_end);
      const diffMs = end.getTime() - start.getTime();
      const diffSeconds = Math.round(diffMs / 1000);
      
      if (diffSeconds < 60) {
        return `${diffSeconds} seconds`;
      } else if (diffSeconds < 3600) {
        const minutes = Math.floor(diffSeconds / 60);
        const seconds = diffSeconds % 60;
        return `${minutes}m ${seconds}s`;
      } else {
        const hours = Math.floor(diffSeconds / 3600);
        const minutes = Math.floor((diffSeconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
      }
    }
    return 'N/A';
  }

  // Enhanced method for FDR information (from R script analysis)
  getFDRSignificantCount(method: string): string {
    const test = this.results()?.results?.[method];
    if (!test?.data || !Array.isArray(test.data)) return 'N/A';
    
    // Count items with FDR < 0.05
    const fdrSignificant = test.data.filter((item: any) => {
      const fdr = item.fdr || item.FDR || item.p_adj || item.padj;
      return fdr !== undefined && fdr < 0.05;
    }).length;
    
    return fdrSignificant.toString();
  }

  // Enhanced method for significance counts
  getSignificantCount(method: string, threshold: number = 0.05): string {
    const test = this.results()?.results?.[method];
    if (!test?.data || !Array.isArray(test.data)) return 'N/A';
    
    const significantCount = test.data.filter((item: any) => {
      const pValue = item.pValue || item.p_value || item.p || item['p.value'] || item['Pr(>|t|)'];
      return pValue !== undefined && pValue < threshold;
    }).length;
    
    return significantCount.toString();
  }

  // Enhanced method for Boruta specific information
  getBorutaIterations(method: string): string {
    const test = this.results()?.results?.[method];
    if (!test) return 'N/A';
    
    // Check for iterations completed
    if (test.iterations !== undefined) {
      return test.iterations.toString();
    }
    
    // Check for maxRuns as fallback
    if (test.maxRuns !== undefined) {
      return `${test.maxRuns} (max)`;
    }
    
    return 'N/A';
  }

  getBorutaTentativeCount(method: string): string {
    const test = this.results()?.results?.[method];
    if (!test?.data || !Array.isArray(test.data)) return 'N/A';
    
    const tentativeCount = test.data.filter((item: any) => 
      (item.decision === 'Tentative' || item.Decision === 'Tentative')
    ).length;
    
    return tentativeCount.toString();
  }

  getBorutaRejectedCount(method: string): string {
    const test = this.results()?.results?.[method];
    if (!test?.data || !Array.isArray(test.data)) return 'N/A';
    
    const rejectedCount = test.data.filter((item: any) => 
      (item.decision === 'Rejected' || item.Decision === 'Rejected')
    ).length;
    
    return rejectedCount.toString();
  }

  // Enhanced method for Random Forest variable importance
  getTopImportantVariables(method: string, count: number = 5): string {
    const test = this.results()?.results?.[method];
    if (!test?.data || !Array.isArray(test.data)) return 'N/A';
    
    // Sort by importance (multiple possible column names)
    const sortedData = [...test.data].sort((a: any, b: any) => {
      const importanceA = a.Importance || a.importance || a['%IncMSE'] || 0;
      const importanceB = b.Importance || b.importance || b['%IncMSE'] || 0;
      return importanceB - importanceA;
    });
    
    const topVars = sortedData.slice(0, count).map((item: any) => 
      item.Variable || item.variable || item.feature || 'Unknown'
    );
    
    return topVars.join(', ');
  }

  // Enhanced method for correlation analysis summary
  getStrongCorrelationCount(method: string, threshold: number = 0.5): string {
    const test = this.results()?.results?.[method];
    if (!test?.data || !Array.isArray(test.data)) return 'N/A';
    
    const strongCorrelations = test.data.filter((item: any) => {
      const correlation = item.cor || item.correlation || item.r || item.rho;
      return correlation !== undefined && Math.abs(correlation) > threshold;
    }).length;
    
    return strongCorrelations.toString();
  }

  // Enhanced method for post-hoc test information
  hasPostHocData(method: string): boolean {
    const test = this.results()?.results?.[method];
    return !!(test?.posthoc_data || test?.posthoc_results) && 
           Array.isArray(test.posthoc_data || test.posthoc_results) && 
           (test.posthoc_data || test.posthoc_results).length > 0;
  }

  getPostHocComparisonCount(method: string): string {
    const test = this.results()?.results?.[method];
    const posthocData = test?.posthoc_data || test?.posthoc_results;
    
    if (!posthocData || !Array.isArray(posthocData)) return 'N/A';
    
    return posthocData.length.toString();
  }

  // Enhanced method for feature selection summary
  getSelectedVariablesList(method: string): string {
    const test = this.results()?.results?.[method];
    if (!test) return 'N/A';
    
    // For RFE and Boruta methods
    if (test.selected_vars && Array.isArray(test.selected_vars)) {
      return test.selected_vars.slice(0, 5).join(', ') + 
             (test.selected_vars.length > 5 ? '...' : '');
    }
    
    // For methods with data array, filter selected features
    if (test.data && Array.isArray(test.data)) {
      let selectedVars: string[] = [];
      
      if (method === 'boruta') {
        selectedVars = test.data
          .filter((item: any) => item.decision === 'Confirmed' || item.Decision === 'Confirmed')
          .map((item: any) => item.Variable || item.variable)
          .filter(Boolean);
      } else if (method === 'rfe') {
        selectedVars = test.data
          .filter((item: any) => item.selected === true)
          .map((item: any) => item.Variable || item.variable)
          .filter(Boolean);
      } else if (['ridge', 'lasso', 'elasticNet'].includes(method)) {
        // For regularization methods, show variables with non-zero coefficients
        selectedVars = test.data
          .filter((item: any) => Math.abs(item.Coefficient || item.coefficient || 0) > 1e-6)
          .sort((a: any, b: any) => Math.abs(b.Coefficient || b.coefficient || 0) - Math.abs(a.Coefficient || a.coefficient || 0))
          .map((item: any) => item.Variable || item.variable)
          .filter(Boolean)
          .slice(0, 5);
      }
      
      if (selectedVars.length > 0) {
        return selectedVars.join(', ') + (selectedVars.length === 5 && test.data.length > 5 ? '...' : '');
      }
    }
    
    return 'N/A';
  }

  // Methods for categorizing tests by type (moved here to fix compilation errors)
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

  getMultivariateTests(): string[] {
    const testNames = this.getTestNames();
    console.log('[DIAGNOSTICS] getMultivariateTests - All available test names:', testNames);
    
    // Exact test keys from the API response for multivariate tests
    const multivariateTestKeys = [
      'ridge', 'lasso', 'elasticNet', 'elasticnet', 'randomForest', 'randomforest', 
      'boruta', 'rfe', 'svm', 'neuralnetwork', 'xgboost'
    ];
    
    console.log('[DIAGNOSTICS] getMultivariateTests - Looking for these multivariate patterns:', multivariateTestKeys);
    
    // Use exact matching since test names come directly from JSON keys
    const filteredTests = testNames.filter(test => {
      const isMatch = multivariateTestKeys.includes(test);
      console.log(`[DIAGNOSTICS] getMultivariateTests - Test ${test}: matches multivariate pattern = ${isMatch}`);
      return isMatch;
    });
    
    console.log('[DIAGNOSTICS] getMultivariateTests - Filtered multivariate tests:', filteredTests);
    return filteredTests;
  }

  // Test availability methods
  hasAnyTests(): boolean {
    return this.getBivariateTests().length > 0 || this.getMultivariateTests().length > 0;
  }

  getTotalTestCount(): number {
    return this.getBivariateTests().length + this.getMultivariateTests().length;
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
    
    // If no formula is provided by the API, construct one using actual variable names
    if (this.isLinearRegressionTest(testKey)) {
      const preprocessingOptions = this.dataFlowService.preprocessingOptions();
      
      if (preprocessingOptions?.columnClassification) {
        const classification = preprocessingOptions.columnClassification;
        
        // Get actual variable names
        const outcomeVar = classification.outcomeColumn || 'outcome';
        const covariateVars = classification.covariateColumns || [];
        const omicsVars = classification.omicsColumns || [];
        
        // Build formula components
        const formulaParts: string[] = [];
        
        // Add covariates if present
        if (covariateVars.length > 0) {
          formulaParts.push(covariateVars.join(' + '));
        }
        
        // Add indication of omics variables (since there could be many)
        if (omicsVars.length > 0) {
          if (omicsVars.length <= 3) {
            // Show actual names if only a few
            formulaParts.push(omicsVars.join(' + '));
          } else {
            // Show count if many
            formulaParts.push(`omics_variables (${omicsVars.length} variables)`);
          }
        }
        
        // Construct final formula
        const rightSide = formulaParts.length > 0 ? formulaParts.join(' + ') : 'intercept';
        return `${outcomeVar} ~ ${rightSide}`;
      } else {
        // Fallback to generic formula
        return 'outcome ~ covariates + omics_variables';
      }
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
  }

  // Enhanced method info that shows actual metric and method details
  getMethodInfoLabel(testKey: string): string {
    const analysisOptions = this.dataFlowService.analysisOptions();
    
    if (['ridge', 'lasso', 'elasticNet'].includes(testKey)) {
      const methodConfig = analysisOptions?.multivariateAnalysis?.[testKey as keyof typeof analysisOptions.multivariateAnalysis];
      if (methodConfig && 'metric' in methodConfig && 'lambdaRule' in methodConfig) {
        const metric = methodConfig.metric === 'rmse' ? 'RMSE' : 'RÂ²';
        const rule = methodConfig.lambdaRule === 'min' ? 'Min' : '1SE';
        return `${metric} (${rule})`;
      }
    } else if (testKey === 'randomForest') {
      return 'RMSE Migliore';
    } else if (testKey === 'boruta') {
      return 'Iterazioni Completate';
    } else if (testKey === 'rfe') {
      const methodConfig = analysisOptions?.multivariateAnalysis?.rfe;
      if (methodConfig?.metric) {
        return methodConfig.metric === 'rmse' ? 'RMSE Migliore' : 'RÂ² Migliore';
      }
    }
    
    return 'Metrica Migliore';
  }

  getMethodInfoValue(testKey: string): string {
    const test = this.results()?.results?.[testKey];
    
    if (testKey === 'boruta') {
      // For Boruta, show the number of iterations completed
      if (test?.iterations !== undefined) {
        return test.iterations.toString();
      } else if (test?.maxRuns !== undefined) {
        return test.maxRuns.toString();
      }
      return 'N/A';
    }
    
    // For other methods, show the best metric value
    if (test?.best_metric !== undefined) {
      return Number(test.best_metric).toFixed(4);
    }
    return 'N/A';
  }

  // Random Forest specific methods
  getRandomForestTrees(testKey: string): string {
    console.log(`[DEBUG] getRandomForestTrees called for testKey: ${testKey}`);
    
    const analysisOptions = this.dataFlowService.analysisOptions();
    console.log('[DEBUG] analysisOptions:', analysisOptions);
    
    const rfConfig = analysisOptions?.multivariateAnalysis?.randomForest;
    console.log('[DEBUG] randomForest config:', rfConfig);
    
    if (rfConfig?.ntree) {
      console.log(`[DEBUG] Found ntree in config: ${rfConfig.ntree}`);
      return rfConfig.ntree.toString();
    }
    
    // Also try to get from results data if available
    const test = this.results()?.results?.[testKey];
    console.log(`[DEBUG] Test data for ${testKey}:`, test);
    
    if (test?.ntree !== undefined) {
      console.log(`[DEBUG] Found ntree in test data: ${test.ntree}`);
      return test.ntree.toString();
    }
    
    // Try alternative property names
    if (test?.n_trees !== undefined) {
      console.log(`[DEBUG] Found n_trees in test data: ${test.n_trees}`);
      return test.n_trees.toString();
    }
    
    if (test?.numTrees !== undefined) {
      console.log(`[DEBUG] Found numTrees in test data: ${test.numTrees}`);
      return test.numTrees.toString();
    }
    
    console.log(`[DEBUG] No tree count found for ${testKey}, returning N/A`);
    return 'N/A';
  }

  getRandomForestMtry(testKey: string): string {
    const test = this.results()?.results?.[testKey];
    if (test?.chosen_mtry !== undefined) {
      return test.chosen_mtry.toString();
    }
    return 'N/A';
  }

  // Boruta specific methods
  getBorutaConfirmedFeatures(testKey: string): string {
    const test = this.results()?.results?.[testKey];
    if (test?.data && Array.isArray(test.data)) {
      const confirmedCount = test.data.filter((feature: any) => 
        feature.decision === 'Confirmed'
      ).length;
      return confirmedCount.toString();
    }
    return 'N/A';
  }

  getBorutaMtry(testKey: string): string {
    const analysisOptions = this.dataFlowService.analysisOptions();
    const borutaConfig = analysisOptions?.multivariateAnalysis?.boruta;
    
    if (borutaConfig?.mtrySelection === 'manual' && borutaConfig.mtryValue) {
      return borutaConfig.mtryValue.toString();
    } else if (borutaConfig?.mtrySelection === 'automatic') {
      // Calculate automatic mtry based on R formula: max(floor(p/3), 1)
      const test = this.results()?.results?.[testKey];
      if (test?.data && Array.isArray(test.data)) {
        const numFeatures = test.data.length;
        const autoMtry = Math.max(Math.floor(numFeatures / 3), 1);
        return `${autoMtry} (auto)`;
      }
    }
    return 'N/A';
  }

  getBorutaTrees(testKey: string): string {
    console.log(`[DEBUG] getBorutaTrees called for testKey: ${testKey}`);
    
    const analysisOptions = this.dataFlowService.analysisOptions();
    const borutaConfig = analysisOptions?.multivariateAnalysis?.boruta;
    console.log('[DEBUG] boruta config:', borutaConfig);
    
    if (borutaConfig?.ntree) {
      console.log(`[DEBUG] Found ntree in boruta config: ${borutaConfig.ntree}`);
      return borutaConfig.ntree.toString();
    }
    
    // Also try to get from results data if available
    const test = this.results()?.results?.[testKey];
    console.log(`[DEBUG] Boruta test data for ${testKey}:`, test);
    
    if (test?.ntree !== undefined) {
      console.log(`[DEBUG] Found ntree in boruta test data: ${test.ntree}`);
      return test.ntree.toString();
    }
    
    // Try alternative property names
    if (test?.n_trees !== undefined) {
      console.log(`[DEBUG] Found n_trees in boruta test data: ${test.n_trees}`);
      return test.n_trees.toString();
    }
    
    if (test?.numTrees !== undefined) {
      console.log(`[DEBUG] Found numTrees in boruta test data: ${test.numTrees}`);
      return test.numTrees.toString();
    }
    
    console.log(`[DEBUG] No tree count found for boruta ${testKey}, returning N/A`);
    return 'N/A';
  }

  // RFE specific methods
  getRFESubsetSizesTested(testKey: string): string {
    const test = this.results()?.results?.[testKey];
    if (test?.optimization && Array.isArray(test.optimization)) {
      const sizes = test.optimization.map((row: any) => row.Variables).sort((a: number, b: number) => a - b);
      const uniqueSizes = [...new Set(sizes)];
      return uniqueSizes.join(', ');
    }
    return 'N/A';
  }

  getRFEOptimalSize(testKey: string): string {
    const test = this.results()?.results?.[testKey];
    if (test?.selected_size !== undefined) {
      return test.selected_size.toString();
    }
    return 'N/A';
  }
}

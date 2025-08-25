import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface PdfReportData {
  analysisId: string;
  analysisStatus: string;
  results: any;
  bivariateTests: string[];
  multivariateTests: string[];
}

export interface DataFormattingMethods {
  getTestData: (testName: string) => any[];
  getColumnsForTest: (testName: string) => string[];
  getTestDisplayName: (testKey: string) => string;
  getColumnDisplayName: (column: string) => string;
  formatCellValue: (value: any, column: string) => string;
  getRowClass: (row: any) => string;
  isNumericColumn: (column: string) => boolean;
  
  // Test classification methods
  getBivariateTests: () => string[];
  getMultivariateTests: () => string[];
  isRegularizationMethod: (testKey: string) => boolean;
  isLinearRegressionTest: (testKey: string) => boolean;
  
  // Method-specific info getters
  getChosenLambda: (method: string) => string;
  getChosenAlpha: (method: string) => string;
  getMethodInfoLabel: (testKey: string) => string;
  getMethodInfoValue: (testKey: string) => string;
  getRandomForestTrees: (testKey: string) => string;
  getRandomForestMtry: (testKey: string) => string;
  getBorutaConfirmedFeatures: (testKey: string) => string;
  getBorutaMtry: (testKey: string) => string;
  getBorutaTrees: (testKey: string) => string;
  getRFESubsetSizesTested: (testKey: string) => string;
  getRFEOptimalSize: (testKey: string) => string;
  getLinearRegressionFormula: (testKey: string) => string | null;
  
  // Status display
  getStatusDisplayName: (status: string) => string;
}

@Injectable({
  providedIn: 'root'
})
export class PdfReportService {

  constructor() { }

  generateAnalysisReport(
    reportData: PdfReportData,
    formatters: DataFormattingMethods
  ): void {
    const doc = new jsPDF();
    const { results, analysisId, analysisStatus, bivariateTests, multivariateTests } = reportData;
    
    if (!results) {
      console.error('No results data provided for PDF generation');
      return;
    }

    let yPosition = 20;

    // Header Section
    yPosition = this.addPDFHeader(doc, yPosition, analysisId, analysisStatus, formatters);
    
    // Analysis Summary
    yPosition = this.addPDFAnalysisSummary(doc, yPosition, bivariateTests, multivariateTests);

    // Bivariate Tests Section
    if (bivariateTests.length > 0) {
      yPosition = this.addPDFBivariateSection(doc, yPosition, bivariateTests, formatters);
    }

    // Multivariate Tests Section  
    if (multivariateTests.length > 0) {
      yPosition = this.addPDFMultivariateSection(doc, yPosition, multivariateTests, formatters);
    }

    // Statistical Summary
    yPosition = this.addPDFStatisticalSummary(doc, yPosition);

    // Save the PDF
    const fileName = `analysis-report-${analysisId}-${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  }

  private addPDFHeader(
    doc: jsPDF, 
    yPosition: number, 
    analysisId: string, 
    analysisStatus: string,
    formatters: DataFormattingMethods
  ): number {
    // Title
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Report di Analisi Statistica', 20, yPosition);
    yPosition += 15;

    // Subtitle
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text('Dashboard di Analisi dei Dati Omici', 20, yPosition);
    yPosition += 20;

    // Analysis Information
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Informazioni Analisi:', 20, yPosition);
    yPosition += 8;

    doc.setFont('helvetica', 'normal');
    doc.text(`ID Analisi: ${analysisId}`, 20, yPosition);
    yPosition += 6;
    doc.text(`Data Generazione: ${new Date().toLocaleString('it-IT')}`, 20, yPosition);
    yPosition += 6;
    doc.text(`Stato: ${formatters.getStatusDisplayName(analysisStatus)}`, 20, yPosition);
    yPosition += 15;

    // Separator line
    doc.setDrawColor(6, 182, 212);
    doc.setLineWidth(0.5);
    doc.line(20, yPosition, 190, yPosition);
    yPosition += 15;

    return yPosition;
  }

  private addPDFAnalysisSummary(
    doc: jsPDF, 
    yPosition: number, 
    bivariateTests: string[], 
    multivariateTests: string[]
  ): number {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Riepilogo Analisi', 20, yPosition);
    yPosition += 12;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');

    const bivariateCount = bivariateTests.length;
    const multivariateCount = multivariateTests.length;
    const totalTests = bivariateCount + multivariateCount;

    doc.text(`• Numero totale di test eseguiti: ${totalTests}`, 25, yPosition);
    yPosition += 6;
    doc.text(`• Test bivariati: ${bivariateCount}`, 25, yPosition);
    yPosition += 6;
    doc.text(`• Test multivariati: ${multivariateCount}`, 25, yPosition);
    yPosition += 15;

    return yPosition;
  }

  private addPDFBivariateSection(
    doc: jsPDF, 
    yPosition: number, 
    bivariateTests: string[], 
    formatters: DataFormattingMethods
  ): number {
    // Check if we need a new page
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Analisi Bivariate', 20, yPosition);
    yPosition += 12;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Test di correlazione e associazione tra variabili', 20, yPosition);
    yPosition += 15;

    // Process each bivariate test
    bivariateTests.forEach((testKey, index) => {
      yPosition = this.addPDFTestTable(doc, testKey, yPosition, index === 0, formatters);
    });

    return yPosition;
  }

  private addPDFMultivariateSection(
    doc: jsPDF, 
    yPosition: number, 
    multivariateTests: string[], 
    formatters: DataFormattingMethods
  ): number {
    // Check if we need a new page
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Analisi Multivariate', 20, yPosition);
    yPosition += 12;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Modelli complessi e analisi multidimensionali', 20, yPosition);
    yPosition += 15;

    // Process each multivariate test
    multivariateTests.forEach((testKey, index) => {
      yPosition = this.addPDFTestTable(doc, testKey, yPosition, index === 0, formatters);
    });

    return yPosition;
  }

  private addPDFTestTable(
    doc: jsPDF, 
    testKey: string, 
    yPosition: number, 
    isFirstTest: boolean, 
    formatters: DataFormattingMethods
  ): number {
    const testData = formatters.getTestData(testKey);
    const columns = formatters.getColumnsForTest(testKey);
    
    if (!testData || testData.length === 0) {
      return yPosition;
    }

    // Check if we need a new page
    if (yPosition > 230) {
      doc.addPage();
      yPosition = 20;
    }

    // Test title
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(formatters.getTestDisplayName(testKey), 20, yPosition);
    yPosition += 10;

    // Add method-specific information
    yPosition = this.addPDFMethodInfo(doc, testKey, yPosition, formatters);

    // Sort data for bivariate tests by p-values (ascending)
    let sortedTestData = [...testData];
    if (formatters.getBivariateTests().includes(testKey)) {
      sortedTestData = this.sortDataByPValue(testData);
    } else if (formatters.getMultivariateTests().includes(testKey)) {
      sortedTestData = this.sortDataByImportance(testData);
    }
    
    // Prepare headers
    const headers = columns.map(col => formatters.getColumnDisplayName(col));
    
    // Prepare all rows with formatted values (no limit for complete table)
    const rows = sortedTestData.map(row => 
      columns.map(col => {
        const value = formatters.formatCellValue(row[col], col);
        // Truncate extremely long values for PDF display
        return value.length > 25 ? value.substring(0, 22) + '...' : value;
      })
    );

    // Add significance count
    const significantCount = sortedTestData.filter(row => 
      formatters.getRowClass(row).includes('significant')
    ).length;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Risultati significativi: ${significantCount}/${sortedTestData.length}`, 20, yPosition);
    yPosition += 8;

    if (formatters.getBivariateTests().includes(testKey)) {
      doc.text('(Ordinati per p-value crescente)', 20, yPosition);
      yPosition += 8;
    } else if (formatters.getMultivariateTests().includes(testKey)) {
      doc.text('(Ordinati per importanza decrescente)', 20, yPosition);
      yPosition += 8;
    }

    // Calculate available space and determine if we need to split the table
    const pageHeight = doc.internal.pageSize.height;
    const availableHeight = pageHeight - yPosition - 20; // 20 for margin
    const estimatedRowHeight = 6; // Estimated row height
    const maxRowsPerPage = Math.floor(availableHeight / estimatedRowHeight) - 2; // -2 for header

    // If table is too large, split across pages
    if (rows.length > maxRowsPerPage && maxRowsPerPage > 5) {
      yPosition = this.addPaginatedTable(doc, headers, rows, sortedTestData, columns, yPosition, maxRowsPerPage, formatters);
    } else {
      // Generate single table
      autoTable(doc, {
        head: [headers],
        body: rows,
        startY: yPosition,
        theme: 'striped',
        headStyles: { 
          fillColor: [6, 182, 212],
          textColor: [255, 255, 255],
          fontSize: 9,
          fontStyle: 'bold'
        },
        bodyStyles: { 
          fontSize: 8,
          cellPadding: 2
        },
        columnStyles: this.getPDFColumnStyles(columns, formatters),
        margin: { left: 20, right: 20 },
        tableWidth: 'auto',
        didParseCell: (data: any) => {
          // Color significant rows
          if (data.section === 'body') {
            const rowData = sortedTestData[data.row.index];
            const rowClass = formatters.getRowClass(rowData);
            
            if (rowClass.includes('significant-highly')) {
              data.cell.styles.fillColor = [254, 202, 202]; // Light red
            } else if (rowClass.includes('significant-very')) {
              data.cell.styles.fillColor = [254, 215, 170]; // Light orange
            } else if (rowClass.includes('significant-moderate')) {
              data.cell.styles.fillColor = [254, 243, 199]; // Light yellow
            } else if (rowClass.includes('significant-confirmed')) {
              data.cell.styles.fillColor = [187, 247, 208]; // Light green
            }
          }
        }
      });

      yPosition = (doc as any).lastAutoTable.finalY + 15;
    }

    return yPosition;
  }

  private addPaginatedTable(
    doc: jsPDF, 
    headers: string[], 
    rows: string[][], 
    sortedTestData: any[], 
    columns: string[], 
    yPosition: number, 
    maxRowsPerPage: number,
    formatters: DataFormattingMethods
  ): number {
    let currentRowIndex = 0;
    let pageNumber = 1;
    
    while (currentRowIndex < rows.length) {
      const endIndex = Math.min(currentRowIndex + maxRowsPerPage, rows.length);
      const pageRows = rows.slice(currentRowIndex, endIndex);
      const pageData = sortedTestData.slice(currentRowIndex, endIndex);
      
      // Add page indicator
      if (pageNumber > 1) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.text(`Pagina ${pageNumber}`, 20, yPosition);
        yPosition += 10;
      }
      
      autoTable(doc, {
        head: [headers],
        body: pageRows,
        startY: yPosition,
        theme: 'striped',
        headStyles: { 
          fillColor: [6, 182, 212],
          textColor: [255, 255, 255],
          fontSize: 9,
          fontStyle: 'bold'
        },
        bodyStyles: { 
          fontSize: 8,
          cellPadding: 2
        },
        columnStyles: this.getPDFColumnStyles(columns, formatters),
        margin: { left: 20, right: 20 },
        tableWidth: 'auto',
        didParseCell: (data: any) => {
          // Color significant rows
          if (data.section === 'body') {
            const rowData = pageData[data.row.index];
            const rowClass = formatters.getRowClass(rowData);
            
            if (rowClass.includes('significant-highly')) {
              data.cell.styles.fillColor = [254, 202, 202]; // Light red
            } else if (rowClass.includes('significant-very')) {
              data.cell.styles.fillColor = [254, 215, 170]; // Light orange
            } else if (rowClass.includes('significant-moderate')) {
              data.cell.styles.fillColor = [254, 243, 199]; // Light yellow
            } else if (rowClass.includes('significant-confirmed')) {
              data.cell.styles.fillColor = [187, 247, 208]; // Light green
            }
          }
        }
      });

      currentRowIndex = endIndex;
      yPosition = (doc as any).lastAutoTable.finalY + 15;
      
      // Add new page if there are more rows
      if (currentRowIndex < rows.length) {
        doc.addPage();
        yPosition = 20;
        pageNumber++;
      }
    }
    
    // Add note about total entries
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text(`Totale: ${rows.length} risultati mostrati.`, 20, yPosition);
    yPosition += 10;
    
    return yPosition;
  }

  private addPDFMethodInfo(
    doc: jsPDF, 
    testKey: string, 
    yPosition: number, 
    formatters: DataFormattingMethods
  ): number {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    // Add specific method information
    if (testKey === 'boruta') {
      doc.text(`Caratteristiche confermate: ${formatters.getBorutaConfirmedFeatures(testKey)}`, 20, yPosition);
      yPosition += 5;
      doc.text(`mtry utilizzato: ${formatters.getBorutaMtry(testKey)}`, 20, yPosition);
      yPosition += 5;
      doc.text(`Numero di alberi: ${formatters.getBorutaTrees(testKey)}`, 20, yPosition);
      yPosition += 8;
    } else if (testKey === 'randomForest') {
      doc.text(`Numero di alberi: ${formatters.getRandomForestTrees(testKey)}`, 20, yPosition);
      yPosition += 5;
      doc.text(`mtry utilizzato: ${formatters.getRandomForestMtry(testKey)}`, 20, yPosition);
      yPosition += 8;
    } else if (formatters.isRegularizationMethod(testKey)) {
      doc.text(`Lambda scelto: ${formatters.getChosenLambda(testKey)}`, 20, yPosition);
      yPosition += 5;
      if (testKey === 'elasticNet') {
        doc.text(`Alpha scelto: ${formatters.getChosenAlpha(testKey)}`, 20, yPosition);
        yPosition += 5;
      }
      yPosition += 3;
    } else if (testKey === 'rfe') {
      doc.text(`Dimensioni sottoinsiemi testati: ${formatters.getRFESubsetSizesTested(testKey)}`, 20, yPosition);
      yPosition += 5;
      doc.text(`Dimensione ottimale: ${formatters.getRFEOptimalSize(testKey)}`, 20, yPosition);
      yPosition += 8;
    } else if (formatters.isLinearRegressionTest(testKey)) {
      const formula = formatters.getLinearRegressionFormula(testKey);
      if (formula) {
        doc.text(`Formula: ${formula}`, 20, yPosition);
        yPosition += 8;
      }
    }

    return yPosition;
  }

  private getPDFColumnStyles(columns: string[], formatters: DataFormattingMethods): any {
    const styles: any = {};
    
    columns.forEach((col, index) => {
      if (formatters.isNumericColumn(col)) {
        styles[index] = { halign: 'right' };
      } else {
        styles[index] = { halign: 'left' };
      }
    });

    return styles;
  }

  private addPDFStatisticalSummary(doc: jsPDF, yPosition: number): number {
    // Check if we need a new page
    if (yPosition > 220) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Riepilogo Statistico', 20, yPosition);
    yPosition += 15;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Report generato automaticamente dal sistema di analisi.', 20, yPosition);
    yPosition += 10;

    return yPosition;
  }

  private sortDataByPValue(data: any[]): any[] {
    // Find p-value column
    const pValueFields = ['pValue', 'pval', 'p_value', 'P.value', 'Pr(>|t|)', 'p.value', 'pvalue'];
    let pValueColumn: string | null = null;
    
    for (const field of pValueFields) {
      if (data.length > 0 && data[0][field] !== undefined) {
        pValueColumn = field;
        break;
      }
    }
    
    if (!pValueColumn) {
      return [...data]; // Return copy of unsorted data if no p-value column found
    }
    
    // Create a copy of the data before sorting to avoid mutating the original
    return [...data].sort((a, b) => {
      const pValA = Number(a[pValueColumn!]) || Infinity;
      const pValB = Number(b[pValueColumn!]) || Infinity;
      return pValA - pValB;
    });
  }

  private sortDataByImportance(data: any[]): any[] {
    // Find importance column
    const importanceFields = ['importance', 'Importance'];
    let importanceColumn: string | null = null;
    
    for (const field of importanceFields) {
      if (data.length > 0 && data[0][field] !== undefined) {
        importanceColumn = field;
        break;
      }
    }
    
    if (!importanceColumn) {
      return [...data]; // Return copy of unsorted data if no importance column found
    }
    
    // Create a copy of the data before sorting to avoid mutating the original
    return [...data].sort((a, b) => {
      const impA = Number(a[importanceColumn!]) || -Infinity;
      const impB = Number(b[importanceColumn!]) || -Infinity;
      return impB - impA; // Descending order (highest importance first)
    });
  }
}

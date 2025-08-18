import { Injectable } from '@angular/core';
declare let Plotly: any;

@Injectable({
  providedIn: 'root'
})
export class PlotlyService {
  /**
   * Manhattan plot: x = feature/gene names, y = -log10(pValue)
   * Generalized for any test result structure
   */
  createManhattanPlot(
    element: HTMLElement,
    data: any[],
    options?: {
      title?: string;
      xaxis?: string;
      yaxis?: string;
      significanceLine?: boolean;
      significanceThreshold?: number;
      variableColumn?: string;
      pValueColumn?: string;
    }
  ): Promise<any> {
    // Determine column names dynamically - check for common variable column names
    const possibleVariableColumns = ['Variable', 'variable', 'gene', 'feature'];
    const variableColumn = options?.variableColumn || 
      possibleVariableColumns.find(col => data[0] && data[0][col] !== undefined) || 'Variable';
    
    const pValueColumn = options?.pValueColumn || 'pValue';
    
    // Extract variables and p-values
    const variables = data.map((row, index) => row[variableColumn]?.toString() || `Variable_${index}`);
    const pValues = data.map(row => Number(row[pValueColumn]));
    const y = pValues.map(p => -Math.log10(p));
    
    // Create enhanced tooltips with key information
    const tooltips = data.map((row, index) => {
      const lines: string[] = [`<b>${row[variableColumn] || `Variable_${index}`}</b>`];
      
      // Always show p-value
      if (row[pValueColumn] !== undefined) {
        lines.push(`p-value: ${Number(row[pValueColumn]).toExponential(2)}`);
      }
      
      // Show FDR if available
      if (row.fdr !== undefined) {
        lines.push(`FDR: ${Number(row.fdr).toExponential(2)}`);
      }
      
      // Show effect size (estimate, coefficient, etc.)
      if (row.estimate !== undefined) {
        lines.push(`Estimate: ${Number(row.estimate).toFixed(3)}`);
      } else if (row.Coefficient !== undefined) {
        lines.push(`Coefficient: ${Number(row.Coefficient).toFixed(3)}`);
      } else if (row.statistic !== undefined) {
        lines.push(`Statistic: ${Number(row.statistic).toFixed(3)}`);
      }
      
      return lines.join('<br>');
    });

    // Determine point colors based on significance
    const colors = data.map(row => {
      const pVal = Number(row[pValueColumn]);
      const fdr = row.fdr ? Number(row.fdr) : null;
      
      if (fdr !== null && fdr < 0.05) {
        return '#22c55e'; // Green for FDR significant
      } else if (pVal < 0.05) {
        return '#3b82f6'; // Blue for p-value significant
      } else {
        return '#9ca3af'; // Gray for non-significant
      }
    });

    // Debug log for data validation
    console.log('Manhattan plot data:', {
      pointCount: variables.length,
      variableCount: new Set(variables).size,
      yRange: { min: Math.min(...y), max: Math.max(...y) },
      availableColumns: Object.keys(data[0] || {}),
      variableColumn,
      pValueColumn
    });

    const plotData = [{
      x: variables,
      y,
      text: tooltips,
      mode: 'markers',
      type: 'scatter',
      marker: {
        color: colors,
        size: 8,
        opacity: 0.7,
        line: { width: 1, color: '#ffffff' }
      },
      hovertemplate: '%{text}<extra></extra>',
      name: 'Variables'
    }];

    // Calculate y-axis range
    const yMin = Math.min(...y);
    const yMax = Math.max(...y);
    const yPad = (yMax - yMin) * 0.1 || 1;

    const shapes: any[] = [];
    
    // Add significance line if requested
    if (options?.significanceLine && options?.significanceThreshold) {
      shapes.push({
        type: 'line',
        x0: 0,
        x1: variables.length - 1,
        y0: options.significanceThreshold,
        y1: options.significanceThreshold,
        line: {
          color: 'red',
          width: 2,
          dash: 'dash'
        }
      });
    }

    const layout = {
      title: options?.title || 'Manhattan Plot',
      xaxis: {
        title: options?.xaxis || 'Variables',
        showticklabels: false, // Hide individual variable names as they would be too crowded
        zeroline: false
      },
      yaxis: {
        title: options?.yaxis || '-log10(p-value)',
        zeroline: true,
        zerolinecolor: '#e2e8f0',
        range: [Math.max(0, yMin - yPad), yMax + yPad]
      },
      shapes: shapes,
      margin: { t: 60, r: 40, b: 60, l: 60 },
      font: { family: 'Arial, sans-serif' },
      plot_bgcolor: '#f8fafc',
      paper_bgcolor: '#ffffff',
      height: 400,
      showlegend: false,
      hovermode: 'closest'
    };
    return this.createPlot(element, plotData, layout);
  }

  /**
   * Feature Importance Plot (Horizontal Bar Chart)
   * For regularization methods like Ridge, Lasso, Elastic Net
   */
  createFeatureImportancePlot(
    element: HTMLElement,
    data: any[],
    options?: {
      title?: string;
      topN?: number;
      variableColumn?: string;
      importanceColumn?: string;
      signColumn?: string;
    }
  ): Promise<any> {
    const variableColumn = options?.variableColumn || 'Variable';
    const importanceColumn = options?.importanceColumn || 'importance';
    const signColumn = options?.signColumn || 'sign';
    const topN = options?.topN || 20;

    // Filter and sort data
    const filteredData = data
      .filter((row: any) => {
        const importance = Number(row[importanceColumn]);
        const hasVariable = row[variableColumn];
        return hasVariable && !isNaN(importance) && importance !== null && importance !== undefined;
      })
      .sort((a: any, b: any) => {
        const aImp = Number(a[importanceColumn]);
        const bImp = Number(b[importanceColumn]);
        return bImp - aImp;
      })
      .slice(0, topN);

    if (filteredData.length === 0) {
      element.innerHTML = `
        <div style="height: 100%; display: flex; align-items: center; justify-content: center; color: #ef4444;">
          <p>No valid data for feature importance plot</p>
        </div>
      `;
      return Promise.resolve();
    }

    // Prepare data
    const variables = filteredData.map((row: any) => row[variableColumn] || 'Unknown');
    const importances = filteredData.map((row: any) => Number(row[importanceColumn]));
    const signs = filteredData.map((row: any) => Number(row[signColumn] || 0));
    
    // Create colors based on sign: positive = blue, negative = red, zero = gray
    const colors = signs.map((sign: number) => {
      if (sign > 0) return '#3b82f6'; // Blue for positive
      if (sign < 0) return '#ef4444'; // Red for negative
      return '#9ca3af'; // Gray for zero/unknown
    });

    const plotData = [{
      type: 'bar',
      orientation: 'h',
      x: importances,
      y: variables,
      marker: {
        color: colors
      },
      text: importances.map((imp: number) => imp.toFixed(1)),
      textposition: 'outside',
      hovertemplate: '<b>%{y}</b><br>Importance: %{x:.2f}<extra></extra>'
    }];

    const layout = {
      title: options?.title || `Top ${filteredData.length} Features by Importance`,
      xaxis: {
        title: 'Importance (%)',
        showgrid: true,
        gridcolor: '#e2e8f0'
      },
      yaxis: {
        title: '',
        showgrid: false,
        automargin: true,
        type: 'category'
      },
      margin: { l: 150, r: 40, t: 60, b: 40 },
      height: Math.max(400, filteredData.length * 25 + 100),
      showlegend: false
    };

    return this.createPlot(element, plotData, layout);
  }

  /**
   * Volcano Plot for differential expression
   * x-axis: log fold change (estimate), y-axis: -log10(p-value)
   */
  createVolcanoPlot(
    element: HTMLElement,
    data: any[],
    options?: {
      title?: string;
      estimateColumn?: string;
      pValueColumn?: string;
      variableColumn?: string;
      fdrColumn?: string;
    }
  ): Promise<any> {
    const estimateColumn = options?.estimateColumn || 'estimate';
    const pValueColumn = options?.pValueColumn || 'pValue';
    const variableColumn = options?.variableColumn || 'Variable';
    const fdrColumn = options?.fdrColumn || 'fdr';

    // Filter valid data
    const validData = data.filter(row => {
      const estimate = Number(row[estimateColumn]);
      const pValue = Number(row[pValueColumn]);
      return !isNaN(estimate) && !isNaN(pValue) && pValue > 0;
    });

    if (validData.length === 0) {
      element.innerHTML = `
        <div style="height: 100%; display: flex; align-items: center; justify-content: center; color: #ef4444;">
          <p>No valid data for volcano plot</p>
        </div>
      `;
      return Promise.resolve();
    }

    const x = validData.map(row => Number(row[estimateColumn]));
    const y = validData.map(row => -Math.log10(Number(row[pValueColumn])));
    const variables = validData.map(row => row[variableColumn] || 'Unknown');

    // Determine point colors and sizes based on significance
    const colors = validData.map(row => {
      const pVal = Number(row[pValueColumn]);
      const fdr = row[fdrColumn] ? Number(row[fdrColumn]) : null;
      const estimate = Math.abs(Number(row[estimateColumn]));

      if (fdr !== null && fdr < 0.05 && estimate > 0.1) {
        return '#dc2626'; // Red for significant with large effect
      } else if (pVal < 0.05 && estimate > 0.1) {
        return '#f97316'; // Orange for trending with large effect
      } else if (fdr !== null && fdr < 0.05) {
        return '#22c55e'; // Green for significant
      } else if (pVal < 0.05) {
        return '#3b82f6'; // Blue for trending
      } else {
        return '#9ca3af'; // Gray for non-significant
      }
    });

    const plotData = [{
      x: x,
      y: y,
      mode: 'markers',
      type: 'scatter',
      marker: {
        color: colors,
        size: 6,
        opacity: 0.7
      },
      text: variables,
      hovertemplate: '<b>%{text}</b><br>Estimate: %{x:.3f}<br>-log10(p): %{y:.2f}<extra></extra>',
      name: 'Variables'
    }];

    const layout = {
      title: options?.title || 'Volcano Plot',
      xaxis: {
        title: 'Log Fold Change (Estimate)',
        zeroline: true,
        zerolinecolor: '#e2e8f0'
      },
      yaxis: {
        title: '-log10(p-value)',
        zeroline: false
      },
      shapes: [
        // Vertical lines for effect size thresholds
        {
          type: 'line',
          x0: -0.1, x1: -0.1,
          y0: 0, y1: 1,
          yref: 'paper',
          line: { color: '#9ca3af', width: 1, dash: 'dot' }
        },
        {
          type: 'line',
          x0: 0.1, x1: 0.1,
          y0: 0, y1: 1,
          yref: 'paper',
          line: { color: '#9ca3af', width: 1, dash: 'dot' }
        },
        // Horizontal line for p-value threshold
        {
          type: 'line',
          x0: 0, x1: 1,
          xref: 'paper',
          y0: -Math.log10(0.05), y1: -Math.log10(0.05),
          line: { color: '#dc2626', width: 1, dash: 'dash' }
        }
      ],
      showlegend: false
    };

    return this.createPlot(element, plotData, layout);
  }

  /**
   * Effect Size Plot for t-tests and similar
   * Shows estimates with confidence intervals
   */
  createEffectSizePlot(
    element: HTMLElement,
    data: any[],
    options?: {
      title?: string;
      estimateColumn?: string;
      confLowColumn?: string;
      confHighColumn?: string;
      variableColumn?: string;
      topN?: number;
    }
  ): Promise<any> {
    const estimateColumn = options?.estimateColumn || 'estimate';
    const confLowColumn = options?.confLowColumn || 'conf.low';
    const confHighColumn = options?.confHighColumn || 'conf.high';
    const variableColumn = options?.variableColumn || 'Variable';
    const topN = options?.topN || 20;

    // Filter and sort by absolute effect size
    const validData = data
      .filter(row => {
        const estimate = Number(row[estimateColumn]);
        return !isNaN(estimate) && row[variableColumn];
      })
      .sort((a, b) => Math.abs(Number(b[estimateColumn])) - Math.abs(Number(a[estimateColumn])))
      .slice(0, topN);

    if (validData.length === 0) {
      element.innerHTML = `
        <div style="height: 100%; display: flex; align-items: center; justify-content: center; color: #ef4444;">
          <p>No valid data for effect size plot</p>
        </div>
      `;
      return Promise.resolve();
    }

    const variables = validData.map(row => row[variableColumn]);
    const estimates = validData.map(row => Number(row[estimateColumn]));
    const confLow = validData.map(row => Number(row[confLowColumn] || 0));
    const confHigh = validData.map(row => Number(row[confHighColumn] || 0));

    const plotData = [{
      x: estimates,
      y: variables,
      error_x: {
        type: 'data',
        symmetric: false,
        arrayminus: estimates.map((est, i) => est - confLow[i]),
        array: estimates.map((est, i) => confHigh[i] - est)
      },
      mode: 'markers',
      type: 'scatter',
      marker: {
        color: estimates.map(est => est > 0 ? '#3b82f6' : '#ef4444'),
        size: 8
      },
      hovertemplate: '<b>%{y}</b><br>Estimate: %{x:.3f}<extra></extra>',
      name: 'Effect Size'
    }];

    const layout = {
      title: options?.title || 'Effect Sizes with Confidence Intervals',
      xaxis: {
        title: 'Effect Size (Estimate)',
        zeroline: true,
        zerolinecolor: '#e2e8f0'
      },
      yaxis: {
        title: '',
        type: 'category',
        automargin: true
      },
      margin: { l: 150, r: 40, t: 60, b: 40 },
      height: Math.max(400, validData.length * 30 + 100),
      showlegend: false
    };

    return this.createPlot(element, plotData, layout);
  }
  
  createPlot(
    element: HTMLElement, 
    data: any[], 
    layout?: any, 
    config?: any
  ): Promise<any> {
    const defaultLayout = {
      margin: { t: 40, r: 40, b: 40, l: 40 },
      font: { family: 'Arial, sans-serif' },
      plot_bgcolor: '#f8fafc',
      paper_bgcolor: '#ffffff',
      ...layout
    };

    const defaultConfig = {
      responsive: true,
      displayModeBar: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
      ...config
    };

    return Plotly.newPlot(element, data, defaultLayout, defaultConfig);
  }

  updatePlot(element: HTMLElement, data: any[], layout?: any): Promise<any> {
    return Plotly.react(element, data, layout);
  }

  purge(element: HTMLElement): void {
    Plotly.purge(element);
  }

  // Helper methods for common plot types
  createScatterPlot(
    element: HTMLElement,
    x: number[],
    y: number[],
    options?: {
      title?: string;
      xaxis?: string;
      yaxis?: string;
      mode?: string;
    }
  ): Promise<any> {
    const data = [{
      x,
      y,
      mode: options?.mode || 'markers',
      type: 'scatter',
      marker: { 
        color: '#0284c7',
        size: 8
      }
    }];

    const layout = {
      title: options?.title || '',
      xaxis: { title: options?.xaxis || '' },
      yaxis: { title: options?.yaxis || '' }
    };

    return this.createPlot(element, data, layout);
  }

  createHistogram(
    element: HTMLElement,
    values: number[],
    options?: {
      title?: string;
      xaxis?: string;
      yaxis?: string;
      nbins?: number;
    }
  ): Promise<any> {
    const data = [{
      x: values,
      type: 'histogram',
      nbinsx: options?.nbins || 20,
      marker: {
        color: '#0284c7'
      }
    }]

    const layout = {
      title: options?.title || '',
      xaxis: { title: options?.xaxis || '' },
      yaxis: { title: options?.yaxis || 'Frequenza' }
    };

    return this.createPlot(element, data, layout);
  }

  createOutcomePreviewHistogram(
    element: HTMLElement,
    values: number[],
    options?: {
      title?: string;
      xaxis?: string;
      yaxis?: string;
      nbins?: number;
    }
  ): Promise<any> {
    const data = [{
      x: values,
      type: 'histogram',
      nbinsx: options?.nbins || 20,
      marker: {
        color: '#0284c7'
      }
    }];
    
    const tertile1 = values[Math.floor(values.length / 3)];
    const tertile2 = values[Math.floor(2 * values.length / 3)];

    const layout = {
      title: options?.title || '',
      xaxis: { title: options?.xaxis || '' },
      yaxis: { title: options?.yaxis || 'Frequenza' },
      shapes: [
        {
          type: 'line',
          x0: tertile1,
          x1: tertile1,
          y0: 0,
          y1: 1,
          yref: 'paper',
          line: {
            color: 'red',
            width: 2,
            dash: 'dot',
          },
        },
        {
          type: 'line',
          x0: tertile2,
          x1: tertile2,
          y0: 0,
          y1: 1,
          yref: 'paper',
          line: {
            color: 'green',
            width: 2,
            dash: 'dot',
          },
        },
      ]
    };

    return this.createPlot(element, data, layout);
  }

  createBoxPlot(
    element: HTMLElement,
    data: { name: string; values: number[] }[],
    options?: {
      title?: string;
      yaxis?: string;
    }
  ): Promise<any> {
    const traces = data.map(group => ({
      y: group.values,
      name: group.name,
      type: 'box',
      marker: { color: '#0284c7' }
    }));

    const layout = {
      title: options?.title || '',
      yaxis: { title: options?.yaxis || '' }
    };

    return this.createPlot(element, traces, layout);
  }

  createHeatmap(
    element: HTMLElement,
    z: number[][],
    options?: {
      title?: string;
      xLabels?: string[];
      yLabels?: string[];
    }
  ): Promise<any> {
    const data = [{
      z,
      x: options?.xLabels,
      y: options?.yLabels,
      type: 'heatmap',
      colorscale: 'Blues'
    }];

    const layout = {
      title: options?.title || ''
    };

    return this.createPlot(element, data, layout);
  }
}

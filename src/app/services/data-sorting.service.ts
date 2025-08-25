import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DataSortingService {

  constructor() { }

  /**
   * Sort data by p-value in ascending order (smallest p-values first)
   * Creates a copy of the data to avoid mutating the original
   */
  sortDataByPValue(data: any[]): any[] {
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

  /**
   * Sort data by importance in descending order (highest importance first)
   * Creates a copy of the data to avoid mutating the original
   */
  sortDataByImportance(data: any[]): any[] {
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

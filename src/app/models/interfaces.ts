export interface FileData {
  file: File;
  fileName: string;
  fileSize: number;
  uploadDate: Date;
  preview?: FilePreview;
  processedFile?: File;
  sessionId?: string;
  userId?: string;
}

export interface FilePreview {
  headers: string[];
  rows: any[][];
  totalRows: number;
}

export interface ColumnClassification {
  idColumn: string | null;  // null means use row indices, string for column name
  outcomeColumn: string | '';  // can be empty initially, always stored as column name
  covariateColumns: string[];  // always stored as column names
  omicsColumns: string[];      // always stored as column names
  categoricalColumns: string[]; // always stored as column names
  // Add outcome type detection
  outcomeType?: 'continuous' | 'categorical' | 'auto-detect';
}

export interface PreprocessingOptions {
  columnClassification: ColumnClassification;
  removeNullValues: boolean;
  fillMissingValues: 'none' | 'mean' | 'median' | 'knn5';
  transformation: 'none' | 'scale' | 'center' | 'standardize' | 'log' | 'log2' | 'yeo-johnson';
  removeOutliers: boolean;
  outlierMethod: 'iqr' | 'zscore' | 'isolation';
  missingDataRemoval?: MissingDataRemovalOptions;
  sessionId?: string;
  userId?: string;
}

export interface MissingDataRemovalOptions {
  enabled: boolean;
  threshold: number;
  columnsToRemove: string[];
}

export interface MultivariateMethodConfig {
  enabled: boolean;
  lambdaSelection: 'automatic' | 'manual';
  lambdaRange?: {
    min: number;
    max: number;
    step: number;
  };
  metric: 'rmse' | 'rsquared' | 'accuracy' | 'auc' | 'f1' | 'kappa';
  lambdaRule: 'min' | '1se';
  includeCovariates: boolean;
}

export interface RandomForestConfig {
  enabled: boolean;
  ntree: 100 | 500 | 1000;
  mtrySelection: 'automatic' | 'manual';
  mtryValue?: number;
  includeCovariates: boolean;
}

export interface BorutaConfig {
  enabled: boolean;
  ntree: 100 | 500 | 1000;
  mtrySelection: 'automatic' | 'manual';
  mtryValue?: number;
  maxRuns: number;
  roughFixTentativeFeatures: boolean;
  includeCovariates: boolean;
}

export interface RFEConfig {
  enabled: boolean;
  metric: 'rmse' | 'rsquared' | 'accuracy' | 'auc' | 'f1' | 'kappa';
  subsetSizeType: 'automatic' | 'custom';
  customSubsetSizes?: string;
  includeCovariates: boolean;
}

export interface AnalysisOptions {
  sessionId?: string;
  userId?: string;
  groupingMethod?: 'none' | 'tertiles' | 'threshold';
  thresholdValues?: number[];
  statisticalTests: string[];
  linearRegression: boolean;
  linearRegressionWithoutInfluentials: boolean;
  multivariateAnalysis: {
    ridge: MultivariateMethodConfig;
    lasso: MultivariateMethodConfig;
    elasticNet: MultivariateMethodConfig;
    randomForest: RandomForestConfig;
    boruta: BorutaConfig;
    rfe: RFEConfig;
  };
  clusteringMethod?: string;
  customAnalysis?: any;
  analysisType?: 'regression' | 'classification';

}

export interface AnalysisRequest {
  sessionId: string;
  userId: string;
  file: File;
  preprocessingOptions: PreprocessingOptions;
  analysisOptions: AnalysisOptions;
}

export interface AnalysisResult {
  id: string;
  status: 'pending' | 'completed' | 'error';
  results?: any;
  error?: string;
  timestamp: Date;
}

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  route: string;
  status: 'pending' | 'active' | 'completed' | 'disabled';
}

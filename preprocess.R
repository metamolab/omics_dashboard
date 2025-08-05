# preprocess.R
# Data preprocessing script for omics analysis

library(jsonlite)
library(readr)
library(dplyr)
library(tidyr)
library(VIM)
library(tools)

# Helper functions for preprocessing
remove_outliers_iqr_tidy <- function(df) {
  df %>%
    mutate(across(
      where(is.numeric),
      ~ {
        Q1 <- quantile(.x, 0.25, na.rm = TRUE)
        Q3 <- quantile(.x, 0.75, na.rm = TRUE)
        IQR_val <- Q3 - Q1
        lower <- Q1 - 1.5 * IQR_val
        upper <- Q3 + 1.5 * IQR_val
        replace(.x, .x < lower | .x > upper, NA)
      }
    ))
}

remove_outliers_zscore_tidy <- function(df, threshold = 3) {
  df %>%
    mutate(across(
      where(is.numeric),
      ~ {
        mu <- mean(.x, na.rm = TRUE)
        sigma <- sd(.x, na.rm = TRUE)
        z <- (.x - mu) / sigma
        replace(.x, abs(z) > threshold, NA)
      }
    ))
}

preprocess_data <- function(temp_file, options) {
  
  cat("=== PREPROCESS_DATA DEBUG ===\n", file = stderr())
  cat("options class:", class(options), "\n", file = stderr())
  cat("options names:", names(options), "\n", file = stderr())
  cat("options$columnClassification class:", class(options$columnClassification), "\n", file = stderr())
  
  if (!is.null(options$columnClassification)) {
    classification <- options$columnClassification
    cat("classification class:", class(classification), "\n", file = stderr())
    cat("classification names:", names(classification), "\n", file = stderr())
    cat("idColumn:", classification$idColumn, "class:", class(classification$idColumn), "\n", file = stderr())
    cat("outcomeColumn:", classification$outcomeColumn, "class:", class(classification$outcomeColumn), "\n", file = stderr())
    cat("covariateColumns class:", class(classification$covariateColumns), "\n", file = stderr())
    cat("covariateColumns unlisted:", unlist(classification$covariateColumns), "\n", file = stderr())
    cat("============================\n", file = stderr())
    
    # Se non c'è colonna ID, aggiungi indici righe
    if (is.null(classification$idColumn)) {
      temp_file <- cbind(row_id = 1:nrow(temp_file), temp_file)
    }
    
    # Identifica colonne per tipo (converti da 0 a 1)
    get_column_names <- function(cols) {
      if (is.null(cols) || length(cols) == 0) return(NULL)
      
      # Handle case where cols might be a list (from simplifyVector = FALSE)
      if (is.list(cols)) {
        cols <- unlist(cols)
      }
      
      sapply(cols, function(col) {
        if (is.numeric(col)) {
          names(temp_file)[col + 1]
        } else {
          col
        }
      })
    }
    
    # Ottieni nomi colonne - handle lists from simplifyVector = FALSE
    id_col <- if (!is.null(classification$idColumn)) {
      id_val <- if (is.list(classification$idColumn)) unlist(classification$idColumn) else classification$idColumn
      if (is.numeric(id_val)) {
        names(temp_file)[id_val + 1]
      } else {
        id_val
      }
    } else {
      "row_id"
    }
    
    outcome_col <- if (!is.null(classification$outcomeColumn)) {
      outcome_val <- if (is.list(classification$outcomeColumn)) unlist(classification$outcomeColumn) else classification$outcomeColumn
      if (is.numeric(outcome_val)) {
        names(temp_file)[outcome_val + 1]
      } else {
        outcome_val
      }
    } else {
      NULL
    }
    
    cat("About to call get_column_names for covariate_cols...\n", file = stderr())
    covariate_cols <- tryCatch({
      get_column_names(classification$covariateColumns)
    }, error = function(e) {
      cat("ERROR in covariate_cols get_column_names:", e$message, "\n", file = stderr())
      return(NULL)
    })
    
    cat("About to call get_column_names for omics_cols...\n", file = stderr())
    omics_cols <- tryCatch({
      get_column_names(classification$omicsColumns)
    }, error = function(e) {
      cat("ERROR in omics_cols get_column_names:", e$message, "\n", file = stderr())
      return(NULL)
    })
    
    cat("About to call get_column_names for categorical_cols...\n", file = stderr())
    categorical_cols <- tryCatch({
      get_column_names(classification$categoricalColumns)
    }, error = function(e) {
      cat("ERROR in categorical_cols get_column_names:", e$message, "\n", file = stderr())
      return(NULL)
    })
    cat("get_column_names calls completed successfully\n", file = stderr())
    cat("covariate_cols:", covariate_cols, "\n", file = stderr())
    cat("omics_cols:", omics_cols, "\n", file = stderr())
    cat("categorical_cols:", categorical_cols, "\n", file = stderr())
    
    if(length(categorical_cols) == 0) {
      categorical_cols <- NULL
    }
    if(length(covariate_cols) == 0) {
      covariate_cols <- NULL
    }
    
    cat("After length checks - about to proceed with data processing\n", file = stderr())
  } else {
    # Fallback if no column classification provided
    id_col <- names(temp_file)[1]
    outcome_col <- names(temp_file)[2]
    covariate_cols <- NULL
    omics_cols <- names(temp_file)[3:ncol(temp_file)]
    categorical_cols <- NULL
  }
  
  removed_cols <- NULL
  
  # Select relevant columns and convert types
  cat("About to select columns...\n", file = stderr())
  cat("Columns to select:", c(id_col, outcome_col, covariate_cols, omics_cols), "\n", file = stderr())
  
  temp_processed_file <- tryCatch({
    temp_file %>% 
      dplyr::select(any_of(c(id_col, outcome_col, covariate_cols, omics_cols))) %>%
      mutate(across(where(is.character), as.factor)) %>%
      mutate(across(any_of(c(id_col, categorical_cols)), as.factor))
  }, error = function(e) {
    cat("ERROR in data selection:", e$message, "\n", file = stderr())
    stop(e$message)
  })
  
  cat("Data selection completed successfully\n", file = stderr())
  cat("Processed file dimensions:", nrow(temp_processed_file), "x", ncol(temp_processed_file), "\n", file = stderr())
  
  # Remove columns with too much NAs
  cat("About to check missing data removal...\n", file = stderr())
  cat("options$missingDataRemoval exists:", !is.null(options$missingDataRemoval), "\n", file = stderr())
  if (!is.null(options$missingDataRemoval)) {
    cat("options$missingDataRemoval$enabled:", options$missingDataRemoval$enabled, "\n", file = stderr())
  } else {
    cat("options$missingDataRemoval is NULL\n", file = stderr())
  }
  
  if(!is.null(options$missingDataRemoval) && !is.null(options$missingDataRemoval$enabled) && options$missingDataRemoval$enabled == TRUE) {
    cat("Processing missing data removal...\n", file = stderr())
    freq_threshold <- as.numeric(options$missingDataRemoval$threshold)/100
    missing_freq <- colMeans(is.na(temp_processed_file))
    temp_processed_file <- temp_processed_file[, missing_freq <= freq_threshold]
    removed_cols <- names(missing_freq[missing_freq > freq_threshold])
    cat("Missing data removal completed\n", file = stderr())
  } else {
    cat("Skipping missing data removal\n", file = stderr())
  }
  
  # Remove outliers based on IQR, zscore or other methods
  if(options$removeOutliers == TRUE) {
    temp_processed_file <- switch(options$outlierMethod,
                                  "iqr" = remove_outliers_iqr_tidy(temp_processed_file),
                                  "zscore" = remove_outliers_zscore_tidy(temp_processed_file, threshold = 3),
                                  "isolation" = temp_processed_file
    )
  }

  # Remove all cases with NAs (complete cases)
  if(options$removeNullValues == TRUE) {
    temp_processed_file <- temp_processed_file %>% filter(!if_any(everything(), is.na))
  } else {
    # Do not remove or impute with mean, median, knn5
    temp_processed_file <- switch(options$fillMissingValues,
                                   "none" = temp_processed_file,
                                   "mean" = temp_processed_file %>%
                                     mutate(across(where(is.numeric), ~ ifelse(is.na(.), mean(., na.rm = TRUE), .))),
                                   "median" = temp_processed_file %>% 
                                     mutate(across(where(is.numeric), ~ ifelse(is.na(.), median(., na.rm = TRUE), .))),
                                   "knn5" = kNN(temp_processed_file, k = 5, imp_var = FALSE)
    )
  }

  # Transform data
  if(options$transformation != "none") {
    temp_processed_file <- switch(options$transformation,
        "center" = temp_processed_file %>% 
          mutate(across(where(is.numeric), ~ as.numeric(scale(., center = TRUE, scale = FALSE)))),
        "scale" = temp_processed_file %>% 
          mutate(across(where(is.numeric), ~ as.numeric(scale(., center = FALSE, scale = TRUE)))),
        "standardize" = temp_processed_file %>% 
          mutate(across(where(is.numeric), ~ as.numeric(scale(., center = TRUE, scale = TRUE)))),
        "log" = temp_processed_file %>% 
          mutate(across(where(is.numeric), ~ log(.x - min(.x, na.rm = TRUE) + 1))),
        "log2" = temp_processed_file %>% 
          mutate(across(where(is.numeric), ~ log2(.x - min(.x, na.rm = TRUE) + 1))),
        "yeo-johnson" = temp_processed_file
    )
  }

  preprocessing_info <- list(
    id_column = id_col,
    outcome_column = outcome_col,
    covariate_columns = covariate_cols,
    omics_columns = omics_cols,
    categorical_columns = categorical_cols,
    processed_date = Sys.Date(),
    n_rows = nrow(temp_processed_file),
    n_cols = ncol(temp_processed_file),
    removedNAs = options$removeNullValues,
    missingDataRemoval = options$missingDataRemoval$enabled,
    missingThreshold = ifelse(is.null(options$missingDataRemoval$threshold), NULL, options$missingDataRemoval$threshold),
    removedMissing = removed_cols,
    substNAs = options$fillMissingValues,
    transformation = options$transformation,
    removeOutliers = options$removeOutliers,
    outlierMethod = options$outlierMethod,
    analysisType = options$analysisType,
    sessionId = options$sessionId,
    userId = options$userId
  )
  
  return(list("temp_processed_file" = temp_processed_file, "preprocessing_info" = preprocessing_info))
}

# Get command line arguments
args <- commandArgs(trailingOnly = TRUE)

if (length(args) == 0) {
  stop("No arguments provided")
}

# Parse JSON arguments
input_data <- fromJSON(args[1], simplifyVector = FALSE)

input_file <- input_data$input_file
output_dir <- input_data$output_dir
options <- input_data$options

# DIAGNOSTIC: Print received options to stderr for PowerShell visibility
cat("=== PREPROCESS.R DIAGNOSTICS ===\n", file = stderr())
cat("Input file:", input_file, "\n", file = stderr())
cat("Output directory:", output_dir, "\n", file = stderr())
cat("Options received:\n", file = stderr())
cat(toJSON(options, auto_unbox = TRUE, pretty = TRUE), "\n", file = stderr())
cat("================================\n", file = stderr())

tryCatch({
  # DIAGNOSTIC: Debug data access
  cat("=== DEBUG DATA ACCESS ===\n", file = stderr())
  cat("input_data class:", class(input_data), "\n", file = stderr())
  cat("input_data names:", names(input_data), "\n", file = stderr())
  cat("options class:", class(input_data$options), "\n", file = stderr())
  if (!is.null(input_data$options)) {
    cat("options names:", names(input_data$options), "\n", file = stderr())
  }
  cat("=========================\n", file = stderr())
  
  # Read the input file
  # Detect file type and read accordingly
  file_ext <- tolower(tools::file_ext(input_file))
  
  if (file_ext %in% c("csv")) {
    data <- read_csv(input_file, show_col_types = FALSE)
  } else if (file_ext %in% c("txt", "tsv")) {
    data <- read_tsv(input_file, show_col_types = FALSE)
  } else {
    stop(paste("Unsupported file format:", file_ext))
  }
  
  cat("=== DATA READ SUCCESSFUL ===\n", file = stderr())
  cat("Data dimensions:", nrow(data), "x", ncol(data), "\n", file = stderr())
  cat("Data column names:", paste(names(data), collapse = ", "), "\n", file = stderr())
  cat("============================\n", file = stderr())
  
  # Apply preprocessing using the comprehensive function
  preprocessing_result <- preprocess_data(data, options)
  processed_data <- preprocessing_result$temp_processed_file
  preprocessing_info <- preprocessing_result$preprocessing_info
  
  # DIAGNOSTIC: Print preprocessing results
  cat("=== PREPROCESSING COMPLETED ===\n", file = stderr())
  cat("Original data dimensions:", nrow(data), "x", ncol(data), "\n", file = stderr())
  cat("Processed data dimensions:", nrow(processed_data), "x", ncol(processed_data), "\n", file = stderr())
  cat("ID column:", preprocessing_info$id_column, "\n", file = stderr())
  cat("Outcome column:", preprocessing_info$outcome_column, "\n", file = stderr())
  cat("Covariate columns:", length(preprocessing_info$covariate_columns %||% c()), "\n", file = stderr())
  cat("Omics columns:", length(preprocessing_info$omics_columns %||% c()), "\n", file = stderr())
  cat("Transformation applied:", preprocessing_info$transformation, "\n", file = stderr())
  cat("Outliers removed:", preprocessing_info$removeOutliers, "\n", file = stderr())
  cat("Missing data handling:", preprocessing_info$substNAs, "\n", file = stderr())
  cat("===============================\n", file = stderr())
  
  # Save processed data
  output_file <- file.path(output_dir, "processed_data.csv")
  write_csv(processed_data, output_file)
  
  # DIAGNOSTIC: Print file output info
  cat("=== FILE OUTPUT ===\n", file = stderr())
  cat("Processed file saved to:", output_file, "\n", file = stderr())
  cat("File size:", file.size(output_file), "bytes\n", file = stderr())
  cat("==================\n", file = stderr())
  
  # Return success result
  result <- list(
    success = TRUE,
    message = "Data preprocessing completed successfully",
    processed_file_path = output_file,
    processed_rows = nrow(processed_data),
    processed_columns = ncol(processed_data),
    preprocessing_summary = list(
      original_dimensions = paste(nrow(data), "x", ncol(data)),
      processed_dimensions = paste(nrow(processed_data), "x", ncol(processed_data)),
      missing_values_handled = options$fillMissingValues,
      transformation_applied = options$transformation,
      outliers_removed = options$removeOutliers,
      columns_removed_missing = length(preprocessing_info$removedMissing %||% c()),
      id_column = preprocessing_info$id_column,
      outcome_column = preprocessing_info$outcome_column,
      covariate_columns = length(preprocessing_info$covariate_columns %||% c()),
      omics_columns = length(preprocessing_info$omics_columns %||% c())
    )
  )
  
}, error = function(e) {
  # DIAGNOSTIC: Print error info
  cat("=== ERROR OCCURRED ===\n", file = stderr())
  cat("Error message:", e$message, "\n", file = stderr())
  cat("======================\n", file = stderr())
  
  result <- list(
    success = FALSE,
    message = paste("Preprocessing failed:", e$message),
    processed_file_path = NULL,
    error = e$message
  )
})

# DIAGNOSTIC: Print final result being returned
cat("=== FINAL RESULT ===\n", file = stderr())
cat("Success:", result$success, "\n", file = stderr())
cat("Message:", result$message, "\n", file = stderr())
if (result$success) {
  cat("Processed file path:", result$processed_file_path, "\n", file = stderr())
  cat("Summary dimensions:", result$preprocessing_summary$processed_dimensions, "\n", file = stderr())
}
cat("====================\n", file = stderr())

# Output JSON result
cat(toJSON(result, auto_unbox = TRUE, pretty = FALSE))

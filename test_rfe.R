# Test script for RFE function
library(jsonlite)
library(readr)
library(dplyr)
library(tidyr)
library(purrr)
library(broom)
library(rstatix)
library(glmnet)
library(caret)
library(randomForest)
library(doParallel)
library(Boruta)

# Define logging functions locally to avoid sourcing main script
write_log <- function(message, level = "INFO") {
  timestamp <- format(Sys.time(), "%Y-%m-%d %H:%M:%S")
  cat(paste0("[", timestamp, "] [", level, "] ", message, "\n"))
}

log_function <- function(func_name, action = "ENTER", details = "") {
  if (action == "ENTER") {
    write_log(paste("ENTERING function:", func_name, details), "DEBUG")
  } else if (action == "EXIT") {
    write_log(paste("EXITING function:", func_name, details), "DEBUG")
  }
}

# Copy the RFE function with all the enhanced diagnostics
do_rfe <- function(data, outcome, subset_selection, my_subset_size, metric) {
  log_function("do_rfe", "ENTER", paste("- Features:", ncol(data)-1))
  
  write_log("Running Recursive Feature Elimination (RFE)")
  write_log(paste("Subset selection method:", subset_selection))
  write_log(paste("Metric for optimization:", metric))
  
  # ENHANCED DIAGNOSTICS: Log input parameters
  write_log(paste("Input data dimensions:", nrow(data), "rows x", ncol(data), "columns"))
  write_log(paste("Outcome variable:", outcome))
  write_log(paste("Original subset_selection:", subset_selection))
  write_log(paste("Original my_subset_size type:", class(my_subset_size)))
  write_log(paste("Original my_subset_size length:", length(my_subset_size)))
  write_log(paste("Original my_subset_size values:", paste(my_subset_size, collapse = ", ")))
  
  # Check if outcome exists in data
  if (!outcome %in% names(data)) {
    error_msg <- paste("Outcome variable", outcome, "not found in data. Available columns:", paste(names(data), collapse = ", "))
    write_log(error_msg, "ERROR")
    stop(error_msg)
  }
  
  form <- paste0(outcome, " ~ .")
  write_log(paste("Formula:", form))
  
  # ENHANCED DIAGNOSTICS: Validate and process subset sizes
  if(subset_selection == "automatic") {
    max_features <- ncol(data) - 1  # Exclude outcome column
    write_log(paste("Maximum available features for automatic selection:", max_features))
    
    if (max_features < 5) {
      write_log("Too few features for automatic subset selection, using all available features", "WARN")
      my_subset_size <- max_features
    } else {
      my_subset_size <- exp(seq(log(5), log(max_features), length.out = 10))
      my_subset_size <- round(my_subset_size / 5) * 5
      my_subset_size <- unique(my_subset_size)
      # Ensure we don't exceed available features
      my_subset_size <- my_subset_size[my_subset_size <= max_features]
      # Ensure at least one size
      if (length(my_subset_size) == 0) {
        my_subset_size <- min(5, max_features)
      }
    }
    write_log(paste("Using automatic subset sizes:", paste(my_subset_size, collapse = ", ")))
  } else {
    # ENHANCED DIAGNOSTICS: Validate custom subset sizes
    write_log("Processing custom subset sizes...")
    
    # Handle various input formats
    if (is.null(my_subset_size)) {
      write_log("Custom subset sizes is NULL, using automatic", "WARN")
      subset_selection <- "automatic"
      max_features <- ncol(data) - 1
      my_subset_size <- min(5, max_features)
    } else if (is.character(my_subset_size)) {
      write_log("Converting custom subset sizes from character format")
      my_subset_size <- as.numeric(trimws(strsplit(my_subset_size, ",")[[1]]))
    } else if (is.list(my_subset_size)) {
      write_log("Converting custom subset sizes from list format")
      my_subset_size <- as.numeric(unlist(my_subset_size))
    }
    
    # Remove NA values and ensure numeric
    my_subset_size <- my_subset_size[!is.na(my_subset_size)]
    my_subset_size <- as.integer(my_subset_size)
    
    # Validate ranges
    max_features <- ncol(data) - 1
    my_subset_size <- my_subset_size[my_subset_size > 0 & my_subset_size <= max_features]
    
    if (length(my_subset_size) == 0) {
      write_log("No valid custom subset sizes found, using automatic", "WARN")
      my_subset_size <- min(5, max_features)
    }
    
    # Remove duplicates and sort
    my_subset_size <- sort(unique(my_subset_size))
    
    write_log(paste("Final custom subset sizes:", paste(my_subset_size, collapse = ", ")))
  }
  
  # ENHANCED DIAGNOSTICS: Validate metric
  original_metric <- metric
  if(metric == "rmse") {
    metric <- "RMSE"
  } else if(metric == "rsquared") {
    metric <- "Rsquared"
  } else if(metric == "Accuracy") {
    metric <- "Accuracy"
  } else {
    # Default to Accuracy for classification
    write_log(paste("Unknown metric:", original_metric, "defaulting to Accuracy"), "WARN")
    metric <- "Accuracy"
  }
  write_log(paste("Final metric:", metric))
  
  # ENHANCED DIAGNOSTICS: Check data quality before RFE
  outcome_values <- data[[outcome]]
  write_log(paste("Outcome variable summary:"))
  write_log(paste("  Class:", class(outcome_values)))
  write_log(paste("  Length:", length(outcome_values)))
  write_log(paste("  Unique values:", length(unique(outcome_values))))
  write_log(paste("  Missing values:", sum(is.na(outcome_values))))
  
  if (is.factor(outcome_values) || is.character(outcome_values)) {
    write_log(paste("  Levels:", paste(unique(outcome_values), collapse = ", ")))
  } else {
    write_log(paste("  Range:", min(outcome_values, na.rm = TRUE), "to", max(outcome_values, na.rm = TRUE)))
  }
  
  # Check for constant or near-constant predictors
  predictor_cols <- setdiff(names(data), outcome)
  write_log(paste("Number of predictor variables:", length(predictor_cols)))
  
  constant_vars <- sapply(data[predictor_cols], function(x) {
    if (is.numeric(x)) {
      var(x, na.rm = TRUE) == 0 || is.na(var(x, na.rm = TRUE))
    } else {
      length(unique(x[!is.na(x)])) <= 1
    }
  })
  
  if (any(constant_vars)) {
    constant_var_names <- names(constant_vars)[constant_vars]
    write_log(paste("Warning: Constant variables detected:", paste(constant_var_names, collapse = ", ")), "WARN")
  }
  
  rfe_control <- rfeControl(functions = rfFuncs,
                            method = "cv", 
                            number = 10,
                            verbose = FALSE,
                            saveDetails = TRUE,
                            returnResamp = "all")
  
  write_log(paste("RFE control settings:"))
  write_log(paste("  Method: cv"))
  write_log(paste("  Number of folds: 10"))
  write_log(paste("  Functions: rfFuncs"))
  
  set.seed(1234)
  write_log("Starting RFE cross-validation...")
  write_log(paste("Testing subset sizes:", paste(my_subset_size, collapse = ", ")))
  
  # ENHANCED DIAGNOSTICS: Wrap RFE in try-catch
  tryCatch({
    rfe_results <- rfe(as.formula(form), data = data, 
                       sizes = my_subset_size, metric = metric,
                       rfeControl = rfe_control,
                       preProcess = c("center", "scale", "nzv"))
    
    write_log("RFE execution completed successfully")
  }, error = function(e) {
    error_msg <- paste("RFE execution failed:", e$message)
    write_log(error_msg, "ERROR")
    write_log(paste("Error details:", toString(e)), "ERROR")
    stop(error_msg)
  })
  
  # ENHANCED DIAGNOSTICS: Validate results
  if (is.null(rfe_results)) {
    error_msg <- "RFE returned NULL results"
    write_log(error_msg, "ERROR")
    stop(error_msg)
  }
  
  selected_vars <- rfe_results$optVariables
  selected_size <- rfe_results$optsize
  
  write_log(paste("RFE results structure:"))
  write_log(paste("  Optimal size:", selected_size))
  write_log(paste("  Number of selected variables:", length(selected_vars)))
  
  if (is.null(selected_vars) || length(selected_vars) == 0) {
    write_log("Warning: No variables selected by RFE", "WARN")
    selected_vars <- character(0)
    selected_size <- 0
    best_metric <- NA
    optimization <- data.frame()
    importance <- data.frame(Variable = character(0), importance = numeric(0))
  } else {
    tryCatch({
      # Check what's in the results structure
      write_log(paste("RFE results columns:", paste(names(rfe_results$results), collapse = ", ")))
      write_log(paste("Available subset sizes in results:", paste(rfe_results$results$Variables, collapse = ", ")))
      
      best_metric_row <- rfe_results$results[rfe_results$results$Variables == selected_size, ]
      if (nrow(best_metric_row) > 0) {
        best_metric <- best_metric_row[[metric]]
        write_log(paste("Found metric", metric, "for size", selected_size, ":", best_metric))
      } else {
        write_log(paste("No results found for optimal size", selected_size), "WARN")
        best_metric <- NA
      }
      
      optimization <- rfe_results$results
      
      # Check if varImp is available
      if (!is.null(rfe_results$fit)) {
        importance <- varImp(rfe_results$fit, scale = TRUE) %>% 
          as_tibble(rownames = "Variable") %>% 
          rename("importance" = "Overall")
      } else {
        write_log("No fit object available for variable importance", "WARN")
        importance <- data.frame(Variable = character(0), importance = numeric(0))
      }
      
    }, error = function(e) {
      write_log(paste("Error extracting RFE results:", e$message), "ERROR")
      write_log(paste("RFE results structure:"))
      write_log(paste("  Class:", class(rfe_results)))
      write_log(paste("  Names:", paste(names(rfe_results), collapse = ", ")))
      if (!is.null(rfe_results$results)) {
        write_log(paste("  Results columns:", paste(names(rfe_results$results), collapse = ", ")))
      }
      best_metric <- NA
      optimization <- data.frame()
      importance <- data.frame(Variable = character(0), importance = numeric(0))
    })
  }
  
  # Log results summary
  write_log(paste("RFE completed"))
  write_log(paste("Optimal subset size:", selected_size))
  write_log(paste("Selected variables:", length(selected_vars)))
  
  if(length(selected_vars) > 0) {
    write_log(paste("Top selected features:", paste(head(selected_vars, 5), collapse = ", ")))
  }
  
  log_function("do_rfe", "EXIT")
  return(list("selected_vars" = selected_vars, "selected_size" = selected_size, "best_metric" = best_metric, 
              "optimization" = optimization, "results" = importance))
}

# Create test data
set.seed(123)
n <- 100
p <- 20

# Create a test dataset
test_data <- data.frame(
  group = factor(sample(c("1t", "3t"), n, replace = TRUE)),
  matrix(rnorm(n * p), n, p)
)
names(test_data)[2:(p+1)] <- paste0("var", 1:p)

cat("Test data created with dimensions:", nrow(test_data), "x", ncol(test_data), "\n")
cat("Group distribution:", table(test_data$group), "\n")

# Test RFE function with automatic subset selection
cat("\n=== Testing RFE with automatic subset selection ===\n")
try({
  result_auto <- do_rfe(test_data, "group", "automatic", NULL, "Accuracy")
  cat("Automatic RFE completed successfully\n")
  cat("Selected variables:", length(result_auto$selected_vars), "\n")
  cat("Optimal size:", result_auto$selected_size, "\n")
})

# Test RFE function with custom subset sizes
cat("\n=== Testing RFE with custom subset selection ===\n")
custom_sizes <- c(5, 10, 15)
try({
  result_custom <- do_rfe(test_data, "group", "custom", custom_sizes, "Accuracy")
  cat("Custom RFE completed successfully\n")
  cat("Selected variables:", length(result_custom$selected_vars), "\n")
  cat("Optimal size:", result_custom$selected_size, "\n")
})

cat("\nRFE function tests completed.\n")

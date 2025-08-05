# Test R JSON parsing behavior
library(jsonlite)

# Test how fromJSON handles arrays of different lengths
test_json1 <- '{"covariateColumns": [2], "categoricalColumns": [2]}'
test_json2 <- '{"covariateColumns": [2, 3], "categoricalColumns": [2, 3]}'

cat("=== Testing JSON with single-element arrays ===\n")
result1 <- fromJSON(test_json1)
print(result1)
cat("covariateColumns class:", class(result1$covariateColumns), "\n")
cat("covariateColumns length:", length(result1$covariateColumns), "\n")
cat("covariateColumns value:", result1$covariateColumns, "\n")

cat("\n=== Testing JSON with multi-element arrays ===\n")
result2 <- fromJSON(test_json2)
print(result2)
cat("covariateColumns class:", class(result2$covariateColumns), "\n")
cat("covariateColumns length:", length(result2$covariateColumns), "\n")
cat("covariateColumns value:", result2$covariateColumns, "\n")

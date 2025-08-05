# Test R JSON parsing behavior with simplifyVector = FALSE
library(jsonlite)

# Test how fromJSON handles arrays with different settings
test_json <- '{"covariateColumns": [2], "categoricalColumns": [2]}'

cat("=== Testing with default settings ===\n")
result1 <- fromJSON(test_json)
print(result1)
cat("covariateColumns class:", class(result1$covariateColumns), "\n")

cat("\n=== Testing with simplifyVector = FALSE ===\n")
result2 <- fromJSON(test_json, simplifyVector = FALSE)
print(result2)
cat("covariateColumns class:", class(result2$covariateColumns), "\n")

cat("\n=== Testing actual problematic JSON ===\n")
# This is what we're actually receiving according to the diagnostic
problem_json <- '{"covariateColumns": 2, "categoricalColumns": 2}'
result3 <- fromJSON(problem_json)
print(result3)
cat("This is the actual problem - arrays are flattened to single values\n")

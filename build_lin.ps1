# go mod tidy
# go build -o easelect.exe
# .\easelect.exe

$env:GOOS = "linux"
$env:GOARCH = "amd64"

Write-Host "Building for Linux..."
go mod tidy
go build -o easelect
Write-Host "Linux-build valmis, aja ./easelect!"
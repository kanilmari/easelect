# go mod tidy
# go build -o easelect.exe
# .\easelect.exe

$env:GOOS = "windows"
$env:GOARCH = "amd64"

Write-Host "Building for Windows..."
go mod tidy
go build -o easelect.exe
Write-Host "Windows-build valmis, ajetaan easelect.exe!"
.\easelect.exe
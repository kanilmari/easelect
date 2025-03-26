# go mod tidy
# go build -o easelect.exe
# .\easelect.exe
# Tarkistetaan, onko easelect kaynnissa, jos on, lopetetaan se
if (Get-Process -Name "easelect" -ErrorAction SilentlyContinue) {
    Write-Host "easelect.exe on kaynnissa, lopetetaan se..."
    taskkill /im easelect.exe /f
} else {
    Write-Host "easelect.exe ei ole kaynnissa."
}

$env:GOOS = "windows"
$env:GOARCH = "amd64"

Write-Host "Building for Windows..."
go mod tidy
go build -o easelect.exe

Write-Host "Windows-build valmis, ajetaan easelect.exe!"
.\easelect.exe
